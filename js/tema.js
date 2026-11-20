// Applica il tema salvato prima del disegno della pagina (evita il lampo di colore sbagliato).
try {
  const t = JSON.parse(localStorage.getItem('calcolatore-orario') || '{}')?.impostazioni?.tema;
  if (t === 'chiaro' || t === 'scuro') document.documentElement.dataset.tema = t;
} catch { /* nessun tema salvato */ }
