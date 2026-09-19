/* =============================================================================
   AVIERO — LA RECONNAISSANCE VOCALE
   -----------------------------------------------------------------------------
   Une SEULE instance, créée au chargement et réutilisée à chaque appui sur
   l'alternat. C'est délibéré : un `new SR()` par appui fait redemander la
   permission micro à chaque fois.

   DEUX ÉCRANS, UNE INSTANCE. Les Exercices s'en servent directement ; le Vol en
   direct l'« emprunte » en posant un `recoSink`. C'est ce branchement qui
   casserait sans bruit — le micro semblerait mort dans l'un des deux, et on
   chercherait très loin de la cause. tests/parcours/micro.spec.js le couvre,
   avec une fausse reconnaissance vocale.

   (L'Épellation, elle, a sa propre instance : le module est autonome par
   conception. Il y a donc deux instances dans l'application, pas une.)

   LE MINUTEUR DE SILENCE n'est PAS armé à l'appui : il démarre au premier son
   transcrit et se ré-arme à chaque suivant. Tant que l'élève parle, ou marque
   une pause courte, l'écoute continue.

   Ce fichier lit `el` et `state`, déclarés plus loin dans le moteur. Ces
   lectures se font toutes dans des corps de fonctions, donc après le
   chargement complet de la page.

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
/* =========================================================================
   6) RECONNAISSANCE VOCALE (écoute continue + timer de silence 2,5 s)
   ========================================================================= */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SGL = window.SpeechGrammarList || window.webkitSpeechGrammarList;
const RECO_OK = !!SR;
let recognition=null, listening=false, sessionFinal="", silenceTimer=null;

/* Aiguillage de la reconnaissance vocale (ajouté pour le module Vol en direct).
   L'instance `recognition` est UNIQUE et créée une seule fois au chargement (recréer un
   `new SR()` fait redemander la permission micro — cf. commentaire ci-dessous). Le module
   Vol ne peut donc pas avoir la sienne : il « emprunte » celle-ci en posant un sink.
   Quand recoSink est null (cas par défaut), le comportement des Exercices est INCHANGÉ. */
let recoSink=null;
function setRecoSink(s){ recoSink=s; }

/* Messages d'erreur de la reconnaissance vocale, en clair.
   `lastRecoError` sert à ne PAS noter une réponse vide quand c'est le micro qui a
   échoué : sans ce garde, un micro refusé se soldait par un score de 0/3 laissant
   croire à une faute de phraséologie. */
let lastRecoError=null;
const RECO_ERREURS={
  'not-allowed':"Micro refusé. Autorisez le microphone : cliquez sur l'icône à gauche de l'adresse, puis « Microphone → Autoriser ».",
  'service-not-allowed':"Reconnaissance vocale bloquée par le navigateur. Vérifiez les autorisations du site.",
  'no-speech':"Aucune parole détectée. Parlez plus près du micro, puis réessayez.",
  'audio-capture':"Aucun micro détecté. Vérifiez qu'un microphone est branché et sélectionné.",
  'network':"La reconnaissance vocale de Chrome a besoin d'Internet : vérifiez votre connexion.",
  'aborted':"Écoute interrompue."
};

