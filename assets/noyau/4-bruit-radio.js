/* =============================================================================
   Albatros VFR — LE SOUFFLE DE LA RADIO
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
    noiseGain = audioCtx.createGain(); noiseGain.gain.value=niveauBruitRadio();
    noiseSrc.connect(bp); bp.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noiseSrc.start(0);
  }catch(e){ /* Web Audio indisponible */ }
}
/* Le niveau du souffle (Paramètres › Voix et micro, 29/09/2026). « moyen »
   est l'ancienne valeur fixe, 0,035 : un réglage absent ne change rien. */
function niveauBruitRadio(){
  let b='moyen';
  try{ b=(typeof rtSettings==='function' && rtSettings().bruit) || 'moyen'; }catch(e){}
  return b==='faible' ? 0.016 : b==='fort' ? 0.07 : 0.035;
}

/* Les bips du micro (29/09/2026) : un bip montant quand le micro s'ouvre, un
   descendant quand il se ferme — le repère qu'on a en vol en relâchant
   l'alternat. Joués dans le MÊME AudioContext que le souffle : en créer un
   second garderait deux sorties audio ouvertes. Courts (90 ms) et discrets,
   pour ne pas être pris par la reconnaissance vocale pour une parole.
   Réglage `bipsMicro` : absent = actifs. */
function bipMicro(ouvert){
  try{
    if(typeof rtSettings==='function' && rtSettings().bipsMicro===false) return;
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended') audioCtx.resume();
    const t=audioCtx.currentTime, o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type='sine';
    o.frequency.setValueAtTime(ouvert?880:1175, t);
    o.frequency.linearRampToValueAtTime(ouvert?1175:880, t+0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.09);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t+0.1);
  }catch(e){ /* Web Audio indisponible : pas de bip, rien d'autre ne change */ }
}

/* Coupe le grésillement. Appelé à la FIN (ou à l'erreur) de la parole ATC, ou quand
   l'utilisateur décoche la case en plein milieu. */
function stopRadioNoise(){
  if(noiseSrc){ try{ noiseSrc.stop(); }catch(e){} try{ noiseSrc.disconnect(); }catch(e){} noiseSrc=null; }
}

