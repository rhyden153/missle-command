export type Phase = 'ready' | 'playing' | 'paused' | 'intermission' | 'gameover'
export type Point = { x: number; y: number }
export type Missile = Point & { from: Point; target: Point; speed: number; alive: boolean; split: boolean }
export type Blast = Point & { age: number; duration: number; maxRadius: number; radius: number; friendly: boolean; chain: number }
export type Particle = Point & { vx: number; vy: number; life: number; maxLife: number; color: string }
export type City = Point & { alive: boolean; name: string }
export type Battery = Point & { ammo: number; name: string; alive: boolean }
export type GameEvent = 'launch' | 'explode' | 'intercept' | 'impact' | 'wave' | 'clear' | 'over'

export const WIDTH = 1200
export const HEIGHT = 620
export const GROUND = 532
export const MAX_AMMO = 18
export const CITY_NAMES = ['NEW HOPE', 'SOLACE', 'EDEN', 'HAVEN', 'AURORA', 'PROMISE']

export class MissileCommand {
  phase: Phase = 'ready'
  previousPhase: 'playing' | 'intermission' = 'playing'
  score = 0
  best = 0
  wave = 1
  intercepted = 0
  launched = 0
  chain = 0
  selected = -1
  enemies: Missile[] = []
  missiles: Missile[] = []
  blasts: Blast[] = []
  particles: Particle[] = []
  cities: City[] = []
  batteries: Battery[] = []
  aim: Point = { x: WIDTH / 2, y: HEIGHT / 2 }
  aimVisible = false
  clock = 0
  waveTime = 0
  incoming = 0
  spawnTimer = 1
  intermission = 0
  cooldown = 0
  shake = 0
  notice = ''
  noticeTime = 0
  onEvent?: (event: GameEvent) => void
  private random: () => number

  constructor(random = Math.random) {
    this.random = random
    this.resetCities()
  }

  get citiesAlive() { return this.cities.filter(city => city.alive).length }
  get totalAmmo() { return this.batteries.reduce((total, battery) => total + battery.ammo, 0) }

  private resetCities() {
    this.cities = [205, 328, 460, 742, 869, 992].map((x, i) => ({ x, y: GROUND, alive: true, name: CITY_NAMES[i]! }))
    this.batteries = [84, 601, 1116].map((x, i) => ({ x, y: GROUND - 7, ammo: MAX_AMMO, alive: true, name: ['ALPHA', 'BRAVO', 'CHARLIE'][i]! }))
  }

  start() {
    this.score = 0
    this.wave = 1
    this.intercepted = 0
    this.launched = 0
    this.chain = 0
    this.enemies = []
    this.missiles = []
    this.blasts = []
    this.particles = []
    this.cooldown = 0
    this.shake = 0
    this.selected = -1
    this.notice = ''
    this.noticeTime = 0
    this.resetCities()
    this.beginWave()
  }

  private beginWave() {
    this.phase = 'playing'
    this.waveTime = 0
    this.incoming = 10 + this.wave * 3
    this.spawnTimer = 1.3
    this.batteries.forEach(battery => { battery.ammo = MAX_AMMO; battery.alive = true })
    this.showNotice(`WAVE ${String(this.wave).padStart(2, '0')} · INCOMING THREATS`, 3)
    this.onEvent?.('wave')
  }

  pause() {
    if (this.phase === 'paused') {
      this.phase = this.previousPhase
    } else if (this.phase === 'playing' || this.phase === 'intermission') {
      this.previousPhase = this.phase
      this.phase = 'paused'
    }
  }

  selectBattery(index: number) { this.selected = index >= 0 && index < 3 ? index : -1 }

  fire(x: number, y: number) {
    if (this.phase !== 'playing' || this.cooldown > 0) return false
    const target = { x: Math.max(8, Math.min(WIDTH - 8, x)), y: Math.max(20, Math.min(GROUND - 36, y)) }
    const available = this.batteries.filter(battery => battery.alive && battery.ammo > 0)
    const battery = this.selected === -1
      ? available.sort((a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x))[0]
      : this.batteries[this.selected]
    if (!battery || !battery.alive || battery.ammo <= 0) {
      this.showNotice(this.selected === -1 ? 'OUT OF AMMO · HOLD THE LINE' : 'BATTERY EMPTY · PRESS A FOR AUTO', 2)
      return false
    }
    battery.ammo--
    this.launched++
    this.cooldown = 0.13
    this.missiles.push({ x: battery.x, y: battery.y - 15, from: { x: battery.x, y: battery.y - 15 }, target, speed: 570, alive: true, split: false })
    this.onEvent?.('launch')
    return true
  }

  private showNotice(message: string, duration: number) { this.notice = message; this.noticeTime = duration }

  private spawnEnemy() {
    const targets: Point[] = [...this.cities.filter(city => city.alive), ...this.batteries.filter(battery => battery.alive)]
    if (!targets.length) return
    const target = targets[Math.floor(this.random() * targets.length)]!
    const x = 45 + this.random() * (WIDTH - 90)
    this.enemies.push({
      x, y: -10, from: { x, y: -10 }, target: { x: target.x, y: target.y },
      speed: 34 + this.wave * 5 + this.random() * 10,
      alive: true, split: this.wave >= 3 && this.random() < Math.min(0.3, this.wave * 0.035),
    })
  }

