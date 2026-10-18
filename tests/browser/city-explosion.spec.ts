import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Exercise the actual engine, Canvas renderer, and audio without production debug hooks.
async function openExplosionFixture(page: Page) {
  await page.route('**/__city-explosion/**', async route => {
    const file = new URL(route.request().url()).pathname.split('/').at(-1)!
    if (file === 'city-explosion.mp3' || file === 'air-explosion.mp3' || file === 'battery-explosion.mp3' || file === 'launch-thud.mp3') {
      await route.fulfill({ contentType: 'audio/mpeg', body: await readFile(`assets/${file}`) })
    } else if (['engine.js', 'renderer.js', 'audio.js'].includes(file)) {
      const source = await readFile(`app/game/${file.replace('.js', '.ts')}`, 'utf8')
      const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      await route.fulfill({ contentType: 'application/javascript', body: compiled.replace("from './engine'", "from './engine.js'") })
    } else {
      await route.fulfill({ contentType: 'text/html', body: `
        <style>body{margin:0;background:#10151e}canvas{display:block;width:100%;max-width:1200px}button{padding:12px}</style>
        <button id="arm">Enable audio</button><button id="detonate">Destroy city</button><button id="air">Air burst</button><button id="battery">Destroy battery</button>
        <canvas width="1200" height="620"></canvas>
        <script type="module">
          import {MissileCommand, GROUND} from './engine.js';
          import {renderBattlefield} from './renderer.js';
          import {GameAudio} from './audio.js';
          const game=new MissileCommand(()=>0.5), audio=new GameAudio('./city-explosion.mp3','./air-explosion.mp3','./battery-explosion.mp3','./launch-thud.mp3');
          const ctx=document.querySelector('canvas').getContext('2d');
          const sampleStarts=[]; let sampleStops=0, airStarts=0, airStops=0, batteryStarts=0, batteryStops=0, launchStarts=0, launchStops=0;
          const start=AudioBufferSourceNode.prototype.start, stop=AudioBufferSourceNode.prototype.stop;
          AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer?.duration>1)sampleStarts.push(this.buffer.duration);if(this.buffer===audio.recordings.airExplosion.buffer)airStarts++;if(this.buffer===audio.recordings.batteryExplosion.buffer)batteryStarts++;if(this.buffer===audio.recordings.launchThud.buffer)launchStarts++;return start.apply(this,args)};
          AudioBufferSourceNode.prototype.stop=function(...args){if(this.buffer?.duration>1)sampleStops++;if(this.buffer===audio.recordings.airExplosion.buffer)airStops++;if(this.buffer===audio.recordings.batteryExplosion.buffer)batteryStops++;if(this.buffer===audio.recordings.launchThud.buffer)launchStops++;return stop.apply(this,args)};
          game.onEvent=event=>audio.play(event);
          const render=()=>renderBattlefield(ctx,game);
          const advance=seconds=>{for(let t=0;t<seconds;t+=0.025)game.update(0.025);render()};
          document.querySelector('#arm').onclick=()=>audio.unlock();
          document.querySelector('#detonate').onclick=()=>{
            game.start();game.incoming=1;game.spawnTimer=1000;
            const x=game.cities[1].x;
            game.enemies=[{x,y:GROUND-1,from:{x,y:0},target:{x,y:GROUND},speed:40,alive:true,split:false}];
            game.update(0.025);render();
          };
          document.querySelector('#air').onclick=()=>{game.start();game.incoming=1;game.spawnTimer=1000;game.fire(328,230)};
          document.querySelector('#battery').onclick=()=>{
            game.start();game.incoming=1;game.spawnTimer=1000;
            const x=game.batteries[1].x;
            game.enemies=[{x,y:GROUND-1,from:{x,y:0},target:{x,y:GROUND},speed:40,alive:true,split:false}];
            game.update(0.025);render();
          };
          window.fixture={game,audio,advance,render,sampleStarts,get sampleStops(){return sampleStops},get airStarts(){return airStarts},get airStops(){return airStops},get batteryStarts(){return batteryStarts},get batteryStops(){return batteryStops},get launchStarts(){return launchStarts},get launchStops(){return launchStops}};
          render();
        </script>` })
    }
  })
  await page.setViewportSize({ width: 1200, height: 700 })
  await page.goto('/__city-explosion/index.html')
}

