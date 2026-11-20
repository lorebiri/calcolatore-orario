// Prova l'app in un browser vero (Playwright + Chromium).
//   node tools/e2e.mjs               → solo controlli
//   node tools/e2e.mjs --screenshot  → anche screenshot in docs/screenshot/dopo/
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const RADICE = fileURLToPath(new URL('..', import.meta.url));
const SCREENSHOT = process.argv.includes('--screenshot');
const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  try {
    const dati = await readFile(join(RADICE, p));
    res.writeHead(200, { 'content-type': TIPI[extname(p)] || 'application/octet-stream' });
    res.end(dati);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_APP = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch({ args: ['--lang=it-IT'] });
let fallimenti = 0;
async function prova(nome, fn) {
  try { await fn(); console.log('ok  ', nome); } catch (e) { fallimenti++; console.log('FAIL', nome, '\n', e.message); }
}

async function nuovaPagina(opz = {}, ora = '2026-11-20T13:05:00') {
  const ctx = await browser.newContext({ locale: 'it-IT', timezoneId: 'Europe/Rome', ...opz });
  await ctx.clock.install({ time: new Date(ora + '+01:00') });
  const page = await ctx.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(URL_APP) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) errori.push('richiesta esterna: ' + r.url()); });
  await page.goto(URL_APP);
  return { ctx, page, errori };
}

const testoDi = (page, sel) => page.locator(sel).textContent();

await prova('giornata tipo: stessi risultati della v1 (uscita 15:52, buono 14:40)', async () => {
  const { ctx, page, errori } = await nuovaPagina();
  await page.fill('#ingresso', '08:10');
  await page.click('#aggiungiPausa');
  await page.fill('#pausa-u-0', '12:30');
  await page.fill('#pausa-r-0', '13:00');
  assert.equal(await testoDi(page, '#heroTitolo'), '15:52');
  assert.equal(await testoDi(page, '#mBuono'), '14:40');
  assert.equal(await testoDi(page, '#mLavorato'), '4:25');
  assert.match(await testoDi(page, '#heroSotto'), /Mancano 2:47/);
  assert.match(await testoDi(page, '#avvisoPausa'), /valida/);
  // i dati restano dopo il ricaricamento
  await page.reload();
  assert.equal(await page.inputValue('#ingresso'), '08:10');
  assert.equal(await page.inputValue('#pausa-r-0'), '13:00');
  assert.equal(await testoDi(page, '#heroTitolo'), '15:52');
  assert.deepEqual(errori, []);
  await ctx.close();
});

await prova('pulsanti rapidi: ingresso, pausa, rientro, uscita', async () => {
  const { ctx, page, errori } = await nuovaPagina({}, '2026-11-20T08:00:00');
  await page.getByRole('button', { name: 'Timbra ingresso' }).click();
  assert.equal(await page.inputValue('#ingresso'), '08:00');
  await page.clock.fastForward('04:30:00');
  await page.getByRole('button', { name: 'Vado in pausa' }).click();
  assert.equal(await page.inputValue('#pausa-u-0'), '12:30');
  await page.clock.fastForward('00:40:00');
  assert.match(await testoDi(page, '#heroSotto'), /In pausa da 0:40/);
  await page.getByRole('button', { name: 'Rientro dalla pausa' }).click();
  assert.equal(await page.inputValue('#pausa-r-0'), '13:10');
  assert.equal(await testoDi(page, '#heroTitolo'), '15:52');
  await page.clock.fastForward('03:00:00');
  await page.getByRole('button', { name: 'Esco adesso' }).click();
  assert.equal(await page.inputValue('#uscita'), '16:10');
  assert.equal(await testoDi(page, '#heroTitolo'), '7:30');
  assert.equal(await testoDi(page, '#mSaldo'), '+0:18');
  assert.deepEqual(errori, []);
  await ctx.close();
});

