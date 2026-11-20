# Calcolatore orario

App per chi timbra: dice **a che ora puoi uscire**, quando matura il **buono pasto** e il **saldo delle ore** (straordinario o debito).

Pubblicata su https://lorebiri.github.io/calcolatore-orario/

## Cosa fa

- Ingresso, una o più pause (uscita/rientro) e uscita finale, con i pulsanti **Adesso** e le azioni rapide *Timbra ingresso*, *Vado in pausa*, *Rientro dalla pausa*, *Esco adesso*.
- Ora di uscita prevista, conto alla rovescia, ore lavorate, buono pasto, "se esci ora".
- Regole (modificabili in *Impostazioni*): 7h12m al giorno; pausa pranzo valida se tra le 12:00 e le 15:00 e lunga almeno 30 minuti; se manca si aggiungono 30 minuti; buono pasto dopo 6 ore di lavoro più la pausa.
- Ore da fare diverse per ogni giorno della settimana, e per un singolo giorno (permessi, giornate corte).
- Storico dei giorni, saldo della settimana e del mese, esportazione CSV (si apre con Excel), backup e ripristino.
- Avvisi facoltativi quando matura il buono pasto e quando puoi uscire.
- Funziona offline e si può installare sulla schermata Home (PWA). Tema chiaro e scuro.

## Privacy

Tutti i dati restano nel browser del dispositivo (`localStorage`). Nessun server, account, tracker o servizio esterno: anche il carattere tipografico (Inter, licenza OFL) è nel repository.

## Sviluppo

Sito statico, nessuna compilazione. Per provarlo in locale:

```sh
python3 -m http.server 8000   # poi apri http://localhost:8000
npm test                       # test dei calcoli (Node 20+)
npm run e2e                    # prova nel browser (serve Playwright)
node tools/e2e.mjs --screenshot  # rigenera docs/screenshot/dopo/
```

- `js/calc.js` — tutti i calcoli (funzioni pure, testate in `tests/`)
- `js/app.js` — interfaccia
- `sw.js` — funzionamento offline (alzare `CACHE` a ogni rilascio)
