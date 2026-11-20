// Test dei calcoli. Avvio: npm test  (equivale a TZ=Europe/Rome node --test tests/*.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcolaGiornata, parseHHMM, parseDurata, fmtOra, fmtDurata, fmtSaldo,
  REGOLE_DEFAULT,
} from '../js/calc.js';

const K = '2026-11-20'; // venerdì
const at = (hhmm, key = K) => {
  const [y, m, d] = key.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
};
const ora = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Copia fedele della logica della versione 1 (index.html originale), per confronto
function originale(entrata, pause, nowMin) {
  const t = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  let totale = 0, pranzoOk = false;
  for (const p of pause) {
    if (!p.uscita || !p.rientro) continue;
    const out = t(p.uscita), inn = t(p.rientro);
    if (inn <= out) continue;
    const dur = inn - out;
    totale += dur;
    if (out >= 720 && inn <= 900 && dur >= 30) pranzoOk = true;
  }
  const pen = pranzoOk ? 0 : 30;
  const e = t(entrata);
  return {
    fine: e + 432 + totale + pen,
    buono: e + 360 + totale + pen,
    lavorato: Math.max(0, nowMin - e - totale - pen),
  };
}

test('parse e formattazione', () => {
  assert.equal(parseHHMM('08:10'), 490);
  assert.equal(parseHHMM('8.05'), 485);
  assert.equal(parseHHMM('24:00'), null);
  assert.equal(parseHHMM(''), null);
  assert.equal(parseDurata('7:12'), 432);
  assert.equal(parseDurata('7'), 420);
  assert.equal(parseDurata('0:30'), 30);
  assert.equal(parseDurata('7:75'), null);
  assert.equal(fmtOra(935), '15:35');
  assert.equal(fmtOra(1500), '01:00');
  assert.equal(fmtDurata(432), '7:12');
  assert.equal(fmtDurata(-15), '−0:15');
  assert.equal(fmtSaldo(12), '+0:12');
  assert.equal(fmtSaldo(-65), '−1:05');
  assert.equal(fmtSaldo(0), '0:00');
});

test('giornata tipo con pausa pranzo valida', () => {
  const g = { ingresso: '08:10', pause: [{ uscita: '12:30', rientro: '13:00' }] };
  const c = calcolaGiornata(g, K, REGOLE_DEFAULT, at('13:05'));
  assert.equal(c.pranzoOk, true);
  assert.equal(c.penalita, 0);
  assert.equal(ora(c.fineGiornata), '15:52');
  assert.equal(ora(c.buonoPasto), '14:40');
  assert.equal(c.lavorato, 265); // 4:25
  assert.equal(c.alFine, 167);   // 2:47
});

test('senza pausa: +30 minuti su fine giornata e buono pasto', () => {
  const c = calcolaGiornata({ ingresso: '08:00' }, K, REGOLE_DEFAULT, at('10:00'));
  assert.equal(c.pranzoOk, false);
  assert.equal(ora(c.fineGiornata), '15:42');
  assert.equal(ora(c.buonoPasto), '14:30');
});

test('lavorato come ePAS: i minuti mancanti si tolgono solo se resta il buono pasto', () => {
  const c1 = calcolaGiornata({ ingresso: '08:00' }, K, REGOLE_DEFAULT, at('10:00'));
  assert.equal(c1.lavorato, 120);
  // 6:20 senza pausa: tolti 30 min resterebbero 5:50 < 6:00 → niente decurtazione
  const c2 = calcolaGiornata({ ingresso: '08:00' }, K, REGOLE_DEFAULT, at('14:20'));
  assert.equal(c2.lavorato, 380);
  const c3 = calcolaGiornata({ ingresso: '08:00' }, K, REGOLE_DEFAULT, at('14:30'));
  assert.equal(c3.lavorato, 360);
  // all'ora di fine giornata il lavorato è esattamente 7:12
  const c4 = calcolaGiornata({ ingresso: '08:00' }, K, REGOLE_DEFAULT, at('15:42'));
  assert.equal(c4.lavorato, 432);
  assert.equal(c4.alFine, 0);
});

// Riferimento indipendente della regola ePAS (PersonDayManager.getGapLunchPairs + mealTicketHandler)
function epasAtteso(entrata, pause) {
  const t = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const ps = pause.map((p) => [t(p.uscita), t(p.rientro)]).sort((a, b) => a[0] - b[0]);
  const tot = ps.reduce((s, [u, r]) => s + r - u, 0);
  const primo = ps.find(([u, r]) => !(r < 720 || u > 900));
  const eff = primo ? Math.min(primo[1], 900) - Math.max(primo[0], 720) : 0;
  const toCut = Math.max(0, 30 - eff);
  const e = t(entrata);
  return { fine: e + 432 + tot + toCut, buono: e + 360 + tot + toCut };
}

