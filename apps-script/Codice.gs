/**
 * =========================================================
 *  HACE FALÒ 2026 — Google Apps Script
 *  Riceve le prenotazioni dal sito, le salva su Google Fogli
 *  e invia la mail di conferma al partecipante.
 * =========================================================
 */

/* ---------------- CONFIGURAZIONE ---------------- */
var CONFIG = {
  // ID del Google Foglio (lo trovi nell'URL tra /d/ e /edit)
  SHEET_ID: '17nOgXM3pgVs6WS4p-7YsLA7mQfRQ36IlhcVyt5Wf0JI',
  SHEET_NAME: 'Prenotazioni',

  // Dati pagamento
  PAYPAL_LINK: 'https://paypal.me/MNasci363',
  INTESTATARIO: 'Mattia Nasci',
  IBAN: 'IT68M0338501601100000498318',

  // Mittente e contatti
  NOME_MITTENTE: 'Staff HACE FALÒ',
  CONTATTO_NOME: 'Mattia',
  CONTATTO_TEL: '3920559059',

  QUOTA: '€20'
};

var HEADERS = [
  'Data registrazione',
  'Nome',
  'Cognome',
  'Email',
  'Telefono',
  'Metodo di pagamento',
  'Stato pagamento'
];

/* ---------------- ENDPOINT ---------------- */

function doGet() {
  return json({ ok: true, service: 'HACE FALÒ 2026', status: 'online' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    var data = parseBody(e);

    // Validazione minima lato server
    var required = ['nome', 'cognome', 'email', 'telefono', 'pagamento'];
    for (var i = 0; i < required.length; i++) {
      if (!data[required[i]] || String(data[required[i]]).trim() === '') {
        return json({ ok: false, error: 'Campo mancante: ' + required[i] });
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email).trim())) {
      return json({ ok: false, error: 'Email non valida' });
    }

    var record = {
      nome: String(data.nome).trim(),
      cognome: String(data.cognome).trim(),
      email: String(data.email).trim(),
      telefono: String(data.telefono).trim(),
      pagamento: String(data.pagamento).trim()
    };

    salvaSuFoglio(record);

    try {
      inviaMail(record);
    } catch (mailErr) {
      // La prenotazione è salvata: non facciamo fallire la richiesta
      console.error('Invio mail fallito: ' + mailErr);
    }

    return json({ ok: true, message: 'Prenotazione registrata' });

  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* ---------------- FOGLIO ---------------- */

function getSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function salvaSuFoglio(r) {
  var sheet = getSheet();
  sheet.appendRow([
    new Date(),
    r.nome,
    r.cognome,
    r.email,
    r.telefono,
    r.pagamento,
    'Da verificare'
  ]);
}

/* ---------------- MAIL ---------------- */

function inviaMail(r) {
  var oggetto = 'Conferma registrazione HACE FALÒ 2026';

  var testo =
    'Ciao ' + r.nome + ',\n\n' +
    'grazie per esserti registrato/a a HACE FALÒ 2026.\n\n' +
    'Per completare la tua prenotazione, ti invitiamo a effettuare il pagamento.\n\n' +
    'Ti aspettiamo il 14 agosto 2026 alle ore 21:00 presso la Spiaggia Libera Vascello d\'Oro.\n\n' +
    'PAGAMENTO\n' +
    'Il pagamento di ' + CONFIG.QUOTA + ' dovrà essere effettuato tramite:\n\n' +
    '- Bonifico bancario\n' +
    '  Intestatario: ' + CONFIG.INTESTATARIO + '\n' +
    '  IBAN: ' + ibanFmt(CONFIG.IBAN) + '\n' +
    '  Causale: HACE FALO 2026 - ' + r.nome + ' ' + r.cognome + '\n\n' +
    '- PayPal\n' +
    '  ' + CONFIG.PAYPAL_LINK + '\n\n' +
    '- Oppure direttamente in spiaggia in contanti\n\n' +
    'Metodo che hai scelto in fase di registrazione: ' + r.pagamento + '\n\n' +
    'Lo staff controllerà tutti i pagamenti effettuati e la sera prima dell\'evento invierà una mail di conferma definitiva.\n\n' +
    'Per qualsiasi informazione contattare:\n' +
    CONFIG.CONTATTO_NOME + '\n' +
    CONFIG.CONTATTO_TEL + '\n\n' +
    'Staff HACE FALÒ';

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#14202a;max-width:560px">' +
      '<p>Ciao <strong>' + esc(r.nome) + '</strong>,</p>' +
      '<p>grazie per esserti registrato/a a <strong>HACE FALÒ 2026</strong>.</p>' +
      '<p>Per completare la tua prenotazione, ti invitiamo a effettuare il pagamento.</p>' +
      '<p>Ti aspettiamo il <strong>14 agosto 2026 alle ore 21:00</strong> presso la <strong>Spiaggia Libera Vascello d\'Oro</strong>.</p>' +
      '<h3 style="margin:24px 0 8px">Pagamento</h3>' +
      '<p>Il pagamento di <strong>' + CONFIG.QUOTA + '</strong> dovrà essere effettuato tramite:</p>' +
      '<ul>' +
        '<li><strong>Bonifico bancario</strong><br>' +
          'Intestatario: ' + esc(CONFIG.INTESTATARIO) + '<br>' +
          'IBAN: <strong>' + esc(ibanFmt(CONFIG.IBAN)) + '</strong><br>' +
          'Causale: HACE FALO 2026 - ' + esc(r.nome + ' ' + r.cognome) +
        '</li>' +
        '<li style="margin-top:8px"><strong>PayPal</strong><br>' +
          '<a href="' + esc(CONFIG.PAYPAL_LINK) + '">' + esc(CONFIG.PAYPAL_LINK) + '</a>' +
        '</li>' +
        '<li style="margin-top:8px">Oppure direttamente <strong>in spiaggia in contanti</strong></li>' +
      '</ul>' +
      '<p>Metodo che hai scelto in fase di registrazione: <strong>' + esc(r.pagamento) + '</strong></p>' +
      '<p>Lo staff controllerà tutti i pagamenti effettuati e la sera prima dell\'evento invierà una mail di conferma definitiva.</p>' +
      '<p>Per qualsiasi informazione contattare:<br>' +
        CONFIG.CONTATTO_NOME + '<br>' + CONFIG.CONTATTO_TEL +
      '</p>' +
      '<p style="margin-top:24px">Staff HACE FALÒ</p>' +
    '</div>';

  MailApp.sendEmail({
    to: r.email,
    subject: oggetto,
    body: testo,
    htmlBody: html,
    name: CONFIG.NOME_MITTENTE
  });
}

/* ---------------- UTILITÀ ---------------- */

function parseBody(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      // fallback: dati inviati come form-encoded
      return e.parameter || {};
    }
  }
  return (e && e.parameter) || {};
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** IBAN a gruppi di 4: più facile da leggere e ricopiare. */
function ibanFmt(s) {
  return String(s).replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Esegui una volta a mano dall'editor per:
 * 1. autorizzare lo script (Foglio + invio mail);
 * 2. creare il foglio con le intestazioni;
 * 3. verificare che tutto funzioni (riceverai una mail di prova).
 */
function test() {
  var r = {
    nome: 'Prova',
    cognome: 'Test',
    email: Session.getActiveUser().getEmail(),
    telefono: '3920559059',
    pagamento: 'PayPal'
  };
  salvaSuFoglio(r);
  inviaMail(r);
  Logger.log('Riga aggiunta e mail inviata a ' + r.email);
}
