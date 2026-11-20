// Prova l'app in un browser vero (Playwright + Chromium).
//   node tools/e2e.mjs               → solo controlli
//   node tools/e2e.mjs --screenshot  → anche screenshot in docs/screenshot/dopo/
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { costruisciBookmarklet } from '../js/bookmarklet.js';

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

await prova('giornata tipo: uscita 15:52 e buono pasto 14:40, dati salvati', async () => {
  const { ctx, page, errori } = await nuovaPagina();
  await page.fill('#ingresso', '08:10');
  await page.click('#aggiungiPausa');
  await page.fill('#pausa-uscita-0', '12:30');
  await page.fill('#pausa-rientro-0', '13:00');
  assert.equal(await testoDi(page, '#oraGiornata'), '15:52');
  assert.equal(await testoDi(page, '#oraBuono'), '14:40');
  assert.equal(await testoDi(page, '#traGiornata'), 'tra 2:47:00');
  assert.equal(await testoDi(page, '#traBuono'), 'tra 1:35:00');
  assert.match(await testoDi(page, '#avvisoPausa'), /nessun minuto aggiunto/);
  await page.reload();
  assert.equal(await page.inputValue('#ingresso'), '08:10');
  assert.equal(await page.inputValue('#pausa-rientro-0'), '13:00');
  assert.equal(await testoDi(page, '#oraGiornata'), '15:52');
  assert.deepEqual(errori, []);
  await ctx.close();
});

await prova('regola ePAS: pausa pranzo di 20 minuti → si aggiungono solo 10 minuti', async () => {
  const { ctx, page } = await nuovaPagina();
  await page.fill('#ingresso', '08:10');
  await page.click('#aggiungiPausa');
  await page.fill('#pausa-uscita-0', '12:30');
  await page.fill('#pausa-rientro-0', '12:50');
  assert.equal(await testoDi(page, '#oraGiornata'), '15:52');
  assert.equal(await testoDi(page, '#oraBuono'), '14:40');
  assert.match(await testoDi(page, '#avvisoPausa'), /aggiunti 10 min/);
  await ctx.close();
});

await prova('pulsanti rapidi: ingresso, pausa, rientro; giornata e buono maturati', async () => {
  const { ctx, page, errori } = await nuovaPagina({}, '2026-11-20T08:00:00');
  await page.getByRole('button', { name: 'Timbra ingresso adesso' }).click();
  assert.equal(await page.inputValue('#ingresso'), '08:00');
  await page.clock.fastForward('04:30:00');
  await page.getByRole('button', { name: 'Vado in pausa adesso' }).click();
  assert.equal(await page.inputValue('#pausa-uscita-0'), '12:30');
  await page.clock.fastForward('00:40:00');
  await page.getByRole('button', { name: 'Rientro dalla pausa adesso' }).click();
  assert.equal(await page.inputValue('#pausa-rientro-0'), '13:10');
  assert.equal(await testoDi(page, '#oraGiornata'), '15:52');
  assert.equal(await testoDi(page, '#oraBuono'), '14:40');
  await page.clock.fastForward('03:00:00');
  assert.equal(await testoDi(page, '#traGiornata'), '✓ Puoi uscire');
  assert.match(await testoDi(page, '#traBuono'), /maturato/);
  assert.deepEqual(errori, []);
  await ctx.close();
});

await prova('festa quando matura: messaggio sempre, coriandoli solo senza «riduci movimento»', async () => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { ctx, page, errori } = await nuovaPagina({ reducedMotion }, '2026-11-20T14:49:30');
    await page.evaluate(() => localStorage.setItem('calcolatore-orario', JSON.stringify({ giorno: { data: '2026-11-20', ingresso: '08:10', pause: [{ uscita: '10:30', rientro: '10:40' }, { uscita: '12:30', rientro: '13:00' }] } })));
    await page.reload();
    assert.match(await testoDi(page, '#traBuono'), /^tra 0:00:3/);
    await page.clock.fastForward('00:01:00');
    assert.match(await testoDi(page, '#toast'), /Buono pasto maturato/);
    const disegnato = await page.evaluate(() => document.getElementById('coriandoli').width === Math.round(innerWidth * Math.min(2, devicePixelRatio || 1)));
    assert.equal(disegnato, reducedMotion === 'no-preference', `coriandoli con ${reducedMotion}`);
    assert.deepEqual(errori, []);
    await ctx.close();
  }
});

