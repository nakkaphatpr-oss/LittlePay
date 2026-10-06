import test from 'node:test';
import assert from 'node:assert/strict';
import { takePrivateLink, validAccessKey } from '../public/access.js';
test('private link removes credential from location before use',()=>{
  const key='a'.repeat(64);let replaced;
  assert.equal(takePrivateLink('https://example.test/?view=month#access='+key,url=>replaced=url),key);
  assert.equal(replaced,'/?view=month');
});
test('malformed link is stripped even when rejected; normal URL is untouched',()=>{
  let replaced;
  assert.throws(()=>takePrivateLink('https://example.test/#access=bad',url=>replaced=url));
  assert.equal(replaced,'/');replaced=null;
  assert.equal(takePrivateLink('https://example.test/#overview',url=>replaced=url),null);
  assert.equal(replaced,null);
  for(const key of [null,undefined,'','a'.repeat(63),'a'.repeat(65),'A'.repeat(64)]) assert.equal(validAccessKey(key),false);
});
