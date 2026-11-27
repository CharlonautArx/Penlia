/**
 * Reproduce the supplementary Expo Web comparisons on a local Chromium installation.
 * Usage: PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs CHROMIUM=/path/to/chromium \
 *   node capture.mjs /path/to/expo-web-export /path/to/outputs
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [exportDir, resultDir] = process.argv.slice(2);
if (!exportDir || !resultDir) throw Error('Supply the exported Web folder and output folder.');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright-core');
const root = resolve(exportDir);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = extname(path) ? resolve(root, '.' + path) : resolve(root, 'index.html');
    if (relative(root, file).startsWith('..')) throw Error();
    const buffer = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(buffer);
  } catch { res.writeHead(404).end(); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || 'chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage']});
const routes = {
  inbox: ['/', '老地方'], chat: ['/chat/demo-xiaoman', '小满'], moments: ['/moments', '小巷'],
  world: ['/world/preview-world?together=1', '晚风小院'], gathering: ['/gathering/preview-gathering?together=1', '周末到河边喝杯咖啡'],
};
const width = Number(process.env.VIEWPORT_WIDTH || 390);
const height = Number(process.env.VIEWPORT_HEIGHT || 844);
const colorScheme = process.env.COLOR_SCHEME || 'light';
const legacy = process.env.BASELINE === '1';
const variants = legacy ? ['original'] : (process.env.VARIANTS || 'original,A,B,C,D').split(',');
const records = [];
try {
  for (const variant of variants) {
    const ctx = await browser.newContext({ viewport: {width, height}, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme });
    if (process.env.LARGE_TYPE === '1') await ctx.addInitScript(() => localStorage.setItem('penlia.font-size.v1', '3'));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-11-27T04:00:00Z'));
    if (legacy) {
      await page.goto(origin);
      await page.getByRole('button', {name:'直接进入',exact:true}).click();
    }
    await mkdir(resolve(resultDir, variant), {recursive:true});
    for (const [screen,[path,content]] of Object.entries(routes)) {
      await page.goto(origin + (legacy ? path : '/design-pilot?variant=' + variant + '&screen=' + screen));
      if (!legacy) await page.getByTestId('pilot-' + variant + '-' + screen).waitFor();
      await page.getByText(content,{exact:false}).filter({visible:true}).first().waitFor();
      await page.waitForTimeout(350);
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      const image = await page.screenshot({path:resolve(resultDir, variant, screen + '.jpg'),type:'jpeg',quality:80});
      records.push({variant,screen,url:new URL(page.url()).pathname,sha256:createHash('sha256').update(image).digest('hex')});
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  await writeFile(resolve(resultDir,'checks.json'), JSON.stringify({width,height,colorScheme,records},null,2));
} finally { await browser.close(); await new Promise(ok => server.close(ok)); }
