/* Lettore del cartellino ePAS ("Situazione mensile"), usato dal pulsante nei preferiti.
   Gira sulla pagina di ePAS, nel browser dell'utente: legge solo la tabella visibile,
   non fa richieste di rete, non legge cookie né credenziali.
   Restituisce { ok: true, dati, codice } oppure { ok: false, errore }.
   Struttura della pagina: app/views/Stampings/personStamping.html nel sorgente di ePAS. */
function leggiCartellinoEpas(doc, adesso) {
  var ERRORE_PAGINA = 'Apri il cartellino («Situazione mensile») su ePAS e riprova.';
  var tabella = doc.getElementById('tabellonetimbrature');
  if (!tabella) return { ok: false, errore: ERRORE_PAGINA };

  var mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var anno = null, mese = null;
  try {
    var q = new URL(doc.location.href).searchParams;
    if (q.get('year') && q.get('month')) { anno = Number(q.get('year')); mese = Number(q.get('month')); }
  } catch (e) { /* URL non disponibile */ }
  if (!anno) {
    var didascalia = (tabella.querySelector('caption') || {}).textContent || doc.title || '';
    var m = /([a-zà]+)\s+(\d{4})/i.exec(didascalia);
    if (m && mesi.indexOf(m[1].toLowerCase()) >= 0) { mese = mesi.indexOf(m[1].toLowerCase()) + 1; anno = Number(m[2]); }
  }
  if (!anno) { anno = adesso.getFullYear(); mese = adesso.getMonth() + 1; }
  if (anno !== adesso.getFullYear() || mese !== adesso.getMonth() + 1) {
    return { ok: false, errore: 'Il cartellino aperto non è quello del mese corrente: apri il mese di oggi su ePAS e riprova.' };
  }

  var oggi = adesso.getDate();
  var riga = null;
  var righe = tabella.querySelectorAll('tr');
  for (var i = 0; i < righe.length; i++) {
    var prima = righe[i].querySelector('td');
    if (!prima) continue;
    var g = /^\s*(\d{1,2})\b/.exec(prima.textContent);
    if (g && Number(g[1]) === oggi) { riga = righe[i]; break; }
  }
  if (!riga) return { ok: false, errore: 'Sul cartellino non trovo la riga di oggi. ' + ERRORE_PAGINA };

  var ora = function (t) {
    var x = /(\d{1,2})[:.](\d{2})/.exec(t || '');
    if (!x || Number(x[1]) > 23 || Number(x[2]) > 59) return null;
    return (x[1].length === 1 ? '0' : '') + x[1] + ':' + x[2];
  };

  /* Regole dell'orario del giorno, dal popover "Info orario giornaliero" (id wtt-...) */
  var regole = null;
  var cellaOrario = riga.querySelector('[data-url^="#wtt-"]');
  var pop = cellaOrario ? doc.getElementById(cellaOrario.getAttribute('data-url').slice(1)) : null;
  if (pop) {
    var testo = pop.textContent.replace(/\s+/g, ' ');
    var leggi = function (re) { var r = re.exec(testo); return r ? ora(r[1]) : null; };
    var min = function (hhmm) { return hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) : null; };
    var finestra = /Finestra intervallo pranzo:\s*(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/i.exec(testo);
    regole = {
      nome: ((pop.querySelector('strong') || {}).textContent || '').trim(),
      ore: min(leggi(/Tempo lavoro:\s*(\d{1,2}[:.]\d{2})/i)),
      soglia: min(leggi(/Tempo lavoro per buono pasto:\s*(\d{1,2}[:.]\d{2})/i)),
      pausaMin: min(leggi(/Durata minima intervallo pranzo:\s*(\d{1,2}[:.]\d{2})/i)),
      finestraDa: finestra ? min(ora(finestra[1])) : null,
      finestraA: finestra ? min(ora(finestra[2])) : null,
    };
  }

  /* Timbrature: celle td.stamping in ordine; positionleft = entrata, positionright = uscita.
     Le timbrature "per motivi di servizio" (causale s) in ePAS non interrompono il lavoro: si saltano. */
  var eventi = [];
  var celle = riga.querySelectorAll('td.stamping');
  for (var j = 0; j < celle.length; j++) {
    var c = celle[j];
    var tipo = /\bpositionleft\b/.test(c.className) ? 'entrata' : /\bpositionright\b/.test(c.className) ? 'uscita' : null;
    if (!tipo) continue;
    var copia = c.cloneNode(true);
    var causali = [];
    var forti = copia.querySelectorAll('strong');
    for (var k = 0; k < forti.length; k++) { causali.push(forti[k].textContent.trim().toLowerCase()); forti[k].remove(); }
    var t = ora(copia.textContent);
    if (!t) continue;
    if (causali.indexOf('s') >= 0) continue;
    eventi.push({ tipo: tipo, ora: t });
  }

  var ingresso = '', pause = [];
  for (var e = 0; e < eventi.length; e++) {
    var ev = eventi[e];
    if (!ingresso) { if (ev.tipo === 'entrata') ingresso = ev.ora; continue; }
    var ultima = pause[pause.length - 1];
    if (ev.tipo === 'uscita') {
      if (ultima && !ultima[1]) ultima[0] = ev.ora; else pause.push([ev.ora, '']);
    } else if (ultima && !ultima[1]) {
      ultima[1] = ev.ora;
    }
  }
  if (!ingresso) return { ok: false, errore: 'Oggi sul cartellino non c\'è ancora un ingresso.' };

  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var dati = { v: 1, d: anno + '-' + p2(mese) + '-' + p2(oggi), i: ingresso, p: pause, r: regole };
  var json = JSON.stringify(dati);
  var codice = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { ok: true, dati: dati, codice: codice };
}
