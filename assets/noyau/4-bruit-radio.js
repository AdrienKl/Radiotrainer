/* =============================================================================
   AVIERO — LE SOUFFLE DE LA RADIO
   -----------------------------------------------------------------------------
   Bruit de fond généré par Web Audio, sans aucun fichier son. Il se déclenche
   pendant que le contrôleur parle, et s'arrête avec lui.

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
   7) BRUIT RADIO (Web Audio, procédural, aucun fichier externe)
   ========================================================================= */
let audioCtx=null, noiseSrc=null, noiseGain=null;

/* Démarre le grésillement (uniquement si l'utilisateur a activé la case "Bruit radio").
   Idempotent : si le bruit tourne déjà, ne fait rien. Appelé au DÉBUT de la parole ATC. */
function startRadioNoise(){
  if(!state.noiseEnabled) return;
  if(noiseSrc) return;                       // déjà en cours
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended') audioCtx.resume();
    const size = 2*audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<size;i++) data[i] = Math.random()*2-1;
    noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = buffer; noiseSrc.loop = true;
    const bp = audioCtx.createBiquadFilter();
    bp.type='bandpass'; bp.frequency.value=1600; bp.Q.value=0.6;
    noiseGain = audioCtx.createGain(); noiseGain.gain.value=0.035;
    noiseSrc.connect(bp); bp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noiseSrc.start(0);
  }catch(e){ /* Web Audio indisponible */ }
}
/* Coupe le grésillement. Appelé à la FIN (ou à l'erreur) de la parole ATC, ou quand
   l'utilisateur décoche la case en plein milieu. */
function stopRadioNoise(){
  if(noiseSrc){ try{ noiseSrc.stop(); }catch(e){} try{ noiseSrc.disconnect(); }catch(e){} noiseSrc=null; }
}