test('fine giornata e buono pasto come ePAS (confronto a tappeto) e come la v1 quando la pausa è regolare', () => {
  const pad = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  let casi = 0, ugualiV1 = 0;
  for (let e = 7 * 60; e <= 10 * 60; e += 17) {
    for (let pu = 11 * 60; pu <= 15 * 60; pu += 13) {
      for (const dur of [0, 5, 10, 20, 29, 30, 45, 61]) {
        const pause = dur ? [{ uscita: pad(pu), rientro: pad(pu + dur) }] : [];
        const atteso = epasAtteso(pad(e), pause);
        const c = calcolaGiornata({ ingresso: pad(e), pause }, K, REGOLE_DEFAULT, at('07:00'));
        assert.equal(ora(c.fineGiornata), pad(atteso.fine), `fine ${pad(e)} ${JSON.stringify(pause)}`);
        assert.equal(ora(c.buonoPasto), pad(atteso.buono), `buono ${pad(e)} ${JSON.stringify(pause)}`);
        // senza pausa, o con pausa di almeno 30 min tutta nella fascia, il risultato è quello della v1
        if (!dur || (pu >= 720 && pu + dur <= 900 && dur >= 30)) {
          const o = originale(pad(e), pause, 0);
          assert.equal(ora(c.fineGiornata), pad(o.fine));
          assert.equal(ora(c.buonoPasto), pad(o.buono));
          ugualiV1++;
        }
        casi++;
      }
    }
  }
  assert.ok(casi > 1000 && ugualiV1 > 100);
});

test('pausa pranzo corta o a cavallo della fascia: si aggiungono solo i minuti mancanti (ePAS)', () => {
  const r = (pause) => calcolaGiornata({ ingresso: '08:00', pause }, K, REGOLE_DEFAULT, at('09:00'));
  const casi = [
    [[], 30, '15:42', '14:30'],
    [[{ uscita: '12:30', rientro: '12:50' }], 10, '15:42', '14:30'],  // v1: 16:02 e 14:50
    [[{ uscita: '11:45', rientro: '12:30' }], 0, '15:57', '14:45'],   // tagliata alle 12:00 → 30 min
    [[{ uscita: '11:50', rientro: '12:10' }], 20, '15:52', '14:40'],  // conta solo 12:00–12:10
    [[{ uscita: '14:45', rientro: '15:20' }], 15, '16:02', '14:50'],  // conta solo 14:45–15:00
    [[{ uscita: '12:00', rientro: '12:30' }], 0, '15:42', '14:30'],
    [[{ uscita: '10:30', rientro: '10:40' }], 30, '15:52', '14:40'],  // fuori fascia: non è pranzo
  ];
  for (const [pause, manca, fine, buono] of casi) {
    const c = r(pause);
    assert.equal(c.mancaPausa, manca, JSON.stringify(pause));
    assert.equal(ora(c.fineGiornata), fine, JSON.stringify(pause));
    assert.equal(ora(c.buonoPasto), buono, JSON.stringify(pause));
  }
});

test('conta solo la PRIMA pausa nella fascia (come ePAS)', () => {
  // caffè 12:05–12:15 e poi pranzo 13:00–13:30: ePAS considera solo il caffè (10 min) → +20
  const g = { ingresso: '08:00', pause: [{ uscita: '13:00', rientro: '13:30' }, { uscita: '12:05', rientro: '12:15' }] };
  const c = calcolaGiornata(g, K, REGOLE_DEFAULT, at('09:00'));
  assert.equal(c.pausaPranzo, 10);
  assert.equal(c.mancaPausa, 20);
  assert.equal(ora(c.fineGiornata), '16:12'); // 8:00 + 7:12 + 40 min di pause + 20
});

test('più pause: si sommano tutte', () => {
  const g = { ingresso: '08:00', pause: [{ uscita: '10:00', rientro: '10:15' }, { uscita: '13:00', rientro: '13:30' }] };
  const c = calcolaGiornata(g, K, REGOLE_DEFAULT, at('16:00'));
  assert.equal(c.pauseTot, 45);
  assert.equal(ora(c.fineGiornata), '15:57');
  assert.equal(c.lavorato, 435);
  assert.equal(c.saldo, 3);
});

test('pausa in corso (uscita senza rientro): il lavorato si ferma', () => {
  const g = { ingresso: '08:10', pause: [{ uscita: '12:30', rientro: '' }] };
  const c = calcolaGiornata(g, K, REGOLE_DEFAULT, at('12:40'));
  assert.equal(c.stato, 'pausa');
  assert.equal(c.lavorato, 260);
  // la pausa in corso iniziata nella finestra conta già come pranzo: fine = 15:52 come dopo il rientro alle 13:00
  assert.equal(ora(c.fineGiornata), '15:52');
  const c2 = calcolaGiornata(g, K, REGOLE_DEFAULT, at('13:00'));
  assert.equal(ora(c2.fineGiornata), '15:52');
  const c3 = calcolaGiornata(g, K, REGOLE_DEFAULT, at('13:10'));
  assert.equal(ora(c3.fineGiornata), '16:02');
});

