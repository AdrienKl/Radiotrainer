/* =============================================================================
   Albatros VFR — L'exercice en cours, et la rotation du téléphone
   -----------------------------------------------------------------------------
   Ce que fait ce fichier, et rien d'autre :
     · il REPÈRE qu'une session est en cours — le bloc .nav-flight des
       Scénarios (#panel) ou de la Navigation (#navFlight) visible sur la page
       active — et le dit au CSS par body.en-session. C'est ce qui allume la
       mise en page « téléphone couché » de 17-mouvements.css (§ 7 bis) ;
     · quand on TOURNE le téléphone, il coupe les transitions le temps du
       changement de mise en page, et relance la carte.

   ┌─ CE QUE CE FICHIER NE FAIT PLUS (30/09/2026) ────────────────────────────┐
   │ Première version, à la demande du développeur : au lancement d'un        │
   │ exercice sur téléphone, plein écran + verrouillage en paysage (Screen    │
   │ Orientation API), et un message « Tournez votre téléphone » si c'était   │
   │ refusé. Le message a été retiré le même jour, puis le passage automatique│
   │ en paysage aussi : la mise en page verticale tient bien, et c'est la     │
   │ personne qui choisit le sens de son téléphone. Plus aucun plein écran,   │
   │ plus aucun verrou : si on tourne le téléphone, la mise en page paysage   │
   │ prend la main ; sinon, on reste en vertical.                             │
   └───────────────────────────────────────────────────────────────────────────┘

   Ce module n'emprunte rien : le DOM et « rt:page ». Il ne touche ni au
   moteur ni à la Navigation.
   ========================================================================== */
(function(){
  'use strict';

  var sessions = ['panel', 'navFlight']
    .map(function(id){ return document.getElementById(id); })
    .filter(Boolean);
  if(!sessions.length) return;
  var corps = document.body;

  /* ---------- Début et fin de session ---------- */
  var etait = false;
  function verifier(){
    var en = sessions.some(function(s){
      return !s.classList.contains('hidden') && !!s.closest('.page.active');
    });
    if(en === etait) return;
    etait = en;
    corps.classList.toggle('en-session', en);
    if(en) window.scrollTo(0, 0);
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
