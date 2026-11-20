// Screenshot delle proposte grafiche in docs/stili/ (telefono e desktop, chiaro e scuro).
//   node tools/screenshot-stili.mjs [file-senza-estensione]
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const RADICE = fileURLToPath(new URL('..', import.meta.url));
const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try { const d = await readFile(join(RADICE, p)); res.writeHead(200, { 'content-type': TIPI[extname(p)] || 'application/octet-stream' }); res.end(d); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/docs/stili/`;
const stili = process.argv[2] ? [process.argv[2]] : (await readdir(join(RADICE, 'docs/stili'))).filter((f) => /^[a-c]-.*\.html$/.test(f)).map((f) => f.replace('.html', ''));
const browser = await chromium.launch({ args: ['--lang=it-IT'] });
for (const stile of stili) {
  for (const [nome, opz] of [['telefono', { ...devices['iPhone 13'] }], ['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }]]) {
    for (const tema of ['chiaro', 'scuro']) {
      const ctx = await browser.newContext({ ...opz, locale: 'it-IT', colorScheme: tema === 'scuro' ? 'dark' : 'light', reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const errori = [];
      page.on('pageerror', (e) => errori.push(e.message));
      await page.goto(base + stile + '.html?ora=14:20');
      await page.waitForTimeout(600);
      await page.screenshot({ path: `docs/stili/screenshot/${stile}-${nome}-${tema}.png`, fullPage: true });
      if (nome === 'telefono' && tema === 'scuro') {
        await page.goto(base + stile + '.html?fine=1');
        await page.waitForTimeout(600);
        await page.screenshot({ path: `docs/stili/screenshot/${stile}-${nome}-${tema}-maturata.png` });
      }
      if (errori.length) console.log(stile, nome, tema, errori);
      await ctx.close();
    }
  }
  console.log('fatto:', stile);
}
await browser.close();
server.close();