if(RECO_OK){
  // Point 2 : UNE SEULE instance créée au chargement de la page, réutilisée à chaque
  // pression PTT (start()/stop() sur le même objet). On n'appelle jamais `new SR()`
  // ailleurs — recréer l'instance à chaque clic est ce qui fait redemander la
  // permission micro. Si la permission est quand même redemandée en localhost, c'est
  // un réglage Chrome (cadenas → Microphone → Autoriser), plus un bug de code.
  recognition = new SR();
  recognition.lang='fr-FR';
  recognition.interimResults=true;
  recognition.continuous=true;          // section F : ne pas couper au 1er silence
  recognition.maxAlternatives=1;

  // Section D1 : grammaire de biais (best-effort — support navigateur inégal).
  // Le vrai filet de sécurité reste la correction floue en post-traitement.
  if(SGL){
    try{
      const words = [...new Set([...Object.values(NATO), 'zéro','unité','deux','trois','quatre',
        'cinq','six','sept','huit','neuf','piste','roulage','décollage','atterrissage','autorisé',
        'QNH','cap','vent','arrière','finale','base','numéro','contactez','intégrez','alignez',
        'point','attente','sol','tour','information','touch','go','dégagez','bretelle'])];
      const jsgf = '#JSGF V1.0; grammar aero; public <aero> = ' + words.join(' | ') + ' ;';
      const list = new SGL();
      list.addFromString(jsgf, 1);
      recognition.grammars = list;
    }catch(e){ /* API inconsistante : on ignore silencieusement */ }
  }

  // Point 1 : le minuteur de 2,5 s N'est PAS armé ici (au clic PTT) — il ne démarre
  // qu'au premier onresult, puis est ré-armé à chaque onresult. Tant que l'élève
  // parle (ou fait une pause < 2,5 s), l'écoute continue ; seul un silence de 2,5 s
  // APRÈS le dernier mot capté déclenche l'arrêt.
  recognition.onstart = ()=>{ listening=true; pttUI(true); };
  recognition.onresult = (e)=>{
    let interim="";
    for(let i=e.resultIndex; i<e.results.length; i++){
      const r=e.results[i];
      if(r.isFinal) sessionFinal += r[0].transcript + " ";
      else interim += r[0].transcript;
    }
    const _txt = (sessionFinal + interim).replace(/\s+/g,' ').trim();
    if(recoSink) recoSink.interim(_txt); else el.transText.value = _txt;
    armSilence();   // (ré)arme le compte à rebours à CHAQUE son transcrit
  };
  // Point 1 : neutraliser tout ce qui pourrait couper l'écoute en parallèle du minuteur.
  // Avec continuous=true, onspeechend/onaudioend ne stoppent pas la reco ; on ne leur
  // attache donc aucun handler d'arrêt (l'arrêt vient uniquement du minuteur ou du PTT).
  recognition.onspeechend = null;
  recognition.onaudioend = null;
  /* Les erreurs de reconnaissance doivent être VISIBLES là où l'utilisateur se trouve.
     Avant, elles partaient toutes dans le journal des Exercices : en Navigation le
     micro semblait simplement mort, sans le moindre message. */
  recognition.onerror = (e)=>{
    lastRecoError = e.error || 'unknown';
    const msg = RECO_ERREURS[lastRecoError] || ('Erreur de reconnaissance vocale ('+lastRecoError+').');
    if(recoSink && recoSink.error) recoSink.error(msg, lastRecoError);
    else logRow('sys', msg);
  };
  recognition.onend = ()=>{
    listening=false; pttUI(false); clearTimeout(silenceTimer);
    const _fin = sessionFinal.replace(/\s+/g,' ').trim();
    // Erreur micro sans un mot capté : ne rien noter, l'erreur est déjà affichée.
    if(lastRecoError && !_fin){ if(recoSink) return; el.validerBtn.disabled=false; return; }
    if(recoSink){ recoSink.final(_fin); return; }
    el.transText.value = _fin;
    el.validerBtn.disabled = false;
  };
}
// C1 : délai de silence 2,5 s (Débutant) / 1,5 s (Réel).
function armSilence(){
  clearTimeout(silenceTimer);
  // Réglage explicite s'il existe, sinon valeur liée à la difficulté (comportement d'origine).
  const pref=rtSettings().silence;
  const d = pref ? parseInt(pref,10) : ((state.difficulty==='reel')?1500:2500);
  silenceTimer=setTimeout(()=>stopListening(), d);
}
function startListening(){
  if(!RECO_OK){
    const m="Reconnaissance vocale indisponible sur ce navigateur (utilisez Chrome, Edge ou Safari).";
    if(recoSink && recoSink.error) recoSink.error(m,'unsupported'); else logRow('sys',m);
    return;
  }
  sessionFinal=""; lastRecoError=null;
  /* Une nouvelle prise efface la précédente. Les Exercices le faisaient déjà (ligne
     ci-dessous) ; le module Vol, lui, ne nettoyait rien : tant que le micro n'avait
     rien capté, l'ANCIENNE transcription restait affichée — et restait validable.
     On appuyait sur « Réenregistrer », on ne disait rien d'exploitable, et on notait
     la phrase d'avant. D'où ce point d'entrée, symétrique de interim/final/error. */
  if(recoSink){ if(recoSink.debut) recoSink.debut(); }
  else { el.transText.value=""; el.transWrap.classList.add('show'); el.validerBtn.disabled=true; }
  try{
    recognition.start();
  }catch(e){
    /* InvalidStateError = une session tourne encore (stop() est asynchrone : onend
       arrive après coup). On arrête proprement et on relance juste après, sinon le
       bouton semblait mort au deuxième appui. */
    if(listening){
      try{ recognition.stop(); }catch(_){}
      setTimeout(()=>{ try{ recognition.start(); }catch(_){ } }, 260);
    }else{
      const m="Impossible de démarrer le micro. Rechargez la page si le problème persiste.";
      if(recoSink && recoSink.error) recoSink.error(m,'start-failed'); else logRow('sys',m);
    }
  }
}
function stopListening(){ clearTimeout(silenceTimer); try{ recognition.stop(); }catch(e){} }