test('city destruction renders a rising cloud and plays the supplied recording', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openExplosionFixture(page)
  await page.getByRole('button', { name: 'Enable audio' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).fixture.audio.recordings.cityExplosion.buffer?.duration ?? 0)).toBeGreaterThan(1)
  await page.getByRole('button', { name: 'Destroy city' }).click()
  expect(await page.evaluate(() => (window as any).fixture.sampleStarts.length)).toBe(1)
  await page.evaluate(() => (window as any).fixture.advance(0.2))
  await page.locator('canvas').screenshot({ path: '.cache/city-fireball.png' })
  await page.evaluate(() => (window as any).fixture.advance(1.3))
  await page.locator('canvas').screenshot({ path: '.cache/city-mushroom-cloud.png' })
  const cloudPixel = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext('2d')!.getImageData(328, 402, 1, 1).data))
  expect(cloudPixel[0]).toBeGreaterThan(100)
  await page.evaluate(() => { const f=(window as any).fixture; f.audio.muted=true; f.game.pause() })
  expect(await page.evaluate(() => (window as any).fixture.sampleStops)).toBe(1)
  const age = await page.evaluate(() => (window as any).fixture.game.cityExplosions[0].age)
  await page.evaluate(() => (window as any).fixture.advance(2))
  expect(await page.evaluate(() => (window as any).fixture.game.cityExplosions[0].age)).toBe(age)
  await page.evaluate(() => { const f=(window as any).fixture; f.game.pause(); f.advance(2) })
  await page.locator('canvas').screenshot({ path: '.cache/city-smoke.png' })
  await page.evaluate(() => (window as any).fixture.advance(3))
  expect(await page.evaluate(() => (window as any).fixture.game.cityExplosions.length)).toBe(0)
  await page.locator('canvas').screenshot({ path: '.cache/city-crater.png' })
  const readCrater = () => page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext('2d')!.getImageData(278, 520, 100, 28).data))
  const crater = await readCrater()
  const craterDifference = (pixels: number[]) => pixels.reduce((sum, value, index) => sum + Math.abs(value - crater[index]!), 0) / pixels.length
  const ground = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!
    return { crater: ctx.getImageData(328, 535, 1, 1).data[0], terrain: ctx.getImageData(390, 535, 1, 1).data[0] }
  })
  expect(ground.crater).toBeLessThan(ground.terrain)
  await page.evaluate(() => { const f=(window as any).fixture; f.game.incoming=0; f.advance(4.2) })
  expect(await page.evaluate(() => (window as any).fixture.game.wave)).toBe(2)
  // Canvas gradient dithering can vary slightly between otherwise identical frames.
  expect(craterDifference(await readCrater())).toBeLessThan(2)
  await page.locator('canvas').screenshot({ path: '.cache/city-crater-next-wave.png' })
  await page.evaluate(() => { const f=(window as any).fixture; f.game.start(); f.render() })
  expect(craterDifference(await readCrater())).toBeGreaterThan(2)
  await page.getByRole('button', { name: 'Destroy city' }).click()
  expect(await page.evaluate(() => (window as any).fixture.sampleStarts.length)).toBe(1)
  expect(errors).toEqual([])
})

