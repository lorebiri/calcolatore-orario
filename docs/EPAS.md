# ePAS e il calcolatore

ePAS è il sistema di rilevazione presenze del CNR, sviluppato da IIT-CNR, open source con licenza AGPL-3.0:
<https://github.com/consiglionazionaledellericerche/epas> (documentazione: <https://consiglionazionaledellericerche.github.io/epas/>).
Le note qui sotto vengono dalla lettura del codice sorgente (versione 2.43, novembre 2026).

## Come ePAS calcola giornata e buono pasto

Tipo orario «Normale» (tabella `WorkingTimeTypeDay`, seed in `db/evolutions/65.sql`):

| Parametro ePAS | Valore | Nel calcolatore |
|---|---|---|
| `workingTime` | 432 min (7:12), lun–ven | Ore da fare |
| `mealTicketTime` | 360 min (6:00) | Buono pasto dopo |
| `breakTicketTime` | 30 min | Pausa minima |
| `LUNCH_INTERVAL` (parametro di sede) | 12:00–15:00 | Fascia pranzo |

Regola della pausa pranzo (`PersonDayManager.getGapLunchPairs` e `mealTicketHandlerAndDecurtedMeal`):

1. si prendono gli intervalli tra un'uscita e l'entrata successiva;
2. vale la **prima** pausa che tocca la fascia 12:00–15:00, con gli estremi **tagliati** alla fascia
   (se ci sono timbrature con causale «pausa pranzo», ePAS somma invece quelle);
3. minuti da togliere = 30 − pausa fatta (mai meno di 0);
4. il buono pasto matura se: tempo lavorato − minuti da togliere ≥ 6:00;
5. i minuti si tolgono dal tempo lavorato solo se il buono è maturato.

Quindi, con ingresso E e pause totali P:

- **buono pasto alle** E + 6:00 + P + minuti mancanti di pausa pranzo
- **giornata maturata alle** E + 7:12 + P + minuti mancanti di pausa pranzo

Il calcolatore (`js/calc.js`) usa esattamente questa regola. I test in `tests/calc.test.mjs` la confrontano con un'implementazione di riferimento su più di mille casi.

### Differenze con la versione precedente del calcolatore

La v1 aggiungeva sempre 30 minuti interi se la pausa non era di almeno 30 minuti tutta dentro la fascia, e considerava qualunque pausa valida. Esempi (ingresso 8:00):

| Pausa | v1 | ePAS (ora nel calcolatore) |
|---|---|---|
| 12:30–12:50 (20 min) | +30 → uscita 16:02 | +10 → uscita 15:42 |
| 11:45–12:30 | +30 → 16:27 | conta 12:00–12:30 → +0 → 15:57 |
| 14:45–15:20 | +30 → 16:17 | conta 14:45–15:00 → +15 → 16:02 |
| caffè 12:05–12:15, pranzo 13:00–13:30 | +0 → 15:52 | conta solo il caffè → +20 → 16:12 |

Nell'ultimo caso la v1 diceva di uscire **20 minuti prima** di quanto ePAS riconosca.

## Integrazione: cosa è possibile

- **API REST**: richiedono account di sede con ruoli dedicati. Un dipendente può leggere solo il proprio
  riepilogo mensile (`/rest/personDays/getMonthSituation`: buoni pasto, progressivo, residui), non le timbrature
  del giorno. L'accesso al CNR passa dal login SSO. Non serve all'app, che deve solo dire due orari:
  non è stato implementato nulla che richieda credenziali o un server.
- **Pagina «Situazione mensile»**: è la tabella `#tabellonetimbrature` con le timbrature nelle celle `td.stamping`.
  Se un giorno servisse, un segnalibro (bookmarklet) aperto su quella pagina potrebbe leggere le timbrature
  di oggi e passarle all'app, tutto sul dispositivo. Per ora non è stato fatto, per tenere l'app semplice.
