import test from 'node:test'
import assert from 'node:assert/strict'
import { GameAudio } from '../app/game/audio.ts'
import { MissileCommand, GROUND, WIDTH } from '../app/game/engine.ts'
import { installAudioHarness } from './helpers/audio-context.mjs'
const flush=()=>new Promise(resolve=>setImmediate(resolve))

test('recordings load once, preserve event throttling, and release every voice on stop',async t=>{
  const harness=installAudioHarness()
  t.after(()=>harness.restore())
  const audio=new GameAudio('city','air','battery','launch')
  audio.unlock();audio.unlock()
  await flush()
  assert.equal(harness.requests.length,4)
  for(const [time,event] of [[1,'launch'],[2,'explode'],[2,'intercept'],[3,'cityExplosion'],[3,'impact'],[4,'batteryExplosion'],[4,'impact'],[5,'wave']]){
    harness.contexts[0].currentTime=time;audio.play(event)
  }
  assert.deepEqual(harness.commands.filter(c=>c[0]==='start'&&c[1]==='buffer').map(c=>c[4]),['launch','air','city','battery'])
  assert.ok(audio.sources.size>0)
  audio.stop()
  assert.equal(audio.sources.size,0)
  assert.ok(harness.nodes.every(node=>node===audio.master||node.outputs.size===0))
  assert.ok(harness.nodes.filter(node=>node.kind==='buffer'||node.kind==='oscillator').every(node=>node.onended===null))
  audio.dispose();audio.dispose()
  assert.equal(harness.contexts[0].state,'closed')
  assert.ok(Object.values(audio.recordings).every(sample=>sample.buffer===null&&sample.loading===null))
  audio.unlock()
  assert.equal(harness.contexts.length,1)
})

test('muting cancels pending playback and dispose aborts unfinished asset requests',async t=>{
  const harness=installAudioHarness({pending:true})
  t.after(()=>harness.restore())
  const audio=new GameAudio('city','air','battery','launch')
  audio.play('launch')
  audio.muted=true
  for(const request of harness.requests)request.resolve()
  await flush()
  assert.equal(harness.commands.filter(c=>c[0]==='start').length,0)
  audio.dispose()
  assert.ok(harness.requests.every(request=>request.signal.aborted))
})

test('failed recordings keep the procedural fallback and dispose releases pending loads',async t=>{
  const harness=installAudioHarness({fail:true})
  t.after(()=>harness.restore())
  const audio=new GameAudio('city','air','battery','launch')
  audio.unlock();await flush()
  audio.play('launch');await flush()
  assert.equal(harness.commands.filter(c=>c[0]==='start').length,2)
  audio.dispose()
  assert.equal(audio.sources.size,0)
  assert.ok(harness.nodes.every(node=>node.outputs.size===0))
})

test('each threat has a distinct sound and all voices obey mute and stop', async t => {
  const harness = installAudioHarness()
  t.after(() => harness.restore())
  const audio = new GameAudio('city', 'air', 'battery', 'launch')
  audio.unlock()
  await flush()
  const signatures = []
  for (const event of ['bomber', 'ufo', 'payload', 'guidedBomb', 'evade']) {
    audio.stop()
    harness.commands.length = 0
    audio.play(event)
    const voices = harness.commands.filter(command => command[0] === 'start')
    assert.ok(voices.length > 0, event)
    signatures.push(JSON.stringify(voices.map(command => [command[1], command[3], command.at(-1)])))
    audio.stop()
    assert.equal(audio.sources.size, 0)
    assert.ok(harness.nodes.every(node => node === audio.master || node.outputs.size === 0))
  }
  assert.equal(new Set(signatures).size, 5)

  audio.muted = true
  harness.commands.length = 0
  for (const event of ['bomber', 'ufo', 'payload', 'guidedBomb', 'evade']) audio.play(event)
  assert.equal(harness.commands.filter(command => command[0] === 'start').length, 0)
  audio.dispose()
})

test('threat audio stays continuous, shares voices, and stops only when the last threat of a kind disappears', t => {
  const harness = installAudioHarness()
  t.after(() => harness.restore())
  const audio = new GameAudio('city', 'air', 'battery', 'launch')
  t.after(() => audio.dispose())
  const game = {
    phase: 'playing',
    aircraft: [{ kind: 'bomber', alive: true }, { kind: 'bomber', alive: true }, { kind: 'ufo', alive: true }],
    enemies: [{ kind: 'guidedBomb', alive: true }, { kind: 'missile', alive: true }],
  }
  audio.syncThreats(game)
  const voices = [...audio.sources.keys()]
  const nodeCount = harness.nodes.length
  assert.equal(voices.length, 9)
  assert.equal(audio.threatLoops.size, 3)
  // Continuous oscillators have no scheduled end, unlike the old short cues.
  assert.equal(harness.commands.filter(command => command[0] === 'stop').length, 0)
  harness.contexts[0].currentTime = 60
  for (let frame = 0; frame < 200; frame++) audio.syncThreats(game)
  assert.equal(harness.nodes.length, nodeCount)
  assert.deepEqual([...audio.sources.keys()], voices)
  game.aircraft.shift()
  audio.syncThreats(game)
  assert.equal(audio.sources.size, 9)
  game.aircraft[0].alive = false
  audio.syncThreats(game)
  assert.equal(audio.sources.size, 6)
  assert.ok(voices.slice(0, 3).every(source => source.outputs.size === 0))
  game.aircraft.length = 0
  game.enemies[0].alive = false
  audio.syncThreats(game)
  assert.equal(audio.sources.size, 0)
  assert.equal(audio.threatLoops.size, 0)
  assert.ok(harness.nodes.every(node => node === audio.master || node.outputs.size === 0))
})

