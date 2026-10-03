import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyToSatang, validateTransaction, validateCommand, applyCommand, summarize, filterTransactions, parseBackup, toCSV } from '../public/core.js';
const transaction = { id: 'transaction-001', type: 'expense', amount: 1010, date: '2026-10-03', category: 'อาหาร', note: 'ข้าว' };
test('money uses exact integer satang, including 0.10 + 0.20', () => {
  assert.equal(moneyToSatang('0.10') + moneyToSatang('0.20'), 30);
  assert.equal(moneyToSatang('999999999.99'), 99999999999);
  for (const value of ['0', '-1', '1.001', '1e3', '', 'Infinity', '1,000', '1000000000']) assert.throws(() => moneyToSatang(value));
});
test('reject impossible dates, invalid amounts, and oversized user text', () => {
  for (const changes of [{ date: '2026-02-30' }, { date: '2025-02-29' }, { amount: 1.5 }, { amount: NaN }, { category: ' ' }, { note: 'x'.repeat(301) }, { id: '' }, { type: 'transfer' }]) assert.throws(() => validateTransaction({ ...transaction, ...changes }));
  assert.equal(validateTransaction({ ...transaction, date: '2024-02-29' }).date, '2024-02-29');
});
test('CRUD and totals change by exact amount; deleting missing rows fails', () => {
  let records = applyCommand([], { action: 'upsert', transaction });
  records = applyCommand(records, { action: 'upsert', transaction: { ...transaction, amount: 2000 } });
  records = applyCommand(records, { action: 'upsert', transaction: { ...transaction, id: 'income-001', type: 'income', amount: 9000 } });
  assert.deepEqual(summarize(records), { income: 9000, expense: 2000, balance: 7000 });
  records = applyCommand(records, { action: 'delete', id: transaction.id });
  assert.equal(summarize(records).expense, 0);
  assert.throws(() => applyCommand(records, { action: 'delete', id: 'missing-000' }));
});
test('month, type, category and search filters compose without mutating records', () => {
  const records = [transaction, { ...transaction, id: 'transaction-002', date: '2026-09-30' }];
  assert.equal(filterTransactions(records, { month: '2026-10', type: 'expense', category: 'อาหาร', search: 'ข้าว' }).length, 1);
  assert.equal(filterTransactions(records, { type: 'income' }).length, 0);
  assert.equal(records[0], transaction);
});
test('backup round trips, rejects corrupt/duplicate data, import never overwrites', () => {
  const backup = { format: 'baankhao-ledger', version: 1, transactions: [transaction] };
  assert.deepEqual(parseBackup(JSON.stringify(backup)), [transaction]);
  assert.deepEqual(parseBackup(JSON.stringify({ ...backup, format: 'littlepay-ledger' })), [transaction]);
  for (const data of ['no', '{}', JSON.stringify({ ...backup, transactions: [transaction, transaction] })]) assert.throws(() => parseBackup(data));
  assert.deepEqual(applyCommand([transaction], { action: 'import', transactions: [{ ...transaction, amount: 999 }] }), [transaction]);
});
test('CSV quotes and neutralizes formulas without executing user content', () => {
  const csv = toCSV([{ ...transaction, category: '=IMPORTXML("evil")', note: ' +cmd\n"test"' }]);
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes("'=IMPORTXML")); assert.ok(csv.includes("' +cmd")); assert.ok(csv.includes('""test""'));
});
test('commands validate revision, operation ID and import batch limit', () => {
  const cmd = { action: 'upsert', operationId: 'operation-001', baseRevision: 0, transaction };
  assert.deepEqual(validateCommand(cmd), cmd);
  for (const changes of [{ baseRevision: -1 }, { baseRevision: '0' }, { action: 'erase-all' }, { operationId: '' }, { action: 'import', transactions: Array(51).fill(transaction) }]) assert.throws(() => validateCommand({ ...cmd, ...changes }));
});
