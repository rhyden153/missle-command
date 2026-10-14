# Missile Command

A playable arcade defense game built with Nuxt 4, Vue 3, TypeScript, and Canvas 2D. Defend six cities with three missile batteries across increasingly difficult waves.

## Run locally

Use Node.js 22.18+ or 24+.

```sh
npm install
npm run dev
```

Open `http://localhost:3000`, then choose **Start defense** or press **Enter**.

## Controls

| Input | Action |
| --- | --- |
| Mouse / arrow keys | Aim |
| Click / tap / Space | Fire |
| 1, 2, 3 | Select Alpha, Bravo, or Charlie |
| A | Automatically select a stocked battery, with wider coverage for Alpha and Charlie |
| P / Escape | Pause or resume |
| M | Toggle sound |
| Enter | Start or play again |

Each battery holds 18 missiles and rearms between waves, even if it was hit. Cities stay destroyed. Intercepted threats create additional explosions; chain reactions multiply the score. Surviving cities award 100 points each at the end of a wave, plus 5 for every unused missile. Splitting missiles appear from wave 3.

Destroyed cities produce an expanding nuclear fireball and a rising mushroom cloud that cools into smoke over 5.5 seconds, leaving a crater that remains through later waves until a new game starts. City destruction plays `assets/city-explosion.mp3` through the existing sound controls. All city explosions finish before the next-wave screen and its countdown appear. The final city's animation finishes before the game-over panel appears.

The game pauses when its tab is hidden or the field manual opens. High scores and sound preferences are saved in local storage. Sound starts muted. Fonts are bundled locally; no accounts, API keys, or external services are needed to play.

Airborne detonations and chain reactions use red-orange fireballs that cool into smoke within the existing blast radius and lifetime. They play `assets/air-explosion.mp3` through the same pause, mute, and restart controls.

Destroyed batteries use the same nuclear fireball and mushroom cloud at 60% of the city effect's size, playing `assets/battery-explosion.mp3`. Their animations finish before the next-wave screen, and batteries still rearm for the following wave.

Firing a missile plays `assets/launch-thud.mp3`, with the same mute, pause, and restart behavior as the explosion samples.

## Checks

```sh
npm test
npm run typecheck
npm run build
npm run test:browser
```

The engine tests cover targeting, ammunition, interceptions, chain reactions, pause, city destruction, wave progression, splitting missiles, and game over. Browser tests run against the production build using an installed Google Chrome and start a local server automatically. They cover desktop controls, touch input, saved preferences, fullscreen, and responsive layouts. Screenshots and traces go into the ignored `.cache` directory.

To preview the production build manually, run `npm run preview`.

## Project structure

The simulation compacts entity arrays in place and reuses scratch lists while preserving collision order and random-number use. The renderer shares fixed scenery geometry, star data, and explosion palettes. HUD snapshots reuse unchanged data, and paused or otherwise static scenes redraw only when needed. Audio samples share one loader; stopping playback immediately disconnects active sources, and disposal aborts pending loads and releases decoded buffers.

- `app/app.vue` — interface, input handling, and browser lifecycle
- `app/game/engine.ts` — game simulation, independent of the UI
- `app/game/renderer.ts` — battlefield, terrain, cities, missiles, and effects
- `app/game/audio.ts` — synthesized sound effects and city explosion sample playback
- `app/assets/main.css` — typography and responsive styles
- `tests/` — engine and browser checks