  private addBlast(x: number, y: number, friendly: boolean, chain = 0) {
    this.blasts.push({ x, y, age: 0, duration: friendly ? 2 : 0.85, maxRadius: friendly ? (chain ? 46 : 66) : 38, radius: 0, friendly, chain })
    for (let i = 0; i < (friendly ? 14 : 25); i++) {
      const angle = this.random() * Math.PI * 2
      const speed = 18 + this.random() * (friendly ? 90 : 160)
      const life = 0.35 + this.random() * 0.65
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, color: friendly ? '#d8f69a' : '#ff8a57' })
    }
  }

  private move(missile: Missile, dt: number) {
    const dx = missile.target.x - missile.x
    const dy = missile.target.y - missile.y
    const distance = Math.hypot(dx, dy)
    if (distance <= missile.speed * dt) { missile.x = missile.target.x; missile.y = missile.target.y; return true }
    missile.x += dx / distance * missile.speed * dt
    missile.y += dy / distance * missile.speed * dt
    return false
  }

  update(dt: number) {
    dt = Math.min(Math.max(dt, 0), 0.05)
    if (this.phase === 'paused') return
    this.clock += dt
    if (this.phase === 'ready' || this.phase === 'gameover') return
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.noticeTime = Math.max(0, this.noticeTime - dt)
    this.shake = Math.max(0, this.shake - dt * 22)

    for (const blast of this.blasts) {
      blast.age += dt
      const progress = blast.age / blast.duration
      blast.radius = blast.maxRadius * Math.min(1, progress * 4) * Math.min(1, (1 - progress) * 3)
    }
    this.blasts = this.blasts.filter(blast => blast.age < blast.duration)
    for (const particle of this.particles) {
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.vy += 28 * dt
      particle.life -= dt
    }
    this.particles = this.particles.filter(particle => particle.life > 0)

    if (this.phase === 'intermission') {
      this.intermission -= dt
      if (this.intermission <= 0) { this.wave++; this.beginWave() }
      return
    }

    this.waveTime += dt
    this.spawnTimer -= dt
    if (this.incoming > 0 && this.spawnTimer <= 0) {
      this.spawnEnemy()
      this.incoming--
      this.spawnTimer = Math.max(0.28, 1.25 - this.wave * 0.07) * (0.6 + this.random() * 0.8)
    }

    for (const missile of this.missiles) {
      if (this.move(missile, dt)) { missile.alive = false; this.addBlast(missile.x, missile.y, true); this.onEvent?.('explode') }
    }
    this.missiles = this.missiles.filter(missile => missile.alive)

    const children: Missile[] = []
    for (const enemy of this.enemies) {
      const hit = this.blasts.find(blast => blast.friendly && Math.hypot(enemy.x - blast.x, enemy.y - blast.y) <= blast.radius)
      if (hit) {
        enemy.alive = false
        this.intercepted++
        const chain = hit.chain + 1
        this.chain = Math.max(this.chain, chain)
        this.score += 25 * this.wave * Math.min(chain, 5)
        this.best = Math.max(this.best, this.score)
        this.addBlast(enemy.x, enemy.y, true, chain)
        if (chain > 1) this.showNotice(`CHAIN REACTION ×${chain}`, 1.5)
        this.onEvent?.('intercept')
        continue
      }
      if (this.move(enemy, dt)) {
        enemy.alive = false
        this.addBlast(enemy.x, enemy.y, false)
        this.shake = 5
        this.cities.forEach(city => {
          if (city.alive && Math.abs(city.x - enemy.x) < 40) { city.alive = false; this.showNotice(`${city.name} LOST · KEEP FIGHTING`, 2.5) }
        })
        this.batteries.forEach(battery => { if (Math.abs(battery.x - enemy.x) < 40) { battery.alive = false; battery.ammo = 0 } })
        this.onEvent?.('impact')
      } else if (enemy.split && enemy.y > 175) {
        enemy.split = false
        const target = this.cities.filter(city => city.alive)[Math.floor(this.random() * this.citiesAlive)]
        if (target) children.push({ ...enemy, from: { x: enemy.x, y: enemy.y }, target: { x: target.x, y: target.y }, speed: enemy.speed * 1.08, split: false })
      }
    }
    this.enemies = [...this.enemies.filter(enemy => enemy.alive), ...children]

    if (this.citiesAlive === 0) {
      this.phase = 'gameover'
      this.best = Math.max(this.best, this.score)
      this.onEvent?.('over')
    } else if (this.incoming === 0 && this.enemies.length === 0 && this.missiles.length === 0 && this.blasts.length === 0) {
      const bonus = this.citiesAlive * 100 + this.totalAmmo * 5
      this.score += bonus
      this.best = Math.max(this.best, this.score)
      this.phase = 'intermission'
      this.intermission = 4
      this.onEvent?.('clear')
      this.showNotice(`SECTOR SECURED · +${bonus} SURVIVAL BONUS`, 4)
    }
  }
}
