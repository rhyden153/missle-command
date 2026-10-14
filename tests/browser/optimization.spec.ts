import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillRect
    ;(window as any).canvasDraws = 0
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      ;(window as any).canvasDraws++
      return fill.apply(this, args)
    }
  })
  await page.clock.install()
})

test('paused playfield stays idle but still redraws after selection and resize', async ({ page }) => {
  await page.setViewportSize({ width:1440, height:1100 })
  await page.goto('/')
  await expect(page.getByRole('button', { name:'START DEFENSE' })).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  await page.getByRole('button', { name:'START DEFENSE' }).click()
  await page.clock.runFor(350)
  await page.keyboard.press('p')
  await expect(page.getByRole('heading', { name:'STAND BY.' })).toBeVisible()
  await page.clock.runFor(150)
  const paused = await page.evaluate(() => (window as any).canvasDraws)
  await page.clock.runFor(1000)
  expect(await page.evaluate(() => (window as any).canvasDraws)).toBe(paused)
  await page.keyboard.press('3')
  await page.clock.runFor(50)
  expect(await page.evaluate(() => (window as any).canvasDraws)).toBeGreaterThan(paused)
  const size = await page.locator('canvas').evaluate((canvas:HTMLCanvasElement) => canvas.width)
  await page.setViewportSize({ width:900, height:1000 })
  await page.clock.runFor(100)
  expect(await page.locator('canvas').evaluate((canvas:HTMLCanvasElement) => canvas.width)).not.toBe(size)
  const resized = await page.evaluate(() => (window as any).canvasDraws)
  await page.clock.runFor(1000)
  expect(await page.evaluate(() => (window as any).canvasDraws)).toBe(resized)
  await page.keyboard.press('p')
  await page.clock.runFor(100)
  expect(await page.evaluate(() => (window as any).canvasDraws)).toBeGreaterThan(resized)
  await expect(page.locator('.arena-status')).toContainText('DEFENSE ACTIVE')
})

test('reduced-motion standby stops repainting its unchanged scene', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' })
  await page.goto('/')
  await expect(page.getByRole('button', { name:'START DEFENSE' })).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  await page.clock.runFor(200)
  const before = await page.evaluate(() => (window as any).canvasDraws)
  await page.clock.runFor(1000)
  expect(await page.evaluate(() => (window as any).canvasDraws)).toBe(before)
})
