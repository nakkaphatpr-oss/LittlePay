import { CATEGORIES, moneyToSatang, validateTransaction, validateCommand, applyCommand, summarize, filterTransactions, parseBackup, toCSV } from './core.js';

const $ = selector => document.querySelector(selector);
const money = value => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value / 100);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// Preserve the original storage namespace so a rename never discards existing demo data.
const DEMO_KEY = 'baankhao-demo-v1';
let state = { transactions: [], revision: 0 }, mode = null, token = null, config, busy = false, pending = null, editing = null, page = 1, view = 'overview', toastTimer;
let googleReady;
const viewLabels = { overview: ['ภาพรวมการเงิน', 'รู้ที่มา เห็นที่ไป วางแผนเดือนถัดไปได้ดีขึ้น'], transactions: ['รายการทั้งหมด', 'ทุกรายรับ ทุกรายจ่าย อยู่ในที่เดียว'], reports: ['สรุปตามหมวดหมู่', 'มองเห็นรูปแบบการใช้เงินของคุณ'], settings: ['ข้อมูลและการตั้งค่า', 'จัดการสมุดบัญชีและเก็บข้อมูลไว้กับคุณ'] };
$('#month').value = today().slice(0, 7);
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function toast(message, error = false) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').className = 'toast' + (error ? ' error' : ''); $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 10000 : 4500); }
function setBusy(value) { busy = value; for (const id of ['add', 'refresh', 'save', 'retry', 'import-json', 'logout', 'connect-real', 'demo-start']) $('#' + id).disabled = value; document.querySelectorAll('[data-edit],[data-delete]').forEach(button => { button.disabled = value; }); $('#save').textContent = value ? 'กำลังบันทึก…' : 'บันทึกรายการ'; }
function confirmAction(title, message) { return new Promise(resolve => {
  $('#confirm-title').textContent = title; $('#confirm-message').textContent = message;
  const dialog = $('#confirmation');
  const done = result => { dialog.close(); dialog.oncancel = null; resolve(result); };
  $('#confirm-yes').onclick = () => done(true); $('#confirm-no').onclick = () => done(false); dialog.oncancel = event => { event.preventDefault(); done(false); }; dialog.showModal();
}); }
function demoSeed() {
  const month = today().slice(0, 7);
  return [
    ['income', '32000', '01', 'เงินเดือน', 'เงินเดือนของเดือนนี้'],
    ['expense', '6500', '01', 'ที่พัก', 'ค่าเช่าห้อง'],
    ['expense', '85', '02', 'อาหารและเครื่องดื่ม', 'มื้อกลางวัน'],
    ['expense', '120', '02', 'เดินทาง', 'เติมบัตรเดินทาง'],
    ['expense', '145', '03', 'อาหารและเครื่องดื่ม', 'กาแฟและขนม'],
    ['income', '2500', '03', 'งานเสริม', 'ออกแบบภาพประกอบ'],
    ['expense', '890', '03', 'ซื้อของ', 'ของใช้ในบ้าน']
  ].map(([type, amount, day, category, note]) => ({ id: crypto.randomUUID(), type, amount: moneyToSatang(amount), date: month + '-' + day, category, note }));
}
async function api(command) {
  let response;
  try { response = await fetch('/api/ledger', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(command), signal: AbortSignal.timeout(55000) }); }
  catch { throw new Error('เครือข่ายขัดข้อง ยังยืนยันผลการบันทึกไม่ได้ กรุณาลองใหม่'); }
  let body; try { body = await response.json(); } catch { throw new Error('เซิร์ฟเวอร์ตอบกลับไม่สมบูรณ์ กรุณาลองใหม่'); }
  if (!response.ok) { const error = new Error(body.error || 'เชื่อมต่อไม่สำเร็จ'); error.status = response.status; throw error; }
  if (!Array.isArray(body.transactions) || !Number.isSafeInteger(body.revision)) throw new Error('รูปแบบข้อมูลจากเซิร์ฟเวอร์ไม่ถูกต้อง');
  return { transactions: body.transactions.map(validateTransaction), revision: body.revision };
}
function showWorkspace() { $('#welcome').hidden = true; $('#workspace').hidden = false; $('#demo-banner').hidden = mode !== 'demo'; $('#connection-label').textContent = mode === 'demo' ? 'ข้อมูลทดลอง · ในเครื่อง' : 'เชื่อมต่อ Google Sheets'; render(); }
function synced() { $('#sync-time').textContent = 'อัปเดต ' + new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date()); }
async function refresh() {
  if (busy) return;
  setBusy(true);
  try {
    if (mode === 'demo') { const stored = localStorage.getItem(DEMO_KEY); if (stored) { const data = JSON.parse(stored); state = { transactions: data.transactions.map(validateTransaction), revision: data.revision }; } }
    else state = await api({ action: 'read' });
    pending = null; $('#pending-banner').hidden = true; synced(); render(); toast('อัปเดตข้อมูลแล้ว');
  } catch (error) { toast(error.message, true); if (error.status === 401) await returnToLogin(); }
  finally { setBusy(false); }
}
async function transmit(command) {
  if (mode !== 'demo') return api(command);
  // Read the latest local version so a second tab cannot silently overwrite changes.
  const stored = localStorage.getItem(DEMO_KEY);
  const latest = stored ? JSON.parse(stored) : state;
  if (latest.revision !== command.baseRevision) { const error = new Error('ข้อมูลทดลองเปลี่ยนจากอีกหน้าต่าง กรุณารีเฟรช'); error.status = 409; throw error; }
  const next = { transactions: applyCommand(latest.transactions, command), revision: latest.revision + 1 };
  localStorage.setItem(DEMO_KEY, JSON.stringify(next));
  return next;
}
async function mutate(data, retry = false) {
  if (busy) return false;
  if (pending && !retry) { toast('กรุณาลองบันทึกคำสั่งที่ค้างอยู่ หรือรีเฟรชเพื่อตรวจสอบข้อมูลก่อน', true); return false; }
  const command = retry ? pending : validateCommand({ ...data, operationId: crypto.randomUUID(), baseRevision: state.revision });
  setBusy(true); pending = command;
  try {
    state = await transmit(command); pending = null; $('#pending-banner').hidden = true; synced(); render(); return true;
  } catch (error) {
    if ([400, 401, 403, 409, 413, 415, 503].includes(error.status) || mode === 'demo') pending = null;
    $('#pending-banner').hidden = !pending; $('#form-error').textContent = error.message; toast(error.message, true);
    if (error.status === 401) { $('#editor').close(); await returnToLogin(); }
    return false;
  } finally { setBusy(false); }
}
async function returnToLogin() {
  token = null; state = { transactions: [], revision: 0 }; mode = null;
  $('#workspace').hidden = true; $('#welcome').hidden = false; $('#connection-label').textContent = 'กรุณาเข้าสู่ระบบ';
  await initGoogle();
}
function empty(container, title = 'ยังไม่มีรายการในเดือนนี้', detail = 'เริ่มจดบันทึกด้วยปุ่ม “เพิ่มรายการ” ด้านบน') {
  const node = el('div', undefined, 'empty'); node.append(el('span', '﹏'), el('div', title), el('small', detail)); container.replaceChildren(node);
}
function renderList(container, records) {
  container.replaceChildren(); if (!records.length) return empty(container, 'ไม่พบรายการ', 'ลองเลือกเดือนอื่น เปลี่ยนตัวกรอง หรือเพิ่มรายการใหม่');
  const wrapper = el('div', undefined, 'table-wrap'), table = el('table'), head = el('thead'), tr = el('tr');
  for (const [title, cls] of [['รายการ', ''], ['หมวดหมู่', 'category-column'], ['วันที่', 'date-column'], ['จำนวนเงิน', 'numeric'], ['จัดการ', 'row-actions']]) tr.append(el('th', title, cls));
  head.append(tr); table.append(head); const tbody = el('tbody');
  records.forEach(t => {
    const row = el('tr'), cell = el('td'), label = el('div', undefined, 'transaction-label'), text = el('div');
    const formattedDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(t.date + 'T12:00:00+07:00'));
    text.append(el('b', t.note || t.category), el('small', formattedDate + ' · ' + (t.type === 'income' ? 'รายรับ' : 'รายจ่าย')));
    label.append(el('span', t.type === 'income' ? '↙' : '↗', 'symbol ' + (t.type === 'income' ? 'income-bg' : 'expense-bg')), text); cell.append(label);
    const category = el('td', undefined, 'category-column'); category.append(el('span', t.category, 'pill'));
    const actions = el('td', undefined, 'row-actions');
    for (const [action, title] of [['edit', 'แก้ไข'], ['delete', 'ลบ']]) { const button = el('button', title); button.dataset[action] = t.id; button.setAttribute('aria-label', title + ' ' + (t.note || t.category)); button.disabled = busy; actions.append(button); }
    row.append(cell, category, el('td', formattedDate, 'date-column muted'), el('td', (t.type === 'income' ? '+' : '−') + money(t.amount), 'numeric money-' + t.type), actions); tbody.append(row);
  }); table.append(tbody); wrapper.append(table); container.append(wrapper);
}
function renderCategories(container, records, limit = Infinity) {
  container.replaceChildren(); if (!records.length) return empty(container, 'ยังไม่มีข้อมูลหมวดหมู่', 'สัดส่วนจะแสดงเมื่อมีรายการในเดือนนี้');
  const groups = new Map(); let total = 0;
  records.forEach(t => { groups.set(t.category, (groups.get(t.category) || 0) + t.amount); total += t.amount; });
  const sorted = [...groups].sort((a, b) => b[1] - a[1]);
  sorted.slice(0, limit).forEach(([name, amount]) => {
    const line = el('div', undefined, 'category-line'), label = el('div', undefined, 'category-label'), value = el('div');
    value.append(el('strong', money(amount)), el('small', (amount / total * 100).toFixed(1) + '%')); label.append(el('span', name), value);
    const meter = el('meter'); meter.min = 0; meter.max = total; meter.value = amount; meter.setAttribute('aria-label', name + ' ' + money(amount)); line.append(label, meter); container.append(line);
  });
  const bottom = el('div', undefined, 'category-total'); bottom.append(el('span', sorted.length > limit ? `แสดง ${limit} จาก ${sorted.length} หมวดหมู่` : 'รวม ' + sorted.length + ' หมวดหมู่'), el('span', money(total))); container.append(bottom);
}
function renderChart(records) {
  const container = $('#daily-chart'); container.replaceChildren(); const month = $('#month').value;
  if (!records.length) return empty(container, 'ยังไม่มีรายจ่ายในเดือนนี้', 'กราฟรายวันจะปรากฏที่นี่');
  const [year, monthNumber] = month.split('-').map(Number), days = new Date(year, monthNumber, 0).getDate();
  const totals = Array(days).fill(0); records.forEach(t => { totals[Number(t.date.slice(-2)) - 1] += t.amount; });
  const max = Math.max(...totals, 100), ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 500 155'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'กราฟรายจ่ายรายวัน ยอดสูงสุด ' + money(max));
  const shape = (tag, attrs) => { const node = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v)); return node; };
  for (let i = 0; i < 3; i++) { const y = 12 + i * 53; svg.append(shape('line', { x1: 60, x2: 496, y1: y, y2: y })); const text = shape('text', { x: 0, y: y + 4 }); text.textContent = Math.round(max / 100 * (1 - i / 2)).toLocaleString('th-TH'); svg.append(text); }
  const step = 436 / days;
  totals.forEach((amount, i) => { const height = amount / max * 106; const bar = shape('rect', { x: 60 + i * step + 1, y: 118 - height, width: Math.max(step - 4, 2), height: Math.max(height, 1), rx: 2 }); const title = shape('title', {}); title.textContent = 'วันที่ ' + (i + 1) + ': ' + money(amount); bar.append(title); svg.append(bar); });
  [1, 5, 10, 15, 20, 25, days].forEach(day => { const text = shape('text', { x: 60 + (day - 1) * step, y: 146 }); text.textContent = day; svg.append(text); }); container.append(svg);
}
function filters() { return { month: $('#month').value, search: $('#search').value, type: $('#type-filter').value, category: $('#category-filter').value }; }
function render() {
  const monthRecords = filterTransactions(state.transactions, { month: $('#month').value });
  const totals = summarize(monthRecords);
  for (const key of ['balance', 'income', 'expense']) $('#' + key).textContent = money(totals[key]);
  for (const type of ['income', 'expense']) $('#' + type + '-count').textContent = monthRecords.filter(t => t.type === type).length + ' รายการในเดือนนี้';
  renderChart(monthRecords.filter(t => t.type === 'expense'));
  renderCategories($('#category-overview'), monthRecords.filter(t => t.type === 'expense'), 4);
  renderCategories($('#category-report'), monthRecords.filter(t => t.type === 'expense'));
  renderCategories($('#income-report'), monthRecords.filter(t => t.type === 'income'));
  renderList($('#recent-list'), monthRecords.slice(0, 5));
  const selected = $('#category-filter').value, categories = [...new Set(state.transactions.map(t => t.category))].sort();
  $('#category-filter').replaceChildren(new Option('ทุกหมวดหมู่', ''), ...categories.map(c => new Option(c, c))); $('#category-filter').value = categories.includes(selected) ? selected : '';
  renderFullList();
  $('#category-tags').replaceChildren(...[...new Set([...CATEGORIES.expense, ...CATEGORIES.income, ...categories])].map(c => el('span', c)));
  $('#storage-details').textContent = mode === 'demo' ? `กำลังใช้ข้อมูลทดลอง ${state.transactions.length} รายการ ข้อมูลอยู่ในเบราว์เซอร์นี้และอาจหายเมื่อล้างข้อมูลเว็บไซต์ สามารถสำรอง JSON แล้วย้ายไปบัญชีจริงได้` : `เชื่อม Google Sheets แล้ว · ${state.transactions.length} รายการ · เวอร์ชันข้อมูล ${state.revision} ข้อมูลจริงไม่ถูกบันทึกลงพื้นที่จัดเก็บของเบราว์เซอร์ หากเปิดหลายหน้าต่าง ให้รีเฟรชก่อนแก้ไข`;
}
function renderFullList() {
  const records = filterTransactions(state.transactions, filters()), pages = Math.max(1, Math.ceil(records.length / 20)); page = Math.min(page, pages);
  renderList($('#full-list'), records.slice((page - 1) * 20, page * 20));
  $('#results-count').textContent = records.length + ' รายการ · รายจ่าย ' + money(summarize(records).expense);
  $('#page-info').textContent = page + ' / ' + pages; $('#prev-page').disabled = page <= 1; $('#next-page').disabled = page >= pages;
}
function setView(next) {
  view = next; for (const item of document.querySelectorAll('.view')) item.hidden = item.id !== next;
  document.querySelectorAll('.nav-item').forEach(button => { button.classList.toggle('active', button.dataset.view === next); button.setAttribute('aria-current', button.dataset.view === next ? 'page' : 'false'); });
  $('#view-title').textContent = viewLabels[next][0]; $('#view-subtitle').textContent = viewLabels[next][1]; $('#page-label').textContent = next === 'overview' ? 'ภาพรวม' : viewLabels[next][0]; $('#month-toolbar').hidden = next === 'settings';
}
function fillCategories() { const type = new FormData($('#transaction-form')).get('type'); const options = [...new Set([...CATEGORIES[type], ...state.transactions.filter(t => t.type === type).map(t => t.category)])]; $('#categories').replaceChildren(...options.map(c => new Option(c, c))); }
function openEditor(id = null) {
  if (busy) return; if (pending) return toast('กรุณาลองบันทึกคำสั่งเดิมหรือรีเฟรชก่อน', true);
  editing = id; const form = $('#transaction-form'); form.reset(); $('#form-error').textContent = ''; $('#editor-title').textContent = id ? 'แก้ไขรายการ' : 'เพิ่มรายการ';
  if (id) { const t = state.transactions.find(t => t.id === id); if (!t) return; form.elements.type.value = t.type; $('#amount').value = (t.amount / 100).toFixed(2); $('#date').value = t.date; $('#category').value = t.category; $('#note').value = t.note; }
  else $('#date').value = today(); fillCategories(); $('#editor').showModal(); $('#amount').focus();
}
function download(content, filename, type) { const url = URL.createObjectURL(new Blob([content], { type })), link = el('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function initGoogle() {
  if (!config?.configured) return;
  try {
    if (!googleReady) googleReady = new Promise((resolve, reject) => { const script = el('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.onload = resolve; script.onerror = () => reject(new Error('โหลด Google Login ไม่สำเร็จ กรุณารีโหลดหน้า')); document.head.append(script); });
    await googleReady;
    window.google.accounts.id.initialize({ client_id: config.clientId, auto_select: false, callback: async response => {
      if (busy) return; setBusy(true); token = response.credential;
      try { state = await api({ action: 'read' }); mode = 'cloud'; pending = null; $('#pending-banner').hidden = true; synced(); showWorkspace(); }
      catch (error) { token = null; toast(error.message, true); }
      finally { setBusy(false); }
    } });
    $('#google-login').replaceChildren(); window.google.accounts.id.renderButton($('#google-login'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'th', shape: 'pill' });
  } catch (error) { googleReady = null; $('#setup-message').textContent = error.message; }
}
$('#demo-start').onclick = () => {
  try { const stored = localStorage.getItem(DEMO_KEY); if (stored) { const data = JSON.parse(stored); state = { transactions: data.transactions.map(validateTransaction), revision: data.revision }; } else { state = { transactions: demoSeed(), revision: 0 }; localStorage.setItem(DEMO_KEY, JSON.stringify(state)); } mode = 'demo'; pending = null; $('#pending-banner').hidden = true; synced(); showWorkspace(); }
  catch { toast('เปิดข้อมูลทดลองไม่ได้ พื้นที่จัดเก็บของเบราว์เซอร์อาจถูกปิดหรือข้อมูลเสียหาย', true); }
};
$('#connect-real').onclick = () => returnToLogin();
$('#logout').onclick = async () => { if (busy) return; if (pending && !await confirmAction('ออกจากระบบ?', 'ยังมีคำสั่งที่ไม่ทราบผล กรุณาตรวจสอบรายการหลังเข้าสู่ระบบอีกครั้ง')) return; pending = null; window.google?.accounts.id.disableAutoSelect(); await returnToLogin(); };
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$('#add').onclick = () => openEditor();
$('#refresh').onclick = refresh;
$('#retry').onclick = async () => { if (pending && await mutate(null, true)) { $('#editor').close(); toast('ยืนยันการบันทึกแล้ว'); } };
for (const id of ['close-editor', 'cancel-editor']) $('#' + id).onclick = () => { if (!busy) $('#editor').close(); };
$('#editor').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
document.querySelectorAll('input[name="type"]').forEach(input => input.addEventListener('change', () => { $('#category').value = ''; fillCategories(); }));
$('#transaction-form').onsubmit = async event => {
  event.preventDefault(); $('#form-error').textContent = '';
  try { const form = new FormData(event.currentTarget); const transaction = validateTransaction({ id: editing || crypto.randomUUID(), type: form.get('type'), amount: moneyToSatang(form.get('amount')), date: form.get('date'), category: form.get('category'), note: form.get('note') });
    if (await mutate({ action: 'upsert', transaction })) { $('#editor').close(); toast('บันทึกรายการเรียบร้อยแล้ว'); }
    else if (pending) $('#editor').close();
  } catch (error) { $('#form-error').textContent = error.message; }
};
document.addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit]'), remove = event.target.closest('[data-delete]');
  if (edit) openEditor(edit.dataset.edit);
  if (remove && !busy) { const t = state.transactions.find(t => t.id === remove.dataset.delete); const detail = mode === 'demo' ? 'รายการทดลองนี้จะถูกนำออกจากเบราว์เซอร์' : 'รายการจะถูกลบจากยอดสรุป แต่ยังมีประวัติใน Google Sheets'; if (t && await confirmAction('ลบรายการนี้?', `${t.note || t.category} · ${money(t.amount)}\n${detail}`)) { if (await mutate({ action: 'delete', id: t.id })) toast('ลบรายการแล้ว'); } }
});
$('#month').onchange = () => { if (!/^\d{4}-\d{2}$/.test($('#month').value) || !$('#month').validity.valid) $('#month').value = today().slice(0, 7); page = 1; render(); };
for (const [id, direction] of [['prev-month', -1], ['next-month', 1]]) $('#' + id).onclick = () => { const date = new Date($('#month').value + '-15T12:00:00Z'); date.setUTCMonth(date.getUTCMonth() + direction); const next = date.toISOString().slice(0, 7); if (next >= '1900-01' && next <= '2199-12') { $('#month').value = next; page = 1; render(); } };
for (const id of ['search', 'type-filter', 'category-filter']) $('#' + id).addEventListener('input', () => { page = 1; renderFullList(); });
$('#clear-filters').onclick = () => { for (const id of ['search', 'type-filter', 'category-filter']) $('#' + id).value = ''; page = 1; renderFullList(); };
$('#prev-page').onclick = () => { page--; renderFullList(); }; $('#next-page').onclick = () => { page++; renderFullList(); };
$('#export-json').onclick = () => { download(JSON.stringify({ format: 'littlepay-ledger', version: 1, exportedAt: new Date().toISOString(), transactions: state.transactions }, null, 2), `littlepay-backup-${today()}.json`, 'application/json'); toast('สร้างไฟล์สำรองแล้ว'); };
$('#export-csv').onclick = () => download(toCSV(filterTransactions(state.transactions, filters())), `littlepay-${$('#month').value}.csv`, 'text/csv;charset=utf-8');
$('#import-json').onclick = () => { if (!pending) $('#import-file').click(); else toast('กรุณาจัดการคำสั่งที่ค้างอยู่ก่อน', true); };
$('#import-file').onchange = async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try {
    if (file.size > 15000000) throw new Error('ไฟล์ต้องไม่เกิน 15 MB');
    const transactions = parseBackup(await file.text()), ids = new Set(state.transactions.map(t => t.id));
    const additions = transactions.filter(t => !ids.has(t.id));
    if (!additions.length) return toast('ไม่มีรายการใหม่ในไฟล์นี้');
    if (!await confirmAction('นำเข้าข้อมูล?', `เพิ่ม ${additions.length} รายการ ข้ามรหัสที่มีอยู่แล้ว ${transactions.length - additions.length} รายการ\nไม่เขียนทับรายการเดิม แนะนำให้สำรองข้อมูลก่อนดำเนินการ`)) return;
    let imported = 0;
    for (let i = 0; i < additions.length; i += 50) {
      const chunk = additions.slice(i, i + 50);
      if (!await mutate({ action: 'import', transactions: chunk })) { $('#import-status').textContent = `ยืนยันแล้ว ${imported} รายการ หยุดนำเข้า กรุณาจัดการคำสั่งที่ค้างแล้วนำเข้าไฟล์เดิมอีกครั้ง ระบบจะข้ามรายการที่มีแล้ว`; return; }
      imported += chunk.length; $('#import-status').textContent = `นำเข้าแล้ว ${imported} / ${additions.length} รายการ`;
    }
    toast('นำเข้าข้อมูลเรียบร้อยแล้ว');
  } catch (error) { toast(error.message, true); }
};
window.addEventListener('beforeunload', event => { if (busy || pending) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('storage', event => { if (mode === 'demo' && event.key === DEMO_KEY) toast('ข้อมูลทดลองเปลี่ยนจากอีกหน้าต่าง กรุณารีเฟรชก่อนแก้ไข'); });
try {
  const response = await fetch('/api/ledger', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(); config = await response.json();
  $('#setup-message').textContent = config.configured ? 'เข้าสู่ระบบด้วยบัญชี Google ที่เจ้าของแอปกำหนดไว้' : 'ยังไม่ได้เชื่อม Google Sheets — ลองหน้าจอได้ก่อน แล้วตั้งค่าตามคู่มือ README';
  await initGoogle();
} catch { $('#setup-message').textContent = 'ยังติดต่อเซิร์ฟเวอร์ไม่ได้ สามารถลองหน้าจอด้วยข้อมูลตัวอย่างก่อนได้'; }
