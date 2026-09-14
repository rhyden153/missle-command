import test from 'node:test'
import assert from 'node:assert/strict'
import { MissileCommand, GROUND, MAX_AMMO } from '../app/game/engine.ts'

const advance = (game, seconds) => { for (let i = 0; i < Math.ceil(seconds / 0.025); i++) game.update(0.025) }
const enemyAt = (x, y, target = { x, y: GROUND }) => ({ x, y, from: { x, y: 0 }, target, speed: 40, alive: true, split: false })
const quietGame = () => {
  const game = new MissileCommand(() => 0.5)
  game.start()
  game.incoming = 1
  game.spawnTimer = 1000
  return game
}

test('starting a new game restores cities, ammunition, and score while preserving the record', () => {
  const game = quietGame()
  game.best = 900
  game.score = 125
  game.cities[0].alive = false
  game.fire(70, 200)
  game.start()
  assert.equal(game.phase, 'playing')
  assert.equal(game.citiesAlive, 6)
  assert.equal(game.totalAmmo, 54)
  assert.equal(game.score, 0)
  assert.equal(game.best, 900)
  assert.equal(game.missiles.length, 0)
})

test('auto targeting uses the nearest stocked battery and respects manual selection and cooldown', () => {
  const game = quietGame()
  assert.equal(game.fire(100, 200), true)
  assert.equal(game.batteries[0].ammo, MAX_AMMO - 1)
  assert.equal(game.fire(100, 200), false)
  advance(game, 0.2)
  game.batteries[0].ammo = 0
  assert.equal(game.fire(100, 200), true)
  assert.equal(game.batteries[1].ammo, MAX_AMMO - 1)
  advance(game, 0.2)
  game.selectBattery(0)
  assert.equal(game.fire(100, 200), false)
  assert.match(game.notice, /BATTERY EMPTY/)
  assert.equal(game.launched, 2)
})

test('a launched missile explodes at its target and triggers scoring chain reactions', () => {
  const game = quietGame()
  game.enemies = [enemyAt(601, 215), enemyAt(640, 212), enemyAt(675, 209)]
  game.fire(601, 245)
  advance(game, 1.5)
  assert.equal(game.intercepted, 3)
  assert.equal(game.enemies.length, 0)
  assert.ok(game.score >= 75)
  assert.ok(game.chain >= 2)
  assert.equal(game.best, game.score)
})

test('pausing freezes missiles and prevents firing, then resumes the same wave', () => {
  const game = quietGame()
  game.enemies = [enemyAt(200, 100)]
  game.fire(200, 200)
  advance(game, 0.2)
  game.pause()
  const before = JSON.stringify({ enemy: game.enemies, missile: game.missiles, clock: game.clock, ammo: game.totalAmmo })
  advance(game, 5)
  assert.equal(game.fire(200, 200), false)
  assert.equal(JSON.stringify({ enemy: game.enemies, missile: game.missiles, clock: game.clock, ammo: game.totalAmmo }), before)
  game.pause()
  advance(game, 0.2)
  assert.equal(game.phase, 'playing')
  assert.ok(game.enemies[0].y > 108)
})

test('ground impacts destroy cities and the final loss ends the game', () => {
  const game = quietGame()
  game.enemies = game.cities.map(city => enemyAt(city.x, GROUND - 1))
  advance(game, 0.1)
  assert.equal(game.citiesAlive, 0)
  assert.equal(game.phase, 'gameover')
  assert.equal(game.fire(200, 200), false)
})

test('clearing a wave awards one survival bonus, pauses the countdown, and rearms batteries', () => {
  const game = quietGame()
  game.incoming = 0
  game.batteries[0].ammo = 0
  game.batteries[0].alive = false
  game.cities[0].alive = false
  game.update(0.025)
  assert.equal(game.phase, 'intermission')
  assert.equal(game.score, 5 * 100 + 36 * 5)
  game.pause()
  advance(game, 5)
  assert.equal(game.intermission, 4)
  game.pause()
  advance(game, 4.1)
  assert.equal(game.phase, 'playing')
  assert.equal(game.wave, 2)
  assert.equal(game.totalAmmo, 54)
  assert.equal(game.batteries[0].alive, true)
  assert.equal(game.citiesAlive, 5)
  assert.equal(game.score, 680)
})

test('splitting missiles create an additional threat only once', () => {
  const game = quietGame()
  game.enemies = [{ ...enemyAt(400, 176), split: true }]
  advance(game, 0.1)
  assert.equal(game.enemies.length, 2)
  advance(game, 0.1)
  assert.equal(game.enemies.length, 2)
  assert.ok(game.enemies.every(enemy => !enemy.split))
})

test('a complete undefended game reaches game over instead of stalling between waves', () => {
  let seed = 31
  const game = new MissileCommand(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 })
  game.start()
  for (let i = 0; i < 24000 && game.phase !== 'gameover'; i++) game.update(0.025)
  assert.equal(game.phase, 'gameover')
  assert.equal(game.citiesAlive, 0)
  assert.ok(game.wave < 20)
})
