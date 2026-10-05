import {defaultSettings,validateSettings,accountBalances,moneyToSatang,summarize,recurrenceDate} from './core.js';

export function installFeatures({getState,getMonth,today,money,mutate,toast,confirmAction,openTemplate,download}) {
  const $=s=>document.querySelector(s);
  const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const button=(text,action)=>{const e=node('button',text,'secondary compact');e.type='button';e.onclick=async()=>{try{await action();}catch(error){toast(error.message,true);}};return e;};
  const panel=(parent,title,detail)=>{const e=node('article',undefined,'panel feature-panel');e.append(node('h2',title),node('p',detail,'muted'));parent.append(e);return e;};
  const row=(parent,title,detail,actions=[])=>{const e=node('div',undefined,'feature-row'),copy=node('div');copy.append(node('strong',title),node('small',detail));const controls=node('div',undefined,'feature-actions');controls.append(...actions);e.append(copy,controls);parent.append(e);return e;};
  const settings=()=>getState().settings||defaultSettings();
  const save=async change=>mutate({action:'settings',settings:validateSettings(change)});
  const dialog=node('dialog');dialog.id='feature-dialog';dialog.setAttribute('aria-labelledby','feature-title');document.body.append(dialog);
  function form(title,fields,submit) {
    const f=node('form'),heading=node('h2',title);heading.id='feature-title';f.append(heading);
    for(const field of fields) {
      const label=node('label',field.label),input=node(field.options?'select':'input');input.name=field.name;
      if(field.options) for(const [value,text] of field.options) input.append(new Option(text,value));
      else {input.type=field.type||'text';if(input.type==='text')input.maxLength=field.maxLength||60;}
      if(field.min!==undefined)input.min=field.min;if(field.max!==undefined)input.max=field.max;if(field.step)input.step=field.step;
      input.required=field.required!==false;input.value=field.value??'';label.append(input);f.append(label);
      if(field.hint)f.append(node('small',field.hint,'muted'));
    }
    const error=node('p','','error-text');error.setAttribute('role','alert');f.append(error);
    const footer=node('div',undefined,'dialog-footer'),cancel=button('ยกเลิก',()=>dialog.close()),ok=node('button','บันทึก','primary');ok.type='submit';footer.append(cancel,ok);f.append(footer);
    f.onsubmit=async e=>{e.preventDefault();ok.disabled=true;cancel.disabled=true;error.textContent='';try{if(await submit(Object.fromEntries(new FormData(f))))dialog.close();}catch(err){error.textContent=err.message;}finally{ok.disabled=false;cancel.disabled=false;}};
    dialog.oncancel=e=>{if(ok.disabled)e.preventDefault();};dialog.replaceChildren(f);dialog.showModal();
  }
  const accountsOptions=()=>settings().accounts.map(a=>[a.id,a.name+(a.archived?' (ซ่อน)':'')]);
  const amount=value=>value==='0'||value==='0.00'?0:moneyToSatang(value);
  const signedAmount=value=>value.startsWith('-')?-amount(value.slice(1)):amount(value);
  function editAccount(account) {
    form(account?'แก้ไขบัญชี':'เพิ่มบัญชีเงิน',[
      {name:'name',label:'ชื่อบัญชี',value:account?.name},
      {name:'opening',label:'ยอดตั้งต้น (บาท)',value:((account?.opening||0)/100).toFixed(2),hint:'ยอดก่อนรายการแรกในสมุดนี้ เงินเข้าออกหลังจากนั้นจะนำมาคำนวณเพิ่ม'},
      {name:'archived',label:'การแสดงผล',value:account?.archived?'yes':'no',options:[['no','แสดงบัญชี'],['yes','ซ่อนจากรายการใหม่']]}
    ],async v=>{const a={id:account?.id||crypto.randomUUID(),name:v.name,opening:signedAmount(v.opening),archived:v.archived==='yes'};return save({...settings(),accounts:account?settings().accounts.map(x=>x.id===a.id?a:x):[...settings().accounts,a]});});
  }
  function editCategory(category, onSaved, preferredType='expense') {
    form(category?'แก้ไขหมวดหมู่':'เพิ่มหมวดหมู่',[
      ...(!category?[{name:'type',label:'ประเภท',value:preferredType,options:[['expense','รายจ่าย'],['income','รายรับ']]}]:[]),
      {name:'name',label:'ชื่อหมวดหมู่',value:category?.name}
    ],async v=>{const ok=await (category?mutate({action:'renameCategory',type:category.type,from:category.name,to:v.name}):save({...settings(),categories:[...settings().categories,{type:v.type,name:v.name,hidden:false}]}));if(ok)onSaved?.(v.name.trim(),category?.type||v.type);return ok;});
  }
  function editGoal(goal) {
    form(goal?'แก้ไขเป้าหมายเงินออม':'เพิ่มเป้าหมายเงินออม',[
      {name:'name',label:'ชื่อเป้าหมาย',value:goal?.name},
      {name:'target',label:'เงินเป้าหมาย (บาท)',value:goal?(goal.target/100).toFixed(2):''},
      {name:'deadline',label:'วันที่ตั้งใจให้ถึงเป้าหมาย',type:'date',min:'1900-01-01',max:'2199-12-31',value:goal?.deadline||today()},
      {name:'accountId',label:'บัญชีสำหรับติดตามเงินออม',value:goal?.accountId||'default-wallet',options:accountsOptions(),hint:'ใช้ยอดคงเหลือของบัญชีนี้เป็นความคืบหน้า ไม่ได้กันเงินหรือโอนเงินจริง ถ้าใช้บัญชีเดียวหลายเป้าหมาย ยอดเดียวกันจะปรากฏในแต่ละเป้าหมาย'}
    ],v=>{const g={id:goal?.id||crypto.randomUUID(),name:v.name,target:moneyToSatang(v.target),deadline:v.deadline,accountId:v.accountId};return save({...settings(),goals:goal?(settings().goals||[]).map(x=>x.id===g.id?g:x):[...(settings().goals||[]),g]});});
  }
  function editBudget(budget) {
    const categories=[...new Set([...settings().categories.filter(c=>c.type==='expense').map(c=>c.name),...getState().transactions.filter(t=>t.type==='expense').map(t=>t.category)])];
    form('งบประมาณรายเดือน',[
      {name:'month',label:'เดือน',type:'month',min:'1900-01',max:'2199-12',value:budget?.month||getMonth()},
      {name:'category',label:'ขอบเขตงบ',required:false,value:budget?.category||'',options:[['','รวมทุกหมวดหมู่'],...categories.map(c=>[c,c])]},
      {name:'amount',label:'งบ (บาท)',value:budget?(budget.amount/100).toFixed(2):''}
    ],async v=>{const next={month:v.month,category:v.category,amount:moneyToSatang(v.amount)};return save({...settings(),budgets:[...settings().budgets.filter(b=>!(b.month===next.month&&b.category===next.category)&&b!==budget),next]});});
  }
  function editTemplate(transaction,template) {
    const original=transaction||template.transaction;
    form(template?'แก้ไขรายการต้นแบบ':'เก็บไว้ใช้ซ้ำ',[
      {name:'name',label:'ชื่อเรียก',value:template?.name||original.note||original.category},
      {name:'kind',label:'รูปแบบ',value:template?.kind||'favorite',options:[['favorite','รายการโปรด — เลือกใช้ได้ทุกเมื่อ'],['recurring','รายการประจำ — เดือนละครั้ง']]},
      {name:'amount',label:'จำนวนเงิน (บาท)',value:(original.amount/100).toFixed(2)},
      {name:'accountId',label:'บัญชี',value:original.accountId||'default-wallet',options:accountsOptions()},
      {name:'day',label:'วันที่ประจำเดือน (เฉพาะรายการประจำ)',type:'number',min:1,max:31,value:template?.day||Number(original.date.slice(-2)),hint:'เดือนที่ไม่มีวันที่นี้ ใช้วันสุดท้ายของเดือน'},
      {name:'startMonth',label:'เริ่มตั้งแต่เดือน',type:'month',min:'1900-01',max:'2199-12',value:template?.startMonth||getMonth()}
    ],async v=>{const t={id:template?.id||crypto.randomUUID(),name:v.name,kind:v.kind,enabled:template?.enabled!==false,transaction:{...original,amount:moneyToSatang(v.amount),accountId:v.accountId},day:Number(v.day),startMonth:v.startMonth};delete t.transaction.templateId;delete t.transaction.occurrence;return save({...settings(),templates:template?settings().templates.map(x=>x.id===t.id?t:x):[...settings().templates,t]});});
  }
  function buildReport(parent) {
    const month=getMonth(),d=new Date(month+'-15T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);const prev=d.toISOString().slice(0,7);
    const current=summarize(getState().transactions.filter(t=>t.date.startsWith(month))),last=summarize(getState().transactions.filter(t=>t.date.startsWith(prev)));
    row(parent,'เทียบเดือนก่อน ('+prev+')','รายรับ '+money(current.income-last.income)+' · รายจ่าย '+money(current.expense-last.expense)+' (ค่าบวก = เพิ่มขึ้น)');
    const wrap=node('div',undefined,'table-wrap'),table=node('table'),head=node('tr');['เดือน','รายรับ','รายจ่าย','ส่วนต่าง'].forEach(v=>head.append(node('th',v)));table.append(head);
    for(let i=1;i<=12;i++){const m=month.slice(0,4)+'-'+String(i).padStart(2,'0'),t=summarize(getState().transactions.filter(x=>x.date.startsWith(m))),tr=node('tr');[m,money(t.income),money(t.expense),money(t.balance)].forEach(v=>tr.append(node('td',v)));table.append(tr);}wrap.append(table);parent.append(wrap);
  }
  function render() {
    const s=getState(),cfg=settings(),month=getMonth();
    const planning=$('#planning');planning.replaceChildren();
    const wallet=panel(planning,'บัญชีเงินของฉัน','ยอดตั้งต้น + รายการทั้งหมด · การโอนไม่เพิ่มรายรับหรือรายจ่าย');wallet.append(button('＋ เพิ่มบัญชี',()=>editAccount()));
    const balances=accountBalances(s);
    for(const a of cfg.accounts) row(wallet,a.name+(a.archived?' · ซ่อน':''),money(balances.get(a.id)),[button('แก้ไข',()=>editAccount(a))]);
    const goals=panel(planning,'เป้าหมายเงินออม','ติดตามจากยอดบัญชีที่เลือก · รายการรอส่งยังไม่รวมในยอด');goals.append(button('＋ เพิ่มเป้าหมาย',()=>editGoal()));
    for(const g of cfg.goals||[]) {
      const saved=Math.max(0,balances.get(g.accountId)||0),percent=Math.min(100,Math.floor(saved/g.target*100));
      const r=row(goals,g.name,money(saved)+' / '+money(g.target)+' · '+percent+'% · เป้าหมาย '+g.deadline+(saved>=g.target?' · ถึงเป้าหมายแล้ว':g.deadline<today()?' · เลยวันที่ตั้งไว้':' · เหลือ '+money(g.target-saved)),[button('แก้ไข',()=>editGoal(g)),button('ลบเป้าหมาย',async()=>{if(await confirmAction('ลบเป้าหมาย?',g.name+' — ยอดเงินและรายการยังอยู่'))await save({...settings(),goals:(settings().goals||[]).filter(x=>x.id!==g.id)});})]);
      const meter=node('meter');meter.min=0;meter.max=g.target;meter.value=Math.min(saved,g.target);meter.setAttribute('aria-label',g.name+' '+percent+'%');r.append(meter);
    }
    const budget=panel(planning,'งบประมาณ · '+month,'งบรวมกับงบรายหมวดใช้เปรียบเทียบแยกกัน ไม่ได้นำมารวมซ้ำ');budget.append(button('＋ ตั้งงบ',()=>editBudget()));
    const monthly=s.transactions.filter(t=>t.type==='expense'&&t.date.startsWith(month));
    for(const b of cfg.budgets.filter(b=>b.month===month)) {
      const spent=monthly.filter(t=>!b.category||t.category===b.category).reduce((n,t)=>n+t.amount,0);
      const r=row(budget,b.category||'ทุกหมวดหมู่','ใช้ '+money(spent)+' / '+money(b.amount)+' · '+(spent>b.amount?'เกินงบ ':'เหลือ ')+money(Math.abs(b.amount-spent)),[button('แก้ไข',()=>editBudget(b)),button('ลบงบ',async()=>{if(await confirmAction('ลบงบประมาณ?',b.month+' '+(b.category||'ทุกหมวดหมู่')))await save({...settings(),budgets:settings().budgets.filter(x=>x!==b)});})]);
      const meter=node('meter');meter.min=0;meter.max=b.amount;meter.value=Math.min(spent,b.amount);meter.setAttribute('aria-label','ใช้ไป '+Math.round(spent/b.amount*100)+'%');r.append(meter);
    }
    const quick=panel(planning,'รายการโปรดและรายการประจำ','กด “ใช้ซ้ำ / ตั้งประจำ” จากรายการที่เคยบันทึก เพื่อสร้างต้นแบบ ไม่บันทึกอัตโนมัติ');
    for(const t of cfg.templates) {
      const date=t.kind==='recurring'?recurrenceDate(t,month):today();
      const exists=t.kind==='recurring'&&[...s.transactions,...s.trash].some(x=>x.templateId===t.id&&x.occurrence===month);
      const usable=t.enabled&&date&&!exists;
      const actions=[button('แก้ไข',()=>editTemplate(null,t)),button(t.enabled?'พักใช้':'เปิดใช้',()=>save({...settings(),templates:settings().templates.map(x=>x.id===t.id?{...x,enabled:!x.enabled}:x)})),button('ลบต้นแบบ',async()=>{if(await confirmAction('ลบรายการต้นแบบ?',t.name+' — รายการที่เคยบันทึกยังอยู่'))await save({...settings(),templates:settings().templates.filter(x=>x.id!==t.id)});})];
      if(usable)actions.unshift(button(t.kind==='favorite'?'ใช้รายการนี้':date<=today()?'ยืนยันบันทึกรอบนี้':'บันทึกล่วงหน้า',()=>openTemplate(t,date)));
      row(quick,t.name,money(t.transaction.amount)+' · '+(t.kind==='favorite'?'รายการโปรด':exists?'รอบนี้บันทึกแล้ว (รวมถังขยะ)':date||'ยังไม่ถึงเดือนเริ่ม')+(t.enabled?'':' · พักใช้'),actions);
    }
    const cats=$('#category-manager');cats.replaceChildren();cats.append(button('＋ เพิ่มหมวดหมู่',()=>editCategory()));
    const categories=[...cfg.categories];for(const t of s.transactions)if(t.type!=='transfer'&&!categories.some(c=>c.type===t.type&&c.name===t.category))categories.push({type:t.type,name:t.category,hidden:false});
    for(const c of categories)row(cats,c.name,(c.type==='income'?'รายรับ':'รายจ่าย')+(c.hidden?' · ซ่อน':''),[button('เปลี่ยนชื่อ',()=>editCategory(c)),button(c.hidden?'แสดง':'ซ่อน',()=>{const all=settings().categories.filter(x=>!(x.type===c.type&&x.name===c.name));return save({...settings(),categories:[...all,{...c,hidden:!c.hidden}]});})]);
    const trash=$('#trash-list');trash.replaceChildren();if(!s.trash.length)trash.append(node('p','ถังขยะว่าง','muted'));
    for(const t of s.trash)row(trash,t.note||t.category,t.date+' · '+money(t.amount),[button('กู้คืน',()=>mutate({action:'restore',id:t.id}))]);
    const history=$('#history-list');history.replaceChildren();
    const names={upsert:'บันทึก/แก้ไข',delete:'ย้ายไปถังขยะ',restore:'กู้คืน',settings:'แก้ไขการตั้งค่า',mergeSettings:'นำเข้าการตั้งค่า',import:'นำเข้ารายการ',importTrash:'นำเข้าถังขยะ',renameCategory:'เปลี่ยนชื่อหมวดหมู่'};
    for(const h of s.history) {const details=node('details'),summary=node('summary',names[h.action]||h.action);details.append(summary,node('p',h.savedAt?new Date(h.savedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'ไม่ระบุเวลา','muted'));
      for(const [label,t] of [['ก่อน',h.before],['หลัง',h.after]])if(t)details.append(node('p',label+': '+t.date+' · '+t.category+' · '+money(t.amount)+' · '+t.note));if(h.detail)details.append(node('p',h.detail));history.append(details);}
    const report=$('#annual-report');report.replaceChildren();buildReport(report);
    let last=0;try{last=Number(localStorage.getItem('littlepay-last-backup-'+(s.cloud?'cloud':'demo'))||0);}catch{}
    $('#backup-reminder').hidden=Date.now()-last<7*86400000;
    $('#backup-reminder').textContent=last?'ครบ 7 วันจากการกดสำรองครั้งล่าสุด แนะนำให้สำรอง JSON อีกครั้ง':'ยังไม่มีประวัติการกดสำรองบนอุปกรณ์นี้ แนะนำให้สำรอง JSON เป็นระยะ';
  }
  document.addEventListener('click',e=>{const target=e.target.closest('[data-template]');if(target){const t=getState().transactions.find(x=>x.id===target.dataset.template);if(t)editTemplate(t);}});
  return {render,editTemplate,editCategory};
}
