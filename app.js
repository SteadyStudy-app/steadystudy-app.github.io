import {uid,today,dateAdd,datesBetween,generate,materialUnits,rangesToUnits,remainingRanges,completedCount} from './engine.js';
import {emptyState,readState,writeState,validateState} from './store.js';

const icons={home:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',plan:'M5 5h14v16H5zM8 3v4m8-4v4M5 10h14m-10 4h2m3 0h2m-7 4h2',book:'M3 4q5-1 9 2 4-3 9-2v15q-5-1-9 2-4-3-9-2zM12 6v15',chart:'M4 3v18h17M8 16v-4m5 4V8m5 8V5',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 2-1 4-3 1-3 2-3-2-4-1-1-4-2-2 2-5 3-1z',plus:'M12 5v14M5 12h14',arrow:'M5 12h14m-6-6 6 6-6 6',check:'m5 12 4 4L19 6',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v6l4 2',shield:'m12 3 8 3v6q0 6-8 9-8-3-8-9V6zM8 12l3 3 5-6',close:'m6 6 12 12M6 18 18 6',refresh:'M20 8a8 8 0 1 0 0 9M20 3v5h-5',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',upload:'M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5',warn:'m12 3 10 18H2zM12 9v5m0 3v1',leaf:'M20 3Q3 2 4 14q2 8 10 4 7-4 6-15M4 21l11-11',edit:'m4 15 11-11 5 5L9 20H4zm10-10 5 5',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1'};
const icon=(name)=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]||icons.book}"/></svg>`;
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shortDate=(d)=>new Date(d+'T12:00:00').toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',weekday:'short'});
const fullDate=(d)=>new Date(d+'T12:00:00').toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
const unitName=(m)=>m?.unit==='question'?'問':'ページ';
const rangeText=(m,start,end)=>m?.unit==='question'?`問${start}${start===end?'':`〜${end}`}`:`p.${start}${start===end?'':`〜${end}`}`;
const rounded=(n)=>Math.round(n*10)/10;
const sum=(items,key)=>items.reduce((n,x)=>n+(typeof key==='function'?key(x):x[key]),0);
const groupBy=(items,key)=>{const map=new Map();for(const item of items){const k=key(item);if(!map.has(k))map.set(k,[]);map.get(k).push(item);}return map;};
const accents={green:{label:'グリーン',light:'#245b48',dark:'#9bcdb5'},blue:{label:'ブルー',light:'#315d9c',dark:'#9dbdea'},violet:{label:'パープル',light:'#6d4fa0',dark:'#c5acec'},rose:{label:'ローズ',light:'#9a4664',dark:'#edabc2'},amber:{label:'アンバー',light:'#805d1e',dark:'#dfc081'},slate:{label:'グレー',light:'#4b606c',dark:'#b4c8d2'}};
let state=emptyState(),page='home',planFilter='all',planFocus='',busy=false,preview=null,deferredInstall=null,toastTimer;
let saveChannel;
const app=document.querySelector('#app'),modal=document.querySelector('#modal');
function applyTheme(){
  const mode=state.settings.theme==='dark'?'dark':'light';
  const accent=accents[state.settings.accent]||accents.green;
  document.documentElement.dataset.theme=mode;
  document.documentElement.style.setProperty('--accent',accent[mode]);
  document.querySelector('meta[name="theme-color"]').content=mode==='dark'?'#171b19':'#f5f6f2';
}
function notify(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4200);}
async function commit(next,message){
  if(busy) return false;
  busy=true;
  document.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=true);
  try{validateState(next);await writeState(next,state);state=next;applyTheme();saveChannel?.postMessage('changed');if(message)notify(message);return true;}
  catch(e){notify(e.message?.includes('別のタブ')?e.message:'保存できませんでした。空き容量やブラウザの設定をご確認ください。');console.error(e);return false;}
  finally{busy=false;document.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=false);}
}
function openDialog(title,body){
  modal.innerHTML=`<div class="modal-header"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-btn" data-action="close" aria-label="閉じる">${icon('close')}</button></div><div class="modal-body">${body}</div>`;
  if(!modal.open)modal.showModal();
  modal.querySelector('input:not([type="checkbox"]),select,textarea,button')?.focus();
}
const closeDialog=()=>{modal.close();preview=null;};
function formError(message){const error=modal.querySelector('.error-message');if(error){error.textContent=message;error.scrollIntoView({block:'nearest'});}else notify(message);}
function empty(title,text,action,label){return `<div class="empty">${icon('leaf')}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action?`<button class="btn primary" data-action="${action}">${icon('plus')}${esc(label)}</button>`:''}</div>`;}
function material(id){return state.materials.find(m=>m.id===id);}
function fraction(m){return Math.min(100,Math.round(completedCount(state.tasks,m.id)/(m.end-m.start+1)*100));}
function remaining(t){return t.end-t.start+1-t.completed;}
function badge(m){return `<span class="tag">${esc(m?.subject||'教材')}</span>`;}
function taskRow(t){const m=material(t.materialId),done=remaining(t)===0;return `<article class="task ${done?'is-done':''}"><button class="task-check ${done?'done':''}" data-action="record" data-id="${esc(t.id)}" aria-label="${esc(m.title)} ${esc(rangeText(m,t.start,t.end))}${done?'の記録を見る':'の学習を記録'}">${icon(done?'check':'plus')}</button><div class="task-info"><div class="task-top">${badge(m)}${t.date<today()&&!done?'<span class="section-badge">持ち越し</span>':''}${t.completed>0&&!done?'<span class="section-badge">一部完了</span>':''}${done?'<span class="section-badge">完了</span>':''}</div><h3>${esc(m.title)}</h3><p class="task-meta">${esc(t.title)} · ${esc(rangeText(m,t.start,t.end))}${t.completed>0?` · ${t.completed}/${t.end-t.start+1}${unitName(m)}完了`:''}</p></div><div class="task-time"><strong>${done?rounded(sum(state.records.filter(r=>r.taskId===t.id),'minutes')):Math.ceil(remaining(t)*t.minutesPerUnit)}<small> 分</small></strong>${done?'学習実績':'予定'}</div></article>`;}
function progressRows(){return state.materials.slice(0,5).map(m=>`<div class="material-progress"><div class="material-progress-header"><span>${esc(m.title)}</span><span>${fraction(m)}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${fraction(m)}%"></div></div></div>`).join('');}
function statsCard(label,value,unit,foot,ico){return `<div class="stat"><div class="stat-label">${icon(ico)}${label}</div><div class="stat-value">${value}<small>${unit}</small></div><div class="stat-foot">${foot}</div></div>`;}
function heading(eyebrow,title,subtitle,button=''){return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${button}</div>`;}
function homeView(){
  const td=today(),tasks=state.tasks.filter(t=>t.date===td),done=tasks.filter(t=>!remaining(t)).length;
  const overdue=state.tasks.filter(t=>t.date<td && remaining(t)>0);
  const todayMins=sum(state.records.filter(r=>r.date===td),'minutes');
  const dayNum=new Date(td+'T12:00:00Z').getUTCDay();
  const monday=dateAdd(td,-((dayNum+6)%7));
  const weekDays=Array.from({length:7},(_,i)=>dateAdd(monday,i));
  const hasData=state.materials.length>0;
  return heading('YOUR DAILY STEP','今日も、一歩ずつ。',fullDate(td),`<button class="btn primary" data-action="new-plan">${icon('plus')}計画をつくる</button>`)+
  `<section class="hero ${hasData?'has-materials':''}"><div><p class="eyebrow">SMALL STEPS, STEADY PROGRESS</p><h2>${hasData?'自分のペースで、<br>今日の一歩を進めよう。':'計画を立てる時間を、<br>学ぶ時間に。'}</h2><p>${hasData?'できた分を記録すれば、次の一歩が見えてくる。':'教材と期限から、無理のない学習計画を。'}</p><button class="btn ${hasData?'secondary':'primary'} small" data-action="${hasData?'go-plan':'sample'}">${hasData?'今日の計画を見る':'サンプルで試してみる'}${icon('arrow')}</button></div><div class="hero-art" aria-hidden="true"><div class="art-dot"></div><div class="art-book"></div><div class="art-pencil"></div><div class="art-leaf"></div></div></section>`+
  `<div class="stats-grid">${statsCard('今日のタスク',`${done}<span class="muted" style="font-size:17px"> / ${tasks.length}</span>`,'件',tasks.length?`${tasks.length-done}件が未完了`:'予定をつくって始めよう','check')}${statsCard('今日の学習',rounded(todayMins),'分',`予定 ${Math.ceil(sum(tasks,t=>(t.end-t.start+1)*t.minutesPerUnit))}分`,'clock')}${statsCard('今週の積み重ね',rounded(sum(state.records.filter(r=>r.date>=monday&&r.date<=td),'minutes')),'分',`${new Set(state.records.filter(r=>r.date>=monday&&r.date<=td).map(r=>r.date)).size}日間、学習を記録`,'chart')}</div>`+
  (overdue.length?`<div class="notice">${icon('refresh')}<div><p>${overdue.length}件のタスクを持ち越しています。計画画面から残りの予定を組み直せます。</p><button class="btn link" data-action="go-plan">計画を確認する →</button></div></div>`:'')+
  `<div class="dashboard"><section><div class="section-heading"><h2>今日のタスク <span class="count">${tasks.length}</span></h2><button class="btn link tiny" data-action="go-plan">すべての計画 ${icon('arrow')}</button></div><div class="panel">${tasks.length?[...tasks].sort((a,b)=>(!remaining(a))-(!remaining(b))).map(taskRow).join(''):empty(hasData?'今日は、余白のある日。':'はじめの一冊を登録しよう',hasData?'予定がない日は、休息や振り返りに。\n計画画面で、これからの予定を確認できます。':'教材名と学習範囲を入力するだけ。\n少しずつ続けられる計画をつくりましょう。',hasData?'new-plan':'new-material',hasData?'計画をつくる':'教材を登録')}</div></section><aside><section class="panel"><div class="section-heading"><h2>今週のリズム</h2><span class="tiny muted">${shortDate(monday).split('(')[0]}〜</span></div><div class="week">${weekDays.map((d,i)=>`<div class="week-day ${d===td?'selected':''}"><span>${['月','火','水','木','金','土','日'][i]}</span><b>${Number(d.slice(-2))}</b><i class="dot ${state.records.some(r=>r.date===d)?'':'blank'}"></i></div>`).join('')}</div><p class="tiny muted">● 学習を記録した日</p></section><section class="panel"><div class="section-heading"><h2>教材の進み具合</h2>${icon('book')}</div>${state.materials.length?progressRows():'<p class="tiny muted">登録した教材の進捗がここに表示されます。</p>'}</section><p class="quote">大きな目標も、小さな一歩から。</p></aside></div>`;
}
function materialsView(){return heading('YOUR MATERIALS','教材ライブラリ','一冊ずつ、自分のペースで進めよう。',`<button class="btn primary" data-action="new-material">${icon('plus')}教材を登録</button>`)+(!state.materials.length?`<div class="panel">${empty('何を学びますか？','教科書も、問題集も。\nまずは教材と学習範囲を登録しましょう。','new-material','教材を登録')}</div>`:`<div class="material-grid">${state.materials.map(m=>`<article class="panel material-card"><div class="book-mark">${icon('book')}</div>${badge(m)}<h2>${esc(m.title)}</h2><p class="tiny muted">${esc(rangeText(m,m.start,m.end))} · ${m.end-m.start+1}${unitName(m)}</p><p class="tiny muted">目安 ${m.minutesPerUnit}分 / ${unitName(m)}</p><div class="progress-track"><div class="progress-fill" style="width:${fraction(m)}%"></div></div><div class="material-progress-header"><span class="muted">${completedCount(state.tasks,m.id)}${unitName(m)}完了</span><span>${fraction(m)}%</span></div>${m.sections.length?`<details class="section-list"><summary>${m.sections.length}つの章・節</summary>${m.sections.map(s=>`<div><span>${esc(s.title)}</span><span>${esc(rangeText(m,s.start,s.end))}</span></div>`).join('')}</details>`:''}<div class="actions"><button class="btn small" data-action="new-plan" data-id="${esc(m.id)}">${icon('plus')}計画に追加</button><button class="icon-btn" data-action="edit-material" data-id="${esc(m.id)}" aria-label="${esc(m.title)}を編集">${icon('edit')}</button></div></article>`).join('')}</div>`);}
function plansView(){
  let tasks=state.tasks.filter(t=>!planFocus||t.planId===planFocus);
  if(planFilter==='pending')tasks=tasks.filter(t=>remaining(t)>0);
  if(planFilter==='done')tasks=tasks.filter(t=>!remaining(t));
  tasks.sort((a,b)=>a.date.localeCompare(b.date)||a.materialId.localeCompare(b.materialId)||a.start-b.start);
  const groups=groupBy(tasks,t=>t.date);
  return heading('MAKE ROOM FOR LEARNING','学習計画','予定が変わっても、何度でも立て直せる。',`<button class="btn primary" data-action="new-plan">${icon('plus')}計画をつくる</button>`)+
  (!state.plans.length?`<div class="panel">${empty('学びの道すじをつくろう','教材・期限・曜日ごとの時間から、\nあなたに合った計画を組み立てます。','new-plan','計画をつくる')}</div>`:
  `<div class="plan-cards">${state.plans.map(p=>{const ts=state.tasks.filter(t=>t.planId===p.id);const all=sum(ts,t=>t.end-t.start+1)+p.unscheduled.length,done=sum(ts,'completed');return `<section class="panel plan-card"><div class="plan-summary"><div><p class="eyebrow">${p.distribution==='increase'?'少しずつ増やす':'均等に進める'}</p><h2>${esc(p.title)}</h2><p class="tiny muted">${shortDate(p.startDate)} 〜 ${shortDate(p.endDate)}</p></div><div class="tiny muted">完了 <strong>${done}</strong> / ${all}単位${p.unscheduled.length?` · 未配置 ${p.unscheduled.length}`:''}</div></div><div class="progress-track"><div class="progress-fill" style="width:${all?Math.round(done/all*100):0}%"></div></div><div class="actions"><button class="btn small ${planFocus===p.id?'secondary':''}" data-action="focus-plan" data-id="${esc(p.id)}">${planFocus===p.id?'すべて表示':'この計画を表示'}</button><button class="btn small" data-action="replan" data-id="${esc(p.id)}">${icon('refresh')}残りを組み直す</button><button class="btn link small" data-action="delete-plan" data-id="${esc(p.id)}">削除</button></div>${p.unscheduled.length?'<p class="tiny muted" style="margin-top:12px">未配置の範囲も保存されています。「残りを組み直す」で再配置できます。</p>':''}</section>`;}).join('')}</div><div class="section-heading"><h2>日付ごとのタスク</h2></div><div class="filters">${[['all','すべて'],['pending','未完了'],['done','完了']].map(([key,label])=>`<button class="filter ${planFilter===key?'active':''}" data-action="filter" data-id="${key}" aria-pressed="${planFilter===key}">${label}</button>`).join('')}</div>${groups.size?[...groups].map(([date,ts])=>`<section class="date-group"><h3 class="date-heading">${shortDate(date)}${date===today()?'<span class="today">今日</span>':''}<span class="line"></span><span class="tiny muted">${Math.ceil(sum(ts,t=>remaining(t)*t.minutesPerUnit))}分 残り</span></h3><div class="panel">${ts.map(taskRow).join('')}</div></section>`).join(''):empty('表示するタスクがありません','条件を変えるか、未配置の範囲を再計画してください。')}`);
}
function analysisView(){
  const td=today(),days=Array.from({length:7},(_,i)=>dateAdd(td,i-6));
  const values=days.map(d=>sum(state.records.filter(r=>r.date===d),'minutes'));
  const max=Math.max(30,...values);
  const subjects=groupBy(state.records,r=>material(r.materialId)?.subject||'その他');
  const total=sum(state.records,'minutes');
  return heading('LOOK HOW FAR YOU HAVE COME','学習のふりかえり','小さな積み重ねを、見えるかたちに。')+`<div class="stats-grid">${statsCard('累計学習時間',rounded(total),'分','記録した実際の学習時間','clock')}${statsCard('学習した日',new Set(state.records.map(r=>r.date)).size,'日','少しずつ、着実に','check')}${statsCard('完了した学習範囲',sum(state.tasks,'completed'),'単位','ページ・問題の合計','book')}</div><div class="two-cols"><section class="panel"><div class="section-heading"><h2>最近7日間の学習時間</h2><span class="tiny muted">単位：分</span></div><div class="chart" role="img" aria-label="${days.map((d,i)=>`${shortDate(d)} ${values[i]}分`).join('、')}">${days.map((d,i)=>`<div class="bar-group ${d===td?'current':''}"><span class="bar-value">${rounded(values[i])}</span><div class="bar" style="height:${values[i]/max*135}px"></div><span class="bar-label">${Number(d.slice(5,7))}/${Number(d.slice(-2))}</span></div>`).join('')}</div></section><section class="panel"><h2>科目ごとの学習時間</h2>${subjects.size?[...subjects].sort((a,b)=>sum(b[1],'minutes')-sum(a[1],'minutes')).map(([subject,rs])=>`<div class="subject-row"><span>${esc(subject)}</span><div class="progress-track"><div class="progress-fill" style="width:${total?sum(rs,'minutes')/total*100:0}%"></div></div><span class="muted">${rounded(sum(rs,'minutes'))}分</span></div>`).join(''):'<div class="empty"><p>学習を記録すると、科目ごとの時間を確認できます。</p></div>'}</section></div><section class="panel"><h2>最近の学習記録</h2>${state.records.length?[...state.records].reverse().slice(0,20).map(r=>`<div class="history-row"><div><strong>${esc(material(r.materialId)?.title)}</strong><p>${shortDate(r.date)} · ${r.units}${unitName(material(r.materialId))}完了</p></div><span>${rounded(r.minutes)} 分</span></div>`).join(''):'<div class="empty"><p>今日のタスクの「＋」から、できた分を記録してみよう。</p></div>'}</section>`;
}
function settingsView(){
  const theme=state.settings.theme||'light',accent=state.settings.accent||'green';
  return heading('YOUR OWN STUDY SPACE','設定とデータ','使いやすさも、データも、自分で管理。')+`<section class="panel"><div class="section-heading"><h2>見た目</h2>${icon('sun')}</div><div class="settings-group"><p class="seg-label">ベースカラー</p><div class="actions">${[['light','ライト'],['dark','ダーク']].map(([key,label])=>`<button class="btn ${theme===key?'primary':''}" data-action="theme" data-id="${key}" aria-pressed="${theme===key}">${label}</button>`).join('')}</div></div><p class="seg-label">アクセントカラー</p><div class="accent-options">${Object.entries(accents).map(([key,a])=>`<button class="accent-option ${accent===key?'selected':''}" data-action="accent" data-id="${key}" aria-pressed="${accent===key}" style="--swatch:${a[theme]}"><span>${accent===key?icon('check'):''}</span>${a.label}</button>`).join('')}</div><p class="helper" style="margin-top:15px">ベースと文字色、1つのアクセントの濃淡で統一します。</p></section><section class="panel"><h2>データとバックアップ</h2><div class="settings-row"><div><h3>バックアップを保存</h3><p>最終保存：${state.settings.lastBackup?fullDate(state.settings.lastBackup):'まだ保存していません'}<br>暗号化されないJSONファイルです。大切に保管してください。</p></div><button class="btn" data-action="export">${icon('download')}保存</button></div><div class="settings-row"><div><h3>バックアップから復元</h3><p>内容を確認して、この端末のデータを置き換えます。</p></div><button class="btn" data-action="import">${icon('upload')}復元</button><input class="sr-only" id="import-file" type="file" accept=".json,application/json" aria-label="バックアップファイル"></div><div class="settings-row"><div><h3>保存領域の保護</h3><p id="persist-status">ブラウザにデータの永続保存を申請できます。<br>バックアップも定期的に保存してください。</p></div><button class="btn" data-action="persist">${icon('shield')}申請</button></div><div class="settings-row"><div><h3>サンプルデータを追加</h3><p>操作を試すための教材と、学習計画を追加します。</p></div><button class="btn" data-action="sample" ${state.settings.sampleLoaded?'disabled':''}>${state.settings.sampleLoaded?'追加済み':'追加する'}</button></div><div class="settings-row"><div><h3>この端末のデータを削除</h3><p>教材・計画・学習履歴をすべて削除します。</p></div><button class="btn danger" data-action="clear">${icon('trash')}削除</button></div></section><section class="panel"><h2>アプリとして使う</h2><p class="install-help">スマホやPCのホーム画面に追加できます。初回に必要なファイルを読み込んだ後は、オフラインでも教材・計画・記録を使えます。<br>iPhone：Safariの共有メニュー →「ホーム画面に追加」<br>Android・PC：ブラウザメニュー →「アプリをインストール」など</p><button class="btn secondary" data-action="install" style="margin-top:14px" ${deferredInstall?'':'disabled'}>アプリをインストール</button><p class="helper" style="margin-top:10px" id="offline-status">オフライン対応の状態を確認中…</p></section><section class="panel privacy"><h2>プライバシーについて</h2><p>氏名・メール・学校名などの登録は不要です。教材・計画・学習履歴は、この端末の、このブラウザの保存領域に保管します。学習データを外部へ送信する機能、アクセス解析、広告はありません。</p><p>同じ端末でも別のブラウザでは別データになります。ブラウザのデータ削除、容量不足、端末の紛失・故障で記録が失われる場合があります。端末間の自動同期はありません。バックアップファイルで移行できます。</p><p>アプリの配信元にはアクセスが発生します。GitHub Pagesで公開する場合、GitHubはセキュリティ目的でアクセス元IPアドレスを記録します。画像OCR、クラウド同期、通知、暗号化バックアップはこのプロトタイプには含まれません。</p><p class="tiny">SteadyStudy Prototype · v0.2.1</p></section>`;
}
function render(){
  const nav=[['home','home','ホーム'],['plan','plan','計画'],['materials','book','教材'],['analysis','chart','分析'],['settings','settings','設定']];
  app.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-icon" aria-hidden="true"></span><div>SteadyStudy<small>ONE STEP AT A TIME</small></div></div><nav class="nav" aria-label="メインメニュー">${nav.map(([id,ico,label])=>`<button data-action="navigate" data-id="${id}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}>${icon(ico)}<span>${label}</span></button>`).join('')}</nav><div class="side-bottom"><div class="local-note"><strong>${icon('shield')}あなたの端末に保存</strong>学習データは、このブラウザの中に。アカウント登録は不要です。</div><span>STEADYSTUDY · PROTOTYPE</span></div></aside><main class="main" id="main"><div class="topbar"><span>MY STUDY SPACE</span><div class="mobile-brand"><span class="brand-icon" aria-hidden="true"></span>SteadyStudy</div><div class="actions">${state.settings.sampleLoaded?'<span class="sample-badge">サンプル追加済み</span>':''}<span class="status" id="save-status">${navigator.onLine?'この端末に保存':'オフライン · 端末内で利用中'}</span></div></div>${state.materials.length&&(!state.settings.lastBackup||dateAdd(state.settings.lastBackup,7)<=today())?'<div class="notice good">'+icon('shield')+'<div>大切な記録を、バックアップしておこう。<button class="btn link tiny" data-action="export">ファイルに保存 →</button></div></div>':''}${({home:homeView,plan:plansView,materials:materialsView,analysis:analysisView,settings:settingsView}[page]||homeView)()}<p class="footer-note">少しずつ、着実に。SteadyStudy</p></main></div>`;
  applyTheme();
  if(page==='settings')updateOfflineStatus();
}
function navigate(target){page=target;render();window.scrollTo({top:0});}
function materialForm(id){
  const m=material(id),locked=m&&(state.tasks.some(t=>t.materialId===id)||state.plans.some(p=>p.unscheduled.some(u=>u.materialId===id)));
  openDialog(m?'教材を編集':'新しい教材を登録',`<form id="material-form"><div class="form-grid"><div class="field full"><label for="material-title">教材名</label><input id="material-title" name="title" placeholder="例：数学の問題集" required maxlength="100" value="${esc(m?.title||'')}"></div><div class="field"><label for="subject">科目</label><input id="subject" name="subject" placeholder="例：数学" list="subjects" required maxlength="40" value="${esc(m?.subject||'')}"><datalist id="subjects"><option>数学</option><option>英語</option><option>国語</option><option>理科</option><option>社会</option><option>資格学習</option></datalist></div><div class="field"><label for="unit">学習の単位</label><select id="unit" name="unit" ${locked?'disabled':''}><option value="page" ${m?.unit==='page'?'selected':''}>ページ</option><option value="question" ${m?.unit==='question'?'selected':''}>問題番号</option></select></div><div class="field"><label for="range-start">開始番号</label><input id="range-start" type="number" name="start" min="1" max="100000" required value="${m?.start||1}" ${locked?'disabled':''}></div><div class="field"><label for="range-end">終了番号</label><input id="range-end" type="number" name="end" min="1" max="100000" required value="${m?.end||100}" ${locked?'disabled':''}></div><div class="field full"><label for="minutes">1ページ・1問あたりの推定時間（分）</label><input id="minutes" type="number" name="minutes" min="0.1" max="1440" step="0.1" required value="${m?.minutesPerUnit||3}" ${locked?'disabled':''}><small>実際にかかりそうな時間の目安です。登録範囲は最大10,000単位。</small></div><div class="field full"><label for="sections">章・節の区切り <span class="muted">任意</span></label><textarea id="sections" name="sections" placeholder="第1節 文字と式, 1, 20&#10;第2節 方程式, 21, 40" ${locked?'disabled':''}>${esc(m?.sections.map(s=>`${s.title}, ${s.start}, ${s.end}`).join('\n')||'')}</textarea><small>1行に「節の名前, 開始番号, 終了番号」。範囲の重複はできません。未指定部分も計画対象になります。</small></div></div>${locked?'<div class="notice" style="margin-top:16px">計画に使用中のため、教材名と科目のみ変更できます。範囲を変える場合は別の教材として登録してください。</div>':''}<div class="error-message" role="alert"></div><div class="form-footer">${m?`<button type="button" class="btn danger" data-action="delete-material" data-id="${esc(id)}">削除</button>`:''}<button type="button" class="btn" data-action="close">キャンセル</button><button type="submit" class="btn primary">${m?'変更を保存':'教材を登録'}</button></div></form>`);
  modal.querySelector('form').onsubmit=async e=>{
    e.preventDefault();try{
      const f=new FormData(e.currentTarget),start=locked?m.start:Number(f.get('start')),end=locked?m.end:Number(f.get('end'));
      if(end<start||end-start>=10000)throw Error('終了番号は開始番号以上、範囲は10,000単位以内にしてください。');
      const title=String(f.get('title')).trim(),subject=String(f.get('subject')).trim();
      if(!title||!subject)throw Error('教材名と科目を入力してください。');
      const sections=locked?m.sections:String(f.get('sections')||'').split('\n').filter(l=>l.trim()).map((l,i)=>{
        const match=l.match(/^(.+)[,，]\s*(\d+)\s*[,，]\s*(\d+)\s*$/);
        if(!match)throw Error(`${i+1}行目：節の名前, 開始番号, 終了番号 の形式にしてください。`);
        return {id:uid(),title:match[1].trim(),start:Number(match[2]),end:Number(match[3])};
      }).sort((a,b)=>a.start-b.start);
      let last=start-1;
      for(const s of sections){if(s.start<start||s.end>end||s.start>s.end||s.start<=last)throw Error('節の範囲が教材の範囲外か、ほかの節と重複しています。');last=s.end;}
      const data={id:m?.id||uid(),title,subject,unit:locked?m.unit:f.get('unit'),start,end,minutesPerUnit:locked?m.minutesPerUnit:Number(f.get('minutes')),sections,color:'#245b48'};
      const next=structuredClone(state);if(m)next.materials[next.materials.findIndex(x=>x.id===id)]=data;else next.materials.push(data);
      if(await commit(next,'教材を保存しました。')){closeDialog();navigate('materials');}
    }catch(err){formError(err.message);}
  };
}
function reserved(){return [...state.tasks,...state.plans.flatMap(p=>p.unscheduled.map(u=>({materialId:u.materialId,start:u.n,end:u.n})))];}
function materialRangeCard(m,materialId,draft){
  const saved=draft?.config.selectedRanges?.find(r=>r.materialId===m.id);
  const start=saved?.start??m.start,end=saved?.end??m.end;
  const checked=draft?draft.selectedIds.includes(m.id):!materialId||m.id===materialId;
  const matching=m.sections.find(sec=>sec.start===start&&sec.end===end);
  const preset=start===m.start&&end===m.end?'all':matching?.id||'custom';
  return `<section class="range-card" data-material-id="${esc(m.id)}"><label class="check-row"><input type="checkbox" name="materials" value="${esc(m.id)}" ${checked?'checked':''}><span>${esc(m.title)}<small>登録範囲 ${esc(rangeText(m,m.start,m.end))}</small></span></label><fieldset class="range-fields" ${checked?'':'disabled'} aria-label="${esc(m.title)}の計画範囲"><div class="field full"><label for="section-${esc(m.id)}">章・節から選択</label><select id="section-${esc(m.id)}" data-range-preset><option value="all" ${preset==='all'?'selected':''}>登録範囲全体</option><option value="custom" ${preset==='custom'?'selected':''}>番号を指定する</option>${m.sections.map(sec=>`<option value="${esc(sec.id)}" ${preset===sec.id?'selected':''}>${esc(sec.title)}（${esc(rangeText(m,sec.start,sec.end))}）</option>`).join('')}</select></div><div class="field"><label for="from-${esc(m.id)}">開始番号（${unitName(m)}）</label><input id="from-${esc(m.id)}" data-range-start name="from-${esc(m.id)}" type="number" min="${m.start}" max="${m.end}" step="1" value="${start}" required></div><div class="field"><label for="to-${esc(m.id)}">終了番号（${unitName(m)}）</label><input id="to-${esc(m.id)}" data-range-end name="to-${esc(m.id)}" type="number" min="${m.start}" max="${m.end}" step="1" value="${end}" required></div></fieldset><p class="range-summary" aria-live="polite"></p></section>`;
}
function updateRangeCard(card){
  const m=material(card.dataset.materialId),checked=card.querySelector('[name="materials"]').checked;
  card.querySelector('fieldset').disabled=!checked;
  const summary=card.querySelector('.range-summary');
  if(!checked){summary.textContent='この教材は今回の計画に含めません。';return;}
  try{
    const start=Number(card.querySelector('[data-range-start]').value),end=Number(card.querySelector('[data-range-end]').value);
    const available=materialUnits(m,reserved(),{start,end}).length;
    summary.textContent=`指定 ${end-start+1}${unitName(m)} → 対象 ${available}${unitName(m)}（計画済み・完了済み ${end-start+1-available}${unitName(m)}を除外）`;
  }catch(error){summary.textContent=error.message;}
}
function planForm(materialId='',replanId='',draft=null){
  const old=state.plans.find(p=>p.id===replanId);
  if(!old&&!state.materials.length){notify('まず教材を登録しましょう。');materialForm();return;}
  const eligible=state.materials.filter(m=>materialUnits(m,reserved()).length>0);
  if(!old&&!eligible.length){notify('すべての学習範囲が計画済みです。既存の計画を組み直すか、教材を追加してください。');navigate('plan');return;}
  const initial=draft?.config||old;
  const start=initial?(initial.startDate>today()?initial.startDate:today()):today();
  openDialog(old?'残りの計画を組み直す':'学習計画をつくる',`<form id="plan-form"><div class="form-grid"><div class="field full"><label for="plan-title">計画の名前</label><input id="plan-title" name="title" required maxlength="100" value="${esc(initial?.title||'わたしの学習計画')}"></div>${!old?`<div class="field full"><span class="field-label">使う教材</span><p class="helper">教材ごとに今回進める範囲を指定します。計画済み・完了済みの部分は除外し、範囲外は次の計画用に残します。</p>${eligible.map(m=>materialRangeCard(m,materialId,draft)).join('')}</div>`:'<div class="field full"><div class="notice good">完了済みの範囲と学習履歴は保持し、残りの範囲だけを再配分します。</div></div>'}<div class="field"><label for="plan-start">開始日</label><input id="plan-start" name="startDate" type="date" min="${today()}" value="${start}" required></div><div class="field"><label for="plan-end">終了日</label><input id="plan-end" name="endDate" type="date" value="${initial&&initial.endDate>=start?initial.endDate:dateAdd(start,13)}" required></div><div class="field full"><span class="field-label">曜日別の学習可能時間（分）</span><div class="days-input">${['日','月','火','水','木','金','土'].map((day,i)=>`<label>${day}<input aria-label="${day}曜日の学習可能時間" type="number" name="day${i}" min="0" max="1440" step="1" value="${initial?.weeklyMinutes[i]??(i===0||i===6?60:30)}" required></label>`).join('')}</div><small>0分は休息日です。他の計画の予定時間も差し引いて配置します。</small></div><div class="field full"><label for="distribution">学習量の配分</label><select id="distribution" name="distribution"><option value="even" ${initial?.distribution==='even'?'selected':''}>均等に進める</option><option value="increase" ${initial?.distribution==='increase'?'selected':''}>少しずつ増やす</option></select><small>節のまとまりを優先し、長い節はページ・問題単位で分割します。複数教材は順番を守りながら並行して進めます。</small></div></div><div class="error-message" role="alert"></div><div class="form-footer"><button type="button" class="btn" data-action="close">キャンセル</button><button type="submit" class="btn primary">${icon('arrow')}計画をプレビュー</button></div></form>`);
  const planFormElement=modal.querySelector('#plan-form');
  planFormElement.querySelectorAll('.range-card').forEach(updateRangeCard);
  planFormElement.onchange=e=>{
    const card=e.target.closest('.range-card');if(!card)return;
    if(e.target.matches('[data-range-preset]')){
      const m=material(card.dataset.materialId),preset=e.target.value;
      const section=preset==='all'?m:m.sections.find(sec=>sec.id===preset);
      if(section){card.querySelector('[data-range-start]').value=section.start;card.querySelector('[data-range-end]').value=section.end;}
    }
    updateRangeCard(card);
  };
  planFormElement.oninput=e=>{
    const card=e.target.closest('.range-card');if(!card)return;
    if(e.target.matches('[data-range-start],[data-range-end]'))card.querySelector('[data-range-preset]').value='custom';
    updateRangeCard(card);
  };
  modal.querySelector('form').onsubmit=e=>{
    e.preventDefault();try{
      const f=new FormData(e.currentTarget);
      const config={title:String(f.get('title')).trim(),startDate:f.get('startDate'),endDate:f.get('endDate'),distribution:f.get('distribution'),weeklyMinutes:Array.from({length:7},(_,i)=>Number(f.get('day'+i)))};
      if(!config.title)throw Error('計画の名前を入力してください。');
      if(!config.weeklyMinutes.some(n=>n>0))throw Error('少なくとも1つの曜日に学習時間を設定してください。');
      let units;
      if(old){if(old.selectedRanges)config.selectedRanges=structuredClone(old.selectedRanges);const ranges=state.tasks.filter(t=>t.planId===old.id).flatMap(remainingRanges);units=[...rangesToUnits(ranges,state.materials),...old.unscheduled];}
      else{
        const ids=f.getAll('materials');if(!ids.length)throw Error('教材を1つ以上選択してください。');
        config.selectedRanges=ids.map(id=>({materialId:id,start:Number(f.get('from-'+id)),end:Number(f.get('to-'+id))}));
        units=config.selectedRanges.flatMap(range=>materialUnits(material(range.materialId),reserved(),range));
      }
      if(!units.length)throw Error(old?'未完了の学習範囲がありません。':'指定範囲はすべて計画済み・完了済みです。別の範囲を指定してください。');
      const reservedMinutes={};
      for(const task of state.tasks){
        const count=old&&task.planId===old.id?task.completed:task.end-task.start+1;
        reservedMinutes[task.date]=(reservedMinutes[task.date]||0)+count*task.minutesPerUnit;
      }
      const result=generate(units,{...config,reservedMinutes});
      preview={config,result,oldId:old?.id,selectedIds:f.getAll('materials'),revision:JSON.stringify(state)};
      previewDialog();
    }catch(err){formError(err.message);}
  };
}
function previewDialog(){
  const p=preview,{result:r,config:c}=p;
  const oldTasks=p.oldId?state.tasks.filter(t=>t.planId===p.oldId):[];
  const oldDates=new Map(oldTasks.flatMap(t=>Array.from({length:remaining(t)},(_,i)=>[`${t.materialId}:${t.start+t.completed+i}`,t.date])));
  const selected=c.selectedRanges;
  const scopeSummary=selected&&!p.oldId?`<div class="scope-summary"><p class="field-label">今回の学習範囲</p>${selected.map(range=>{const m=material(range.materialId),available=materialUnits(m,reserved(),range).length;return `<p>${esc(m.title)} · ${esc(rangeText(m,range.start,range.end))}<br><span class="muted">指定 ${range.end-range.start+1}${unitName(m)} ／ 対象 ${available}${unitName(m)} ／ 重複除外 ${range.end-range.start+1-available}${unitName(m)}</span></p>`;}).join('')}<p class="helper">対象範囲のうち、未配置分もこの計画に保存します。指定範囲外は割り当てません。</p></div>`:'';
  const moved=sum(r.tasks,t=>Array.from({length:t.end-t.start+1},(_,i)=>oldDates.get(`${t.materialId}:${t.start+i}`)!==t.date?1:0).reduce((s,n)=>s+n,0));
  openDialog('計画を確認',`<p class="eyebrow">${esc(c.title)}</p><p class="tiny muted">${shortDate(c.startDate)} 〜 ${shortDate(c.endDate)} · ${p.oldId?'変更を適用するまで、元の計画は変わりません。':'まだ保存されていません。'}</p>${scopeSummary}<div class="preview-stats"><div><strong>${r.tasks.length}</strong>タスク</div><div><strong>${Math.ceil(r.scheduledMinutes)}</strong>分を配置</div><div><strong>${r.unscheduled.length}</strong>単位が未配置</div></div>${p.oldId?`<div class="notice good">${icon('refresh')}<div>未完了範囲のうち${moved}単位の日付を変更・新規配置します。完了済み${sum(oldTasks,'completed')}単位と過去の学習記録は保持します。</div></div>`:''}${r.warnings.map(w=>`<div class="notice">${icon('warn')}<span>${esc(w)}</span></div>`).join('')}<p class="field-label">新しい予定</p><div class="preview-list">${r.tasks.length?r.tasks.map(t=>`<div class="preview-row"><div>${esc(material(t.materialId).title)}<small>${esc(t.title)} · ${esc(rangeText(material(t.materialId),t.start,t.end))}</small></div><span>${shortDate(t.date)}<small>${Math.ceil((t.end-t.start+1)*t.minutesPerUnit)}分</small></span></div>`).join(''):'<p class="helper" style="padding:16px">配置できるタスクがありません。条件を変更してください。</p>'}</div>${r.unscheduled.length?`<details style="margin-top:15px"><summary class="tiny">未配置の学習範囲を確認</summary><div class="preview-list">${[...groupBy(r.unscheduled,u=>u.materialId)].map(([id,us])=>`<p class="tiny" style="padding:10px 0">${esc(material(id).title)}：${us.length}${unitName(material(id))}<br><span class="muted">番号 ${us.map(u=>u.n).join(', ')}</span></p>`).join('')}</div></details>`:''}<div class="error-message" role="alert"></div><div class="form-footer"><button class="btn" data-action="back-plan">条件を変更</button><button class="btn primary" data-action="apply-plan" ${!r.tasks.length?'disabled':''}>${p.oldId?'変更を適用':'この計画を保存'}</button></div>`);
  preview=p;
}
async function applyPlan(){
  if(!preview||busy)return;
  const {config,result,oldId,revision}=preview;
  if(JSON.stringify(state)!==revision){notify('データが更新されました。もう一度プレビューしてください。');closeDialog();return;}
  const next=structuredClone(state),planId=oldId||uid();
  if(oldId){
    next.tasks=next.tasks.filter(t=>t.planId!==oldId||t.completed>0).map(t=>t.planId===oldId?{...t,end:t.start+t.completed-1}:t);
    next.plans[next.plans.findIndex(p=>p.id===oldId)]={id:planId,...config,unscheduled:result.unscheduled};
  }else next.plans.push({id:planId,...config,unscheduled:result.unscheduled});
  next.tasks.push(...result.tasks.map(t=>({...t,id:uid(),planId})));
  if(await commit(next,oldId?'残りの計画を組み直しました。':'学習計画を保存しました。')){closeDialog();planFilter='all';planFocus=planId;navigate('plan');}
}
function recordForm(id){
  const t=state.tasks.find(t=>t.id===id);if(!t)return;const m=material(t.materialId),left=remaining(t);
  if(!left){openDialog('学習を完了しました',`<p>${esc(m.title)} · ${esc(rangeText(m,t.start,t.end))}</p><p class="helper" style="margin-top:10px">この範囲は完了済みです。累計 ${rounded(sum(state.records.filter(r=>r.taskId===id),'minutes'))}分の学習を記録しています。</p><div class="form-footer"><button class="btn primary" data-action="close">閉じる</button></div>`);return;}
  openDialog('できた分を記録しよう',`<p class="eyebrow">${esc(m.subject)}</p><h3>${esc(m.title)}</h3><p class="helper">${esc(t.title)} · 残り ${esc(rangeText(m,t.start+t.completed,t.end))}</p><form id="record-form" style="margin-top:20px"><div class="form-grid"><div class="field"><label for="completed-units">今回できた量（${unitName(m)}）</label><input id="completed-units" type="number" name="units" min="1" max="${left}" step="1" required value="${left}"><small>先頭から順番に完了として記録します。</small></div><div class="field"><label for="actual-minutes">実際の学習時間（分）</label><input id="actual-minutes" type="number" name="minutes" min="0" max="1440" step="0.1" required value="${rounded(Math.min(1440,left*t.minutesPerUnit))}"></div><div class="field full"><label for="record-date">学習した日</label><input id="record-date" name="date" type="date" value="${today()}" max="${today()}" required></div></div><div class="error-message" role="alert"></div><div class="form-footer"><button type="button" class="btn" data-action="close">キャンセル</button><button type="submit" class="btn primary">${icon('check')}学習を記録</button></div></form>`);
  modal.querySelector('form').onsubmit=async e=>{e.preventDefault();try{
    const f=new FormData(e.currentTarget),units=Number(f.get('units')),minutes=Number(f.get('minutes')),date=f.get('date');
    if(!Number.isInteger(units)||units<1||units>left)throw Error('完了した量を、残りの範囲内で指定してください。');
    if(date>today())throw Error('未来の学習は記録できません。');
    const next=structuredClone(state);next.tasks.find(t=>t.id===id).completed+=units;next.records.push({id:uid(),taskId:id,materialId:m.id,date,units,minutes});
    if(await commit(next,units===left?'おつかれさま！タスクを完了しました。':'できた分を記録しました。残りも自分のペースで。')){closeDialog();render();}
  }catch(err){formError(err.message);}};
}
async function addSample(){
  if(state.settings.sampleLoaded){notify('サンプルは追加済みです。');return;}
  const next=structuredClone(state),td=today();
  const math={id:uid(),title:'数学のワークブック',subject:'数学',unit:'question',start:1,end:45,minutesPerUnit:4,color:'#245b48',sections:[{id:uid(),title:'第1節 文字と式',start:1,end:15},{id:uid(),title:'第2節 方程式',start:16,end:30},{id:uid(),title:'第3節 関数',start:31,end:45}]};
  const english={id:uid(),title:'英文法の基礎ノート',subject:'英語',unit:'page',start:1,end:60,minutesPerUnit:2,color:'#245b48',sections:[{id:uid(),title:'第1章 文のしくみ',start:1,end:20},{id:uid(),title:'第2章 時制',start:21,end:40},{id:uid(),title:'第3章 助動詞',start:41,end:60}]};
  next.materials.push(math,english);
  const config={title:'毎日の学びを整える（サンプル）',startDate:dateAdd(td,-2),endDate:dateAdd(td,10),weeklyMinutes:[40,30,30,30,30,30,50],distribution:'even'};
  const result=generate([math,english].flatMap(m=>materialUnits(m)),config),id=uid();
  next.plans.push({id,...config,unscheduled:result.unscheduled});
  result.tasks.forEach(t=>{
    const task={...t,id:uid(),planId:id};
    if(t.date<td){task.completed=t.end-t.start+1;next.records.push({id:uid(),taskId:task.id,materialId:t.materialId,date:t.date,units:task.completed,minutes:task.completed*t.minutesPerUnit});}
    next.tasks.push(task);
  });
  next.settings.sampleLoaded=true;
  if(await commit(next,'サンプルを追加しました。今日のタスクから試してみよう。'))navigate('home');
}
async function exportBackup(){
  const next=structuredClone(state);next.settings.lastBackup=today();
  const blob=new Blob([JSON.stringify(next,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`SteadyStudy-backup-${today()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  if(await commit(next,'バックアップファイルをダウンロードしました。保存先をご確認ください。'))render();
}
async function importFile(file){
  if(!file)return;
  if(file.size>15*1024*1024){notify('バックアップは15MB以下のJSONファイルを選んでください。');return;}
  try{
    const imported=validateState(JSON.parse(await file.text()));
    openDialog('復元内容を確認',`<div class="notice">${icon('warn')}<span>この端末の現在のデータを、下の内容で置き換えます。元のデータが必要な場合は、先にバックアップしてください。</span></div><div class="preview-stats"><div><strong>${imported.materials.length}</strong>教材</div><div><strong>${imported.plans.length}</strong>計画</div><div><strong>${imported.records.length}</strong>学習記録</div></div><p class="helper">ファイル：${esc(file.name)}</p><label class="check-row"><input id="restore-confirm" type="checkbox">現在のデータが置き換わることを確認しました</label><div class="error-message" role="alert"></div><div class="form-footer"><button class="btn" data-action="close">キャンセル</button><button class="btn primary" id="restore-apply" disabled>この内容で復元</button></div>`);
    modal.querySelector('#restore-confirm').onchange=e=>modal.querySelector('#restore-apply').disabled=!e.target.checked;
    modal.querySelector('#restore-apply').onclick=async()=>{if(!modal.querySelector('#restore-confirm').checked)return;if(await commit(imported,'バックアップから復元しました。')){closeDialog();planFocus='';navigate('home');}};
  }catch(e){notify(e instanceof SyntaxError?'JSONファイルを読み取れませんでした。':e.message);}
}
function confirmDelete(kind,id){
  const m=material(id),p=state.plans.find(p=>p.id===id);
  if(kind==='material'&&(state.tasks.some(t=>t.materialId===id)||state.records.some(r=>r.materialId===id)||state.plans.some(p=>p.unscheduled.some(u=>u.materialId===id)))){formError('計画または学習記録に使われている教材は削除できません。先に関連する計画を削除してください。');return;}
  if(kind==='plan'&&state.tasks.some(t=>t.planId===id&&t.completed>0)){notify('学習履歴を守るため、記録済みの計画は削除できません。残りの計画を組み直してください。');return;}
  openDialog(kind==='all'?'すべてのデータを削除':'削除の確認',`<div class="notice">${icon('warn')}<span>${kind==='all'?'このブラウザに保存した教材・計画・学習履歴・設定をすべて削除します。バックアップがない場合は復元できません。':`${esc(kind==='material'?m.title:p.title)}を削除します。${kind==='plan'?'未完了のタスクと未配置の範囲も削除し、教材は残します。':''}`}</span></div>${kind==='all'?'<div class="field"><label for="delete-word">確認のため「削除」と入力してください</label><input id="delete-word" autocomplete="off" placeholder="削除"></div>':''}<div class="form-footer"><button class="btn" data-action="close">キャンセル</button><button class="btn danger" id="delete-apply" ${kind==='all'?'disabled':''}>削除する</button></div>`);
  if(kind==='all')modal.querySelector('#delete-word').oninput=e=>modal.querySelector('#delete-apply').disabled=e.target.value!=='削除';
  modal.querySelector('#delete-apply').onclick=async()=>{
    if(kind==='all'&&modal.querySelector('#delete-word').value!=='削除')return;
    const next=kind==='all'?emptyState():structuredClone(state);
    if(kind==='material')next.materials=next.materials.filter(m=>m.id!==id);
    if(kind==='plan'){next.tasks=next.tasks.filter(t=>t.planId!==id);next.plans=next.plans.filter(p=>p.id!==id);}
    if(await commit(next,'データを削除しました。')){closeDialog();planFocus='';navigate(kind==='all'?'home':kind==='material'?'materials':'plan');}
  };
}
async function updateOfflineStatus(){
  const el=document.querySelector('#offline-status');if(!el)return;
  if(!('serviceWorker'in navigator)){el.textContent='この環境ではオフライン機能を利用できません。HTTPSで開いてください。';return;}
  try{const registration=await navigator.serviceWorker.getRegistration();el.textContent=registration?.active?'オフライン用のアプリを保存済みです。':'オフライン用のファイルを準備しています。初回はオンラインでお待ちください。';}catch{el.textContent='オフライン状態を確認できませんでした。';}
}
async function action(e){
  const b=e.target.closest('[data-action]');if(!b||b.disabled||busy)return;
  const {action:a,id}=b.dataset;
  switch(a){
    case'navigate':navigate(id);break;
    case'go-plan':planFocus='';planFilter='all';navigate('plan');break;
    case'new-material':materialForm();break;
    case'edit-material':materialForm(id);break;
    case'new-plan':planForm(id);break;
    case'replan':planForm('',id);break;
    case'back-plan':{const p=preview;planForm('',p?.oldId,p);break;}
    case'apply-plan':await applyPlan();break;
    case'record':recordForm(id);break;
    case'close':closeDialog();break;
    case'sample':await addSample();break;
    case'filter':planFilter=id;render();break;
    case'focus-plan':planFocus=planFocus===id?'':id;render();break;
    case'theme':case'accent':{const next=structuredClone(state);next.settings[a]=id;if(await commit(next))render();break;}
    case'export':await exportBackup();break;
    case'import':document.querySelector('#import-file').click();break;
    case'clear':confirmDelete('all');break;
    case'delete-plan':confirmDelete('plan',id);break;
    case'delete-material':confirmDelete('material',id);break;
    case'persist':{try{const result=await navigator.storage?.persist?.();notify(result?'永続保存が許可されました。バックアップも忘れずに。':'永続保存は許可されませんでした。通常の保存とバックアップは利用できます。');}catch{notify('この環境では永続保存を申請できません。');}break;}
    case'install':if(deferredInstall){await deferredInstall.prompt();deferredInstall=null;render();}break;
  }
}
document.addEventListener('click',e=>action(e).catch(err=>{console.error(err);notify('操作を完了できませんでした。もう一度お試しください。');}));
document.addEventListener('change',e=>{if(e.target.id==='import-file')importFile(e.target.files[0]);});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;if(page==='settings')render();});
window.addEventListener('online',()=>render());window.addEventListener('offline',()=>render());
document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'&&!busy){try{state=await readState();render();}catch{notify('保存データを再読込できませんでした。');}}});
async function boot(){
  try{
    state=await readState();
    if('BroadcastChannel'in window){saveChannel=new BroadcastChannel('steadystudy-changes');saveChannel.onmessage=async()=>{state=await readState();render();if(modal.open){closeDialog();notify('別のタブで更新されたため、最新データを読み込みました。');}};}
    render();
  }catch(e){app.innerHTML=`<div class="loading"><h1>保存領域を開けませんでした</h1><p>通常モードのブラウザで開き、サイトのデータ保存を許可してください。<br>保存済みのデータは自動で削除しません。</p><p class="error-message">${esc(e.message)}</p><button class="btn" onclick="location.reload()">再読み込み</button></div>`;}
  if('serviceWorker'in navigator&&location.protocol!=='file:'){
    navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(reg=>{updateOfflineStatus();reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='activated'){updateOfflineStatus();}if(worker.state==='installed'&&navigator.serviceWorker.controller)notify('更新版があります。すべてのSteadyStudyタブを閉じ、開き直すと適用されます。');});});}).catch(()=>{const el=document.querySelector('#offline-status');if(el)el.textContent='オフライン準備に失敗しました。オンラインで再読み込みしてください。';});
  }
}
boot();