await prova('storico, impostazioni e CSV', async () => {
  const { ctx, page, errori } = await nuovaPagina();
  await page.evaluate(() => localStorage.setItem('calcolatore-orario', JSON.stringify({
    giorni: {
      '2026-11-16': { ingresso: '08:00', pause: [{ uscita: '13:00', rientro: '13:30' }], uscita: '16:00' },
      '2026-11-17': { ingresso: '08:05', pause: [{ uscita: '12:45', rientro: '13:20' }], uscita: '15:50', nota: 'riunione' },
      '2026-11-18': { ingresso: '07:55', pause: [{ uscita: '13:00', rientro: '13:30' }], uscita: '15:20' },
    },
  })));
  await page.reload();
  await page.getByRole('tab', { name: 'Storico' }).click();
  assert.equal(await testoDi(page, '#stGiorni'), '3');
  assert.equal(await page.locator('#righeStorico tr').count(), 3);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#esportaCSV')]);
  assert.equal(dl.suggestedFilename(), 'orario-2026-11.csv');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await page.fill('#ore-5', '6:00');
  await page.click('text=Salva impostazioni');
  await page.getByRole('tab', { name: 'Giornata' }).click();
  await page.fill('#ingresso', '08:00');
  assert.equal(await testoDi(page, '#mOre'), '6:00');
  assert.equal(await testoDi(page, '#heroTitolo'), '14:00');
  assert.deepEqual(errori, []);
  await ctx.close();
});

await prova('nessun overflow orizzontale su telefono piccolo', async () => {
  const { ctx, page } = await nuovaPagina({ viewport: { width: 320, height: 640 } });
  await page.fill('#ingresso', '08:10');
  await page.click('#aggiungiPausa');
  for (const tab of ['Giornata', 'Storico', 'Impostazioni']) {
    await page.getByRole('tab', { name: tab }).click();
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 320, `${tab}: larghezza ${w}`);
  }
  await ctx.close();
});

if (SCREENSHOT) {
  const dati = {
    giorni: {
      '2026-11-16': { ingresso: '08:02', pause: [{ uscita: '13:00', rientro: '13:30' }], uscita: '16:10' },
      '2026-11-17': { ingresso: '08:15', pause: [{ uscita: '12:45', rientro: '13:20' }], uscita: '15:50', nota: 'riunione' },
      '2026-11-18': { ingresso: '07:55', pause: [{ uscita: '13:00', rientro: '13:30' }], uscita: '15:20' },
      '2026-11-19': { ingresso: '08:00', pause: [{ uscita: '12:30', rientro: '13:05' }], uscita: '15:47' },
      '2026-11-20': { ingresso: '08:10', pause: [{ uscita: '10:30', rientro: '10:40' }, { uscita: '12:30', rientro: '13:00' }], uscita: '' },
    },
  };
  const formati = [
    ['telefono', { ...devices['iPhone 13'] }],
    ['desktop', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }],
  ];
  for (const [nome, opz] of formati) {
    for (const tema of ['chiaro', 'scuro']) {
      const { ctx, page } = await nuovaPagina({ ...opz, colorScheme: tema === 'scuro' ? 'dark' : 'light', reducedMotion: 'reduce' }, '2026-11-20T14:20:00');
      await page.evaluate((d) => localStorage.setItem('calcolatore-orario', JSON.stringify(d)), dati);
      await page.reload();
      await page.screenshot({ path: `docs/screenshot/dopo/${nome}-${tema}.png`, fullPage: true });
      if (tema === 'chiaro' || nome === 'telefono') {
        await page.getByRole('tab', { name: 'Storico' }).click();
        await page.screenshot({ path: `docs/screenshot/dopo/${nome}-${tema}-storico.png`, fullPage: true });
        await page.getByRole('tab', { name: 'Impostazioni' }).click();
        await page.screenshot({ path: `docs/screenshot/dopo/${nome}-${tema}-impostazioni.png`, fullPage: true });
      }
      await ctx.close();
    }
  }
  console.log('screenshot salvati in docs/screenshot/dopo/');
}

await browser.close();
server.close();
if (fallimenti) { console.log(`${fallimenti} prove fallite`); process.exit(1); }
console.log('tutte le prove superate');