function pttUI(on){
  if(recoSink && recoSink.ui){ recoSink.ui(on); return; }   // module Vol : son propre bouton
  /* On ne reconstruit PLUS le contenu du bouton : il porte maintenant la même
     structure que celui du vol (icône + libellé dans un <span>), et la réécrire
     effaçait l'icône. On ne touche qu'au libellé et à l'état visuel. */
  el.pttBtn.classList.toggle('listening', on);
  var sp = el.pttBtn.querySelector('span');
  if(sp) sp.textContent = on ? 'Écoute… relâchez pour arrêter' : 'Maintenir pour parler';
}

/* Étape 2 — « push-to-talk » maintenu (comme un vrai PTT avion) : le micro écoute UNIQUEMENT
   tant que le bouton est enfoncé (souris OU tactile), et s'arrête au relâchement. Ne touche pas
   à la logique de reconnaissance : on ne fait que déclencher onStart/onStop. Helper global réutilisé
   par la section Exercices ET la section Épellation. */
/* Traîne de fin d'émission. Le doigt quitte le bouton avant que la dernière
   syllabe soit sortie : couper la capture pile au relâchement mange la fin du
   message. On rend donc la main À L'ŒIL tout de suite — le bouton repasse au
   repos — mais le micro continue d'enregistrer encore TRAINE_MS. */
const TRAINE_MS = 500;
function bindPushToTalk(btn, onStart, onStop){
  if(!btn) return;
  let held=false, finTimer=null;
  // Libellé de repos mémorisé au moment du branchement : chaque module a le sien.
  const sp=btn.querySelector('span');
  if(sp && !btn.dataset.labelRepos) btn.dataset.labelRepos=sp.textContent;
  const visuel=(ecoute)=>{ btn.classList.toggle('listening',ecoute);
    if(sp && !ecoute && btn.dataset.labelRepos) sp.textContent=btn.dataset.labelRepos; };
  const press=(e)=>{ if(e && e.type==='touchstart' && e.cancelable) e.preventDefault(); // évite le mousedown fantôme + le scroll
                     if(finTimer){            // ré-appui pendant la traîne : la capture n'a jamais cessé
                       clearTimeout(finTimer); finTimer=null; held=true; visuel(true); return; }
                     if(held) return; held=true;
                     /* On ne recoit pas pendant qu'on emet : presser l'alternat coupe
                        la parole en cours ET les diffusions en boucle. C'est le
                        comportement d'un vrai poste — et cela supprime au passage un
                        defaut tenace : Safari mettait la synthese en pause au demarrage
                        du micro puis la REPRENAIT au relachement, si bien qu'on
                        entendait l'ATIS « repartir » a chaque appui sur le micro. */
                     try{ voixCouperTout(); }catch(_){}
                     try{ onStart(); }catch(_){} };
  const release=()=>{ if(!held) return; held=false;
                      visuel(false);          // retour visuel immédiat…
                      if(finTimer) clearTimeout(finTimer);
                      finTimer=setTimeout(function(){   // …mais le micro tourne encore
                        finTimer=null; try{ onStop(); }catch(_){}
                      }, TRAINE_MS); };
  btn.addEventListener('mousedown', press);
  btn.addEventListener('mouseup', release);
  /* PAS de release sur mouseleave. Appuyer sur l'alternat fait apparaitre la zone
     de transcription : la mise en page se decale, le bouton glisse de sous le
     curseur, et le navigateur emet un mouseleave — l'enregistrement s'arretait
     donc de lui-meme 200 ms apres l'appui, sans que la souris ait bouge. Le
     mouseup pose sur window ci-dessous couvre deja le vrai cas « relache
     ailleurs que sur le bouton ». */
  btn.addEventListener('touchstart', press, {passive:false});
  btn.addEventListener('touchend', release);
  btn.addEventListener('touchcancel', release);
  // Filet de sécurité : si la souris est relâchée hors du bouton, on arrête quand même.
  window.addEventListener('mouseup', release);
  // Appui long tactile : neutraliser le menu contextuel qui casserait le PTT.
  btn.addEventListener('contextmenu', (e)=>e.preventDefault());
}

