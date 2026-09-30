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
     · s'il est refusé, il n'insiste pas : la mise en page verticale suffit ;
     · à la fin de la session, il rend tout : verrou, plein écran.

   ┌─ LE MESSAGE « TOURNEZ VOTRE TÉLÉPHONE » A ÉTÉ RETIRÉ ─────────────────────┐
   │ Première version (30/09/2026) : un refus du verrou affichait, en         │
   │ portrait, un message plein écran demandant de tourner le téléphone. Le   │
   │ développeur l'a fait retirer le même jour : la mise en page verticale    │
   │ tient bien, le message gênait plus qu'il n'aidait. Sur iPhone, où Safari │
   │ ne sait ni passer en plein écran ni verrouiller, rien ne se passe donc : │
   │ on reste dans le sens où l'on tient le téléphone.                        │
   └───────────────────────────────────────────────────────────────────────────┘

   ┌─ CE QUE LE NAVIGATEUR PERMET ─────────────────────────────────────────────┐
   │ Chrome sur Android : oui, mais SEULEMENT en plein écran, et seulement    │
   │   dans la foulée d'un geste (le clic de lancement — l'activation dure    │
   │   quelques secondes, l'observateur ci-dessous passe bien avant).         │
   │ Safari sur iPhone : non, et ce n'est pas une panne.                      │
   └───────────────────────────────────────────────────────────────────────────┘

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

  /* ---------- Plein écran et verrou ---------- */
  var parNous = false;      // le plein écran, c'est nous qui l'avons demandé
  function demander(){
    if(!telephone()) return;
    var el = document.documentElement;
    var plein = (!document.fullscreenElement && el.requestFullscreen)
      ? el.requestFullscreen({ navigationUI:'hide' }).then(function(){ parNous = true; })
      : Promise.resolve();
    plein.then(function(){
      if(screen.orientation && screen.orientation.lock) return screen.orientation.lock('landscape');
      throw new Error('verrou indisponible');
    }).catch(function(){
      /* Refusé ou impossible (iPhone) : on reste dans le sens du téléphone. */
    });
  }
  function relacher(){
    try{ if(screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); }catch(e){}
    if(parNous && document.fullscreenElement && document.exitFullscreen){
      document.exitFullscreen().catch(function(){});
    }
    parNous = false;
  }
  document.addEventListener('fullscreenchange', function(){
    if(!document.fullscreenElement) parNous = false;
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
