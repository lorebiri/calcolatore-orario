// Calcoli dell'orario di lavoro. Funzioni pure, senza DOM: usate dall'app e dai test.
//
// Regole (identiche alla versione 1, ora configurabili):
// - ore da fare: 7h12m (432 min) di default;
// - pausa pranzo "valida": uscita dalle 12:00 in poi, rientro entro le 15:00, durata >= 30 min;
// - senza pausa pranzo valida si aggiungono 30 min (pausa obbligatoria dopo 6 ore);
// - buono pasto: 6 ore di lavoro + pause (+30 min se manca la pausa pranzo valida).

export const MINUTI_GIORNO = 1440;
// Un orario prima dell'ingresso vale come "giorno dopo" solo se il turno resta entro 16 ore
// (es. ingresso 22:00, uscita 06:00). Altrimenti è un errore di battitura.
export const TURNO_MAX = 16 * 60;

export const REGOLE_DEFAULT = Object.freeze({
  // minuti da lavorare per giorno della settimana, indice come Date.getDay(): 0 = domenica
  ore: [0, 432, 432, 432, 432, 432, 0],
  soglia: 360,        // minuti di lavoro oltre i quali serve la pausa / matura il buono pasto
  pausaMin: 30,       // durata minima della pausa pranzo (e minuti aggiunti se manca)
  finestraDa: 720,    // 12:00
  finestraA: 900,     // 15:00
});