await prova('regole: ore da fare 6:00', async () => {
  const { ctx, page, errori } = await nuovaPagina();
  await page.click('#btnRegole');
  await page.fill('#impOre', '6:00');
  await page.getByRole('button', { name: 'Salva' }).click();
  await page.fill('#ingresso', '08:00');
  assert.equal(await testoDi(page, '#oraGiornata'), '14:00');
  assert.equal(await testoDi(page, '#oraBuono'), '14:30');
  assert.match(await testoDi(page, '#notaRegole'), /personalizzate/);
  assert.deepEqual(errori, []);
  await ctx.close();
});

await prova('il giorno dopo si riparte da zero', async () => {
  const { ctx, page } = await nuovaPagina();
  await page.evaluate(() => localStorage.setItem('calcolatore-orario', JSON.stringify({ giorno: { data: '2026-11-19', ingresso: '08:00', pause: [] } })));
  await page.reload();
  assert.equal(await page.inputValue('#ingresso'), '');
  assert.equal(await testoDi(page, '#oraGiornata'), '--:--');
  await ctx.close();
});

await prova('nessun overflow orizzontale su telefono piccolo', async () => {
  const { ctx, page } = await nuovaPagina({ viewport: { width: 320, height: 640 } });
  await page.fill('#ingresso', '08:10');
  await page.click('#aggiungiPausa');
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(w <= 320, `larghezza ${w}`);
  await ctx.close();
});

// ─── Pulsante ePAS (bookmarklet) su pagine di prova con dati inventati ───
const LETTORE = await readFile(join(RADICE, 'js/epas-lettore.js'), 'utf8');
const BOOKMARKLET = costruisciBookmarklet(LETTORE, URL_APP);
async function usaBookmarklet(fixture, query = '?month=11&year=2026') {
  const ctx = await browser.newContext({ locale: 'it-IT', timezoneId: 'Europe/Rome' });
  await ctx.clock.install({ time: new Date('2026-11-20T14:20:00+01:00') });
  const page = await ctx.newPage();
  const richiesteEsterne = [];
  await page.goto(`${URL_APP}tests/fixtures/${fixture}${query}`);
  page.on('request', (r) => richiesteEsterne.push(r.url()));
  let avviso = null;
  page.on('dialog', async (d) => { avviso = d.message(); await d.dismiss(); });
  const nuova = ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null);
  await page.evaluate(decodeURIComponent(BOOKMARKLET.slice('javascript:'.length)));
  const app = await nuova;
  return { ctx, page, app, avviso, richiesteEsterne };
}

