// Run only during a verified read-only cutover. Never prints financial records or credentials.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initializeApp,cert} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {encodeLedger,firestoreLedger} from '../src/firestore-ledger.js';
import {normalizeLedger,accountBalances,summarize} from '../public/core.js';
if(!process.argv.includes('--confirmed-maintenance'))throw Error('Requires --confirmed-maintenance and read-only production API');
const credentials=JSON.parse(fs.readFileSync('firebase-service-account.local.json'));
assert.equal(credentials.project_id,'littlepay-b16d6');
const {key}=JSON.parse(fs.readFileSync('test-results/private-access.json'));
const url='https://littlepay.vercel.app/api/ledger';
const config=await fetch(url).then(r=>r.json());assert.equal(config.readOnly,true);
async function readSource(){const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key},body:JSON.stringify({action:'read'}),signal:AbortSignal.timeout(60000)});assert.equal(response.status,200);return normalizeLedger(await response.json());}
const source=await readSource();
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/pre-firestore-backup.json',JSON.stringify(source,null,2));
const db=getFirestore(initializeApp({credential:cert(credentials)}));db.settings({preferRest:true});
const root=db.doc('littlepayBooks/main'),encoded=encodeLedger(source);
const batch=db.batch();batch.create(root,{json:encoded.meta});
for(const [id,json]of encoded.chunks)batch.create(root.collection('chunks').doc(id),{json});
await batch.commit();
const target=await firestoreLedger(db)({action:'read'});
assert.deepEqual(target,source);assert.deepEqual(accountBalances(target),accountBalances(source));assert.deepEqual(summarize(target.transactions),summarize(source.transactions));
assert.deepEqual(await readSource(),source);
console.log(JSON.stringify({verified:true,transactions:target.transactions.length,trash:target.trash.length,history:target.history.length,revision:target.revision,recordsAndSettingsMatch:true,accountBalancesMatch:true,totalsMatch:true}));
await db.terminate();