export function parseHHMM(s) {
  if (typeof s !== 'string') return null;
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

// Durata scritta come "7:12", "7.12", "7" (ore) o "0:30". Ammette più di 24 ore.
export function parseDurata(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  let m = /^(\d{1,3})$/.exec(t);
  if (m) return Number(m[1]) * 60;
  m = /^(\d{1,3})[:.,h]\s?(\d{1,2})m?$/.exec(t);
  if (!m) return null;
  const mi = Number(m[2]);
  if (mi > 59) return null;
  return Number(m[1]) * 60 + mi;
}

export function pad(n) { return String(n).padStart(2, '0'); }

// Orario del giorno: 935 -> "15:35" (oltre mezzanotte riparte da 00:00)
export function fmtOra(min) {
  const m = ((Math.floor(min) % MINUTI_GIORNO) + MINUTI_GIORNO) % MINUTI_GIORNO;
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
}

// Durata: 432 -> "7:12"; negativa -> "−0:15"
export function fmtDurata(min) {
  const neg = min < 0;
  const a = Math.floor(Math.abs(min));
  return (neg ? '−' : '') + Math.floor(a / 60) + ':' + pad(a % 60);
}

// Saldo con segno: +0:12 / −1:05 / 0:00
export function fmtSaldo(min) {
  const r = Math.trunc(min);
  if (r === 0) return '0:00';
  return (r > 0 ? '+' : '') + fmtDurata(r);
}

export function dateKey(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Data/ora locale: giorno `key` + `min` minuti di orologio (min >= 1440 = giorno dopo).
export function atMinutes(key, min) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, min, 0, 0);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function oreDelGiorno(key, regole) {
  return regole.ore[parseKey(key).getDay()] ?? 0;
}

function minutiTra(a, b) { return Math.round((b - a) / 60000); }

/**
 * Calcola lo stato di una giornata.
 * @param {{ingresso?:string, pause?:{uscita?:string, rientro?:string}[], uscita?:string, ore?:number|null}} giorno
 * @param {string} key  data della giornata "YYYY-MM-DD" (giorno dell'ingresso)
 * @param {object} regole
 * @param {Date} adesso
 */
export function calcolaGiornata(giorno, key, regole = REGOLE_DEFAULT, adesso = new Date()) {
  const r = { ...REGOLE_DEFAULT, ...regole };
  const ore = Number.isFinite(giorno?.ore) ? giorno.ore : oreDelGiorno(key, r);
  const errori = [];
  const ing = parseHHMM(giorno?.ingresso ?? '');
  if (ing === null) {
    return { stato: 'vuoto', ore, errori };
  }
  const ingDate = atMinutes(key, ing);

  // minuti di orologio "ancorati" all'ingresso (dopo mezzanotte -> +1440), null se non validi
  const ancora = (t) => {
    if (t === null) return null;
    if (t >= ing) return t;
    if (t + MINUTI_GIORNO - ing <= TURNO_MAX) return t + MINUTI_GIORNO;
    return null;
  };
  // minuti reali trascorsi dall'ingresso (corretti anche col cambio dell'ora legale)
  const rel = (wall) => minutiTra(ingDate, atMinutes(key, wall));

  // fine del periodo considerato: uscita registrata oppure adesso
  let chiusa = false, fineRel;
  const uscStr = giorno?.uscita ?? '';
  if (uscStr) {
    const uw = ancora(parseHHMM(uscStr));
    if (uw === null) {
      errori.push({ campo: 'uscita', msg: "L'uscita è prima dell'ingresso" });
    } else {
      chiusa = true;
      fineRel = rel(uw);
    }
  }
  const adessoRel = Math.floor((adesso - ingDate) / 60000);
  if (!chiusa) fineRel = adessoRel;
  const futuro = !chiusa && adessoRel < 0;
  // giornata passata mai chiusa: non ha senso contare fino ad adesso
  const scaduta = !chiusa && adessoRel > TURNO_MAX;
  if (futuro || scaduta) fineRel = Math.max(0, Math.min(adessoRel, 0));

  let pauseTot = 0;        // minuti di pausa usati per le previsioni
  let pauseFatte = 0;      // minuti di pausa dentro il periodo [ingresso, fine]
  let pranzoOk = false;
  let inCorso = null;
  const dettPause = [];

  (giorno?.pause ?? []).forEach((p, i) => {
    const uStr = p?.uscita ?? '', rStr = p?.rientro ?? '';
    if (!uStr && !rStr) { dettPause.push(null); return; }
    if (!uStr) { errori.push({ campo: 'pausa', indice: i, msg: "Manca l'ora di uscita della pausa" }); dettPause.push(null); return; }
    const uw = ancora(parseHHMM(uStr));
    if (uw === null) { errori.push({ campo: 'pausa', indice: i, msg: "Pausa prima dell'ingresso" }); dettPause.push(null); return; }
    const u = rel(uw);
    if (!rStr) {
      // pausa ancora aperta: conta fino ad adesso (o all'uscita)
      if (!chiusa && !futuro && !scaduta && u <= fineRel) {
        const dur = fineRel - u;
        pauseTot += dur;
        pauseFatte += dur;
        inCorso = { indice: i, da: uw, durata: dur, inFinestra: (uw % MINUTI_GIORNO) >= r.finestraDa };
        dettPause.push({ durata: dur, aperta: true });
      } else {
        if (chiusa) errori.push({ campo: 'pausa', indice: i, msg: "Manca l'ora di rientro della pausa" });
        dettPause.push(null);
      }
      return;
    }
    const rw = ancora(parseHHMM(rStr));
    if (rw === null || rw <= uw) {
      errori.push({ campo: 'pausa', indice: i, msg: "Il rientro è prima dell'uscita" });
      dettPause.push(null);
      return;
    }
    const rr = rel(rw);
    const dur = rr - u;
    pauseTot += dur;
    pauseFatte += Math.max(0, Math.min(rr, fineRel) - Math.max(u, 0));
    const valida = uw >= r.finestraDa && rw <= r.finestraA && (rw - uw) >= r.pausaMin;
    if (valida) pranzoOk = true;
    dettPause.push({ durata: dur, pranzo: valida });
  });

  // minuti da aggiungere se manca la pausa pranzo valida.
  // Se c'è una pausa in corso iniziata nella finestra, conta già come pranzo "in corso".
  let mancaPausa = pranzoOk ? 0 : r.pausaMin;
  if (!pranzoOk && inCorso && inCorso.inFinestra) {
    mancaPausa = Math.max(0, r.pausaMin - inCorso.durata);
  }
  const richiedePausa = ore > r.soglia;
  const penalita = richiedePausa ? mancaPausa : 0;

  // lavorato: tempo trascorso meno pause; oltre la soglia, se manca la pausa pranzo valida,
  // si tolgono i minuti di pausa obbligatoria (mai sotto la soglia).
  const netto = Math.max(0, fineRel - pauseFatte);
  const lavorato = (!pranzoOk && netto > r.soglia) ? Math.max(r.soglia, netto - r.pausaMin) : netto;

  const fineRelPrev = ore + pauseTot + penalita;
  const buonoRel = r.soglia + pauseTot + mancaPausa;
  const fineGiornata = new Date(ingDate.getTime() + fineRelPrev * 60000);
  const buonoPasto = new Date(ingDate.getTime() + buonoRel * 60000);
  const riferimento = chiusa ? fineRel : adessoRel;

  return {
    stato: chiusa ? 'chiusa' : scaduta ? 'scaduta' : futuro ? 'futuro' : inCorso ? 'pausa' : 'in-corso',
    ore,
    ingresso: ingDate,
    lavorato,
    pauseTot,
    pranzoOk,
    penalita,
    richiedePausa,
    inCorso,
    fineGiornata,
    buonoPasto,
    // minuti mancanti (negativi = già passati)
    alFine: fineRelPrev - riferimento,
    alBuono: buonoRel - riferimento,
    buonoMaturato: !scaduta && !futuro && riferimento >= buonoRel,
    saldo: lavorato - ore,
    percentuale: ore > 0 ? Math.min(100, (lavorato / ore) * 100) : 100,
    pause: dettPause,
    errori,
  };
}

// Inizio settimana (lunedì) della data key
export function lunedi(key) {
  const d = parseKey(key);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return dateKey(d);
}

/**
 * Riepilogo di un intervallo di giorni [da, a] (chiavi incluse).
 * Contano solo i giorni con un ingresso registrato: i giorni vuoti (ferie, weekend…) non fanno debito.
 * Il saldo considera solo le giornate chiuse (con l'uscita); quella in corso conta nel lavorato e nel dovuto.
 */
export function riepilogo(giorni, da, a, regole = REGOLE_DEFAULT, adesso = new Date()) {
  let lavorato = 0, dovuto = 0, saldo = 0, buoni = 0, giorniLav = 0, aperti = 0;
  const righe = [];
  for (const key of Object.keys(giorni).sort()) {
    if (key < da || key > a) continue;
    const c = calcolaGiornata(giorni[key], key, regole, adesso);
    if (c.stato === 'vuoto') continue;
    righe.push({ key, giorno: giorni[key], calc: c });
    giorniLav++;
    if (c.stato === 'scaduta' || c.stato === 'futuro') { aperti++; continue; }
    lavorato += c.lavorato;
    dovuto += c.ore;
    if (c.stato === 'chiusa') {
      saldo += c.saldo;
      if (c.buonoMaturato) buoni++;
    } else {
      aperti++; // giornata in corso: conta nel lavorato, non ancora nel saldo
    }
  }
  return { lavorato, dovuto, saldo, buoni, giorni: giorniLav, aperti, righe };
}

function csvCampo(v) {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

// CSV con separatore ";" (si apre direttamente con Excel in italiano)
export function esportaCSV(giorni, da, a, regole = REGOLE_DEFAULT, adesso = new Date()) {
  const intest = ['Data', 'Giorno', 'Ingresso', 'Pause', 'Uscita', 'Pause (h:mm)', 'Lavorato (h:mm)', 'Dovuto (h:mm)', 'Saldo (h:mm)', 'Buono pasto', 'Note'];
  const out = [intest.join(';')];
  const { righe } = riepilogo(giorni, da, a, regole, adesso);
  for (const { key, giorno, calc } of righe) {
    const pause = (giorno.pause ?? []).filter(p => p.uscita || p.rientro).map(p => `${p.uscita || '?'}-${p.rientro || '?'}`).join(' ');
    const chiusa = calc.stato === 'chiusa';
    out.push([
      key.split('-').reverse().join('/'),
      GIORNI[parseKey(key).getDay()],
      giorno.ingresso || '',
      pause,
      giorno.uscita || '',
      fmtDurata(calc.pauseTot ?? 0),
      chiusa ? fmtDurata(calc.lavorato) : '',
      fmtDurata(calc.ore),
      chiusa ? fmtSaldo(calc.saldo) : '',
      chiusa ? (calc.buonoMaturato ? 'sì' : 'no') : '',
      giorno.nota || '',
    ].map(csvCampo).join(';'));
  }
  return '﻿' + out.join('\r\n') + '\r\n';
}
