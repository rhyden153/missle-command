import test from 'node:test'
import assert from 'node:assert/strict'
import { GameAudio } from '../app/game/audio.ts'
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

test('each threat has a distinct sound in both styles and all voices obey mute and stop', async t => {
  const harness = installAudioHarness()
  t.after(() => harness.restore())
  const audio = new GameAudio('city', 'air', 'battery', 'launch')
  audio.unlock()
  await flush()
  const palettes = []
  for (const style of ['classic', 'modern']) {
    audio.style = style
    const signatures = []
    for (const event of ['bomber', 'ufo', 'payload', 'guidedBomb', 'evade']) {
      audio.stop()
      harness.commands.length = 0
      audio.play(event)
      const voices = harness.commands.filter(command => command[0] === 'start')
      assert.ok(voices.length > 0, `${style} ${event}`)
      signatures.push(JSON.stringify(voices.map(command => [command[1], command[3], command.at(-1)])))
      audio.stop()
      assert.equal(audio.sources.size, 0)
      assert.ok(harness.nodes.every(node => node === audio.master || node.outputs.size === 0))
    }
    assert.equal(new Set(signatures).size, 5)
    palettes.push(signatures)
  }
  for (let i = 0; i < 5; i++) assert.notEqual(palettes[0][i], palettes[1][i])
  audio.muted = true
  harness.commands.length = 0
  for (const event of ['bomber', 'ufo', 'payload', 'guidedBomb', 'evade']) audio.play(event)
  assert.equal(harness.commands.filter(command => command[0] === 'start').length, 0)
  audio.dispose()
})

test('reinforcement rewards play a chime in either style and stop with the rest of the audio', t => {
  const harness = installAudioHarness()
  t.after(() => harness.restore())
  const audio = new GameAudio('city', 'air', 'battery', 'launch')
  for (const style of ['classic', 'modern']) {
    audio.style = style
    harness.commands.length = 0
    audio.play('bonus')
    const voices = harness.commands.filter(command => command[0] === 'start')
    assert.equal(voices.length, 3)
    assert.ok(voices.every(voice => voice[3] === (style === 'classic' ? 'square' : 'triangle')))
    audio.stop()
    assert.equal(audio.sources.size, 0)
  }
  audio.dispose()
})
