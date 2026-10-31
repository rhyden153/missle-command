import type { GameEvent, MissileCommand } from './engine'

type RecordingName = 'cityExplosion' | 'airExplosion' | 'batteryExplosion' | 'launchThud'
type Recording = { url: string; buffer: AudioBuffer | null; loading: Promise<AudioBuffer | null> | null }
const RECORDING_EVENTS: Partial<Record<GameEvent, RecordingName>> = {
  launch: 'launchThud', explode: 'airExplosion', intercept: 'airExplosion',
  cityExplosion: 'cityExplosion', batteryExplosion: 'batteryExplosion',
}
// Two short salutes, then a triumphant C–F–G–C cadence.
const CLEAR_FANFARE: readonly (readonly [readonly number[], number])[] = [
  [[60, 64, 67], 0.5], [[60, 64, 67], 0.5], [[60, 64, 67], 1],
  [[60, 65, 69], 1], [[55, 62, 67], 1], [[60, 64, 67, 72], 3],
]
const OVER_NOTES = [330, 262, 196, 98]
const BONUS_NOTES = [660, 880, 1320]
// An original C-major fanfare: rising brass-like melody over chords and a bouncing bass.
const VICTORY_MELODY: readonly (readonly [number, number])[] = [
  [67, 0.5], [72, 0.5], [76, 0.5], [79, 0.5], [76, 0.5], [79, 0.5], [84, 1],
  [83, 0.5], [79, 0.5], [81, 1], [79, 1], [76, 1],
  [77, 0.5], [81, 0.5], [84, 1], [81, 0.5], [79, 0.5], [77, 1],
  [76, 0.5], [79, 0.5], [83, 0.5], [86, 0.5], [84, 2],
  [76, 0.5], [79, 0.5], [84, 1], [86, 0.5], [88, 0.5], [86, 1],
  [84, 1], [81, 1], [79, 1], [76, 1],
  [77, 0.5], [76, 0.5], [74, 0.5], [76, 0.5], [79, 1], [83, 1],
  [84, 4],
]
const VICTORY_CHORDS = [
  [60, 64, 67], [59, 62, 67], [57, 60, 65], [60, 64, 67],
  [57, 60, 64], [57, 60, 65], [59, 62, 67], [60, 64, 67],
] as const
const VICTORY_BASS = [48, 43, 41, 48, 45, 41, 43, 48] as const
const noteFrequency = (note: number) => 440 * 2 ** ((note - 69) / 12)
const recording = (url: string): Recording => ({ url, buffer: null, loading: null })
const THREAT_LOOPS = {
  bomber: { frequency: 65, type: 'sawtooth', volume: 0.12, modulation: 8, depth: 6 },
  ufo: { frequency: 520, type: 'sine', volume: 0.17, modulation: 3.3, depth: 190 },
  guidedBomb: { frequency: 850, type: 'sine', volume: 0.18, modulation: 1.8, depth: 300 },
} as const
type LoopingThreat = keyof typeof THREAT_LOOPS
const LOOPING_THREATS = Object.keys(THREAT_LOOPS) as LoopingThreat[]

