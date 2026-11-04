// Pure scheduling functions: no network, DOM or browser storage dependencies.
export const uid = () => crypto.randomUUID();
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function dateAdd(value, days) {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
export function datesBetween(start,end) {
  if (!validDate(start) || !validDate(end) || start>end) throw Error('期間を正しく指定してください。');
  const result=[];
  for(let d=start;d<=end;d=dateAdd(d,1)) {
    if(result.length>=731) throw Error('計画期間は最大731日です。');
    result.push(d);
  }
  return result;
}
export function validDate(s) {
  return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s+'T12:00:00Z')) && new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
}
export function remainingRanges(task) {
  return task.completed < task.end-task.start+1 ? [{...task,start:task.start+task.completed,completed:0}] : [];
}
export function materialUnits(material, occupied=[], range={start:material.start,end:material.end}) {
  if(!Number.isSafeInteger(range.start)||!Number.isSafeInteger(range.end)||range.start<material.start||range.end>material.end||range.start>range.end) {
    throw Error(`${material.title}：開始・終了番号を教材の範囲内で指定してください。`);
  }
  const units=[];
  for(let n=range.start;n<=range.end;n++) {
    if(occupied.some(t=>t.materialId===material.id && n>=t.start && n<=t.end)) continue;
    const section=material.sections.find(s=>n>=s.start && n<=s.end);
    units.push({materialId:material.id,title:section?.title || '学習範囲',section:section?.id || 'unsectioned',n,minutes:material.minutesPerUnit});
  }
  return units;
}
export function rangesToUnits(ranges, materials) {
  return ranges.flatMap(r=>{
    const m=materials.find(m=>m.id===r.materialId);
    if(!m) throw Error('教材が見つかりません。');
    const result=[];
    for(let n=r.start;n<=r.end;n++) result.push({materialId:m.id,title:r.title,section:r.title,n,minutes:m.minutesPerUnit});
    return result;
  });
}
export function generate(units, config) {
  const dates=datesBetween(config.startDate,config.endDate);
  if(!Array.isArray(config.weeklyMinutes) || config.weeklyMinutes.length!==7 || config.weeklyMinutes.some(n=>!Number.isFinite(n)||n<0||n>1440)) throw Error('曜日別の時間が正しくありません。');
  if(!['even','increase'].includes(config.distribution)) throw Error('配分方式が正しくありません。');
  const days=dates.map(date=>{
    const reserved=config.reservedMinutes?.[date]||0;
    if(!Number.isFinite(reserved)||reserved<0)throw Error('既存の予定時間が正しくありません。');
    return {date,cap:Math.max(0,config.weeklyMinutes[new Date(date+'T12:00:00Z').getUTCDay()]-reserved),used:0,tasks:[]};
  });
  const queues=new Map();
  for(const u of units) {
    if(!Number.isFinite(u.minutes)||u.minutes<=0) throw Error('推定時間は0より大きくしてください。');
    if(!queues.has(u.materialId)) queues.set(u.materialId,[]);
    queues.get(u.materialId).push(u);
  }
  for(const q of queues.values()) q.sort((a,b)=>a.n-b.n);
  const total=units.reduce((s,u)=>s+u.minutes,0);
  let left=total;
  for(let di=0;di<days.length;di++) {
    const day=days[di];
    if(!day.cap) continue;
    const weighted=days.slice(di).reduce((s,d,j)=>s+d.cap*(config.distribution==='increase'?di+j+1:1),0);
    const weight=day.cap*(config.distribution==='increase'?di+1:1);
    const target=Math.min(day.cap, left*weight/(weighted||1));
    let changed=true;
    while(changed) {
      changed=false;
      for(const q of queues.values()) {
        if(!q.length) continue;
        const head=q[0], room=day.cap-day.used;
        if(head.minutes>room+1e-8) continue;
        if(day.used>=target && day.used>0) continue;
        // Keep a section together when it fits the daily target; split only at whole units.
        let count=1,batchMinutes=head.minutes;
        while(count<q.length && q[count].section===head.section && q[count].n===head.n+count && batchMinutes+q[count].minutes<=Math.min(room,Math.max(head.minutes,target-day.used))+1e-8) {batchMinutes+=q[count].minutes;count++;}
        const picked=q.splice(0,count);
        const mins=picked.reduce((s,u)=>s+u.minutes,0);
        const previous=day.tasks.at(-1);
        if(previous && previous.materialId===head.materialId && previous.title===head.title && previous.end+1===head.n) previous.end=picked.at(-1).n;
        else day.tasks.push({materialId:head.materialId,title:head.title,start:head.n,end:picked.at(-1).n,date:day.date,completed:0,minutesPerUnit:head.minutes});
        day.used+=mins;left-=mins;changed=true;
      }
    }
  }
  // Use spare capacity on later days if rounding of whole units missed the target.
  // The chronological first pass keeps each material ordered; remaining ranges stay explicit.
  const unscheduled=[...queues.values()].flat();
  const warnings=[];
  if(unscheduled.length) warnings.push(`${unscheduled.length}単位（約${Math.round(left)}分）が未配置です。期間を延ばすか、学習可能時間を増やしてください。`);
  if(units.some(u=>u.minutes>Math.max(...days.map(d=>d.cap)))) warnings.push('1ページ・1問の推定時間が、すべての日の上限を超える教材があります。');
  return {tasks:days.flatMap(d=>d.tasks),unscheduled,totalMinutes:total,scheduledMinutes:total-left,warnings};
}
export function completedCount(tasks, materialId) {
  const ranges=tasks.filter(t=>t.materialId===materialId && t.completed>0).map(t=>[t.start,t.start+t.completed-1]).sort((a,b)=>a[0]-b[0]);
  let count=0,last=-Infinity;
  for(const [start,end] of ranges) { count+=Math.max(0,end-Math.max(last,start-1));last=Math.max(last,end); }
  return count;
}
