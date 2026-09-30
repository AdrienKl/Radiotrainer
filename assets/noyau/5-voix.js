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

   ┌─ DEUX MOTEURS DEPUIS LE 27/09/2026 ─────────────────────────────────────┐
   │ La frontière annoncée ci-dessus a servi : la voix Google (premium) est   │
   │ un SECOND moteur, à l'intérieur de Voix, et rien d'autre ne le sait.     │
   │ Les appelants — speakATC, speakExtra, les deux boucles ATIS, le bouton   │
   │ d'essai des Paramètres — n'ont pas changé d'une ligne. Voir « MOTEUR     │
   │ GOOGLE » plus bas : quand il s'active, comment il se replie, et pourquoi.│
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
    /* La voix Google se joue dans l'AudioContext du bruit radio. Safari ne
       laisse démarrer un AudioContext que DANS un geste : s'il n'existe pas
       encore quand Google est choisi, on le crée ici, au premier. On ne le
       crée pas pour les autres — un AudioContext ouvert garde la sortie audio
       éveillée, pour rien. */
    try{
      var r = (typeof rtSettings==='function') ? rtSettings() : {};
      /* Google est le moteur par défaut depuis la phase de lancement
         (29/09/2026) : sans choix explicite « Navigateur », on prépare. */
      if(!audioCtx && r && r.voixMoteur!=='navigateur')
        audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    }catch(e){}
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

  /* Le texte tel que decouper() le voit, avant découpe. Recoller les morceaux
     ne le redonnerait pas : une coupe à la virgule y perd la virgule. */
  function texteEntier(t){ return String(t==null?'':t).replace(/\s+/g,' ').trim(); }

  /* =======================================================================
     MOTEUR GOOGLE (premium) — ajouté le 27/09/2026
     -----------------------------------------------------------------------
     QUAND IL PARLE. À chaque début de message, et seulement si TOUT est
     réuni : les réglages disent voixMoteur 'google' (ou rien : c'est le défaut
     depuis le 29/09/2026), une voix est choisie (ou celle par défaut), une
     session est ouverte, le compte y a droit (accesGoogle), le moteur n'est pas en pause
     (voir plus bas), et le texte tient dans la limite de voix-atc. Sinon, rien
     ne change : c'est speechSynthesis, comme avant.
     Le plan lu dans le profil n'est qu'un raccourci — c'est la base qui
     décide, par voix_consommer() (sql/005). Un profil trafiqué dans le
     navigateur n'obtient qu'un 403, et la voix du navigateur.

     LE TEXTE ENTIER, en une requête. Le découpage en morceaux de 140
     caractères n'existe qu'à cause de Chrome (voir plus haut) ; Google n'en
     a pas besoin, et la phrase y gagne son intonation.

     LE MÊME SYSTÈME AUDIO. Le MP3 est décodé et joué dans l'AudioContext du
     bruit radio (4-bruit-radio.js). La file, stop(), onDebut / onFin — donc
     le grésillement — sont ceux de Voix : un message Google est un message
     comme un autre, dit d'un coup.

     LE REPLI, SILENCIEUX. Réponse autre que 200, plus de 4,5 s, décodage
     raté, sortie audio bloquée : le MÊME message repart aussitôt par
     speechSynthesis. L'élève n'est jamais prévenu pendant un exercice
     (décision du 27/09/2026) ; la cause part dans le journal de diagnostic.

     NE PAS INSISTER. Un 401, un 403 (compte gratuit, suspendu) ou un 429
     (quota) ne changeront pas d'ici la fin de la page : Google est coupé
     jusqu'au rechargement. Un 400 non plus — c'est une voix mal réglée, la
     même requête échouera pareil. Une panne ou un délai peuvent passer :
     pause de 5 minutes. Sans cela, chaque message attendrait 4,5 s avant de
     se replier.

     LE CACHE, en mémoire seulement — PAS une clé de stockage de plus
     (CLAUDE.md § 7.2). Les 30 derniers sons décodés. Il existe pour l'ATIS :
     sa boucle redit ~400 caractères toutes les trente secondes environ, et
     dix minutes d'écoute coûteraient sinon ~8 000 caractères de quota.
     ==================================================================== */
  var G = {
    DELAI: 4500,                 // ms : au-delà, la voix du navigateur prend le relais (phrase courte)
    DELAI_MAX: 10000,            // ms : plafond du délai, même pour un ATIS
    retards: 0,                  // délais dépassés d'affilée ; la pause ne vient qu'au deuxième
    PAUSE: 5*60*1000,            // ms : pause après une panne ou un délai
    CACHE_MAX: 30,
    TEXTE_MAX: 1000,             // la limite de voix-atc (logique.ts, TEXTE_MAX)
    coupe: false,                // jusqu'au rechargement (401 / 403 / 429 / 400)
    pauseJusqua: 0,
    cache: new Map(),            // clé → AudioBuffer ; l'ordre d'insertion fait le LRU
    requete: null,               // AbortController de la requête en cours
    source: null,                // AudioBufferSourceNode en lecture
    dernier: null,               // 'google' | 'navigateur' : qui a dit le dernier message
    erreur: null,                // le dernier échec : { cause, statut?, code? }
    liste: null                  // la promesse de la liste des voix, une fois par page
  };

  /* Les modèles, dans l'ordre où l'écran les présente. Le CODE est celui du
     nom de voix de Google (fr-FR-<code>-<nom>) ; le libellé est pour l'œil.
     C'est la seule table : les Paramètres et la console d'administration la
     lisent ici (Voix.FAMILLES_GOOGLE), et les tarifs s'y rattachent par le
     code (assets/admin/data/tarifs-voix.js). Aucune VOIX n'y est écrite : la
     liste vient de voix-atc, action « voix ». */
  var FAMILLES = [
    { code:'Chirp3-HD', libelle:'Chirp 3 HD' },
    { code:'Chirp-HD',  libelle:'Chirp HD' },
    { code:'Neural2',   libelle:'Neural2' },
    { code:'Studio',    libelle:'Studio' },
    { code:'Wavenet',   libelle:'WaveNet' }
  ];
  function familleDe(nom){
    for(var i=0;i<FAMILLES.length;i++){ if(String(nom).indexOf('fr-FR-'+FAMILLES[i].code+'-')===0) return FAMILLES[i]; }
    return null;
  }
  /* « Charon — Masculine », « Voix G — Masculine » : Google nomme certaines
     voix d'une seule lettre, qu'on ne laisse pas seule dans une liste. Écrit
     ICI parce que les Paramètres et la console d'administration l'affichent
     tous deux — deux écritures finiraient par dire deux choses. */
  /* `avecModele` : hors d'une liste rangée par modèle, « Voix G » ne dit pas
     laquelle — Neural2 et WaveNet en ont chacun une. On préfixe alors le
     modèle : « Neural2 · Voix G ». */
  function libelleDe(v, avecModele){
    var f=familleDe(v.nom); if(!f) return String(v.nom);
    var court=String(v.nom).slice(('fr-FR-'+f.code+'-').length);
    var g = v.genre==='F' ? 'Féminine' : v.genre==='M' ? 'Masculine' : '';
    return (avecModele ? f.libelle+' · ' : '') + (court.length<=2 ? 'Voix '+court : court) + (g ? ' — '+g : '');
  }

  function tracer(message, detail){
    try{ console.warn('[Albatros VFR] voix Google : ' + message, detail || ''); }catch(e){}
    try{ if(window.RTAdmin && RTAdmin.logError)
           RTAdmin.logError({ level:'warn', kind:'audio', key:'voix-google',
                              message:'Voix Google : ' + message, detail: detail || null }); }catch(e){}
  }

  /* =======================================================================
     UNE VOIX PAR CONTRÔLEUR — ajouté le 27/09/2026, demande du développeur
     -----------------------------------------------------------------------
     Changer de fréquence, c'est changer d'interlocuteur : la Tour, le Sol,
     l'Info n'ont pas la même voix. Chaque station reçoit un RANG, dans
     l'ordre où on l'entend pour la première fois dans la page : la première
     garde la voix choisie par l'élève, les suivantes prennent les voix
     d'après. Une station garde donc SA voix jusqu'au rechargement — la Tour
     qu'on retrouve après le Sol est la même Tour.

     QUI DIT QUOI. Les moteurs posent la station qui parle (Voix.station,
     depuis moteur.js › renderStep et navigation.js › messageATC) ; speakATC
     marque ses messages `controleur` ; une boucle ATIS passe sa propre
     station (opts.station). Les autres messages — l'essai des Paramètres,
     l'écoute de la console, les autres appareils — n'ont pas de station, et
     gardent la voix choisie.

     GOOGLE : les voix du MÊME modèle que celle choisie — même qualité, même
     prix (un Studio est cinq fois plus cher qu'un Chirp 3 HD : passer de
     l'un à l'autre au détour d'une fréquence changerait la facture sans que
     personne l'ait décidé). Jamais une voix désactivée par l'administration :
     la base la refuserait (voix_desactivee), et Google serait coupé jusqu'au
     rechargement. Genre opposé d'abord, pour que deux stations voisines ne
     se confondent pas. Tant que la liste n'est pas arrivée : la voix choisie.

     NAVIGATEUR : les autres voix françaises LOCALES (les voix distantes de
     Chrome démarrent mal, voir pickVoice), fr-FR d'abord. Une seule voix sur
     la machine : on joue sur la hauteur, pour qu'au moins le timbre change.
     ==================================================================== */
  var ST = { courante:null, rangs:{}, n:0 };
  function station(nom){
    ST.courante = (nom==null || nom==='') ? null : String(nom);
    /* La liste des voix se charge dès la PREMIÈRE station : chargée au premier
       changement, elle arrivait trop tard pour la deuxième, qui gardait la
       voix choisie. Seulement si Google est réellement en jeu — un compte
       gratuit n'a rien à demander. */
    if(ST.courante && !POOL.dispo && googleEnJeu()) chargerPoolGoogle();
  }
  /* QUI A DROIT À GOOGLE, du point de vue de la page — la base redécide à
     chaque message (voix_consommer, sql/009). Premium actif (date de fin
     comprise, comme premium_actif en base), administrateur, ou voix offerte
     par la phase de lancement (assets/modules/lancement.js : 3 vols et
     5 scénarios par jour). */
  function accesGoogle(p){
    if(!p) return false;
    if(p.role==='admin') return true;
    if(p.plan==='premium' && (!p.premium_jusqua || new Date(p.premium_jusqua) > new Date())) return true;
    try{ return !!(window.RTLancement && RTLancement.googleOffert()); }catch(e){ return false; }
  }
  /* Le moteur voulu. Un élève qui n'a jamais choisi a Google par défaut s'il y
     a droit (phase de lancement, 29/09/2026) : c'est la voix qu'on lui offre,
     et la lui cacher derrière un réglage revenait à ne pas l'offrir. Un choix
     explicite « Navigateur » est respecté. */
  function moteurVoulu(r){ return (r && r.voixMoteur) || 'google'; }
  function googleEnJeu(){
    try{
      var r = (typeof rtSettings==='function') ? rtSettings() : null;
      var p = window.RTAuth && RTAuth.profil && RTAuth.profil();
      return !!(r && moteurVoulu(r)==='google' && accesGoogle(p));
    }catch(e){ return false; }
  }
  function rangDe(nom){
    if(nom==null) return 0;
    if(!Object.prototype.hasOwnProperty.call(ST.rangs, nom)) ST.rangs[nom] = ST.n++;
    return ST.rangs[nom];
  }
  // Le rang du contrôleur qui dit CE message (0 = la voix choisie).
  function rangMessage(m){
    var o = m.opts || {};
    if(o.station !== undefined) return rangDe(o.station);
    return o.controleur ? rangDe(ST.courante) : 0;
  }

  var POOL = { dispo:null, charge:false, essai:0, defaut:null };   // voix Google proposées : [{nom, genre}]
  function chargerPoolGoogle(){
    // Un échec ne se retente pas à chaque message : une fois par minute au plus.
    if(POOL.charge || Date.now() - POOL.essai < 60000) return;
    POOL.charge = true; POOL.essai = Date.now();
    var c = null;
    try{ c = window.RTAuth && RTAuth.client && RTAuth.client(); }catch(e){}
    var catalogue = (c && c.from)
      ? Promise.resolve(c.from('voix_catalogue').select('voix,active,par_defaut'))
          .then(function(r){ return (r && !r.error && r.data) || []; }, function(){ return []; })
      : Promise.resolve([]);
    Promise.all([listerVoix(), catalogue]).then(function(t){
      var coupees = {}, parDefaut = null;
      t[1].forEach(function(x){ if(x && !x.active) coupees[x.voix] = 1; if(x && x.par_defaut) parDefaut = x.voix; });
      POOL.dispo = (t[0] || []).filter(function(v){ return v && v.nom && !coupees[v.nom]; });
      /* La voix de qui n'en a pas choisi : celle que l'administration a mise
         par défaut, sinon la première du premier modèle — la même règle que
         la liste des Paramètres (parametres.js › remplirVoixGoogle). */
      var noms = [];
      FAMILLES.forEach(function(f){ POOL.dispo.forEach(function(v){ if(familleDe(v.nom)===f) noms.push(v.nom); }); });
      POOL.defaut = (parDefaut && noms.indexOf(parDefaut)>=0) ? parDefaut : (noms[0] || null);
    }, function(){ POOL.charge = false; });   // échec : on réessaiera au message suivant
  }
  /* Sans voix choisie, le premier message d'un vol attend la liste : on la
     demande dès l'entrée sur une page qui parle, pas au premier message —
     sinon la Tour de départ parlerait toujours avec la voix du navigateur. */
  window.addEventListener('rt:page', function(e){
    var p = e && e.detail && e.detail.page;
    if((p==='navigation' || p==='exercices') && !POOL.dispo && googleEnJeu()) chargerPoolGoogle();
  });
  function voixGoogleDuRang(choisie, rang){
    if(!rang) return choisie;
    if(!POOL.dispo){ chargerPoolGoogle(); return choisie; }   // pas encore arrivée
    var f = familleDe(choisie); if(!f) return choisie;
    var genreC = null, autres = [];
    POOL.dispo.forEach(function(v){
      if(v.nom===choisie) genreC = v.genre;
      else if(familleDe(v.nom)===f) autres.push(v);
    });
    if(!autres.length) return choisie;
    var opp = autres.filter(function(v){ return genreC && v.genre && v.genre!==genreC; });
    var meme = autres.filter(function(v){ return opp.indexOf(v)<0; });
    var ordre = [choisie];
    for(var i=0; i<Math.max(opp.length, meme.length); i++){
      if(opp[i]) ordre.push(opp[i].nom);
      if(meme[i]) ordre.push(meme[i].nom);
    }
    return ordre[rang % ordre.length];
  }
  // Voix du navigateur et facteur de hauteur pour un rang donné.
  var HAUTEURS = [1, 0.86, 1.14, 0.93, 1.07];
  function voixNavigateurDuRang(rang){
    if(!rang || !frVoice) return { voix:frVoice, hauteur:1 };
    var locales = frVoices.filter(function(v){ return v.localService && !/grand(ma|pa)/i.test(v.name); });
    var franceFr = locales.filter(function(v){ return /^fr[-_]FR/i.test(v.lang); });
    var pool = franceFr.length >= 2 ? franceFr : locales;
    var ordre = [frVoice].concat(pool.filter(function(v){ return v !== frVoice; }));
    return { voix:ordre[rang % ordre.length], hauteur:HAUTEURS[Math.floor(rang / ordre.length) % HAUTEURS.length] };
  }

  /* La voix Google à employer pour CE message, ou null. */
  function voixGoogle(m){
    if(G.coupe || Date.now() < G.pauseJusqua) return null;
    if(!m.texte || m.texte.length > G.TEXTE_MAX) return null;
    if(!window.fetch || !(window.AudioContext || window.webkitAudioContext)) return null;
    try{
      /* opts.voixGoogle : une voix IMPOSÉE pour ce message — l'écoute d'une voix
         depuis la console d'administration, sans toucher au réglage de
         l'administrateur. Le compte doit toujours être premium : c'est la base
         qui décompte, et elle ne fait pas d'exception. */
      var forcee = m.opts && m.opts.voixGoogle;
      var r = (typeof rtSettings==='function') ? rtSettings() : null;
      if(!forcee && (!r || moteurVoulu(r)!=='google')) return null;
      var A = window.RTAuth;
      if(!A || !A.utilisateur || !A.utilisateur()) return null;
      var p = A.profil && A.profil();
      if(forcee) return (p && (p.plan==='premium' || p.role==='admin')) ? String(forcee) : null;
      if(!accesGoogle(p)) return null;
      var choisie = r.voixGoogle || POOL.defaut;
      if(!choisie){ chargerPoolGoogle(); return null; }   // la liste arrive : ce message-ci part au navigateur
      return voixGoogleDuRang(String(choisie), rangMessage(m));
    }catch(e){ return null; }
  }

  function contexteAudio(){
    try{
      audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
      return audioCtx;
    }catch(e){ return null; }
  }

  /* Un AudioContext suspendu ne joue rien, et n'émet jamais `onended` : la
     file resterait bloquée pour toujours. On ne lance donc la lecture que
     s'il tourne vraiment ; sinon, repli. */
  function contexteQuiTourne(){
    var ctx = contexteAudio();
    if(!ctx) return Promise.reject({ cause:'audio' });
    if(ctx.state==='running') return Promise.resolve(ctx);
    return new Promise(function(ok, ko){
      var fini=false;
      var t=setTimeout(function(){ if(!fini){ fini=true; ko({ cause:'audio' }); } }, 800);
      try{
        Promise.resolve(ctx.resume()).then(function(){
          if(fini) return; fini=true; clearTimeout(t);
          if(ctx.state==='running') ok(ctx); else ko({ cause:'audio' });
        }, function(){ if(!fini){ fini=true; clearTimeout(t); ko({ cause:'audio' }); } });
      }catch(e){ if(!fini){ fini=true; clearTimeout(t); ko({ cause:'audio' }); } }
    });
  }

  /* decodeAudioData à rappels : l'ancien Safari ne connaît pas la forme à
     promesse. */
  function decoder(octets){
    var ctx = contexteAudio();
    if(!ctx) return Promise.reject({ cause:'audio' });
    return new Promise(function(ok, ko){
      try{
        var p = ctx.decodeAudioData(octets, ok, function(){ ko({ cause:'decodage' }); });
        if(p && p.catch) p.catch(function(){ ko({ cause:'decodage' }); });
      }catch(e){ ko({ cause:'decodage' }); }
    });
  }

  function cacheLire(cle){
    if(!G.cache.has(cle)) return null;
    var b = G.cache.get(cle);
    G.cache.delete(cle); G.cache.set(cle, b);   // le plus récent passe en dernier
    return b;
  }
  function cacheEcrire(cle, b){
    G.cache.set(cle, b);
    while(G.cache.size > G.CACHE_MAX) G.cache.delete(G.cache.keys().next().value);
  }

  /* Un appel à voix-atc, borné à G.DELAI. `lire(reponse)` transforme une
     réponse 200 ; toute autre rejette avec { cause, statut?, code? }.
     `suivie` : la requête est celle d'un message, que stop() doit pouvoir
     interrompre (la liste des voix, elle, ne l'est pas). */
  function appeler(corps, lire, suivie, delaiMax){
    var cfg = window.RT_SUPABASE, A = window.RTAuth;
    var c = null;
    try{ c = A && A.client && A.client(); }catch(e){}
    if(!cfg || !cfg.url || !c || !c.auth) return Promise.reject({ cause:'session' });
    var ctrl = window.AbortController ? new AbortController() : null;
    if(suivie) G.requete = ctrl;
    var minuterie = null;
    var delai = new Promise(function(_, ko){
      minuterie = setTimeout(function(){
        try{ if(ctrl) ctrl.abort(); }catch(e){}
        ko({ cause:'delai' });
      }, delaiMax || G.DELAI);
    });
    var travail = c.auth.getSession().then(function(r){
      var jeton = r && r.data && r.data.session && r.data.session.access_token;
      if(!jeton) throw { cause:'session' };
      return fetch(cfg.url + '/functions/v1/voix-atc', {
        method:'POST',
        headers:{ 'Authorization':'Bearer ' + jeton, 'Content-Type':'application/json' },
        body: JSON.stringify(corps),
        signal: ctrl ? ctrl.signal : undefined
      });
    }).then(function(rep){
      if(rep.status===200) return lire(rep);
      return rep.text().then(function(t){
        var code=null; try{ code = JSON.parse(t).erreur; }catch(e){}
        throw { cause:'http', statut:rep.status, code:code };
      }, function(){ throw { cause:'http', statut:rep.status }; });
    }, function(e){
      if(e && e.cause) throw e;
      throw { cause:'reseau', detail: e && e.name };
    });
    return Promise.race([travail, delai]).then(function(b){
      clearTimeout(minuterie); if(G.requete===ctrl) G.requete=null; return b;
    }, function(e){
      clearTimeout(minuterie); if(G.requete===ctrl) G.requete=null; throw e;
    });
  }

  /* Le son d'un message. */
  function telecharger(texte, voix, debit, hauteur, delaiMax){
    return appeler({ action:'dire', texte:texte, voix:voix, debit:debit, hauteur:hauteur },
                   function(rep){ return rep.arrayBuffer().then(decoder); }, true, delaiMax);
  }

  /* La liste des voix proposées, telle que voix-atc la renvoie (voices.list de
     Google, filtrée par famille). Une fois par page : elle ne change pas d'une
     minute à l'autre, et chaque ouverture des Paramètres la redemanderait.
     Un échec n'est PAS gardé : la prochaine demande réessaie. */
  function listerVoix(){
    if(G.liste) return G.liste;
    G.liste = appeler({ action:'voix' }, function(rep){
      return rep.json().then(function(d){ return (d && d.voix) || []; });
    }, false).then(null, function(e){ G.liste = null; throw e; });
    return G.liste;
  }

  /* Ce qu'un échec dit de la suite : couper jusqu'au rechargement, faire
     une pause, ou rien (un souci de sortie audio n'est pas la faute de
     Google). */
  /* Le délai d'un message, selon sa LONGUEUR. Panne du 29/09/2026 : la voix
     réaliste ne parlait plus en Navigation ni en Scénario, mais parlait dans
     l'administration. La base comptait bien les messages (250 à 450
     caractères) : Google répondait, trop tard. Un délai fixe de 4,5 s tenait
     pour la phrase d'essai (113 caractères) ; un message de contrôleur ou un
     ATIS en Chirp 3 HD le dépassait, le navigateur prenait le relais — et le
     message était facturé sans être entendu. */
  function delaiPour(texte){
    var n = String(texte||'').length;
    return Math.min(G.DELAI_MAX, G.DELAI + Math.max(0, n - 120) * 14);
  }
  function noterEchec(e){
    G.erreur = e || { cause:'inconnu' };
    var statut = e && e.statut;
    /* UN retard ne coupe plus rien : c'est souvent le premier message, qui
       réveille la fonction. Il fallait sinon attendre 5 minutes pour réentendre
       la voix réaliste. La pause ne vient qu'au deuxième retard d'affilée. */
    if(e && e.cause==='delai' && ++G.retards < 2){
      tracer('trop lente pour ce message, voix du navigateur pour celui-ci');
      return;
    }
    if(e && e.cause==='http' && (statut===400 || statut===401 || statut===403 || statut===429)){
      G.coupe = true;
      tracer('désactivée jusqu\'au rechargement (' + statut + (e.code ? ' ' + e.code : '') + ')');
    } else if(e && e.cause==='audio'){
      tracer('sortie audio indisponible, voix du navigateur pour ce message');
    } else {
      G.pauseJusqua = Date.now() + G.PAUSE;
      tracer('en pause 5 minutes (' + ((e && e.cause) || 'inconnu') + (statut ? ' ' + statut : '') + ')');
    }
  }

  function emettreGoogle(m, voix){
    var mien = jeton;
    var o = m.opts;
    var debit = o.rate!=null ? Math.round(o.rate*100)/100 : 1;
    // pitch est un facteur (1,1 en urgence) ; Google attend des demi-tons.
    var hauteur = (o.pitch!=null && o.pitch>0) ? Math.round(12*Math.log(o.pitch)/Math.LN2*100)/100 : 0;
    var cle = voix + '|' + debit + '|' + hauteur + '|' + m.texte;
    var enCache = cacheLire(cle);
    var obtenu = enCache ? Promise.resolve(enCache)
                         : telecharger(m.texte, voix, debit, hauteur, o.delaiGoogle || delaiPour(m.texte)).then(function(b){ G.retards = 0; cacheEcrire(cle, b); return b; });
    obtenu.then(function(b){
      if(mien!==jeton) return;                 // stop() est passé entre-temps
      return contexteQuiTourne().then(function(ctx){
        if(mien!==jeton) return;
        jouer(m, ctx, b, mien);
      });
    }).then(null, function(e){
      if(mien!==jeton) return;                 // annulé : ni repli, ni pénalité
      noterEchec(e);
      m.google = 'echec';                      // le MÊME message, par le navigateur
      enCours = false;
      pompe();
    });
  }

  function jouer(m, ctx, b, mien){
    var src = ctx.createBufferSource();
    src.buffer = b;
    var g = ctx.createGain();
    g.gain.value = m.opts.volume!=null ? m.opts.volume : 1;
    src.connect(g); g.connect(ctx.destination);
    G.source = src;
    G.dernier = 'google'; G.erreur = null;
    src.onended = function(){
      if(G.source===src) G.source = null;
      try{ src.disconnect(); g.disconnect(); }catch(e){}
      if(mien!==jeton) return;                 // coupé par stop() : pas de onFin
      m.i = m.phrases.length;                  // tout le message est dit
      enCours = false;
      pompe();                                 // → onFin, puis le message suivant
    };
    if(!m.debut && m.opts.onDebut){ m.debut=true; try{ m.opts.onDebut(); }catch(e){} }
    src.start(0);
  }

  /* Arret franc : plus rien ne parle, plus rien ne reprendra.
     On n'annule QUE s'il y a reellement quelque chose a interrompre : un cancel()
     a vide, repete a chaque changement de page, participe lui aussi au blocage du
     moteur de Chrome. */
  function stop(){
    var avait = enCours;
    /* Ce qui parlait passait-il par Google ? Alors speechSynthesis n'a rien à
       annuler — et un cancel() à vide, on l'a vu plus haut, participe au
       blocage de Chrome. */
    var viaGoogle = !!(G.source || G.requete);
    jeton++; file.length=0; enCours=false; annulerGarde();
    if(G.requete){ try{ G.requete.abort(); }catch(e){} G.requete=null; }
    if(G.source){ try{ G.source.stop(); }catch(e){} G.source=null; }
    if(window.speechSynthesis){
      try{ if((avait && !viaGoogle) || speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel(); }catch(e){}
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
    /* Début d'un message : Google, s'il est actif. Une seule tentative par
       message — après un échec, m.google vaut 'echec' et on ne revient ici
       que pour la voix du navigateur. */
    if(m.i===0 && m.google===undefined){
      var v = voixGoogle(m);
      if(v){ m.google='essai'; emettreGoogle(m, v); return; }
      m.google='non';
    }
    if(m.i===0) G.dernier = 'navigateur';
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
    var vn = voixNavigateurDuRang(rangMessage(m));   // une voix par contrôleur
    if(vn.voix && m.essais<2) u.voice=vn.voix;
    u.rate   = m.opts.rate  !=null ? m.opts.rate   : 1;
    u.pitch  = Math.min(2, (m.opts.pitch !=null ? m.opts.pitch : 1) * vn.hauteur);
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
  /* La prononciation OACI (1-alphabet-nombres.js › prononciationRadio), ICI et
     non chez chaque appelant : avant le 30/09/2026, seuls les exercices
     l'appliquaient — l'essai des Paramètres et l'écoute de l'administration
     disaient « Whiskey » à la française, et on jugeait une voix sur autre
     chose que ce qu'entend l'élève. opts.brut : la phrase telle quelle
     (l'onglet Prononciation de l'administration, pour comparer). */
  function prononcer(texte, opts){
    if(opts && opts.brut) return texte;
    try{ return (typeof prononciationRadio==='function') ? prononciationRadio(texte) : texte; }catch(e){ return texte; }
  }
  function parler(texte, opts){
    texte=prononcer(texte, opts);
    var phrases=decouper(texte);
    stop();
    if(!phrases.length) return;
    file.push({phrases:phrases,i:0,essais:0,opts:opts||{},texte:texteEntier(texte)});
    var mien=jeton;
    // Chrome avale un speak() emis dans la meme tache qu'un cancel() : on laisse
    // passer une tache avant de commencer.
    setTimeout(function(){ if(mien===jeton) pompe(); },120);
  }
  /* Parole d'ambiance : s'empile derriere, sans rien couper. */
  function empiler(texte, opts){
    texte=prononcer(texte, opts);
    var phrases=decouper(texte);
    if(!phrases.length) return;
    file.push({phrases:phrases,i:0,essais:0,opts:opts||{},texte:texteEntier(texte)});
    if(enCours) return;                        // la chaine en cours la prendra
    /* Rien ne parle : c'est nous qui demarrons. Meme precaution que dans
       parler() — un speak() emis dans la meme tache qu'un cancel() est avale par
       Chrome, et l'appel d'ambiance suit de peu un message du controleur. */
    var mien=jeton;
    setTimeout(function(){ if(mien===jeton) pompe(); },120);
  }
  function occupe(){ return enCours || file.length>0; }

  /* Ce que le moteur Google sait de lui-même — pour les Paramètres, qui
     doivent pouvoir dire pourquoi l'essai est sorti avec la voix du
     navigateur. Pendant un exercice, personne ne le lit : le repli y reste
     silencieux (décision du 27/09/2026). */
  function etatGoogle(){
    return { coupe:G.coupe, enPause:Date.now() < G.pauseJusqua,
             dernier:G.dernier, erreur:G.erreur };
  }
  /* L'élève vient de changer de voix ou de moteur : ce qui avait coupé Google
     (un 400 sur une voix mal réglée, typiquement) ne vaut plus. */
  function relancerGoogle(){ G.coupe=false; G.pauseJusqua=0; G.erreur=null; }

  /* À appeler DANS le clic d'une écoute (console d'administration, Paramètres).
     Panne du 27/09/2026 : « Écouter » ne marchait pas dans Admin › Voix Google.
     L'AudioContext n'est créé au premier geste que si le RÉGLAGE dit Google ;
     un administrateur resté sur « Navigateur » n'en avait pas, il naissait
     après la réponse de voix-atc — hors de tout geste — et Safari le laisse
     alors suspendu : repli sur la voix du navigateur, elle-même muette hors
     geste. Le créer et le relancer ici, pendant le clic, suffit. */
  function preparerAudio(){
    var ctx = contexteAudio();
    try{ if(ctx && ctx.state==='suspended') ctx.resume(); }catch(e){}
  }

  /* Les graphies réglées depuis l'administration (sql/013, table
     `prononciations`, lecture publique). Une fois par page, dès qu'un client
     Supabase existe ; rappelée par l'administration après un enregistrement.
     Un échec ne coûte rien : la table du code (PRONONCIATION_BASE) reste. */
  var PRON = { charge:false };
  function chargerPrononciations(forcer){
    if(PRON.charge && !forcer) return Promise.resolve(false);
    var c = null;
    try{ c = window.RTAuth && RTAuth.client && RTAuth.client(); }catch(e){}
    if(!c || !c.from || typeof definirPrononciations!=='function') return Promise.resolve(false);
    PRON.charge = true;
    return Promise.resolve(c.from('prononciations').select('mot,dit')).then(function(r){
      if(r && !r.error && Array.isArray(r.data)){ definirPrononciations(r.data); return true; }
      PRON.charge = false; return false;
    }, function(){ PRON.charge = false; return false; });
  }
  window.addEventListener('rt:auth', function(){ chargerPrononciations(); });
  window.addEventListener('rt:page', function(){ chargerPrononciations(); });

  return { parler:parler, empiler:empiler, stop:stop, occupe:occupe,
           rechargerPrononciations:function(){ return chargerPrononciations(true); },
           voixGoogle:listerVoix, etatGoogle:etatGoogle, relancerGoogle:relancerGoogle,
           preparerAudio:preparerAudio, station:station,
           FAMILLES_GOOGLE:FAMILLES, familleGoogle:familleDe, libelleGoogle:libelleDe };
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
    controleur: true,   // la voix de la station en ligne (Voix.station)
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

