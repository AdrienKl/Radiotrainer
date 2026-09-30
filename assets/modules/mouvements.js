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
    /* `.segmented-ui` et non `.segmented` : le <select class="segmented"> des
       Scénarios (niveau, débit) est REMPLACÉ au chargement par des boutons dans
       une boîte .segmented-ui (routeur.js). Viser le <select> ne branchait
       rien, et la page Scénarios n'avait aucune pastille. */
    ['.segmented-ui', '.seg-opt',   'active'],
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
    /* Vrai quand la pastille vient d'être lâchée par un appui long : elle est
       déjà là où le doigt l'a laissée, et doit partir DE LÀ. */
    var depuisIci = false;

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
      if(!depuisIci){
        p.classList.add('sans-anim');
        poser(derniere);
        void p.offsetWidth;
        p.classList.remove('sans-anim');
      }
      depuisIci = false;
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
    if(window.ResizeObserver) new ResizeObserver(function(){ if(!appui) { derniere = null; placer(); } }).observe(boite);
    placer();

    /* ---------- L'appui long : attraper la pastille et la promener ----------
       30/09/2026, demande du développeur. On appuie sur l'entrée choisie (la
       pastille est dessous), on garde le doigt — ou le bouton de la souris —
       une fraction de seconde : la pastille se soulève, suit le doigt dans
       l'axe du groupe, et l'entrée où on la lâche est choisie. Comme la barre
       d'onglets d'iOS 26.

       Trois pièges, tous tombés en l'écrivant :
         · un doigt qui BOUGE avant la fin de l'attente veut faire défiler la
           page, pas attraper la pastille : on abandonne au-delà de 8 px ;
         · une fois la pastille attrapée, le navigateur voudrait faire défiler
           au premier mouvement : le touchmove est annulé (écouteur NON passif),
           et c'est le premier touchmove, donc il est encore annulable ;
         · lâcher déclenche un click natif sur l'entrée de DÉPART. Sur le menu,
           ça recharge la page courante et la remonte en haut. Ce click-là est
           avalé ; celui qu'on envoie nous-mêmes à l'entrée d'arrivée passe
           (il n'est pas isTrusted). */
    var LONG = 380, appui = null, avaler = false;
    var axeY = null;
    function entrees(){
      return [].slice.call(boite.querySelectorAll(selEntree))
        .filter(function(e){ return !e.hidden && e.offsetWidth && e.parentNode === boite; });
    }
    function sous(x, y){
      var meilleure = null, dmin = Infinity;
      entrees().forEach(function(e){
        var r = e.getBoundingClientRect();
        var cx = Math.max(r.left, Math.min(x, r.right)), cy = Math.max(r.top, Math.min(y, r.bottom));
        var d = Math.hypot(x - cx, y - cy);
        if(d < dmin){ dmin = d; meilleure = e; }
      });
      return meilleure;
    }
    function suivre(x, y){
      var e = sous(x, y); if(!e) return;
      var L = entrees(), r = boite.getBoundingClientRect();
      var w = e.offsetWidth, h = e.offsetHeight, px, py;
      if(axeY){
        px = e.offsetLeft;
        py = y - r.top - boite.clientTop + boite.scrollTop - h / 2;
        py = Math.max(L[0].offsetTop, Math.min(py, L[L.length - 1].offsetTop + L[L.length - 1].offsetHeight - h));
      } else {
        py = e.offsetTop;
        px = x - r.left - boite.clientLeft + boite.scrollLeft - w / 2;
        px = Math.max(L[0].offsetLeft, Math.min(px, L[L.length - 1].offsetLeft + L[L.length - 1].offsetWidth - w));
      }
      p.style.width = w + 'px'; p.style.height = h + 'px';
      p.style.transform = 'translate(' + px + 'px,' + py + 'px)';
      if(appui.survol !== e){
        if(appui.survol) appui.survol.removeAttribute('data-survol');
        e.setAttribute('data-survol', '');
        appui.survol = e;
        try{ if(navigator.vibrate) navigator.vibrate(6); }catch(err){}
      }
    }
    function attraper(){
      if(!appui) return;
      var L = entrees();
      axeY = L.length > 1 && Math.abs(L[1].offsetTop - L[0].offsetTop) > Math.abs(L[1].offsetLeft - L[0].offsetLeft);
      appui.tire = true;
      clearTimeout(minuterie);
      boite.classList.add('glisse', 'tire');
      try{ if(navigator.vibrate) navigator.vibrate(12); }catch(err){}
      suivre(appui.x, appui.y);
    }
    function finir(annule){
      if(!appui) return;
      clearTimeout(appui.minuterie);
      var etait = appui.tire, arrivee = appui.survol, depart = appui.depart;
      if(arrivee) arrivee.removeAttribute('data-survol');
      appui = null;
      if(!etait) return;
      boite.classList.remove('tire');
      avaler = true; setTimeout(function(){ avaler = false; }, 450);
      if(!annule && arrivee && arrivee !== depart){
        depuisIci = true;
        arrivee.click();                    // le groupe fait son travail : page, onglet, réglage
      } else {
        /* Lâchée sur place (ou geste annulé) : elle revient se poser. */
        poser(depart);
      }
      clearTimeout(minuterie);
      minuterie = setTimeout(function(){ boite.classList.remove('glisse'); }, DUREE);
    }
    boite.addEventListener('pointerdown', function(e){
      if(e.button > 0 || reduit) return;
      var en = e.target.closest ? e.target.closest(selEntree) : null;
      if(!en || en.parentNode !== boite || !en.classList.contains(classe)) return;
      appui = { x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY, depart:en, tire:false, survol:null,
                souris: e.pointerType === 'mouse' || e.pointerType === 'pen' };
      appui.minuterie = setTimeout(attraper, LONG);
    });
    window.addEventListener('pointermove', function(e){
      if(!appui) return;
      appui.x = e.clientX; appui.y = e.clientY;
      if(!appui.tire){
        var d = Math.hypot(e.clientX - appui.x0, e.clientY - appui.y0);
        /* À LA SOURIS, on attrape dès que ça bouge : appuyer puis tirer tout de
           suite est le geste naturel, et une souris ne fait pas défiler la page
           en glissant. La première version imposait l'attente du doigt à la
           souris aussi — le moindre mouvement avant 0,38 s annulait tout, et
           la pastille « ne suivait pas la souris » (retour du développeur,
           30/09/2026). AU DOIGT, bouger avant la fin de l'attente veut dire
           défiler : on abandonne. */
        if(appui.souris && d > 4) attraper();
        else { if(d > 8) finir(true); return; }
        if(!appui) return;
      }
      suivre(e.clientX, e.clientY);
    });
    window.addEventListener('pointerup', function(){ finir(false); });
    /* Au doigt, une fois la pastille attrapée, on IGNORE pointercancel et on
       suit le doigt par les événements tactiles (plus bas). Safari — et donc
       tout navigateur d'iPhone, Chrome compris — envoie pointercancel dès
       qu'il croit reconnaître un défilement, même quand le touchmove est
       annulé ; après lui, plus un seul pointermove : la pastille restait figée
       au milieu du menu (retour du développeur, 30/09/2026 — « sur téléphone
       c'est encore buggé »). Les touch*, eux, continuent d'arriver. */
    window.addEventListener('pointercancel', function(){
      if(appui && appui.tire && !appui.souris) return;
      finir(true);
    });
    boite.addEventListener('touchmove', function(e){
      if(!appui || appui.souris) return;
      var t = e.touches && e.touches[0]; if(!t) return;
      if(!appui.tire){
        if(Math.hypot(t.clientX - appui.x0, t.clientY - appui.y0) > 8) finir(true);   // il défile
        return;
      }
      e.preventDefault();                  // pas de défilement pendant qu'on tire
      appui.x = t.clientX; appui.y = t.clientY;
      suivre(t.clientX, t.clientY);
    }, { passive:false });
    boite.addEventListener('touchend', function(){ if(appui && !appui.souris) finir(false); });
    boite.addEventListener('touchcancel', function(){ if(appui && !appui.souris) finir(true); });
    boite.addEventListener('contextmenu', function(e){ if(appui) e.preventDefault(); });
    boite.addEventListener('click', function(e){
      if(avaler && e.isTrusted){ e.stopPropagation(); e.preventDefault(); avaler = false; }
    }, true);
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

  /* ---------- Le logo ----------
     Il ramène à l'accueil (routeur.js). Sur téléphone, le menu est fermé : la
     pastille glisse sans qu'on la voie, et déjà sur l'accueil rien ne bouge
     du tout. Le logo lui-même fait donc un petit battement d'aile, à chaque
     fois. */
  document.querySelectorAll('.brand, .side-brand, .auth-brand').forEach(function(b){
    b.addEventListener('click', function(){
      var l = b.querySelector('.logo') || b;
      l.classList.remove('logo-rebond'); void l.offsetWidth; l.classList.add('logo-rebond');
    });
  });

  /* ---------- « Chrome, Edge ou Safari » ---------- */
  var reco = ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);
  if(!reco){
    document.querySelectorAll('.nav-requis').forEach(function(n){
      n.classList.add('nav-requis--ici');
      var l = n.querySelector('.nav-requis__ici'); if(l) l.hidden = false;
    });
  }
})();
