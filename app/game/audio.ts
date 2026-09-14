import type { GameEvent } from './engine'

export class GameAudio {
  private context: AudioContext | null = null
  muted = true

  unlock() {
    if (this.muted) return
    try {
      this.context ??= new AudioContext()
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
    } catch { /* The game remains playable when browser audio is unavailable. */ }
  }

  play(event: GameEvent) {
    if (this.muted) return
    this.unlock()
    const ctx = this.context
    if (!ctx) return
    const settings: Record<GameEvent, [number, number, number, OscillatorType]> = {
      launch: [580, 170, 0.13, 'triangle'],
      intercept: [180, 50, 0.25, 'triangle'],
      impact: [75, 22, 0.4, 'sawtooth'],
      wave: [350, 700, 0.35, 'sine'],
      over: [180, 45, 0.8, 'triangle'],
    }
    const [start, end, duration, type] = settings[event]
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(start, ctx.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(end, ctx.currentTime + duration)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(event === 'impact' ? 0.06 : 0.035, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + duration)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  }

  dispose() { if (this.context) void this.context.close().catch(() => {}) }
}
