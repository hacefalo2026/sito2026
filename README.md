# HACE FALÒ 2026

Sito statico dell'evento (HTML5 + CSS3 + JavaScript vanilla, nessun framework).
Le prenotazioni vengono inviate a un Google Apps Script che le salva su Google Fogli e invia la mail di conferma.

```
/index.html
/style.css
/script.js
/assets/
   video/       ← hero.mp4 (video di sfondo)
   images/      ← hero-poster.jpg, favicon.svg
/apps-script/
   Codice.gs    ← da incollare nell'editor di Apps Script
README.md
```

---

## 1. Configurazione — completa

Tutto compilato: URL Apps Script, PayPal, intestatario, IBAN, ID del foglio, video e poster.
Resta solo da pubblicare (passi 4 e 5).

### Dove stanno i dati bancari
- **`script.js` (pubblico, finisce online):** solo il link PayPal. Nessun IBAN.
- **`Codice.gs` (privato, resta nel tuo account Google):** intestatario e IBAN, inviati solo nella mail al partecipante.

Se un giorno vuoi cambiare IBAN o intestatario, tocchi solo `Codice.gs` → salvi → `Distribuisci › Gestisci distribuzioni › ✏️ › Nuova versione`.

### Video
`assets/video/hero.mp4` (6,4 MB, 1600×900, senza audio) e `assets/images/hero-poster.jpg` sono già pronti.
Se lo sostituisci: max ~8 MB, senza audio, H.264, e tieni gli stessi nomi.

---

## 2. Google Fogli — già collegato

`SHEET_ID` in `Codice.gs` punta già al tuo foglio (`17nOgXM3…Wf0JI`). Non devi fare nulla.

Le intestazioni vengono create automaticamente al primo utilizzo:

`Data registrazione | Nome | Cognome | Email | Telefono | Metodo di pagamento | Stato pagamento`

Lo stato parte sempre da **Da verificare**: lo cambi a mano in "Pagato" man mano che verifichi i pagamenti.

---

## 3. Google Apps Script

1. Apri il Google Foglio → **Estensioni › Apps Script**.
2. Cancella il contenuto di `Codice.gs` e incolla tutto il file `apps-script/Codice.gs`.
3. Salva (💾). Il blocco `CONFIG` è già compilato: non toccare nulla.
4. Nel menu a tendina delle funzioni scegli **`test`** e premi **Esegui**.
   - Google chiede le autorizzazioni: **Rivedi autorizzazioni › scegli il tuo account › Avanzate › Vai a … (non sicuro) › Consenti**.
   - Se tutto va bene: nel foglio compare una riga di prova e ricevi una mail di prova. Cancella pure la riga.

### Pubblicare il Web App

1. In alto a destra: **Distribuisci › Nuova distribuzione**.
2. Icona ingranaggio ⚙️ → tipo: **App web**.
3. Compila:
   - **Descrizione**: `HACE FALO 2026 v1`
   - **Esegui come**: **Io (tuo indirizzo)**
   - **Chi ha accesso**: **Chiunque** ← fondamentale, altrimenti il sito riceve un errore
4. **Distribuisci** → copia l'**URL Web app** (finisce con `/exec`).
5. Incollalo in `SCRIPT_URL` dentro `script.js`.

> **Ogni volta che modifichi `Codice.gs`**: `Distribuisci › Gestisci distribuzioni › ✏️ › Versione: Nuova versione › Distribuisci`.
> Se crei invece una *nuova distribuzione* cambia l'URL e devi aggiornarlo in `script.js`.

**Limiti:** account Gmail gratuito = 100 mail al giorno; account Workspace = 1500. Più che sufficienti.

---

## 4. Pubblicare su GitHub

```bash
cd hace-falo-2026
git init
git add .
git commit -m "HACE FALO 2026 — sito evento"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/hace-falo-2026.git
git push -u origin main
```

Se il video supera i 100 MB, GitHub lo rifiuta: comprimilo (es. con HandBrake) prima del commit.

---

## 5. Pubblicare su Cloudflare Pages

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages › Create › Pages › Connect to Git**.
2. Autorizza GitHub e seleziona il repository.
3. Impostazioni build:
   - **Framework preset**: `None`
   - **Build command**: *(lascia vuoto)*
   - **Build output directory**: `/`
4. **Save and Deploy**. Dopo qualche secondo il sito è online su `nome-progetto.pages.dev`.
5. Dominio personalizzato: **Custom domains › Set up a domain**.

Da qui in poi ogni `git push` su `main` aggiorna il sito automaticamente.

---

## 6. Come funziona l'invio

`script.js` fa una `POST` all'URL di Apps Script con il body JSON:

```json
{ "nome": "...", "cognome": "...", "email": "...", "telefono": "...", "pagamento": "PayPal" }
```

L'header è `Content-Type: text/plain` di proposito: evita il preflight CORS, che Apps Script non gestisce.
Apps Script risponde `{"ok": true}` e il sito mostra la schermata di conferma.

---

## 7. Test in locale

Non aprire `index.html` con doppio clic (`file://` blocca la fetch). Usa un server locale:

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

---

## Checklist prima di andare online

- [x] PayPal in `script.js`; intestatario e IBAN solo in `Codice.gs` (non pubblici)
- [x] `hero.mp4` e `hero-poster.jpg` caricati
- [x] `SHEET_ID` compilato in `Codice.gs`
- [x] `SCRIPT_URL` compilato in `script.js`
- [ ] Web App distribuito con accesso **Chiunque**
- [ ] Prenotazione di prova fatta dal sito: riga nel foglio ✔ mail ricevuta ✔