/** Procedural arcade effects and the supplied launch and explosion recordings. */
export class GameAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private sources = new Map<AudioScheduledSourceNode, () => void>()
  private threatLoops = new Map<LoopingThreat, () => void>()
  private lastPlayed = new Map<GameEvent, number>()
  private isMuted = false
  private recordings: Record<RecordingName, Recording>
  private loadController: AbortController | null = null
  private disposed = false
  private playbackGeneration = 0

  constructor(cityExplosionUrl: string, airExplosionUrl: string, batteryExplosionUrl: string, launchThudUrl: string) {
    this.recordings = {
      cityExplosion: recording(cityExplosionUrl), airExplosion: recording(airExplosionUrl),
      batteryExplosion: recording(batteryExplosionUrl), launchThud: recording(launchThudUrl),
    }
  }

  private loadRecording(ctx: AudioContext, sample: Recording, signal: AbortSignal) {
    return fetch(sample.url, { signal })
      .then(response => {
        if (!response.ok) throw new Error('Sound recording unavailable')
        return response.arrayBuffer()
      })
      .then(data => ctx.decodeAudioData(data))
      .then(buffer => { if (this.context === ctx) sample.buffer = buffer; return buffer })
      .catch(() => null)
  }

  get muted() { return this.isMuted }
  set muted(value: boolean) {
    this.isMuted = value
    if (value) this.stop()
    if (this.master) this.master.gain.value = value ? 0 : 0.55
  }

  unlock() {
    if (this.muted || this.disposed) return
    try {
      if (!this.context) {
        const ctx = new AudioContext()
        this.context = ctx
        this.master = ctx.createGain()
        this.master.gain.value = 0.55
        this.master.connect(ctx.destination)
        this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
        const samples = this.noise.getChannelData(0)
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
        this.loadController = new AbortController()
        for (const sample of Object.values(this.recordings)) sample.loading = this.loadRecording(ctx, sample, this.loadController.signal)
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
    } catch { /* Audio is optional when unsupported by the browser. */ }
  }

  private voice(source: AudioScheduledSourceNode, duration: number, volume: number, delay = 0, filter?: BiquadFilterNode, sustain = 0) {
    const ctx = this.context!
    const gain = ctx.createGain()
    const start = ctx.currentTime + delay
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008)
    if (sustain > 0) gain.gain.setValueAtTime(volume, start + duration * sustain)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    if (filter) { source.connect(filter); filter.connect(gain) }
    else source.connect(gain)
    gain.connect(this.master!)
    this.startSource(source, start, start + duration, gain, filter)
  }

  private startSource(source: AudioScheduledSourceNode, start?: number, end?: number, gain?: GainNode, filter?: BiquadFilterNode) {
    const cleanup = () => {
      if (!this.sources.delete(source)) return
      source.onended = null
      source.disconnect()
      filter?.disconnect()
      gain?.disconnect()
    }
    this.sources.set(source, cleanup)
    source.onended = cleanup
    try {
      if (start === undefined) source.start()
      else source.start(start)
      if (end !== undefined) source.stop(end)
    } catch (error) { cleanup(); throw error }
  }

  private tone(from: number, to: number, duration: number, volume: number, type: OscillatorType = 'triangle', delay = 0, sustain = 0) {
    const ctx = this.context!
    const oscillator = ctx.createOscillator()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(from, ctx.currentTime + delay)
    oscillator.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + delay + duration)
    this.voice(oscillator, duration, volume, delay, undefined, sustain)
  }

  private burst(duration: number, volume: number, frequency: number, delay = 0) {
    const ctx = this.context!
    const source = ctx.createBufferSource()
    source.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(frequency, ctx.currentTime + delay)
    filter.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + delay + duration)
    this.voice(source, duration, volume, delay, filter)
  }

  private playRecording(buffer: AudioBuffer) {
    const source = this.context!.createBufferSource()
    source.buffer = buffer
    source.connect(this.master!)
    this.startSource(source)
  }

  private fallback(event: GameEvent) {
    if (event === 'launch') { this.tone(750, 160, 0.18, 0.15); this.burst(0.14, 0.14, 2600) }
    else if (event === 'cityExplosion' || event === 'batteryExplosion' || event === 'impact') {
      this.tone(85, 24, 0.7, 0.3, 'sine'); this.burst(0.85, 0.5, 950)
    } else { this.tone(130, 35, 0.4, 0.22, 'sine'); this.burst(0.48, 0.38, 1800) }
  }

  private threatSound(event: GameEvent) {
    // Keep threat cues audible beneath the full-volume explosion recordings.
    switch (event) {
      case 'bomber':
        this.tone(76, 43, 0.95, 0.24, 'sawtooth')
        this.tone(39, 28, 1.05, 0.2, 'sine')
        this.burst(0.9, 0.24, 420)
        break
      case 'ufo':
        for (let i = 0; i < 4; i++) {
          this.tone(i % 2 ? 640 : 320, i % 2 ? 340 : 720, 0.2,
            0.24, 'sine', i * 0.16)
        }
        this.tone(155, 110, 0.7, 0.18, 'triangle')
        break
      case 'payload':
        this.tone(920, 190, 0.42, 0.225, 'triangle')
        this.burst(0.14, 0.2, 2400)
        break
      case 'guidedBomb':
        this.tone(420, 1180, 0.65, 0.255, 'sine')
        this.tone(1180, 580, 0.2, 0.18, 'sine', 0.55)
        break
      case 'evade':
        this.tone(1200, 1800, 0.09, 0.18, 'sine')
        this.tone(1800, 850, 0.12, 0.15, 'triangle', 0.08)
        break
    }
  }

  private startThreatLoop(kind: LoopingThreat) {
    const ctx = this.context!
    const profile = THREAT_LOOPS[kind]
    const sources: OscillatorNode[] = []
    const gains: GainNode[] = []
    const stop = () => {
      for (const source of sources) {
        try { source.stop() } catch { /* Already stopped. */ }
        const cleanup = this.sources.get(source)
        if (cleanup) cleanup()
        else source.disconnect()
      }
      for (const gain of gains) gain.disconnect()
    }
    const oscillator = (frequency: number, type: OscillatorType) => {
      const source = ctx.createOscillator()
      sources.push(source)
      source.type = type
      source.frequency.value = frequency
      return source
    }
    const gain = (volume: number) => {
      const node = ctx.createGain()
      gains.push(node)
      node.gain.value = volume
      return node
    }
    try {
      const carrier = oscillator(profile.frequency, profile.type)
      const volume = gain(profile.volume)
      volume.gain.setValueAtTime(0.0001, ctx.currentTime)
      volume.gain.exponentialRampToValueAtTime(profile.volume, ctx.currentTime + 0.04)
      carrier.connect(volume)
      // A quiet lower voice gives the engine, warble, and guidance whine body.
      const bass = oscillator(profile.frequency / 2, kind === 'bomber' ? 'sine' : 'triangle')
      const bassVolume = gain(kind === 'bomber' ? 0.09 : 0.045)
      bass.connect(bassVolume)
      bassVolume.connect(this.master!)
      volume.connect(this.master!)
      const modulation = oscillator(profile.modulation, kind === 'guidedBomb' ? 'triangle' : 'sine')
      const depth = gain(profile.depth)
      modulation.connect(depth)
      depth.connect(carrier.frequency)
      for (const source of sources) this.startSource(source)
      return stop
    } catch (error) { stop(); throw error }
  }

  /** Share one continuous voice per kind so multiple threats never stack their volume. */
  syncThreats(game: Pick<MissileCommand, 'phase' | 'aircraft' | 'enemies'>) {
    for (const kind of LOOPING_THREATS) {
      const present = !this.muted && !this.disposed && game.phase === 'playing'
        && (kind === 'guidedBomb'
          ? game.enemies.some(enemy => enemy.alive && enemy.kind === kind)
          : game.aircraft.some(craft => craft.alive && craft.kind === kind))
      if (!present) {
        this.threatLoops.get(kind)?.()
        this.threatLoops.delete(kind)
      } else if (!this.threatLoops.has(kind)) {
        this.unlock()
        if (!this.context || !this.master || this.context.state === 'closed') continue
        try { this.threatLoops.set(kind, this.startThreatLoop(kind)) }
        catch { /* Continuous audio must never interrupt gameplay. */ }
      }
    }
  }

  private waveKlaxon() {
    // Three raspy, falling horn blasts finish before the first incoming threat.
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.43
      this.tone(390, 310, 0.32, 0.12, 'square', delay, 0.7)
      this.tone(195, 155, 0.32, 0.1, 'sawtooth', delay, 0.7)
    }
  }

  private waveClearFanfare() {
    const beat = 0.3
    let position = 0
    for (const [chord, beats] of CLEAR_FANFARE) {
      const delay = position * beat
      const duration = beats * beat * 0.9
      for (const note of chord) {
        const frequency = noteFrequency(note)
        this.tone(frequency, frequency, duration, 0.065, 'triangle', delay, 0.65)
        this.tone(frequency * 2, frequency * 2, duration, 0.018, 'sawtooth', delay, 0.55)
      }
      const bass = noteFrequency(chord[0]!) / 2
      this.tone(bass, bass, duration, 0.12, 'triangle', delay, 0.6)
      position += beats
    }
  }

  private victoryMusic() {
    const beat = 0.4
    let position = 0
    for (const [note, beats] of VICTORY_MELODY) {
      const frequency = noteFrequency(note)
      this.tone(frequency, frequency, beats * beat * 0.92, 0.16, 'triangle', position * beat, 0.65)
      this.tone(frequency * 2, frequency * 2, beats * beat * 0.8, 0.025, 'sine', position * beat, 0.45)
      position += beats
    }
    for (let bar = 0; bar < VICTORY_CHORDS.length; bar++) {
      const delay = bar * 4 * beat
      const final = bar === VICTORY_CHORDS.length - 1
      for (const note of VICTORY_CHORDS[bar]!) {
        const frequency = noteFrequency(note)
        this.tone(frequency, frequency, final ? 2.3 : beat * 3.8, 0.045, 'sine', delay, 0.6)
      }
      for (let pulse = 0; pulse < (final ? 1 : 4); pulse++) {
        const frequency = noteFrequency(VICTORY_BASS[bar]! + (pulse % 2 ? 7 : 0))
        this.tone(frequency, frequency, final ? 1.8 : beat * 0.7, 0.12, 'triangle', delay + pulse * beat, 0.45)
        if (!final) this.burst(0.075, 0.055, pulse % 2 ? 3800 : 1100, delay + pulse * beat)
      }
    }
  }

  play(event: GameEvent) {
    if (this.muted) return
    this.unlock()
    const ctx = this.context
    if (!ctx || !this.master || ctx.state === 'closed') return
    // Ground destruction has its own recording instead of layering generic impact.
    if (event === 'impact' && ctx.currentTime - Math.max(this.lastPlayed.get('cityExplosion') ?? -Infinity, this.lastPlayed.get('batteryExplosion') ?? -Infinity) < 0.055) return
    // Keep simultaneous chain reactions from stacking into an overwhelming blast.
    const throttleEvent = event === 'intercept' ? 'explode' : event
    if (ctx.currentTime - (this.lastPlayed.get(throttleEvent) ?? -Infinity) < (event === 'evade' ? 0.3 : 0.055)) return
    this.lastPlayed.set(throttleEvent, ctx.currentTime)
    try {
      switch (event) {
        case 'victory':
          this.stop()
          this.victoryMusic()
          break
        case 'bonus':
          for (let i = 0; i < BONUS_NOTES.length; i++) this.tone(BONUS_NOTES[i]!, BONUS_NOTES[i]!, 0.24, 0.12, 'triangle', i * 0.1)
          break
        case 'bomber':
        case 'ufo':
        case 'payload':
        case 'guidedBomb':
        case 'evade':
          this.threatSound(event)
          break
        case 'launch':
        case 'explode':
        case 'intercept':
        case 'batteryExplosion':
        case 'cityExplosion': {
          const sample = this.recordings[RECORDING_EVENTS[event]!]
          if (sample.buffer) this.playRecording(sample.buffer)
          else {
            const generation = this.playbackGeneration
            void sample.loading?.then(buffer => {
              if (generation !== this.playbackGeneration || this.muted || ctx.state === 'closed') return
              try {
                if (buffer) this.playRecording(buffer)
                else this.fallback(event)
              } catch { /* A delayed decode must never interrupt gameplay. */ }
            })
          }
          break
        }
        case 'impact':
          this.fallback(event)
          break
        case 'wave':
          this.waveKlaxon()
          break
        case 'clear':
          this.waveClearFanfare()
          break
        case 'over':
          for (let i = 0; i < OVER_NOTES.length; i++) this.tone(OVER_NOTES[i]!, OVER_NOTES[i]! * 0.9, 0.55, 0.19, 'triangle', i * 0.24)
          break
      }
    } catch { /* Audio failures must never interrupt the game loop. */ }
  }

  stop() {
    this.playbackGeneration++
    for (const stop of this.threatLoops.values()) stop()
    this.threatLoops.clear()
    for (const [source, cleanup] of this.sources) {
      try { source.stop() } catch { /* Already ended. */ }
      cleanup()
    }
    this.lastPlayed.clear()
  }

  dispose() {
    this.disposed = true
    this.stop()
    this.loadController?.abort()
    this.loadController = null
    this.master?.disconnect()
    if (this.context) void this.context.close().catch(() => {})
    this.context = null
    this.master = null
    this.noise = null
    for (const sample of Object.values(this.recordings)) { sample.buffer = null; sample.loading = null }
  }
}
