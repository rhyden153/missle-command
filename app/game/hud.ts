import type { Battery, MissileCommand, Phase } from './engine'

export type HudState = {
  phase: Phase; score: number; best: number; wave: number; intercepted: number
  citiesAlive: number; totalAmmo: number; groundExplosionActive: boolean
  selected: number; incoming: number; notice: string; intermission: number
  batteries: Pick<Battery, 'name' | 'ammo' | 'alive'>[]
  cities: { alive: boolean }[]
}

/** Publish immutable UI snapshots only when something displayed has changed. */
export function readHudState(game: MissileCommand, previous?: HudState): HudState {
  const citiesAlive = game.citiesAlive
  const totalAmmo = game.totalAmmo
  const groundExplosionActive = game.cityExplosions.length > 0 || game.batteryExplosions.length > 0
  const incoming = game.incoming + game.enemies.length
  const notice = game.noticeTime > 0 ? game.notice : ''
  const intermission = Math.ceil(game.intermission)
  let sameBatteries = previous?.batteries.length === game.batteries.length
  let sameCities = previous?.cities.length === game.cities.length
  if (sameBatteries) {
    for (let i = 0; i < game.batteries.length; i++) {
      const battery = game.batteries[i]!, saved = previous!.batteries[i]!
      if (battery.name !== saved.name || battery.ammo !== saved.ammo || battery.alive !== saved.alive) { sameBatteries = false; break }
    }
  }
  if (sameCities) {
    for (let i = 0; i < game.cities.length; i++) {
      if (game.cities[i]!.alive !== previous!.cities[i]!.alive) { sameCities = false; break }
    }
  }
  if (previous && sameBatteries && sameCities
    && previous.phase === game.phase && previous.score === game.score && previous.best === game.best
    && previous.wave === game.wave && previous.intercepted === game.intercepted
    && previous.citiesAlive === citiesAlive && previous.totalAmmo === totalAmmo
    && previous.groundExplosionActive === groundExplosionActive && previous.selected === game.selected
    && previous.incoming === incoming && previous.notice === notice && previous.intermission === intermission) return previous
  return {
    phase: game.phase, score: game.score, best: game.best, wave: game.wave, intercepted: game.intercepted,
    citiesAlive, totalAmmo, groundExplosionActive, selected: game.selected, incoming, notice, intermission,
    batteries: sameBatteries ? previous!.batteries : game.batteries.map(({ name, ammo, alive }) => ({ name, ammo, alive })),
    cities: sameCities ? previous!.cities : game.cities.map(({ alive }) => ({ alive })),
  }
}
