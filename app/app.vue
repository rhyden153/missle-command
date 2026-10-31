<script setup lang="ts">
import { MissileCommand, WIDTH, HEIGHT, FINAL_WAVE, VICTORY_DURATION } from './game/engine'
import { renderBattlefield } from './game/renderer'
import { GameAudio } from './game/audio'
import { readHudState } from './game/hud'
import cityExplosionUrl from '../assets/city-explosion.mp3?url'
import airExplosionUrl from '../assets/air-explosion.mp3?url'
import batteryExplosionUrl from '../assets/battery-explosion.mp3?url'
import launchThudUrl from '../assets/launch-thud.mp3?url'

useHead({
  title: 'Missile Command — The last line of defense',
  meta: [{ name: 'description', content: 'Six cities. Three batteries. One last line of defense. Play a modern take on the Missile Command arcade game.' }, { name: 'theme-color', content: '#10120f' }],
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
})

const game = new MissileCommand()
const canvas = ref<HTMLCanvasElement | null>(null)
const arena = ref<HTMLElement | null>(null)
const helpDialog = ref<HTMLDialogElement | null>(null)
const scoresDialog = ref<HTMLDialogElement | null>(null)
const { boards, failed, refresh, recordGame } = useLeaderboard()
const scoreTab = ref<LeaderboardName>('weekly')
const qualified = ref<LeaderboardName[]>([])
let runId = 0
let recordedRun = -1
let pausedForScores = false
const globalScores = computed(() => boards.value?.[scoreTab.value] ?? [])

async function recordFinishedGame() {
  if (!['gameover', 'victory'].includes(game.phase) || game.cityExplosions.length || game.batteryExplosions.length || recordedRun === runId) return
  recordedRun = runId
  if (game.score <= 0) return
  const finishedRun = runId
  const names = await recordGame(game.score)
  if (runId === finishedRun) qualified.value = names
}

function openScores() {
  pausedForScores = game.phase === 'playing' || game.phase === 'intermission'
  audio.stop()
  if (pausedForScores) { game.pause(); sync() }
  scoresDialog.value?.showModal()
  void refresh()
}

function onScoresClosed() {
  if (pausedForScores && game.phase === 'paused') { audio.unlock(); game.pause(); sync() }
  pausedForScores = false
  if (active.value) nextTick(() => canvas.value?.focus({ preventScroll: true }))
}
const audio = new GameAudio(cityExplosionUrl, airExplosionUrl, batteryExplosionUrl, launchThudUrl)
const soundEnabled = ref(true)
const isFullscreen = ref(false)
const fullscreenSupported = ref(false)
const fullscreenError = ref('')
const isLoaded = ref(false)
const state = shallowRef(readHudState(game))
const formatScore = (score: number) => String(score).padStart(6, '0')
const active = computed(() => ['playing', 'paused', 'intermission'].includes(state.value.phase))
const status = computed(() => ({ ready: 'AWAITING COMMAND', playing: 'DEFENSE ACTIVE', paused: 'SYSTEM PAUSED', intermission: 'SECTOR SECURED', gameover: 'SIGNAL LOST', victory: 'MISSION COMPLETE' })[state.value.phase])
const missionLabel = computed(() => ({ ready: 'Standing by, commander.', playing: 'Make every shot count.', paused: 'Take a breath, commander.', intermission: 'A moment to breathe.', gameover: 'A valiant last stand.', victory: 'You did it, commander!' })[state.value.phase])
let animation = 0
let resizeObserver: ResizeObserver | undefined
let persistedBest = 0
let lastFrame = 0
let lastSync = 0
let reducedMotion = false
let pausedForHelp = false
let needsRedraw = true

function sync() {
  audio.syncThreats(game)
  void recordFinishedGame()
  const next = readHudState(game, state.value)
  if (next !== state.value) { state.value = next; needsRedraw = true }
  if (game.best > persistedBest) {
    persistedBest = game.best
    try { localStorage.setItem('missile-command-best', String(game.best)) } catch { /* Storage is optional. */ }
  }
}

