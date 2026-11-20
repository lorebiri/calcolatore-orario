// Calcolatore orario: a che ora matura la giornata e a che ora matura il buono pasto.
// I dati (timbrature di oggi e regole) restano in localStorage su questo dispositivo.
import { REGOLE_DEFAULT, calcolaGiornata, parseHHMM, parseDurata, fmtOra, fmtDurata, pad, dateKey } from './calc.js';

const VERSIONE = '2.2.0';
const CHIAVE = 'calcolatore-orario';
const CHIAVE_AVVISI = 'calcolatore-orario-avvisi';
const $ = (s) => document.querySelector(s);

const REGOLE_EPAS = { ore: 432, soglia: REGOLE_DEFAULT.soglia, pausaMin: REGOLE_DEFAULT.pausaMin, finestraDa: REGOLE_DEFAULT.finestraDa, finestraA: REGOLE_DEFAULT.finestraA };
const oraDi = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
const adessoHHMM = () => oraDi(new Date());
const oggi = () => dateKey(new Date());

// ─────────── Stato ───────────
function giornoVuoto(data = oggi()) { return { data, ingresso: '', pause: [] }; }

function carica() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch { /* illeggibile */ }
  const imp = { ...REGOLE_EPAS, tema: 'auto', notifiche: false, ...(s?.impostazioni || {}) };
  if (Array.isArray(imp.ore)) imp.ore = imp.ore[1] || 432; // formato di prova precedente
  let giorno = s?.giorno;
  if (!giorno && s?.giorni) {
    const g = s.giorni[oggi()];
    giorno = g ? { data: oggi(), ingresso: g.ingresso || '', pause: g.pause || [] } : null;
  }
  return { impostazioni: imp, giorno: tieniGiorno(giorno, imp) ? giorno : giornoVuoto() };
}

// La giornata salvata vale per oggi, o finché un turno iniziato ieri è ancora in corso (dopo mezzanotte)
function tieniGiorno(g, imp) {
  if (!g?.data || !Array.isArray(g.pause)) return false;
  if (g.data === oggi()) return true;
  if (!g.ingresso) return false;
  const c = calcolaGiornata({ ...g, ore: imp.ore }, g.data, imp, new Date());
  return c.stato === 'in-corso' || c.stato === 'pausa';
}

let stato = carica();
const regole = () => stato.impostazioni;

function salva() {
  const g = stato.giorno;
  const pulito = { ...g, pause: g.pause.filter((p) => p.uscita || p.rientro) };
  try {
    localStorage.setItem(CHIAVE, JSON.stringify({ versione: 3, impostazioni: stato.impostazioni, giorno: pulito }));
  } catch { toast('Attenzione: impossibile salvare su questo dispositivo'); }
}

function modifica(fn, ridisegna = false) {
  fn(stato.giorno);
  salva();
  if (ridisegna) disegnaForm();
  aggiorna();
}

let timerToast;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('visibile');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('visibile'), 3000);
}

function el(tag, attrs = {}, ...figli) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...figli);
  return n;
}

// ─────────── Timbrature ───────────
const inIngresso = $('#ingresso');
const listaPause = $('#listaPause');

function disegnaForm() {
  inIngresso.value = stato.giorno.ingresso || '';
  listaPause.replaceChildren(...stato.giorno.pause.map(rigaPausa));
}

