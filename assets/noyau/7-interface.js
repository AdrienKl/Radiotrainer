/* =============================================================================
   Albatros VFR — CE QUI PARLE À L'UTILISATEUR
   -----------------------------------------------------------------------------
   Le journal radio, les messages passagers, et la demande de confirmation.

   POURQUOI rtConfirm N'UTILISE PAS window.confirm()
   Parce que `confirm()` gèle le fil d'exécution, et que ce gel interrompt la
   synthèse vocale du contrôleur. On perdait la phrase en cours pour demander
   « êtes-vous sûr ? ».

   Ces trois fonctions sont atteintes par la console d'administration via
   `window.rtConfirm` et `window.showToast`, derrière un `if (window.X)`. Elles
   doivent donc rester déclarées en `function` au niveau racine : en `const`,
   elles quitteraient `window` sans la moindre erreur, et les boutons de la
   console cesseraient simplement de répondre. tests/contrat/api-window.test.mjs
   surveille exactement ça.

   Elles lisent `el` et `$`, déclarés plus loin dans le moteur — toujours depuis
   un corps de fonction, donc après le chargement.

   ┌─ CE FICHIER CHARGE AVANT LE MOTEUR ────────────────────────────────────┐
   │ Il déclare ses symboles au niveau racine d'un script classique : ils     │
   │ vivent donc dans la portée globale, visibles par tout ce qui suit — le   │
   │ moteur, la Navigation, l'Épellation, les Paramètres, l'inscription.      │
   │                                                                          │
   │ NE PAS l'envelopper dans une IIFE, et ne pas remplacer ses `function`    │
   │ par des `const` : au niveau racine, `function` et `var` deviennent des   │
   │ propriétés de window, `const` et `let` non. La console d'administration  │
   │ en dépend, et la rupture ne produirait aucune erreur.                    │
   └──────────────────────────────────────────────────────────────────────────┘

   Extrait d'index.html le 19/09/2026 (étape 2.2). Pas une ligne n'a été
   modifiée : les lignes ont été déplacées.

   Le « use strict » ci-dessous n'est pas un ajout : ce code tournait déjà en
   mode strict, sous celui du bloc du moteur. Sans lui, le sortir dans un
   fichier le ferait basculer en mode permissif — `this` changerait de valeur
   dans les appels simples, et une affectation à une variable non déclarée
   créerait un global au lieu de lever une erreur. Le remettre ici, c'est
   garder le comportement identique, pas le modifier.
   ========================================================================== */
"use strict";
/* --- Confirmation avant d'abandonner (helper global, réutilisé par le module Navigation) ---
   Renvoie une Promise résolue à true/false. On n'utilise pas window.confirm() :
   il gèle le fil d'exécution, ce qui interrompt la synthèse vocale du contrôleur. */
function rtConfirm(text, opts){
  opts=opts||{};
  const m=$('confirmModal'), yes=$('confirmYes'), no=$('confirmNo');
  if(!m) return Promise.resolve(window.confirm(text));   // repli si le markup manque
  $('confirmTitle').textContent=opts.title||'Abandonner ?';
  $('confirmText').textContent=text;
  yes.textContent=opts.ok||'Abandonner';
  no.textContent=opts.cancel||'Continuer';
  m.hidden=false;
  const prevFocus=document.activeElement;
  no.focus();
  return new Promise(resolve=>{
    function done(v){
      m.hidden=true;
      yes.removeEventListener('click',onYes); no.removeEventListener('click',onNo);
      m.removeEventListener('mousedown',onBack); document.removeEventListener('keydown',onKey);
      if(prevFocus && prevFocus.focus) try{ prevFocus.focus(); }catch(e){}
      resolve(v);
    }
    function onYes(){ done(true); }
    function onNo(){ done(false); }
    function onBack(e){ if(e.target===m) done(false); }        // clic sur le fond = annuler
    function onKey(e){ if(e.key==='Escape') done(false); }
    yes.addEventListener('click',onYes); no.addEventListener('click',onNo);
    m.addEventListener('mousedown',onBack); document.addEventListener('keydown',onKey);
  });
}

/* =========================================================================
   12) LOG + UTILS
   ========================================================================= */