test('air fireballs keep the blast radius, cool into smoke, and use the supplied recording', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openExplosionFixture(page)
  await page.getByRole('button', { name: 'Enable audio' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).fixture.audio.recordings.airExplosion.buffer?.duration ?? 0)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Air burst' }).click()
  await page.evaluate(() => (window as any).fixture.advance(1.25))
  expect(await page.evaluate(() => (window as any).fixture.airStarts)).toBe(1)
  expect(await page.evaluate(() => (window as any).fixture.game.blasts[0].radius)).toBe(66)
  await page.locator('canvas').screenshot({ path: '.cache/air-fireball.png' })
  const fire = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext('2d')!.getImageData(328, 230, 1, 1).data))
  expect(fire[0] - fire[1]).toBeGreaterThan(20)
  expect(fire[1] - fire[2]).toBeGreaterThan(20)
  const footprint = await page.evaluate(() => {
    const f = (window as any).fixture, ctx = document.querySelector('canvas')!.getContext('2d')!
    // Isolate the rendered blast from the separate flying ember particles.
    f.game.particles = []
    f.render()
    const blast = f.game.blasts.pop()
    const withBlast = Array.from(ctx.getImageData(390, 228, 12, 4).data)
    f.render()
    const withoutBlast = Array.from(ctx.getImageData(390, 228, 12, 4).data)
    f.game.blasts.push(blast)
    f.render()
    return { withBlast, withoutBlast }
  })
  // The sampled strip crosses the radius: visible inside, untouched outside.
  const difference = (start: number, end: number) => footprint.withBlast.slice(start, end).reduce((sum, value, i) => sum + Math.abs(value - footprint.withoutBlast[start + i]!), 0) / (end - start)
  expect(difference(0, 12)).toBeGreaterThan(3)
  expect(difference(24, 48)).toBeLessThan(2)
  await page.evaluate(() => (window as any).fixture.advance(0.9))
  await page.locator('canvas').screenshot({ path: '.cache/air-smoke.png' })
  const smoke = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext('2d')!.getImageData(328, 230, 1, 1).data))
  expect(Math.abs(smoke[0] - smoke[1])).toBeLessThan(15)
  await page.evaluate(() => { const f=(window as any).fixture; f.audio.muted=true; f.game.pause() })
  expect(await page.evaluate(() => (window as any).fixture.airStops)).toBe(1)
  const age = await page.evaluate(() => (window as any).fixture.game.blasts[0].age)
  await page.evaluate(() => (window as any).fixture.advance(1))
  expect(await page.evaluate(() => (window as any).fixture.game.blasts[0].age)).toBe(age)
  await page.evaluate(() => { const f=(window as any).fixture; f.game.pause(); f.advance(1) })
  expect(await page.evaluate(() => (window as any).fixture.game.blasts.length)).toBe(0)
  await page.evaluate(() => { const f=(window as any).fixture; f.audio.muted=false; f.audio.play('intercept') })
  expect(await page.evaluate(() => (window as any).fixture.airStarts)).toBe(2)
  await page.evaluate(() => { (window as any).fixture.audio.muted=true })
  await page.getByRole('button', { name: 'Air burst' }).click()
  await page.evaluate(() => (window as any).fixture.advance(1))
  expect(await page.evaluate(() => (window as any).fixture.airStarts)).toBe(2)
  expect(errors).toEqual([])
})

test('battery destruction uses a smaller nuclear cloud and its own recording', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openExplosionFixture(page)
  await page.getByRole('button', { name: 'Enable audio' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).fixture.audio.recordings.batteryExplosion.buffer?.duration ?? 0)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Destroy battery' }).click()
  expect(await page.evaluate(() => (window as any).fixture.batteryStarts)).toBe(1)
  await page.evaluate(() => (window as any).fixture.advance(0.2))
  await page.locator('canvas').screenshot({ path: '.cache/battery-fireball.png' })
  await page.evaluate(() => (window as any).fixture.advance(1.3))
  await page.locator('canvas').screenshot({ path: '.cache/battery-mushroom-cloud.png' })
  expect(await page.evaluate(() => (window as any).fixture.game.citiesAlive)).toBe(6)
  const sizes = await page.evaluate(() => {
    const f=(window as any).fixture, ctx=document.querySelector('canvas')!.getContext('2d')!
    const battery = Array.from(ctx.getImageData(601, 453, 1, 1).data)
    const aboveBattery = Array.from(ctx.getImageData(601, 402, 1, 1).data)
    const effect = f.game.batteryExplosions[0]
    f.game.cityExplosions.push({ ...effect, x:328 })
    f.render()
    const city = Array.from(ctx.getImageData(328, 402, 1, 1).data)
    f.game.cityExplosions=[];f.render()
    return { battery, aboveBattery, city }
  })
  expect(sizes.battery[0]).toBeGreaterThan(100)
  expect(sizes.aboveBattery[0]).toBeLessThan(100)
  expect(sizes.city[0]).toBeGreaterThan(100)
  await page.evaluate(() => { const f=(window as any).fixture; f.audio.stop(); f.game.pause() })
  expect(await page.evaluate(() => (window as any).fixture.batteryStops)).toBe(1)
  const age=await page.evaluate(() => (window as any).fixture.game.batteryExplosions[0].age)
  await page.evaluate(() => (window as any).fixture.advance(2))
  expect(await page.evaluate(() => (window as any).fixture.game.batteryExplosions[0].age)).toBe(age)
  await page.evaluate(() => { const f=(window as any).fixture; f.game.pause(); f.advance(2) })
  await page.locator('canvas').screenshot({ path: '.cache/battery-smoke.png' })
  await page.evaluate(() => { const f=(window as any).fixture; f.game.incoming=0; f.advance(1) })
  expect(await page.evaluate(() => (window as any).fixture.game.phase)).toBe('playing')
  await page.evaluate(() => (window as any).fixture.advance(1.1))
  expect(await page.evaluate(() => (window as any).fixture.game.batteryExplosions.length)).toBe(0)
  expect(await page.evaluate(() => (window as any).fixture.game.phase)).toBe('intermission')
  await page.evaluate(() => (window as any).fixture.advance(4.1))
  expect(await page.evaluate(() => (window as any).fixture.game.batteries[1].alive)).toBe(true)
  await page.evaluate(() => { (window as any).fixture.audio.muted=true })
  await page.getByRole('button', { name: 'Destroy battery' }).click()
  expect(await page.evaluate(() => (window as any).fixture.batteryStarts)).toBe(1)
  await page.evaluate(() => { const f=(window as any).fixture; f.game.start(); f.render() })
  expect(await page.evaluate(() => (window as any).fixture.game.batteryExplosions.length)).toBe(0)
  expect(errors).toEqual([])
})

