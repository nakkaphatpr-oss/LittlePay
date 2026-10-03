import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/ledger.js';
const env = { GOOGLE_CLIENT_ID: 'client', ALLOWED_EMAIL: 'owner@gmail.com', APPS_SCRIPT_URL: 'https://script.google.com/macros/s/deployment/exec', SHEETS_API_SECRET: 'a'.repeat(64) };
const identity = { email: 'owner@gmail.com', email_verified: true };
function invoke(handler, { method = 'POST', body = { action: 'read' }, token = 'token', contentType = 'application/json' } = {}) {
  const result = { headers: {} };
  const res = { setHeader: (key, value) => { result.headers[key] = value; }, status: code => { result.status = code; return res; }, json: value => { result.body = value; return result; } };
  return handler({ method, headers: { authorization: token ? 'Bearer ' + token : '', 'content-type': contentType }, body }, res).then(() => result);
}
test('configuration endpoint never exposes secret, owner email or Apps Script URL', async () => {
  const result = await invoke(createHandler({ env }), { method: 'GET' });
  assert.deepEqual(result.body, { configured: true, clientId: 'client' }); assert.equal(result.headers['Cache-Control'], 'no-store');
});
test('incomplete configuration fails closed', async () => { assert.equal((await invoke(createHandler({ env: {} }))).status, 503); });
test('missing, expired, wrong-owner and unverified tokens cannot touch Sheets', async () => {
  let calls = 0; const request = async () => { calls++; throw new Error(); };
  assert.equal((await invoke(createHandler({ env, request }), { token: '' })).status, 401);
  assert.equal((await invoke(createHandler({ env, request, verify: async () => { throw new Error(); } }))).status, 401);
  for (const payload of [{ ...identity, email: 'other@gmail.com' }, { ...identity, email_verified: false }]) {
    assert.equal((await invoke(createHandler({ env, request, verify: async () => ({ getPayload: () => payload }) }))).status, 403);
  }
  assert.equal(calls, 0);
});
test('authorized read validates audience and proxies secret only server-side', async () => {
  const handler = createHandler({ env, verify: async (token, audience) => { assert.equal(audience, 'client'); return { getPayload: () => identity }; }, request: async (url, options) => {
    const data = JSON.parse(options.body); assert.equal(data.secret, env.SHEETS_API_SECRET); assert.deepEqual(data.command, { action: 'read' }); return { ok: true, json: async () => ({ ok: true, transactions: [], revision: 0 }) };
  } });
  assert.deepEqual((await invoke(handler)).body, { transactions: [], revision: 0 });
});
test('bad writes rejected before proxy; Sheets conflicts and HTML errors mapped safely', async () => {
  const verify = async () => ({ getPayload: () => identity });
  const handler = createHandler({ env, verify, request: async () => ({ ok: true, json: async () => ({ ok: false, status: 409, error: 'conflict' }) }) });
  assert.equal((await invoke(handler, { body: { action: 'delete' } })).status, 400);
  assert.equal((await invoke(handler)).status, 409);
  assert.equal((await invoke(handler, { contentType: 'text/plain' })).status, 415);
  const bad = createHandler({ env, verify, request: async () => ({ ok: true, json: async () => { throw new Error('HTML login page'); } }) });
  assert.equal((await invoke(bad)).status, 502);
});