function rigaPausa(p, i) {
  const n = i + 1;
  const campo = (nome, etichetta) => {
    const id = `pausa-${nome}-${i}`;
    return el('div', { class: 'campo' },
      el('label', { for: id, text: etichetta }),
      el('div', { class: 'riga-input' },
        el('input', { type: 'time', id, step: '60', value: p[nome] || '', oninput: (e) => modifica((g) => { g.pause[i][nome] = e.target.value; }) }),
        el('button', {
          type: 'button', class: 'btn-adesso', 'aria-label': `${etichetta} pausa ${n}: adesso`, text: 'Adesso',
          onclick: () => { const v = adessoHHMM(); document.getElementById(id).value = v; modifica((g) => { g.pause[i][nome] = v; }); },
        }),
      ),
    );
  };
  const x = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  x.setAttribute('viewBox', '0 0 24 24');
  x.setAttribute('aria-hidden', 'true');
  const linea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  for (const [k, v] of Object.entries({ d: 'M6 6l12 12M18 6 6 18', stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round' })) linea.setAttribute(k, v);
  x.append(linea);
  return el('li', { class: 'pausa' },
    el('div', { class: 'pausa-testa' },
      el('span', { class: 'pausa-titolo', text: `Pausa ${n} ` }, el('span', { class: 'pausa-info', id: `pausa-info-${i}` })),
      el('button', {
        type: 'button', class: 'btn-rimuovi', 'aria-label': `Rimuovi pausa ${n}`,
        onclick: () => {
          stato.giorno.pause.splice(i, 1);
          salva(); disegnaForm(); aggiorna();
          $('#aggiungiPausa').focus();
        },
      }, x),
    ),
    el('div', { class: 'pausa-campi' }, campo('uscita', 'Uscita'), campo('rientro', 'Rientro')),
  );
}

inIngresso.addEventListener('input', () => modifica((g) => { g.ingresso = inIngresso.value; }));
$('#ingressoAdesso').addEventListener('click', () => { inIngresso.value = adessoHHMM(); modifica((g) => { g.ingresso = inIngresso.value; }); });
$('#aggiungiPausa').addEventListener('click', () => {
  const i = stato.giorno.pause.length;
  stato.giorno.pause.push({ uscita: '', rientro: '' });
  listaPause.append(rigaPausa({}, i));
  document.getElementById(`pausa-uscita-${i}`).focus();
});
$('#azzera').addEventListener('click', () => {
  if (!stato.giorno.ingresso && !stato.giorno.pause.length) return;
  if (!confirm('Cancellare le timbrature di oggi?')) return;
  stato.giorno = giornoVuoto();
  salva(); disegnaForm(); aggiorna();
  toast('Giornata azzerata');
});

// Pulsante grande per timbrare al volo
function disegnaAzione(c) {
  const box = $('#azioneRapida');
  let voce = null;
  if (c.stato === 'vuoto') {
    voce = ['Timbra ingresso adesso', () => { const v = adessoHHMM(); modifica((g) => { g.ingresso = v; }, true); toast('Ingresso alle ' + v); }];
  } else if (c.stato === 'pausa') {
    voce = ['Rientro dalla pausa adesso', () => { const v = adessoHHMM(); modifica((g) => { g.pause[c.inCorso.indice].rientro = v; }, true); toast('Rientro alle ' + v); }];
  } else if (c.stato === 'in-corso' && c.alFine > 0) {
    voce = ['Vado in pausa adesso', () => {
      const v = adessoHHMM();
      modifica((g) => { g.pause = g.pause.filter((p) => p.uscita || p.rientro); g.pause.push({ uscita: v, rientro: '' }); }, true);
      toast('In pausa dalle ' + v);
    }];
  }
  const firma = voce ? voce[0] : '';
  if (box.dataset.firma === firma) return;
  box.dataset.firma = firma;
  box.replaceChildren(...(voce ? [el('button', { type: 'button', class: 'btn btn-primario btn-grande', text: voce[0], onclick: voce[1] })] : []));
}

// ─────────── Risultati ───────────
function testo(id, t) { const n = document.getElementById(id); if (n.textContent !== t) n.textContent = t; }

function risultato(nome, ora, mancano, maturato, perc, attivo, testoMaturato) {
  testo('ora' + nome, ora);
  document.getElementById('r' + nome).classList.toggle('maturato', attivo && maturato);
  document.getElementById('barra' + nome).style.width = (attivo ? Math.max(0, Math.min(100, perc)) : 0) + '%';
  testo('tra' + nome, !attivo ? ' ' : maturato ? testoMaturato : `tra ${fmtDurata(mancano)}`);
}

function aggiorna() {
  const g = stato.giorno;
  const imp = regole();
  const adesso = new Date();
  const c = calcolaGiornata({ ...g, ore: imp.ore }, g.data, imp, adesso);
  disegnaAzione(c);

  const attivo = c.stato === 'in-corso' || c.stato === 'pausa';
  if (c.stato === 'vuoto') {
    risultato('Giornata', '--:--', 0, false, 0, false);
    risultato('Buono', '--:--', 0, false, 0, false);
    testo('traGiornata', 'Inserisci l\'ingresso');
  } else {
    const trascorsi = (adesso - c.ingresso) / 60000;
    const durata = (d) => Math.max(1, (d - c.ingresso) / 60000);
    risultato('Giornata', oraDi(c.fineGiornata), c.alFine, c.alFine <= 0, trascorsi / durata(c.fineGiornata) * 100, attivo, '✓ Maturata: puoi uscire');
    risultato('Buono', oraDi(c.buonoPasto), c.alBuono, c.buonoMaturato, trascorsi / durata(c.buonoPasto) * 100, attivo, '✓ Maturato');
    if (c.stato === 'futuro') testo('traGiornata', 'Ingresso alle ' + g.ingresso);
  }

  // durata delle pause, pausa pranzo ed errori
  g.pause.forEach((p, i) => {
    const info = document.getElementById(`pausa-info-${i}`);
    const d = c.pause?.[i];
    if (info) {
      const t = !d ? '' : `(${fmtDurata(d.durata)}${d.aperta ? ', in corso' : ''}${d.pranzo !== undefined ? ' · pranzo' : ''})`;
      if (info.textContent !== t) info.textContent = t;
      info.classList.toggle('ok', d?.pranzo !== undefined);
    }
    const err = (c.errori || []).some((e) => e.campo === 'pausa' && e.indice === i);
    document.getElementById(`pausa-rientro-${i}`)?.toggleAttribute('aria-invalid', err && !!p.rientro);
  });
  const errori = (c.errori || []).map((e) => e.msg);
  const lista = $('#errori');
  if (lista.dataset.v !== errori.join('|')) { lista.dataset.v = errori.join('|'); lista.replaceChildren(...errori.map((m) => el('li', { text: m }))); }

  const avviso = $('#avvisoPausa');
  let t = '', cls = 'avviso';
  if (c.stato !== 'vuoto' && c.richiedePausa) {
    if (c.pranzoOk) { t = `Pausa pranzo di ${c.pausaPranzo} min: nessun minuto aggiunto`; cls += ' ok'; }
    else if (c.pausaPranzo > 0) { t = `Pausa pranzo di ${c.pausaPranzo} min: aggiunti ${c.mancaPausa} min per arrivare a ${imp.pausaMin}`; cls += ' attenzione'; }
    else { t = `Nessuna pausa tra le ${fmtOra(imp.finestraDa)} e le ${fmtOra(imp.finestraA)}: aggiunti ${imp.pausaMin} min`; cls += ' attenzione'; }
  }
  if (avviso.textContent !== t) avviso.textContent = t;
  avviso.className = cls;

  controllaAvvisi(c);
}

// ─────────── Avvisi (facoltativi) ───────────
function controllaAvvisi(c) {
  if (!regole().notifiche || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (c.stato !== 'in-corso' && c.stato !== 'pausa') return;
  let a;
  try { a = JSON.parse(localStorage.getItem(CHIAVE_AVVISI) || '{}'); } catch { a = {}; }
  if (a.data !== stato.giorno.data || !Array.isArray(a.inviati)) a = { data: stato.giorno.data, inviati: [] };
  const invia = (id, titolo, corpo) => {
    if (a.inviati.includes(id)) return;
    a.inviati.push(id);
    localStorage.setItem(CHIAVE_AVVISI, JSON.stringify(a));
    mostraNotifica(titolo, corpo);
  };
  // solo se appena successo (entro 10 minuti), per non avvisare all'apertura dell'app
  if (c.alBuono <= 0 && c.alBuono > -10) invia('buono', 'Buono pasto maturato', `Dalle ${oraDi(c.buonoPasto)}`);
  if (c.alFine <= 0 && c.alFine > -10) invia('fine', 'Giornata maturata: puoi uscire', `Dalle ${oraDi(c.fineGiornata)}`);
}
async function mostraNotifica(titolo, corpo) {
  const opz = { body: corpo, icon: 'icons/icon-192.png', tag: titolo, lang: 'it' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(titolo, opz); return; }
  } catch { /* si prova sotto */ }
  try { new Notification(titolo, opz); } catch { /* non supportate */ }
}

// ─────────── Regole ───────────
const dlg = $('#dlgRegole');
function notaRegole() {
  const r = regole();
  const epas = ['ore', 'soglia', 'pausaMin', 'finestraDa', 'finestraA'].every((k) => r[k] === REGOLE_EPAS[k]);
  $('#notaRegole').textContent = `Regole ${epas ? 'ePAS' : 'personalizzate'}: ${fmtDurata(r.ore)} al giorno · buono pasto dopo ${fmtDurata(r.soglia)} · pausa minima ${r.pausaMin} min tra le ${fmtOra(r.finestraDa)} e le ${fmtOra(r.finestraA)}`;
}
function riempiRegole(r) {
  $('#impOre').value = fmtDurata(r.ore);
  $('#impSoglia').value = fmtDurata(r.soglia);
  $('#impPausa').value = String(r.pausaMin);
  $('#impDa').value = fmtOra(r.finestraDa);
  $('#impA').value = fmtOra(r.finestraA);
  $('#erroriRegole').textContent = '';
  dlg.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
}
$('#btnRegole').addEventListener('click', () => {
  riempiRegole(regole());
  const n = $('#impNotifiche');
  if (!('Notification' in window)) {
    n.disabled = true;
    $('#notificheInfo').textContent = 'Questo browser non supporta le notifiche. Su iPhone: aggiungi l\'app alla schermata Home.';
  } else n.checked = !!regole().notifiche && Notification.permission === 'granted';
  dlg.showModal();
});
$('#regoleDefault').addEventListener('click', () => riempiRegole(REGOLE_EPAS));
$('#formRegole').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'salva') return;
  const errori = [];
  const verifica = (id, ok, msg) => { $(id).toggleAttribute('aria-invalid', !ok); if (!ok) errori.push(msg); };
  const ore = parseDurata($('#impOre').value);
  verifica('#impOre', ore !== null && ore > 0 && ore <= 1440, 'Ore da fare non valide (es. 7:12)');
  const soglia = parseDurata($('#impSoglia').value);
  verifica('#impSoglia', soglia !== null && soglia <= 1440, 'Soglia del buono pasto non valida (es. 6:00)');
  const pausa = Number($('#impPausa').value);
  verifica('#impPausa', $('#impPausa').value !== '' && Number.isInteger(pausa) && pausa >= 0 && pausa <= 180, 'Pausa minima non valida (0–180 minuti)');
  const da = parseHHMM($('#impDa').value), a = parseHHMM($('#impA').value);
  const okF = da !== null && a !== null && da < a;
  verifica('#impDa', okF, 'Fascia della pausa pranzo non valida');
  $('#impA').toggleAttribute('aria-invalid', !okF);
  if (errori.length) { e.preventDefault(); $('#erroriRegole').textContent = errori.join('. '); return; }
  Object.assign(stato.impostazioni, { ore, soglia, pausaMin: pausa, finestraDa: da, finestraA: a });
  salva(); notaRegole(); aggiorna();
  toast('Regole salvate');
});
$('#impNotifiche').addEventListener('change', async (e) => {
  if (e.target.checked && (await Notification.requestPermission()) !== 'granted') {
    e.target.checked = false;
    toast('Permesso per le notifiche negato dal browser');
    return;
  }
  stato.impostazioni.notifiche = e.target.checked;
  salva();
});

