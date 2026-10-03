export const MAX_AMOUNT = 99999999999;
export const ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
export const CATEGORIES = {
  expense: ['อาหารและเครื่องดื่ม', 'เดินทาง', 'ที่พัก', 'ค่าน้ำค่าไฟ', 'ซื้อของ', 'สุขภาพ', 'บันเทิง', 'การศึกษา', 'รายจ่ายอื่น'],
  income: ['เงินเดือน', 'งานเสริม', 'ของขวัญ', 'รายรับอื่น']
};
export function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
export function moneyToSatang(value) {
  const text = String(value).trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) fail('กรอกจำนวนเงินให้ถูกต้อง ทศนิยมไม่เกิน 2 ตำแหน่ง');
  const [whole, fraction = ''] = text.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (amount <= 0 || amount > MAX_AMOUNT) fail('จำนวนเงินต้องมากกว่า 0 และไม่เกิน 999,999,999.99 บาท');
  return amount;
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && value >= '1900-01-01' && value <= '2199-12-31'
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateTransaction(input) {
  if (!input || typeof input !== 'object' || !ID_PATTERN.test(input.id || '')) fail('รหัสรายการไม่ถูกต้อง');
  if (!['income', 'expense'].includes(input.type)) fail('ประเภทรายการไม่ถูกต้อง');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > MAX_AMOUNT) fail('จำนวนเงินไม่ถูกต้อง');
  if (!validDate(input.date)) fail('วันที่ไม่ถูกต้อง');
  if (typeof input.category !== 'string' || !input.category.trim() || input.category.trim().length > 60) fail('หมวดหมู่ต้องมีความยาว 1–60 ตัวอักษร');
  if (typeof input.note !== 'string' || input.note.length > 300) fail('หมายเหตุต้องไม่เกิน 300 ตัวอักษร');
  return { id: input.id, type: input.type, amount: input.amount, date: input.date, category: input.category.trim(), note: input.note.trim() };
}
export function validateCommand(input) {
  if (!input || !ID_PATTERN.test(input.operationId || '')) fail('รหัสการบันทึกไม่ถูกต้อง');
  if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0) fail('เวอร์ชันข้อมูลไม่ถูกต้อง');
  const command = { operationId: input.operationId, baseRevision: input.baseRevision, action: input.action };
  if (input.action === 'upsert') command.transaction = validateTransaction(input.transaction);
  else if (input.action === 'delete') {
    if (!ID_PATTERN.test(input.id || '')) fail('รหัสรายการไม่ถูกต้อง');
    command.id = input.id;
  } else if (input.action === 'import') {
    if (!Array.isArray(input.transactions) || !input.transactions.length || input.transactions.length > 50) fail('นำเข้าได้ครั้งละ 1–50 รายการ');
    command.transactions = input.transactions.map(validateTransaction);
    if (new Set(command.transactions.map(t => t.id)).size !== command.transactions.length) fail('มีรหัสรายการซ้ำในไฟล์');
  } else fail('คำสั่งไม่ถูกต้อง');
  if (JSON.stringify(command).length > 45000) fail('ข้อมูลชุดนี้ใหญ่เกินไป');
  return command;
}
export function applyCommand(transactions, command) {
  const records = new Map(transactions.map(t => [t.id, t]));
  if (command.action === 'upsert') records.set(command.transaction.id, command.transaction);
  if (command.action === 'delete') {
    if (!records.has(command.id)) fail('ไม่พบรายการที่ต้องการลบ', 409);
    records.delete(command.id);
  }
  if (command.action === 'import') for (const transaction of command.transactions) {
    if (!records.has(transaction.id)) records.set(transaction.id, transaction);
  }
  return Array.from(records.values());
}
export function summarize(transactions) {
  let income = 0, expense = 0;
  for (const t of transactions) { if (t.type === 'income') income += t.amount; else expense += t.amount; }
  if (!Number.isSafeInteger(income) || !Number.isSafeInteger(expense)) fail('ยอดรวมมากเกินขอบเขตที่รองรับ');
  return { income, expense, balance: income - expense };
}
export function filterTransactions(transactions, { month = '', type = '', category = '', search = '' } = {}) {
  const query = search.toLocaleLowerCase('th').trim();
  return transactions.slice().reverse().filter(t => (!month || t.date.startsWith(month)) && (!type || t.type === type)
    && (!category || t.category === category) && (!query || (t.note + ' ' + t.category).toLocaleLowerCase('th').includes(query)))
    .sort((a, b) => b.date.localeCompare(a.date));
}
export function parseBackup(text) {
  let data; try { data = JSON.parse(text); } catch { fail('ไฟล์นี้ไม่ใช่ JSON ที่ถูกต้อง'); }
  if (!['littlepay-ledger', 'baankhao-ledger'].includes(data?.format) || data.version !== 1 || !Array.isArray(data.transactions)) fail('รูปแบบไฟล์สำรองไม่รองรับ');
  if (data.transactions.length > 20000) fail('ไฟล์ต้องมีไม่เกิน 20,000 รายการ');
  const transactions = data.transactions.map(validateTransaction);
  if (new Set(transactions.map(t => t.id)).size !== transactions.length) fail('มีรหัสรายการซ้ำในไฟล์');
  summarize(transactions);
  return transactions;
}
export function csvCell(value) {
  let text = String(value);
  if (/^[\s]*[=+@\-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function toCSV(transactions) {
  const rows = [['วันที่', 'ประเภท', 'หมวดหมู่', 'จำนวนเงิน (บาท)', 'หมายเหตุ'], ...transactions.map(t => [t.date, t.type === 'income' ? 'รายรับ' : 'รายจ่าย', t.category, (t.amount / 100).toFixed(2), t.note])];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
