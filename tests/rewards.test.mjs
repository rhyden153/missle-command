import test from 'node:test'
import assert from 'node:assert/strict'
import { MissileCommand, GROUND } from '../app/game/engine.ts'
import { readHudState } from '../app/game/hud.ts'

const advance = (game, seconds) => { for (let i = 0; i < Math.ceil(seconds / 0.025); i++) game.update(0.025) }
const quietGame = () => {
  const game = new MissileCommand(() => 0.5)
  game.start()
  game.incoming = 1
  game.spawnTimer = 1000
  return game
}
const enemyAt = (x, y) => ({ x, y, from: { x, y: 0 }, target: { x, y: GROUND }, speed: 40, alive: true, split: false })
const interceptAtScore = (game, score) => {
  game.score = score
  game.enemies = [enemyAt(600, 200)]
  game.blasts = [{ x: 600, y: 200, radius: 66, maxRadius: 66, age: 0.5, duration: 2, friendly: true, chain: 0 }]
  game.update(0.025)
}

test('ammo rewards trigger when crossing each milestone, compound, and never repeat', () => {
  const game = quietGame(), events = []
  game.onEvent = event => events.push(event)
  interceptAtScore(game, 99_950)
  assert.equal(game.score, 99_975)
  assert.equal(game.maxAmmo, 54)
  interceptAtScore(game, 99_980)
  assert.equal(game.score, 100_005)
  assert.equal(game.maxAmmo, 59)
  assert.equal(game.totalAmmo, 59)
  assert.deepEqual(game.batteries.map(battery => battery.capacity), [20, 20, 19])
  assert.match(game.notice, /REINFORCEMENTS/)
  interceptAtScore(game, game.score)
  advance(game, 0.1)
  assert.equal(game.maxAmmo, 59)
  assert.equal(events.filter(event => event === 'bonus').length, 1)
  for (const [score, capacity] of [[199_975, 65], [299_975, 72], [399_975, 79]]) {
    interceptAtScore(game, score)
    assert.equal(game.maxAmmo, capacity)
    assert.equal(game.totalAmmo, capacity)
    assert.equal(game.score, score + 25)
  }
  assert.equal(events.filter(event => event === 'bonus').length, 4)
})

test('ammo upgrades add only the new shots to live batteries and persist when batteries rearm', () => {
  const game = quietGame()
  game.batteries[0].ammo = 3
  game.batteries[1].alive = false
  game.batteries[1].ammo = 0
  game.batteries[2].ammo = 7
  const before = readHudState(game)
  interceptAtScore(game, 99_975)
  const rewarded = readHudState(game, before)
  assert.deepEqual(game.batteries.map(battery => battery.ammo), [5, 0, 8])
  assert.equal(game.batteries[1].alive, false)
  assert.equal(rewarded.maxAmmo, 59)
  assert.notEqual(rewarded.batteries, before.batteries)
  assert.equal(before.batteries[0].capacity, 18)
  assert.equal(rewarded.batteries[0].capacity, 20)
  game.incoming = 0
  game.blasts.length = 0
  game.update(0.025)
  assert.equal(game.phase, 'intermission')
  advance(game, 4.1)
  assert.equal(game.phase, 'playing')
  assert.equal(game.totalAmmo, 59)
  assert.ok(game.batteries.every(battery => battery.alive && battery.ammo === battery.capacity))
})

test('every 150,000 points grants one city, restoring losses and banking the rest without duplication', () => {
  const game = quietGame()
  game.cities[0].alive = false
  interceptAtScore(game, 149_975)
  assert.equal(game.score, 150_000)
  assert.equal(game.citiesAlive, 6)
  assert.equal(game.bonusCities, 0)
  interceptAtScore(game, 299_975)
  assert.equal(game.bonusCities, 1)
  assert.equal(game.maxAmmo, 72)
  const banked = readHudState(game)
  assert.equal(banked.bonusCities, 1)
  interceptAtScore(game, game.score)
  assert.equal(game.bonusCities, 1)
  game.cities[1].alive = false
  game.update(0.025)
  assert.equal(game.citiesAlive, 6)
  assert.equal(game.bonusCities, 0)
  const deployed = readHudState(game, banked)
  assert.equal(deployed.bonusCities, 0)
  assert.notEqual(deployed, banked)
})

test('one scoring event can cross several ammo and city milestones without dropping rewards', () => {
  const game = quietGame()
  interceptAtScore(game, 449_975)
  assert.equal(game.score, 450_000)
  assert.equal(game.maxAmmo, 79)
  assert.equal(game.bonusCities, 3)
  advance(game, 0.5)
  assert.equal(game.maxAmmo, 79)
  assert.equal(game.bonusCities, 3)
})

test('wave survival points also grant ammo and city rewards', () => {
  for (const [score, capacity, reserves] of [[99_500, 59, 0], [149_500, 59, 1], [299_500, 72, 2]]) {
    const game = quietGame()
    game.score = score
    game.incoming = 0
    game.update(0.025)
    assert.equal(game.score, score + 870)
    assert.equal(game.phase, 'intermission')
    assert.equal(game.maxAmmo, capacity)
    assert.equal(game.bonusCities, reserves)
    assert.match(game.notice, /REINFORCEMENTS/)
    const ammo = game.totalAmmo
    advance(game, 1)
    assert.equal(game.totalAmmo, ammo)
    assert.equal(game.bonusCities, reserves)
  }
})

test('reserved cities wait for destruction effects, freeze on pause, and prevent premature game over', () => {
  const game = quietGame(), events = []
  game.onEvent = event => events.push(event)
  interceptAtScore(game, 149_975)
  assert.equal(game.bonusCities, 1)
  game.blasts.length = 0
  game.enemies = game.cities.map(city => enemyAt(city.x, GROUND - 1))
  advance(game, 0.1)
  assert.equal(game.citiesAlive, 0)
  assert.equal(game.bonusCities, 1)
  assert.equal(game.phase, 'playing')
  assert.equal(events.includes('over'), false)
  game.pause()
  const frozen = JSON.stringify(game.cityExplosions)
  advance(game, 6)
  assert.equal(JSON.stringify(game.cityExplosions), frozen)
  assert.equal(game.bonusCities, 1)
  game.pause()
  advance(game, 5.3)
  assert.equal(game.citiesAlive, 0)
  advance(game, 0.3)
  assert.equal(game.citiesAlive, 1)
  assert.equal(game.bonusCities, 0)
  assert.equal(game.cityExplosions.length, 0)
  assert.equal(game.phase, 'playing')
  const restored = game.cities.find(city => city.alive)
  game.enemies = [enemyAt(restored.x, GROUND - 1)]
  advance(game, 0.1)
  assert.equal(game.phase, 'gameover')
  assert.equal(events.filter(event => event === 'over').length, 1)
})

test('a new game resets upgraded ammo and city reserves while preserving the high score', () => {
  const game = quietGame()
  interceptAtScore(game, 449_975)
  const best = game.best
  game.start()
  assert.equal(game.maxAmmo, 54)
  assert.equal(game.totalAmmo, 54)
  assert.equal(game.bonusCities, 0)
  assert.equal(game.citiesAlive, 6)
  assert.equal(game.best, best)
  interceptAtScore(game, 99_975)
  assert.equal(game.maxAmmo, 59)
})
