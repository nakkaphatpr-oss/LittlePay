import test from 'node:test';
import assert from 'node:assert/strict';
import {localBook,queuedCommand,canRebase} from '../public/local.js';
import {defaultSettings,validateSettings,filterTransactions,applyLedger,normalizeLedger,parseFullBackup} from '../public/core.js';
const tx={id:'offline-item-001',type:'expense',amount:2500,date:'2026-10-05',category:'อาหาร',note:'กาแฟ',accountId:'default-wallet'};
function storage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
test('draft and queue survive storage reopen, isolate demo, deduplicate IDs and retain uncertain command',()=>{
  const disk=storage(),book=localBook(disk,'cloud');book.saveDraft({fields:{amount:'25',note:'ยังไม่เสร็จ'}});book.enqueue(tx);book.enqueue(tx);
  const reopened=localBook(disk,'cloud');assert.equal(reopened.draft().fields.amount,'25');assert.equal(reopened.queue().length,1);assert.equal(localBook(disk,'demo').queue().length,0);
  const command=queuedCommand(reopened.queue()[0],7);book.update(tx.id,{command});assert.deepEqual(queuedCommand(reopened.queue()[0],99),command);
  book.remove(tx.id);book.clearDraft();assert.equal(reopened.queue().length,0);assert.equal(reopened.draft(),null);
});
test('quota/storage errors do not falsely acknowledge an offline save',()=>{
  const book=localBook({getItem:()=>null,setItem:()=>{throw new Error('quota');}},'cloud');assert.throws(()=>book.enqueue(tx),/quota/);
});
test('queue rebase only after definitive conflict with ID absent from active AND trash',()=>{
  const state=normalizeLedger(),entry={transaction:tx};assert.equal(canRebase(entry,state,{status:409}),true);
  assert.equal(canRebase(entry,state,{status:409,outcomeUnknown:true}),false);
  assert.equal(canRebase(entry,{...state,transactions:[tx]},{status:409}),false);
  assert.equal(canRebase(entry,{...state,trash:[tx]},{status:409}),false);
  assert.equal(canRebase(entry,state,{status:503}),false);
});
test('advanced filters include transfer destination, all months, inclusive date and amount boundaries',()=>{
  const data=[tx,{...tx,id:'offline-item-002',date:'2026-09-30',amount:5000},{...tx,id:'offline-item-003',type:'transfer',accountId:'another-wallet',toAccountId:'default-wallet',amount:8000}];
  assert.equal(filterTransactions(data,{month:'',from:'2026-09-30',to:'2026-10-05',min:5000,max:8000,account:'default-wallet'}).length,2);
  assert.equal(filterTransactions(data,{month:'2026-10',search:'กาแฟ',type:'expense'}).length,1);
});
test('goals validate, persist through replay/backup/merge, and keep old settings canonical',()=>{
  const old=defaultSettings();assert.equal(Object.hasOwn(validateSettings(old),'goals'),false);
  const settings={...old,goals:[{id:'savings-goal-001',name:'เงินฉุกเฉิน',target:100000,deadline:'2027-01-01',accountId:'default-wallet'}]};
  const state=applyLedger(normalizeLedger(),{action:'settings',operationId:'settings-goal-001',baseRevision:0,settings:validateSettings(settings)});
  const restored=parseFullBackup(JSON.stringify({format:'littlepay-ledger',version:2,...state}));assert.equal(restored.settings.goals[0].target,100000);
  const merged=applyLedger(normalizeLedger(),{action:'mergeSettings',operationId:'settings-goal-002',baseRevision:0,settings});assert.equal(merged.settings.goals.length,1);
  assert.throws(()=>validateSettings({...settings,goals:[{...settings.goals[0],accountId:'missing-account'}]}));
  assert.throws(()=>validateSettings({...settings,goals:[{...settings.goals[0],target:-1}]}));
});
