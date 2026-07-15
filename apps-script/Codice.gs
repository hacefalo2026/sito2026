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

  QUOTA: '€20',

  // Scadenze pagamento
  SCADENZA: '12 agosto 2026',
  SCADENZA_CONTANTI: '10 agosto 2026'
};

/* Le due sole voci della colonna "Stato pagamento" */
var STATO = {
  NON_PAGATO: 'Non pagato',
  PAGATO: 'Pagato'
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
    applicaColori(sheet);
  }
  return sheet;
}

/**
 * Da eseguire UNA VOLTA a mano se il foglio ha già delle righe:
 * mette la tendina e i colori su tutte le prenotazioni esistenti
 * e converte i vecchi "Da verificare" in "Non pagato".
 */
function sistemaFoglio() {
  var sheet = getSheet();
  var ultima = sheet.getLastRow();
  applicaColori(sheet);
  if (ultima < 2) return;

  var range = sheet.getRange(2, 7, ultima - 1, 1);
  var valori = range.getValues();
  for (var i = 0; i < valori.length; i++) {
    if (valori[i][0] !== STATO.PAGATO) valori[i][0] = STATO.NON_PAGATO;
  }
  range.setValues(valori);

  var regola = SpreadsheetApp.newDataValidation()
    .requireValueInList([STATO.NON_PAGATO, STATO.PAGATO], true)
    .setAllowInvalid(false)
    .build();
  range.setDataValidation(regola);
  Logger.log('Foglio sistemato: ' + (ultima - 1) + ' righe.');
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
    STATO.NON_PAGATO
  ]);
  // Il menu a tendina sulla nuova riga: si clicca e si sceglie Pagato
  applicaTendina(sheet, sheet.getLastRow());
}

/**
 * Colonna "Stato pagamento": menu a tendina con due sole voci.
 * In Google Fogli appare come un pulsante colorato da cliccare.
 */
