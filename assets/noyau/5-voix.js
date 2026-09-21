/* =============================================================================
   Albatros VFR — LA VOIX DU CONTRÔLEUR
   -----------------------------------------------------------------------------
   Choix de la voix française, file d'attente, découpage en énoncés courts, et
   `speakATC()` qui parle au nom du contrôle.

   ┌─ DÉPLACÉE TELLE QUELLE, PAS UNE LIGNE MODIFIÉE ────────────────────────┐
   │ L'étape 2.2 n'améliore rien et ne remplace rien ici. La synthèse reste   │
   │ exactement celle qui fonctionnait avant — mêmes débits, même file,       │
   │ mêmes reprises. Le seul changement est qu'elle vit désormais dans un     │
   │ fichier à elle.                                                          │
   │                                                                          │
   │ CE QUE ÇA PRÉPARE : son contrat tient maintenant en trois symboles.      │
   │ Ce fichier n'emprunte au moteur que `state` (pour voiceRate), pour la    │
   │ résolution des gabarits et `ctrlOf`. Le jour où l'on voudra une autre    │
   │ synthèse — une voix serveur, un modèle distant — c'est cette frontière   │
   │ qu'il faudra réimplémenter, et rien d'autre. Elle était noyée dans       │
   │ 3 500 lignes ; elle est écrite ici.                                      │
   └──────────────────────────────────────────────────────────────────────────┘

   UNE VERRUE DÉPLACÉE SANS ÊTRE CORRIGÉE : l'écouteur `rt:page` qui retire les
   classes `in-session` / `in-recap` du body n'a rien à voir avec la voix. Le
   remettre à sa place serait un autre travail ; il fonctionne à l'identique
   d'où qu'il soit déclaré.

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
   5) SYNTHÈSE VOCALE
   ========================================================================= */
