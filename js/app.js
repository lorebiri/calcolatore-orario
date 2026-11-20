// Interfaccia del calcolatore. Tutti i dati restano in localStorage su questo dispositivo.
import {
  REGOLE_DEFAULT, calcolaGiornata, riepilogo, esportaCSV,
  parseHHMM, parseDurata, fmtOra, fmtDurata, fmtSaldo, pad,
  dateKey, parseKey, addDays, lunedi, oreDelGiorno,
} from './calc.js';

const VERSIONE = '2.0.0';
const CHIAVE = 'calcolatore-orario';
const CHIAVE_AVVISI = 'calcolatore-orario-avvisi';

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...figli) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const f of figli) if (f != null) n.append(f);
  return n;
};

const NOMI_GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const fmtData = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDataBreve = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric' });
const fmtMese = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
const oraDi = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
const adessoHHMM = () => oraDi(new Date());

// ─────────── Stato e salvataggio ───────────
const IMPOSTAZIONI_DEFAULT = { ...REGOLE_DEFAULT, ore: [...REGOLE_DEFAULT.ore], tema: 'auto', notifiche: false };

function carica() {
  try {
    const s = JSON.parse(localStorage.getItem(CHIAVE) || 'null');
    if (s && typeof s === 'object') {
      return {
        versione: 2,
        impostazioni: { ...IMPOSTAZIONI_DEFAULT, ...(s.impostazioni || {}) },
        giorni: (s.giorni && typeof s.giorni === 'object') ? s.giorni : {},
      };
    }
  } catch { /* dati illeggibili: si riparte */ }
  return { versione: 2, impostazioni: { ...IMPOSTAZIONI_DEFAULT, ore: [...IMPOSTAZIONI_DEFAULT.ore] }, giorni: {} };
}

let stato = carica();
let salvataggioFallito = false;
// In memoria possono esserci pause ancora vuote (appena aggiunte): su disco salvo solo i dati veri.
function giornoVuoto(g) {
  return !g.ingresso && !g.uscita && !(g.pause || []).some((p) => p.uscita || p.rientro) && !g.nota && !Number.isFinite(g.ore);
}
function datiPuliti() {
  const giorni = {};
  for (const [k, g] of Object.entries(stato.giorni)) {
    if (giornoVuoto(g)) continue;
    giorni[k] = { ...g, pause: (g.pause || []).filter((p) => p.uscita || p.rientro) };
  }
  return { versione: 2, impostazioni: stato.impostazioni, giorni };
}
function salva() {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(datiPuliti()));
    salvataggioFallito = false;
  } catch {
    if (!salvataggioFallito) toast('Attenzione: impossibile salvare su questo dispositivo');
    salvataggioFallito = true;
  }
}

const regole = () => stato.impostazioni;
const oggi = () => dateKey(new Date());

// Giorno da mostrare all'apertura: oggi, oppure ieri se c'è un turno ancora aperto (es. dopo mezzanotte)
function giornoPredefinito() {
  const k = oggi();
  const ieri = addDays(k, -1);
  const g = stato.giorni[ieri];
  if (!stato.giorni[k]?.ingresso && g?.ingresso && !g.uscita) {
    const c = calcolaGiornata(g, ieri, regole(), new Date());
    if (c.stato !== 'scaduta' && c.stato !== 'vuoto') return ieri;
  }
  return k;
}

let chiaveGiorno = giornoPredefinito();
let seguiOggi = true;
let meseStorico = chiaveGiorno.slice(0, 7);

function giorno(k = chiaveGiorno) {
  if (!stato.giorni[k]) stato.giorni[k] = { ingresso: '', pause: [], uscita: '' };
  const g = stato.giorni[k];
  if (!Array.isArray(g.pause)) g.pause = [];
  return g;
}

// toglie dalla memoria pause e giorni vuoti (prima di ridisegnare)
function pulisci() {
  stato.giorni = datiPuliti().giorni;
}

function modifica(fn, { ridisegnaForm = false } = {}) {
  fn(giorno());
  salva();
  if (ridisegnaForm) disegnaForm();
  aggiorna();
}

