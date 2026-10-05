import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import {defaultSettings} from '../public/core.js';
const source = readFileSync(new URL('../public/core.js', import.meta.url), 'utf8').replace(/^export /gm, '') + '\n' + readFileSync(new URL('../src/apps-script.js', import.meta.url), 'utf8');
function fixture() {
  const rows = [['operation_id', 'saved_at_utc', 'action', 'payload_json']]; let locked = false, released = 0;
  const secret = 'secret'.repeat(10);
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'SHEETS_API_SECRET' ? secret : 'sheet-id' }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { locked = true; return true; }, hasLock: () => locked, releaseLock: () => { locked = false; released++; } }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => ({ getDataRange: () => ({ getValues: () => rows }), appendRow: row => rows.push(row) }) }), flush: () => {} },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => text }) }
  });
  vm.runInContext(source, context);
  return { rows, get released() { return released; }, request: (command, key = secret) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ secret: key, command }) } })) };
}
const transaction = { id: 'transaction-001', type: 'expense', amount: 2500, date: '2026-10-03', category: 'อาหาร', note: '=IMPORTXML("not-executed")' };
const command = { action: 'upsert', operationId: 'operation-001', baseRevision: 0, transaction };
test('write, retry, edit, delete and replay use one durable log with locks released', () => {
  const f = fixture(); assert.equal(f.request(command).revision, 1); assert.equal(f.request(command).revision, 1); assert.equal(f.rows.length, 2);
  assert.ok(f.rows[1][3].startsWith('{'));
  assert.equal(f.request({ ...command, operationId: 'operation-002', baseRevision: 1, transaction: { ...transaction, amount: 3500 } }).transactions[0].amount, 3500);
  assert.equal(f.request({ action: 'delete', operationId: 'operation-003', baseRevision: 2, id: transaction.id }).transactions.length, 0);
  assert.equal(f.request({ action: 'read' }).revision, 3); assert.equal(f.released, 5);
});
test('stale concurrent writer cannot overwrite or delete current data', () => {
  const f = fixture(); f.request(command);
  assert.equal(f.request({ ...command, operationId: 'operation-002', transaction: { ...transaction, amount: 10 } }).status, 409);
  assert.equal(f.request({ ...command, transaction: { ...transaction, amount: 10 } }).status, 409);
  assert.equal(f.rows.length, 2); assert.equal(f.request({ action: 'read' }).transactions[0].amount, 2500);
});
test('bad secret, invalid commands and corrupt sheet rows fail closed', () => {
  const f = fixture(); assert.equal(f.request(command, 'bad-secret').status, 403); assert.equal(f.rows.length, 1);
  assert.equal(f.request({ ...command, transaction: { ...transaction, amount: -1 } }).status, 400);
  f.request(command); f.rows[1][3] = 'broken'; assert.equal(f.request({ action: 'read' }).ok, false);
});
test('import is a single atomic event, duplicate IDs do not replace existing transactions', () => {
  const f = fixture(); f.request(command);
  const result = f.request({ action: 'import', operationId: 'operation-002', baseRevision: 1, transactions: [{ ...transaction, amount: 1000 }, { ...transaction, id: 'transaction-002', amount: 600 }] });
  assert.equal(result.transactions.length, 2); assert.equal(result.transactions[0].amount, 2500); assert.equal(result.revision, 2);
});
test('v2 settings, transfer and trash survive Apps Script replay and retries',()=>{
  const f=fixture(),settings=defaultSettings();settings.accounts.push({id:'account-bank',name:'Bank',opening:10000,archived:false});
  const config={action:'settings',operationId:'settings-001',baseRevision:0,settings};
  assert.equal(f.request(config).settings.accounts.length,2);assert.equal(f.request(config).revision,1);
  const transfer={...transaction,type:'transfer',category:'โอนเงิน',accountId:'account-bank',toAccountId:'default-wallet'};
  assert.equal(f.request({...command,baseRevision:1,transaction:transfer}).transactions[0].toAccountId,'default-wallet');
  assert.equal(f.request({action:'delete',id:transfer.id,baseRevision:2,operationId:'delete-001'}).trash.length,1);
  const read=f.request({action:'read'});assert.equal(read.revision,3);assert.equal(read.settings.accounts.length,2);assert.equal(read.history[0].before.type,'transfer');
  assert.equal(f.request({action:'restore',id:transfer.id,baseRevision:3,operationId:'restore-001'}).transactions.length,1);
});