let frVoice=null, frVoices=[], voicePref=null;   // voicePref : nom de voix choisi (déclaré AVANT pickVoice — pas de TDZ)
function pickVoice(){
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  // Voix françaises en priorité ; repli sur toutes les voix si aucune FR détectée.
  frVoices = voices.filter(v=>/^fr/i.test(v.lang));
  if(!frVoices.length) frVoices = voices;
  // Voix retenue : celle choisie par l'élève (par nom) sinon la 1re FR.
  // NB : on lit `voicePref` (et pas state.voiceName) car pickVoice() est appelée au
  // chargement, AVANT la déclaration `const state = {…}` — accéder à `state` ici lèverait
  // une ReferenceError (zone morte temporelle) qui stopperait tout le reste du script.
  /* Chrome/macOS liste a la fois des voix LOCALES (Thomas, Amelie...) et des voix
     DISTANTES (« Google francais »), synthetisees sur le reseau. Ces dernieres
     demarrent parfois jamais et sont les premieres a etre coupees : prendre
     simplement frVoices[0] suffisait a rendre Chrome muet la ou Safari — qui n'a
     que des voix locales — fonctionnait. On prefere donc une voix locale, sauf
     si l'eleve en a explicitement choisi une autre dans les Parametres. */
  frVoice = frVoices.find(v=>v.name===voicePref)
         || frVoices.find(v=>v.localService)
         || frVoices[0] || null;
  // (Re)remplir le sélecteur — onvoiceschanged peut tirer plusieurs fois.
  const sel = document.getElementById('voiceSelect');
  if(sel){
    const cur = voicePref || (frVoice ? frVoice.name : '');
    sel.innerHTML = frVoices.map(v=>`<option value="${v.name}">${v.name}</option>`).join('');
    sel.value = cur;
  }
}
if(window.speechSynthesis){ pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

/* ---- AMORCE AUDIO (indispensable sur Chrome, sans effet ailleurs) ----
   Chrome refuse en silence toute synthese vocale tant que la page n'a pas recu
   un geste de l'utilisateur, et laisse suspendu tout AudioContext cree avant ce
   geste. Safari est permissif : d'ou une application audible sur Safari et
   totalement muette sur Chrome. On deverrouille donc les DEUX moteurs au tout
   premier geste, avec une utterance de volume nul — c'est un deverrouillage, pas
   un message. Le texte n'est volontairement pas vide : Chrome ignore purement et
   simplement une utterance sans contenu, qui ne deverrouille alors rien. */
(function(){
  var fait=false;
  var EVTS=['pointerdown','keydown','touchstart'];
  function amorce(){
    if(fait) return; fait=true;
    if(window.speechSynthesis){
      try{
        var u=new SpeechSynthesisUtterance('bonjour');
        u.volume=0; u.rate=1; u.lang='fr-FR';
        speechSynthesis.speak(u);
      }catch(e){}
    }
    try{ if(audioCtx && audioCtx.state==='suspended') audioCtx.resume(); }catch(e){}
    EVTS.forEach(function(ev){ document.removeEventListener(ev,amorce,true); });
  }
  EVTS.forEach(function(ev){ document.addEventListener(ev,amorce,true); });
})();

/* =========================================================================
   MOTEUR DE PAROLE
   -------------------------------------------------------------------------
   Trois defauts de Chrome rendaient l'application muette la ou Safari parlait :
     1. une utterance de plus d'une quinzaine de secondes est coupee, et laisse
        ensuite le moteur dans un etat ou PLUS RIEN ne sort — un seul ATIS
        (~385 caracteres une fois les chiffres epeles) suffisait a tout eteindre
        jusqu'au rechargement de la page ;
     2. un speak() emis dans la MEME tache qu'un cancel() est avale sans la
        moindre erreur — or chaque message du controleur commencait justement par
        couper le precedent puis parlait aussitot ;
     3. une voix distante peut ne jamais demarrer, sans evenement d'erreur.
   D'ou, respectivement : decoupage systematique en courtes phrases, speak()
   differe apres tout cancel(), et surveillance du demarrage avec repli sur la
   voix par defaut du navigateur.

   Un JETON invalide d'un coup toutes les reprises en attente : stop() arrete
   vraiment, et aucun minuteur ne peut ranimer la parole — c'est ce qui rendait
   autrefois l'ATIS impossible a couper.
   ========================================================================= */
var Voix=(function(){
  var MAX=140;                 // caracteres par utterance : ~6 s, moitie du seuil Chrome
  var file=[];                 // messages en attente
  var jeton=0;                 // invalide les reprises apres un stop()
  var enCours=false;           // une utterance est en vol
  var garde=null;              // surveillance du demarrage

  /* Decoupe un texte en morceaux surs : d'abord aux fins de phrase, puis aux
     virgules, enfin aux espaces. Aucun morceau ne depasse MAX caracteres. */
  function decouper(t){
    var brut=String(t==null?'':t).replace(/\s+/g,' ').trim();
    if(!brut) return [];
    var bouts=brut.split(/([.!?])\s+/), phrases=[], cur='';
    for(var i=0;i<bouts.length;i++){
      cur+=bouts[i];
      if(/^[.!?]$/.test(bouts[i])){ phrases.push(cur.trim()); cur=''; }
    }
    if(cur.trim()) phrases.push(cur.trim());
    var moyen=[];
    phrases.forEach(function(p){
      if(p.length<=MAX){ moyen.push(p); return; }
      var acc='';
      p.split(/,\s*/).forEach(function(b){
        var essai=acc?acc+', '+b:b;
        if(essai.length>MAX && acc){ moyen.push(acc); acc=b; } else acc=essai;
      });
      if(acc) moyen.push(acc);
    });
    var fin=[];
    moyen.forEach(function(p){
      while(p.length>MAX){
        var c=p.lastIndexOf(' ',MAX); if(c<40) c=MAX;
        fin.push(p.slice(0,c).trim()); p=p.slice(c).trim();
      }
      if(p) fin.push(p);
    });
    return fin.filter(Boolean);
  }

  function annulerGarde(){ if(garde){ clearTimeout(garde); garde=null; } }

  /* Arret franc : plus rien ne parle, plus rien ne reprendra.
     On n'annule QUE s'il y a reellement quelque chose a interrompre : un cancel()
     a vide, repete a chaque changement de page, participe lui aussi au blocage du
     moteur de Chrome. */
  function stop(){
    var avait = enCours;
    jeton++; file.length=0; enCours=false; annulerGarde();
    if(window.speechSynthesis){
      try{ if(avait || speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel(); }catch(e){}
    }
    if(typeof stopRadioNoise==='function') stopRadioNoise();
  }

  function pompe(){
    if(enCours || !file.length) return;
    var m=file[0];
    if(m.i>=m.phrases.length){                 // message termine
      file.shift();
      if(m.opts.onFin){ try{ m.opts.onFin(); }catch(e){} }
      pompe(); return;
    }
    enCours=true;
    emettre(m, m.phrases[m.i]);
  }

  function emettre(m, phrase){
    var mien=jeton;
    if(!window.speechSynthesis){ enCours=false; return; }
    var u=new SpeechSynthesisUtterance(phrase);
    /* Chrome renouvelle periodiquement sa liste de voix : une reference gardee
       d'un ancien getVoices() devient perimee et l'utterance reste muette. */
    var dispo=speechSynthesis.getVoices()||[];
    if(!frVoice || dispo.indexOf(frVoice)===-1) pickVoice();
    u.lang='fr-FR';
    // A la 3e tentative on abandonne la voix choisie : si elle ne demarre jamais
    // (voix distante indisponible), celle par defaut, elle, parlera.
    if(frVoice && m.essais<2) u.voice=frVoice;
    u.rate   = m.opts.rate  !=null ? m.opts.rate   : 1;
    u.pitch  = m.opts.pitch !=null ? m.opts.pitch  : 1;
    u.volume = m.opts.volume!=null ? m.opts.volume : 1;
    var parti=false, clos=false;
    function avancer(){                        // phrase dite : on passe a la suivante
      if(clos || mien!==jeton) return;
      clos=true; annulerGarde(); enCours=false;
      m.i++; m.essais=0; pompe();
    }
    function rater(e){
      if(clos || mien!==jeton) return;
      if(parti){ avancer(); return; }          // coupee en route : on enchaine
      /* « interrupted » / « canceled » veulent dire que NOUS avons coupe : il n'y
         a rien a rattraper, et retenter ferait repartir une parole qu'on venait
         d'arreter. */
      var voulu = e && (e.error==='interrupted' || e.error==='canceled');
      clos=true; annulerGarde(); enCours=false;
      if(voulu) return;
      if(m.essais<3){                          // n'a jamais demarre : on retente
        m.essais++;
        setTimeout(function(){ if(mien===jeton) pompe(); },250);
      } else { m.i++; m.essais=0; pompe(); }   // on renonce a CETTE phrase, pas au message
    }
    u.onstart=function(){
      if(mien!==jeton) return;
      parti=true; annulerGarde();
      if(!m.debut && m.opts.onDebut){ m.debut=true; try{ m.opts.onDebut(); }catch(e){} }
    };
    u.onend  = avancer;
    u.onerror= rater;
    try{ speechSynthesis.speak(u); }catch(e){ enCours=false; return; }
    /* Chrome met parfois le moteur en pause de lui-meme. Un resume() ponctuel,
       emis juste apres NOTRE propre speak(), le remet en marche. Il n'y a
       volontairement aucun minuteur d'entretien : c'est lui qui, autrefois,
       ranimait l'ATIS qu'on venait d'annuler. */
    try{ if(speechSynthesis.paused) speechSynthesis.resume(); }catch(e){}
    /* SURVEILLANCE DU DEMARRAGE — et rien de plus.
       Une premiere version annulait l'utterance des que onstart tardait de plus de
       deux secondes. C'etait le remede pire que le mal : Chrome met parfois une
       poignee de secondes a delivrer onstart alors que la parole est bel et bien
       prise en charge, et on coupait donc un message valide... pour le retenter,
       et le couper encore. Mesure faite au navigateur : la parole partait, on
       l'annulait, plus rien ne sortait.
       On ne conclut donc a l'echec QUE si le moteur se declare au repos alors
       qu'il devrait parler ; tant qu'il se dit occupe, on patiente. Et on
       n'annule jamais : le seul cas d'echec est celui ou il n'y a rien a annuler. */
    var patience=0, secoue=false;
    function veiller(){
      if(clos || parti || mien!==jeton) return;
      var occupe=false;
      try{ occupe = speechSynthesis.speaking || speechSynthesis.pending; }catch(e){}
      if(!occupe){ rater(); return; }          // moteur au repos : l'utterance a ete perdue
      patience++;
      /* Le moteur se dit occupe mais rien ne sort. Mesure au navigateur : dans cet
         etat l'utterance finit par demarrer... au bout de plusieurs secondes, ou
         jamais. On procede par paliers, du plus doux au plus brutal, sans jamais
         couper une parole qui a commence — a ce stade, rien n'a ete entendu. */
      if(patience===4 && !secoue){              // ~5 s de silence : on secoue le moteur
        secoue=true;
        try{ speechSynthesis.pause(); speechSynthesis.resume(); }catch(e){}
      } else if(patience>=8){                   // ~10 s : on repart de zero
        clos=true; annulerGarde(); enCours=false;
        if(m.essais<3){
          m.essais++;
          try{ speechSynthesis.cancel(); }catch(e){}
          setTimeout(function(){ if(mien===jeton) pompe(); },300);
        } else { m.i++; m.essais=0; pompe(); }
        return;
      }
      garde=setTimeout(veiller,1200);
    }
    garde=setTimeout(veiller, 1500);
  }

  /* Parole principale : remplace ce qui est en cours. */
  function parler(texte, opts){
    var phrases=decouper(texte);
    stop();
    if(!phrases.length) return;
    file.push({phrases:phrases,i:0,essais:0,opts:opts||{}});
    var mien=jeton;
    // Chrome avale un speak() emis dans la meme tache qu'un cancel() : on laisse
    // passer une tache avant de commencer.
    setTimeout(function(){ if(mien===jeton) pompe(); },120);
  }
  /* Parole d'ambiance : s'empile derriere, sans rien couper. */
  function empiler(texte, opts){
    var phrases=decouper(texte);
    if(!phrases.length) return;
    file.push({phrases:phrases,i:0,essais:0,opts:opts||{}});
    if(enCours) return;                        // la chaine en cours la prendra
    /* Rien ne parle : c'est nous qui demarrons. Meme precaution que dans
       parler() — un speak() emis dans la meme tache qu'un cancel() est avale par
       Chrome, et l'appel d'ambiance suit de peu un message du controleur. */
    var mien=jeton;
    setTimeout(function(){ if(mien===jeton) pompe(); },120);
  }
  function occupe(){ return enCours || file.length>0; }
  return { parler:parler, empiler:empiler, stop:stop, occupe:occupe };
})();

/* Coupe toute parole en cours. Conserve sous son ancien nom : il est appele un
   peu partout (changement de frequence, fin de vol, abandon d'un scenario). */
function voixCouper(){ Voix.stop(); }

/* Arret COMPLET : la parole en cours, mais aussi les diffusions en boucle (ATIS).
   Couper la seule parole ne suffit pas : la boucle garde un minuteur arme entre
   deux passages du message, et repartait donc toute seule quelques secondes plus
   tard. Chaque module y inscrit son propre arret de boucle. */
var VOIX_ARRETS=[];
function voixCouperTout(){
  VOIX_ARRETS.forEach(function(f){ try{ f(); }catch(e){} });
  Voix.stop();
}
/* Quitter la page ou masquer l'onglet doit couper la radio : sans ca, un ATIS
   lance continuait a parler par-dessus le reste de l'application. */
window.addEventListener('rt:page', voixCouperTout);
/* Changer de page ferme la session et le debriefing : sans cela, revenir sur les
   Scenarios montrait un configurateur masque, sans moyen de relancer quoi que ce soit. */
window.addEventListener('rt:page', function(){
  document.body.classList.remove('in-session','in-recap');
});
document.addEventListener('visibilitychange', function(){
  if(document.hidden) voixCouperTout();
});

function speakATC(rawText, urgent){
  /* Le bruit de fond radio est branche sur le debut et la fin REELS de la parole
     (onDebut/onFin) : il ne gresille donc que pendant que le controleur parle. */
  Voix.parler(fillSpeech(rawText), {
    // Debit et hauteur augmentes sur un message d'urgence (Mayday / Pan Pan).
    rate   : urgent ? Math.min(state.voiceRate + 0.12, 1.35) : state.voiceRate,
    pitch  : urgent ? 1.1 : 1.0,
    onDebut: startRadioNoise,
    onFin  : stopRadioNoise
  });
}

/* Autres appareils sur la fréquence (terrain non contrôlé / AFIS). On empile une utterance
   SANS annuler la parole ATC en cours (pas de speechSynthesis.cancel()), pour une ambiance réaliste
   d'auto-information. Purement audio : aucune réponse attendue, aucune incidence sur le scoring. */
const TRAFIC_CALLS = [
  "{TRAF}, vent arrière piste {PISTE}, {ADRM}.",
  "{TRAF}, en finale piste {PISTE}, {ADRM}.",
  "{TRAF}, au point d'attente piste {PISTE}, {ADRM}.",
  "{TRAF}, entrée vent arrière main gauche piste {PISTE}.",
  "{TRAF}, dégagé piste {PISTE}, je roule au parking, {ADRM}.",
  "{TRAF}, longue finale piste {PISTE}, {ADRM}."
];
const TRAFIC_CS = ["F-GKLM","F-BUCG","F-HDBA","F-GJKP","F-BXQR","F-HBQL"];
function speakExtra(rawText){
  /* Un autre appareil passe par la MÊME radio que le contrôleur : il grésille
     donc pareil. Sans onDebut/onFin, ces appels sortaient « propres » au milieu
     d'échanges bruités — l'oreille les prenait pour une voix hors fréquence. */
  Voix.empiler(fillSpeech(rawText), { rate:state.voiceRate, pitch:1.0, volume:0.9,
    onDebut:startRadioNoise, onFin:stopRadioNoise });
}
let _lastTrafKey=null;
function maybeSpeakTraffic(step){
  // Seulement en AFIS (côté actif non contrôlé), avec un terrain défini, ~55% du temps,
  // et pas pendant une urgence. Évite de doubler sur le même échange.
  if(!state.activeAd || ctrlOf(state.activeSide)) return;
  const sc = SCENARIOS[state.scenarioIndex];
  if(sc && sc.emergency) return;
  const key = state.scenarioIndex+':'+state.stepIndex;
  if(key===_lastTrafKey) return; _lastTrafKey=key;
  if(Math.random() >= 0.55) return;
  const call = pick(TRAFIC_CALLS).replace(/\{TRAF\}/g, phoneticCallsign(pick(TRAFIC_CS)));
  speakExtra(call);
}

