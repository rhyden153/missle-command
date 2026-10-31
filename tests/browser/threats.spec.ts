import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function openThreatFixture(page: Page) {
  await page.route('**/__threats/**', async route => {
    const file = new URL(route.request().url()).pathname.split('/').at(-1)!
    if (['engine.js', 'renderer.js', 'audio.js'].includes(file)) {
      const source = await readFile(`app/game/${file.replace('.js', '.ts')}`, 'utf8')
      const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      await route.fulfill({ contentType: 'application/javascript', body: compiled.replace("from './engine'", "from './engine.js'") })
    } else if (file.endsWith('.mp3')) {
      await route.fulfill({ contentType: 'audio/mpeg', body: await readFile('assets/launch-thud.mp3') })
    } else {
      await route.fulfill({ contentType: 'text/html', body: `
        <style>body{margin:0;background:#10151e;color:#ddd;font:14px monospace}canvas{display:block;width:1200px}button{padding:10px}</style>
        <button id="sound">Enable sounds</button>
        <canvas id="field" width="1200" height="620"></canvas>
        <canvas id="atlas" width="1200" height="180"></canvas>
        <script type="module">
          import {MissileCommand} from './engine.js';
          import {renderBattlefield,renderThreatSprite} from './renderer.js';
          import {GameAudio} from './audio.js';
          const game=new MissileCommand(()=>0.5),audio=new GameAudio('a.mp3','a.mp3','a.mp3','a.mp3');
          game.start();game.wave=5;game.incoming=0;game.spawnTimer=1000;
          game.aircraft.push(...['bomber','ufo'].map((kind,i)=>({kind,x:270+i*630,y:120,altitude:120,direction:i?-1:1,speed:100,dropX:i?850:320,dropped:false,alive:true,age:0,soundTimer:2.8})));
          game.enemies.push({x:600,y:265,from:{x:600,y:-10},target:{x:601,y:532},speed:65,alive:true,split:false,kind:'guidedBomb',vx:0,evasion:1.35,evading:false});
          const voices=[];
          const start=OscillatorNode.prototype.start;
          OscillatorNode.prototype.start=function(...args){voices.push(this.type);return start.apply(this,args)};
          game.onEvent=event=>audio.play(event);
          const render=()=>renderBattlefield(document.querySelector('#field').getContext('2d'),game,false);
          const advance=seconds=>{for(let i=0;i<Math.ceil(seconds/0.025);i++)game.update(0.025);render()};
          document.querySelector('#sound').onclick=()=>{audio.unlock();for(const [i,event] of ['bomber','ufo','guidedBomb','payload','evade'].entries())setTimeout(()=>audio.play(event),i*80)};
          const atlas=document.querySelector('#atlas').getContext('2d');
          atlas.fillStyle='#080e19';atlas.fillRect(0,0,1200,180);
          for(const [column,kind] of ['bomber','ufo','guidedBomb'].entries()){
            atlas.fillStyle='#b9c7d6';atlas.font='14px monospace';atlas.fillText(kind.toUpperCase(),60+column*400,30);
            atlas.save();atlas.translate(200+column*400,100);atlas.scale(3,3);renderThreatSprite(atlas,kind,0,0,2);atlas.restore();
          }
          window.fixture={game,audio,render,advance,voices};render();
        </script>` })
    }
  })
  await page.setViewportSize({ width: 1200, height: 1050 })
  await page.goto('/__threats/index.html')
}

test('threat sprites render, aircraft drop once, and real Web Audio plays', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openThreatFixture(page)
  await page.locator('#atlas').screenshot({ path: '.cache/threat-sprites.png' })
  await page.locator('#field').screenshot({ path: '.cache/threats.png' })
  // Each sprite changes visible pixels compared with the same scenery with no threats.
  const footprints = await page.evaluate(() => {
    const f = (window as any).fixture, ctx = document.querySelector<HTMLCanvasElement>('#field')!.getContext('2d')!
    const regions = [[240, 100, 60, 40], [870, 100, 60, 40], [585, 245, 30, 40]]
    const withThreats = regions.map(([x,y,w,h]) => Array.from(ctx.getImageData(x!,y!,w!,h!).data))
    const aircraft = f.game.aircraft.splice(0), enemies = f.game.enemies.splice(0)
    f.render()
    const differences = regions.map(([x,y,w,h],i) => Array.from(ctx.getImageData(x!,y!,w!,h!).data).reduce((sum,n,j) => sum + Math.abs(n-withThreats[i]![j]!),0))
    f.game.aircraft.push(...aircraft);f.game.enemies.push(...enemies);f.render()
    return differences
  })
  expect(footprints.every(value => value > 1000)).toBe(true)
  await page.getByRole('button', { name: 'Enable sounds' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).fixture.voices.length)).toBeGreaterThanOrEqual(12)
  await expect.poll(() => page.evaluate(() => (window as any).fixture.voices.includes('sawtooth'))).toBe(true)
  await page.evaluate(() => (window as any).fixture.advance(0.8))
  expect(await page.evaluate(() => (window as any).fixture.game.enemies.length)).toBe(3)
  await page.evaluate(() => (window as any).fixture.advance(0.4))
  expect(await page.evaluate(() => (window as any).fixture.game.enemies.length)).toBe(3)
  await page.locator('#field').screenshot({ path: '.cache/threats-payloads.png' })
  await page.evaluate(() => (window as any).fixture.audio.dispose())
  expect(errors).toEqual([])
})

