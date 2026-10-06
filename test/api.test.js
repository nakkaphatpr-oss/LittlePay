import test from 'node:test';
import { createHash } from 'node:crypto';
const accessKey = 'b'.repeat(64);
import assert from 'node:assert/strict';
import { createHandler } from '../api/ledger.js';
const env = { ACCESS_KEY_HASH: createHash('sha256').update(accessKey).digest('hex'), APPS_SCRIPT_URL: 'https://script.google.com/macros/s/deployment/exec', SHEETS_API_SECRET: 'a'.repeat(64) };

function invoke(handler, { method = 'POST', body = { action: 'read' }, token = accessKey, contentType = 'application/json' } = {}) {
  const result = { headers: {} };
  const res = { setHeader: (key, value) => { result.headers[key] = value; }, status: code => { result.status = code; return res; }, json: value => { result.body = value; return result; } };
  return handler({ method, headers: { authorization: token ? 'Bearer ' + token : '', 'content-type': contentType }, body }, res).then(() => result);
}
test('configuration endpoint never exposes secret, owner email or Apps Script URL', async () => {
  const result = await invoke(createHandler({ env }), { method: 'GET' });
  assert.deepEqual(result.body, { configured: true, accessMode: 'private-link' }); assert.equal(result.headers['Cache-Control'], 'no-store');
});
test('incomplete configuration fails closed', async () => { assert.equal((await invoke(createHandler({ env: {} }))).status, 503); });
test('missing, malformed and wrong keys cannot touch Sheets', async () => {
  let calls=0; const handler=createHandler({env,request:async()=>{calls++;throw new Error();}});
  for(const token of ['', 'invalid', 'c'.repeat(64), accessKey.toUpperCase()]) assert.equal((await invoke(handler,{token})).status,401);
  assert.equal(calls,0);
});
test('authorized private key proxies backend secret only server-side',async()=>{
  const handler=createHandler({env,request:async(url,options)=>{
    const data=JSON.parse(options.body);assert.equal(data.secret,env.SHEETS_API_SECRET);assert.deepEqual(data.command,{action:'read'});
    assert.ok(!options.body.includes(accessKey));return {ok:true,json:async()=>({ok:true,transactions:[],revision:0})};
  }});
  assert.deepEqual((await invoke(handler)).body,{transactions:[],revision:0});
});

test('bad writes rejected before proxy; Sheets conflicts and HTML errors mapped safely', async () => {
  const handler = createHandler({ env, request: async () => ({ ok: true, json: async () => ({ ok: false, status: 409, error: 'conflict' }) }) });
  assert.equal((await invoke(handler, { body: { action: 'delete' } })).status, 400);
  assert.equal((await invoke(handler)).status, 409);
  assert.equal((await invoke(handler, { contentType: 'text/plain' })).status, 415);
  const bad = createHandler({ env, request: async () => ({ ok: true, json: async () => { throw new Error('HTML login page'); } }) });
  assert.equal((await invoke(bad)).status, 502);
});

test('identical in-flight requests share one Sheets call after verifying both callers', async () => {
  let calls = 0, resolve;
  const gate = new Promise(done => { resolve = done; });
  const handler = createHandler({ env, log: () => {}, request: async () => {
    calls++; await gate; return { ok: true, json: async () => ({ ok: true, transactions: [], revision: 2 }) };
  } });
  const a = invoke(handler), b = invoke(handler);
  assert.equal((await invoke(handler,{token: 'd'.repeat(64)})).status,401);
  await new Promise(done => setImmediate(done)); resolve();
  const results = await Promise.all([a, b]);
  assert.equal(calls, 1); assert.ok(results.every(result => result.status === 200));
  await invoke(handler); assert.equal(calls, 2); // Explicit refresh must not return a cached stale ledger.
});
