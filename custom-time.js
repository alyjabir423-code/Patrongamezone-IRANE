/* V65 notifications2 — durée libre payante, sans modifier les tarifs enregistrés. */
(function(root){
 'use strict';
 function quote(tariffs,minutes){
  const n=Number(minutes);
  if(!Number.isSafeInteger(n)||n<1||n>1440)throw Error('Choisis une durée entière entre 1 et 1 440 minutes');
  const base=(tariffs||[]).filter(t=>Number.isFinite(Number(t.min))&&Number(t.min)>0&&Number.isFinite(Number(t.prix))&&Number(t.prix)>0).slice().sort((a,b)=>Number(a.min)-Number(b.min))[0];
  if(!base)throw Error('Aucun tarif payant configuré pour ce poste');
  const exact=n*Number(base.prix)/Number(base.min),price=Math.max(10,Math.round(exact/10)*10);
  if(!Number.isSafeInteger(price))throw Error('Prix invalide');
  return {min:n,prix:price,lbl:n+' min personnalisées',custom:true,baseMin:Number(base.min),basePrix:Number(base.prix)};
 }
 function status(p){return p&&p.actif?(p.paused?'EN PAUSE':'EN FONCTION'):'LIBRE';}
 function observePower(memory,device,session,now){
  // SYNC8: a cloud status is never allowed to pause a customer session.
  // Only explicit Pause / Power-cut buttons may change paused=true.
  for(const key of Object.keys(memory))delete memory[key];
  return null;
}

root.GameZoneCustom={quote,status,observePower};
 const selection={start:false,plus:false};
 function el(id){return document.getElementById(id);}
 root.gzCustomReset=function(kind){selection[kind]=false;const input=el('gz-custom-'+kind),label=el('gz-price-'+kind);if(input)input.value='';if(label)label.textContent='Prix proportionnel, arrondi aux 10 F les plus proches (minimum 10 F).';};
 function currentTariffs(){
  if(root.GZ_CUSTOM_ROLE==='GERANT')return tarifsForPoste(postes[modalPosteIdx]);
  const p=(DB.get('postes')||[])[ownerPosteIdx];return p?ownerTarifs(p):[];
 }
 root.gzChooseCustom=function(kind,value){
  selection[kind]=String(value).trim()!=='';
  const label=el('gz-price-'+kind);
  if(!selection[kind]){if(label)label.textContent='Choisis un tarif prédéfini ou saisis des minutes.';return;}
  try{
   const q=quote(currentTariffs(),value);
   if(root.GZ_CUSTOM_ROLE==='GERANT'){if(kind==='start')selDuree=q.min;else selPlusDuree=q.min;}
   else{if(kind==='start')ownerSelMin=q.min;else ownerPlusMin=q.min;}
   document.querySelectorAll('#'+(root.GZ_CUSTOM_ROLE==='GERANT'?(kind==='start'?'duree-grid':'plus-grid'):(kind==='start'?'owner-start-durations':'owner-plus-durations'))+' .sel').forEach(x=>x.classList.remove('sel'));
   if(label)label.textContent=q.min+' minutes exactes = '+q.prix+' F · base '+q.baseMin+' min / '+q.basePrix+' F';
  }catch(e){if(label)label.textContent=e.message;}
 };
 root.gzChoosePreset=function(kind,tariffs,minutes){
  root.gzCustomReset(kind);
  const chosen=(tariffs||[]).find(t=>Number(t.min)===Number(minutes));
  const label=el('gz-price-'+kind);
  if(chosen&&label)label.textContent='Durée exacte : '+Number(chosen.min)+' minutes · '+Number(chosen.prix)+' F';
 };
 root.gzSelectedTariff=function(kind,tariffs,minutes){
  if(selection[kind]){try{return quote(tariffs,el('gz-custom-'+kind).value);}catch(e){return null;}}
  return (tariffs||[]).find(t=>Number(t.min)===Number(minutes));
 };
 root.gzOccupancyHtml=function(posts){
  const box=document.createElement('div');box.className='gz-occupancy';box.style.cssText='font-size:11px;margin:8px 0;line-height:1.7';
  for(const p of posts||[]){if(!p)continue;const row=document.createElement('div');row.textContent=GameZoneManagement.displayName(p)+' — '+status(p)+(p.actif&&p.client?' · '+p.client:'');box.appendChild(row);}
  return box.outerHTML;
 };
})(typeof globalThis!=='undefined'?globalThis:this);