test('rientro prima dell\'uscita: pausa ignorata e segnalata', () => {
  const g = { ingresso: '08:00', pause: [{ uscita: '13:00', rientro: '12:30' }] };
  const c = calcolaGiornata(g, K, REGOLE_DEFAULT, at('10:00'));
  assert.equal(c.pauseTot, 0);
  assert.equal(c.errori.length, 1);
});

test('uscita prima dell\'ingresso: errore, la giornata non si chiude', () => {
  const c = calcolaGiornata({ ingresso: '08:00', uscita: '07:30' }, K, REGOLE_DEFAULT, at('10:00'));
  assert.equal(c.stato, 'in-corso');
  assert.equal(c.errori[0].campo, 'uscita');
});

test('giornata chiusa: saldo, straordinario e debito', () => {
  const base = { ingresso: '08:00', pause: [{ uscita: '13:00', rientro: '13:30' }] };
  const piu = calcolaGiornata({ ...base, uscita: '16:00' }, K, REGOLE_DEFAULT, at('20:00'));
  assert.equal(piu.stato, 'chiusa');
  assert.equal(piu.lavorato, 450);
  assert.equal(piu.saldo, 18);
  assert.equal(piu.buonoMaturato, true);
  const meno = calcolaGiornata({ ...base, uscita: '14:00' }, K, REGOLE_DEFAULT, at('20:00'));
  assert.equal(meno.saldo, 330 - 432);
  assert.equal(meno.buonoMaturato, false);
});

test('mezzanotte: turno serale che finisce il giorno dopo', () => {
  const g = { ingresso: '22:00', pause: [{ uscita: '23:45', rientro: '00:15' }], uscita: '06:00' };
  const c = calcolaGiornata(g, K, REGOLE_DEFAULT, at('12:00', '2026-11-21'));
  assert.equal(c.stato, 'chiusa');
  assert.equal(c.pauseTot, 30);
  assert.equal(c.lavorato, 480 - 30 - 30); // pausa fuori finestra pranzo → +30
  // in corso, dopo mezzanotte
  const g2 = { ingresso: '22:00' };
  const c2 = calcolaGiornata(g2, K, REGOLE_DEFAULT, at('01:00', '2026-11-21'));
  assert.equal(c2.lavorato, 180);
  assert.equal(ora(c2.fineGiornata), '05:42');
});

test('giornata passata mai chiusa: non conta fino ad adesso', () => {
  const c = calcolaGiornata({ ingresso: '08:00' }, K, REGOLE_DEFAULT, at('12:00', '2026-11-23'));
  assert.equal(c.stato, 'scaduta');
  assert.equal(c.lavorato, 0);
});

test('ingresso nel futuro', () => {
  const c = calcolaGiornata({ ingresso: '09:00' }, K, REGOLE_DEFAULT, at('08:30'));
  assert.equal(c.stato, 'futuro');
  assert.equal(c.lavorato, 0);
});

test('ora legale: notte del cambio (fuso Europe/Rome)', () => {
  // 25/10/2026: alle 03:00 si torna alle 02:00 → la notte dura un'ora in più
  const c = calcolaGiornata({ ingresso: '22:00', uscita: '06:00' }, '2026-10-24', REGOLE_DEFAULT, at('12:00', '2026-10-25'));
  if (process.env.TZ === 'Europe/Rome') assert.equal(c.lavorato, 540 - 30);
  // 29/03/2026: alle 02:00 si salta alle 03:00 → un'ora in meno
  const c2 = calcolaGiornata({ ingresso: '22:00', uscita: '06:00' }, '2026-03-28', REGOLE_DEFAULT, at('12:00', '2026-03-29'));
  if (process.env.TZ === 'Europe/Rome') assert.equal(c2.lavorato, 420 - 30);
  // giornata normale nel giorno del cambio: nessun effetto
  const c3 = calcolaGiornata({ ingresso: '08:00', pause: [{ uscita: '13:00', rientro: '13:30' }], uscita: '15:42' }, '2026-03-29', REGOLE_DEFAULT, at('20:00', '2026-03-29'));
  assert.equal(c3.lavorato, 432);
});

test('ore per giorno della settimana e giornata corta senza pausa obbligatoria', () => {
  const regole = { ...REGOLE_DEFAULT, ore: [0, 540, 540, 540, 540, 360, 0] }; // lun-gio 9h, ven 6h
  const ven = calcolaGiornata({ ingresso: '08:00' }, K, regole, at('09:00'));
  assert.equal(ven.ore, 360);
  assert.equal(ven.penalita, 0);
  assert.equal(ora(ven.fineGiornata), '14:00');
  const gio = calcolaGiornata({ ingresso: '08:00' }, '2026-11-19', regole, at('09:00', '2026-11-19'));
  assert.equal(ora(gio.fineGiornata), '17:30');
  // ore della singola giornata (es. permesso) hanno la precedenza
  const c = calcolaGiornata({ ingresso: '08:00', ore: 240 }, K, regole, at('09:00'));
  assert.equal(ora(c.fineGiornata), '12:00');
});
