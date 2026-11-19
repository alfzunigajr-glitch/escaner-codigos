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

function doPost(event) {
  const params = event.parameter;
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty('SCAN_TOKEN');
  if (!token || params.token !== token || params.sheet !== SHEET_NAME) return json({ saved: false });

  const amount = Number(params.amount);
  const code = (params.code || '').trim();
  const operator = (params.operator || '').trim();
  const notes = params.notes || '';
  if (!ID_PATTERN.test(params.id) || !['Bodega', 'Medidor'].includes(params.type) ||
      !['EAN-13', 'Code 128', 'Manual'].includes(params.format) ||
      !/^\d+(\.\d+)?$/.test(params.amount) || !Number.isFinite(amount) ||
      (params.type === 'Bodega' && (!Number.isSafeInteger(amount) || amount < 1)) ||
      !code || code.length > 150 || !operator || operator.length > 100 || notes.length > 500) {
    return json({ saved: false });
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
    return json({ saved: true });
  } finally {
    lock.releaseLock();
  }
}

function doGet(event) {
  const { id, callback } = event.parameter;
  if (!ID_PATTERN.test(id) || !/^receipt_[0-9a-f]{32}$/.test(callback)) return json({ saved: false });
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
