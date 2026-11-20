// Comune alle tre proposte: giornata simulata calcolata con il vero motore dell'app (regole ePAS).
// ?ora=14:20 ora simulata di partenza · ?velocita=120 per vedere scorrere il tempo · ?fine=1 giornata maturata
import { calcolaGiornata, REGOLE_DEFAULT, fmtDurata } from '../../js/calc.js';

export { fmtDurata };
const q = new URLSearchParams(location.search);
const partenza = q.get('fine') ? '16:03' : (q.get('ora') || '14:20');
const velocita = Number(q.get('velocita') || 1);
const t0 = performance.now();
export const GIORNO = { ingresso: '08:10', pause: [{ uscita: '10:30', rientro: '10:40' }, { uscita: '12:30', rientro: '13:00' }] };
const KEY = '2026-11-20';

export function adesso() {
  const [h, m] = partenza.split(':').map(Number);
  return new Date(new Date(2026, 10, 20, h, m).getTime() + (performance.now() - t0) * velocita);
}
const hhmm = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const hms = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function stato() {
  const now = adesso();
  const c = calcolaGiornata(GIORNO, KEY, REGOLE_DEFAULT, now);
  const ing = c.ingresso.getTime();
  const frazione = (fine) => Math.min(1, Math.max(0, (now - ing) / (fine - ing)));
  const sG = (c.fineGiornata - now) / 1000, sB = (c.buonoPasto - now) / 1000;
  return {
    now, ingresso: GIORNO.ingresso,
    giornata: hhmm(c.fineGiornata), buono: hhmm(c.buonoPasto),
    contoGiornata: hms(sG), contoBuono: hms(sB),
    giornataOk: sG <= 0, buonoOk: sB <= 0,
    fGiornata: frazione(c.fineGiornata), fBuono: frazione(c.buonoPasto),
    pausaPranzo: c.pausaPranzo, mancaPausa: c.mancaPausa,
  };
}

export const ridotto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function feedback(el) {
  if (!ridotto()) navigator.vibrate?.([12, 40, 18]);
  el.classList.remove('timbrato'); void el.offsetWidth; el.classList.add('timbrato');
}

export function coriandoli(colori) {
  if (ridotto()) return;
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  Object.assign(cv.style, { position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 50 });
  document.body.append(cv);
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const pezzi = Array.from({ length: 150 }, () => ({
    x: innerWidth / 2, y: innerHeight * 0.4, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
    c: colori[Math.floor(Math.random() * colori.length)],
  }));
  const t0 = performance.now();
  (function frame(t) {
    const dt = t - t0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of pezzi) {
      p.vy += 0.3; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - dt / 3000);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2))); ctx.restore();
    }
    if (dt < 3000) requestAnimationFrame(frame); else cv.remove();
  })(t0);
}

let lock = null;
export async function schermoIntero(btn) {
  try {
    if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); lock = await navigator.wakeLock?.request('screen'); }
    else { await document.exitFullscreen(); await lock?.release(); }
  } catch { /* non supportato */ }
  btn?.setAttribute('aria-pressed', String(!!document.fullscreenElement));
}

export function coloreFase(f, tappe) {
  const n = tappe.length - 1, i = Math.min(n - 1, Math.floor(f * n)), t = f * n - i;
  return `rgb(${tappe[i].map((v, k) => Math.round(v + (tappe[i + 1][k] - v) * t)).join(',')})`;
}

// Ciclo di aggiornamento; evento "maturata" (giornata o buono) al passaggio
export function avvia(disegna) {
  let prima = null;
  const giro = () => {
    const s = stato();
    disegna(s);
    if (prima) {
      if (!prima.buonoOk && s.buonoOk) document.dispatchEvent(new CustomEvent('maturato', { detail: 'buono' }));
      if (!prima.giornataOk && s.giornataOk) document.dispatchEvent(new CustomEvent('maturato', { detail: 'giornata' }));
    }
    prima = s;
  };
  giro();
  setInterval(giro, 200);
}