// ─────────── Toast ───────────
let timerToast;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('visibile');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('visibile'), 3200);
}

// ─────────── Schede ───────────
const schede = [...document.querySelectorAll('[role="tab"]')];
function apriScheda(id, focus = false) {
  for (const t of schede) {
    const attiva = t.id === id;
    t.setAttribute('aria-selected', String(attiva));
    t.tabIndex = attiva ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !attiva;
    if (attiva && focus) t.focus();
  }
  if (id === 'tab-storico') disegnaStorico();
  if (id === 'tab-impostazioni') disegnaImpostazioni();
}
schede.forEach((t, i) => {
  t.addEventListener('click', () => apriScheda(t.id));
  t.addEventListener('keydown', (e) => {
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % schede.length;
    if (e.key === 'ArrowLeft') j = (i - 1 + schede.length) % schede.length;
    if (e.key === 'Home') j = 0;
    if (e.key === 'End') j = schede.length - 1;
    if (j !== null) { e.preventDefault(); apriScheda(schede[j].id, true); }
  });
});

// ─────────── Giornata: form ───────────
const inIngresso = $('#ingresso');
const inUscita = $('#uscita');
const inOre = $('#oreGiorno');
const inNota = $('#nota');
const listaPause = $('#listaPause');

function disegnaForm() {
  const g = stato.giorni[chiaveGiorno] || { ingresso: '', pause: [], uscita: '' };
  inIngresso.value = g.ingresso || '';
  inUscita.value = g.uscita || '';
  inOre.value = Number.isFinite(g.ore) ? fmtDurata(g.ore) : '';
  inOre.placeholder = fmtDurata(oreDelGiorno(chiaveGiorno, regole()));
  inOre.removeAttribute('aria-invalid');
  inNota.value = g.nota || '';

  listaPause.replaceChildren(...(g.pause || []).map((p, i) => rigaPausa(p, i)));

  const k = chiaveGiorno;
  const titolo = k === oggi() ? 'Oggi, ' + fmtData.format(parseKey(k))
    : k === addDays(oggi(), -1) ? 'Ieri, ' + fmtData.format(parseKey(k))
      : fmtData.format(parseKey(k));
  $('#titoloGiorno').textContent = titolo;
  $('#vaiOggi').hidden = k === oggi();
}

function rigaPausa(p, i) {
  const n = i + 1;
  const idU = `pausa-u-${i}`, idR = `pausa-r-${i}`;
  const campo = (id, etichetta, valore, campoNome) => el('div', {},
    el('label', { for: id, text: etichetta }),
    el('div', { class: 'riga-input' },
      el('input', {
        type: 'time', id, step: '60', value: valore || '',
        oninput: (e) => modifica((g) => { g.pause[i][campoNome] = e.target.value; }),
      }),
      el('button', {
        type: 'button', class: 'btn-adesso', 'aria-label': `${etichetta} pausa ${n}: adesso`, text: 'Adesso',
        onclick: () => { const v = adessoHHMM(); document.getElementById(id).value = v; modifica((g) => { g.pause[i][campoNome] = v; }); },
      }),
    ),
  );
  return el('li', { class: 'pausa' },
    el('div', { class: 'pausa-testa' },
      el('span', {}, el('span', { class: 'pausa-titolo', text: `Pausa ${n}` }), el('span', { class: 'pausa-info', id: `pausa-info-${i}` })),
      el('button', {
        type: 'button', class: 'btn-rimuovi', 'aria-label': `Rimuovi pausa ${n}`,
        onclick: () => {
          const tolta = giorno().pause[i];
          giorno().pause.splice(i, 1);
          pulisci();
          salva();
          disegnaForm();
          aggiorna();
          $('#aggiungiPausa').focus();
          if (tolta && (tolta.uscita || tolta.rientro)) toast(`Pausa ${n} rimossa`);
        },
      }, iconaX()),
    ),
    el('div', { class: 'pausa-campi' },
      campo(idU, 'Uscita', p.uscita, 'uscita'),
      campo(idR, 'Rientro', p.rientro, 'rientro'),
    ),
  );
}

