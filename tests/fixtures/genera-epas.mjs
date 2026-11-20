// Genera pagine "Situazione mensile" di ePAS per i test, con DATI INVENTATI.
// La struttura segue il template di ePAS (app/views/Stampings/personStamping.html e componenti).
//   node tests/fixtures/genera-epas.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

const ORARI = {
  normale: { nome: 'Normale', ore: '07:12', buono: '06:00', pausa: '00:30', pranzo: '12:00-15:00' },
  maternita: { nome: 'Maternità CNR', ore: '05:12', buono: '04:00', pausa: '00:30', pranzo: '12:00-15:00' },
};

let idPd = 900100, idSt = 700100;

function cellaTimbratura(t, lato) {
  if (!t) return `<td class="positionnone stamping \n       \n    \n    \n    \n    \n    >\n    </td>`;
  const [ora, causale, colore] = Array.isArray(t) ? t : [t];
  const id = idSt++;
  const cls = colore === 'warn' ? 'warn"' : lato === 'left' ? 'default-left"' : 'default-right"';
  const pop = causale ? ` webui-popover-hover data-url="#${id}"` : '';
  return `<td class="position${lato} stamping\n       ${cls}${pop}\n    >\n            <a href="/stampings/edit?stampingId=${id}" data-async-modal="#modalStamping">\n              ${ora}\n            </a>\n${causale ? `        <strong>${causale}</strong>\n` : ''}    </td>`
    + (causale ? `\n      <div class="webui-popover-content" id="${id}"><p><strong>${causale}</strong> ${causale === 's' ? 'Motivi di servizio' : 'Pausa pranzo'}</p></div>` : '');
}

function riga(anno, mese, g, { timbrature = [], codice = '', orario = 'normale', festivo = false, buono = '', tempo = '', diff = '', prog = '' }, coppie) {
  const data = new Date(anno, mese - 1, g);
  const pd = idPd++;
  const o = ORARI[orario];
  const celle = [];
  for (let i = 0; i < coppie; i++) {
    celle.push(cellaTimbratura(timbrature[i * 2], 'left'));
    celle.push(cellaTimbratura(timbrature[i * 2 + 1], 'right'));
  }
  const icona = buono === 'si' ? '<i class="fa fa-cutlery" aria-hidden="true" webui-popover-hover data-content="Buono Pasto maturato"></i><span class="sr-only">si</span>'
    : buono === 'no' ? '<i class="fa fa-ban" aria-hidden="true"></i><span class="sr-only">no</span>' : '';
  return `
      <tr>
        <td class="${festivo ? 'festivi' : 'capitalized'} default-single">
            <a href="/personDays/personDayHistory?personDayId=${pd}" data-async-modal="#defaultModal">
              ${String(g).padStart(2, '0')} ${GIORNI[data.getDay()]}
            </a>
        </td>
        <td class="default-single">${icona}</td>
        <td class="invisible"></td>
        <td class="default-single">${codice ? `<span webui-popover-hover data-content="Codice ${codice}">${codice}</span>` : ''}</td>
        ${celle.join('\n        ')}
        <td class="invisible"></td>
        <td class="tempoLavoro default-single">${tempo}</td>
        <td class="differenza default-single"${diff.startsWith('-') ? ' style="color: red;"' : ''}>${diff}</td>
        <td class="progressivo default-single"${prog.startsWith('-') ? ' style="color: red;"' : ''}>${prog}</td>
${festivo ? '        <td class="default-single"></td>' : `        <td class="default-single" webui-popover-hover data-url="#wtt-${pd}"  data-title="Info orario giornaliero">
    <span class="text-info">${o.nome.slice(0, 8)}${o.nome.length > 8 ? '.' : ''}</span>
</td>
<div class="webui-popover-content" id="wtt-${pd}">
  <strong>${o.nome}</strong><br>
  Tempo lavoro: <strong>${o.ore}</strong><br>
  Tempo lavoro per buono pasto: <strong>${o.buono}</strong><br>
  Durata minima intervallo pranzo: <strong>${o.pausa}</strong><br>
  Finestra intervallo pranzo: <strong>${o.pranzo}</strong> (estremi compresi)<br>
  	Finestra apertura/chiusura sede: <strong>07:00-21:00</strong> (estremi compresi)
</div>`}
      </tr>`;
}

