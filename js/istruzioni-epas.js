// Costruisce il pulsante "Manda al calcolatore" a partire da js/epas-lettore.js
import { costruisciBookmarklet } from './bookmarklet.js';

const link = document.getElementById('bookmarklet');
const area = document.getElementById('codice');
const toast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('visibile');
  setTimeout(() => t.classList.remove('visibile'), 3500);
};

const sorgente = await (await fetch('js/epas-lettore.js')).text();
const codice = costruisciBookmarklet(sorgente, new URL('./', location.href).href);
link.href = codice;
area.value = codice;

// cliccato qui non serve: va trascinato nei preferiti
link.addEventListener('click', (e) => {
  e.preventDefault();
  toast('Trascina il pulsante nella barra dei preferiti, poi usalo sul cartellino ePAS');
});

document.getElementById('copia').addEventListener('click', async () => {
  const esito = document.getElementById('esitoCopia');
  try {
    await navigator.clipboard.writeText(codice);
    esito.textContent = 'Codice copiato. Ora incollalo come indirizzo del preferito.';
  } catch {
    area.focus();
    area.select();
    esito.textContent = 'Seleziona il codice e copialo a mano (tieni premuto → Copia).';
  }
});
