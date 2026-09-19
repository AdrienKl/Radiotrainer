/* =============================================================================
   AVIERO — CE QUI PARLE À L'UTILISATEUR
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
function clearLog(){ el.log.innerHTML=''; }
/* Journal radio, au format du vol Navigation : un libellé court en petites
   capitales puis le texte, plutôt qu'un horodatage qui n'apprend rien. */
const LOG_QUI={atc:'Contrôle', you:'Vous', sys:'Info'};
function logRow(kind, text){
  if(!el.log) return;
  if(el.log.querySelector('.empty')) el.log.innerHTML='';
  const row=document.createElement('div');
  row.className='r '+kind;
  row.innerHTML='<span class="who">'+(LOG_QUI[kind]||kind)+'</span> '+escapeHtml(text);
  el.log.appendChild(row); el.log.scrollTop=el.log.scrollHeight;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
let toastTimer=null;
function showToast(msg){ el.toast.textContent=msg; el.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.toast.classList.remove('show'),2200); }
