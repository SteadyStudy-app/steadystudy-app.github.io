import { validDate } from './engine.js';
export const emptyState = () => ({schemaVersion:1,materials:[],plans:[],tasks:[],records:[],settings:{lastBackup:null,sampleLoaded:false}});
let connection;
export async function openDB() {
  if(connection) return connection;
  connection=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('steadystudy-local',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('state');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('別のタブを閉じてから、もう一度お試しください。'));
  });
  return connection;
}
export async function readState() {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const r=db.transaction('state').objectStore('state').get('main');
    r.onsuccess=()=>{try {resolve(r.result?validateState(r.result):emptyState());}catch(e){reject(e);}};
    r.onerror=()=>reject(r.error);
  });
}
export async function writeState(state, expected) {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('state','readwrite');
    const store=tx.objectStore('state');
    const request=store.get('main');
    let conflict=false;
    request.onsuccess=()=>{
      if(expected && JSON.stringify(request.result||emptyState())!==JSON.stringify(expected)){conflict=true;tx.abort();return;}
      store.put(state,'main');
    };
    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(conflict?Error('別のタブでデータが更新されました。最新データを読み込んでから、もう一度操作してください。'):tx.error||Error('保存が中断されました。'));
  });
}
const str=(v,max=200)=>typeof v==='string'&&v.length>0&&v.length<=max;
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function removeStudyData(state, kind, id) {
  const tasks=state.tasks.filter(task=>kind==='plan'?task.planId!==id:task.materialId!==id);
  const taskIds=new Set(tasks.map(task=>task.id));
  let plans;
  if(kind==='plan'){
    plans=state.plans.filter(plan=>plan.id!==id);
  }else{
    const affected=new Set(state.tasks.filter(task=>task.materialId===id).map(task=>task.planId));
    const remaining=new Set(tasks.map(task=>task.planId));
    plans=state.plans.flatMap(plan=>{
      const unscheduled=plan.unscheduled.filter(unit=>unit.materialId!==id);
      const selectedRanges=plan.selectedRanges?.filter(range=>range.materialId!==id);
      const changed=affected.has(plan.id)||unscheduled.length!==plan.unscheduled.length||selectedRanges?.length!==plan.selectedRanges?.length;
      if(!changed)return [plan];
      if(!remaining.has(plan.id)&&!unscheduled.length)return [];
      return [{...plan,unscheduled,selectedRanges}];
    });
  }
  return {
    ...state, plans, tasks,
    materials:kind==='material'?state.materials.filter(material=>material.id!==id):state.materials,
    records:state.records.filter(record=>taskIds.has(record.taskId))
  };
}

export function validateState(input) {
  const bad=()=>{throw Error('バックアップの形式またはデータの整合性が正しくありません。');};
  if(!input || input.schemaVersion!==1 || !['materials','plans','tasks','records'].every(k=>Array.isArray(input[k])&&input[k].length<=50000)) bad();
  const s=JSON.parse(JSON.stringify(input));
  for(const list of [s.materials,s.plans,s.tasks,s.records]) if(new Set(list.map(x=>x?.id)).size!==list.length || list.some(x=>!str(x?.id))) bad();
  for(const m of s.materials) {
    if(!str(m.title,100)||!str(m.subject,40)||!['page','question'].includes(m.unit)||!integer(m.start,1,100000)||!integer(m.end,m.start,m.start+9999)||!Number.isFinite(m.minutesPerUnit)||m.minutesPerUnit<0.1||m.minutesPerUnit>1440||!/^#[a-fA-F0-9]{6}$/.test(m.color)||!Array.isArray(m.sections)||m.sections.length>1000) bad();
    let last=m.start-1;
    for(const sec of [...m.sections].sort((a,b)=>a.start-b.start)) {
      if(!str(sec.id)||!str(sec.title,100)||!integer(sec.start,m.start,m.end)||!integer(sec.end,sec.start,m.end)||sec.start<=last) bad();
      last=sec.end;
    }
  }
  const mids=new Set(s.materials.map(x=>x.id)),pids=new Set(s.plans.map(x=>x.id));
  for(const p of s.plans) if(p.selectedRanges!==undefined){
    if(!Array.isArray(p.selectedRanges)||p.selectedRanges.length>s.materials.length||new Set(p.selectedRanges.map(r=>r?.materialId)).size!==p.selectedRanges.length)bad();
    for(const range of p.selectedRanges){
      const m=s.materials.find(m=>m.id===range?.materialId);
      if(!m||!integer(range.start,m.start,m.end)||!integer(range.end,range.start,m.end))bad();
    }
  }
  for(const p of s.plans) if(!str(p.title,100)||!validDate(p.startDate)||!validDate(p.endDate)||p.startDate>p.endDate||!['even','increase'].includes(p.distribution)||!Array.isArray(p.weeklyMinutes)||p.weeklyMinutes.length!==7||p.weeklyMinutes.some(n=>!integer(n,0,1440))||!Array.isArray(p.unscheduled)||p.unscheduled.length>50000) bad();
  const planned=new Set(), occupied=new Set();
  const reserve=(planId,materialId,unit,pending)=>{
    const planKey=JSON.stringify([planId,materialId,unit]);
    const unitKey=JSON.stringify([materialId,unit]);
    if(planned.has(planKey)||(pending&&occupied.has(unitKey)))bad();
    planned.add(planKey);
    if(pending)occupied.add(unitKey);
  };
  for(const t of s.tasks) {
    const m=s.materials.find(m=>m.id===t.materialId);
    if(!m||!pids.has(t.planId)||!str(t.title,100)||!validDate(t.date)||!integer(t.start,m.start,m.end)||!integer(t.end,t.start,m.end)||!integer(t.completed,0,t.end-t.start+1)||!Number.isFinite(t.minutesPerUnit)||t.minutesPerUnit<0.1||t.minutesPerUnit>1440) bad();
    for(let n=t.start;n<=t.end;n++)reserve(t.planId,m.id,n,n>=t.start+t.completed);
  }
  for(const p of s.plans) for(const u of p.unscheduled) {
    const m=s.materials.find(m=>m.id===u.materialId);
    if(!m||!str(u.title,100)||!str(u.section)||!integer(u.n,m.start,m.end)||!Number.isFinite(u.minutes)||u.minutes<0.1||u.minutes>1440) bad();
    reserve(p.id,m.id,u.n,true);
  }
  const taskById=new Map(s.tasks.map(t=>[t.id,t])),recordUnits=new Map();
  for(const r of s.records) {
    const task=taskById.get(r.taskId);
    if(!mids.has(r.materialId)||!task||task.materialId!==r.materialId||!validDate(r.date)||!integer(r.units,1,10000)||!Number.isFinite(r.minutes)||r.minutes<0||r.minutes>1440) bad();
    recordUnits.set(r.taskId,(recordUnits.get(r.taskId)||0)+r.units);
  }
  for(const t of s.tasks)if((recordUnits.get(t.id)||0)!==t.completed)bad();
  if(!s.settings||typeof s.settings!=='object'||(s.settings.lastBackup!==null&&!validDate(s.settings.lastBackup))) bad();
  if(s.settings.theme!==undefined&&!['light','dark'].includes(s.settings.theme))bad();
  if(s.settings.accent!==undefined&&!['green','blue','violet','rose','amber','slate'].includes(s.settings.accent))bad();
  return s;
}