function applicaTendina(sheet, riga) {
  var regola = SpreadsheetApp.newDataValidation()
    .requireValueInList([STATO.NON_PAGATO, STATO.PAGATO], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(riga, 7).setDataValidation(regola);
}

/** Verde se Pagato, rosso se Non pagato. Si imposta una volta sola. */
function applicaColori(sheet) {
  var range = sheet.getRange('G2:G1000');

  var pagato = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(STATO.PAGATO)
    .setBackground('#D6F5DE').setFontColor('#0B6B33').setBold(true)
    .setRanges([range]).build();

  var nonPagato = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(STATO.NON_PAGATO)
    .setBackground('#FDE0DA').setFontColor('#A32100')
    .setRanges([range]).build();

  sheet.setConditionalFormatRules([pagato, nonPagato]);
}

/* ---------------- MAIL ---------------- */

/**
 * Mail HTML nei colori del sito.
 * Costruita con tabelle e stili in linea: è l'unico modo perché regga
 * su Gmail, Outlook e Apple Mail, che ignorano CSS e flexbox.
 */
function mailHtml(r) {
  var NOTTE = '#050D14', MARE = '#0A2733', SABBIA = '#E7D7B9',
      TESTO = '#F3EEE4', SOFT = '#A8B4BC', SCHIUMA = '#7FD8D0',
      BRACE = '#FF5A1F', FIAMMA = '#FFB03A', LINEA = '#1E3A47';

  var mono = "'Courier New',Courier,monospace";
  var sans = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  // Riga di dettaglio: etichetta piccola + valore
  function riga(label, valore) {
    return '<tr>' +
      '<td style="padding:0 0 14px">' +
        '<div style="font-family:' + mono + ';font-size:10px;letter-spacing:2px;' +
             'text-transform:uppercase;color:' + SCHIUMA + ';padding-bottom:3px">' + label + '</div>' +
        '<div style="font-family:' + sans + ';font-size:15px;color:' + TESTO + '">' + valore + '</div>' +
      '</td></tr>';
  }

  return '' +
'<!DOCTYPE html><html><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>HACE FALÒ 2026</title></head>' +
'<body style="margin:0;padding:0;background:' + NOTTE + ';">' +
'<div style="display:none;max-height:0;overflow:hidden;opacity:0">' +
  'Prenotazione registrata. Pagamento di ' + CONFIG.QUOTA + ' entro il ' + CONFIG.SCADENZA + '.' +
'</div>' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
       'style="background:' + NOTTE + ';padding:24px 12px">' +
'<tr><td align="center">' +

  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
         'style="max-width:560px;background:' + MARE + ';border:1px solid ' + LINEA + ';border-radius:14px;overflow:hidden">' +

    // Testata: il falò
    '<tr><td style="background:' + NOTTE + ';padding:34px 28px 30px;text-align:center;' +
                   'border-bottom:1px solid ' + LINEA + '">' +
      '<div style="font-family:' + mono + ';font-size:10px;letter-spacing:3px;' +
           'text-transform:uppercase;color:' + SCHIUMA + ';padding-bottom:10px">' +
        'La notte di Ferragosto sulla spiaggia' +
      '</div>' +
      '<div style="font-family:' + sans + ';font-size:34px;line-height:1.05;font-weight:800;' +
           'letter-spacing:-1px;color:' + TESTO + '">' +
        'HACE <span style="color:' + BRACE + '">FALÒ</span> 2026' +
      '</div>' +
      '<div style="height:3px;width:56px;margin:16px auto 0;border-radius:2px;' +
           'background:' + FIAMMA + '"></div>' +
    '</td></tr>' +

    // Corpo
    '<tr><td style="padding:28px 28px 8px;font-family:' + sans + ';font-size:15px;' +
                   'line-height:1.6;color:' + TESTO + '">' +
      '<p style="margin:0 0 14px">Ciao <strong>' + esc(r.nome) + '</strong>,</p>' +
      '<p style="margin:0 0 14px;color:' + SOFT + '">' +
        'grazie per esserti registrato/a a HACE FALÒ 2026. ' +
        'Per completare la tua prenotazione, ti invitiamo a effettuare il pagamento.' +
      '</p>' +
    '</td></tr>' +

    // Scadenza: unico avviso
    '<tr><td style="padding:8px 28px 4px">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
             'style="background:rgba(255,176,58,0.10);border-left:3px solid ' + FIAMMA + ';border-radius:0 8px 8px 0">' +
        '<tr><td style="padding:14px 16px;font-family:' + sans + ';font-size:14px;line-height:1.55;color:' + TESTO + '">' +
          'Il pagamento di <strong style="color:' + FIAMMA + '">' + CONFIG.QUOTA + '</strong> va effettuato ' +
          '<strong style="color:' + FIAMMA + '">entro e non oltre il ' + CONFIG.SCADENZA + '</strong>.<br>' +
          'In contanti <strong style="color:' + BRACE + '">entro il ' + CONFIG.SCADENZA_CONTANTI + '</strong>: ' +
          'dopo questa data la modalità non è più disponibile.' +
        '</td></tr>' +
      '</table>' +
    '</td></tr>' +

    // Metodi di pagamento
    '<tr><td style="padding:22px 28px 6px">' +
      '<div style="font-family:' + mono + ';font-size:10px;letter-spacing:2px;' +
           'text-transform:uppercase;color:' + SCHIUMA + ';padding-bottom:12px">Come pagare</div>' +

      // Bonifico
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
             'style="border:1px solid ' + LINEA + ';border-radius:10px;margin-bottom:10px">' +
        '<tr><td style="padding:14px 16px;font-family:' + sans + ';font-size:14px;line-height:1.55;color:' + SOFT + '">' +
          '<div style="color:' + TESTO + ';font-weight:700;padding-bottom:6px">Bonifico bancario</div>' +
          'Intestatario: <span style="color:' + TESTO + '">' + esc(CONFIG.INTESTATARIO) + '</span><br>' +
          'IBAN: <span style="font-family:' + mono + ';color:' + SCHIUMA + ';font-size:14px">' +
            esc(ibanFmt(CONFIG.IBAN)) + '</span><br>' +
          'Causale: <span style="color:' + TESTO + '">HACE FALÒ 2026 — ' + esc(r.nome + ' ' + r.cognome) + '</span>' +
        '</td></tr>' +
      '</table>' +

      // PayPal
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
             'style="border:1px solid ' + LINEA + ';border-radius:10px;margin-bottom:10px">' +
        '<tr><td style="padding:14px 16px;font-family:' + sans + ';font-size:14px;line-height:1.55;color:' + SOFT + '">' +
          '<div style="color:' + TESTO + ';font-weight:700;padding-bottom:6px">PayPal</div>' +
          '<a href="' + esc(CONFIG.PAYPAL_LINK) + '" style="color:' + FIAMMA + ';font-weight:600">' +
            esc(CONFIG.PAYPAL_LINK.replace(/^https?:\/\//, '')) + '</a>' +
        '</td></tr>' +
      '</table>' +

      // Contanti
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
             'style="border:1px solid ' + LINEA + ';border-radius:10px">' +
        '<tr><td style="padding:14px 16px;font-family:' + sans + ';font-size:14px;line-height:1.55;color:' + SOFT + '">' +
          '<div style="color:' + TESTO + ';font-weight:700;padding-bottom:6px">Contanti</div>' +
          CONFIG.QUOTA + ' da consegnare a mano a ' + CONFIG.CONTATTO_NOME + '.' +
        '</td></tr>' +
      '</table>' +
    '</td></tr>' +

    // Riepilogo prenotazione: il biglietto
    '<tr><td style="padding:22px 28px 6px">' +
      '<div style="font-family:' + mono + ';font-size:10px;letter-spacing:2px;' +
           'text-transform:uppercase;color:' + SCHIUMA + ';padding-bottom:12px">La tua prenotazione</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
             'style="border:1px dashed ' + LINEA + ';border-radius:10px">' +
        '<tr><td style="padding:16px 16px 2px">' +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
            riga('Partecipante', esc(r.nome + ' ' + r.cognome)) +
            riga('Metodo scelto', esc(r.pagamento)) +
            riga('Quota', CONFIG.QUOTA) +
          '</table>' +
        '</td></tr>' +
      '</table>' +
    '</td></tr>' +

    // Conferma definitiva
    '<tr><td style="padding:18px 28px 4px;font-family:' + sans + ';font-size:14px;' +
                   'line-height:1.6;color:' + SOFT + '">' +
      'Lo staff controllerà tutti i pagamenti effettuati. Se il tuo pagamento risulta effettuato ' +
      'correttamente, <strong style="color:' + TESTO + '">il giorno prima dell\'evento riceverai ' +
      'una mail di conferma definitiva</strong>.' +
    '</td></tr>' +

    // Contatti
    '<tr><td style="padding:16px 28px 4px;font-family:' + sans + ';font-size:14px;' +
                   'line-height:1.6;color:' + SOFT + '">' +
      'Per qualsiasi informazione contattare:<br>' +
      '<span style="color:' + TESTO + '">' + CONFIG.CONTATTO_NOME + '</span> — ' +
      '<a href="tel:+39' + CONFIG.CONTATTO_TEL + '" style="color:' + FIAMMA + ';text-decoration:none">' +
        CONFIG.CONTATTO_TEL + '</a>' +
    '</td></tr>' +

    // Appuntamento, in fondo
    '<tr><td style="padding:24px 28px 28px">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
             'style="border-top:1px solid ' + LINEA + '">' +
        '<tr><td style="padding:22px 0 0;text-align:center;font-family:' + sans + ';' +
                       'font-size:15px;line-height:1.6;color:' + TESTO + '">' +
          'Ti aspettiamo il <strong style="color:' + FIAMMA + '">14 agosto 2026 alle ore 21:00</strong><br>' +
          'presso la <strong style="color:' + SABBIA + '">Spiaggia Libera Vascello d\'Oro</strong>.' +
        '</td></tr>' +
      '</table>' +
    '</td></tr>' +

  '</table>' +

  // Firma
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">' +
    '<tr><td style="padding:18px 0 6px;text-align:center;font-family:' + mono + ';font-size:10px;' +
                   'letter-spacing:3px;text-transform:uppercase;color:#5C6B75">' +
      'Staff HACE FALÒ' +
    '</td></tr>' +
  '</table>' +

'</td></tr></table></body></html>';
}

function inviaMail(r) {
  var oggetto = 'Conferma registrazione HACE FALÒ 2026';

  var testo =
    'Ciao ' + r.nome + ',\n\n' +
    'grazie per esserti registrato/a a HACE FALÒ 2026.\n\n' +
    'Per completare la tua prenotazione, ti invitiamo a effettuare il pagamento.\n\n' +
    'PAGAMENTO\n' +
    'Il pagamento di ' + CONFIG.QUOTA + ' deve essere effettuato entro e non oltre il ' + CONFIG.SCADENZA + '.\n' +
    'In contanti entro il ' + CONFIG.SCADENZA_CONTANTI + ': dopo questa data la modalità non è più disponibile.\n\n' +
    'Puoi pagare tramite:\n\n' +
    '- Bonifico bancario\n' +
    '  Intestatario: ' + CONFIG.INTESTATARIO + '\n' +
    '  IBAN: ' + ibanFmt(CONFIG.IBAN) + '\n' +
    '  Causale: HACE FALO 2026 - ' + r.nome + ' ' + r.cognome + '\n\n' +
    '- PayPal\n' +
    '  ' + CONFIG.PAYPAL_LINK + '\n\n' +
    '- Contanti\n' +
    '  ' + CONFIG.QUOTA + ' da consegnare a mano a ' + CONFIG.CONTATTO_NOME + '.\n\n' +
    'Metodo che hai scelto in fase di registrazione: ' + r.pagamento + '\n\n' +
    'Lo staff controllerà tutti i pagamenti effettuati. Se il tuo pagamento risulta\n' +
    'effettuato correttamente, il giorno prima dell\'evento riceverai una mail di\n' +
    'conferma definitiva.\n\n' +
    'Per qualsiasi informazione contattare:\n' +
    CONFIG.CONTATTO_NOME + '\n' +
    CONFIG.CONTATTO_TEL + '\n\n' +
    'Ti aspettiamo il 14 agosto 2026 alle ore 21:00 presso la Spiaggia Libera Vascello d\'Oro.\n\n' +
    'Staff HACE FALÒ';

  var html = mailHtml(r);

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
