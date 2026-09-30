/* =============================================================================
   Albatros VFR — Les mouvements
   -----------------------------------------------------------------------------
   Ajouté le 30/09/2026, à la demande du développeur : « des transitions un peu à
   la Apple iOS 26 », dans le menu, les Paramètres, et sur téléphone.

   Trois choses, et rien d'autre :
     1. LA PASTILLE QUI GLISSE. Dans chaque groupe où une seule entrée est
        choisie (menu, onglets des Paramètres, boutons segmentés),
        une pastille part de l'ancienne entrée et va se poser sous la nouvelle,
        avec un léger rebond, au lieu que le fond saute d'un coup.
     2. L'ENCADRÉ « Chrome, Edge ou Safari » des écrans de connexion et
        d'inscription : une ligne de plus quand ce navigateur-ci n'a pas de
        reconnaissance vocale.

   ┌─ AU REPOS, LE DOCUMENT EST EXACTEMENT CELUI D'AVANT ─────────────────┐
   │ La pastille ne se voit que PENDANT le glissement (classe .glisse, une │
   │ demi-seconde). Le reste du temps, l'entrée choisie porte son propre   │
   │ fond, comme avant ce module. Ce n'est pas qu'une précaution de style :│
   │ tests/parcours/contraste.spec.js lit la couleur de fond RÉSOLUE de    │
   │ chaque texte. Une option blanche posée sur un fond transparent, avec  │
   │ la pastille violette derrière elle en élément frère, y serait lue     │
   │ « blanc sur gris clair » — un échec qui n'existe pas à l'écran, et    │
   │ qu'on finirait par croire.                                            │
   └───────────────────────────────────────────────────────────────────────┘

   Ce module n'emprunte RIEN au moteur ni aux autres modules : il lit le DOM,
   écoute « rt:page » (routeur.js). Il ne pose aucune classe que d'autres
   lisent. Il observe les classes au lieu d'être appelé : les onglets
   des Paramètres, les segmentés de la Navigation et le menu changent leur
   entrée active chacun à sa façon, et aucun n'a eu à être touché.
   ========================================================================== */
(function(){
  'use strict';

  var reduit = false;
  try{ reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}

  /* [conteneur, entrée, classe de l'entrée choisie] */
  var GROUPES = [
    ['.side-nav',  '.sidelink',     'current'],
    ['.set-tabs',  '.set-tab',      'active'],
    ['.seg3',      '.seg3-opt',     'active'],
    ['.segmented', '.seg-opt',      'active'],
    ['.nav-mode',  '.nav-mode-opt', 'active'],
    ['.nav-diff',  '.nav-diff-opt', 'active']
  ];

  /* Durée du glissement : la même que la transition de .glisseur dans
     17-mouvements.css. Plus courte, la pastille disparaîtrait avant d'arriver. */
  var DUREE = 520;

  function brancher(boite, selEntree, classe){
    if(boite.__glisseur) return;
    var p = document.createElement('span');
    p.className = 'glisseur';
    p.setAttribute('aria-hidden', 'true');
    boite.insertBefore(p, boite.firstChild);
    boite.__glisseur = p;
    boite.classList.add('a-glisseur');

    var derniere = null, minuterie = 0;

    function choisie(){
      var a = boite.querySelector(selEntree + '.' + classe);
      return (a && !a.hidden && a.offsetWidth) ? a : null;
    }
    function poser(a){
      /* offsetLeft/Top partent du conteneur : .a-glisseur le rend positionné
         (17-mouvements.css). Dans la barre d'onglets des Paramètres, qui défile
         sur le côté, la pastille défile donc AVEC les onglets. */
      p.style.width  = a.offsetWidth + 'px';
      p.style.height = a.offsetHeight + 'px';
      p.style.transform = 'translate(' + a.offsetLeft + 'px,' + a.offsetTop + 'px)';
    }
    function placer(){
      var a = choisie();
      if(!a){ derniere = null; return; }
      if(a === derniere || reduit || !derniere){
        /* Première pose, même entrée (redimensionnement), ou mouvement réduit :
           on pose sans animer. */
        p.classList.add('sans-anim');
        poser(a);
        void p.offsetWidth;
        p.classList.remove('sans-anim');
        derniere = a;
        return;
      }
      /* Nouvelle entrée : la pastille repart de l'ancienne (elle y est déjà),
         devient visible, puis glisse. */
      p.classList.add('sans-anim');
      poser(derniere);
      void p.offsetWidth;
      p.classList.remove('sans-anim');
      boite.classList.add('glisse');
      requestAnimationFrame(function(){ poser(a); });
      derniere = a;
      clearTimeout(minuterie);
      minuterie = setTimeout(function(){ boite.classList.remove('glisse'); }, DUREE);
    }

    /* Les changements de la pastille et du conteneur lui-même (.glisse) sont
       les NÔTRES : les prendre pour un changement d'entrée reposerait la
       pastille sans animation, au milieu de son propre glissement. */
    new MutationObserver(function(ms){
      for(var i = 0; i < ms.length; i++){
        if(ms[i].target !== p && ms[i].target !== boite){ placer(); return; }
      }
    }).observe(boite, { attributes:true, subtree:true, attributeFilter:['class','hidden'] });
    /* Un conteneur né caché (page inactive, onglet fermé) mesure zéro : c'est
       quand il prend sa taille qu'on peut enfin poser la pastille. */
    if(window.ResizeObserver) new ResizeObserver(function(){ derniere = null; placer(); }).observe(boite);
    placer();
  }

  function brancherTout(){
    GROUPES.forEach(function(g){
      document.querySelectorAll(g[0]).forEach(function(b){ brancher(b, g[1], g[2]); });
    });
  }
  brancherTout();
  /* Des segmentés sont fabriqués après coup (console, modales) : on repasse
     à chaque page, ce qui ne coûte rien — brancher() ne double jamais. */
  window.addEventListener('rt:page', function(){ setTimeout(brancherTout, 0); });

  /* ---------- « Chrome, Edge ou Safari » ---------- */
  var reco = ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);
  if(!reco){
    document.querySelectorAll('.nav-requis').forEach(function(n){
      n.classList.add('nav-requis--ici');
      var l = n.querySelector('.nav-requis__ici'); if(l) l.hidden = false;
    });
  }
})();
