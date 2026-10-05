import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLedger,validateCommand,applyLedger,accountBalances,summarize,recurrenceDate,parseFullBackup} from '../public/core.js';
let counter=0;
function run(s,data){return applyLedger(s,validateCommand({...data,baseRevision:s.revision,operationId:'op-test-'+(++counter)}),'2026-10-05T01:00:00Z');}
const txn={id:'transaction-test',type:'expense',amount:1234,date:'2026-10-05',category:'อาหารและเครื่องดื่ม',note:'ทดสอบ'};
test('legacy entries survive migration; transfers conserve total balances and do not inflate reports',()=>{
 let s=normalizeLedger({transactions:[txn]});
 s=run(s,{action:'settings',settings:{...s.settings,accounts:[...s.settings.accounts,{id:'bank-account',name:'ธนาคาร',opening:50000,archived:false}]}});
 s=run(s,{action:'upsert',transaction:{...txn,id:'transfer-test',type:'transfer',category:'โอนเงิน',accountId:'bank-account',toAccountId:'default-wallet',amount:10000}});
 assert.equal(accountBalances(s).get('bank-account'),40000);assert.equal(accountBalances(s).get('default-wallet'),8766);
 assert.deepEqual(summarize(s.transactions),{income:0,expense:1234,balance:-1234});
 assert.throws(()=>run(s,{action:'upsert',transaction:{...txn,accountId:'missing-wallet'}}));
});
test('trash restores both transfer legs; deleting cannot silently recreate during import',()=>{
 let s=normalizeLedger({transactions:[txn]});s=run(s,{action:'delete',id:txn.id});assert.equal(s.trash.length,1);assert.equal(s.transactions.length,0);
 s=run(s,{action:'import',transactions:[txn]});assert.equal(s.transactions.length,0);
 s=run(s,{action:'restore',id:txn.id});assert.deepEqual(s.transactions,[txn]);assert.equal(s.trash.length,0);
 assert.equal(s.history[2].before.amount,1234);
});
test('category rename updates transactions, budgets and templates atomically',()=>{
 let s=normalizeLedger({transactions:[txn]});
 s=run(s,{action:'settings',settings:{...s.settings,budgets:[{month:'2026-10',category:txn.category,amount:90000}],templates:[{id:'favorite-001',name:'อาหาร',kind:'favorite',transaction:txn,enabled:true}]}});
 s=run(s,{action:'renameCategory',type:'expense',from:txn.category,to:'อาหาร'});
 assert.equal(s.transactions[0].category,'อาหาร');assert.equal(s.settings.budgets[0].category,'อาหาร');assert.equal(s.settings.templates[0].transaction.category,'อาหาร');
});
test('monthly recurrence clamps month-end; one occurrence remains unique after trashing',()=>{
 const template={kind:'recurring',day:31,startMonth:'2026-01'};
 assert.equal(recurrenceDate(template,'2026-02'),'2026-02-28');assert.equal(recurrenceDate(template,'2028-02'),'2028-02-29');assert.equal(recurrenceDate(template,'2025-12'),null);
 let s=run(normalizeLedger(),{action:'upsert',transaction:{...txn,templateId:'template-001',occurrence:'2026-10'}});s=run(s,{action:'delete',id:txn.id});
 assert.throws(()=>run(s,{action:'upsert',transaction:{...txn,id:'another-entry',templateId:'template-001',occurrence:'2026-10'}}));
});
test('v2 backup restores settings, opening balance and trash without overwriting existing records',()=>{
 let s=normalizeLedger();s=run(s,{action:'settings',settings:{...s.settings,accounts:[{...s.settings.accounts[0],opening:10000}]}});
 s=run(s,{action:'upsert',transaction:txn});s=run(s,{action:'delete',id:txn.id});
 const backup=parseFullBackup(JSON.stringify({format:'littlepay-ledger',version:2,...s}));
 let restored=run(normalizeLedger(),{action:'mergeSettings',settings:backup.settings});restored=run(restored,{action:'importTrash',transactions:backup.trash});
 assert.equal(restored.settings.accounts[0].opening,10000);assert.equal(restored.trash[0].amount,1234);
 assert.throws(()=>parseFullBackup(JSON.stringify({format:'littlepay-ledger',version:2,...s,transactions:[txn]})));
});
test('accounts cannot be removed and invalid budgets/settings fail validation',()=>{
 const s=normalizeLedger();assert.throws(()=>run(s,{action:'settings',settings:{...s.settings,accounts:[]}}));
 for(const amount of [-1,0,1.5])assert.throws(()=>run(s,{action:'settings',settings:{...s.settings,budgets:[{month:'2026-10',category:'',amount}]}}));
});
