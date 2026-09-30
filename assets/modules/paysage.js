/* =============================================================================
   Albatros VFR — Le téléphone à l'horizontale pendant un exercice
   -----------------------------------------------------------------------------
   30/09/2026, demande du développeur : « quand on lance une nav ou un scénario,
   le téléphone passe automatiquement en horizontal ; si les paramètres du
   téléphone refusent, un message dit qu'il faut le mettre en horizontal ».

   Ce que fait ce fichier, et rien d'autre :
     · il REPÈRE qu'une session est en cours — le bloc .nav-flight des
       Scénarios (#panel) ou de la Navigation (#navFlight) visible sur la page
       active — et le dit au CSS par body.en-session ;
     · sur un TÉLÉPHONE seulement, il demande le plein écran puis le verrouillage
       en paysage (Screen Orientation API) ;
     · si c'est refusé, il pose body.tourner-demande : la feuille affiche alors,
       en portrait uniquement, le message « Tournez votre téléphone ». Il
       disparaît de lui-même dès qu'on tourne l'écran ;
     · à la fin de la session, il rend tout : verrou, plein écran, message.

   ┌─ CE QUE LE NAVIGATEUR PERMET, ET CE QU'IL NE PERMET PAS ────────────────┐
   │ Chrome sur Android : oui, mais SEULEMENT en plein écran, et seulement    │
   │   dans la foulée d'un geste (le clic de lancement — l'activation dure    │
   │   quelques secondes, l'observateur ci-dessous passe bien avant).         │
   │ Safari sur iPhone : NON. Pas de plein écran pour une page, pas de        │
   │   verrouillage. Le message est donc le cas NORMAL sur iPhone, pas une    │
   │   panne — et c'est lui qui dit quoi faire si la rotation est bloquée.    │
   └───────────────────────────────────────────────────────────────────────────┘

   Le message n'enferme jamais : « Continuer en vertical » le ferme pour la
   session. Un téléphone dont la rotation est verrouillée et dont la personne ne
   trouve pas le réglage ne doit pas perdre l'exercice.

   Ce module n'emprunte rien : le DOM, « rt:page », et les API du navigateur,
   toutes derrière un test. Il ne touche ni au moteur ni à la Navigation.
   ========================================================================== */
(function(){
  'use strict';

  var sessions = ['panel', 'navFlight']
    .map(function(id){ return document.getElementById(id); })
    .filter(Boolean);
  if(!sessions.length) return;
  var corps = document.body;

  /* Un TÉLÉPHONE : écran tactile, et petit côté d'écran sous 600 px. Une
     tablette garde son orientation : l'exercice y tient dans les deux sens. */
  function telephone(){
    var tactile = false;
    try{ tactile = window.matchMedia('(pointer: coarse)').matches; }catch(e){}
    var cote = Math.min(screen.width || 9999, screen.height || 9999);
    return tactile && cote < 600;
  }

  /* ---------- Le message ---------- */
  var msg = document.createElement('div');
  msg.className = 'tourner';
  msg.setAttribute('role', 'alertdialog');
  msg.setAttribute('aria-modal', 'true');
  msg.setAttribute('aria-labelledby', 'tournerTitre');
  msg.innerHTML =
    '<div class="tourner__carte">' +
      '<svg class="tourner__tel" viewBox="0 0 64 64" aria-hidden="true">' +
        '<rect x="20" y="8" width="24" height="44" rx="4"/><path d="M29 46h6"/></svg>' +
      '<h2 id="tournerTitre">Tournez votre téléphone à l\'horizontale</h2>' +
      '<p>Les vols et les scénarios se font écran en largeur : l\'échange, la radio et la carte y tiennent côte à côte.</p>' +
      '<p class="tourner__aide">Rien ne bouge&nbsp;? La rotation de l\'écran est sans doute verrouillée. ' +
        'Déverrouillez-la dans le centre de contrôle (iPhone) ou les réglages rapides (Android).</p>' +
      '<button class="btn" type="button">Continuer en vertical</button>' +
    '</div>';
  corps.appendChild(msg);
  msg.querySelector('button').addEventListener('click', function(){
    corps.classList.add('vertical-accepte');
  });

  /* ---------- Plein écran et verrou ---------- */
  var parNous = false;      // le plein écran, c'est nous qui l'avons demandé
  function demander(){
    corps.classList.remove('vertical-accepte');
    if(!telephone()) return;
    var el = document.documentElement;
    var plein = (!document.fullscreenElement && el.requestFullscreen)
      ? el.requestFullscreen({ navigationUI:'hide' }).then(function(){ parNous = true; })
      : Promise.resolve();
    plein.then(function(){
      if(screen.orientation && screen.orientation.lock) return screen.orientation.lock('landscape');
      throw new Error('verrou indisponible');
    }).then(function(){
      corps.classList.remove('tourner-demande');
    }).catch(function(){
      /* Refusé ou impossible (iPhone) : on DEMANDE. La feuille n'affiche le
         message qu'en portrait — déjà à l'horizontale, rien ne s'affiche. */
      corps.classList.add('tourner-demande');
    });
  }
  function relacher(){
    corps.classList.remove('tourner-demande', 'vertical-accepte');
    try{ if(screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); }catch(e){}
    if(parNous && document.fullscreenElement && document.exitFullscreen){
      document.exitFullscreen().catch(function(){});
    }
    parNous = false;
  }
  /* Sortir du plein écran à la main (geste retour) fait tomber le verrou :
     s'il reste une session, on redemande par le message. */
  document.addEventListener('fullscreenchange', function(){
    if(!document.fullscreenElement){
      parNous = false;
      if(corps.classList.contains('en-session') && telephone()) corps.classList.add('tourner-demande');
    }
  });

  /* ---------- Début et fin de session ---------- */
  var etait = false;
  function verifier(){
    var en = sessions.some(function(s){
      return !s.classList.contains('hidden') && !!s.closest('.page.active');
    });
    if(en === etait) return;
    etait = en;
    corps.classList.toggle('en-session', en);
    if(en){ window.scrollTo(0, 0); demander(); }
    else relacher();
  }
  sessions.forEach(function(s){
    new MutationObserver(verifier).observe(s, { attributes:true, attributeFilter:['class'] });
  });
  window.addEventListener('rt:page', function(){ setTimeout(verifier, 0); });
  verifier();

  /* ---------- La rotation elle-même ----------
     Pendant qu'on tourne, la page change de mise en page d'un coup : tout ce
     qui a une transition (tiroir, pastilles, boutons) la jouerait en travers
     de l'écran. On coupe les transitions le temps du changement et on fait
     simplement apparaître la nouvelle disposition. Leaflet se recale seul sur
     l'événement resize ; on le relance une fois la mise en page posée, sans
     quoi la carte garde parfois une bande grise. */
  var minuterie = 0;
  function tourne(){
    corps.classList.add('en-rotation');
    clearTimeout(minuterie);
    minuterie = setTimeout(function(){
      corps.classList.remove('en-rotation');
      try{ window.dispatchEvent(new Event('resize')); }catch(e){}
    }, 450);
    if(corps.classList.contains('en-session')) window.scrollTo(0, 0);
  }
  try{
    var mq = window.matchMedia('(orientation: landscape)');
    if(mq.addEventListener) mq.addEventListener('change', tourne);
    else if(mq.addListener) mq.addListener(tourne);
  }catch(e){}
})();