function iconaX() {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  const pth = document.createElementNS(ns, 'path');
  pth.setAttribute('d', 'M6 6l12 12M18 6 6 18');
  pth.setAttribute('stroke', 'currentColor');
  pth.setAttribute('stroke-width', '2.4');
  pth.setAttribute('stroke-linecap', 'round');
  s.append(pth);
  return s;
}

inIngresso.addEventListener('input', () => modifica((g) => { g.ingresso = inIngresso.value; }));
inUscita.addEventListener('input', () => modifica((g) => { g.uscita = inUscita.value; }));
inNota.addEventListener('input', () => modifica((g) => { g.nota = inNota.value.trim() || undefined; }));
inOre.addEventListener('change', () => {
  const v = inOre.value.trim();
  if (!v) { inOre.removeAttribute('aria-invalid'); modifica((g) => { delete g.ore; }); return; }
  const m = parseDurata(v);
  if (m === null || m > 24 * 60) { inOre.setAttribute('aria-invalid', 'true'); toast('Ore non valide: usa il formato 7:12'); return; }
  inOre.removeAttribute('aria-invalid');
  inOre.value = fmtDurata(m);
  modifica((g) => { g.ore = m; });
});
document.querySelectorAll('[data-adesso]').forEach((b) => b.addEventListener('click', () => {
  const campo = b.dataset.adesso;
  const v = adessoHHMM();
  (campo === 'ingresso' ? inIngresso : inUscita).value = v;
  modifica((g) => { g[campo] = v; });
}));

$('#aggiungiPausa').addEventListener('click', () => {
  // la pausa vuota resta solo in memoria finché non viene compilata
  const pause = giorno().pause;
  const i = pause.length;
  pause.push({ uscita: '', rientro: '' });
  listaPause.append(rigaPausa({}, i));
  document.getElementById(`pausa-u-${i}`).focus();
});

$('#svuotaGiorno').addEventListener('click', () => {
  if (!stato.giorni[chiaveGiorno]) return;
  if (!confirm('Cancellare tutte le timbrature di questo giorno?')) return;
  delete stato.giorni[chiaveGiorno];
  salva();
  disegnaForm();
  aggiorna();
  toast('Giorno svuotato');
});

function vaiAlGiorno(k) {
  pulisci();
  chiaveGiorno = k;
  seguiOggi = k === oggi();
  disegnaForm();
  aggiorna();
}
$('#giornoPrec').addEventListener('click', () => vaiAlGiorno(addDays(chiaveGiorno, -1)));
$('#giornoSucc').addEventListener('click', () => vaiAlGiorno(addDays(chiaveGiorno, 1)));
$('#vaiOggi').addEventListener('click', () => vaiAlGiorno(oggi()));

// ─────────── Azioni rapide ───────────
function azioneRapida(testo, primario, fn) {
  return el('button', { type: 'button', class: `btn btn-grande ${primario ? 'btn-primario' : 'btn-secondario'}`, text: testo, onclick: fn });
}

function disegnaAzioni(c) {
  const box = $('#azioniRapide');
  const k = chiaveGiorno;
  const aperto = k === oggi() || (k === addDays(oggi(), -1) && c.stato !== 'scaduta');
  const voci = [];
  if (aperto) {
    if (c.stato === 'vuoto') {
      voci.push(['Timbra ingresso', true, () => { inIngresso.value = adessoHHMM(); modifica((g) => { g.ingresso = inIngresso.value; }); toast('Ingresso alle ' + inIngresso.value); }]);
    } else if (c.stato === 'pausa') {
      voci.push(['Rientro dalla pausa', true, () => {
        const v = adessoHHMM();
        modifica((g) => { g.pause[c.inCorso.indice].rientro = v; }, { ridisegnaForm: true });
        toast('Rientro alle ' + v);
      }]);
    } else if (c.stato === 'in-corso') {
      voci.push(['Vado in pausa', false, () => {
        const v = adessoHHMM();
        modifica((g) => { g.pause.push({ uscita: v, rientro: '' }); }, { ridisegnaForm: true });
        pulisci();
        disegnaForm();
        toast('In pausa dalle ' + v);
      }]);
      voci.push(['Esco adesso', true, () => {
        const v = adessoHHMM();
        inUscita.value = v;
        modifica((g) => { g.uscita = v; });
        toast('Uscita alle ' + v);
      }]);
    }
  }
  const firma = voci.map((v) => v[0]).join('|');
  if (box.dataset.firma === firma) return;
  box.dataset.firma = firma;
  box.replaceChildren(...voci.map((v) => azioneRapida(...v)));
}

