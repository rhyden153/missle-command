import test from 'node:test'
import assert from 'node:assert/strict'
import { MissileCommand } from '../app/game/engine.ts'
import { readHudState } from '../app/game/hud.ts'

test('simulation reuses live entity arrays through cleanup and restarts', () => {
  const game = new MissileCommand(() => 0.5)
  game.start()
  game.spawnTimer = 1000
  const keys = ['enemies', 'aircraft', 'missiles', 'blasts', 'particles', 'cityExplosions', 'batteryExplosions']
  const arrays = keys.map(key => game[key])
  game.fire(601, 200)
  game.cityExplosions.push({ x:205, y:532, age:5.49, duration:5.5 })
  game.batteryExplosions.push({ x:84, y:532, age:5.49, duration:5.5 })
  for (let i=0;i<300;i++) game.update(0.025)
  assert.equal(game.cityExplosions.length,0)
  assert.equal(game.batteryExplosions.length,0)
  for (let i=0;i<keys.length;i++) assert.equal(game[keys[i]],arrays[i])
  game.start()
  for (let i=0;i<keys.length;i++) { assert.equal(game[keys[i]],arrays[i]); assert.equal(arrays[i].length,0) }
})

test('HUD snapshots remain immutable and reuse unchanged state and entity lists', () => {
  const game = new MissileCommand(() => 0.5)
  game.start()
  game.spawnTimer = 1000
  const first = readHudState(game)
  game.update(0.025)
  assert.equal(readHudState(game, first), first)
  game.score++
  const score = readHudState(game, first)
  assert.notEqual(score, first)
  assert.equal(score.batteries, first.batteries)
  assert.equal(score.cities, first.cities)
  game.fire(601,200)
  const fired = readHudState(game,score)
  assert.notEqual(fired.batteries,score.batteries)
  assert.equal(fired.cities,score.cities)
  assert.equal(score.batteries[1].ammo,18)
  assert.equal(fired.batteries[1].ammo,17)
  game.cities[0].alive=false
  const lost = readHudState(game,fired)
  assert.notEqual(lost.cities,fired.cities)
  assert.equal(lost.batteries,fired.batteries)
  assert.equal(fired.cities[0].alive,true)
  assert.equal(lost.cities[0].alive,false)
})

test('HUD countdown and explosion visibility update only at displayed boundaries', () => {
  const game = new MissileCommand()
  game.phase='intermission'
  game.intermission=4
  game.noticeTime=0
  const initial=readHudState(game)
  game.intermission=3.5
  assert.equal(readHudState(game,initial),initial)
  game.intermission=3
  const next=readHudState(game,initial)
  assert.equal(next.intermission,3)
  game.cityExplosions.push({x:205,y:532,age:0,duration:5.5})
  const explosion=readHudState(game,next)
  assert.equal(explosion.groundExplosionActive,true)
  game.cityExplosions.length=0
  assert.equal(readHudState(game,explosion).groundExplosionActive,false)
})
