# Calcolatore orario

Dice solo due cose: **a che ora matura la giornata** e **a che ora matura il buono pasto**, con le regole di ePAS (CNR).

Pubblicato su https://lorebiri.github.io/calcolatore-orario/

## Come si usa

Inserisci l'ingresso e le pause (o usa i pulsanti *Adesso* / *Timbra ingresso*, *Vado in pausa*, *Rientro dalla pausa*), oppure importale da ePAS con il pulsante nei preferiti ([istruzioni](epas.html)). Il quadrante mostra i due orari con il conto alla rovescia: anello esterno la giornata, anello interno il buono pasto. Quando maturano parte una piccola festa (niente animazioni se il telefono è impostato su «riduci movimento»); c'è anche la modalità a schermo intero. Le timbrature di oggi restano salvate sul telefono; il giorno dopo si riparte da zero.

Regole predefinite (tipo orario «Normale» di ePAS, modificabili con il pulsante delle regole):
7:12 al giorno, buono pasto dopo 6:00, pausa minima 30 minuti nella fascia 12:00–15:00. Come ePAS, vale la prima pausa nella fascia e se è più corta di 30 minuti si aggiungono solo i minuti mancanti. Dettagli in [docs/EPAS.md](docs/EPAS.md).

Funziona offline e si può aggiungere alla schermata Home. Nessun dato lascia il dispositivo: niente server, account, tracker o risorse esterne.

## Sviluppo

Sito statico, nessuna compilazione.

```sh
python3 -m http.server 8000      # poi apri http://localhost:8000
npm test                         # test dei calcoli (Node 20+)
npm run e2e                      # prova nel browser (serve Playwright)
node tools/e2e.mjs --screenshot  # rigenera docs/screenshot/dopo/
```

- `js/calc.js`: i calcoli (funzioni pure, testate in `tests/`)
- `js/app.js`: interfaccia
- `sw.js`: funzionamento offline (alzare `CACHE` a ogni rilascio)