// ─────────── Risultati ───────────
function testo(id, t, classe) {
  const n = document.getElementById(id);
  if (n.textContent !== t) n.textContent = t;
  if (classe !== undefined && n.className !== classe) n.className = classe;
}
const classeSaldo = (m) => (m > 0 ? 'positivo' : m < 0 ? 'negativo' : '');

function aggiorna() {
  const adesso = new Date();
  const g = stato.giorni[chiaveGiorno] || {};
  const c = calcolaGiornata(g, chiaveGiorno, regole(), adesso);
  const hero = $('.hero');

  disegnaAzioni(c);

  // Errori e campi non validi
  const errori = c.errori || [];
  $('#errori').replaceChildren(...errori.map((e) => el('li', { text: e.msg })));
  inUscita.toggleAttribute('aria-invalid', errori.some((e) => e.campo === 'uscita'));
  (g.pause || []).forEach((p, i) => {
    const err = errori.some((e) => e.campo === 'pausa' && e.indice === i);
    document.getElementById(`pausa-r-${i}`)?.toggleAttribute('aria-invalid', err && !!p.rientro);
    const info = document.getElementById(`pausa-info-${i}`);
    if (!info) return;
    const d = c.pause?.[i];
    const t = !d ? '' : d.aperta ? `in corso · ${fmtDurata(d.durata)}` : fmtDurata(d.durata) + (d.pranzo ? ' · pranzo' : '');
    info.textContent = t ? `(${t})` : '';
    info.className = 'pausa-info' + (d?.pranzo ? ' ok' : '');
  });

  // Anello e testo principale
  let perc = 0, etichetta, grande, sotto, completa = false;
  if (c.stato === 'vuoto') {
    etichetta = c.ore > 0 ? `Ore da fare: ${fmtDurata(c.ore)}` : 'Giorno senza ore da fare';
    grande = '--:--';
    sotto = 'Inserisci l\'ora di ingresso';
  } else {
    perc = c.percentuale;
    if (c.stato === 'chiusa') {
      etichetta = 'Giornata chiusa · lavorato';
      grande = fmtDurata(c.lavorato);
      sotto = c.saldo >= 0 ? `Saldo ${fmtSaldo(c.saldo)}${c.saldo > 0 ? ' (straordinario)' : ''}` : `Saldo ${fmtSaldo(c.saldo)} (debito)`;
      completa = c.saldo >= 0;
    } else if (c.stato === 'scaduta') {
      etichetta = 'Manca l\'uscita';
      grande = '--:--';
      sotto = 'Inserisci l\'ora di uscita per chiudere la giornata';
    } else if (c.stato === 'futuro') {
      etichetta = 'Ingresso alle ' + oraDi(c.ingresso);
      grande = oraDi(c.fineGiornata);
      sotto = 'Uscita prevista';
    } else if (c.alFine <= 0) {
      completa = true;
      etichetta = 'Giornata completata';
      grande = oraDi(c.fineGiornata);
      sotto = `Straordinario ${fmtSaldo(Math.max(0, c.saldo))}`;
    } else {
      etichetta = 'Puoi uscire alle';
      grande = oraDi(c.fineGiornata);
      sotto = c.stato === 'pausa' ? `In pausa da ${fmtDurata(c.inCorso.durata)} · mancano ${fmtDurata(c.alFine)}` : `Mancano ${fmtDurata(c.alFine)}`;
    }
  }
  hero.classList.toggle('completa', completa);
  testo('heroEtichetta', etichetta);
  testo('heroTitolo', grande);
  testo('heroSotto', sotto, 'hero-sotto ' + (c.stato === 'chiusa' ? classeSaldo(c.saldo) : ''));
  testo('perc', String(Math.floor(perc)));
  $('#anello').style.strokeDashoffset = String(100 - perc);

  // Dettagli
  const vuoto = c.stato === 'vuoto';
  testo('mLavorato', vuoto ? '0:00' : fmtDurata(c.lavorato), 'accento');
  testo('mOre', fmtDurata(c.ore));
  testo('mFine', vuoto ? '--:--' : oraDi(c.fineGiornata), 'accento2');
  testo('mPause', vuoto ? '0:00' : fmtDurata(c.pauseTot));
  if (vuoto) {
    testo('mBuonoEt', 'Buono pasto');
    testo('mBuono', '--:--', '');
  } else {
    testo('mBuonoEt', c.buonoMaturato ? 'Buono pasto ✓ maturato' : (c.stato === 'in-corso' || c.stato === 'pausa') ? `Buono pasto · tra ${fmtDurata(c.alBuono)}` : 'Buono pasto');
    testo('mBuono', c.stato === 'chiusa' && !c.buonoMaturato ? 'No' : oraDi(c.buonoPasto), c.buonoMaturato ? 'positivo' : '');
  }
  testo('mSaldoEt', c.stato === 'chiusa' ? 'Saldo giornata' : 'Se esci ora');
  const mostraSaldo = !vuoto && c.stato !== 'scaduta' && c.stato !== 'futuro';
  testo('mSaldo', mostraSaldo ? fmtSaldo(c.saldo) : '—', mostraSaldo ? classeSaldo(c.saldo) : '');

  // Avviso pausa pranzo (come nella versione 1)
  const avviso = $('#avvisoPausa');
  let tAvviso = '', cAvviso = 'avviso';
  if (!vuoto && c.richiedePausa) {
    if (c.pranzoOk) { tAvviso = 'Pausa pranzo valida: nessun minuto aggiunto'; cAvviso += ' ok'; }
    else if (c.inCorso?.inFinestra) { tAvviso = `Pausa pranzo in corso: valida dopo ${fmtDurata(regole().pausaMin)}`; cAvviso += ' attenzione'; }
    else { tAvviso = `Nessuna pausa pranzo valida (${fmtOra(regole().finestraDa)}–${fmtOra(regole().finestraA)}, almeno ${regole().pausaMin} min): +${regole().pausaMin} min aggiunti`; cAvviso += ' attenzione'; }
  }
  if (avviso.textContent !== tAvviso) avviso.textContent = tAvviso;
  avviso.className = cAvviso;

  // Settimana e mese
  const lun = lunedi(chiaveGiorno);
  const sett = riepilogo(stato.giorni, lun, addDays(lun, 6), regole(), adesso);
  testo('sLavorato', fmtDurata(sett.lavorato));
  testo('sDovuto', fmtDurata(sett.dovuto));
  testo('sSaldo', fmtSaldo(sett.saldo), classeSaldo(sett.saldo));
  const m = chiaveGiorno.slice(0, 7);
  const mese = riepilogo(stato.giorni, m + '-01', m + '-31', regole(), adesso);
  testo('meseSaldo', fmtSaldo(mese.saldo), classeSaldo(mese.saldo));

  controllaAvvisi(c);
}