// ─────────── Tema ───────────
const NOMI_TEMA = { auto: 'automatico', chiaro: 'chiaro', scuro: 'scuro' };
function applicaTema() {
  const t = stato.impostazioni.tema in NOMI_TEMA ? stato.impostazioni.tema : 'auto';
  if (t === 'auto') delete document.documentElement.dataset.tema; else document.documentElement.dataset.tema = t;
  $('#btnTema').setAttribute('aria-label', `Cambia tema (ora: ${NOMI_TEMA[t]})`);
}
$('#btnTema').addEventListener('click', () => {
  const ordine = ['auto', 'chiaro', 'scuro'];
  stato.impostazioni.tema = ordine[(ordine.indexOf(stato.impostazioni.tema) + 1) % 3];
  salva(); applicaTema();
  toast('Tema ' + NOMI_TEMA[stato.impostazioni.tema]);
});

// ─────────── Importazione da ePAS (pulsante nei preferiti) ───────────
// Il pulsante apre l'app con i dati nel frammento #epas=… : il frammento non arriva a nessun server.
function importaDaEpas() {
  const m = /^#epas=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  let d;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    d = JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch { toast('Dati da ePAS non leggibili: riprova dal cartellino'); return; }
  const ora = (v) => (typeof v === 'string' && (v === '' || parseHHMM(v) !== null) ? v : null);
  const valido = d && d.v === 1 && /^\d{4}-\d{2}-\d{2}$/.test(d.d) && ora(d.i) && Array.isArray(d.p)
    && d.p.every((x) => Array.isArray(x) && ora(x[0]) && ora(x[1]) !== null);
  if (!valido) { toast('Dati da ePAS non validi: riprova dal cartellino'); return; }
  if (d.d !== oggi()) { toast('Il cartellino letto non è di oggi: niente importato'); return; }
  stato.giorno = { data: d.d, ingresso: d.i, pause: d.p.map(([uscita, rientro]) => ({ uscita, rientro })) };
  const r = d.r || {};
  const num = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
  const nuove = { ore: num(r.ore, 1440), soglia: num(r.soglia, 1440), pausaMin: num(r.pausaMin, 180), finestraDa: num(r.finestraDa, 1439), finestraA: num(r.finestraA, 1439) };
  if (nuove.ore === 0) nuove.ore = null;
  if (nuove.finestraDa !== null && nuove.finestraA !== null && nuove.finestraDa >= nuove.finestraA) { nuove.finestraDa = null; nuove.finestraA = null; }
  for (const [k, v] of Object.entries(nuove)) if (v !== null) stato.impostazioni[k] = v;
  salva();
  const np = d.p.length;
  toast(`Da ePAS: ingresso ${d.i}${np ? `, ${np} ${np === 1 ? 'pausa' : 'pause'}` : ''}${d.r ? ' e regole del giorno' : ''}`);
}

// ─────────── Avvio ───────────
$('#versione').textContent = 'v' + VERSIONE;
importaDaEpas();
applicaTema();
notaRegole();
disegnaForm();
aggiorna();
setInterval(() => {
  // finita la giornata, il giorno dopo si riparte da zero
  if (!tieniGiorno(stato.giorno, regole())) { stato.giorno = giornoVuoto(); salva(); disegnaForm(); }
  aggiorna();
}, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) aggiorna(); });
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#epas=')) { importaDaEpas(); notaRegole(); disegnaForm(); aggiorna(); } });
window.addEventListener('storage', (e) => { if (e.key === CHIAVE) { stato = carica(); applicaTema(); notaRegole(); disegnaForm(); aggiorna(); } });
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline non disponibile */ });
}