await prova('ePAS: giornata normale → ingresso, pause e regole nel calcolatore', async () => {
  const { ctx, app, avviso, richiesteEsterne } = await usaBookmarklet('epas-normale.html');
  assert.equal(avviso, null);
  assert.ok(app, 'il calcolatore non si è aperto');
  assert.match(app.url(), /#epas=/);
  await app.waitForLoadState();
  await app.waitForFunction(() => document.querySelector('#oraGiornata').textContent !== '--:--');
  assert.equal(await app.inputValue('#ingresso'), '08:10');
  assert.equal(await app.inputValue('#pausa-uscita-1'), '12:30');
  assert.equal(await app.inputValue('#pausa-rientro-1'), '13:00');
  assert.equal(await app.locator('#oraGiornata').textContent(), '16:02');
  assert.equal(await app.locator('#oraBuono').textContent(), '14:50');
  assert.ok(!app.url().includes('#'), 'il frammento va tolto dopo l\'importazione');
  assert.deepEqual(richiesteEsterne.filter((u) => u.includes('fixtures')), []);
  await ctx.close();
});

await prova('ePAS: uscite per servizio ignorate, regole «Maternità» lette dal popover', async () => {
  const { ctx, app } = await usaBookmarklet('epas-servizio.html');
  await app.waitForFunction(() => document.querySelector('#oraGiornata').textContent !== '--:--');
  assert.equal(await app.inputValue('#ingresso'), '07:58');
  assert.equal(await app.locator('#listaPause li').count(), 1);
  assert.equal(await app.inputValue('#pausa-uscita-0'), '12:30');
  assert.match(await app.locator('#notaRegole').textContent(), /5:12 al giorno · buono pasto dopo 4:00/);
  assert.equal(await app.locator('#oraGiornata').textContent(), '13:40'); // 7:58 + 5:12 + 20 + 10
  await ctx.close();
});

await prova('ePAS: in pausa adesso (ultima timbratura un\'uscita), quattro coppie', async () => {
  const { ctx, app } = await usaBookmarklet('epas-in-pausa.html');
  await app.waitForFunction(() => document.querySelector('#oraGiornata').textContent !== '--:--');
  assert.equal(await app.inputValue('#pausa-uscita-1'), '12:40');
  assert.equal(await app.inputValue('#pausa-rientro-1'), '');
  assert.ok(await app.getByRole('button', { name: 'Rientro dalla pausa adesso' }).isVisible());
  await ctx.close();
});

await prova('ePAS: la data si legge anche senza parametri nell\'indirizzo', async () => {
  const { ctx, app } = await usaBookmarklet('epas-normale.html', '');
  assert.ok(app);
  await ctx.close();
});

for (const [fixture, query, atteso] of [
  ['epas-ferie.html', '?month=11&year=2026', /non c'è ancora un ingresso/],
  ['epas-ottobre.html', '?month=10&year=2026', /mese corrente/],
  ['non-epas.html', '', /Apri il cartellino/],
]) {
  await prova(`ePAS: messaggio chiaro su ${fixture}`, async () => {
    const { ctx, app, avviso } = await usaBookmarklet(fixture, query);
    assert.equal(app, null);
    assert.match(avviso || '', atteso);
    await ctx.close();
  });
}

await prova('pagina di istruzioni: pulsante pronto e codice copiabile', async () => {
  const { ctx, page, errori } = await nuovaPagina();
  await page.goto(URL_APP + 'epas.html');
  await page.waitForFunction(() => document.getElementById('codice').value.startsWith('javascript:'));
  const href = await page.getAttribute('#bookmarklet', 'href');
  assert.ok(href.startsWith('javascript:') && href.length < 8000, `lunghezza ${href.length}`);
  assert.deepEqual(errori, []);
  await ctx.close();
});

if (SCREENSHOT) {
  const dati = { giorno: { data: '2026-11-20', ingresso: '08:10', pause: [{ uscita: '10:30', rientro: '10:40' }, { uscita: '12:30', rientro: '13:00' }] } };
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
      if (nome === 'telefono' && tema === 'chiaro') {
        await page.click('#btnRegole');
        await page.screenshot({ path: `docs/screenshot/dopo/${nome}-${tema}-regole.png` });
      }
      if (tema === 'scuro') {
        // schermo intero (simulato: in un browser senza finestra non si può attivare davvero)
        await page.evaluate(() => document.body.classList.add('intero'));
        await page.screenshot({ path: `docs/screenshot/dopo/${nome}-${tema}-schermo-intero.png` });
        await page.evaluate(() => document.body.classList.remove('intero'));
        await page.clock.fastForward('01:45:00');
        await page.screenshot({ path: `docs/screenshot/dopo/${nome}-${tema}-maturata.png` });
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