// ─────────── Notifiche (facoltative) ───────────
function leggiAvvisi() {
  try { return JSON.parse(localStorage.getItem(CHIAVE_AVVISI) || '{}'); } catch { return {}; }
}
function controllaAvvisi(c) {
  if (!regole().notifiche || !('Notification' in window) || Notification.permission !== 'granted') return;
  const k = chiaveGiorno;
  if (k !== oggi() && k !== addDays(oggi(), -1)) return;
  if (c.stato !== 'in-corso' && c.stato !== 'pausa') return;
  const a = leggiAvvisi();
  if (a.giorno !== k) { a.giorno = k; a.inviati = []; }
  const invia = (id, titolo, corpo) => {
    if (a.inviati.includes(id)) return;
    a.inviati.push(id);
    localStorage.setItem(CHIAVE_AVVISI, JSON.stringify(a));
    mostraNotifica(titolo, corpo);
  };
  // solo eventi appena passati (entro 10 minuti), per non avvisare a sproposito all'apertura
  if (c.alBuono <= 0 && c.alBuono > -10) invia('buono', 'Buono pasto maturato', `Dalle ${oraDi(c.buonoPasto)}`);
  if (c.alFine <= 0 && c.alFine > -10) invia('fine', 'Puoi uscire', `Ore completate alle ${oraDi(c.fineGiornata)}`);
}
async function mostraNotifica(titolo, corpo) {
  const opz = { body: corpo, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: titolo, lang: 'it' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(titolo, opz); return; }
  } catch { /* si prova sotto */ }
  try { new Notification(titolo, opz); } catch { /* notifiche non supportate */ }
}

