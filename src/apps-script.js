/* Source for apps-script/Code.gs. Run npm run build after changing this file. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SPREADSHEET_ID') || (props.getProperty('SHEETS_API_SECRET') || '').length < 32) throw new Error('Set SPREADSHEET_ID and SHEETS_API_SECRET in Script Properties first.');
  const book = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
  let sheet = book.getSheetByName('LedgerEvents');
  if (!sheet) sheet = book.insertSheet('LedgerEvents');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['operation_id', 'saved_at_utc', 'action', 'payload_json']);
    sheet.setFrozenRows(1);
    sheet.getRange('A1:D1').setFontWeight('bold').setBackground('#e5f0eb');
  }
}
function doPost(e) {
  let lock;
  try {
    const props = PropertiesService.getScriptProperties();
    const expected = props.getProperty('SHEETS_API_SECRET');
    const text = e && e.postData && e.postData.contents;
    if (!text || text.length > 65000) return jsonResponse({ ok: false, status: 400, error: 'ข้อมูลไม่ถูกต้องหรือใหญ่เกินไป' });
    const input = JSON.parse(text);
    if (!expected || expected.length < 32 || input.secret !== expected) return jsonResponse({ ok: false, status: 403, error: 'ไม่มีสิทธิ์เชื่อมต่อฐานข้อมูล' });
    const command = input.command && input.command.action === 'read' ? { action: 'read' } : validateCommand(input.command);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return jsonResponse({ ok: false, status: 429, error: 'มีการบันทึกอยู่ กรุณาลองใหม่สักครู่' });
    const sheet = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')).getSheetByName('LedgerEvents');
    if (!sheet) throw new Error('Run setup first');
    const values = sheet.getDataRange().getValues();
    if (values[0].join('|') !== 'operation_id|saved_at_utc|action|payload_json') throw new Error('Invalid ledger header');
    const state = readEvents(values.slice(1));
    if (command.action === 'read') return jsonResponse({ ok: true, transactions: state.transactions, revision: state.revision });
    // Durable idempotency: an uncertain network result can safely retry the exact command.
    if (state.operations[command.operationId]) {
      if (state.operations[command.operationId] !== JSON.stringify(command)) fail('รหัสคำสั่งถูกใช้กับข้อมูลอื่นแล้ว', 409);
      return jsonResponse({ ok: true, transactions: state.transactions, revision: state.revision });
    }
    if (command.baseRevision !== state.revision) fail('ข้อมูลมีการเปลี่ยนแปลงจากอีกหน้าต่าง กรุณารีเฟรชก่อนแก้ไขใหม่', 409);
    const transactions = applyCommand(state.transactions, command);
    summarize(transactions);
    // One append is the commit. JSON begins with { so user text cannot become a Sheet formula.
    sheet.appendRow([command.operationId, new Date().toISOString(), command.action, JSON.stringify(command)]);
    SpreadsheetApp.flush();
    return jsonResponse({ ok: true, transactions, revision: state.revision + 1 });
  } catch (error) {
    return jsonResponse({ ok: false, status: error.status || 500, error: error.status ? error.message : 'อ่านหรือบันทึก Google Sheets ไม่สำเร็จ ตรวจสอบการตั้งค่าและโควตา' });
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
function readEvents(rows) {
  const records = new Map();
  const operations = Object.create(null);
  rows.forEach((row, index) => {
    const command = validateCommand(JSON.parse(row[3]));
    if (row[0] !== command.operationId || operations[command.operationId] || command.baseRevision !== index || row[2] !== command.action) throw new Error('Corrupted ledger event');
    // Replay in linear time instead of copying every prior transaction for every event.
    if (command.action === 'upsert') records.set(command.transaction.id, command.transaction);
    else if (command.action === 'delete') {
      if (!records.has(command.id)) throw new Error('Invalid delete event');
      records.delete(command.id);
    } else for (const transaction of command.transactions) {
      if (!records.has(transaction.id)) records.set(transaction.id, transaction);
    }
    operations[command.operationId] = JSON.stringify(command);
  });
  return { transactions: Array.from(records.values()), operations, revision: rows.length };
}
function jsonResponse(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
