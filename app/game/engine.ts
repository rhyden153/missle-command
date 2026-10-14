export type Phase = 'ready' | 'playing' | 'paused' | 'intermission' | 'gameover'
export type Point = { x: number; y: number }
export type Missile = Point & { from: Point; target: Point; speed: number; alive: boolean; split: boolean }
export type Blast = Point & { age: number; duration: number; maxRadius: number; radius: number; friendly: boolean; chain: number }
export type Particle = Point & { vx: number; vy: number; life: number; maxLife: number; color: string }
export type City = Point & { alive: boolean; name: string }
export type Battery = Point & { ammo: number; name: string; alive: boolean }
export type GroundExplosion = Point & { age: number; duration: number }
export type GameEvent = 'launch' | 'explode' | 'intercept' | 'impact' | 'cityExplosion' | 'batteryExplosion' | 'wave' | 'clear' | 'over'

export const WIDTH = 1200
export const HEIGHT = 620
export const GROUND = 532
export const MAX_AMMO = 18
const BRAVO_AUTO_DISTANCE_PENALTY = 80
export const CITY_NAMES = ['NEW HOPE', 'SOLACE', 'EDEN', 'HAVEN', 'AURORA', 'PROMISE']

/** Stable compaction preserves collision order without replacing the entity array. */
function compact<T>(items: T[], keep: (item: T) => boolean) {
  let write = 0
  for (let read = 0; read < items.length; read++) {
    const item = items[read]!
    if (keep(item)) items[write++] = item
  }
  items.length = write
}

const isAlive = (missile: Missile) => missile.alive
const isActiveBlast = (blast: Blast) => blast.age < blast.duration
const isActiveExplosion = (explosion: GroundExplosion) => explosion.age < explosion.duration
const isActiveParticle = (particle: Particle) => particle.life > 0