// ─────────── Storico ───────────
function disegnaStorico() {
  const [y, mo] = meseStorico.split('-').map(Number);
  $('#titoloMese').textContent = fmtMese.format(new Date(y, mo - 1, 1));
  const r = riepilogo(stato.giorni, meseStorico + '-01', meseStorico + '-31', regole(), new Date());
  $('#stGiorni').textContent = String(r.giorni);
  $('#stLavorato').textContent = fmtDurata(r.lavorato);
  const s = $('#stSaldo');
  s.textContent = fmtSaldo(r.saldo);
  s.className = classeSaldo(r.saldo);
  $('#stBuoni').textContent = String(r.buoni);

  const righe = [...r.righe].reverse().map(({ key, giorno: g, calc: c }) => {
    const chiusa = c.stato === 'chiusa';
    const apri = (e) => { e.preventDefault(); vaiAlGiorno(key); apriScheda('tab-oggi'); $('#titoloGiorno').focus?.(); };
    const href = '#' + key;
    return el('tr', {},
      el('td', {}, el('a', { href, onclick: apri }, fmtDataBreve.format(parseKey(key)), sottotitolo(chiusa && c.buonoMaturato, g.nota))),
      el('td', {}, el('span', { text: `${g.ingresso || '?'}–${g.uscita || '…'}` })),
      el('td', {}, el('span', { text: chiusa ? fmtDurata(c.lavorato) : c.stato === 'scaduta' ? '—' : fmtDurata(c.lavorato) + '…' })),
      el('td', {}, el('span', { class: chiusa ? classeSaldo(c.saldo) : '', text: chiusa ? fmtSaldo(c.saldo) : '' })),
    );
  });
  $('#righeStorico').replaceChildren(...righe);
  $('#storicoVuoto').hidden = righe.length > 0;
}
function sottotitolo(buono, nota) {
  const parti = [buono ? 'buono pasto' : '', nota || ''].filter(Boolean);
  return parti.length ? el('small', { text: parti.join(' · ') }) : null;
}
const spostaMese = (n) => {
  const [y, m] = meseStorico.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  meseStorico = d.getFullYear() + '-' + pad(d.getMonth() + 1);
  disegnaStorico();
};
$('#mesePrec').addEventListener('click', () => spostaMese(-1));
$('#meseSucc').addEventListener('click', () => spostaMese(1));

