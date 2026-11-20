// Calcoli dell'orario di lavoro. Funzioni pure, senza DOM: usate dall'app e dai test.
//
// Regole come le calcola ePAS (PersonDayManager.mealTicketHandlerAndDecurtedMeal), tipo orario "Normale":
// - ore da fare: 7h12m (432 min);
// - pausa pranzo: conta la PRIMA pausa che cade nella fascia 12:00–15:00, tagliata alla fascia;
// - se è più corta di 30 minuti si aggiungono solo i minuti mancanti (30 − pausa);
// - buono pasto: 6 ore di lavoro + pause + eventuali minuti mancanti di pausa pranzo.

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
  let inCorso = null;
  const dettPause = [];
  const intervalli = []; // pause valide in minuti di orologio, per la pausa pranzo

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
        inCorso = { indice: i, da: uw, durata: dur };
        intervalli.push({ i, da: uw, a: uw + dur });
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
    intervalli.push({ i, da: uw, a: rw });
    dettPause.push({ durata: dur });
  });

  // Pausa pranzo come in ePAS: la prima pausa che tocca la fascia, con gli estremi tagliati alla fascia.
  intervalli.sort((x, y) => x.da - y.da);
  const pranzo = intervalli.find((x) => !(x.a < r.finestraDa || x.da > r.finestraA));
  const pausaPranzo = pranzo ? Math.min(pranzo.a, r.finestraA) - Math.max(pranzo.da, r.finestraDa) : 0;
  if (pranzo && dettPause[pranzo.i]) dettPause[pranzo.i].pranzo = pausaPranzo;
  // minuti mancanti alla pausa minima (in ePAS: "toCut", poi "decurtedMeal")
  const mancaPausa = Math.max(0, r.pausaMin - pausaPranzo);
  const pranzoOk = mancaPausa === 0;
  const richiedePausa = ore > r.soglia;
  const penalita = richiedePausa ? mancaPausa : 0;

  // lavorato come ePAS: i minuti mancanti si tolgono solo se, tolti, resta il buono pasto
  const netto = Math.max(0, fineRel - pauseFatte);
  const lavorato = netto - mancaPausa >= r.soglia ? netto - mancaPausa : netto;

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
    pausaPranzo,
    mancaPausa,
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