test('launch thud plays for accepted shots and respects pause and mute', async ({ page }) => {
  await openExplosionFixture(page)
  await page.getByRole('button', { name: 'Enable audio' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).fixture.audio.recordings.launchThud.buffer?.duration ?? 0)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Air burst' }).click()
  expect(await page.evaluate(() => (window as any).fixture.launchStarts)).toBe(1)
  expect(await page.evaluate(() => (window as any).fixture.game.fire(328,230))).toBe(false)
  expect(await page.evaluate(() => (window as any).fixture.launchStarts)).toBe(1)
  await page.evaluate(() => { const f=(window as any).fixture; f.audio.stop(); f.game.pause() })
  expect(await page.evaluate(() => (window as any).fixture.launchStops)).toBe(1)
  expect(await page.evaluate(() => (window as any).fixture.game.fire(328,230))).toBe(false)
  await page.evaluate(() => { const f=(window as any).fixture; f.game.pause(); f.advance(0.2); f.game.fire(328,230) })
  expect(await page.evaluate(() => (window as any).fixture.launchStarts)).toBe(2)
  await page.evaluate(() => { const f=(window as any).fixture; f.audio.muted=true; f.advance(0.2) })
  expect(await page.evaluate(() => (window as any).fixture.game.fire(328,230))).toBe(true)
  expect(await page.evaluate(() => (window as any).fixture.launchStarts)).toBe(2)
})

test('the production game serves and decodes all sound recordings', async ({ page }) => {
  await page.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  await page.addInitScript(() => {
    const decode = AudioContext.prototype.decodeAudioData
    ;(window as any).recordingDurations = []
    AudioContext.prototype.decodeAudioData = function (data) {
      return decode.call(this, data).then(buffer => { (window as any).recordingDurations.push(buffer.duration); return buffer })
    }
  })
  await page.goto('/')
  const asset = page.waitForResponse(response => response.url().includes('city-explosion') && response.url().endsWith('.mp3'))
  const airAsset = page.waitForResponse(response => response.url().includes('air-explosion') && response.url().endsWith('.mp3'))
  const batteryAsset = page.waitForResponse(response => response.url().includes('battery-explosion') && response.url().endsWith('.mp3'))
  const launchAsset = page.waitForResponse(response => response.url().includes('launch-thud') && response.url().endsWith('.mp3'))
  await page.getByRole('button', { name: 'START DEFENSE' }).click()
  expect((await asset).status()).toBe(200)
  expect((await airAsset).status()).toBe(200)
  expect((await batteryAsset).status()).toBe(200)
  expect((await launchAsset).status()).toBe(200)
  await expect.poll(() => page.evaluate(() => (window as any).recordingDurations.length)).toBe(4)
})
