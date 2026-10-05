import test from 'node:test';
import assert from 'node:assert/strict';
import { callSheets } from '../src/sheets-transport.js';
import { pendingStore, commandWasRejected } from '../public/pending.js';

const success = { ok: true, status: 200, json: async () => ({ ok: true, transactions: [], revision: 1 }) };
const base = { url: 'https://example.invalid', body: '{"operationId":"unchanged"}', pause: async () => {}, log: () => {} };

test('transient failure retries exact body once and reports timing without private content', async () => {
  const calls = [], logs = [];
  const response = await callSheets({ ...base, log: entry => logs.push(entry), request: async (_, options) => {
    calls.push(options.body); return calls.length === 1 ? { ok: false, status: 503 } : success;
  } });
  assert.equal(response.result.revision, 1); assert.deepEqual(calls, [base.body, base.body]);
  assert.equal(logs[0].code, 'GOOGLE_HTTP'); assert.equal(logs[1].code, 'OK');
  assert.ok(!JSON.stringify(logs).includes('unchanged'));
});

test('a committed write with lost response is retried with same ID, never appended twice', async () => {
  const operations = new Set(); let calls = 0, writes = 0;
  const response = await callSheets({ ...base, request: async (_, options) => {
    const id = JSON.parse(options.body).operationId;
    if (!operations.has(id)) { operations.add(id); writes++; }
    if (++calls === 1) throw new TypeError('connection lost');
    return success;
  } });
  assert.equal(writes, 1); assert.equal(response.attempts, 2); assert.equal(response.result.revision, 1);
});

test('access rejection and revision conflict do not retry; quotas and timeout remain distinguishable', async () => {
  for (const upstream of [403, 404]) {
    const result = await callSheets({ ...base, request: async () => ({ ok: false, status: upstream }) });
    assert.equal(result.attempts, 1); assert.equal(result.failure.code, 'GOOGLE_ACCESS');
  }
  const conflict = await callSheets({ ...base, request: async () => ({ ok: true, json: async () => ({ ok: false, status: 409, error: 'conflict' }) }) });
  assert.equal(conflict.attempts, 1); assert.equal(conflict.failure.outcomeUnknown, false);
  const quota = await callSheets({ ...base, request: async () => ({ ok: false, status: 429 }) });
  assert.equal(quota.attempts, 2); assert.equal(quota.failure.code, 'GOOGLE_BUSY');
  const timeout = await callSheets({ ...base, request: async () => { throw Object.assign(new Error(), { name: 'TimeoutError' }); } });
  assert.equal(timeout.attempts, 2); assert.equal(timeout.failure.status, 504); assert.equal(timeout.failure.outcomeUnknown, true);
});

test('malformed result cannot confirm a save; uncertainty survives a later rejection', async () => {
  const result = await callSheets({ ...base, request: async () => ({ ok: true, json: async () => ({ ok: true }) }) });
  assert.equal(result.failure.code, 'GOOGLE_RESPONSE'); assert.equal(result.attempts, 2);
  let count = 0;
  const uncertain = await callSheets({ ...base, request: async () => ++count === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ ok: false, status: 409, error: 'conflict' }) } });
  assert.equal(uncertain.failure.outcomeUnknown, true);
  assert.equal(commandWasRejected(uncertain.failure), false);
});

test('unfinished command survives tab reload with same ID; proxy failures never discard it', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const command = { action: 'delete', id: 'transaction-001', operationId: 'operation-001', baseRevision: 1 };
  pendingStore(storage).save(command);
  assert.deepEqual(pendingStore(storage).load(), command);
  for (const status of [401, 403, 429, 500, 502, 503, 504]) assert.equal(commandWasRejected({ status }), false);
  assert.equal(commandWasRejected({ status: 409 }), true);
  pendingStore(storage).clear(); assert.equal(pendingStore(storage).load(), null);
});