function ts(){ const d=new Date(), p=n=>String(n).padStart(2,'0'); return p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
/* =========================================================================
   LE JOURNAL DES ÉCHANGES — refait le 01/10/2026 (demande du développeur :
   « c'est bizarrement construit »). Partagé par les Scénarios (logRow) et la
   Navigation (navigation.js › vfLog).
   Avant : une ligne par événement, « Vous » collé au texte, et deux lignes
   « — Éléments détectés : 2 / 4 » / « — Échange réussi. » sous chaque réponse.
   Maintenant, une CONVERSATION dans un encadré repliable « Échanges
   précédents » (fermé par défaut, téléphone et ordinateur) :
     · le contrôleur à gauche, vous à droite, chacun dans sa bulle ;
     · le score se pose SUR votre bulle (« 2 / 4 éléments », vert si complet)
       au lieu de deux lignes de plus ;
     · les titres « ━━ … ━━ » deviennent des séparateurs ;
     · les autres avis (micro, fréquence, aléa…) restent dans le journal ET
       s'affichent hors de l'encadré, dans .journal-avis, jusqu'à votre
       prochaine réponse — un encadré fermé ne doit pas cacher une alerte.
   La forme des appels ne change pas : logRow(kind, texte) et vfLog(qui,
   texte) font ce qu'ils faisaient, seul le rendu change.
   ========================================================================= */
const LOG_QUI={atc:'Contrôle', you:'Vous', sys:'Info'};
function journalAvis(boite, texte){
  const j=boite.closest('.journal'), a=j && j.previousElementSibling;
  if(!a || !a.classList.contains('journal-avis')) return;
  a.textContent=texte||''; a.hidden=!texte;
}
function journalCompter(boite){
  const j=boite.closest('.journal'), n=j && j.querySelector('.journal__n');
  if(n) n.textContent=String(boite.querySelectorAll('.j-msg.you').length);
}
function journalVider(boite){
  if(!boite) return;
  boite.innerHTML=''; journalAvis(boite,''); journalCompter(boite);
}
function journalLigne(boite, kind, text, qui){
  if(!boite) return null;
  if(boite.querySelector('.empty')) boite.innerHTML='';
  const t=String(text==null?'':text).trim();
  const vous=boite.querySelectorAll('.j-msg.you'), dernier=vous[vous.length-1]||null;
  // Le score se pose sur la dernière réponse, au lieu d'une ligne de plus.
  const sc=kind==='sys' && t.match(/^Éléments détectés : (\d+) \/ (\d+)$/);
  if(sc && dernier){
    let b=dernier.querySelector('.j-score');
    if(!b){ b=document.createElement('span'); b.className='j-score'; dernier.appendChild(b); }
    b.textContent=sc[1]+' / '+sc[2]+' élément'+(+sc[2]>1?'s':'');
    b.classList.toggle('ok', sc[1]===sc[2] && +sc[2]>0);
    return b;
  }
  if(kind==='sys' && t==='Échange réussi.' && dernier && dernier.querySelector('.j-score')){
    const b=dernier.querySelector('.j-score'); b.classList.add('ok'); return b;
  }
  const row=document.createElement('div');
  const sep=kind==='sys' && t.match(/^━━\s*(.*?)\s*━━$/);
  if(sep){ row.className='j-sep'; row.textContent=sep[1]; }
  else if(kind==='sys'){ row.className='j-note r sys'; row.textContent=t; journalAvis(boite, t); }
  else {
    row.className='j-msg r '+kind;
    row.innerHTML='<span class="who">'+escapeHtml(qui||LOG_QUI[kind]||kind)+'</span><span class="j-txt">'+escapeHtml(t)+'</span>';
    if(kind==='you') journalAvis(boite,'');
  }
  boite.appendChild(row); boite.scrollTop=boite.scrollHeight;
  journalCompter(boite);
  return row;
}
function clearLog(){ journalVider(el.log); }
function logRow(kind, text){ return journalLigne(el.log, kind, text); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
let toastTimer=null;
function showToast(msg){ el.toast.textContent=msg; el.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.toast.classList.remove('show'),2200); }
