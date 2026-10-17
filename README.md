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

Each battery starts with 18 missiles and rearms between waves, even if it was hit. Intercepted threats create additional explosions; chain reactions multiply the score. Surviving cities award 100 points each at the end of a wave, plus 5 for every unused missile. Splitting missiles appear from wave 3.

Every 100,000 points increases total ammunition capacity by another 10%, compounded from the starting 54 shots and rounded to whole shots: 59 at 100,000, 65 at 200,000, 72 at 300,000, and so on. Capacity is distributed as evenly as possible across the three batteries. Surviving batteries immediately receive their additional shots; destroyed batteries receive the upgraded capacity when they rearm. The larger capacity lasts for the rest of the game, and ammo meters scale to it.

Every 150,000 points earns one bonus city. It restores a destroyed city after that city's nuclear explosion finishes. If all six cities are standing, the bonus stays in reserve, displayed beneath the battery controls, until a city is lost. Reserves stack, and the game continues while a reserve city is waiting to deploy, even if the last standing city was just destroyed. Combat scores and wave survival bonuses both count toward milestones, including when one award crosses several thresholds. A reinforcement notice and chime announce the rewards. New games reset ammo capacity and reserves.

Bombers enter in wave 3, UFOs in wave 4, and guided bombs in wave 5, initially one of each. Each type gains another every three waves, capped at three bombers, three UFOs, and five guided bombs. These replace ordinary missiles within the existing `10 + wave * 3` launch budget. Each aircraft crosses from either edge and carries exactly one reserved, non-splitting missile. Destroying it before release prevents that missile; destroying it afterward leaves the dropped missile in flight. Existing splitting-missile behavior stays the same.

Guided bombs steer away from nearby defensive explosions with limited turn speed and 1.35 seconds of evasion reserve. They always move toward the ground and remain vulnerable to direct hits and overlapping blasts. Aircraft and guided bombs award 100 points times the wave and chain multiplier; ordinary missiles retain their existing 25-point base value. An aircraft destroyed after dropping its missile awards points without counting its payload as intercepted.

Choose **Classic** or **Modern** under **Threat sprites + sound** in the mission panel. Classic uses pixel sprites and square-wave propeller pulses, saucer bleeps, and guidance chirps. Modern uses shaded aircraft, a lit saucer, a finned guided bomb, jet rumble, electronic warbles, and tracking sweeps. Missile drops have a separate descending whistle. The setting is saved locally. These synthesized effects share the existing mute, pause, and restart controls and need no additional downloads.

Destroyed cities produce an expanding nuclear fireball and a rising mushroom cloud that cools into smoke over 5.5 seconds, leaving a crater that remains through later waves until a bonus city restores the site or a new game starts. City destruction plays `assets/city-explosion.mp3` through the existing sound controls. All city explosions finish before the next-wave screen and its countdown appear. The final city's animation finishes before the game-over panel appears.

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

Threat regression tests verify wave budgets, progressive introductions, single aircraft drops in both directions, payload cancellation, HUD counts, guided evasion and interception, departure before wave completion, both sprite sets, and both audio palettes.

To preview the production build manually, run `npm run preview`.

## Project structure

The simulation compacts entity arrays in place and reuses scratch lists while preserving collision order and random-number use. The renderer shares fixed scenery geometry, star data, and explosion palettes. HUD snapshots reuse unchanged data, and paused or otherwise static scenes redraw only when needed. Audio samples share one loader; stopping playback immediately disconnects active sources, and disposal aborts pending loads and releases decoded buffers.

- `app/app.vue` — interface, input handling, and browser lifecycle
- `app/game/engine.ts` — game simulation, independent of the UI
- `app/game/renderer.ts` — battlefield, terrain, cities, missiles, and effects
- `app/game/audio.ts` — synthesized sound effects and city explosion sample playback
- `app/assets/main.css` — typography and responsive styles
- `tests/` — engine and browser checks
