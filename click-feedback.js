/* Click and validation feedback. No sound is played during setup or data sync. */
(function(w){'use strict';
let scopes=new Set(),voice=null;
const labels={start:'Activation demandée',pause:'Pause demandée',resume:'Reprise demandée',add:'Ajout demandé',subtract:'Retrait demandé',save:'Sauvegarde demandée',restore:'Restauration demandée',off:'Arrêt demandé',confirmed:'Choix sélectionné',error:'Opération non confirmée'};
function kind(t){return w.GZActionAudio?.classify(t)||(/pause/i.test(t)?'pause':/reprendre/i.test(t)?'resume':/activer|démarrer/i.test(t)?'start':/annuler|off tv/i.test(t)?'off':'confirmed');}
function say(type,text){
 if(w.GZActionAudio)return w.GZActionAudio.play(type);
 if(localStorage.getItem('gz-click-voice')==='0'||!w.speechSynthesis)return false;
 try{const s=w.speechSynthesis;s.cancel();voice=new SpeechSynthesisUtterance(text||labels[type]||labels.confirmed);voice.lang='fr-FR';const voices=s.getVoices();const fr=voices.filter(v=>/^fr/i.test(v.lang));voice.voice=w.GZMaleSpeech?.selectedVoice?.()||fr.find(v=>!/female/i.test(v.name)&&/\bmale\b|homme|henri|thomas|paul/i.test(v.name))||null;if(!voice.voice)return false;s.speak(voice);return true;}catch(_){return false;}
}
function confirm(){say('confirmed','Validation confirmée');}
const silent=()=>false;
for(const name of ['ownerSpeak','gzSpeak','ownerSpeakNow','gzSpeakNow','ownerAnnounceStartOnce','announceSessionStartOnce'])if(typeof w[name]==='function')w[name]=silent;
const originalToast=w.showToast;
if(typeof originalToast==='function')w.showToast=function(message,...rest){
 const result=originalToast.call(this,message,...rest),text=String(message||'');
 if(scopes.size){
  const scope=[...scopes].at(-1);
  if(!scope.announced&&(/✅|confirmée|confirmé|enregistré|sauvegardé|restauré/i.test(text))&&!/⚠|non confirm|impossible|erreur|refus|en cours|attente/i.test(text)){scope.announced=true;confirm();}
  else if(!scope.failed&&/⚠|impossible|refus|erreur/i.test(text)){scope.failed=true;say('error');}
 }
 return result;
};
function wrap(name){const fn=w[name];if(typeof fn!=='function'||fn.gzFeedbackWrapped)return;
 function wrapped(...args){
  const scope={};scopes.add(scope);let button=null,caption='';
  if(/^(ownerConfirmStart|confirmerSession)$/.test(name)){
   button=document.querySelector(name==='ownerConfirmStart'?'#mo-owner-start .btn-ok':'#mo-start .btn-ok');
   if(button){if(button.dataset.gzBusy==='1'){scopes.delete(scope);return;}caption=button.textContent;button.dataset.gzBusy='1';button.disabled=true;button.textContent='⏳ Activation en cours…';button.setAttribute('aria-busy','true');}
  }
  function done(){scopes.delete(scope);if(button){button.disabled=false;button.textContent=caption;delete button.dataset.gzBusy;button.removeAttribute('aria-busy');}}
  try{const result=fn.apply(this,args);if(result&&typeof result.then==='function')return result.finally(done);done();return result;}catch(e){done();throw e;}
 }
 wrapped.gzFeedbackWrapped=true;w[name]=wrapped;
}
for(const name of ['youssefSaveTime','youssefRestoreTime'])wrap(name);
document.addEventListener('click',e=>{
 const b=e.target.closest?.('button,[role="button"],[onclick]');
 if(!b||b.disabled||b.getAttribute('aria-disabled')==='true'||b.closest('#youssef-audio-panel')||b.closest('#gz-male-voice-panel')||b.id==='gz-male-voice-button'||b.id==='gz-notify-btn')return;
 const handler=b.getAttribute('onclick')||'',match=handler.match(/^\s*(?:return\s+)?([A-Za-z_$][\w$]*)\s*\(/);
 if(match)wrap(match[1]);
 const text=(b.textContent||b.getAttribute('aria-label')||'Choix').trim();
 say(kind(text));
},true);
w.GZClickFeedback={confirm,say};
})(window);
