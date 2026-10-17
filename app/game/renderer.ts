import { GROUND, HEIGHT, WIDTH, MissileCommand } from './engine'
import type { Blast, GroundExplosion, Missile, ThreatKind, ThreatStyle } from './engine'

const GREEN = '#d6ee9c'
const ORANGE = '#ee906b'
const SILVER = '#c0c0c0'
type Vertex = readonly [number, number]
type RGB = readonly [number, number, number]
const FAR_MOUNTAINS = [[0, 444], [64, 414], [110, 428], [192, 378], [255, 415], [334, 360], [405, 407], [463, 379], [527, 423], [609, 369], [679, 400], [761, 348], [847, 400], [918, 381], [996, 421], [1080, 365], [1150, 406], [1200, 389]] as const
const NEAR_MOUNTAINS = [[0, 479], [80, 450], [141, 470], [205, 439], [300, 478], [379, 447], [463, 482], [526, 460], [601, 471], [667, 444], [744, 480], [820, 449], [913, 477], [1004, 450], [1090, 477], [1150, 456], [1200, 470]] as const
const BUILDING_HEIGHTS = [18, 30, 23, 43, 35, 20, 27] as const
const DEMO_MISSILES = [
  { x1: 114, y1: 35, x2: 266, y2: 265, p: 0.75 },
  { x1: 894, y1: 0, x2: 787, y2: 256, p: 0.67 },
  { x1: 1069, y1: 69, x2: 973, y2: 295, p: 0.93 },
  { x1: 400, y1: 0, x2: 441, y2: 115, p: 0.62 },
] as const
const STARS = Array.from({ length: 100 }, (_, i) => ({
  x: ((i * 7919 + 137) % 1191) + 4,
  y: ((i * 1531 + 31) % 455) + 8,
  color: `rgba(224, 230, 239, ${0.12 + ((i * 7) % 10) * 0.025})`,
  width: i % 7 === 0 ? 2 : 1,
}))
const PUFF_COLORS = [
  [0, [255, 241, 185], [159, 151, 143]],
  [0.4, [255, 165, 53], [110, 105, 101]],
  [0.8, [177, 61, 20], [66, 62, 60]],
] as const
const FIREBALL_COLORS = [
  [0, [255, 184, 53], [157, 151, 146]],
  [0.45, [244, 91, 24], [110, 107, 104]],
  [0.85, [181, 30, 18], [67, 65, 63]],
  [1, [115, 18, 15], [42, 41, 40]],
] as const
const FONT_FAMILY = '"Consolas", "Courier New", monospace'
const FONTS: Record<number, string> = { 8: `8px ${FONT_FAMILY}`, 9: `9px ${FONT_FAMILY}`, 10: `10px ${FONT_FAMILY}`, 12: `12px ${FONT_FAMILY}` }

function line(ctx: CanvasRenderingContext2D, points: readonly Vertex[], color: string | CanvasGradient, width = 1) {
  ctx.beginPath()
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!
    if (i) ctx.lineTo(point[0], point[1])
    else ctx.moveTo(point[0], point[1])
  }
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

function segment(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string | CanvasGradient, width = 1) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

function mountain(ctx: CanvasRenderingContext2D, points: readonly Vertex[], fill: string, edge: string) {
  ctx.beginPath()
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!
    if (i) ctx.lineTo(point[0], point[1])
    else ctx.moveTo(point[0], point[1])
  }
  ctx.lineTo(WIDTH, HEIGHT)
  ctx.lineTo(0, HEIGHT)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  line(ctx, points, edge)
}

function mixColor(hot: RGB, cold: RGB, heat: number) {
  const cool = 1 - heat
  return `rgb(${Math.round(hot[0] * heat + cold[0] * cool)},${Math.round(hot[1] * heat + cold[1] * cool)},${Math.round(hot[2] * heat + cold[2] * cool)})`
}