function pagina(anno, mese, giorni, coppie = 3) {
  const intest = Array.from({ length: coppie }, (_, i) => `<th class="group-left">${i + 1}<sup>a</sup> <br/>entrata</th>\n      <th class="group-right">${i + 1}<sup>a</sup> <br/>uscita</th>`).join('\n      ');
  const righe = Object.entries(giorni).map(([g, d]) => riga(anno, mese, Number(g), d, coppie)).join('');
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><title>ePAS - Timbrature</title></head>
<body>
<!-- Pagina di prova con dati inventati, struttura come ePAS (personStamping.html) -->
<nav class="navbar"><span class="badge">${MESI[mese - 1]} ${anno}</span></nav>
<div class="col-xs-12 col-lg-8">
  <table id="tabellonetimbrature" class="table table-bordered table-condensed">
	<caption class="sr-only">Riepilogo mensile ${MESI[mese - 1]} ${anno}</caption>
    <tr>
      <th class="group-single">Giorno</th>
      <th class="group-single">Buono<br>pasto</th>
      <th class="invisible"></th>
      <th class="group-single">Codice</th>
      ${intest}
      <th class="invisible"></th>
      <th class="group-single">Tempo<br>lavoro</th>
      <th class="group-single">Diffe-<br/>renza</th>
      <th class="group-single">Progres-<br/>sivo</th>
      <th class="group-single">Tipo<br>Orario</th>
    </tr>
${righe}
  </table>
</div>
<div id="riepiloghi"><p>Residuo a fine mese: 01:23</p></div>
</body>
</html>
`;
}

const settimana = {
  16: { timbrature: ['08:02', '13:00', '13:30', '16:10'], buono: 'si', tempo: '07:38', diff: '00:26', prog: '00:26' },
  17: { timbrature: ['08:15', '12:45', '13:20', '15:50'], buono: 'si', tempo: '07:00', diff: '-00:12', prog: '00:14' },
  18: { codice: 'FER' },
  19: { codice: 'LAGILEBP', buono: 'si', tempo: '07:12', diff: '00:00', prog: '00:14' },
  22: { festivo: true },
};

const file = {
  // oggi: 20 novembre 2026, tre coppie, una pausa breve fuori fascia e il pranzo
  'epas-normale.html': pagina(2026, 11, {
    ...settimana,
    1: { festivo: true },
    20: { timbrature: ['08:10', '10:30', '10:40', '12:30', '13:00', null] },
  }),
  // uscita e rientro per motivi di servizio (causale s), pranzo corto, orario ridotto
  'epas-servizio.html': pagina(2026, 11, {
    ...settimana,
    20: { orario: 'maternita', timbrature: ['07:58', ['10:00', 's'], ['11:05', 's'], '12:30', '12:50', null] },
  }),
  // in pausa adesso: ultima timbratura un'uscita; quattro coppie con timbratura segnalata
  'epas-in-pausa.html': pagina(2026, 11, {
    ...settimana,
    20: { timbrature: ['08:00', '09:30', ['09:45', '', 'warn'], '12:40', null, null, null, null] },
  }, 4),
  // oggi in ferie: nessuna timbratura
  'epas-ferie.html': pagina(2026, 11, { ...settimana, 20: { codice: 'FER' } }),
  // cartellino di un altro mese
  'epas-ottobre.html': pagina(2026, 10, { 20: { timbrature: ['08:00', '16:00'] } }, 1),
  // pagina qualunque, non ePAS
  'non-epas.html': '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Altro</title></head><body><h1>Un\'altra pagina</h1></body></html>\n',
};
for (const [nome, html] of Object.entries(file)) writeFileSync(DIR + nome, html);
console.log('generati:', Object.keys(file).join(', '));
