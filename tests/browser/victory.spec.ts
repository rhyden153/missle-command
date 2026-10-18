import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { parse, compileScript } from 'vue/compiler-sfc'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const transpile = (source: string) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText

// Compile the real UI with test-only access to its engine; no production debug hooks.
async function openVictoryFixture(page: Page) {
  await page.route('**/__victory/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/__victory/', '')
    if (path === 'index.html') {
      await route.fulfill({ contentType: 'text/html', body: `
        <link rel="stylesheet" href="./main.css"><div id="app"></div>
        <script type="module">
          import {createApp} from './vue.js'; import App from './app.js'; import AppIcon from './icon.js';
          createApp(App).component('AppIcon',AppIcon).component('NeoGamesBanner',{render:()=>null}).mount('#app');
        </script>` })
    } else if (path === 'vue.js') {
      await route.fulfill({ contentType: 'application/javascript', body: await readFile(require.resolve('vue/dist/vue.esm-browser.prod.js'), 'utf8') })
    } else if (path === 'app.js' || path === 'icon.js') {
      let source = await readFile(path === 'app.js' ? 'app/app.vue' : 'app/components/AppIcon.vue', 'utf8')
      if (path === 'app.js') {
        source = source.replace('<script setup lang="ts">', `<script setup lang="ts">
          import {ref,shallowRef,computed,nextTick,onMounted,onBeforeUnmount} from 'vue'
          const useHead = (_: unknown) => {}
        `).replace('const soundEnabled = ref(true)', 'Object.assign(window, { fixture: { game, audio } })\nconst soundEnabled = ref(true)')
      }
      const { descriptor } = parse(source)
      const compiled = compileScript(descriptor, { id: path, inlineTemplate: true })
      const body = transpile(compiled.content)
        .replaceAll('from "vue"', 'from "./vue.js"').replaceAll("from 'vue'", "from './vue.js'")
        .replace(/from '(.\/game\/\w+)'/g, "from '$1.js'").replaceAll('../assets/', './assets/')
      await route.fulfill({ contentType: 'application/javascript', body })
    } else if (/^game\/(engine|renderer|audio|hud)\.js$/.test(path)) {
      const source = await readFile(`app/${path.replace('.js', '.ts')}`, 'utf8')
      await route.fulfill({ contentType: 'application/javascript', body: transpile(source).replace("from './engine'", "from './engine.js'") })
    } else if (path === 'main.css') {
      const css = (await readFile('app/assets/main.css', 'utf8')).replaceAll("'@fontsource/", "'./fonts/@fontsource/")
      await route.fulfill({ contentType: 'text/css', body: css })
    } else if (path.startsWith('fonts/@fontsource/')) {
      await route.fulfill({ contentType: path.endsWith('.css') ? 'text/css' : 'font/woff2', body: await readFile(`node_modules/${path.slice(6)}`) })
    } else if (/^assets\/[a-z-]+\.mp3$/.test(path)) {
      if (new URL(route.request().url()).searchParams.has('url')) {
        await route.fulfill({ contentType: 'application/javascript', body: `export default '/__victory/${path}'` })
      } else await route.fulfill({ contentType: 'audio/mpeg', body: await readFile(path) })
    } else await route.abort()
  })
  await page.addInitScript(() => {
    ;(window as any).canvasDraws = 0
    const fill = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      ;(window as any).canvasDraws++
      return fill.apply(this, args)
    }
  })
  await page.clock.install()
  await page.goto('/__victory/index.html')
  await expect(page.getByRole('button', { name: 'START DEFENSE' })).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
}

async function clearFinalWave(page: Page) {
  await page.getByRole('button', { name: 'START DEFENSE' }).click()
  await page.evaluate(() => {
    const game = (window as any).fixture.game
    game.wave = 20
    game.incoming = 0
    game.score = 245_000
    game.intercepted = 483
    game.launched = 560
  })
  await page.clock.runFor(150)
  await expect(page.getByRole('heading', { name: 'VICTORY!' })).toBeVisible()
}

test('clearing the finale celebrates, saves the final score, obeys mute, and replays from wave one', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1100 })
  await openVictoryFixture(page)
  await clearFinalWave(page)
  await expect(page.locator('.arena-status')).toContainText('ALL 20 WAVES CLEARED')
  await expect(page.locator('.victory-stats')).toContainText('245870')
  await expect(page.getByRole('button', { name: 'Pause game', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => localStorage.getItem('missile-command-best'))).toBe('245870')
  expect(await page.evaluate(() => (window as any).fixture.audio.sources.size)).toBeGreaterThan(80)
  const initial = await page.locator('canvas').screenshot()
  await page.clock.runFor(2600)
  expect(Buffer.compare(initial, await page.locator('canvas').screenshot())).not.toBe(0)
  await page.screenshot({ path: '.cache/victory-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Mute sound', exact: true }).click()
  expect(await page.evaluate(() => (window as any).fixture.audio.sources.size)).toBe(0)
  await page.getByRole('button', { name: 'Enable sound', exact: true }).click()
  expect(await page.evaluate(() => (window as any).fixture.audio.sources.size)).toBeGreaterThan(80)
  await page.clock.runFor(15000)
  const settled = await page.evaluate(() => (window as any).canvasDraws)
  await page.clock.runFor(1000)
  expect(await page.evaluate(() => (window as any).canvasDraws)).toBe(settled)
  await page.getByRole('button', { name: 'PLAY AGAIN' }).click()
  await page.clock.runFor(150)
  await expect(page.locator('.arena-status')).toContainText('DEFENSE ACTIVE')
  expect(await page.evaluate(() => {
    const {game,audio} = (window as any).fixture
    return { wave:game.wave, score:game.score, victoryTime:game.victoryTime, voices:audio.sources.size }
  })).toEqual({ wave:1, score:0, victoryTime:0, voices:3 })
  expect(errors).toEqual([])
})

test('phone victory fits the battlefield, supports keyboard replay, and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openVictoryFixture(page)
  await page.getByRole('button', { name: 'Mute sound', exact: true }).click()
  await clearFinalWave(page)
  expect(await page.evaluate(() => (window as any).fixture.audio.sources.size)).toBe(0)
  await expect(page.getByRole('button', { name: 'PLAY AGAIN' })).toBeInViewport()
  const fits = await page.locator('.battlefield').evaluate(field => {
    const bounds = field.getBoundingClientRect()
    return [...field.querySelectorAll('.victory-overlay > *')].every(node => {
      const rect = node.getBoundingClientRect()
      return rect.top >= bounds.top && rect.bottom <= bounds.bottom && rect.left >= bounds.left && rect.right <= bounds.right
    })
  })
  expect(fits).toBe(true)
  const draws = await page.evaluate(() => (window as any).canvasDraws)
  await page.clock.runFor(1500)
  expect(await page.evaluate(() => (window as any).canvasDraws)).toBe(draws)
  await page.screenshot({ path: '.cache/victory-mobile.png', fullPage: true })
  await page.locator('canvas').focus()
  await page.keyboard.press('Enter')
  await page.clock.runFor(150)
  await expect(page.locator('.arena-status')).toContainText('DEFENSE ACTIVE')
  expect(await page.evaluate(() => (window as any).fixture.game.wave)).toBe(1)
})