function updateExplosions(explosions: GroundExplosion[], dt: number) {
  for (const explosion of explosions) explosion.age += dt
  compact(explosions, isActiveExplosion)
}

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
  cityExplosions: GroundExplosion[] = []
  batteryExplosions: GroundExplosion[] = []
  cities: City[] = []
  batteries: Battery[] = []
  aim: Point = { x: WIDTH / 2, y: HEIGHT / 2 }
  aimVisible = false
  clock = 0
  incoming = 0
  spawnTimer = 1
  intermission = 0
  cooldown = 0
  shake = 0
  notice = ''
  noticeTime = 0
  onEvent?: (event: GameEvent) => void
  private random: () => number
  private targets: Point[] = []
  private children: Missile[] = []

  constructor(random = Math.random) {
    this.random = random
    this.resetCities()
  }

  get citiesAlive() {
    let count = 0
    for (const city of this.cities) if (city.alive) count++
    return count
  }
  get totalAmmo() {
    let total = 0
    for (const battery of this.batteries) total += battery.ammo
    return total
  }

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
    this.enemies.length = 0
    this.missiles.length = 0
    this.blasts.length = 0
    this.particles.length = 0
    this.cityExplosions.length = 0
    this.batteryExplosions.length = 0
    this.targets.length = 0
    this.children.length = 0
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
    this.incoming = 10 + this.wave * 3
    this.spawnTimer = 1.3
    for (const battery of this.batteries) { battery.ammo = MAX_AMMO; battery.alive = true }
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
    let battery: Battery | undefined
    if (this.selected === -1) {
      let nearest = Infinity
      for (let i = 0; i < this.batteries.length; i++) {
        const candidate = this.batteries[i]!
        if (!candidate.alive || candidate.ammo <= 0) continue
        // Shift each side's auto-selection boundary 40 pixels toward the center.
        const distance = Math.abs(candidate.x - target.x) + (i === 1 ? BRAVO_AUTO_DISTANCE_PENALTY : 0)
        if (!battery || distance < nearest) { battery = candidate; nearest = distance }
      }
    } else battery = this.batteries[this.selected]
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
    const targets = this.targets
    targets.length = 0
    for (const city of this.cities) if (city.alive) targets.push(city)
    for (const battery of this.batteries) if (battery.alive) targets.push(battery)
    if (!targets.length) return
    const target = targets[Math.floor(this.random() * targets.length)]!
    const x = 45 + this.random() * (WIDTH - 90)
    this.enemies.push({
      x, y: -10, from: { x, y: -10 }, target: { x: target.x, y: target.y },
      speed: 34 + this.wave * 5 + this.random() * 10,
      alive: true, split: this.wave >= 3 && this.random() < Math.min(0.3, this.wave * 0.035),
    })
    targets.length = 0
  }

  private addBlast(x: number, y: number, friendly: boolean, chain = 0) {
    this.blasts.push({ x, y, age: 0, duration: friendly ? 2 : 0.85, maxRadius: friendly ? (chain ? 46 : 66) : 38, radius: 0, friendly, chain })
    for (let i = 0; i < (friendly ? 14 : 25); i++) {
      const angle = this.random() * Math.PI * 2
      const speed = 18 + this.random() * (friendly ? 90 : 160)
      const life = 0.35 + this.random() * 0.65
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, color: friendly ? '#ffad45' : '#ff8a57' })
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
    if (this.phase === 'ready') return
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.noticeTime = Math.max(0, this.noticeTime - dt)
    this.shake = Math.max(0, this.shake - dt * 22)
    updateExplosions(this.cityExplosions, dt)
    updateExplosions(this.batteryExplosions, dt)

    for (const blast of this.blasts) {
      blast.age += dt
      const progress = blast.age / blast.duration
      blast.radius = blast.maxRadius * Math.min(1, progress * 4) * Math.min(1, (1 - progress) * 3)
    }
    compact(this.blasts, isActiveBlast)
    for (const particle of this.particles) {
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.vy += 28 * dt
      particle.life -= dt
    }
    compact(this.particles, isActiveParticle)

    // Let the final city's destruction finish while gameplay remains stopped.
    if (this.phase === 'gameover') return

    if (this.phase === 'intermission') {
      this.intermission -= dt
      if (this.intermission <= 0) { this.wave++; this.beginWave() }
      return
    }

    this.spawnTimer -= dt
    if (this.incoming > 0 && this.spawnTimer <= 0) {
      this.spawnEnemy()
      this.incoming--
      this.spawnTimer = Math.max(0.28, 1.25 - this.wave * 0.07) * (0.6 + this.random() * 0.8)
    }

    for (const missile of this.missiles) {
      if (this.move(missile, dt)) { missile.alive = false; this.addBlast(missile.x, missile.y, true); this.onEvent?.('explode') }
    }
    compact(this.missiles, isAlive)

    const children = this.children
    children.length = 0
    for (const enemy of this.enemies) {
      let hit: Blast | undefined
      for (const blast of this.blasts) {
        if (blast.friendly && Math.hypot(enemy.x - blast.x, enemy.y - blast.y) <= blast.radius) { hit = blast; break }
      }
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
        for (const city of this.cities) {
          if (city.alive && Math.abs(city.x - enemy.x) < 40) {
            city.alive = false
            this.cityExplosions.push({ x: city.x, y: city.y, age: 0, duration: 5.5 })
            this.onEvent?.('cityExplosion')
            this.showNotice(`${city.name} LOST · KEEP FIGHTING`, 2.5)
          }
        }
        for (const battery of this.batteries) {
          if (battery.alive && Math.abs(battery.x - enemy.x) < 40) {
            battery.alive = false
            battery.ammo = 0
            this.batteryExplosions.push({ x: battery.x, y: GROUND, age: 0, duration: 5.5 })
            this.onEvent?.('batteryExplosion')
          }
        }
        this.onEvent?.('impact')
      } else if (enemy.split && enemy.y > 175) {
        enemy.split = false
        let target: City | undefined
        let cityIndex = Math.floor(this.random() * this.citiesAlive)
        for (const city of this.cities) {
          if (city.alive && cityIndex-- === 0) { target = city; break }
        }
        if (target) children.push({ ...enemy, from: { x: enemy.x, y: enemy.y }, target: { x: target.x, y: target.y }, speed: enemy.speed * 1.08, split: false })
      }
    }
    compact(this.enemies, isAlive)
    for (const child of children) this.enemies.push(child)
    children.length = 0

    if (this.citiesAlive === 0) {
      this.phase = 'gameover'
      this.best = Math.max(this.best, this.score)
      this.onEvent?.('over')
    } else if (this.incoming === 0 && this.enemies.length === 0 && this.missiles.length === 0 && this.blasts.length === 0 && this.cityExplosions.length === 0 && this.batteryExplosions.length === 0) {
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
