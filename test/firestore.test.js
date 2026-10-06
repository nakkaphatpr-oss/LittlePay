import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeLedger,decodeLedger,nextLedger} from '../src/firestore-ledger.js';
import {normalizeLedger,validateCommand} from '../public/core.js';
const command=validateCommand({action:'upsert',operationId:'operation123',baseRevision:0,transaction:{id:'transaction123',type:'expense',amount:1200,date:'2026-10-06',category:'อาหารและเครื่องดื่ม',note:'ทดสอบ',accountId:'default-wallet'}});
test('Firestore chunks preserve ledger fields and record order beyond 100 records',()=>{
 const ledger=normalizeLedger({transactions:Array.from({length:205},(_,i)=>({...command.transaction,id:'record_'+String(i).padStart(8,'0')})),revision:99});
 const encoded=encodeLedger(ledger);assert.equal(encoded.chunks.size,3);
 assert.deepEqual(decodeLedger(encoded.meta,encoded.chunks),ledger);
});
test('Firestore durable receipts prevent retries from repeating committed operations',()=>{
 const initial=normalizeLedger();const committed=nextLedger(initial,command,null,'2026-10-06');
 assert.equal(committed.ledger.revision,1);assert.equal(committed.ledger.transactions.length,1);
 assert.equal(nextLedger(committed.ledger,command,{fingerprint:committed.fingerprint}).replayed,true);
 assert.throws(()=>nextLedger(committed.ledger,{...command,transaction:{...command.transaction,amount:2000}},{fingerprint:committed.fingerprint}),e=>e.status===409);
 assert.throws(()=>nextLedger(committed.ledger,{...command,operationId:'other_operation'},null),e=>e.status===409);
});
