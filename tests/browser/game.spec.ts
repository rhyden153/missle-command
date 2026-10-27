import { test, expect } from '@playwright/test'

// Vercel serves this script in production; the local Nitro server does not.
test.beforeEach(async ({ context }) => {
  await context.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
})

test('global scores show both boards, handle errors, and pause an active defense', async ({ page }) => {
  let offline = true
  await page.route('**/api/leaderboard', route => offline
    ? route.fulfill({ status: 503, json: { statusMessage: 'Offline' } })
    : route.fulfill({ json: { week: '2026-10-26', resetsAt: Date.now() + 86400000,
      weekly: [{ initials: 'ACE', score: 3210, detail: 'Wave 7', at: Date.now() }],
      allTime: [{ initials: 'BOB', score: 98765, detail: 'Victory · Wave 20', at: Date.now() }] } }))
  await page.goto('/')
  await page.getByRole('button', { name: 'START DEFENSE' }).click()
  await page.getByRole('button', { name: 'High scores', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'THE HALL OF FAME.' })
  await expect(dialog).toBeVisible()
  await expect(page.locator('.arena-status')).toContainText('SYSTEM PAUSED')
  await expect(dialog).toContainText('Couldn’t reach the leaderboard.')
  await page.keyboard.press('p')
  await expect(page.locator('.arena-status')).toContainText('SYSTEM PAUSED')
  offline = false
  await dialog.getByRole('button', { name: 'Retry' }).click()
  await expect(dialog).toContainText('ACE')
  await dialog.getByRole('button', { name: 'All time', exact: true }).click()
  await expect(dialog).toContainText('BOB')
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const bounds = await dialog.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
  }
  await page.screenshot({ path: '.cache/global-leaderboard.png', fullPage: true })
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.arena-status')).toContainText('DEFENSE ACTIVE')
})

test('desktop controls, pause, manual, fullscreen, and saved preferences work', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'START DEFENSE' })).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: '.cache/missile-command-desktop.png', fullPage: true })
  await expect(page.locator('.ammo-total')).toContainText('54')
  await page.getByRole('button', { name: 'START DEFENSE' }).click()
  await expect(page.locator('.arena-status')).toContainText('DEFENSE ACTIVE')
  const canvas = page.locator('canvas')
  await canvas.click({ position: { x: 220, y: 170 } })
  await expect(page.locator('.ammo-total')).toContainText('53')

  await page.keyboard.press('3')
  await expect(page.getByRole('button', { name: /Select CHARLIE battery/ })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('a')
  await expect(page.getByRole('button', { name: 'Auto-select' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('p')
  await expect(page.getByRole('heading', { name: 'STAND BY.' })).toBeVisible()
  const pausedAmmo = await page.locator('.ammo-total').textContent()
  await page.keyboard.press('Space')
  await expect(page.locator('.ammo-total')).toHaveText(pausedAmmo!)
  await page.getByRole('button', { name: 'RESUME DEFENSE' }).click()
  await expect(page.locator('.arena-status')).toContainText('DEFENSE ACTIVE')

  await page.getByRole('button', { name: 'How to play' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.arena-status')).toContainText('SYSTEM PAUSED')
  await page.getByRole('button', { name: 'UNDERSTOOD' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('.arena-status')).toContainText('DEFENSE ACTIVE')

  await page.getByRole('button', { name: 'Mute sound' }).click()
  await expect(page.getByRole('button', { name: 'Enable sound' })).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible()
  await page.getByRole('button', { name: 'START DEFENSE' }).click()
  await page.locator('canvas').click({ position: { x: 220, y: 170 } })
  await page.getByRole('button', { name: 'Enable sound' }).click()
  await expect(page.getByRole('button', { name: 'Mute sound' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('p')
  await expect(page.getByRole('heading', { name: 'STAND BY.' })).toBeVisible()
  await page.keyboard.press('p')
  await expect(page.locator('.arena-status')).toContainText('DEFENSE ACTIVE')
  await page.getByRole('button', { name: 'Enter fullscreen' }).click()
  await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible()
  await page.getByRole('button', { name: 'Exit fullscreen' }).click()
  await page.locator('canvas').focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  await expect(page.locator('.ammo-total')).toContainText('52')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: '.cache/missile-command-playing.png', fullPage: true })

  await page.evaluate(() => localStorage.setItem('missile-command-best', '1250'))
  await page.reload()
  await expect(page.locator('.best-score')).toHaveText('001250')
  await expect(page.getByRole('button', { name: 'Mute sound' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.arena-status')).toContainText('AWAITING COMMAND')
  expect(errors).toEqual([])
})

test('phone layout fits the screen and supports touch gameplay', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await context.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'START DEFENSE' })).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '.cache/missile-command-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'START DEFENSE' }).tap()
  await page.locator('canvas').tap({ position: { x: 160, y: 160 } })
  await expect(page.locator('.ammo-total')).toContainText('53')
  await page.getByRole('button', { name: 'Pause game', exact: true }).tap()
  await expect(page.getByRole('heading', { name: 'STAND BY.' })).toBeVisible()
  await page.getByRole('button', { name: 'RESUME DEFENSE' }).tap()
  await expect(page.locator('.arena-status')).toContainText('DEFENSE ACTIVE')
  expect(errors).toEqual([])
  await context.close()
})

test('the layout remains within the viewport at intermediate screen sizes', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'START DEFENSE' })).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  for (const width of [320, 600, 601, 768, 850, 851, 1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `No horizontal overflow at ${width}px`).toBe(true)
    await expect(page.getByRole('button', { name: 'START DEFENSE' })).toBeInViewport()
    expect(await page.locator('.arena-hud').evaluate(element => element.scrollWidth <= element.clientWidth), `HUD fits at ${width}px`).toBe(true)
  }
})


test('sound starts with gameplay, explosions produce audio, and mute stops playback', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as any).audioStarts = 0
    for (const prototype of [OscillatorNode.prototype, AudioBufferSourceNode.prototype]) {
      const original = prototype.start
      prototype.start = function (...args) {
        ;(window as any).audioStarts++
        return original.apply(this, args)
      }
    }
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'START DEFENSE' })).toBeEnabled()
  expect(await page.evaluate(() => (window as any).audioStarts)).toBe(0)
  await page.getByRole('button', { name: 'START DEFENSE' }).click()
  await page.locator('canvas').click({ position: { x: 220, y: 170 } })
  await expect.poll(() => page.evaluate(() => (window as any).audioStarts)).toBeGreaterThanOrEqual(4)
  await page.getByRole('button', { name: 'Mute sound' }).click()
  const count = await page.evaluate(() => (window as any).audioStarts)
  await page.waitForTimeout(200)
  await page.locator('canvas').click({ position: { x: 260, y: 170 } })
  await page.waitForTimeout(1000)
  expect(await page.evaluate(() => (window as any).audioStarts)).toBe(count)
})