function start() {
  runId++
  qualified.value = []
  audio.stop()
  audio.unlock()
  game.start()
  sync()
  nextTick(() => canvas.value?.focus({ preventScroll: true }))
}

function pause() {
  if (!active.value) return
  audio.stop()
  audio.unlock()
  game.pause()
  sync()
  if (game.phase !== 'paused') nextTick(() => canvas.value?.focus({ preventScroll: true }))
}

function selectBattery(index: number) {
  game.selectBattery(index)
  sync()
  if (active.value) canvas.value?.focus({ preventScroll: true })
}

function toggleSound() {
  soundEnabled.value = !soundEnabled.value
  audio.muted = !soundEnabled.value
  audio.unlock()
  if (soundEnabled.value) audio.play(game.phase === 'victory' ? 'victory' : 'launch')
  try { localStorage.setItem('missile-command-sound', String(soundEnabled.value)) } catch { /* Storage is optional. */ }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await arena.value?.requestFullscreen()
    fullscreenError.value = ''
  } catch { fullscreenError.value = 'Fullscreen is unavailable in this browser window.' }
}

function openHelp() {
  pausedForHelp = game.phase === 'playing' || game.phase === 'intermission'
  if (game.phase === 'victory') audio.stop()
  if (pausedForHelp) { audio.stop(); game.pause(); sync() }
  helpDialog.value?.showModal()
}

function closeHelp() { helpDialog.value?.close() }
function onHelpClosed() {
  if (pausedForHelp && game.phase === 'paused') {
    audio.unlock()
    game.pause()
    sync()
    nextTick(() => canvas.value?.focus({ preventScroll: true }))
  }
  pausedForHelp = false
}

function aim(event: PointerEvent) {
  const rect = canvas.value?.getBoundingClientRect()
  if (!rect) return
  game.aim.x = Math.max(8, Math.min(WIDTH - 8, (event.clientX - rect.left) / rect.width * WIDTH))
  game.aim.y = Math.max(20, Math.min(HEIGHT - 124, (event.clientY - rect.top) / rect.height * HEIGHT))
  game.aimVisible = true
  needsRedraw = true
}

function fire(event: PointerEvent) {
  if (event.button !== 0) return
  aim(event)
  audio.unlock()
  canvas.value?.focus({ preventScroll: true })
  game.fire(game.aim.x, game.aim.y)
  sync()
}

