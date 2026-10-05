import { validateTransaction, validateCommand } from './core.js';

export function localBook(storage, scope) {
  const key = name => 'littlepay-v3-' + scope + '-' + name;
  const read = (name, fallback) => { const raw=storage.getItem(key(name)); return raw ? JSON.parse(raw) : fallback; };
  const write = (name, value) => storage.setItem(key(name),JSON.stringify(value));
  return {
    draft: () => read('draft',null), saveDraft: value => write('draft',value), clearDraft: () => storage.removeItem(key('draft')),
    cache: () => read('cache',null), saveCache: value => write('cache',value),
    queue: () => read('queue',[]),
    enqueue(transaction) {
      const entries=read('queue',[]), t=validateTransaction(transaction);
      if(entries.some(e=>e.transaction.id===t.id)) return;
      if(entries.length>=200) throw new Error('คิวเต็ม 200 รายการ กรุณาส่งรายการเดิมก่อน');
      write('queue',[...entries,{transaction:t,command:null,error:''}]);
    },
    update(id, change) { const entries=read('queue',[]); write('queue',entries.map(e=>e.transaction.id===id?{...e,...change}:e)); },
    remove(id) { write('queue',read('queue',[]).filter(e=>e.transaction.id!==id)); },
  };
}

export function queuedCommand(entry, revision) {
  return entry.command ? validateCommand(entry.command) : validateCommand({action:'upsert',operationId:entry.transaction.id,baseRevision:revision,transaction:entry.transaction});
}

// Only an explicitly rejected, never-committed new transaction can be rebased.
export function canRebase(entry, ledger, error) {
  return error.status===409 && error.outcomeUnknown!==true &&
    ![...ledger.transactions,...ledger.trash].some(t=>t.id===entry.transaction.id) &&
    ledger.settings.accounts.some(a=>a.id===(entry.transaction.accountId||'default-wallet')) &&
    (!entry.transaction.toAccountId || ledger.settings.accounts.some(a=>a.id===entry.transaction.toAccountId));
}
