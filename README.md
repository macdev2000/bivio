# Bivio

Editor libero e multipiattaforma per scrivere **librogame** e racconti a bivi.
Funziona su **macOS, Windows e Linux**.

## Cosa fa

- **Scrivi**: ogni paragrafo ha un nome (es. `bosco`) e un numero. I link si scrivono `[[bosco]]` e nel libro diventano il numero del paragrafo. Scrivendo `[[` compare l'elenco dei paragrafi; se il nome non esiste, Bivio lo crea.
- **Link in entrata e in uscita** sempre visibili accanto al testo, con navigazione avanti/indietro.
- **Rinomina sicura**: cambiando il nome di un paragrafo, tutti i link si aggiornano.
- **Hashtag** sui paragrafi (`#bosco #combattimento`) per raggrupparli per zona, filtrarli e colorare la mappa.
- **Tipi di paragrafo**: normale, finale di vittoria, finale di sconfitta. Paragrafi **fissi** che non cambiano numero.
- **Rimescolamento** della numerazione, in quattro modi: tutto il libro; un gruppo di paragrafi tra loro; due gruppi tra loro; un gruppo sparso nel resto del libro. I gruppi si indicano con numeri, intervalli, hashtag o nomi (es. `10-40, 55, #bosco`) oppure prendendo i paragrafi filtrati nell'elenco. I fissi e l'iniziale restano fermi; Bivio evita i link fra numeri vicini.
- **Scambio** di due paragrafi indicandone i numeri (anche dall'editor, scrivendo il nuovo numero nel campo §).
- **Mappa** del libro integrata (non serve installare Graphviz), colorata per tipo o per hashtag, esportabile in PNG. Doppio clic su un paragrafo per aprirlo.
- **Gioca**: prova il libro come lettore, con il percorso fatto salvabile in un file di testo.
- **Controlli**: link a paragrafi inesistenti, paragrafi vuoti, vicoli ciechi, paragrafi irraggiungibili, buchi nella numerazione.
- **Esporta** in PDF, Word (.docx), ePub e HTML con i link interni cliccabili, oppure in testo semplice.
- **Esporta per la stampa** in Word (.docx) e PDF senza link e tutto in nero, per l'edizione cartacea. Il file Word usa stili con nome (“Numero paragrafo”, “Testo librogame”) per cambiare l'impaginazione di tutto il libro in un colpo solo.
- **Importa** un librogame da un file di testo: ogni paragrafo comincia con il suo numero da solo su una riga (`1` oppure `1.`); i rimandi come “vai al 37” o “turn to 160” diventano link. Le espressioni riconosciute si possono modificare.
- **Link a un paragrafo nuovo** con ⇧⌘K / Ctrl+Maiusc+K: crea il paragrafo con il primo numero libero e ne inserisce il link, senza interrompere la scrittura.
- **Promemoria** per ogni paragrafo (✎ nell'elenco), raccolti nella scheda Controlli e salvabili in un file di testo. I paragrafi vuoti sono evidenziati nell'elenco.
- **Sito web**: esportazione in un archivio .zip con una pagina per paragrafo.
- **Sezioni del libro**: regole, introduzione, epilogo, ringraziamenti… ognuna con titolo, prima o dopo i paragrafi, nell'ordine che vuoi. Possono contenere link.
- **Attributi di gioco**: scrivi `@eroe` nel testo e nel libro esportato diventa il valore impostato (es. “Lupo Solitario”).
- **Collegamenti invisibili**: un link scritto nel Promemoria conta per i controlli e la mappa (linea punteggiata) ma non finisce nel libro. Utile per gli enigmi numerici.
- **Paragrafi esclusi**: togliendo la spunta “nel libro” il paragrafo resta nell'editor ma non viene esportato.
- **Copertina** facoltativa per l'ePub.
- **Copie di sicurezza** (app desktop): a ogni salvataggio le cinque versioni precedenti restano come `.bak1`…`.bak5`; ogni 5 minuti, se ci sono modifiche, una copia `~nome.bivio` accanto al file.
- **Scrittura senza distrazioni** (Alt+I) e **⌘/Ctrl + clic** su un link per aprire il paragrafo collegato.
- **Appunti di lettura** durante la prova di gioco, salvati insieme al percorso.
- **Annulla** (↶) per le operazioni sulla struttura: rinomina, eliminazione, rimescolamento, cambio di numero.
- Al riavvio riapre l'ultima sessione, anche se non era stata salvata.

## Come si scrive

| Scrivi | Ottieni |
|---|---|
| `[[bosco]]` | il numero del paragrafo “bosco” (es. `37`) |
| `[[bosco\|vai al {n}]]` | testo personalizzato: “vai al 37” |
| `**testo**` | **grassetto** |
| `*testo*` | *corsivo* |
| riga vuota | nuovo capoverso |

Il formato dei link si cambia nella scheda **Libro** (es. `§{n}`).

### Scorciatoie

| | Mac | Windows / Linux |
|---|---|---|
| Salva / Salva con nome | ⌘S / ⇧⌘S | Ctrl+S / Ctrl+Maiusc+S |
| Apri | ⌘O | Ctrl+O |
| Nuovo paragrafo | ⇧⌘N | Ctrl+Maiusc+N |
| Cerca / vai a un paragrafo | ⌘F o ⌘G | Ctrl+F o Ctrl+G |
| Link a un paragrafo nuovo | ⇧⌘K | Ctrl+Maiusc+K |
| Scrittura senza distrazioni | ⌥I | Alt+I |
| Grassetto, corsivo, link | ⌘B, ⌘I, ⌘K | Ctrl+B, Ctrl+I, Ctrl+K |
| Schede Scrivi…Libro | ⌘1…⌘5 | Ctrl+1…Ctrl+5 |
| Paragrafo precedente / successivo visitato | ⌥← / ⌥→ | Alt+← / Alt+→ |

## Installare

Gli installatori si trovano nella pagina **Releases** del progetto su GitHub:

- **Mac**: file `.dmg` (va bene sia per Apple Silicon sia per Intel, macOS 11 o successivo)
- **Windows**: file `.msi` oppure `-setup.exe`
- **Linux**: file `.AppImage` oppure `.deb`

> **Primo avvio su Mac.** L'app non è firmata con un certificato Apple (costa 99 $ l'anno), quindi macOS la blocca. Si apre così: clic destro sull'app → **Apri** → **Apri**. Se macOS dice che l'app “è danneggiata”, nel Terminale: `xattr -cr /Applications/Bivio.app`.
>
> **Windows** può mostrare l'avviso SmartScreen: **Ulteriori informazioni** → **Esegui comunque**.

## Pubblicare una nuova versione (per chi mantiene il progetto)

Non serve avere un Mac, un PC Windows e un PC Linux: gli installatori li costruisce GitHub.

1. Metti il progetto in un repository GitHub.
2. Aggiorna la versione in `src-tauri/tauri.conf.json` e in `package.json` (es. `0.2.0`).
3. Invia le modifiche al ramo `main` (oppure da GitHub → **Actions** → **Build** → **Run workflow**).
4. Dopo circa 15 minuti trovi in **Releases** una bozza con gli installatori per tutti i sistemi: controllala e pubblicala.

## Sviluppo

Servono [Node.js](https://nodejs.org) 20 o successivo e [Rust](https://rustup.rs). Su Linux anche le librerie elencate nei [prerequisiti di Tauri](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev      # app desktop con ricaricamento automatico
npm run dev            # solo nel browser, su http://localhost:1420
npm run tauri build    # installatore per il sistema su cui ti trovi
```

Nel browser l'app funziona quasi del tutto: salvataggi ed esportazioni diventano download.

### Struttura

```
index.html            interfaccia
src/main.js           logica dell'interfaccia
src/model.js          libro, paragrafi, controlli, rimescolamento
src/markup.js         sintassi dei paragrafi ([[link]], **grassetto**, *corsivo*)
src/map.js            mappa (Cytoscape + Dagre)
src/platform.js       file e finestre: Tauri nel desktop, download nel browser
src/export/           PDF (pdfmake), Word (docx), ePub (JSZip), HTML, testo
src-tauri/            guscio desktop (Tauri 2)
.github/workflows/    costruzione automatica degli installatori
```

### Formato dei file `.bivio`

JSON leggibile, adatto anche a Git:

```json
{
  "format": "bivio", "version": 1,
  "title": "…", "author": "…", "bookVersion": "1.0",
  "sections": [ { "id": "…", "title": "Regole", "text": "…", "place": "before" } ],
  "variables": [ { "name": "eroe", "value": "Lupo Solitario" } ],
  "settings": { "start": "<id>", "linkFormat": "{n}", "pageSize": "A5", "pdfFont": "serif" },
  "tagColors": { "bosco": "#2a7f62" },
  "paragraphs": [
    { "id": "…", "key": "bosco", "number": 2, "text": "…[[lupo]]…",
      "notes": "", "tags": ["bosco"], "type": "normale", "fixed": false, "exportable": true }
  ]
}
```

`type` può essere `normale`, `vittoria` o `morte`.

## Licenza

MIT. Puoi usarlo, modificarlo e ridistribuirlo liberamente.

Il carattere Crimson Text incluso per i PDF è distribuito con licenza SIL Open Font License (vedi `src/fonts/OFL-CrimsonText.txt`); Roboto con licenza Apache 2.0.