function scarica(nome, contenuto, tipo) {
  const url = URL.createObjectURL(new Blob([contenuto], { type: tipo }));
  const a = el('a', { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#esportaCSV').addEventListener('click', () => {
  const csv = esportaCSV(stato.giorni, meseStorico + '-01', meseStorico + '-31', regole(), new Date());
  scarica(`orario-${meseStorico}.csv`, csv, 'text/csv;charset=utf-8');
});
$('#esportaBackup').addEventListener('click', () => {
  const dati = { app: 'calcolatore-orario', esportato: new Date().toISOString(), ...datiPuliti() };
  scarica(`calcolatore-orario-backup-${oggi()}.json`, JSON.stringify(dati, null, 2), 'application/json');
});
$('#importaBackup').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || typeof d.giorni !== 'object') throw new Error('formato');
    const giorni = {};
    const ora = (v) => (typeof v === 'string' && (v === '' || parseHHMM(v) !== null) ? v : '');
    for (const [k, g] of Object.entries(d.giorni)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !g || typeof g !== 'object') continue;
      giorni[k] = {
        ingresso: ora(g.ingresso), uscita: ora(g.uscita),
        pause: Array.isArray(g.pause) ? g.pause.map((p) => ({ uscita: ora(p?.uscita), rientro: ora(p?.rientro) })) : [],
      };
      if (Number.isFinite(g.ore) && g.ore >= 0 && g.ore <= 1440) giorni[k].ore = g.ore;
      if (typeof g.nota === 'string' && g.nota) giorni[k].nota = g.nota.slice(0, 120);
    }
    const n = Object.keys(giorni).length;
    if (!confirm(`Ripristinare il backup (${n} giorni)? I giorni con la stessa data verranno sostituiti.`)) return;
    Object.assign(stato.giorni, giorni);
    if (d.impostazioni && typeof d.impostazioni === 'object') {
      const imp = validaImpostazioni(d.impostazioni);
      if (imp) stato.impostazioni = { ...stato.impostazioni, ...imp };
    }
    salva();
    applicaTema();
    disegnaForm();
    aggiorna();
    disegnaStorico();
    toast(`Backup ripristinato: ${n} giorni`);
  } catch {
    toast('File non valido: scegli un backup del calcolatore');
  }
});

// ─────────── Impostazioni ───────────
const ORDINE = [1, 2, 3, 4, 5, 6, 0];
function validaImpostazioni(i) {
  const ore = Array.isArray(i.ore) && i.ore.length === 7 && i.ore.every((m) => Number.isFinite(m) && m >= 0 && m <= 1440) ? i.ore : null;
  const num = (v, max) => (Number.isFinite(v) && v >= 0 && v <= max ? v : null);
  const r = {
    ore, soglia: num(i.soglia, 1440), pausaMin: num(i.pausaMin, 180),
    finestraDa: num(i.finestraDa, 1439), finestraA: num(i.finestraA, 1439),
    tema: ['auto', 'chiaro', 'scuro'].includes(i.tema) ? i.tema : null,
  };
  for (const k of Object.keys(r)) if (r[k] === null) delete r[k];
  return r;
}

function disegnaImpostazioni() {
  const imp = regole();
  $('#oreSettimana').replaceChildren(...ORDINE.map((d) => el('div', {},
    el('label', { for: `ore-${d}`, text: NOMI_GIORNI[d] }),
    el('input', { type: 'text', id: `ore-${d}`, inputmode: 'decimal', autocomplete: 'off', value: fmtDurata(imp.ore[d]) }),
  )));
  $('#impSoglia').value = fmtDurata(imp.soglia);
  $('#impPausa').value = String(imp.pausaMin);
  $('#impDa').value = fmtOra(imp.finestraDa);
  $('#impA').value = fmtOra(imp.finestraA);
  $('#erroriImpostazioni').textContent = '';
  document.querySelectorAll('input[name="tema"]').forEach((r) => { r.checked = r.value === imp.tema; });
  $('#impNotifiche').checked = !!imp.notifiche && ('Notification' in window) && Notification.permission === 'granted';
  if (!('Notification' in window)) {
    $('#impNotifiche').disabled = true;
    $('#notificheInfo').textContent = 'Questo browser non supporta le notifiche. Su iPhone: aggiungi l\'app alla schermata Home.';
  }
}