function keydown(event: KeyboardEvent) {
  if (helpDialog.value?.open || scoresDialog.value?.open || event.ctrlKey || event.metaKey || event.altKey) return
  const key = event.key.toLowerCase()
  const target = event.target as HTMLElement | null
  if (target?.closest('input, select, textarea, [contenteditable="true"]')) return
  if (target?.closest('button, a') && [' ', 'enter'].includes(key)) return
  if (game.phase === 'playing' && [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault()
  if (key.startsWith('arrow') && game.phase === 'playing') {
    game.aimVisible = true
    game.aim.x = Math.max(10, Math.min(WIDTH - 10, game.aim.x + (key === 'arrowleft' ? -18 : key === 'arrowright' ? 18 : 0)))
    game.aim.y = Math.max(20, Math.min(HEIGHT - 124, game.aim.y + (key === 'arrowup' ? -18 : key === 'arrowdown' ? 18 : 0)))
    return
  }
  if (event.repeat) return
  if (key === 'enter' && (game.phase === 'ready' || game.phase === 'gameover' || game.phase === 'victory')) start()
  else if (key === 'p' || key === 'escape') pause()
  else if (key === 'm') toggleSound()
  else if (['1', '2', '3'].includes(key)) selectBattery(Number(key) - 1)
  else if (key === 'a') selectBattery(-1)
  else if (key === 'r' && (game.phase === 'gameover' || game.phase === 'victory')) start()
  else if (key === ' ' && game.phase === 'playing') { audio.unlock(); game.fire(game.aim.x, game.aim.y); sync() }
}

function onVisibilityChange() {
  if (!document.hidden) return
  audio.stop()
  if (game.phase === 'playing' || game.phase === 'intermission') { game.pause(); sync() }
}
function onFullscreenChange() { isFullscreen.value = !!document.fullscreenElement }

onMounted(() => {
  try {
    const savedBest = Number(localStorage.getItem('missile-command-best'))
    game.best = Number.isFinite(savedBest) && savedBest > 0 ? Math.floor(savedBest) : 0
    persistedBest = game.best
    soundEnabled.value = localStorage.getItem('missile-command-sound') !== 'false'
    audio.muted = !soundEnabled.value
  } catch { /* Private browsing can disable local storage. */ }
  game.onEvent = event => audio.play(event)
  fullscreenSupported.value = !!document.fullscreenEnabled
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const ctx = canvas.value?.getContext('2d')
  let renderedWidth = -1, renderedHeight = -1
  const resize = () => {
    if (!canvas.value || !ctx) return
    const bounds = canvas.value.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.round(bounds.width * dpr), height = Math.round(bounds.height * dpr)
    if (renderedWidth === width && renderedHeight === height) return
    if (canvas.value.width !== width) canvas.value.width = width
    if (canvas.value.height !== height) canvas.value.height = height
    renderedWidth = width
    renderedHeight = height
    ctx.setTransform(canvas.value.width / WIDTH, 0, 0, canvas.value.height / HEIGHT, 0, 0)
    renderBattlefield(ctx, game, reducedMotion)
    needsRedraw = false
  }
  resizeObserver = new ResizeObserver(resize)
  if (canvas.value) resizeObserver.observe(canvas.value)
  resize()
  const frame = (now: number) => {
    const dt = lastFrame ? (now - lastFrame) / 1000 : 0
    lastFrame = now
    const phase = game.phase
    const animate = phase !== 'paused' && (phase === 'playing' || (phase === 'ready' && !reducedMotion)
      || (phase === 'victory' && game.victoryTime < VICTORY_DURATION && !reducedMotion)
      || game.shake > 0 || game.blasts.length > 0 || game.particles.length > 0
      || game.cityExplosions.length > 0 || game.batteryExplosions.length > 0)
    game.update(dt)
    audio.syncThreats(game)
    if (ctx && (needsRedraw || animate || phase !== game.phase)) {
      renderBattlefield(ctx, game, reducedMotion)
      needsRedraw = false
    }
    if (now - lastSync > 75) { sync(); lastSync = now }
    animation = requestAnimationFrame(frame)
  }
  animation = requestAnimationFrame(frame)
  window.addEventListener('keydown', keydown)
  document.addEventListener('visibilitychange', onVisibilityChange)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  isLoaded.value = true
  sync()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animation)
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', keydown)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  game.onEvent = undefined
  audio.dispose()
})
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <a href="/" class="brand" aria-label="Missile Command home">
        <span class="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m8 24 5-12L26 5l-7 13-11 6Z" fill="currentColor" /><path d="m13 12-6 1-4 6 7-1m9 0-1 7-6 4 1-8M7 25l-3 3m4-7-6 6" stroke="currentColor" stroke-width="1.5" /><circle cx="20" cy="11" r="2" fill="#11150f" /></svg></span>
        <span class="brand-name">NEO<span class="brand-slash">/</span>Missle Command<span class="brand-subtitle">ARCADE DEFENSE SYSTEM</span></span>
      </a>
      <div class="header-system"><span class="status-dot" /> ALL SYSTEMS OPERATIONAL <span class="system-divider">/</span> <span class="muted-text">V. 1.0</span></div>
      <div class="header-actions">
        <button class="text-button scores-button" aria-label="High scores" @click="openScores"><AppIcon name="trophy" :size="15" /><span>High scores</span></button>
        <button class="text-button help-button" @click="openHelp"><AppIcon name="info" :size="15" /> How to play</button>
        <span class="header-separator" />
        <button class="icon-button sound-button" :aria-label="soundEnabled ? 'Mute sound' : 'Enable sound'" :aria-pressed="soundEnabled" :title="soundEnabled ? 'Mute sound (M)' : 'Enable sound (M)'" @click="toggleSound"><AppIcon :name="soundEnabled ? 'sound' : 'muted'" :size="18" /><span>SOUND {{ soundEnabled ? 'ON' : 'OFF' }}</span></button>
      </div>
    </header>

    <main class="main-content">
      <section class="hero" aria-labelledby="game-title">
        <div><div class="eyebrow"><span class="small-cross">+</span> THE ORIGINAL, REARMED</div><h1 id="game-title">MISSILE COMMAND</h1><p class="hero-description">Six cities. Three batteries. One last line of defense.</p></div>
        <div class="personal-best"><span class="best-icon"><AppIcon name="trophy" :size="20" /></span><div><span class="micro-label">PERSONAL BEST</span><span class="best-score">{{ formatScore(state.best) }}</span></div><span class="best-local">SAVED<br>LOCALLY</span></div>
      </section>

      <div class="command-layout">
        <section ref="arena" class="arena" aria-label="Missile Command game">
          <div class="arena-hud">
            <div class="hud-stat wave-stat"><span class="micro-label">WAVE</span><div><span class="hud-value">{{ String(state.wave).padStart(2, '0') }}</span><span class="wave-slashes">///</span></div></div>
            <div class="hud-stat score-stat"><span class="micro-label">SCORE</span><span class="hud-value">{{ formatScore(state.score) }}</span></div>
            <div class="hud-stat cities-stat"><span class="micro-label">CITIES ONLINE</span><span class="hud-value">{{ state.citiesAlive }}<span class="value-denominator">/ {{ state.cities.length }}</span><span class="mini-cities"><i v-for="(city, index) in state.cities" :key="index" :class="{ lost: !city.alive }" /></span></span></div>
            <div class="hud-tools"><span class="live-indicator" :class="{ 'is-active': state.phase === 'playing', 'is-lost': state.phase === 'gameover', 'is-victorious': state.phase === 'victory' }"><span class="status-dot" />{{ state.phase === 'ready' ? 'STANDBY' : state.phase === 'playing' ? 'LIVE' : state.phase === 'paused' ? 'PAUSED' : state.phase === 'intermission' ? 'CLEAR' : state.phase === 'victory' ? 'VICTORY' : 'OFFLINE' }}</span><button class="icon-button arena-tool" :disabled="!active" :aria-label="state.phase === 'paused' ? 'Resume game' : 'Pause game'" title="Pause / resume (P)" @click="pause"><AppIcon :name="state.phase === 'paused' ? 'play' : 'pause'" :size="17" /></button><button v-if="fullscreenSupported" class="icon-button arena-tool fullscreen-button" :aria-label="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'" @click="toggleFullscreen"><AppIcon :name="isFullscreen ? 'collapse' : 'expand'" :size="17" /></button></div>
          </div>
          <div class="battlefield" :class="{ 'is-playing': state.phase === 'playing' }">
            <canvas ref="canvas" tabindex="0" role="application" aria-label="Missile Command battlefield. Aim with your mouse or arrow keys. Click, tap, or press Space to fire. Press P to pause." aria-describedby="game-controls" @pointermove="aim" @pointerdown.prevent="fire" @pointerleave="game.aimVisible = false" @contextmenu.prevent />
            <div v-if="state.phase === 'ready'" class="game-overlay ready-overlay">
              <div class="intro-reticle"><AppIcon name="crosshair" :size="28" /></div><span class="overlay-eyebrow">EARTH'S LAST LINE OF DEFENSE</span><h2>EVERY CITY<br>COUNTS.</h2><p>Clear all {{ FINAL_WAVE }} waves. Bring everyone home.</p>
              <button class="primary-button start-button" :disabled="!isLoaded" @click="start">{{ isLoaded ? 'START DEFENSE' : 'INITIALIZING' }}<AppIcon name="arrow" :size="18" /></button><span class="start-hint">OR PRESS <kbd>ENTER</kbd> TO BEGIN</span>
            </div>
            <div v-else-if="state.phase === 'paused'" class="game-overlay pause-overlay"><span class="overlay-eyebrow">TRANSMISSION ON HOLD</span><h2>STAND BY.</h2><p>Your cities can wait a moment.</p><button class="primary-button" @click="pause">RESUME DEFENSE<AppIcon name="play" :size="17" /></button><button class="overlay-secondary" @click="start"><AppIcon name="restart" :size="14" /> Start a new game</button></div>
            <div v-else-if="state.phase === 'victory'" class="game-overlay victory-overlay" aria-labelledby="victory-title">
              <div class="victory-medal" aria-hidden="true"><span class="victory-orbit" /><span class="victory-star star-one">&#10022;</span><span class="victory-star star-two">&#10022;</span><span class="victory-star star-three">&#10022;</span><AppIcon name="trophy" :size="42" /></div>
              <span class="overlay-eyebrow" role="status">ALL {{ FINAL_WAVE }} WAVES CLEARED</span>
              <h2 id="victory-title">VICTORY!</h2>
              <p class="victory-message">The sky is yours. Let the cities celebrate.</p>
              <div class="victory-stats"><div><span class="micro-label">FINAL SCORE</span><strong>{{ formatScore(state.score) }}</strong></div><div><span class="micro-label">CITIES SAVED</span><strong>{{ state.citiesAlive }}<small> / 6</small></strong></div><div><span class="micro-label">INTERCEPTED</span><strong>{{ state.intercepted }}</strong></div></div>
              <LeaderboardSubmission v-if="qualified.length" :key="runId" :score="state.score" :detail="`Victory · Wave ${state.wave}`" :names="qualified" @skip="qualified = []" /><button class="primary-button victory-button" @click="start">PLAY AGAIN<AppIcon name="restart" :size="17" /></button>
              <span class="start-hint">EARTH SALUTES YOU, COMMANDER.</span>
            </div>
            <div v-else-if="state.phase === 'gameover' && !state.groundExplosionActive" class="game-overlay gameover-overlay"><span class="overlay-eyebrow">ALL CITIES LOST · WAVE {{ String(state.wave).padStart(2, '0') }}</span><h2>THE LAST<br>LIGHT FADES.</h2><div class="final-score"><span class="micro-label">FINAL SCORE</span><strong>{{ formatScore(state.score) }}</strong></div><p>{{ state.intercepted }} threats intercepted. One more stand?</p><LeaderboardSubmission v-if="qualified.length" :key="runId" :score="state.score" :detail="`Wave ${state.wave}`" :names="qualified" @skip="qualified = []" /><button class="primary-button" @click="start">DEFEND AGAIN<AppIcon name="restart" :size="17" /></button></div>
            <div v-else-if="state.phase === 'intermission'" class="wave-overlay" role="status"><AppIcon name="shield" :size="28" /><span class="overlay-eyebrow">WAVE {{ String(state.wave).padStart(2, '0') }} COMPLETE</span><h2>STILL STANDING.</h2><p>Batteries rearming. Next wave in {{ state.intermission }}.</p></div>
            <div v-if="state.notice && state.phase === 'playing'" class="game-notice" role="status"><span class="status-dot" />{{ state.notice }}</div><span class="field-corner top-left" /><span class="field-corner top-right" /><span class="field-corner bottom-left" /><span class="field-corner bottom-right" />
          </div>
          <div class="arena-status"><span :class="{ 'status-alert': state.phase === 'gameover' }"><span class="status-dot" />{{ status }}</span><span v-if="state.phase === 'playing'">{{ state.incoming }} THREATS REMAINING</span><span v-else-if="state.phase === 'victory'">ALL {{ FINAL_WAVE }} WAVES CLEARED</span><span v-else>PROTECT. INTERCEPT. SURVIVE.</span><span class="connection-bars"><i /><i /><i /><i /> <span>60 HZ</span></span></div><p v-if="fullscreenError" class="fullscreen-error" role="status">{{ fullscreenError }}</p>
        </section>

        <aside class="command-sidebar" aria-label="Mission and battery controls">
          <section class="mission-panel"><div class="panel-heading"><span class="micro-label">MISSION BRIEFING</span><AppIcon name="crosshair" :size="16" /></div><h2>Hold the line<span>.</span></h2><p>Intercept incoming missiles.<br>Keep your cities alive.<br>Survive all {{ FINAL_WAVE }} waves.</p><div class="mission-tip"><AppIcon name="bolt" :size="16" /><p>One well-placed explosion can start a <strong>chain reaction.</strong></p></div></section>
          <section class="battery-panel">
            <div class="panel-heading"><span class="micro-label">MISSILE BATTERIES</span><span class="ammo-total">{{ state.totalAmmo }}<span> / {{ state.maxAmmo }}</span></span></div>
            <button class="auto-select" :class="{ selected: state.selected === -1 }" :aria-pressed="state.selected === -1" @click="selectBattery(-1)"><span><span class="selection-dot" />Auto-select</span><kbd>A</kbd></button>
            <button v-for="(battery, index) in state.batteries" :key="battery.name" class="battery-button" :class="{ selected: state.selected === index, depleted: !battery.alive || battery.ammo === 0 }" :aria-label="`Select ${battery.name} battery, ${battery.ammo} missiles remaining`" :aria-pressed="state.selected === index" @click="selectBattery(index)"><span class="battery-icon"><svg viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="M4 23h22l-5-6H9l-5 6Zm8-6v-5h6v5m-3-5V5m-3 4 3-4 3 4" stroke="currentColor" stroke-width="1.3" /><path d="M9 26h12" stroke="currentColor" /></svg></span><span class="battery-info"><span class="battery-name">{{ battery.name }}<span>{{ String(battery.ammo).padStart(2, '0') }}</span></span><span class="ammo-meter"><i v-for="n in 9" :key="n" :class="{ filled: battery.ammo / battery.capacity > (n - 1) / 9 }" /></span></span><kbd>{{ index + 1 }}</kbd></button>
            <p class="battery-footnote">Ammunition refills after every wave.<br>+10% shots every 100,000 points.<br>Bonus city every 150,000 points.</p><p v-if="state.bonusCities > 0" class="city-reserves" role="status">{{ state.bonusCities }} BONUS {{ state.bonusCities === 1 ? 'CITY' : 'CITIES' }} IN RESERVE</p>
          </section>
          <div class="sidebar-footer"><span class="status-dot" /><span>{{ missionLabel }}</span><AppIcon name="chevron" :size="14" /></div>
        </aside>
      </div>

      <section id="game-controls" class="controls-strip" aria-label="Game controls"><div class="controls-label"><AppIcon name="keyboard" :size="18" /><span>THE CONTROLS</span></div><div class="control-item"><svg width="16" height="19" viewBox="0 0 16 19" fill="none" aria-hidden="true"><rect x="2" y="1" width="12" height="17" rx="6" stroke="currentColor" /><path d="M8 1v6M2 7h12" stroke="currentColor" /></svg><span>Move to aim <span class="control-plus">/</span> Click to fire</span></div><div class="control-item"><span class="key-group"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span><span>Select battery</span></div><div class="control-item"><kbd>P</kbd><span>Pause</span></div><button class="controls-more" @click="openHelp">All controls<AppIcon name="arrow" :size="15" /></button></section>
      <NeoGamesBanner class="collection-section" />
      <footer class="site-footer"><span>A TRIBUTE TO THE GOLDEN AGE OF ARCADES.</span><span class="footer-center">NO EXTRA LIVES. <span>MAKE THIS ONE COUNT.</span></span><span class="footer-coordinate"><span class="tiny-cross">✳</span> EST. 1980 <span class="footer-slash">/</span> REIMAGINED TODAY</span></footer>
    </main>

    <dialog ref="scoresDialog" class="help-dialog scores-dialog" aria-labelledby="scores-title" @close="onScoresClosed" @click="($event.target === scoresDialog) && scoresDialog?.close()">
      <div class="help-content">
        <div class="panel-heading"><span class="eyebrow">GLOBAL LEADERBOARD</span><button class="icon-button" aria-label="Close high scores" @click="scoresDialog?.close()"><AppIcon name="close" /></button></div>
        <h2 id="scores-title">THE HALL OF FAME.</h2>
        <div class="score-tabs" role="group" aria-label="Leaderboard period"><button v-for="tab in (['weekly', 'allTime'] as const)" :key="tab" class="text-button" :aria-pressed="scoreTab === tab" @click="scoreTab = tab">{{ tab === 'weekly' ? 'This week' : 'All time' }}</button></div>
        <p>{{ scoreTab === 'weekly' ? 'Top 10 defenses. Resets Monday at 00:00 UTC.' : 'The top 10 defenses of all time.' }}</p>
        <div v-if="failed" role="status"><p>Couldn’t reach the leaderboard. Try again.</p><button class="text-button" @click="refresh()">Retry</button></div>
        <p v-else-if="!boards" role="status">Fetching the latest scores…</p>
        <p v-else-if="!globalScores.length">The board is wide open. Make your stand.</p>
        <ol v-if="boards && globalScores.length" class="global-score-list"><li v-for="(entry, index) in globalScores" :key="`${entry.at}-${entry.initials}`"><span>{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ entry.initials }}</strong><div><strong>{{ formatScore(entry.score) }}</strong><small>{{ entry.detail }}</small></div><time :datetime="new Date(entry.at).toISOString()">{{ new Date(entry.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}</time></li></ol>
        <p class="local-best-note">Personal best on this device: {{ formatScore(state.best) }}</p>
      </div>
    </dialog>

    <dialog ref="helpDialog" class="help-dialog" aria-labelledby="help-title" @close="onHelpClosed" @click="($event.target === helpDialog) && closeHelp()"><div class="help-content"><div class="panel-heading"><span class="eyebrow">FIELD MANUAL / 001</span><button class="icon-button" aria-label="Close instructions" @click="closeHelp"><AppIcon name="close" /></button></div><h2 id="help-title">AIM. FIRE. SURVIVE.</h2><p>Defend six cities from the incoming barrage. Clear all {{ FINAL_WAVE }} waves to win. Lose every city with no reserves and the game ends.</p><dl class="help-controls"><div><dt>Move mouse / drag on screen</dt><dd>Aim</dd></div><div><dt>Click / tap / <kbd>SPACE</kbd></dt><dd>Launch missile</dd></div><div><dt>Arrow keys</dt><dd>Move crosshair</dd></div><div><dt><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></dt><dd>Select a battery</dd></div><div><dt><kbd>A</kbd></dt><dd>Auto-select battery</dd></div><div><dt><kbd>P</kbd> / <kbd>ESC</kbd></dt><dd>Pause / resume</dd></div><div><dt><kbd>M</kbd></dt><dd>Toggle sound</dd></div></dl><div class="help-tip"><AppIcon name="bolt" /><p><strong>Aim ahead of the threat.</strong> Your missiles explode at the point you choose. Catch incoming missiles in the blast to set off chain reactions and multiply your points.</p></div><p class="help-detail">Each battery starts with 18 missiles and rearms between waves. Every 100,000 points increases total ammunition capacity by another 10%, compounded and rounded to whole shots, and immediately supplies the extra shots to surviving batteries. Every 150,000 points earns a bonus city: a lost city is restored after its explosion finishes, or the bonus is saved in reserve while all six cities are standing. Surviving cities earn 100 bonus points each, plus 5 for every unused missile. Splitting missiles appear from wave 3. Bombers arrive in wave 3, UFOs in wave 4, and guided bombs in wave 5, then gradually become more common. Each replaces one ordinary missile. Aircraft carry one missile; intercept them before they drop it. Guided bombs can briefly steer around blasts. Aim directly at them or overlap explosions.</p><button class="primary-button" @click="closeHelp">UNDERSTOOD<AppIcon name="arrow" :size="17" /></button></div></dialog>
  </div>
</template>

<style src="./assets/main.css"></style>
