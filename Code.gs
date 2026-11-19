const SHEET_NAME = 'Escaneos';
const HEADERS = ['Fecha', 'Tipo', 'Código', 'Formato', 'Cantidad o lectura', 'Usuario', 'Notas', 'ID de envío'];
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function configure() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else if (sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0].join('|') !== HEADERS.join('|')) {
    throw new Error('La pestaña Escaneos ya existe con columnas distintas.');
  }
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  if (!properties.getProperty('SCAN_TOKEN')) {
    properties.setProperty('SCAN_TOKEN', Utilities.getUuid() + Utilities.getUuid());
  }
}

// La implementación web debe tener acceso "Solo yo".
function saveScan(params) {
  const viewer = Session.getActiveUser().getEmail();
  const owner = Session.getEffectiveUser().getEmail();
  if (!viewer || !owner || viewer.toLowerCase() !== owner.toLowerCase()) {
    throw new Error('Inicia sesión con la cuenta de Google propietaria de esta hoja y vuelve a guardar.');
  }
  return saveRecord_(params);
}

function saveRecord_(params) {
  if (!params || params.sheet !== SHEET_NAME) return { saved: false };
  const amount = Number(params.amount);
  const code = (params.code || '').trim();
  const operator = (params.operator || '').trim();
  const notes = params.notes || '';
  if (!ID_PATTERN.test(params.id) || !['Bodega', 'Medidor'].includes(params.type) ||
      !['EAN-13', 'Code 128', 'Manual'].includes(params.format) ||
      !/^\d+(\.\d+)?$/.test(params.amount) || !Number.isFinite(amount) ||
      (params.type === 'Bodega' && (!Number.isSafeInteger(amount) || amount < 1)) ||
      !code || code.length > 150 || !operator || operator.length > 100 || notes.length > 500) {
    return { saved: false };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = openSheet();
    if (!hasReceipt(sheet, params.id)) {
      sheet.appendRow([
        new Date(), params.type, literal(code), params.format, amount,
        literal(operator), literal(notes), params.id
      ]);
      SpreadsheetApp.flush();
    }
    return { saved: true };
  } finally {
    lock.releaseLock();
  }
}

function doPost(event) {
  const params = event.parameter;
  const token = PropertiesService.getScriptProperties().getProperty('SCAN_TOKEN');
  if (!token || params.token !== token) return json({ saved: false });
  return json(saveRecord_(params));
}

function doGet(event) {
  const params = event && event.parameter || {};
  if (params.mode === 'bridge' && ID_PATTERN.test(params.session || '')) {
    const html = "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Conexión a Google Sheets</title><style>body{font:18px system-ui,sans-serif;background:#edf3f6;color:#142b38;padding:24px}main{max-width:420px;margin:auto;background:white;padding:24px;border-radius:16px}</style></head><body><main><h1>Google Sheets</h1><p id=\"status\">Conectando el escáner con tu hoja…</p></main><script>\nconst SESSION = \"__SESSION__\";\nconst APP_ORIGIN = 'https://alfzunigajr-glitch.github.io';\nconst statusText = document.getElementById('status');\nconst scannerWindow = window.top.opener;\nlet busy = false;\nfunction announce() {\n  if (scannerWindow) scannerWindow.postMessage({kind:'scanner-ready',session:SESSION}, APP_ORIGIN);\n}\nconst readyTimer = setInterval(announce, 500);\nsetTimeout(() => clearInterval(readyTimer), 90000);\nwindow.addEventListener('message', (event) => {\n  if (!scannerWindow || event.origin !== APP_ORIGIN || event.source !== scannerWindow ||\n      event.data?.session !== SESSION || event.data?.kind !== 'scanner-save' || busy) return;\n  busy = true;\n  clearInterval(readyTimer);\n  const payload = event.data.payload;\n  statusText.textContent = 'Guardando el registro en tu hoja…';\n  google.script.run.withSuccessHandler((result) => {\n    statusText.textContent = result?.saved ? 'Registro guardado. Puedes volver al escáner.' : 'No se pudo guardar.';\n    scannerWindow.postMessage({kind:'scanner-result',session:SESSION,id:payload.id,saved:result?.saved === true},APP_ORIGIN);\n  }).withFailureHandler((error) => {\n    statusText.textContent = error.message || 'No se pudo guardar.';\n    scannerWindow.postMessage({kind:'scanner-result',session:SESSION,id:payload.id,saved:false,error:error.message || 'No se pudo guardar.'},APP_ORIGIN);\n  }).saveScan(payload);\n});\nif (!scannerWindow) statusText.textContent = 'Abre el escáner y pulsa Guardar en Google Sheets.';\nannounce();\n</script></body></html>";
    return HtmlService.createHtmlOutput(html.replace('"__SESSION__"', JSON.stringify(params.session)))
      .setTitle('Conexión a Google Sheets');
  }
  const { id, callback } = params;
  if (!ID_PATTERN.test(id || '') || !/^receipt_[0-9a-f]{32}$/.test(callback || '')) {
    return HtmlService.createHtmlOutput('<p>Abre el <a target="_top" href="https://alfzunigajr-glitch.github.io/escaner-codigos/">escáner de códigos</a> para guardar registros.</p>');
  }
  const saved = hasReceipt(openSheet(), id);
  return ContentService.createTextOutput(callback + '(' + JSON.stringify({ saved }) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function openSheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME);
}

function hasReceipt(sheet, id) {
  const count = sheet.getLastRow() - 1;
  return count > 0 && Boolean(sheet.getRange(2, 8, count, 1)
    .createTextFinder(id).matchEntireCell(true).findNext());
}

function literal(value) {
  return value ? "'" + value : '';
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
