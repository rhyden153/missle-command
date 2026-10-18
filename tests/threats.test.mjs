import test from 'node:test'
import assert from 'node:assert/strict'
import { MissileCommand, createWavePlan, GROUND, WIDTH } from '../app/game/engine.ts'
import { readHudState } from '../app/game/hud.ts'

const advance = (game, seconds) => { for (let i = 0; i < Math.ceil(seconds / 0.025); i++) game.update(0.025) }
const waveGame = (wave, random = () => 0.5) => {
  const game = new MissileCommand(random)
  game.start()
  game.wave = wave - 1
  game.phase = 'intermission'
  game.intermission = 0
  game.update(0.025)
  return game
}
const craftAt = (overrides = {}) => ({
  x: 600, y: 100, altitude: 100, kind: 'bomber', direction: 1, speed: 100,
  dropX: 650, dropped: false, alive: true, age: 0, soundTimer: 2.8, ...overrides,
})
const bombAt = (x, y) => ({
  x, y, from: { x, y: -10 }, target: { x: 600, y: GROUND }, speed: 65,
  alive: true, split: false, kind: 'guidedBomb', vx: 0, evasion: 1.35, evading: false,
})
const blastAt = (x, y) => ({ x, y, age: 0.5, duration: 2, radius: 66, maxRadius: 66, friendly: true, chain: 0 })
const quiet = () => { const game = waveGame(5); game.incoming = 0; game.spawnTimer = 1000; return game }

test('new threats enter gradually at waves 3, 4, and 5 without increasing any wave budget', () => {
  for (let wave = 1; wave <= 100; wave++) {
    const plan = createWavePlan(wave)
    assert.equal(plan.length, 10 + wave * 3)
    for (const [kind, first] of [['bomber', 3], ['ufo', 4], ['guidedBomb', 5]]) {
      assert.equal(plan.includes(kind), wave >= first, `${kind} in wave ${wave}`)
      if (wave === first) assert.equal(plan.filter(item => item === kind).length, 1)
    }
    assert.ok(plan.filter(kind => kind !== 'missile').length <= 11)
  }
})

test('real wave spawns and aircraft payloads use exactly the original number of ground threats', () => {
  for (const wave of [1, 2, 3, 4, 5, 8, 15]) {
    const game = waveGame(wave)
    const groundThreats = new Set(), carriers = new Set()
    for (let frame = 0; frame < 5000; frame++) {
      game.update(0.025)
      for (const enemy of game.enemies) groundThreats.add(enemy)
      for (const craft of game.aircraft) carriers.add(craft)
      // Remove ground threats before impacts or splitting to isolate the launch budget.
      game.enemies.length = 0
      if (game.incoming === 0 && game.aircraft.length === 0) break
    }
    assert.equal(game.incoming, 0)
    assert.equal(game.aircraft.length, 0)
    assert.equal(groundThreats.size, 10 + wave * 3, `wave ${wave}`)
    assert.equal(carriers.size, createWavePlan(wave).filter(kind => kind === 'bomber' || kind === 'ufo').length)
    assert.equal([...groundThreats].filter(enemy => enemy.kind === 'guidedBomb').length, createWavePlan(wave).filter(kind => kind === 'guidedBomb').length)
  }
})

test('both aircraft cross either direction, release once, and transfer their reserved HUD count', () => {
  for (const kind of ['bomber', 'ufo']) for (const direction of [-1, 1]) {
    const game = quiet(), events = []
    game.onEvent = event => events.push(event)
    game.aircraft.push(craftAt({ kind, direction, dropX: 600 + direction * 40 }))
    assert.equal(readHudState(game).incoming, 1)
    advance(game, 0.5)
    assert.equal(game.aircraft[0].dropped, true)
    assert.equal(game.enemies.length, 1)
    assert.equal(readHudState(game).incoming, 1)
    assert.equal(game.enemies[0].kind, kind === 'bomber' ? 'bomberMissile' : 'ufoMissile')
    assert.equal(game.enemies[0].split, false)
    assert.ok(game.enemies[0].from.y > 90)
    advance(game, 0.5)
    assert.equal(game.enemies.length, 1)
    assert.equal(events.filter(event => event === 'payload').length, 1)
    assert.equal(game.phase, 'playing')
  }
})

test('intercepting a carrier before its drop cancels the payload; an existing payload survives its carrier', () => {
  for (const dropped of [false, true]) {
    const game = quiet()
    game.aircraft.push(craftAt({ dropped }))
    if (dropped) game.enemies.push({ ...bombAt(300, 200), kind: 'bomberMissile' })
    game.blasts.push(blastAt(600, 100))
    game.update(0.025)
    assert.equal(game.aircraft.length, 0)
    assert.equal(game.enemies.length, dropped ? 1 : 0)
    assert.equal(game.intercepted, dropped ? 0 : 1)
    assert.equal(game.score, 100 * game.wave)
  }
})

test('guided bombs steer away from nearby friendly explosions with finite evasion and forward progress', () => {
  const game = quiet(), events = []
  game.onEvent = event => events.push(event)
  const bomb = bombAt(620, 130)
  game.enemies.push(bomb)
  game.blasts.push(blastAt(600, 230))
  advance(game, 0.6)
  assert.ok(bomb.x > 635)
  assert.ok(bomb.y > 140)
  assert.ok(bomb.evasion < 1.35 && bomb.evasion > 0)
  assert.equal(events.filter(event => event === 'evade').length, 1)
  assert.ok(Math.abs(bomb.vx) <= bomb.speed * 0.9)
  assert.equal(bomb.alive, true)

  // A spent guidance reserve cannot dodge a new obstacle.
  bomb.evasion = 0
  game.blasts = [blastAt(bomb.x - 10, bomb.y + 100)]
  game.update(0.025)
  assert.equal(bomb.evading, false)
})

test('guided bombs are destroyed by direct or overlapping blasts and still reach their target without defenses', () => {
  for (const overlapping of [false, true]) {
    const game = quiet()
    game.enemies.push(bombAt(600, 200))
    game.blasts.push(blastAt(overlapping ? 550 : 600, 200))
    if (overlapping) game.blasts.push(blastAt(650, 200))
    game.update(0.025)
    assert.equal(game.enemies.length, 0)
    assert.equal(game.intercepted, 1)
  }
  for (const x of [10, 600, WIDTH - 10]) {
    const game = quiet()
    game.incoming = 1
    game.enemies.push(bombAt(x, 100))
    advance(game, 20)
    assert.equal(game.enemies.length, 0)
    assert.equal(game.cities.find(city => city.x === 742).alive, true)
    assert.equal(game.batteries[1].alive, false)
  }
})

test('aircraft and guided bombs freeze on pause, clear on restart, and delay wave completion until departure', () => {
  const game = quiet()
  game.aircraft.push(craftAt({ dropped: true }))
  game.enemies.push(bombAt(300, 150))
  game.pause()
  const frozen = JSON.stringify([game.aircraft, game.enemies])
  advance(game, 5)
  assert.equal(JSON.stringify([game.aircraft, game.enemies]), frozen)
  game.pause()
  game.enemies.length = 0
  advance(game, 0.1)
  assert.equal(game.phase, 'playing')
  advance(game, 6.5)
  assert.equal(game.aircraft.length, 0)
  assert.equal(game.phase, 'intermission')
  game.aircraft.push(craftAt())
  game.enemies.push(bombAt(300, 150))
  game.start()
  assert.equal(game.aircraft.length, 0)
  assert.equal(game.enemies.length, 0)
  assert.equal(game.wave, 1)
})
