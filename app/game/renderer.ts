import { GROUND, HEIGHT, WIDTH, MissileCommand } from './engine'

const GREEN = '#d6ee9c'
const ORANGE = '#ee906b'

function line(ctx: CanvasRenderingContext2D, points: number[][], color: string | CanvasGradient, width = 1) {
  ctx.beginPath()
  points.forEach((point, index) => index ? ctx.lineTo(point[0]!, point[1]!) : ctx.moveTo(point[0]!, point[1]!))
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

function text(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, color = '#65705c', size = 9, align: CanvasTextAlign = 'left') {
  ctx.font = `${size}px "Consolas", "Courier New", monospace`
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

export function renderBattlefield(ctx: CanvasRenderingContext2D, game: MissileCommand, reducedMotion = false) {
  const time = reducedMotion ? 6 : game.clock
  ctx.save()
  ctx.fillStyle = '#10150f'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  if (game.shake && !reducedMotion) ctx.translate(Math.sin(time * 91) * game.shake, Math.cos(time * 73) * game.shake)

  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  sky.addColorStop(0, '#11170f')
  sky.addColorStop(0.62, '#192117')
  sky.addColorStop(1, '#242b19')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  glow(ctx, 650, 415, 400, '#6c784a12')

  // Fixed, deterministic star field keeps the background steady between frames.
  for (let i = 0; i < 100; i++) {
    const x = ((i * 7919 + 137) % 1191) + 4
    const y = ((i * 1531 + 31) % 455) + 8
    ctx.fillStyle = `rgba(206, 221, 174, ${0.12 + ((i * 7) % 10) * 0.025})`
    ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, 1)
  }

  for (let x = 0; x <= WIDTH; x += 60) line(ctx, [[x, 0], [x, GROUND]], '#c7dea207')
  for (let y = 52; y <= GROUND; y += 60) line(ctx, [[0, y], [WIDTH, y]], '#c7dea207')
  for (let x = 60; x < WIDTH; x += 120) {
    for (let y = 112; y < GROUND - 80; y += 120) {
      line(ctx, [[x - 3, y], [x + 3, y]], '#c7dea21b')
      line(ctx, [[x, y - 3], [x, y + 3]], '#c7dea21b')
    }
  }

  // Radar range arcs above the central battery.
  ctx.setLineDash([3, 7])
  ctx.strokeStyle = '#c7dea20c'
  for (const radius of [180, 330, 480]) {
    ctx.beginPath()
    ctx.arc(601, GROUND, radius, Math.PI, Math.PI * 2)
    ctx.stroke()
  }
  ctx.setLineDash([])

  text(ctx, 'N  37°14′06″', 23, 29, '#77836a', 10)
  text(ctx, 'W  115°48′40″', 23, 45, '#526047', 9)
  text(ctx, 'SECTOR 07 / NORTHERN FRONTIER', WIDTH - 23, 29, '#77836a', 10, 'right')
  text(ctx, 'ELEV. 2,340 M', WIDTH - 23, 45, '#526047', 9, 'right')
  for (let y = 90; y < 470; y += 55) {
    line(ctx, [[0, y], [7, y]], '#73826055')
    line(ctx, [[WIDTH - 7, y], [WIDTH, y]], '#73826055')
  }

  // Mountain layers and contour lines are drawn with vector geometry.
  const far = [[0, 444], [64, 414], [110, 428], [192, 378], [255, 415], [334, 360], [405, 407], [463, 379], [527, 423], [609, 369], [679, 400], [761, 348], [847, 400], [918, 381], [996, 421], [1080, 365], [1150, 406], [1200, 389]]
  ctx.beginPath()
  far.forEach((point, i) => i ? ctx.lineTo(point[0]!, point[1]!) : ctx.moveTo(point[0]!, point[1]!))
  ctx.lineTo(WIDTH, HEIGHT)
  ctx.lineTo(0, HEIGHT)
  ctx.closePath()
  ctx.fillStyle = '#21291b'
  ctx.fill()
  line(ctx, far, '#66774832')

  const near = [[0, 479], [80, 450], [141, 470], [205, 439], [300, 478], [379, 447], [463, 482], [526, 460], [601, 471], [667, 444], [744, 480], [820, 449], [913, 477], [1004, 450], [1090, 477], [1150, 456], [1200, 470]]
  ctx.beginPath()
  near.forEach((point, i) => i ? ctx.lineTo(point[0]!, point[1]!) : ctx.moveTo(point[0]!, point[1]!))
  ctx.lineTo(WIDTH, HEIGHT)
  ctx.lineTo(0, HEIGHT)
  ctx.closePath()
  ctx.fillStyle = '#192013'
  ctx.fill()
  line(ctx, near, '#8296542b')
  for (let i = 0; i < 8; i++) {
    const contour = near.map(([x, y]) => [x!, Math.min(HEIGHT, y! + 15 + i * 18)])
    line(ctx, contour, `rgba(116, 136, 77, ${0.075 - i * 0.006})`)
  }

  ctx.fillStyle = '#11170f'
  ctx.fillRect(0, GROUND + 2, WIDTH, HEIGHT - GROUND)
  line(ctx, [[0, GROUND + 2], [WIDTH, GROUND + 2]], '#73834a44')
  for (let i = 0; i < 4; i++) line(ctx, [[0, GROUND + 18 + i * i * 6], [WIDTH, GROUND + 18 + i * i * 6]], '#7b8c4312')
  for (let i = -10; i < 30; i++) line(ctx, [[600 + i * 65, GROUND + 2], [600 + i * 100, HEIGHT]], '#7b8c4312')

  for (const [index, city] of game.cities.entries()) {
    if (!city.alive) {
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = '#3a3723'
        ctx.fillRect(city.x - 30 + i * 8, GROUND - (i % 3 + 1) * 3, 6, (i % 3 + 1) * 3)
      }
      text(ctx, 'OFFLINE', city.x, GROUND + 28, '#846653', 8, 'center')
      continue
    }
    glow(ctx, city.x, GROUND - 7, 60, '#bbda6414')
    const buildings = [18, 30, 23, 43, 35, 20, 27]
    for (let j = 0; j < buildings.length; j++) {
      const h = buildings[(j + index * 2) % buildings.length]!
      const x = city.x - 34 + j * 10
      ctx.fillStyle = '#333e23'
      ctx.fillRect(x, GROUND - h, 9, h)
      ctx.fillStyle = '#a2b869'
      ctx.fillRect(x, GROUND - h, 9, 1)
      for (let wy = GROUND - h + 5; wy < GROUND - 4; wy += 7) {
        ctx.fillStyle = ((j + wy + index) % 3) ? '#a3bc6b88' : '#66784066'
        ctx.fillRect(x + 2, wy, 2, 2)
        ctx.fillRect(x + 6, wy, 1, 2)
      }
    }
    line(ctx, [[city.x - 1, GROUND - 43], [city.x - 1, GROUND - 53]], '#a2b869', 1)
    ctx.fillStyle = GREEN
    ctx.fillRect(city.x - 2, GROUND - 54, 3, 2)
    text(ctx, city.name, city.x, GROUND + 28, '#899771', 8, 'center')
    ctx.fillStyle = '#b9d47a'
    ctx.fillRect(city.x - 2, GROUND + 37, 3, 3)
  }

  for (const [index, battery] of game.batteries.entries()) {
    const active = game.selected === index || game.selected === -1
    const color = !battery.alive ? '#695344' : active ? GREEN : '#7e8f61'
    if (battery.alive) glow(ctx, battery.x, GROUND - 15, 65, active ? '#c9ec7320' : '#c9ec7308')
    ctx.fillStyle = battery.alive ? '#4f6030' : '#393124'
    ctx.beginPath()
    ctx.moveTo(battery.x - 37, GROUND + 1)
    ctx.lineTo(battery.x - 22, GROUND - 18)
    ctx.lineTo(battery.x + 22, GROUND - 18)
    ctx.lineTo(battery.x + 37, GROUND + 1)
    ctx.closePath()
    ctx.fill()
    line(ctx, [[battery.x - 37, GROUND], [battery.x - 22, GROUND - 18], [battery.x + 22, GROUND - 18], [battery.x + 37, GROUND]], color)
    if (battery.alive) {
      const angle = Math.atan2(game.aim.y - battery.y, game.aim.x - battery.x)
      line(ctx, [[battery.x, GROUND - 20], [battery.x + Math.cos(angle) * 19, GROUND - 20 + Math.sin(angle) * 19]], color, 4)
      ctx.fillStyle = color
      ctx.fillRect(battery.x - 8, GROUND - 23, 16, 7)
    }
    text(ctx, `0${index + 1} / ${battery.name}`, battery.x, GROUND + 29, color, 9, 'center')
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = battery.ammo > i * 2 ? color : '#333c29'
      ctx.fillRect(battery.x - 26 + i * 6, GROUND + 38, 4, 5)
    }
  }

  if (game.phase === 'ready') {
    const demos = [
      { x1: 114, y1: 35, x2: 266, y2: 265, p: 0.75 },
      { x1: 894, y1: 0, x2: 787, y2: 256, p: 0.67 },
      { x1: 1069, y1: 69, x2: 973, y2: 295, p: 0.93 },
      { x1: 400, y1: 0, x2: 441, y2: 115, p: 0.62 },
    ]
    demos.forEach((demo, i) => {
      const p = demo.p + Math.sin(time * 0.25 + i) * 0.07
      const x = demo.x1 + (demo.x2 - demo.x1) * p
      const y = demo.y1 + (demo.y2 - demo.y1) * p
      const trail = ctx.createLinearGradient(demo.x1, demo.y1, x, y)
      trail.addColorStop(0, '#ee906b00')
      trail.addColorStop(1, '#ee906b99')
      line(ctx, [[demo.x1, demo.y1], [x, y]], trail, 1.3)
      glow(ctx, x, y, 13, '#ee906b50')
      ctx.fillStyle = '#f0a787'
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3)
      if (i === 0 || i === 2) {
        text(ctx, `TRK 00${i + 1}`, x + 12, y - 5, '#b9866377', 8)
        line(ctx, [[x - 7, y - 12], [x - 12, y - 12], [x - 12, y - 7]], '#c8915966')
        line(ctx, [[x + 7, y + 12], [x + 12, y + 12], [x + 12, y + 7]], '#c8915966')
      }
    })
    line(ctx, [[84, GROUND - 30], [230, 300]], '#d4ec9a44', 1)
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

  for (const missile of [...game.enemies, ...game.missiles]) {
    const friendly = !game.enemies.includes(missile)
    const color = friendly ? GREEN : ORANGE
    const trail = ctx.createLinearGradient(missile.from.x, missile.from.y, missile.x, missile.y)
    trail.addColorStop(0, friendly ? '#d6ee9c05' : '#ee906b0a')
    trail.addColorStop(1, friendly ? '#d6ee9cbb' : '#ee906bdd')
    line(ctx, [[missile.from.x, missile.from.y], [missile.x, missile.y]], trail, friendly ? 1.5 : 1.2)
    glow(ctx, missile.x, missile.y, friendly ? 10 : 13, friendly ? '#d6ee9c50' : '#ee906b60')
    ctx.fillStyle = color
    ctx.fillRect(missile.x - 2, missile.y - 2, 4, 4)
    if (friendly) {
      line(ctx, [[missile.target.x - 4, missile.target.y - 4], [missile.target.x + 4, missile.target.y + 4]], '#d6ee9c66')
      line(ctx, [[missile.target.x + 4, missile.target.y - 4], [missile.target.x - 4, missile.target.y + 4]], '#d6ee9c66')
    } else if (missile.split) {
      ctx.strokeStyle = ORANGE
      ctx.strokeRect(missile.x - 5, missile.y - 5, 10, 10)
    }
  }

  for (const blast of game.blasts) {
    const radius = Math.max(0, blast.radius)
    if (!radius) continue
    const color = blast.friendly ? GREEN : ORANGE
    glow(ctx, blast.x, blast.y, radius * 1.5, blast.friendly ? '#cde89428' : '#f5986b40')
    ctx.beginPath()
    ctx.arc(blast.x, blast.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = blast.friendly ? '#d6ee9c12' : '#ee906b20'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(blast.x, blast.y, radius * 0.87, 0, Math.PI * 2)
    ctx.strokeStyle = blast.friendly ? '#d6ee9c40' : '#ee906b66'
    ctx.lineWidth = 1
    ctx.stroke()
    if (blast.age < 0.15) glow(ctx, blast.x, blast.y, 18, '#fffddd99')
    if (blast.chain > 1) text(ctx, `×${blast.chain}`, blast.x, blast.y + 3, GREEN, 12, 'center')
  }

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
      line(ctx, [[x + direction * 6, y], [x + direction * 17, y]], GREEN)
      line(ctx, [[x, y + direction * 6], [x, y + direction * 17]], GREEN)
    }
    ctx.fillStyle = GREEN
    ctx.fillRect(x - 1, y - 1, 2, 2)
  }

  // A light scan-line texture gives the display a restrained CRT finish.
  ctx.fillStyle = '#0000000b'
  for (let y = 0; y < HEIGHT; y += 4) ctx.fillRect(0, y, WIDTH, 1)
  text(ctx, 'TERRAIN MAPPING ACTIVE', 21, HEIGHT - 15, '#566347', 8)
  text(ctx, 'MC—84 / DEFENSE GRID', WIDTH - 21, HEIGHT - 15, '#566347', 8, 'right')
  ctx.restore()
}
