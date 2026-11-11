(function(root){
'use strict';
function clone(x){return JSON.parse(JSON.stringify(x));}
function amount(x){const n=Number(x==null?0:x);if(!Number.isSafeInteger(n)||n<0)throw Error('Montant existant invalide');return n;}
function dayValid(key){return /^\d{4}-\d{2}-\d{2}$/.test(key)&&!Number.isNaN(Date.parse(key+'T12:00:00Z'))&&new Date(key+'T12:00:00Z').toISOString().slice(0,10)===key;}
function snapshot(room,key,currentKey,currentDate){
 if(!dayValid(key)||key>currentKey)throw Error('Choisis une date valide, aujourd’hui ou avant');
 const live=key===currentKey,day=room.daily&&room.daily[key];
 if(!day)throw Error('Aucun rapport enregistré pour cette journée');
 const ss=live?room.sessions:day;
 if(!ss||typeof ss!=='object')throw Error('Rapport introuvable');
 if(live&&(ss.date!==currentDate||amount(day.recettes)!==amount(ss.recettes)))throw Error('Journée en cours de basculement ou rapport désynchronisé');
 const total=amount(ss.recettes),sum=Object.values(ss.parPoste||{}).reduce((a,v)=>a+amount(v),0);
 if(sum!==total)throw Error('Le total et les montants par poste sont incohérents');
 return {ss,day,dayKey:key,live};
}
function applyCorrection(room,op,currentKey,currentDate){
 if(!room||typeof room!=='object')throw Error('Salle introuvable');
 if(!op.id||!op.poste)throw Error('Poste obligatoire');
 if(!Number.isSafeInteger(op.delta)||!op.delta||Math.abs(op.delta)>100000)throw Error('Montant invalide : entier de 1 à 100 000 FCFA');
 if(room.patron_adjustment_once&&room.patron_adjustment_once[op.id])throw Error('Correction déjà appliquée');
 const day=snapshot(room,op.key,currentKey,currentDate),before=amount(day.ss.parPoste&&day.ss.parPoste[op.poste]);
 if(amount(day.ss.recettes)!==op.beforeTotal||before!==op.beforePoste)throw Error('Le rapport a changé : recharge avant de corriger');
 if(before+op.delta<0||op.beforeTotal+op.delta<0)throw Error('La correction rendrait la recette négative');
 const next=clone(room),updated=clone(day.ss);
 updated.parPoste=Object.assign({},updated.parPoste||{});updated.parPoste[op.poste]=before+op.delta;updated.recettes=op.beforeTotal+op.delta;
 next.daily=next.daily||{};next.daily[op.key]=updated;if(day.live)next.sessions=clone(updated);
 next.patron_adjustment_once=next.patron_adjustment_once||{};next.patron_adjustment_once[op.id]=true;
 return next;
}
function displayName(poste){return String(poste&&poste.displayName||poste&&poste.num||'Poste');}
function validatePostTariffs(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>30)throw Error('Ajoute de 1 à 30 tarifs pour ce poste');
 const seen=new Set();return rows.map(t=>{const min=Number(t.min),prix=Number(t.prix);if(!Number.isSafeInteger(min)||min<1||min>1440||!Number.isSafeInteger(prix)||prix<1||prix>100000)throw Error('Durée : 1 à 1440 minutes ; prix : 1 à 100 000 FCFA entiers');if(seen.has(min))throw Error('Chaque durée doit être unique pour ce poste');seen.add(min);return {min,prix,lbl:min+' min'};}).sort((a,b)=>a.min-b.min);
}
function updatePostes(room,index,values){
 const list=Array.isArray(room.postes)?clone(room.postes):[],old=index>=0?list[index]:null;
 if(index>=0&&!old)throw Error('Poste introuvable');
 const name=String(values.displayName||'').trim(),num=old?old.num:String(values.num||'').trim();
 if(!name||name.length>48||!num||!values.type)throw Error('Nom, identifiant et type obligatoires (48 caractères maximum)');
 if(list.some((p,i)=>i!==index&&displayName(p).trim().toLowerCase()===name.toLowerCase()))throw Error('Ce nom est déjà utilisé');
 if(!old&&list.some(p=>p.num===num))throw Error('Identifiant déjà utilisé');
 const state=old&&((room.active_by_poste||{})[encodeURIComponent(old.num)]||(room.active_postes||[])[index])||{};
 if((state.actif||state.starting||state.cleanup)&&old&&((old.relayPoste!=null&&values.relayPoste!=null&&Number(old.relayPoste)!==Number(values.relayPoste))||old.type!==values.type||String(old.typeCustom||'')!==String(values.typeCustom||'')||String(old.devid||'')!==String(values.devid||'')))throw Error('Termine la séance avant de changer le type ou la prise');
 if(values.tarifsSpecifiques!=null)values=Object.assign({},values,{tarifsSpecifiques:validatePostTariffs(values.tarifsSpecifiques)});
 if(values.relayPoste!=null&&(!Number.isInteger(values.relayPoste)||values.relayPoste<1||values.relayPoste>8))throw Error('Choisis Poste 1 à Poste 8');
 const poste=Object.assign({},old||{},values,{num,displayName:name});delete poste.key;
 if(old)list[index]=poste;else list.push(poste);
 return list;
}
root.GameZoneManagement={snapshot,applyCorrection,displayName,updatePostes,validatePostTariffs};
})(typeof globalThis!=='undefined'?globalThis:this);




