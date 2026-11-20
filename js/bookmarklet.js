// Trasforma il sorgente del lettore ePAS in un indirizzo "javascript:" da salvare nei preferiti.
export function costruisciBookmarklet(sorgente, urlApp) {
  const compatto = sorgente
    .replace(/\/\*[\s\S]*?\*\//g, '')       // commenti
    .split('\n').map((r) => r.trim()).filter(Boolean).join(' ');
  const corpo = `(function(){${compatto} var r=leggiCartellinoEpas(document,new Date());`
    + `if(!r.ok){alert(r.errore);return}`
    + `window.open(${JSON.stringify(urlApp)}+'#epas='+r.codice,'_blank')})()`;
  return 'javascript:' + encodeURIComponent(corpo).replace(/'/g, '%27');
}