test('the production game has one graphics and sound set and still supports pause', async ({ page }) => {
  await page.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  await page.goto('/')
  await expect(page.getByRole('group', { name: 'THREAT SPRITES + SOUND' })).toHaveCount(0)
  await page.getByRole('button', { name: 'START DEFENSE' }).click()
  await page.keyboard.press('p')
  await expect(page.getByRole('heading', { name: 'STAND BY.' })).toBeVisible()
  await page.getByRole('button', { name: 'How to play' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.help-detail')).toContainText('Guided bombs can briefly steer around blasts.')
})

test('threat ambience remains audible after the spawn cues and releases the real Web Audio graph', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openThreatFixture(page)
  await page.evaluate(() => {
    const f = (window as any).fixture
    document.querySelector<HTMLButtonElement>('#sound')!.onclick = () => {
      f.audio.unlock()
      f.audio.syncThreats(f.game)
      f.analyser = f.audio.context.createAnalyser()
      f.audio.master.connect(f.analyser)
    }
  })
  await page.getByRole('button', { name: 'Enable sounds' }).click()
  // The previous sounds all expired within 1.05 seconds. Sample well after that.
  await page.waitForTimeout(1600)
  const sustained = await page.evaluate(() => {
    const f = (window as any).fixture
    const samples = new Float32Array(f.analyser.fftSize)
    f.analyser.getFloatTimeDomainData(samples)
    return {
      loops: f.audio.threatLoops.size,
      voices: f.audio.sources.size,
      rms: Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length),
    }
  })
  expect(sustained.loops).toBe(3)
  expect(sustained.voices).toBe(9)
  expect(sustained.rms).toBeGreaterThan(0.001)
  expect(await page.evaluate(() => {
    const f = (window as any).fixture
    const voices = [...f.audio.sources.keys()] as AudioScheduledSourceNode[]
    f.game.aircraft.length = 0
    f.game.enemies.length = 0
    f.audio.syncThreats(f.game)
    return { loops: f.audio.threatLoops.size, voices: f.audio.sources.size, released: voices.every(source => source.onended === null) }
  })).toEqual({ loops: 0, voices: 0, released: true })
  await page.evaluate(() => (window as any).fixture.audio.dispose())
  expect(errors).toEqual([])
})

test('upgraded ammo meters scale to capacity and reserve cities replace destroyed sites after the cloud clears', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openThreatFixture(page)
  const bars = await page.evaluate(() => {
    const f = (window as any).fixture, game = f.game
    game.wave = 1; game.score = 299975; game.incoming = 1; game.aircraft.length = 0
    game.enemies = [{ x:600, y:200, from:{x:600,y:0}, target:{x:600,y:532}, speed:40, alive:true, split:false }]
    game.blasts = [{ x:600, y:200, radius:66, maxRadius:66, age:0.5, duration:2, friendly:true, chain:0 }]
    game.update(0.025)
    game.batteries[0].ammo = 18
    f.render()
    const ctx = document.querySelector<HTMLCanvasElement>('#field')!.getContext('2d')!
    return Array.from({length:9}, (_,i) => ctx.getImageData(59+i*6,572,1,1).data[0]! > 150)
  })
  expect(bars).toEqual([true,true,true,true,true,true,true,false,false])
  const ruined = await page.evaluate(() => {
    const f = (window as any).fixture, game = f.game, city = game.cities[0]
    game.blasts.length = 0
    game.enemies = [{ x:city.x, y:531, from:{x:city.x,y:0}, target:{x:city.x,y:532}, speed:40, alive:true, split:false }]
    f.advance(0.1)
    return { alive:city.alive, reserves:game.bonusCities, phase:game.phase }
  })
  expect(ruined).toEqual({alive:false,reserves:2,phase:'playing'})
  await page.evaluate(() => (window as any).fixture.advance(5.6))
  expect(await page.evaluate(() => {
    const game = (window as any).fixture.game
    return { alive:game.cities[0].alive, reserves:game.bonusCities, capacity:game.maxAmmo, explosions:game.cityExplosions.length }
  })).toEqual({alive:true,reserves:1,capacity:72,explosions:0})
  await page.locator('#field').screenshot({path:'.cache/reward-city-restored.png'})
  expect(errors).toEqual([])
})
