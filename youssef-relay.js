/* GameZone IMRANNE: commandes confirmées par pilotage_v1, sans Worker. */
(function(w){'use strict';
const URL_DB='https://game-zone-bah-default-rtdb.europe-west1.firebasedatabase.app',OWNER='nF4ogAQ2w6hbiERueRjQONmoKii1',ROOM='gz_GZ-07732';
const fetchNative=w.fetch.bind(w),pending=new Map();let cfg={},offset=0,confirmedRoot=null,lastRoomRoot=null,cachedPosts=[];
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x)),snap=x=>({val:()=>clone(x)}),sleep=t=>new Promise(r=>setTimeout(r,t));
function uid(){return cfg.uid();}function now(){return Date.now()+offset;}function id(){return crypto.randomUUID()+'_a1';}
const requestTimings=[],operationTimings=[],lockTags=new Map(),lockUntil=new Map(),saleLeases=new WeakMap();let currentTiming=null,physicalRead=null,releaseTail=Promise.resolve();const preparedChecks=new WeakSet(),readinessValidity=new WeakMap();
function phase(text){if(!currentTiming)return;currentTiming.phase=text;currentTiming.steps.push({text,ms:Date.now()-currentTiming.started});showPhase();}
function showPhase(){const el=document.getElementById('y-action-progress');if(el&&currentTiming){el.hidden=false;el.textContent=currentTiming.phase+' — '+Math.floor((Date.now()-currentTiming.started)/1000)+' s';}}
function beginTiming(label){if(!document.getElementById('y-action-progress')&&typeof document.createElement==='function'){const el=document.createElement('div');el.id='y-action-progress';el.setAttribute('role','status');el.style.cssText='position:fixed;top:0;left:0;right:0;z-index:100000;background:#3b245b;color:#fff;padding:12px;text-align:center;font:14px system-ui;pointer-events:none';document.body.append(el);}const item={label,started:Date.now(),phase:'Vérification de la connexion',steps:[],from:requestTimings.length};currentTiming=item;item.timer=setInterval(showPhase,1000);return item;}
function endTiming(item){if(!item)return;clearInterval(item.timer);const report={label:item.label,totalMs:Date.now()-item.started,steps:item.steps,requests:requestTimings.slice(item.from).map(x=>({...x}))};operationTimings.push(report);if(operationTimings.length>8)operationTimings.shift();if(currentTiming===item){currentTiming=null;const status=document.getElementById('y-action-progress');if(status)status.hidden=true;}const el=document.getElementById('imranne-latency-summary');if(el){el.textContent='Dernier délai : '+(report.totalMs/1000).toFixed(1)+' s · DÉTAILS';el.hidden=false;}if(physicalViewDirty)notifyPhysical();return report;}
function diagnosticsBusy(){return currentTiming!==null;}
function diagnostics(){return clone(operationTimings);}
function timingKind(path){if(path.includes('operation_lock'))return 'Verrou';if(path.startsWith('pilotage_v1/commands'))return 'Commande';if(path.startsWith('pilotage_v1/states'))return 'État prise';if(path==='pilotage_v1/heartbeat')return 'Relais';return 'Gestion';}
function diagnosticsPanel(){document.getElementById('imranne-latency-panel')?.remove();if(typeof document.createElement!=='function')return;const box=document.createElement('div');box.id='imranne-latency-panel';box.style.cssText='position:fixed;inset:6vh 12px;z-index:2147483647;overflow:auto;background:#181126;color:#fff;border:1px solid #9b78c6;border-radius:12px;padding:20px;font:14px system-ui';const close=document.createElement('button');close.textContent='FERMER';close.onclick=()=>box.remove();box.append(close);const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';pre.textContent=operationTimings.map(r=>r.label+' : '+(r.totalMs/1000).toFixed(1)+' s\n'+r.steps.map(s=>(s.ms/1000).toFixed(1)+' s · '+s.text).join('\n')+'\nRequêtes :\n'+r.requests.map(q=>q.kind+' '+q.method+' : '+(q.totalMs/1000).toFixed(1)+' s (connexion '+(q.authMs/1000).toFixed(1)+', réseau '+(q.networkMs/1000).toFixed(1)+', réponse '+(q.bodyMs/1000).toFixed(1)+') '+(q.ok?'OK':'ÉCHEC')).join('\n')).join('\n\n')||'Aucune action mesurée. Les mesures restent sur ce téléphone, sans mot de passe ni clé.';box.append(pre);document.body.append(box);}
async function request(path,method='GET',data,headers={},retried=false,deadline=Date.now()+8000){
 if(typeof path!=='string'||!(path===ROOM||path.startsWith(ROOM+'/')||path==='pilotage_v1'||path.startsWith('pilotage_v1/'))||path.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Chemin extérieur à cette salle');
 if(path===ROOM&&method==='GET'&&uid()!==OWNER)return {data:syncPhysicalRoot(applyAuto(await managerSnapshot())),etag:null,date:null};
 const started=Date.now(),ctrl=new AbortController();let timer,authMs=0,networkMs=0,bodyMs=0,ok=false,timingStage="auth",timingAt=started;
 const deadlineError=()=>Object.assign(Error('Réseau trop lent : vérifier la connexion et le détail du délai.'),{name:'AbortError'});
 const cutoff=new Promise((_,reject)=>{timer=setTimeout(()=>{ctrl.abort();reject(deadlineError());},Math.max(1,deadline-Date.now()));});
 const bounded=promise=>Promise.race([promise,cutoff]);
 try{
  let stage=Date.now();const token=await bounded(cfg.token(retried));authMs=Date.now()-stage;
  if(!token)throw Error('Connexion Firebase requise');if(ctrl.signal.aborted||Date.now()>=deadline)throw deadlineError();
  const encoded=path.split('/').map(encodeURIComponent).join('/');stage=Date.now();timingStage='network';timingAt=stage;
  const r=await bounded(fetchNative(URL_DB+'/'+encoded+'.json?auth='+encodeURIComponent(token),{method,signal:ctrl.signal,cache:'no-store',headers:{...(method==='GET'?{}:{'Content-Type':'application/json'}),...headers},...(method==='GET'?{}:{body:JSON.stringify(data)})}));networkMs=Date.now()-stage;
  if(r.status===401&&!retried){timingStage='retry';return await bounded(request(path,method,data,headers,true,deadline));}
  if(!r.ok)throw Error('Firebase '+r.status+' : accès refusé à cette opération.');stage=Date.now();timingStage='body';timingAt=stage;
  let result=await bounded(r.json());bodyMs=Date.now()-stage;timingStage="done";
  if(method==='GET'&&/^pilotage_v1\/states\/[1-8]$/.test(path)&&result&&typeof result==='object'){physicalRows[path.split('/').pop()]=result;physicalAt=Date.now();renderPhysical();notifyPhysical();}
  if(path===ROOM+'/postes'&&Array.isArray(result))cachedPosts=result;if(path===ROOM&&method==='GET'&&Array.isArray(result?.postes))cachedPosts=result.postes;
  if(path===ROOM&&method==='GET')result=acceptSnapshot(syncPhysicalRoot(applyAuto(result)));ok=true;
  return {data:result,etag:r.headers.get('ETag'),date:r.headers.get('Date')};
 }catch(e){if(e.name==='AbortError')throw deadlineError();throw e;}
 finally{clearTimeout(timer);if(timingStage==='auth')authMs=Date.now()-timingAt;else if(timingStage==='network')networkMs=Date.now()-timingAt;else if(timingStage==='body')bodyMs=Date.now()-timingAt;requestTimings.push({kind:timingKind(path),method,authMs,networkMs,bodyMs,totalMs:Date.now()-started,ok});if(!currentTiming&&requestTimings.length>100)requestTimings.splice(0,requestTimings.length-100);}
}
async function states(){const rows=(await request('pilotage_v1/states')).data||{};physicalRows=rows;physicalAt=Date.now();renderPhysical();notifyPhysical();return rows;}
const IMRANNE_POST_MAP={};
// Device identities stay in authenticated Firebase data, outside public sources.
const IMRANNE_DEVICE_MAP={};
function poste(p){const label=String(p?.num||p||''),row=(p&&typeof p==='object'&&p.relayPoste!=null)?p:(cachedPosts.find(x=>x?.num===label)||p),explicit=row?.relayPoste!=null&&String(row.relayPoste).trim()!=='',device=String(row?.devid||''),relay=device.match(/^relay:([1-8])$/),n=explicit?Number(row.relayPoste):relay?Number(relay[1]):IMRANNE_DEVICE_MAP[device]||IMRANNE_POST_MAP[label]||({'poste 4 ps5':4,'poste 4 ps3':4})[label.toLowerCase()];if(!Number.isInteger(n)||n<1||n>8)throw Error('Choisis la prise du relais : Poste 1 à Poste 8');return String(n);}
function isBound(p){try{poste(p);return true;}catch(_){return false;}}
function displayEntries(posts){const order=({p,i})=>{const match=String(p.displayName||p.num||'').match(/\d+/);return match?Number(match[0]):1000+i;};return (posts||[]).map((p,i)=>({p,i})).filter(({p})=>p&&typeof p==='object').sort((a,b)=>order(a)-order(b)||a.i-b.i);}

function samePlug(a,b){try{return poste(a)===poste(b);}catch(_){return !!a?.devid&&a.devid===b?.devid;}}
function bindingGuard(root,p){const n=poste(p);for(const {p:other,i}of (root.postes||[]).map((p,i)=>({p,i}))){if(!other||other.num===p.num||!samePlug(p,other))continue;const a=root.active_by_poste?.[encodeURIComponent(other.num)]||root.active_postes?.[i]||{};if(a.actif||a.starting||a.cleanup)throw Error('Cette prise est déjà utilisée par '+displayName(other));}return n;}
async function checkAssociation(root,index,n){
 if(uid()!==OWNER)throw Error('Association réservée au Patron');
 n=Number(n);if(!Number.isInteger(n)||n<1||n>8)throw Error('Choisis Poste 1 à Poste 8');
 const h=(await request('pilotage_v1/heartbeat')).data;if(!h?.capabilities?.includes('poste-association-v1'))throw Error('Installe le relais IMRANNE 1.9 avant de changer cette association');
 const p=root.postes?.[index],a=p&&(root.active_by_poste?.[encodeURIComponent(p.num)]||root.active_postes?.[index])||{};
 if(a.actif||a.starting||a.cleanup)throw Error('Termine la séance avant de changer la prise associée');
 let old;try{old=poste(p);}catch(_){}const states=(await request('pilotage_v1/states')).data||{};
 for(const target of new Set([old,String(n)].filter(Boolean))){const st=states[target];if(!st?.online||now()-st.seenAt>15000||st.seenAt>now()+5000||st.power!==false||st.nativeSeconds!==0||Number(st.remaining)!==0)throw Error('Poste '+target+' : la prise doit être joignable, éteinte et sans temps restant');const waiting=(await request('pilotage_v1/commands/'+target)).data;if(waiting?.expiresAt>now()&&waiting.id!==st.result?.id)throw Error('Poste '+target+' : une commande attend confirmation');}
 bindingGuard(root,{...p,relayPoste:n});return n;
}


// Preserve Firebase indices and historical rows; show only the 8 mapped controls.
function entries(posts){return (posts||[]).map((p,i)=>({p,i})).filter(({p})=>{try{poste(p);return true;}catch(_){return false;}}).sort((a,b)=>Number(poste(a.p))-Number(poste(b.p))||a.i-b.i);}
function displayName(p){const custom=String(p?.displayName||'').trim();if(custom)return custom;const n=IMRANNE_POST_MAP[p?.num];return n?'Poste '+n:String(p?.num||'Poste');}
let physicalRows={},physicalAt=0,physicalPoll=null;
function physicalSummary(){const on=[],unknown=[];for(let n=1;n<=8;n++){const row=physicalRows[n];if(!row?.online||now()-row.seenAt>30000){unknown.push(n);continue;}if(row.power===true)on.push(n);else if(row.power!==false)unknown.push(n);}return {on,unknown,count:unknown.length?'—':on.length,text:unknown.length?'État à vérifier : poste(s) '+unknown.join(', '):(on.length?'Prises allumées : '+on.map(n=>'Poste '+n).join(', '):'Les 8 prises sont éteintes')};}
function physicalStatus(p){let n;try{n=poste(p);}catch(_){return 'Association à vérifier';}const s=physicalRows[n],age=s?now()-Number(s.seenAt):Infinity;if(!s?.online||age>15000||age< -5000)return 'Prise injoignable : chrono estimé, synchronisation au retour du réseau.';return s.power===false?'Prise OFF confirmée':s.power===true?'Prise ON confirmée':'État électrique inconnu';}
function renderPhysical(){const s=physicalSummary();for(const key of ['od-prises','or-plugs','s-prises','r-prises']){const el=document.getElementById(key);if(el)el.textContent=s.count;}for(const key of ['od-prises-list','s-prises-list']){const el=document.getElementById(key);if(el)el.textContent=s.text;}}
let physicalViewDirty=false;function notifyPhysical(){if(currentTiming||activeTransactions){physicalViewDirty=true;return;}physicalViewDirty=false;if(typeof w.dispatchEvent==='function'&&typeof CustomEvent==='function')w.dispatchEvent(new CustomEvent('imranne-physical-update'));}
async function refreshPhysical(){if(activeTransactions||currentTiming||physicalRead)return;physicalRead=states();try{await physicalRead;}catch(_){renderPhysical();}finally{physicalRead=null;}}

function applyPause(state,marker){if(marker?.reason==='prise_injoignable')return state;if(!state?.actif||state.paused||!marker||marker.sessionId!==state.sessionId)return state;if(state.nativeCommandId&&marker.nativeId!==state.nativeCommandId)return state;if(Number(marker.at)<Number(state.startedAt||0))return state;const remaining=Number(marker.remaining);if(!Number.isInteger(remaining)||remaining<0||remaining>86400)return state;return {...state,paused:true,pauseRemainingSec:remaining,finTs:0,pausePowerOffConfirmed:marker.powerConfirmed===true,pauseReason:marker.reason,autoPausedAt:marker.at};}
function applyAuto(root){if(!root||typeof root!=='object')return root;const next=clone(root);for(const [key,state]of Object.entries(next.active_by_poste||{})){next.active_by_poste[key]=applyPause(state,next.auto_pauses?.[key]);const st=next.active_by_poste[key],receipt=next.pause_results?.[key];if(st.pendingPauseId){st.pausePowerOffConfirmed=receipt?.id===st.pendingPauseId&&receipt?.sessionId===st.sessionId&&receipt?.powerConfirmed===true;st.pausePending=!st.pausePowerOffConfirmed;}}return next;}
function remaining(s){return !s?.actif?0:s.paused?Math.max(0,Math.floor(s.pauseRemainingSec||0)):Math.max(0,Math.ceil(((s.finTs||0)-Date.now())/1000));}
function transientReadError(e){return !/Firebase (401|403)|Connexion Firebase requise/.test(String(e?.message||e));}
async function ready(p){
 const n=poste(p);
 // Independent checks share the same network round trip.
 const first=request('pilotage_v1/states/'+n).then(r=>({state:r.data})).catch(error=>({error}));
 const h=await request('pilotage_v1/heartbeat');
 if(h.date)offset=new Date(h.date).getTime()-Date.now();
 if(!h.data?.capabilities?.includes('command-receipts-v2'))throw Error('Mise à jour du relais IMRANNE requise.');
 if(!h.data?.at||now()-h.data.at>45000)throw Error('Relais OPPO non disponible');
 // Wait for a fresh confirmed reading. This preflight sends no plug command.
 const until=Date.now()+8000;let initial=await first;
 do{
  try{if(initial?.error)throw initial.error;const st=(initial?initial.state:(await request('pilotage_v1/states/'+n)).data)||{};initial=null;
   const age=now()-Number(st.seenAt||0);
   if(st.online===true&&age>=-5000&&age<=30000){readinessValidity.set(st,Math.min(Number(h.data.at)+45000,Number(st.seenAt)+30000));return st;}
  }catch(e){initial=null;if(!transientReadError(e))throw e;}
  if(Date.now()>=until)break;await sleep(400);
 }while(Date.now()<until);
 throw Error('Prise du poste '+n+' non joignable après vérification. Vérifie son Wi-Fi et son adresse IP dans le relais.');
}
// A short-lived authenticated SDK listener receives the physical receipt as
// soon as Firebase publishes it. No background speech and no second command.
// REST remains a fallback for browsers without the SDK.
function receiptSubscription(n,c){
 const user=w.firebase?.auth?.().currentUser;
 if(!user||user.uid!==uid()||!w.firebase?.database)return null;
 let ref;try{ref=w.firebase.database().ref('pilotage_v1/states/'+n);}catch(_){return null;}
 let done=false,timer,handler,cancel,stop;
 const promise=new Promise((resolve,reject)=>{
  stop=(error,row)=>{if(done)return;done=true;clearTimeout(timer);ref.off('value',handler);error?reject(error):resolve(row);};
  handler=snapshot=>{const row=snapshot.val();if(row?.result?.id!==c.id)return;
   if(!row.result.ok){stop(Error(row.result.message||'Commande refusée par le relais'));return;}
   const age=now()-Number(row.seenAt||0);
   if(row.online===true&&age>=-5000&&age<=30000)stop(null,row);
  };
  cancel=()=>stop(Error('Écoute Firebase interrompue : contrôler la prise avant de répéter.'));
  timer=setTimeout(()=>stop(Error('Délai dépassé : vérifier la prise avant une nouvelle tentative.')),Math.max(1,c.expiresAt+1500-now()));
  try{ref.on('value',handler,cancel);}catch(error){stop(error);}
 });
 // Attach rejection handling before PUT; a denied listener must not leak an
 // unhandled rejection while the command write is still awaiting its response.
 promise.catch(()=>{});
 return {promise,close:()=>stop(Error('Attente de commande terminée'))};
}
// Read-only preflight can overlap the fresh business snapshot after taking
// the lock. Only checks issued here and still recent may be reused.
function prepareCommand(p){const n=poste(p),promise=Promise.all([ready(p),request('pilotage_v1/commands/'+n)]).then(([before,waiting])=>{const check={n,before,waiting,at:Date.now()};preparedChecks.add(check);return check;});promise.catch(()=>{});return {n,promise};}
async function command(p,action,seconds=0,operationId,prepared){
 const n=poste(p);if(pending.has(n))throw Error('Une commande est déjà en cours pour ce poste.');
 pending.set(n,{reserving:true});let subscription=null;
 try{
  const usePrepared=preparedChecks.has(prepared)&&prepared.n===n&&Date.now()-prepared.at>=0&&Date.now()-prepared.at<=5000&&now()<=Number(readinessValidity.get(prepared.before)||0)&&['start','pause','resume'].includes(action);if(usePrepared)preparedChecks.delete(prepared);const [before,waiting]=usePrepared?[prepared.before,prepared.waiting]:await Promise.all([ready(p),request('pilotage_v1/commands/'+n)]);
  const c={id:operationId?(String(operationId).endsWith('_a1')?operationId:operationId+'_a1'):id(),by:uid(),action,seconds,createdAt:Math.round(now()),expiresAt:Math.round(now()+20000)};
  const previousCredit=before.mode==='actif'?Math.max(0,Math.ceil((before.deadline-now())/1000)):Number(before.remaining)||0;
  pending.set(n,c);
  if(before.result?.id===c.id){if(!before.result.ok)throw Error(before.result.message||'Commande refusée');return before;}
  const old=waiting.data;if(old?.expiresAt>now()&&before?.result?.id!==old.id)throw Error('Une autre commande attend confirmation.');
  phase('Envoi de la commande à la prise');subscription=receiptSubscription(n,c);
  await request('pilotage_v1/commands/'+n,'PUT',c);phase('Commande envoyée — attente de confirmation du relais');
  for(let i=0;i<100;i++){
   let s;
   try{s=subscription?await subscription.promise:(await request('pilotage_v1/states/'+n)).data;}
   catch(e){if(subscription||!transientReadError(e))throw e;if(now()>c.expiresAt+1500)break;await sleep(600);continue;}
   if(s?.result?.id===c.id){
    if(!s.result.ok)throw Error(s.result.message||'Commande refusée par le relais');
    if(!s.online||now()-s.seenAt>30000){
     if(now()>c.expiresAt+1500)break;
     await sleep(300);continue;
    }
    if(action==='subtract'){
     const ceiling=Math.max(0,previousCredit-seconds)+2;
     if(previousCredit<=seconds&&s.power!==false)throw Error('Extinction après réduction à zéro non confirmée.');
     if(Number(s.remaining)>ceiling||(s.mode==='actif'&&Number(s.nativeSeconds)>ceiling))throw Error('Réduction non confirmée par la prise : vérifier son minuteur.');
    }
    phase('Prise confirmée — enregistrement de la session');return s;
   }
   if(now()>c.expiresAt+1500)break;await sleep(600);
  }
  throw Error('Délai dépassé : vérifier la prise avant une nouvelle tentative.');
 }finally{subscription?.close();pending.delete(n);}
}
function plan(old,next){const ops=[];for(let i=0;i<(next.postes||[]).length;i++){const p=next.postes[i];if(!p)continue;const k=encodeURIComponent(p.num),a=old.active_by_poste?.[k]||old.active_postes?.[i]||{},b=next.active_by_poste?.[k]||next.active_postes?.[i]||{};if(JSON.stringify(a)===JSON.stringify(b))continue;let action='',seconds=0;if(b.actif&&!a.actif){action='start';seconds=remaining(b);}else if(a.actif&&!b.actif)action='off';else if(a.actif&&b.actif){if(!a.paused&&b.paused)action='pause';else if(a.paused&&!b.paused)action='resume';else{const delta=b.paused?Number(b.pauseRemainingSec||0)-Number(a.pauseRemainingSec||0):Math.round((Number(b.finTs||0)-Number(a.finTs||0))/1000);if(delta>0){action='add';seconds=delta;}else if(delta<0){action='subtract';seconds=-delta;}}}if(action)ops.push({p,k,b,action,seconds});}return ops;}
async function acquire(){
 await releaseTail;phase('Vérification du verrou de gestion');const key=id(),path=ROOM+'/operation_lock';
 const take=async tag=>{const until=now()+90000,saved=await request(path,'PUT',{id:key,by:uid(),until},{'if-match':tag,'X-Firebase-ETag':'true'});if(saved.etag)lockTags.set(key,saved.etag);lockUntil.set(key,until);return key;};
 // Firebase accepts this write only while the lock is null. A competing
 // phone causes 412, then the existing expiry/ETag path handles contention.
 try{return await take('null_etag');}catch(e){if(!/Firebase 412/.test(e.message))throw e;}
 for(let i=0;i<8;i++){const got=await request(path,'GET',null,{'X-Firebase-ETag':'true'});if(!got.data||got.data.until<now()){try{return await take(got.etag);}catch(e){if(i===7||!/Firebase 412/.test(e.message))throw e;}}await sleep(300);}
 throw Error('Une opération est en cours sur un autre appareil. Réessaie.');
}
async function release(key,report=true){if(report)phase('Libération du verrou de gestion');const tag=lockTags.get(key);lockTags.delete(key);lockUntil.delete(key);try{if(tag){await request(ROOM+'/operation_lock','DELETE',null,{'if-match':tag});return;}const g=await request(ROOM+'/operation_lock','GET',null,{'X-Firebase-ETag':'true'});if(g.data?.id===key)await request(ROOM+'/operation_lock','DELETE',null,{'if-match':g.etag});}catch(e){console.warn('Libération verrou :',e.message);}}

// Business writes and physical receipts are already acknowledged before this
// cleanup. A subsequent command still waits for the conditional release.
function releaseAfterConfirmation(key){releaseTail=release(key,false);}

// Only an explicitly supplied, locally issued lease may span the two sale
// transactions. Other tabs/actions keep using the same conditional lock.
async function acquireSaleLease(){const key=await acquire(),lease=Object.freeze({});saleLeases.set(lease,{key,by:uid(),until:lockUntil.get(key)});return lease;}
function saleLease(lease,margin=10000){const record=saleLeases.get(lease);if(!record||record.by!==uid()||!Number.isFinite(record.until)||record.until<=now()+margin)throw Error('Réservation de gestion expirée : vérifier le poste avant de recommencer.');return record;}
async function releaseSaleLease(lease){const record=saleLeases.get(lease);if(!record)return;saleLeases.delete(lease);await release(record.key);}

function isExpiredClosure(old,next,op){
 if(op.action!=='off')return false;
 const i=(old.postes||[]).findIndex(p=>p?.num===op.p.num),a=old.active_by_poste?.[op.k]||old.active_postes?.[i]||{},sid=a.sessionId;
 const record=next.closed_sessions?.[sid];
 const elapsed=a.paused?Number(a.pauseRemainingSec)===0:Number.isFinite(Number(a.finTs))&&Number(a.finTs)>0&&Number(a.finTs)<=now();
 return !!sid&&a.actif===true&&elapsed&&['terminee_auto','bonus_termine'].includes(record?.status)&&record.poste===op.p.num&&op.b.actif===false;
}

// Fresh operational reads only: historical journals and reports never enter
// the command path. Keep the full local report when returning a partial result.
async function controlSnapshot(mode='command',options={}){
 const day=dayKey(new Date(now())),fields=['postes','active_by_poste','active_postes','auto_pauses','businessRevision',...(mode==='manualPause'?['pause_requests']:mode==='bank'?['saved_time','saved_time_intents']:mode==='sale'?['sessions']:['pause','bonus'].includes(mode)?[]:mode==='bonusCancel'?['sessions','annulations']:mode==='finishTime'?['sessions']:[])];
 if(mode==='bonusCancel'){const sid=String(options.cancelSessionId||'');if(!sid||sid.length>160||/[.#$\[\]\/\x00-\x1f]/.test(sid))throw Error('Séance bonus invalide');fields.push('refunded_sessions/'+sid,'closed_sessions/'+sid);}
 // Read one current operation receipt; Gerant cannot read the full journal.
 if(options.operationId){const op=String(options.operationId);if(!/^[A-Za-z0-9_-]{16,80}$/.test(op))throw Error('Identifiant d’opération invalide');fields.push('operation_results/'+op);}
 if(mode==='finishTime'){const sid=String(options.closedSessionId||'');if(!sid||sid.length>160||/[.#$\[\]\/\x00-\x1f]/.test(sid))throw Error('Séance invalide');fields.push('closed_sessions/'+sid);}
 const values=await Promise.all(fields.map(async path=>[path,(await request(ROOM+'/'+path)).data]));
 if(day!==dayKey(new Date(now())))throw Error('Changement de journée : actualiser avant de commander.');
 // An empty day map makes leafPatch write daily/<today>, never daily itself.
 // Current counters come from fresh sessions, not yesterday or a cached report.
 const root={daily:{}};for(const [path,value]of values){const parts=path.split('/');if(parts.length===2){root[parts[0]]=root[parts[0]]||{};root[parts[0]][parts[1]]=value;}else root[path]=value;}
 if(Object.values(root.active_by_poste||{}).some(a=>a?.pendingPauseId))root.pause_results=(await request(ROOM+'/pause_results')).data;
 return syncPhysicalRoot(applyAuto(root));
}
function controlResult(root){const base=clone(lastRoomRoot||confirmedRoot||{}),next={...base,...clone(root)};next.daily={...(base.daily||{}),...(root.daily||{})};if(root.closed_sessions)next.closed_sessions={...(base.closed_sessions||{}),...root.closed_sessions};if(root.refunded_sessions)next.refunded_sessions={...(base.refunded_sessions||{}),...root.refunded_sessions};return next;}

// Gym changes read only fresh operational/accounting data, under the same lock.
async function gymSnapshot(spec){
 if(!spec||!['start','pause','resume','add','cancel','finish'].includes(spec.kind))throw Error('Action gymnastique invalide');
 if(spec.kind==='cancel'&&uid()!==OWNER)throw Error('Annulation gymnastique réservée au Patron');
 const fields=['gym','sessions','businessRevision',...(spec.kind==='cancel'?['annulations']:[])];
 const values=await Promise.all(fields.map(async path=>[path,(await request(ROOM+'/'+path)).data]));
 const root={daily:{}};for(const [path,value]of values)root[path]=value;
 if(spec.kind!=='start'){
  const sid=String(spec.sessionId||'');
  if(!/^GYM-[A-Za-z0-9-]{8,70}$/.test(sid)||root.gym?.sessionId!==sid||!root.gym?.actif||
     (spec.updatedAt!=null&&Number(root.gym.updatedAt||0)!==Number(spec.updatedAt)))throw Error('Séance Gym modifiée : actualise avant de réessayer.');
  if(spec.kind==='cancel')root.refunded_sessions={[sid]:(await request(ROOM+'/refunded_sessions/'+sid)).data};
 }
 return root;
}

// Relay 2.4 only releases an orphaned OFF credit after a durable, fresh
// reservation under this author's operation lock. Keep the usual free start fast.
async function reserveOrphanStart(old,op,prepared,key){
 const before=prepared.before,waiting=prepared.waiting?.data;if(!['pause','coupure'].includes(before.mode)||Number(before.remaining)<=0)return;
 if(waiting?.expiresAt>now()&&before.result?.id!==waiting.id)throw Error('Une autre commande attend confirmation.');
 if(before.power!==false||before.nativeSeconds!==0)throw Error('Ancien minuteur à vérifier avant une nouvelle séance.');
 const a=activeRow(old,op.p);if(a.actif||a.starting&&a.sessionId!==op.b.sessionId)throw Error('Une séance utilise déjà cette prise.');
 if(a.starting===true&&a.actif===false&&a.sessionId===op.b.sessionId&&a.startingUntil>now()+5000&&a.updatedAt>=now()-30000)return;
 const reserved={...a,actif:false,starting:true,startingUntil:now()+45000,sessionId:op.b.sessionId,client:op.b.client||'',updatedAt:now(),relayPoste:Number(poste(op.p))},revision=(Number(old.businessRevision)||0)+1;
 const patch={['active_by_poste/'+op.k]:reserved,businessRevision:revision},index=(old.postes||[]).findIndex(p=>p?.num===op.p.num);if(index>=0)patch['active_postes/'+index]=reserved;
 phase('Réservation du poste — ancien crédit en pause');await request(ROOM,'PATCH',patch);old.businessRevision=revision;
 const visible=clone(old);setActive(visible,op.p,reserved);confirmedRoot=controlResult(visible);lastRoomRoot=clone(confirmedRoot);
}

let activeTransactions=0;
async function transaction(fn,options={}){activeTransactions++;try{return await transactionLocked(fn,options);}finally{activeTransactions--;}}
async function transactionLocked(fn,options={}){const borrowed=options.saleLease!=null;const key=borrowed?saleLease(options.saleLease).key:await acquire();let ops=[],confirmed=[];try{const preparation=options.preparedCommand||(options.control&&options.preflightPoste?prepareCommand(options.preflightPoste):null);phase('Lecture de la session et de la recette');const startedDay=dayKey(new Date(now())),old=options.gym?await gymSnapshot(options.gym):options.control?await controlSnapshot(options.control,options):(await request(ROOM,'GET',null,{'X-GZ-Fresh':'1'})).data||{},next=fn(clone(old));if(next===undefined)return {committed:false,snapshot:snap(options.control||options.gym?controlResult(old):old)};for(const p of next.postes||[]){const k=encodeURIComponent(p.num),a=old.active_by_poste?.[k],b=next.active_by_poste?.[k];if(b&&(b.actif||b.starting)&&JSON.stringify(a)!==JSON.stringify(b))setActive(next,p,{...b,relayPoste:Number(poste(p))});}ops=options.gym||options.deferPause?[]:plan(old,next).filter(op=>!isExpiredClosure(old,next,op));for(const op of ops){if(op.action==='start')bindingGuard(old,op.p);const previous=old.active_by_poste?.[op.k];if(previous?.pendingPauseId){const ack=old.pause_results?.[op.k];if(ack?.id!==previous.pendingPauseId||ack?.powerConfirmed!==true)throw Error('Pause en attente : extinction à confirmer avant toute autre commande.');}}if(ops.length>1)throw Error('Commande les postes un par un pour confirmer chaque prise.');for(const op of ops){if(op.action==='off'&&options?.reduceSeconds){op.action='subtract';op.seconds=options.reduceSeconds;}if(options.saveTime){op.action='save';op.commandId=next.saved_time_intents[options.saveTime.id].commandId;}if(options.restoreTime)op.commandId=next.saved_time[options.restoreTime.id].restoreCommandId;let s;if(op.action==='off'&&uid()!==OWNER){const st=(await states())[poste(op.p)];if(!st?.online||st.power!==false||st.nativeSeconds!==0||now()-st.seenAt>30000)throw Error('OFF TV et annulation réservés au Patron.');s=st;}else{if(borrowed)saleLease(options.saleLease,35000);let prepared=preparation&&preparation.n===poste(op.p)?await preparation.promise:null;if(op.action==='start'){if(!prepared)prepared=await prepareCommand(op.p).promise;await reserveOrphanStart(old,op,prepared,key);}s=await command(op.p,op.action,op.seconds,op.commandId,prepared);}if(options.saveTime){const credit=s.result?.savedSeconds;if(!Number.isInteger(credit)||credit<=0)throw Error('Crédit sauvegardé non confirmé par la prise');next.saved_time[options.saveTime.id].remainingSeconds=credit;}confirmed.push(op);const b=op.b;b.nativeCommandId=s.result?.id||'';delete b.pendingPauseId;delete b.pausePending;if(b.actif){if(['pause','coupure'].includes(s.mode)){b.paused=true;b.pauseRemainingSec=s.remaining;b.finTs=0;b.pausePowerOffConfirmed=s.power===false;}else if(s.mode==='actif'){b.paused=false;b.pauseRemainingSec=0;b.finTs=s.deadline;}else{b.actif=false;b.paused=false;b.finTs=0;b.pauseRemainingSec=0;}}b.updatedAt=Date.now();}
for(const [id,r]of Object.entries(next.operation_results||{})){if(!old.operation_results?.[id]){r.state=clone(next.active_by_poste?.[r.poste]);r.dayStart=dayStart();}}stampDay(next);const changed=leafPatch(old,next);if(options.gym){const day='daily/'+startedDay,refund='refunded_sessions/'+String(options.gym.sessionId||'');for(const path of Object.keys(changed)){if(!(path==='gym'||path.startsWith('gym/')||path==='sessions'||path.startsWith('sessions/')||path===day||path.startsWith(day+'/')||(options.gym.kind==='cancel'&&(path==='annulations'||path.startsWith('annulations/')||path===refund||path.startsWith(refund+'/')))))throw Error('Modification hors gymnastique refusée');}}if(!Object.keys(changed).length)return {committed:false,snapshot:snap(old)};next.businessRevision=(Number(old.businessRevision)||0)+1;changed.businessRevision=next.businessRevision;if(borrowed)saleLease(options.saleLease);if((options.control||options.gym)&&startedDay!==dayKey(new Date(now())))throw Error('Changement de journée pendant la commande : contrôler le rapport.');phase('Enregistrement de la session et de la recette');await request(ROOM,'PATCH',changed);confirmedRoot=options.control||options.gym?controlResult(next):clone(next);lastRoomRoot=clone(confirmedRoot);return {committed:true,snapshot:snap(confirmedRoot)};
}catch(e){if(ops.length){try{await request(ROOM+'/operation_incidents/'+key,'PUT',{at:now(),by:uid(),postes:ops.map(x=>poste(x.p)),message:confirmed.length?'Commande prise confirmée, enregistrement de gestion non confirmé : contrôler le rapport.':'Commande non confirmée : contrôler prise et rapport avant de répéter une vente.'});}catch(_){}e.message+=' — Contrôler le poste et le rapport avant de refaire une vente.';}throw e;}finally{if(!borrowed){if(options.gym||(options.control&&confirmed.length))releaseAfterConfirmation(key);else await release(key);}}}
function child(path){return {child:k=>child(path+'/'+k),set:async v=>request(path,'PUT',v),update:async v=>request(path,'PATCH',v),once:async()=>snap((await request(path)).data)};}
function roomRef(raw){return {child:k=>raw.child(k),once:async(...a)=>snap(acceptSnapshot(applyAuto((await raw.once(...a)).val()))),on:(event,cb,cancel)=>raw.on(event,s=>cb(snap(acceptSnapshot(applyAuto(s.val())))),cancel),off:(...a)=>raw.off(...a),update:v=>raw.update(v),transaction};}
function install(c){cfg=c;if(!physicalPoll){if(w.GZQuotaSync){physicalPoll=w.GZQuotaSync.subscribe({
url:URL_DB+'/pilotage_v1/states.json',token:force=>cfg.token(!!force),enabled:()=>!!uid(),
read:async()=>(await request('pilotage_v1/states')).data,
next:rows=>{physicalRows=rows||{};physicalAt=Date.now();renderPhysical();notifyPhysical();},
error:()=>renderPhysical()});}else{physicalPoll=setInterval(refreshPhysical,2000);refreshPhysical();}}w.fetch=async function(input,options={}){const url=typeof input==='string'?input:input.url;if(!url.includes('/__youssef_relay__'))return fetchNative(input,options);let body={};try{body=JSON.parse(options.body||'{}');const r=await route(body);return new Response(JSON.stringify(r),{status:200,headers:{'Content-Type':'application/json'}});}catch(e){return new Response(JSON.stringify({success:false,error:e.message}),{status:409,headers:{'Content-Type':'application/json'}});}};}
async function route(q){if(q.action==='pauseConfirmed')return queuePause(q);if(['status','roomStatus','diagnosticTuya'].includes(q.action)){const s=q.action==='roomStatus'&&physicalPoll?.healthy?.()?clone(physicalRows):await states(),posts=cachedPosts.length?cachedPosts:(await request(ROOM+'/postes')).data||[];const devices=entries(posts).map(({p})=>{const r=s[poste(p)]||{};return {devid:p.devid,poste:p.num,online:r.online===true&&now()-r.seenAt<15000,switchOn:r.power,countdown:r.nativeSeconds||0,readable:true,switchCode:'DP1'};});return q.action==='status'?{success:true,device:devices.find(d=>d.devid===q.devid)||{online:false}}:{success:true,devices};}const posts=cachedPosts.length?cachedPosts:(await request(ROOM+'/postes')).data||[];const p=posts.find(p=>p&&(q.posteNum===p.num||q.poste===p.num||q.devid===p.devid));if(!p)throw Error('Poste IMRANNE introuvable.');const number=poste(p),targetKey=encodeURIComponent(p.num);const [physical,active]=await Promise.all([request('pilotage_v1/states/'+number),request(ROOM+'/active_by_poste/'+targetKey)]);const s={[number]:physical.data||{}},raw={postes:posts,active_by_poste:{[targetKey]:active.data||{}}};const devices=entries(posts).map(({p})=>p).map(p=>{const r=s[poste(p)]||{};return {devid:p.devid,poste:p.num,online:r.online===true&&now()-r.seenAt<30000,switchOn:r.power,countdown:r.nativeSeconds||0,readable:true,switchCode:'DP1'};});
if(['status','roomStatus','diagnosticTuya'].includes(q.action)){if(q.action==='status')return {success:true,device:devices.find(d=>d.devid===q.devid)||{online:false}};return {success:true,devices};}
if(['syncTimer','syncAllTimers'].includes(q.action))throw Error('Les minuteurs sont gérés par le relais natif.');
if(['pushConfig','subscribePush','vapidPublicKey'].includes(q.action))throw Error('Notifications push serveur non configurées pour IMRANNE.');
if(!p)throw Error('Poste IMRANNE introuvable.');
if(!q.action&&typeof q.turnOn==='boolean'){if(q.turnOn){await ready(p);const st=s[poste(p)];return {success:true,device:{online:true,switchOn:st.power===true},ready:true};}await safeOff(p);return {success:true,device:{online:true,switchOn:false}};}
const index=posts.indexOf(p),k=encodeURIComponent(p.num),a=raw.active_by_poste?.[k]||{};if(!a.actif||q.sessionId&&a.sessionId!==q.sessionId)throw Error('La séance a changé. Actualise avant de continuer.');if(q.expectedUpdatedAt!=null&&Number(q.expectedUpdatedAt)!==Number(a.updatedAt||0))throw Error('Séance modifiée : rouvre le bouton − Temps.');let removed=0;
if(q.action==='finishConfirmed'){const st=s[poste(p)];if(st?.online&&st.power===false&&st.nativeSeconds===0&&now()-st.seenAt<30000)return {success:true,powerOffConfirmed:true};await command(p,'off');return {success:true,powerOffConfirmed:true};}
if(!['pauseConfirmed','resumeConfirmed','reduceTime'].includes(q.action))throw Error('Action non prise en charge : '+String(q.action));
const opid=q.operationId||id();if(!/^[A-Za-z0-9_-]{16,80}$/.test(opid))throw Error('Identifiant d’opération invalide');let prior=raw.operation_results?.[opid];if(!prior&&q.operationId)try{prior=(await request(ROOM+'/operation_results/'+opid)).data;}catch(_){}if(prior)return {...prior,success:true,duplicate:true,schedulerConfirmed:true};const tx=await transaction(room=>{if(room.operation_results?.[opid])return room;const b=room.active_by_poste?.[k];if(!b?.actif||b.sessionId!==a.sessionId)throw Error('Séance modifiée ailleurs');if(q.expectedUpdatedAt!=null&&Number(q.expectedUpdatedAt)!==Number(b.updatedAt||0))throw Error('Séance modifiée : rouvre le bouton − Temps.');if(q.action==='pauseConfirmed'){if(b.paused){const st=s[poste(p)];if(!st?.online||now()-st.seenAt>30000||st.power!==false)throw Error('Pause déjà enregistrée, extinction non confirmée.');return room;}b.paused=true;b.pauseRemainingSec=remaining(a);b.finTs=0;b.pausePowerOffConfirmed=true;}else if(q.action==='resumeConfirmed'){if(!b.paused)throw Error('Aucune pause à reprendre');b.finTs=Date.now()+b.pauseRemainingSec*1000;b.paused=false;b.pauseRemainingSec=0;}else{if(!Number.isInteger(q.minutes)||q.minutes<1||q.minutes>1440)throw Error('Durée invalide');removed=Math.min(remaining(a),q.minutes*60);if(b.paused)b.pauseRemainingSec=Math.max(0,b.pauseRemainingSec-removed);else b.finTs=Math.max(Date.now(),b.finTs-removed*1000);if(remaining(b)<=0){b.actif=false;b.paused=false;b.finTs=0;b.pauseRemainingSec=0;}}b.updatedAt=Date.now();room.operation_results=room.operation_results||{};room.operation_results[opid]={poste:k,action:q.action,removedSeconds:removed,powerOffConfirmed:q.action==='pauseConfirmed',powerOnConfirmed:q.action==='resumeConfirmed'};const ids=Object.keys(room.operation_results);for(const oldid of ids.slice(0,Math.max(0,ids.length-100)))delete room.operation_results[oldid];return room;},{control:true,preflightPoste:q.action==='resumeConfirmed'?p:null,reduceSeconds:q.action==='reduceTime'?q.minutes*60:0,operationId:opid});return {success:true,state:tx.snapshot.val().active_by_poste[k],powerOffConfirmed:q.action==='pauseConfirmed',powerOnConfirmed:q.action==='resumeConfirmed',removedSeconds:removed,schedulerConfirmed:true};}
async function queuePause(q){
 if(q.offlineConfirmed===true)return queueManualPause(q);
 const pausePosts=cachedPosts.length?cachedPosts:(await request(ROOM+'/postes')).data||[];const p=pausePosts.find(p=>p?.num===q.posteNum);if(!p)throw Error('Poste introuvable');const row=(await request('pilotage_v1/states/'+poste(p))).data;if(row?.online===false)return {success:false,offlinePauseAvailable:true,error:'Prise injoignable : confirmer la coupure réelle pour conserver le temps.'};
 try{return await queueConfirmedPause(q);}catch(error){if(/Prise du poste .*non joignable|Relais OPPO non disponible/.test(error.message))return {success:false,offlinePauseAvailable:true,error:'État électrique inconnu : confirmer la coupure réelle pour figer le temps.'};throw error;}
}
async function queueManualPause(q){
 let key;
 const tx=await transaction(root=>{const p=(root.postes||[]).find(p=>p?.num===q.posteNum);if(!p)throw Error('Poste introuvable');key=encodeURIComponent(p.num);const a=activeRow(root,p);if(!a.actif||a.sessionId!==q.sessionId)throw Error('La séance a changé');if(q.powerParent&&!powerCutParent(root,p))throw Error('Coupure du poste amont non confirmée');if(a.paused)return root;const credit=remaining(a);if(!credit)throw Error('Aucun temps restant');const opid=typeof q.operationId==='string'&&q.operationId.length>=16&&q.operationId.length<=80?q.operationId:id();
 a.paused=true;a.pauseRemainingSec=credit;a.finTs=0;a.pendingPauseId=opid;a.pausePending=true;a.pausePowerOffConfirmed=false;a.pauseReason=q.powerParent?'alimentation_poste_'+q.powerParent:'coupure_confirmee_manuellement';a.updatedAt=now();setActive(root,p,a);
 root.pause_requests=root.pause_requests||{};root.pause_requests[key]={id:opid,by:uid(),sessionId:a.sessionId,remaining:credit,nativeId:a.nativeCommandId||'',at:now()};return root;},{control:'manualPause',deferPause:true});
 const state=tx.snapshot.val().active_by_poste[key];return {success:true,state,pending:!!state.pendingPauseId&&!state.pausePowerOffConfirmed,manualOffline:!state.pausePowerOffConfirmed,powerOffConfirmed:state.pausePowerOffConfirmed===true,schedulerConfirmed:true};
}
async function queueConfirmedPause(q){let key;const tx=await transaction(root=>{const p=(root.postes||[]).find(p=>p?.num===q.posteNum);if(!p)throw Error('Poste introuvable');key=encodeURIComponent(p.num);const a=activeRow(root,p);if(!a.actif||a.sessionId!==q.sessionId)throw Error('La séance a changé');if(a.paused&&a.pausePowerOffConfirmed)return root;const credit=remaining(a);a.paused=true;a.pauseRemainingSec=credit;if(!a.pauseRemainingSec)a.pauseRemainingSec=Math.max(0,Math.ceil((a.finTs-now())/1000));a.finTs=0;a.pausePowerOffConfirmed=true;delete a.pendingPauseId;delete a.pausePending;setActive(root,p,a);return root;},{control:'pause',preflightPoste:cachedPosts.find(p=>p?.num===q.posteNum)||{num:q.posteNum}});const state=tx.snapshot.val().active_by_poste[key];return {success:true,state,pending:false,powerOffConfirmed:true,schedulerConfirmed:true};}
async function safeOff(p){const room=(await request(ROOM)).data||{},a=room.active_by_poste?.[encodeURIComponent(p.num)]||{};if((a.actif&&!a.paused)||a.starting)throw Error('Séance en cours : utiliser Pause ou OFF TV.');const st=(await states())[poste(p)];if(st?.online&&st.power===false&&st.nativeSeconds===0&&now()-st.seenAt<30000)return true;await command(p,'off');return true;}
async function importTariffs(){return (await request(ROOM+'/tarifs')).data||[];}
async function importPostLabels(){return (await request(ROOM+'/postes')).data||[];}
async function initialize(){if(uid()!==OWNER)throw Error('Compte Patron requis');const existing=(await request(ROOM)).data;if(!existing?.postes?.length)throw Error('Salle existante introuvable. Aucune donnée créée.');return existing;}
function dayStart(t=now()){return Math.floor((t-28800000)/86400000)*86400000+28800000;}
function nextEight(t=now()){return dayStart(t)+86400000;}
const managerFields=['postes','tarifs','tarif_console_types','active_by_poste','active_postes','gym','businessRevision','saved_time','saved_time_intents','auto_pauses','pause_results','current_day'];
async function managerSnapshot(){
 const key=dayKey(new Date(now())),paths=[...managerFields,'config/businessName','sessions','daily/'+key,'activity_daily/'+key];
 const values=await Promise.all(paths.map(async path=>{try{return [path,(await request(ROOM+'/'+path)).data];}catch(e){if(/Firebase (401|403)/.test(e.message)&&['sessions','daily/'+key,'activity_daily/'+key].includes(path))return [path,null];throw e;}}));
 const root={daily:{},activity_daily:{},config:{}};for(const [path,value]of values){const parts=path.split('/');let target=root;for(const part of parts.slice(0,-1))target=target[part]||(target[part]={});target[parts.at(-1)]=value;}
 const journal=root.activity_daily?.[key];if(journal&&typeof journal==='object')root.activity_daily[key]=Object.fromEntries(Object.entries(journal).filter(([,e])=>!isPatronEvent(e)));
 const ss=root.sessions;if(!ss||ss.dayStart!==dayStart())root.sessions={recettes:0,count:0,date:new Date(dayStart()).toDateString(),parPoste:{},sessionsParPoste:{},payStats:{},dayStart:dayStart()};
 return root;
}
function leafPatch(old,next,prefix='',out={}){for(const key of new Set([...Object.keys(old||{}),...Object.keys(next||{})])){if(!prefix&&key==='operation_lock')continue;const path=prefix?prefix+'/'+key:key,a=old?.[key],b=next?.[key];if(JSON.stringify(a)===JSON.stringify(b))continue;if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b))leafPatch(a,b,path,out);else out[path]=b===undefined?null:b;}return out;}
function stampDay(root){const current=dayKey(new Date(now()));if(root.sessions&&root.sessions.date===new Date(dayStart()).toDateString())root.sessions.dayStart=dayStart();if(root.daily?.[current])root.daily[current].dayStart=dayStart();return root;}
function restRoom(){let timer=null,closed=false,busy=false;const api={child:k=>child(ROOM+'/'+k),once:async()=>snap((await request(ROOM)).data||{}),update:async value=>request(ROOM,'PATCH',value),transaction,off:()=>{closed=true;clearInterval(timer);},on:(event,callback,cancel)=>{closed=false;async function poll(){if(closed||busy||activeTransactions||currentTiming)return;busy=true;try{callback(snap((await request(ROOM)).data||{}));}catch(e){cancel?.(e);}finally{busy=false;}}poll();timer=setInterval(poll,2500);},_rootPath:ROOM};return api;}
function activeRow(root,p){return root.active_by_poste?.[encodeURIComponent(p.num)]||{};}
function setActive(root,p,state){const key=encodeURIComponent(p.num);root.active_by_poste=root.active_by_poste||{};root.active_by_poste[key]=state;const i=(root.postes||[]).findIndex(x=>x?.num===p.num);if(i>=0){root.active_postes=Array.isArray(root.active_postes)?root.active_postes:[];root.active_postes[i]=clone(state);}}
function cleared(a){return {...a,actif:false,starting:false,cleanup:false,startingUntil:0,cleanupUntil:0,client:'',sessionId:'',finTs:0,paused:false,pauseRemainingSec:0,tempsTotal:0,montantSession:0,montantJourSession:0,paiementsSession:{},updatedAt:now(),pendingPauseId:null,pausePending:false};}
function validBanks(root,t=now()){return Object.entries(root.saved_time||{}).filter(([,b])=>b&&b.status==='saved'&&b.expiresAt>t&&Number.isInteger(b.remainingSeconds)&&b.remainingSeconds>0);}
async function requireBankRelay(){const h=(await request('pilotage_v1/heartbeat')).data;if(!h?.capabilities?.includes('saved-time-v1'))throw Error('Installer le relais IMRANNE 1.2 pour sauvegarder/restaurer le temps');}
async function saveTime(p){
 const [,observedRow]=await Promise.all([requireBankRelay(),request('pilotage_v1/states/'+poste(p))]);const observed=observedRow.data||{};const lease=await acquireSaleLease();try{
 let chosen;
 await transaction(root=>{const a=activeRow(root,p);if(!a.actif||!a.sessionId)throw Error('Aucune séance à sauvegarder');
  const previous=Object.entries(root.saved_time_intents||{}).find(([,x])=>x.kind==='save'&&x.originalSessionId===a.sessionId&&x.expiresAt>now());
  chosen=previous?.[0]||id();root.saved_time_intents=root.saved_time_intents||{};if(previous&&observed.result?.id===previous[1].commandId&&observed.result.ok===false&&observed.online&&observed.power===false){previous[1].commandId=id();}if(!previous)root.saved_time_intents[chosen]={kind:'save',id:chosen,commandId:id(),by:uid(),poste:p.num,originalSessionId:a.sessionId,originalSaleId:a.restoredOriginalSaleId||a.sessionId,client:a.client||'Client',savedAt:now(),expiresAt:nextEight()};return root;},{control:'bank',saleLease:lease});
 const result=await transaction(root=>{const intent=root.saved_time_intents?.[chosen],a=activeRow(root,p);if(root.saved_time?.[chosen]?.status==='saved')return root;if(!intent||intent.expiresAt<=now()||a.sessionId!==intent.originalSessionId||!a.actif)throw Error('La séance a changé ou la sauvegarde a expiré');
  root.saved_time=root.saved_time||{};root.saved_time[chosen]={...intent,remainingSeconds:remaining(a),status:'saved'};setActive(root,p,cleared(a));return root;},{control:'bank',saleLease:lease,preflightPoste:p,saveTime:{id:chosen}});
 return result;
 }finally{await releaseSaleLease(lease);}
}
async function restoreTime(bankId,p){
 const preparation=prepareCommand(p);const [,prepared]=await Promise.all([requireBankRelay(),preparation.promise]);const observed=prepared.before||{};const lease=await acquireSaleLease();try{
 await transaction(root=>{const bank=root.saved_time?.[bankId],a=activeRow(root,p);if(!bank)throw Error('Sauvegarde introuvable');if(bank.expiresAt<=now())throw Error('Temps sauvegardé expiré à 8 h');if(bank.status==='restoring'){if(!String(bank.restoreCommandId||'').endsWith('_a1'))bank.restoreCommandId=id();if(bank.restorePoste!==p.num)throw Error('Restauration déjà en cours sur un autre poste');if(observed.result?.id===bank.restoreCommandId&&observed.result.ok===false&&observed.online&&observed.power===false&&observed.nativeSeconds===0)bank.restoreCommandId=id();return root;}if(bank.status!=='saved'||bank.expiresAt<=now())throw Error('Temps sauvegardé expiré à 8 h ou déjà utilisé');if(a.actif||a.starting)throw Error('Ce poste est occupé. Choisis un poste libre.');
  bank.status='restoring';bank.restorePoste=p.num;bank.restoreCommandId=id();bank.restoreSessionId='restore-'+id();bank.restoreStartedAt=now();setActive(root,p,{...cleared(a),starting:true,startingUntil:now()+45000,sessionId:bank.restoreSessionId,client:bank.client});return root;},{control:'bank',saleLease:lease});
 return await transaction(root=>{const bank=root.saved_time?.[bankId],a=activeRow(root,p);if(bank?.status==='used')return root;if(!bank||bank.expiresAt<=now()||bank.status!=='restoring'||bank.restorePoste!==p.num||a.sessionId!==bank.restoreSessionId||!a.starting)throw Error('Le poste a changé. Restauration non envoyée.');
  const credit=bank.remainingSeconds;bank.status='used';bank.restoredAt=now();setActive(root,p,{...cleared(a),actif:true,starting:false,sessionId:bank.restoreSessionId,client:bank.client,finTs:now()+credit*1000,tempsTotal:credit,dureeMin:credit/60,startedAt:now(),restoredOriginalSaleId:bank.originalSaleId,restoredFrom:bankId});return root;},{control:'bank',saleLease:lease,preflightPoste:p,preparedCommand:preparation,restoreTime:{id:bankId}});
 }finally{await releaseSaleLease(lease);}
}
// Cancellation consumes already-paid credit using the existing Firebase "used"
// state. Preserve the bank and its audit fields; never delete or refund a sale.
// Command slots cannot be deleted by app clients. A slot still older than
// the reservation proves this restore was never submitted; an executed or newer
// command never qualifies, even if its current physical state is unknown.
function restoreNeverSent(bank,c,state){
 const started=Number(bank?.restoreStartedAt);if(!Number.isFinite(started)||started<=0||now()-started<35000||!bank?.restoreCommandId)return false;
 if(c?.id===bank.restoreCommandId||state?.result?.id===bank.restoreCommandId)return false;
 if(c&&(!Number.isFinite(Number(c.createdAt))||Number(c.createdAt)>=started-5000))return false;
 if(c?.expiresAt>now()&&state?.result?.id!==c.id)return false;
 return true;
}
async function recoverUnsentRestore(bankId){
 if(typeof bankId!=='string'||!bankId||bankId.length>100||/[.#$\[\]\/]/.test(bankId))throw Error('Sauvegarde invalide');
 const lease=await acquireSaleLease();try{
 const bank=(await request(ROOM+'/saved_time/'+bankId)).data;if(!bank||bank.status!=='restoring')throw Error('Aucune restauration à débloquer');
 const ps=cachedPosts.length?cachedPosts:(await request(ROOM+'/postes')).data||[],p=ps.find(p=>p?.num===bank.restorePoste);if(!p)throw Error('Poste de restauration introuvable');
 const [waiting,state]=await Promise.all([request('pilotage_v1/commands/'+poste(p)),request('pilotage_v1/states/'+poste(p))]);
 if(!restoreNeverSent(bank,waiting.data,state.data))throw Error('Déblocage refusé : la commande a pu être envoyée. Vérifier la prise avant de réutiliser ce crédit.');
 return await transaction(root=>{const current=root.saved_time?.[bankId],a=activeRow(root,p);if(!current||current.status!=='restoring'||current.expiresAt<=now()||current.restoreCommandId!==bank.restoreCommandId)throw Error('Sauvegarde modifiée ou expirée');
 if(a.actif&&a.sessionId===current.restoreSessionId)throw Error('Cette restauration est déjà active');
 if(a.starting&&a.sessionId===current.restoreSessionId)setActive(root,p,cleared(a));
 current.status='saved';current.restoreAbortedAt=now();current.restoreAbortReason='command_not_sent';return root;},{control:'bank',saleLease:lease,deferPause:true});
 }finally{await releaseSaleLease(lease);}
}

async function cancelSavedTime(bankId){
 if(typeof bankId!=='string'||!bankId||bankId.length>100||/[.#$\[\]\/]/.test(bankId))throw Error('Sauvegarde invalide');
 const lease=await acquireSaleLease();try{
 const current=(await request(ROOM+'/saved_time/'+bankId)).data;let recovery=null;
 if(current?.status==='restoring'){
  const ps=cachedPosts.length?cachedPosts:(await request(ROOM+'/postes')).data||[],p=ps.find(p=>p?.num===current.restorePoste);if(!p)throw Error('Poste de restauration introuvable');
  const [state,waiting]=await Promise.all([request('pilotage_v1/states/'+poste(p)),request('pilotage_v1/commands/'+poste(p))]);recovery={p,state:state.data,waiting:waiting.data};
 }
 return await transaction(root=>{const bank=root.saved_time?.[bankId];if(!bank)throw Error('Sauvegarde introuvable');if(bank.status==='used'&&bank.cancelledAt)return root;if(!['saved','restoring'].includes(bank.status)||bank.expiresAt<=now())throw Error('Sauvegarde utilisée ou expirée');
 if(bank.status==='restoring'){
  const s=recovery?.state,c=recovery?.waiting,p=recovery?.p,a=p&&activeRow(root,p),fresh=s?.online===true&&now()-s.seenAt<=15000&&s.seenAt<=now()+5000;
  const failed=s?.result?.id===bank.restoreCommandId&&s.result.ok===false,waitingPending=c?.expiresAt>now()&&s?.result?.id!==c.id;
  const notSent=restoreNeverSent(bank,c,s);
  if(waitingPending||(!notSent&&(!fresh||s.power!==false||s.nativeSeconds!==0||Number(s.remaining)!==0||!failed))||bank.restoreCommandId!==current.restoreCommandId)throw Error('Restauration à vérifier : attendre une lecture OFF sans minuteur et la fin de toute commande avant annulation.');
  if(a?.starting&&a.sessionId===bank.restoreSessionId)setActive(root,p,cleared(a));
  else if(a?.actif&&a.sessionId===bank.restoreSessionId)throw Error('Temps déjà restauré : utiliser les actions de la séance.');
 }
 bank.status='used';bank.cancelledAt=now();bank.cancelledBy=uid();bank.remainingAtCancel=bank.remainingSeconds;bank.usedReason='cancelled';return root;},{control:'bank',saleLease:lease,deferPause:true});
 }finally{await releaseSaleLease(lease);}
}

// Physical wiring declared by the IMRANNE owner: plug 5 receives power from plug 6.
// This is a power dependency, never a reassignment of the two command channels.
const IMRANNE_POWER_PARENTS=Object.freeze({});
function powerCutParent(root,p){
 const n=poste(p),parent=IMRANNE_POWER_PARENTS[n],a=activeRow(root,p),up=physicalRows[parent],child=physicalRows[n];if(!parent||!a?.actif||a.paused)return null;
 if(!up?.online||up.power!==false||up.nativeSeconds!==0||now()-up.seenAt>15000||up.seenAt>now()+5000||up.seenAt<Number(a.startedAt||0))return null;
 if(child?.online&&now()-child.seenAt<=15000)return null;
 return parent;
}
let dependencySync=null;
async function syncPowerDependencies(root){
 if(dependencySync||activeTransactions||currentTiming)return;
 const candidates=entries(root?.postes||[]).filter(({p})=>powerCutParent(root,p));if(!candidates.length)return;
 dependencySync=(async()=>{let latest;for(const {p}of candidates){const parent=powerCutParent(root,p);if(!parent)continue;
  await states();if(!powerCutParent(root,p))continue;
  const a=activeRow(root,p);await queueManualPause({posteNum:p.num,sessionId:a.sessionId,operationId:id(),powerParent:parent});latest=clone(confirmedRoot);
 }return latest;})();
 try{return await dependencySync;}finally{dependencySync=null;}
}

function syncPhysicalRoot(root){if(!root)return root;const result=clone(root);for(const p of result.postes||[]){if(!p)continue;let n;try{n=poste(p);}catch(_){continue;}const key=encodeURIComponent(p.num),a=result.active_by_poste?.[key],s=physicalRows[n];
 if(!a?.actif||!s?.online||now()-s.seenAt>15000||s.seenAt>now()+5000||Number(s.seenAt)<Number(a.startedAt||0)||a.pendingPauseId||a.nativeCommandId&&s.result?.id!==a.nativeCommandId)continue;
 if(s.power===true&&s.mode==='actif'&&s.nativeSeconds>0&&!a.paused){a.finTs=s.deadline;a.syncAt=s.seenAt;}
 if(s.power===false&&['pause','coupure'].includes(s.mode)&&Number.isInteger(s.remaining)&&s.remaining>0){a.paused=true;a.pauseReason='prise_eteinte';a.pausePowerOffConfirmed=true;a.pauseRemainingSec=s.remaining;a.finTs=0;a.syncAt=s.seenAt;}
 if(s.power===false&&s.mode==='termine'&&s.nativeSeconds===0&&s.remaining===0){a.paused=false;a.pauseRemainingSec=0;a.finTs=Math.min(Date.now(),Number(s.seenAt));a.syncAt=s.seenAt;}
 }return result;}

function acceptSnapshot(root){const accepted=confirmedRoot&&(Number(root?.businessRevision)||0)<(Number(confirmedRoot.businessRevision)||0)?clone(confirmedRoot):root;lastRoomRoot=clone(accepted);return accepted;}
function isPatronEvent(e){return !!e&&(String(e.actorRole||'').toLowerCase()==='patron'||String(e.gerant||'').toLowerCase()==='patron'||e.visibilite==='patron'||e.uid===OWNER||e.actorUid===OWNER||/par le patron/i.test(String(e.main||'')));}
function dayKey(d=new Date()){return new Date(d.getTime()-8*60*60*1000).toISOString().slice(0,10);}
function todayRevenue(room,d=new Date()){return Math.max(0,Number(room.daily?.[dayKey(d)]?.recettes)||0);}
w.IMRANNERelay={isBound,displayEntries,controlSnapshot,gymSnapshot,acquireSaleLease,releaseSaleLease,diagnosticsBusy,beginTiming,endTiming,diagnostics,diagnosticsPanel,samePlug,checkAssociation,bindingGuard,dayStart,nextEight,managerSnapshot,restRoom,saveTime,restoreTime,cancelSavedTime,recoverUnsentRestore,validBanks,syncPhysicalRoot,leafPatch,entries,displayName,physicalSummary,physicalStatus,syncPowerDependencies,renderPhysical,refreshPhysical,install,request,acceptSnapshot,isPatronEvent,dayKey,todayRevenue,currentUid:uid,applyPause,applyAuto,importTariffs,ready,command,plan,transaction,roomRef,child,initialize,safeOff,poste,remaining,owner:OWNER,room:ROOM};
})(window);










