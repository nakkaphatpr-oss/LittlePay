import { createHash } from 'node:crypto';
import { applyLedger, normalizeLedger } from '../public/core.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(message,status)=>{throw Object.assign(new Error(message),{status});};
export function encodeLedger(ledger) {
  const {transactions,trash,...meta}=normalizeLedger(ledger);
  const chunks=new Map();
  for(const [kind,rows] of [['transactions',transactions],['trash',trash]]) {
    for(let i=0;i<rows.length;i+=100)chunks.set(kind+'-'+String(i/100).padStart(8,'0'),JSON.stringify(rows.slice(i,i+100)));
  }
  return {meta:JSON.stringify(meta),chunks};
}
export function decodeLedger(meta,chunks) {
  const ledger={...JSON.parse(meta),transactions:[],trash:[]};
  for(const [id,json] of [...chunks].sort(([a],[b])=>a.localeCompare(b)))ledger[id.startsWith('trash-')?'trash':'transactions'].push(...JSON.parse(json));
  return normalizeLedger(ledger);
}
export function nextLedger(current,command,receipt,savedAt) {
  const fingerprint=hash(JSON.stringify(command));
  if(receipt){if(receipt.fingerprint!==fingerprint)fail('รหัสคำสั่งถูกใช้กับข้อมูลอื่นแล้ว',409);return {ledger:current,replayed:true};}
  if(command.baseRevision!==current.revision)fail('ข้อมูลเปลี่ยนแล้ว กรุณารีเฟรชก่อนแก้ไข',409);
  return {ledger:applyLedger(current,command,savedAt),fingerprint,replayed:false};
}
export function firestoreLedger(db,bookPath='littlepayBooks/main') {
  const root=db.doc(bookPath), collection=root.collection('chunks');
  return async command=>db.runTransaction(async tx=>{
    const meta=await tx.get(root);
    if(!meta.exists)fail('ยังไม่ได้ย้ายข้อมูลเข้าสู่ Firestore',503);
    const snapshot=await tx.get(collection);
    const chunks=new Map(snapshot.docs.map(doc=>[doc.id,doc.data().json]));
    const current=decodeLedger(meta.data().json,chunks);
    if(command.action==='read')return current;
    const receiptRef=root.collection('operations').doc(hash(command.operationId));
    const receipt=await tx.get(receiptRef);
    const result=nextLedger(current,command,receipt.exists?receipt.data():null,new Date().toISOString());
    if(result.replayed)return result.ledger;
    const next=encodeLedger(result.ledger);
    const writes=[...next.chunks].filter(([id,json])=>chunks.get(id)!==json);
    const removals=[...chunks.keys()].filter(id=>!next.chunks.has(id));
    if(writes.length+removals.length>450)fail('รายการชุดนี้ใหญ่เกินไป กรุณาแบ่งนำเข้าเป็นชุดเล็ก',400);
    tx.set(root,{json:next.meta});
    for(const [id,json] of writes)tx.set(collection.doc(id),{json});
    for(const id of removals)tx.delete(collection.doc(id));
    tx.create(receiptRef,{fingerprint:result.fingerprint,revision:result.ledger.revision});
    return result.ledger;
  });
}

let cached;
export async function getFirestoreLedger(env=process.env) {
  if(!cached){
    const {initializeApp,cert,getApps}=await import('firebase-admin/app');
    const {getFirestore}=await import('firebase-admin/firestore');
    const credentials=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if(credentials.project_id!==env.FIREBASE_PROJECT_ID)throw Error('Firebase project mismatch');
    const app=getApps().find(app=>app.name==='littlepay')||initializeApp({credential:cert(credentials),projectId:env.FIREBASE_PROJECT_ID},'littlepay');
    const db=getFirestore(app);db.settings({preferRest:true});
    cached=firestoreLedger(db);
  }
  return cached;
}
