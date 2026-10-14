import type { GameEvent } from './engine'

/** Procedural arcade effects and the supplied launch and explosion recordings. */
export class GameAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private sources = new Set<AudioScheduledSourceNode>()
  private lastPlayed = new Map<GameEvent, number>()
  private isMuted = false
  private cityExplosion: AudioBuffer | null = null
  private cityExplosionLoading: Promise<AudioBuffer | null> | null = null
  private airExplosion: AudioBuffer | null = null
  private airExplosionLoading: Promise<AudioBuffer | null> | null = null
  private batteryExplosion: AudioBuffer | null = null
  private batteryExplosionLoading: Promise<AudioBuffer | null> | null = null
  private launchThud: AudioBuffer | null = null
  private launchThudLoading: Promise<AudioBuffer | null> | null = null
  private playbackGeneration = 0

  constructor(private cityExplosionUrl: string, private airExplosionUrl: string, private batteryExplosionUrl: string, private launchThudUrl: string) {}

  private loadRecording(ctx: AudioContext, url: string) {
    return fetch(url)
      .then(response => {
        if (!response.ok) throw new Error('Sound recording unavailable')
        return response.arrayBuffer()
      })
      .then(data => ctx.decodeAudioData(data))
      .catch(() => null)
  }

  get muted() { return this.isMuted }
  set muted(value: boolean) {
    this.isMuted = value
    if (value) this.stop()
    if (this.master) this.master.gain.value = value ? 0 : 0.55
  }

  unlock() {
    if (this.muted) return
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
        this.cityExplosionLoading = this.loadRecording(ctx, this.cityExplosionUrl)
          .then(buffer => { if (this.context === ctx) this.cityExplosion = buffer; return buffer })
        this.airExplosionLoading = this.loadRecording(ctx, this.airExplosionUrl)
          .then(buffer => { if (this.context === ctx) this.airExplosion = buffer; return buffer })
        this.batteryExplosionLoading = this.loadRecording(ctx, this.batteryExplosionUrl)
          .then(buffer => { if (this.context === ctx) this.batteryExplosion = buffer; return buffer })
        this.launchThudLoading = this.loadRecording(ctx, this.launchThudUrl)
          .then(buffer => { if (this.context === ctx) this.launchThud = buffer; return buffer })
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
    } catch { /* Audio is optional when unsupported by the browser. */ }
  }

  private voice(source: AudioScheduledSourceNode, duration: number, volume: number, delay = 0, filter?: BiquadFilterNode) {
    const ctx = this.context!
    const gain = ctx.createGain()
    const start = ctx.currentTime + delay
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    if (filter) { source.connect(filter); filter.connect(gain) }
    else source.connect(gain)
    gain.connect(this.master!)
    this.sources.add(source)
    source.onended = () => {
      source.disconnect()
      filter?.disconnect()
      gain.disconnect()
      this.sources.delete(source)
    }
    source.start(start)
    source.stop(start + duration)
  }

  private tone(from: number, to: number, duration: number, volume: number, type: OscillatorType = 'triangle', delay = 0) {
    const ctx = this.context!
    const oscillator = ctx.createOscillator()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(from, ctx.currentTime + delay)
    oscillator.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + delay + duration)
    this.voice(oscillator, duration, volume, delay)
  }

  private burst(duration: number, volume: number, frequency: number) {
    const ctx = this.context!
    const source = ctx.createBufferSource()
    source.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(frequency, ctx.currentTime)
    filter.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + duration)
    this.voice(source, duration, volume, 0, filter)
  }

  private playRecording(buffer: AudioBuffer) {
    const source = this.context!.createBufferSource()
    source.buffer = buffer
    source.connect(this.master!)
    this.sources.add(source)
    source.onended = () => { source.disconnect(); this.sources.delete(source) }
    source.start()
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
    if (ctx.currentTime - (this.lastPlayed.get(throttleEvent) ?? -Infinity) < 0.055) return
    this.lastPlayed.set(throttleEvent, ctx.currentTime)
    try {
      switch (event) {
        case 'launch':
        case 'explode':
        case 'intercept':
        case 'batteryExplosion':
        case 'cityExplosion': {
          const city = event === 'cityExplosion'
          const battery = event === 'batteryExplosion'
          const launch = event === 'launch'
          const buffer = city ? this.cityExplosion : battery ? this.batteryExplosion : launch ? this.launchThud : this.airExplosion
          const loading = city ? this.cityExplosionLoading : battery ? this.batteryExplosionLoading : launch ? this.launchThudLoading : this.airExplosionLoading
          if (buffer) this.playRecording(buffer)
          else {
            const generation = this.playbackGeneration
            void loading?.then(buffer => {
              if (generation !== this.playbackGeneration || this.muted || ctx.state === 'closed') return
              try {
                if (buffer) this.playRecording(buffer)
                else if (launch) { this.tone(750, 160, 0.18, 0.15); this.burst(0.14, 0.14, 2600) }
                else if (city || battery) { this.tone(85, 24, 0.7, 0.3, 'sine'); this.burst(0.85, 0.5, 950) }
                else { this.tone(130, 35, 0.4, 0.22, 'sine'); this.burst(0.48, 0.38, 1800) }
              } catch { /* A delayed decode must never interrupt gameplay. */ }
            })
          }
          break
        }
        case 'impact':
          this.tone(85, 24, 0.7, 0.3, 'sine')
          this.burst(0.85, 0.5, 950)
          break
        case 'wave':
          ;[330, 440, 660].forEach((note, i) => this.tone(note, note, 0.22, 0.13, 'square', i * 0.14))
          break
        case 'clear':
          ;[523, 659, 784, 1047].forEach((note, i) => this.tone(note, note, 0.36, 0.16, 'triangle', i * 0.12))
          break
        case 'over':
          ;[330, 262, 196, 98].forEach((note, i) => this.tone(note, note * 0.9, 0.55, 0.19, 'triangle', i * 0.24))
          break
      }
    } catch { /* Audio failures must never interrupt the game loop. */ }
  }

  stop() {
    this.playbackGeneration++
    for (const source of this.sources) {
      try { source.stop() } catch { /* Already ended. */ }
    }
    this.lastPlayed.clear()
  }

  dispose() {
    this.stop()
    if (this.context) void this.context.close().catch(() => {})
    this.context = null
    this.master = null
    this.noise = null
    this.cityExplosion = null
    this.cityExplosionLoading = null
    this.airExplosion = null
    this.airExplosionLoading = null
    this.batteryExplosion = null
    this.batteryExplosionLoading = null
    this.launchThud = null
    this.launchThudLoading = null
  }
}