$('#formImpostazioni').addEventListener('submit', (e) => {
  e.preventDefault();
  const errori = [];
  const ore = [...regole().ore];
  for (const d of ORDINE) {
    const inp = $(`#ore-${d}`);
    const v = parseDurata(inp.value);
    const ok = v !== null && v <= 1440;
    inp.toggleAttribute('aria-invalid', !ok);
    if (ok) ore[d] = v; else errori.push(`${NOMI_GIORNI[d]}: ore non valide`);
  }
  const soglia = parseDurata($('#impSoglia').value);
  $('#impSoglia').toggleAttribute('aria-invalid', soglia === null);
  if (soglia === null) errori.push('Soglia buono pasto non valida');
  const pausa = Number($('#impPausa').value);
  const pausaOk = $('#impPausa').value !== '' && Number.isInteger(pausa) && pausa >= 0 && pausa <= 180;
  $('#impPausa').toggleAttribute('aria-invalid', !pausaOk);
  if (!pausaOk) errori.push('Pausa minima non valida (0–180 minuti)');
  const da = parseHHMM($('#impDa').value), a = parseHHMM($('#impA').value);
  const fasciaOk = da !== null && a !== null && da < a;
  if (!fasciaOk) errori.push('Fascia della pausa pranzo non valida');
  $('#erroriImpostazioni').textContent = errori.join('. ');
  if (errori.length) return;
  Object.assign(stato.impostazioni, { ore, soglia, pausaMin: pausa, finestraDa: da, finestraA: a });
  salva();
  disegnaForm();
  aggiorna();
  toast('Impostazioni salvate');
});
$('#impDefault').addEventListener('click', () => {
  const { tema, notifiche } = stato.impostazioni;
  stato.impostazioni = { ...IMPOSTAZIONI_DEFAULT, ore: [...IMPOSTAZIONI_DEFAULT.ore], tema, notifiche };
  salva();
  disegnaImpostazioni();
  disegnaForm();
  aggiorna();
  toast('Ripristinati i valori iniziali');
});

document.querySelectorAll('input[name="tema"]').forEach((r) => r.addEventListener('change', () => {
  stato.impostazioni.tema = r.value;
  salva();
  applicaTema();
}));
$('#btnTema').addEventListener('click', () => {
  const ordine = ['auto', 'chiaro', 'scuro'];
  stato.impostazioni.tema = ordine[(ordine.indexOf(stato.impostazioni.tema) + 1) % 3];
  salva();
  applicaTema();
  toast('Tema: ' + { auto: 'automatico', chiaro: 'chiaro', scuro: 'scuro' }[stato.impostazioni.tema]);
  document.querySelectorAll('input[name="tema"]').forEach((x) => { x.checked = x.value === stato.impostazioni.tema; });
});
function applicaTema() {
  const t = stato.impostazioni.tema;
  if (t === 'auto') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = t;
  $('#btnTema').setAttribute('aria-label', 'Cambia tema (ora: ' + { auto: 'automatico', chiaro: 'chiaro', scuro: 'scuro' }[t] + ')');
}

$('#impNotifiche').addEventListener('change', async (e) => {
  if (e.target.checked) {
    const p = await Notification.requestPermission();
    if (p !== 'granted') {
      e.target.checked = false;
      toast('Permesso per le notifiche negato dal browser');
      return;
    }
  }
  stato.impostazioni.notifiche = e.target.checked;
  salva();
  toast(e.target.checked ? 'Avvisi attivati' : 'Avvisi disattivati');
});

$('#cancellaTutto').addEventListener('click', () => {
  if (!confirm('Cancellare TUTTI i dati (giornate e impostazioni) da questo dispositivo? Non si può annullare.')) return;
  localStorage.removeItem(CHIAVE);
  localStorage.removeItem(CHIAVE_AVVISI);
  stato = carica();
  chiaveGiorno = oggi();
  applicaTema();
  disegnaImpostazioni();
  disegnaForm();
  aggiorna();
  toast('Dati cancellati');
});

// ─────────── Avvio ───────────
pulisci();
$('#versione').textContent = 'v' + VERSIONE;
applicaTema();
disegnaForm();
aggiorna();

// aggiornamento ogni secondo (solo testo); a mezzanotte si passa al nuovo giorno
setInterval(() => {
  if (seguiOggi) {
    const k = giornoPredefinito();
    if (k !== chiaveGiorno) { vaiAlGiorno(k); seguiOggi = true; return; }
  }
  aggiorna();
}, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) aggiorna(); });
// sincronizza se l'app è aperta in due schede
window.addEventListener('storage', (e) => {
  if (e.key !== CHIAVE) return;
  stato = carica();
  applicaTema();
  disegnaForm();
  aggiorna();
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline non disponibile */ });
}