test('continuous threat audio follows interceptions, aircraft departures, and smart bomb impacts', t => {
  const harness = installAudioHarness()
  t.after(() => harness.restore())
  const audio = new GameAudio('city', 'air', 'battery', 'launch')
  t.after(() => audio.dispose())
  const game = new MissileCommand(() => 0.5)
  game.start()
  game.incoming = 1
  game.spawnTimer = 1000
  for (const kind of ['bomber', 'ufo', 'guidedBomb']) game.spawnEnemy(kind)
  Object.assign(game.aircraft[0], { x: 300, y: 100, altitude: 100, dropped: true })
  Object.assign(game.aircraft[1], { x: 900, y: 100, altitude: 100, dropped: true })
  audio.syncThreats(game)
  assert.equal(audio.threatLoops.size, 3)
  game.blasts.push({ x: 300, y: 100, age: 0.5, duration: 2, radius: 66, maxRadius: 66, friendly: true, chain: 0 })
  game.update(0.025)
  audio.syncThreats(game)
  assert.equal(game.aircraft.length, 1)
  assert.equal(audio.threatLoops.has('bomber'), false)
  assert.equal(audio.threatLoops.size, 2)
  Object.assign(game.aircraft[0], { x: WIDTH + 50, direction: 1 })
  game.update(0.025)
  audio.syncThreats(game)
  assert.equal(game.aircraft.length, 0)
  assert.equal(audio.threatLoops.has('ufo'), false)
  const bomb = game.enemies[0]
  Object.assign(bomb, { x: 600, y: GROUND - 1, target: { x: 600, y: GROUND } })
  game.update(0.05)
  audio.syncThreats(game)
  assert.equal(game.enemies.length, 0)
  assert.equal(audio.sources.size, 0)
  assert.equal(audio.threatLoops.size, 0)
})

test('continuous threat sounds stop and resume with pause and mute, and clean up on restart, end, and disposal', t => {
  const harness = installAudioHarness()
  t.after(() => harness.restore())
  const audio = new GameAudio('city', 'air', 'battery', 'launch')
  t.after(() => audio.dispose())
  const game = new MissileCommand(() => 0.5)
  game.start()
  for (const kind of ['bomber', 'ufo', 'guidedBomb']) game.spawnEnemy(kind)
  audio.syncThreats(game)
  assert.equal(audio.sources.size, 9)
  game.pause()
  audio.syncThreats(game)
  assert.equal(audio.sources.size, 0)
  game.pause()
  audio.syncThreats(game)
  assert.equal(audio.sources.size, 9)
  audio.muted = true
  audio.syncThreats(game)
  assert.equal(audio.sources.size, 0)
  audio.muted = false
  audio.syncThreats(game)
  assert.equal(audio.sources.size, 9)
  audio.stop()
  assert.equal(audio.threatLoops.size, 0)
  audio.syncThreats(game)
  assert.equal(audio.sources.size, 9)
  for (const phase of ['intermission', 'gameover', 'victory', 'ready']) {
    game.phase = phase
    audio.syncThreats(game)
    assert.equal(audio.sources.size, 0, phase)
    game.phase = 'playing'
    audio.syncThreats(game)
    assert.equal(audio.sources.size, 9)
  }
  game.start()
  audio.syncThreats(game)
  assert.equal(audio.sources.size, 0)
  game.spawnEnemy('bomber')
  audio.syncThreats(game)
  assert.ok(audio.sources.size > 0)
  audio.dispose()
  audio.syncThreats(game)
  assert.equal(audio.sources.size, 0)
  assert.equal(audio.threatLoops.size, 0)
  assert.ok(harness.nodes.every(node => node.outputs.size === 0))
})

test('reinforcement rewards play a chime and stop with the rest of the audio', t => {
  const harness = installAudioHarness()
  t.after(() => harness.restore())
  const audio = new GameAudio('city', 'air', 'battery', 'launch')
  harness.commands.length = 0
  audio.play('bonus')
  const voices = harness.commands.filter(command => command[0] === 'start')
  assert.equal(voices.length, 3)
  assert.ok(voices.every(voice => voice[3] === 'triangle'))
  audio.stop()
  assert.equal(audio.sources.size, 0)
  audio.dispose()
})

test('victory music replaces combat audio, schedules a full tune, and cancels every note on mute or restart', async t => {
  const harness = installAudioHarness()
  t.after(() => harness.restore())
  const audio = new GameAudio('city', 'air', 'battery', 'launch')
  audio.unlock()
  await flush()
  audio.play('bomber')
  const combat = [...audio.sources.keys()]
  harness.commands.length = 0
  audio.play('victory')
  assert.ok(combat.every(source => source.outputs.size === 0))
  const melody = harness.commands.filter(command => command[0] === 'start' && command[1] === 'oscillator')
  assert.ok(melody.length > 80)
  assert.ok(melody.some(command => command.at(-1) > 10))
  audio.muted = true
  assert.equal(audio.sources.size, 0)
  harness.commands.length = 0
  audio.play('victory')
  assert.equal(harness.commands.filter(command => command[0] === 'start').length, 0)
  audio.muted = false
  audio.play('victory')
  assert.ok(audio.sources.size > 0)
  audio.stop()
  assert.equal(audio.sources.size, 0)
  assert.ok(harness.nodes.every(node => node === audio.master || node.outputs.size === 0))
  audio.dispose()
})
