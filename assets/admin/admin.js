/* =============================================================================
   RadioTrainer — Admin · COQUILLE
   -----------------------------------------------------------------------------
   Le rail de navigation, la barre du haut, le routeur interne, la garde d'accès
   et le sélecteur de source. C'est le seul fichier qui parle au routeur SPA
   d'index.html ; les pages, elles, ne connaissent que RTAdmin.page() et
   RTAdmin.data.

   Chargement : ce fichier ne construit RIEN au démarrage. Il se contente de
   s'abonner à l'événement `rt:admin`. La console n'est bâtie qu'à la première
   entrée sur #admin — l'élève qui n'y va jamais ne paie rien.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin = window.RTAdmin || {};
  var UI = RT.ui, U = RT.util;
  var el = UI.el, esc = UI.esc, I = UI.I;

  /* Source affichée par défaut à la première ouverture : la base. Les deux
     autres restent dans le sélecteur — « Cet appareil » sert de banc d'essai au
     contrat, « Démonstration » à montrer la console pleine quand la base est
     vide. Elles sont marquées pour ce qu'elles sont, et la source fictive porte
     la mention « fictif » partout où elle affiche un chiffre. */
  var DEFAUT_SOURCE = 'supabase';

  /* ===========================================================================
     IDENTITÉ ET RÔLE — d'où ils viennent, et ce qu'ils valent.
     ---------------------------------------------------------------------------
     Le rôle est lu en base : `profiles.role`, chargé par assets/auth.js quand la
     session s'ouvre. Il y avait ici, avant, un drapeau dans le stockage local
     (`rt-admin-dev`) qu'un interrupteur des Paramètres posait — visible par tout
     le monde, et donc une porte ouverte dès que la console a cessé d'afficher des
     données de démonstration pour lire la vraie base. Il a été retiré.

     Ce que cette lecture fait, et ce qu'elle ne fait pas :

       · elle décide de ce que l'interface MONTRE — l'entrée du menu, l'accès à
         la route #admin (la garde est dans le routeur, index.html) ;

       · elle ne protège AUCUNE donnée. Un site statique servi par GitHub Pages
         ne contrôle pas qui charge un fichier : le code se lit, l'adresse se
         tape, et un navigateur se laisse instrumenter. Rien de ce qui est écrit
         ici n'y change quoi que ce soit.

     Ce qui protège les données est en base, et nulle part ailleurs : les
     politiques RLS, adossées à `public.is_admin()`, qui interroge cette même
     colonne `profiles.role`. Interface et serveur consultent donc la même source
     — un compte sans le rôle ne verrait de toute façon que ses propres lignes,
     même en forçant l'affichage de la console. Voir ADMIN.md § 10 et § 12.
     ======================================================================== */
  var session = {
    role:function(){
      var p = window.RTAuth && RTAuth.profil && RTAuth.profil();
      return (p && p.role) || 'user';
    },
    /* Déléguée à auth.js plutôt que recalculée ici : 'moderator' compte aussi,
       et le jour où cette liste bouge, elle ne doit bouger qu'à un seul endroit
       — le même que celui dont dépend la garde du routeur. */
    isAdmin:function(){
      return !!(window.RTAuth && RTAuth.estAdmin && RTAuth.estAdmin());
    },
    /* Renvoie null quand personne n'est connecté, au lieu d'un « Administrateur
       (local) » inventé : la console ne doit jamais afficher d'identité qui
       n'existe pas. */
    user:function(){
      var u = window.RTAuth && RTAuth.utilisateur && RTAuth.utilisateur();
      if (!u) return null;
      var p = window.RTAuth && RTAuth.profil && RTAuth.profil();
      return { id:u.id, name:(p && p.display_name) || u.email || null, role:session.role() };
    }
  };
  RT.session = session;

  /* ===========================================================================
     Registre des pages
     ======================================================================== */
  var pages = {};
  RT.page = function(route, def){ pages[route] = def; };

  var NAV = [
    { route:'admin',           label:'Tableau de bord', icon:I.dashboard },
    { route:'admin/users',     label:'Utilisateurs',    icon:I.users },
    { route:'admin/flights',   label:'Simulations',     icon:I.plane },
    { route:'admin/analytics', label:'Analytics',       icon:I.chart },
    { route:'admin/exercises', label:'Exercices',       icon:I.book },
    { route:'admin/errors',    label:'Erreurs',         icon:I.bug },
    { route:'admin/test',      label:'Test / Controller', icon:I.flask, separe:true }
  ];

  /* ===========================================================================
     État partagé : période d'observation, commune au tableau de bord et aux
     analytics. Un seul réglage, visible en haut, plutôt qu'un sélecteur par
     page qu'on oublie de synchroniser.
     ======================================================================== */
  var PERIODES = [
    { v:'7',   l:'7 jours' },
    { v:'30',  l:'30 jours' },
    { v:'90',  l:'90 jours' },
    { v:'365', l:'12 mois' }
  ];
  var CLE_PERIODE = 'rt-admin-periode';
  var state = {
    days:30,
    range:function(){ return { days:state.days }; }
  };
  try { var p0 = parseInt(localStorage.getItem(CLE_PERIODE), 10); if (p0) state.days = p0; } catch(e){}
  RT.state = state;

  /* ===========================================================================
     Construction de la coquille (une seule fois)
     ======================================================================== */
  var racine = null, vue = null, filAriane = null, railNav = null, bati = false;
  var routeCourante = null;

  function batir(){
    if (bati) return;
    racine = document.getElementById('admRoot');
    if (!racine) return;
    bati = true;
    racine.className = 'adm';
    UI.vide(racine);

    /* ---- Rail ---- */
    var rail = el('aside', 'adm-rail');
    rail.setAttribute('aria-label', 'Navigation administration');

    var tete = el('div', 'adm-rail__head');
    tete.innerHTML =
      '<span class="adm-rail__logo">' + I.spark + '</span>' +
      '<span class="adm-rail__brand"><b>RadioTrainer</b><i>Console d\'administration</i></span>';
    var replier = el('button', 'adm-iconbtn adm-rail__toggle',
      '<svg class="ic-svg" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></svg>');
    replier.type = 'button';
    replier.setAttribute('aria-label', 'Réduire le menu');
    replier.addEventListener('click', function(){
      var r = !racine.classList.contains('adm--rail-collapsed');
      racine.classList.toggle('adm--rail-collapsed', r);
      replier.setAttribute('aria-label', r ? 'Déployer le menu' : 'Réduire le menu');
      try { localStorage.setItem('rt-admin-rail', r ? '1' : '0'); } catch(e){}
    });
    rail.appendChild(replier);
    rail.appendChild(tete);

    railNav = el('nav', 'adm-rail__nav');
    NAV.forEach(function(item){
      if (item.separe) railNav.appendChild(el('hr', 'adm-rail__sep'));
      var b = el('a', 'adm-rail__link', item.icon + '<span>' + esc(item.label) + '</span>');
      b.href = '#' + item.route;
      b.dataset.route = item.route;
      b.title = item.label;
      railNav.appendChild(b);
    });
    rail.appendChild(railNav);

    var pied = el('div', 'adm-rail__foot');
    var sortie = el('a', 'adm-rail__link adm-rail__link--out', I.exit + '<span>Retour au site élève</span>');
    sortie.href = '#tableau';
    sortie.title = 'Retour au site élève';
    pied.appendChild(sortie);
    rail.appendChild(pied);

    /* ---- Colonne principale ---- */
    var col = el('div', 'adm-main');

    var top = el('header', 'adm-top');
    var hamb = el('button', 'adm-iconbtn adm-top__burger',
      '<svg class="ic-svg" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></svg>');
    hamb.type = 'button';
    hamb.setAttribute('aria-label', 'Menu');
    hamb.addEventListener('click', function(){ racine.classList.toggle('adm--drawer'); });
    top.appendChild(hamb);

    filAriane = el('div', 'adm-crumb');
    top.appendChild(filAriane);

    var outils = el('div', 'adm-top__tools');
    outils.appendChild(selecteurPeriode());
    outils.appendChild(selecteurSource());
    var rafraichir = el('button', 'adm-iconbtn', I.refresh);
    rafraichir.type = 'button';
    rafraichir.title = 'Recharger la vue';
    rafraichir.setAttribute('aria-label', 'Recharger la vue');
    rafraichir.addEventListener('click', function(){ rendre(routeCourante, true); });
    outils.appendChild(rafraichir);
    top.appendChild(outils);
    col.appendChild(top);

    /* ---- Bandeau d'honnêteté : il ne disparaît jamais. ---- */
    col.appendChild(bandeau());

    vue = el('div', 'adm-view');
    col.appendChild(vue);

    var overlay = el('div', 'adm-rail__overlay');
    overlay.addEventListener('click', function(){ racine.classList.remove('adm--drawer'); });

    racine.appendChild(rail);
    racine.appendChild(overlay);
    racine.appendChild(col);

    try { if (localStorage.getItem('rt-admin-rail') === '1') racine.classList.add('adm--rail-collapsed'); }
    catch(e){}

    window.addEventListener('rt:admin-source', function(){
      majSelecteurSource();
      majBandeau();
      rendre(routeCourante, true);
    });
  }

  /* ---- Sélecteur de période ---- */
  var selPeriode = null;
  function selecteurPeriode(){
    var w = el('label', 'adm-select');
    w.appendChild(el('span', 'adm-select__lab', 'Période'));
    selPeriode = el('select');
    PERIODES.forEach(function(p){
      var o = el('option', null, p.l); o.value = p.v;
      if (String(state.days) === p.v) o.selected = true;
      selPeriode.appendChild(o);
    });
    selPeriode.setAttribute('aria-label', "Période d'observation");
    selPeriode.addEventListener('change', function(){
      state.days = parseInt(selPeriode.value, 10) || 30;
      try { localStorage.setItem(CLE_PERIODE, String(state.days)); } catch(e){}
      rendre(routeCourante, true);
    });
    w.appendChild(selPeriode);
    return w;
  }

  /* ---- Sélecteur de source ---- */
  var selSource = null;
  function selecteurSource(){
    var w = el('label', 'adm-select adm-select--source');
    w.appendChild(el('span', 'adm-select__lab', 'Données'));
    selSource = el('select');
    majSelecteurSource();
    selSource.setAttribute('aria-label', 'Source de données');
    selSource.addEventListener('change', function(){
      if (!RT.data.setSource(selSource.value)) majSelecteurSource();
    });
    w.appendChild(selSource);
    return w;
  }
  function majSelecteurSource(){
    if (!selSource) return;
    var cur = RT.data.currentSource();
    UI.vide(selSource);
    RT.data.sources().forEach(function(s){
      var o = el('option', null, s.label
        + (s.fictional ? ' — fictif' : '')
        + (!s.available ? ' — non connecté' : ''));
      o.value = s.id;
      if (s.id === cur.id) o.selected = true;
      selSource.appendChild(o);
    });
    selSource.className = cur.fictional ? 'is-fictional' : (cur.available ? 'is-real' : 'is-off');
  }

  /* ---- Bandeau ---- */
  var elBandeau = null;
  function bandeau(){
    elBandeau = el('div', 'adm-banner');
    majBandeau();
    return elBandeau;
  }
  function majBandeau(){
    if (!elBandeau) return;
    var s = RT.data.currentSource();
    /* Le texte du bandeau ne peut pas être écrit ici : « historique enregistré
       dans ce navigateur » est vrai de la source locale et faux de la base.
       C'est donc la source elle-même qui dit son périmètre, par la note de ses
       capabilities() — la seule à le savoir. La façade étant asynchrone (elle
       l'est pour toutes ses méthodes, sinon brancher un serveur aurait obligé à
       reprendre chaque page), on peint d'abord une phrase neutre et vraie, puis
       on la précise à l'arrivée de la note. */
    var nature = s.fictional
      ? { cls:'fict', ic:I.flask, t:'Données de démonstration — FICTIVES',
          d:'Aucune de ces personnes, aucun de ces vols n\'existe. Rien de ce qui est affiché ici n\'est une mesure réelle.' }
      : (s.available
          ? { cls:'reel', ic:I.db, t:'Données réelles — ' + s.label,
              d:'Mesures réelles. Les indicateurs que cette source ne sait pas produire restent vides plutôt que d\'afficher un zéro.' }
          : { cls:'off', ic:I.db, t:s.label + ' — non connecté', d:s.reason });
    elBandeau.className = 'adm-banner adm-banner--' + nature.cls;
    elBandeau.innerHTML =
      '<span class="adm-banner__ic">' + nature.ic + '</span>' +
      '<div class="adm-banner__txt"><b>' + esc(nature.t) + '</b><span class="adm-banner__d">'
        + esc(nature.d) + '</span></div>' +
      '<span class="adm-banner__sec" title="Voir ADMIN.md § 12">' + I.lock +
      'Accès réservé au rôle « admin » lu en base. Ce qui est lisible, en revanche, '
      + 'est décidé requête par requête par les politiques RLS du serveur — pas par cette page.</span>';

    if (!s.fictional && s.available){
      var cible = elBandeau.querySelector('.adm-banner__d');
      var pour = s.id;
      RT.data.capabilities().then(function(cap){
        /* La source a pu changer pendant l'aller-retour : on n'écrit la note que
           si elle décrit toujours celle qui est affichée. */
        if (cap && cap.note && cible && RT.data.currentSource().id === pour)
          cible.textContent = cap.note;
      }, function(){});
    }
  }

  /* ===========================================================================
     Routeur interne
     ======================================================================== */
  function analyser(route){
    var parts = String(route || 'admin').split('/').filter(Boolean);
    if (parts[0] !== 'admin') parts = ['admin'];
    if (parts.length === 1) return { route:'admin', params:{} };
    var section = 'admin/' + parts[1];
    if (parts.length >= 3) return { route:section + '/:id', section:section, params:{ id:parts.slice(2).join('/') } };
    return { route:section, section:section, params:{} };
  }

  function titreDe(route){
    for (var i = 0; i < NAV.length; i++) if (NAV[i].route === route) return NAV[i].label;
    return 'Administration';
  }

  function rendre(route, force){
    if (!bati) batir();
    if (!vue) return;
    route = route || 'admin';
    routeCourante = route;
    var a = analyser(route);
    var def = pages[a.route] || pages[a.section] || pages.admin;

    /* Fil d'Ariane : « Administration › Utilisateurs › Alice Berthier ».
       Le dernier segment est rempli par la page (elle seule connaît le nom). */
    var base = a.section || 'admin';
    var crumbs = [{ l:'Administration', h:'#admin' }];
    if (base !== 'admin') crumbs.push({ l:titreDe(base), h:'#' + base });
    if (a.params.id) crumbs.push({ l:'…', h:null });
    peindreFil(crumbs);

    railNav.querySelectorAll('.adm-rail__link').forEach(function(b){
      b.classList.toggle('current', b.dataset.route === base);
    });
    racine.classList.remove('adm--drawer');
    UI.fermerTiroir();
    UI.vide(vue);
    document.title = titreDe(base) + ' · Admin — RadioTrainer';

    if (!def){
      vue.appendChild(UI.etatVide('Page inconnue', 'La route « ' + route + ' » n\'existe pas.', I.warn));
      return;
    }
    try {
      def.render(vue, {
        params:a.params,
        route:route,
        setCrumb:function(txt){ crumbs[crumbs.length - 1].l = txt; peindreFil(crumbs); },
        go:aller
      });
    } catch(e){
      vue.appendChild(UI.etatErreur(e));
      try { console.error('[Admin] rendu de ' + route, e); } catch(e2){}
      if (RT.logError) RT.logError({ level:'error', kind:'js',
        message:'Admin — rendu de ' + route + ' : ' + e.message, stack:e.stack, url:'#' + route });
    }
    try { vue.scrollTop = 0; window.scrollTo(0, 0); } catch(e){}
  }

  function peindreFil(crumbs){
    UI.vide(filAriane);
    crumbs.forEach(function(c, i){
      if (i) filAriane.appendChild(el('span', 'adm-crumb__sep', I.chev));
      if (c.h && i < crumbs.length - 1){
        var a = el('a', 'adm-crumb__l', esc(c.l)); a.href = c.h;
        filAriane.appendChild(a);
      } else {
        filAriane.appendChild(el('span', 'adm-crumb__c', esc(c.l)));
      }
    });
  }

  function aller(route){
    try { location.hash = '#' + route; } catch(e){ rendre(route); }
  }
  RT.go = aller;

  /* ===========================================================================
     Branchement au routeur SPA d'index.html
     ======================================================================== */
  window.addEventListener('rt:admin', function(e){
    /* Le routeur a déjà refusé l'entrée aux comptes sans le rôle ; ce second
       contrôle ne sert pas à le doubler mais à tenir seul si un appelant futur
       émettait 'rt:admin' sans passer par lui. Il ne coûte rien, et il évite
       qu'une console se bâtisse pour quelqu'un à qui on ne la montre pas. */
    if (!session.isAdmin()) return;
    var route = (e.detail && e.detail.route) || 'admin';
    RT.data.restoreSource(DEFAUT_SOURCE);
    if (!bati) batir();
    majSelecteurSource(); majBandeau();
    rendre(route);
  });

  /* Le rôle ne change plus depuis cette console — il vient de la base. C'est
     index.html qui écoute 'rt:auth' et remet l'entrée du menu d'accord avec lui ;
     l'écouteur 'rt:admin-role' qui vivait ici n'avait plus d'émetteur. */

  /* Choix de source mémorisé, appliqué dès le chargement pour que le premier
     rendu n'affiche pas la mauvaise source une fraction de seconde. */
  RT.data.restoreSource(DEFAUT_SOURCE);

  /* Rattrapage : si la page est ouverte DIRECTEMENT sur #admin, le routeur a déjà
     émis 'rt:admin' pendant l'analyse du document, bien avant que ce fichier ne
     soit exécuté. Le délai à zéro nous place après l'exécution des pages, donc
     après leur enregistrement. */
  setTimeout(function(){
    if (!document.body.classList.contains('state-admin')) return;
    /* Meme raison qu'au-dessus. En pratique le macro-etat 'state-admin' suffit
       deja, puisque seule la garde du routeur le pose ; on ne s'appuie pas sur
       cette coincidence. */
    if (!session.isAdmin()) return;
    var r = (location.hash || '#admin').slice(1);
    if (r.split('/')[0] !== 'admin') r = 'admin';
    RT.data.restoreSource(DEFAUT_SOURCE);
    if (!bati) batir();
    majSelecteurSource(); majBandeau();
    rendre(r);
  }, 0);
})();