function text(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, color = '#65705c', size = 9, align: CanvasTextAlign = 'left') {
  ctx.font = FONTS[size] ?? `${size}px ${FONT_FAMILY}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.fillText(label, x, y)
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, color)
  gradient.addColorStop(1, 'transparent')
  ctx.fillStyle = gradient
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
}

const CLOUD_CAP = [
  [-0.8, 0.12, 0.35], [-0.55, -0.15, 0.43], [-0.25, -0.35, 0.48],
  [0.15, -0.4, 0.49], [0.52, -0.18, 0.43], [0.8, 0.1, 0.35],
  [-0.48, 0.28, 0.4], [0, 0.2, 0.5], [0.46, 0.27, 0.4],
] as const

function cloudPuff(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, heat: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(rx, ry)
  const gradient = ctx.createRadialGradient(-0.15, -0.22, 0.04, 0, 0, 1)
  for (const stop of PUFF_COLORS) gradient.addColorStop(stop[0], mixColor(stop[1], stop[2], heat))
  gradient.addColorStop(1, 'transparent')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function renderAirExplosion(ctx: CanvasRenderingContext2D, blast: Blast, reducedMotion: boolean) {
  const progress = blast.age / blast.duration
  const heat = Math.max(0, 1 - Math.max(0, progress - 0.2) / 0.48)
  const fade = Math.min(1, (1 - progress) * 3)
  ctx.save()
  ctx.beginPath()
  ctx.arc(blast.x, blast.y, blast.radius, 0, Math.PI * 2)
  ctx.clip()
  ctx.globalAlpha = fade
  const fireball = ctx.createRadialGradient(blast.x - blast.radius * 0.15, blast.y - blast.radius * 0.2, 0, blast.x, blast.y, blast.radius)
  for (const stop of FIREBALL_COLORS) fireball.addColorStop(stop[0], mixColor(stop[1], stop[2], heat))
  ctx.fillStyle = fireball
  ctx.fillRect(blast.x - blast.radius, blast.y - blast.radius, blast.radius * 2, blast.radius * 2)
  ctx.globalAlpha = fade * 0.55
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4 + (reducedMotion ? 0 : blast.age * 0.25)
    const offset = i === 0 ? 0 : blast.radius * 0.55
    cloudPuff(ctx, blast.x + Math.cos(angle) * offset, blast.y + Math.sin(angle) * offset,
      blast.radius * 0.5, blast.radius * 0.48, heat)
  }
  ctx.restore()
}

function renderNuclearExplosion(ctx: CanvasRenderingContext2D, explosion: GroundExplosion, reducedMotion: boolean, scale = 1) {
  const { x, y, age, duration } = explosion
  const fade = Math.min(1, (duration - age) / 1.7)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.translate(-x, -y)

  // A single expanding fireball and ground-level pressure ring precede the cloud.
  if (age < 1.15) {
    const growth = 1 - Math.exp(-age * 9)
    ctx.globalAlpha = Math.min(1, (1.15 - age) * 2)
    glow(ctx, x, y - 20, 35 + growth * 100, '#ffb34c88')
    cloudPuff(ctx, x, y - 24 - growth * 16, 8 + growth * 58, 8 + growth * 53, 1)
    if (!reducedMotion) {
      ctx.strokeStyle = `rgba(255, 211, 145, ${Math.max(0, 0.65 - age * 0.6)})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(x, y - 2, 10 + age * 145, 3 + age * 22, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  if (age > 0.25) {
    const rise = 1 - Math.exp(-(age - 0.25) * 1.2)
    const top = y - 40 - rise * 115
    const spread = 28 + rise * 53 + Math.max(0, age - 2) * 5
    const heat = Math.max(0, 1 - (age - 0.4) / 2.5)
    ctx.globalAlpha = fade * Math.min(1, (age - 0.25) * 3)
    glow(ctx, x, y - 16, 75, `rgba(255, 119, 35, ${heat * 0.25})`)
    // Overlapping billows keep the stem attached to the destroyed city's crater.
    for (let i = 0; i < 8; i++) {
      const p = i / 7
      const sway = reducedMotion ? 0 : Math.sin(age * 2 + i * 1.4) * (3 + p * 4)
      const width = 14 + (1 - p) * 15 + p * p * 10
      cloudPuff(ctx, x + sway, y - 12 - p * (y - top - 12), width, 20 + rise * 6, heat * (1 - p * 0.25))
    }
    for (let index = 0; index < CLOUD_CAP.length; index++) {
      const puff = CLOUD_CAP[index]!
      const roll = reducedMotion ? 0 : Math.sin(age * 2.2 + index * 1.8) * 3
      cloudPuff(ctx, x + puff[0] * spread, top + puff[1] * spread * 0.7 + roll,
        puff[2] * spread * 1.15, puff[2] * spread * 0.88, heat)
    }
    // Dust spreads along the ground as the fiery cap cools into ash.
    for (let i = -2; i <= 2; i++) {
      cloudPuff(ctx, x + i * (16 + rise * 17), y - 5, 25 + rise * 11, 10 + rise * 7, heat * 0.4)
    }
  }
  ctx.restore()
}

export function renderBattlefield(ctx: CanvasRenderingContext2D, game: MissileCommand, reducedMotion = false, style: ThreatStyle = 'modern') {
  const time = reducedMotion ? 6 : game.clock
  ctx.save()
  ctx.fillStyle = '#10151e'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  if (game.shake && !reducedMotion) ctx.translate(Math.sin(time * 91) * game.shake, Math.cos(time * 73) * game.shake)

  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  sky.addColorStop(0, '#000000')
  sky.addColorStop(1, '#101827')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  glow(ctx, 650, 415, 400, '#c99a6a12')

  // Fixed, deterministic star field keeps the background steady between frames.
  for (const star of STARS) {
    ctx.fillStyle = star.color
    ctx.fillRect(star.x, star.y, star.width, 1)
  }

  text(ctx, 'N  37°14′06″', 23, 29, '#8996a6', 10)
  text(ctx, 'W  115°48′40″', 23, 45, '#647181', 9)
  text(ctx, 'SECTOR 07 / NORTHERN FRONTIER', WIDTH - 23, 29, '#8996a6', 10, 'right')
  text(ctx, 'ELEV. 2,340 M', WIDTH - 23, 45, '#647181', 9, 'right')
  // Mountain layers are drawn with vector geometry.
  mountain(ctx, FAR_MOUNTAINS, '#242424', '#a4a6aa32')
  mountain(ctx, NEAR_MOUNTAINS, '#1F291F', '#ba9c7a2b')

  ctx.fillStyle = '#3B2F26'
  ctx.fillRect(0, GROUND + 2, WIDTH, HEIGHT - GROUND)
  segment(ctx, 0, GROUND + 2, WIDTH, GROUND + 2, '#b4957244')

  for (let index = 0; index < game.cities.length; index++) {
    const city = game.cities[index]!
    if (!city.alive) {
      // The crater remains until a bonus city restores this site.
      ctx.beginPath()
      ctx.ellipse(city.x, GROUND + 3, 46, 13, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#47382b'
      ctx.fill()
      ctx.strokeStyle = '#92704c88'
      ctx.lineWidth = 1
      ctx.stroke()
      const crater = ctx.createLinearGradient(0, GROUND - 7, 0, GROUND + 12)
      crater.addColorStop(0, '#070809')
      crater.addColorStop(1, '#30241c')
      ctx.beginPath()
      ctx.ellipse(city.x, GROUND + 2, 40, 9, 0, 0, Math.PI * 2)
      ctx.fillStyle = crater
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(city.x, GROUND + 3, 46, 13, 0, 0, Math.PI)
      ctx.strokeStyle = '#b28c5c66'
      ctx.stroke()
      for (let i = 0; i < 8; i++) {
        const angle = i * 2.4
        ctx.fillStyle = i % 2 ? '#69513a' : '#302820'
        ctx.fillRect(city.x + Math.cos(angle) * 48 - 2, GROUND + 3 + Math.sin(angle) * 14, 3 + i % 3, 2)
      }
      text(ctx, 'OFFLINE', city.x, GROUND + 28, '#846653', 8, 'center')
      continue
    }
    glow(ctx, city.x, GROUND - 7, 60, '#e7ba7814')
    const buildings = BUILDING_HEIGHTS
    for (let j = 0; j < buildings.length; j++) {
      const h = buildings[(j + index * 2) % buildings.length]!
      const x = city.x - 34 + j * 10
      ctx.fillStyle = '#41464c'
      ctx.fillRect(x, GROUND - h, 9, h)
      ctx.fillStyle = '#b5aaa0'
      ctx.fillRect(x, GROUND - h, 9, 1)
      for (let wy = GROUND - h + 5; wy < GROUND - 4; wy += 7) {
        ctx.fillStyle = ((j + wy + index) % 3) ? '#e7bd7e88' : '#9c805d66'
        ctx.fillRect(x + 2, wy, 2, 2)
        ctx.fillRect(x + 6, wy, 1, 2)
      }
    }
    const flagRoof = GROUND - buildings[(3 + index * 2) % buildings.length]!
    segment(ctx, city.x - 1, flagRoof, city.x - 1, flagRoof - 10, '#b5aaa0', 1)
    ctx.fillStyle = GREEN
    ctx.fillRect(city.x - 2, flagRoof - 11, 3, 2)
    text(ctx, city.name, city.x, GROUND + 28, '#a79d90', 8, 'center')
    ctx.fillStyle = '#b9d47a'
    ctx.fillRect(city.x - 2, GROUND + 37, 3, 3)
  }

  for (let index = 0; index < game.batteries.length; index++) {
    const battery = game.batteries[index]!
    const active = game.selected === index || game.selected === -1
    const color = !battery.alive ? '#695344' : active ? GREEN : '#7e8f61'
    if (battery.alive) glow(ctx, battery.x, GROUND - 15, 65, active ? '#c9ec7320' : '#c9ec7308')
    ctx.fillStyle = battery.alive ? '#655747' : '#39312a'
    ctx.beginPath()
    ctx.moveTo(battery.x - 37, GROUND + 1)
    ctx.lineTo(battery.x - 22, GROUND - 18)
    ctx.lineTo(battery.x + 22, GROUND - 18)
    ctx.lineTo(battery.x + 37, GROUND + 1)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(battery.x - 37, GROUND)
    ctx.lineTo(battery.x - 22, GROUND - 18)
    ctx.lineTo(battery.x + 22, GROUND - 18)
    ctx.lineTo(battery.x + 37, GROUND)
    ctx.strokeStyle = SILVER
    ctx.lineWidth = 1
    ctx.stroke()
    if (battery.alive) {
      const angle = Math.atan2(game.aim.y - battery.y, game.aim.x - battery.x)
      segment(ctx, battery.x, GROUND - 20, battery.x + Math.cos(angle) * 19, GROUND - 20 + Math.sin(angle) * 19, SILVER, 4)
      ctx.fillStyle = color
      ctx.fillRect(battery.x - 8, GROUND - 23, 16, 7)
      ctx.strokeStyle = SILVER
      ctx.lineWidth = 1
      ctx.strokeRect(battery.x - 8, GROUND - 23, 16, 7)
    }
    text(ctx, `0${index + 1} / ${battery.name}`, battery.x, GROUND + 29, color, 9, 'center')
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = battery.ammo / battery.capacity > i / 9 ? color : '#3b3630'
      ctx.fillRect(battery.x - 26 + i * 6, GROUND + 38, 4, 5)
    }
  }

  if (game.phase === 'ready') {
    for (let i = 0; i < DEMO_MISSILES.length; i++) {
      const demo = DEMO_MISSILES[i]!
      const p = demo.p + Math.sin(time * 0.25 + i) * 0.07
      const x = demo.x1 + (demo.x2 - demo.x1) * p
      const y = demo.y1 + (demo.y2 - demo.y1) * p
      const trail = ctx.createLinearGradient(demo.x1, demo.y1, x, y)
      trail.addColorStop(0, '#ee906b00')
      trail.addColorStop(1, '#ee906b99')
      segment(ctx, demo.x1, demo.y1, x, y, trail, 1.3)
      glow(ctx, x, y, 13, '#ee906b50')
      ctx.fillStyle = '#f0a787'
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3)
      if (i === 0 || i === 2) {
        text(ctx, `TRK 00${i + 1}`, x + 12, y - 5, '#b9866377', 8)
        line(ctx, [[x - 7, y - 12], [x - 12, y - 12], [x - 12, y - 7]], '#c8915966')
        line(ctx, [[x + 7, y + 12], [x + 12, y + 12], [x + 12, y + 7]], '#c8915966')
      }
    }
    segment(ctx, 84, GROUND - 30, 230, 300, '#d4ec9a44', 1)
    const pulse = 34 + Math.sin(time * 0.7) * 4
    glow(ctx, 230, 300, pulse * 1.7, '#d1ec8722')
    ctx.strokeStyle = '#d1ec8755'
    ctx.beginPath()
    ctx.arc(230, 300, pulse, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = '#d1ec8725'
    ctx.beginPath()
    ctx.arc(230, 300, pulse * 0.72, 0, Math.PI * 2)
    ctx.stroke()
  }

  for (const craft of game.aircraft) renderThreatSprite(ctx, craft.kind, style, craft.x, craft.y, time, craft.direction)
  for (const missile of game.enemies) {
    if (missile.kind === 'guidedBomb') {
      ctx.save()
      ctx.translate(missile.x, missile.y)
      ctx.rotate(-Math.asin(Math.max(-0.9, Math.min(0.9, (missile.vx ?? 0) / missile.speed))))
      renderThreatSprite(ctx, 'guidedBomb', style, 0, 0, time, 1, missile.evading)
      ctx.restore()
    } else renderMissile(ctx, missile, false)
  }
  for (const missile of game.missiles) renderMissile(ctx, missile, true)

  for (const blast of game.blasts) {
    const radius = Math.max(0, blast.radius)
    if (!radius) continue
    if (blast.friendly) {
      renderAirExplosion(ctx, blast, reducedMotion)
      if (blast.chain > 1) text(ctx, `×${blast.chain}`, blast.x, blast.y + 3, '#fff0cb', 12, 'center')
      continue
    }
    glow(ctx, blast.x, blast.y, radius * 1.5, '#f5986b40')
    ctx.beginPath()
    ctx.arc(blast.x, blast.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = '#ee906b20'
    ctx.fill()
    ctx.strokeStyle = ORANGE
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(blast.x, blast.y, radius * 0.87, 0, Math.PI * 2)
    ctx.strokeStyle = '#ee906b66'
    ctx.lineWidth = 1
    ctx.stroke()
    if (blast.age < 0.15) glow(ctx, blast.x, blast.y, 18, '#fffddd99')
    if (blast.chain > 1) text(ctx, `×${blast.chain}`, blast.x, blast.y + 3, GREEN, 12, 'center')
  }

  for (const explosion of game.cityExplosions) renderNuclearExplosion(ctx, explosion, reducedMotion)
  for (const explosion of game.batteryExplosions) renderNuclearExplosion(ctx, explosion, reducedMotion, 0.6)

  for (const particle of game.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife)
    ctx.fillStyle = particle.color
    ctx.fillRect(particle.x, particle.y, 2, 2)
  }
  ctx.globalAlpha = 1

  if (game.aimVisible && game.phase === 'playing') {
    const { x, y } = game.aim
    ctx.strokeStyle = '#e1f6b4bb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, 11, 0, Math.PI * 2)
    ctx.stroke()
    for (const direction of [-1, 1]) {
      segment(ctx, x + direction * 6, y, x + direction * 17, y, GREEN)
      segment(ctx, x, y + direction * 6, x, y + direction * 17, GREEN)
    }
    ctx.fillStyle = GREEN
    ctx.fillRect(x - 1, y - 1, 2, 2)
  }

  text(ctx, 'TERRAIN MAPPING ACTIVE', 21, HEIGHT - 15, '#817568', 8)
  text(ctx, 'MC—84 / DEFENSE GRID', WIDTH - 21, HEIGHT - 15, '#817568', 8, 'right')
  ctx.restore()
}

// Small code-native sprites stay sharp at every canvas size and need no asset downloads.
const CLASSIC_SPRITES = {
  bomber: [
    '      11                ',
    '       111              ',
    '  1     1111            ',
    '  11111111111111111     ',
    '1111111111111111222111  ',
    '  1111111111111111111111',
    '  1     1111            ',
    '       111              ',
    '      11                ',
  ],
  ufo: [
    '       2222       ',
    '     22111122     ',
    '    2111111112    ',
    '  11111111111111  ',
    '111111111111111111',
    '  11211211211211  ',
    '    1111111111    ',
  ],
  guidedBomb: [
    '1  2  1',
    '11 2 11',
    ' 12221 ',
    ' 11111 ',
    ' 11211 ',
    '  121  ',
    '  111  ',
    '   1   ',
  ],
} as const

export function renderThreatSprite(ctx: CanvasRenderingContext2D, kind: Exclude<ThreatKind, 'missile'>, style: ThreatStyle,
  x: number, y: number, time: number, direction = 1, evading = false) {
  ctx.save()
  ctx.translate(x, y)
  if (kind === 'bomber') ctx.scale(direction, 1)
  if (kind === 'guidedBomb') ctx.scale(0.7, 0.7)
  if (style === 'classic') {
    const rows = CLASSIC_SPRITES[kind]
    const color = kind === 'bomber' ? '#ffd477' : kind === 'ufo' ? '#7aebff' : '#ff83d5'
    for (let row = 0; row < rows.length; row++) {
      for (let column = 0; column < rows[row]!.length; column++) {
        const pixel = rows[row]![column]
        if (pixel !== '1' && pixel !== '2') continue
        ctx.fillStyle = pixel === '2' || evading ? '#fff5d9' : color
        ctx.fillRect((column - rows[0].length / 2) * 2, (row - rows.length / 2) * 2, 2, 2)
      }
    }
  } else if (kind === 'bomber') {
    glow(ctx, -24, 0, 19, '#ff9d413d')
    const metal = ctx.createLinearGradient(0, -13, 0, 13)
    metal.addColorStop(0, '#f0d3a0')
    metal.addColorStop(0.45, '#8c8e94')
    metal.addColorStop(1, '#343d4b')
    ctx.beginPath()
    const hull = [[29, 1], [13, -5], [0, -6], [-12, -15], [-17, -15], [-10, -4], [-22, -4], [-27, -10], [-30, -10], [-27, 1], [-30, 10], [-26, 10], [-21, 4], [-9, 4], [-17, 15], [-11, 15], [2, 6], [16, 5]] as const
    hull.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))
    ctx.closePath()
    ctx.fillStyle = metal
    ctx.fill()
    ctx.strokeStyle = '#f3c078'
    ctx.lineWidth = 1
    ctx.stroke()
    line(ctx, [[-13, -1], [15, -1], [21, 1]], '#d4e4ed', 1)
    segment(ctx, 9, -3, 15, -2, '#b6edff', 2)
    for (const offset of [-6, 6]) {
      segment(ctx, -18, offset, -26 - Math.sin(time * 19) * 2, offset, '#ffac50', 2)
    }
  } else if (kind === 'ufo') {
    glow(ctx, 0, 3, 31, '#59dcff25')
    const dome = ctx.createLinearGradient(0, -13, 0, 2)
    dome.addColorStop(0, '#d2f9ff')
    dome.addColorStop(1, '#287994')
    ctx.fillStyle = dome
    ctx.beginPath()
    ctx.ellipse(0, -3, 11, 10, 0, Math.PI, Math.PI * 2)
    ctx.fill()
    const rim = ctx.createLinearGradient(0, -4, 0, 10)
    rim.addColorStop(0, '#c3e9f3')
    rim.addColorStop(0.45, '#5e8a9e')
    rim.addColorStop(1, '#172b43')
    ctx.fillStyle = rim
    ctx.strokeStyle = '#77def5'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(0, 2, 24, 8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    for (let i = -2; i <= 2; i++) {
      ctx.fillStyle = Math.sin(time * 5 + i) > 0 ? '#dcffff' : '#4b9da9'
      ctx.fillRect(i * 8 - 1.5, 2, 3, 2)
    }
    segment(ctx, -7, 11, 7, 11, '#65e5ff', 2)
  } else {
    glow(ctx, 0, 0, evading ? 23 : 16, evading ? '#ffe6b950' : '#fb7bcf30')
    const shell = ctx.createLinearGradient(-6, 0, 6, 0)
    shell.addColorStop(0, '#a14892')
    shell.addColorStop(0.45, '#ffcfec')
    shell.addColorStop(1, '#793e7e')
    ctx.fillStyle = shell
    ctx.strokeStyle = evading ? '#fff3ca' : '#ff9ddd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, 11)
    ctx.lineTo(-5, 2)
    ctx.lineTo(-4, -8)
    ctx.lineTo(0, -11)
    ctx.lineTo(4, -8)
    ctx.lineTo(5, 2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    line(ctx, [[-4, -4], [-9, -9], [-8, 1], [-4, 3]], '#f395cf', 1.5)
    line(ctx, [[4, -4], [9, -9], [8, 1], [4, 3]], '#f395cf', 1.5)
    segment(ctx, 0, -12, 0, -16 - Math.sin(time * 16) * 2, '#ffc7eb', 2)
  }
  ctx.restore()
}

function renderMissile(ctx: CanvasRenderingContext2D, missile: Missile, friendly: boolean) {
  const color = friendly ? GREEN : ORANGE
  const trail = ctx.createLinearGradient(missile.from.x, missile.from.y, missile.x, missile.y)
  trail.addColorStop(0, friendly ? '#d6ee9c05' : '#ee906b0a')
  trail.addColorStop(1, friendly ? '#d6ee9cbb' : '#ee906bdd')
  segment(ctx, missile.from.x, missile.from.y, missile.x, missile.y, trail, friendly ? 1.5 : 1.2)
  glow(ctx, missile.x, missile.y, friendly ? 10 : 13, friendly ? '#d6ee9c50' : '#ee906b60')
  ctx.fillStyle = color
  ctx.fillRect(missile.x - 2, missile.y - 2, 4, 4)
  if (friendly) {
    segment(ctx, missile.target.x - 4, missile.target.y - 4, missile.target.x + 4, missile.target.y + 4, '#d6ee9c66')
    segment(ctx, missile.target.x + 4, missile.target.y - 4, missile.target.x - 4, missile.target.y + 4, '#d6ee9c66')
  } else if (missile.split) {
    ctx.strokeStyle = ORANGE
    ctx.strokeRect(missile.x - 5, missile.y - 5, 10, 10)
  }
}
