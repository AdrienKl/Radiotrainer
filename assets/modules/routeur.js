/* =============================================================================
   AVIERO — LE ROUTEUR
   -----------------------------------------------------------------------------
   Une seule application, un seul historique, une seule barre d'adresse. Ce module
   decide quelle <section> est affichee, qui a le droit d'y entrer, et il porte les
   sous-routes de la console d'administration (#admin/users/u_007).

   Il tient aussi les trois pages legales HORS de la partie reservee aux comptes :
   « mentions », « cgu » et « confidentialite » sont dans PAGES mais pas dans
   APP_PAGES. Ce n'est pas un choix d'ergonomie, c'est l'article 13 du RGPD — il
   faut pouvoir lire ce a quoi on consent avant de s'inscrire.

   Expose sur window : rtEntrer  rtSortir  rtConnecte  rtSessionOuverte  rtEstAdmin  rtNaviguer
   Emprunte          : rien — ce module n'emprunte aucun symbole au moteur

   ┌─ L'ORDRE DE CHARGEMENT EST LE CONTRAT ─────────────────────────────────┐
   │ Ce fichier etait un bloc <script> ecrit dans index.html. Il est charge   │
   │ EXACTEMENT a la meme place, et c'est ce qui garantit que rien ne change :│
   │ un script classique externe a la meme portee et le meme moment           │
   │ d'execution qu'un bloc inline. Le deplacer d'un cran dans index.html     │
   │ peut le casser SANS produire la moindre erreur au chargement.            │
   └──────────────────────────────────────────────────────────────────────────┘

   Extrait d'index.html le 19/09/2026 (etape 2.1). Pas une ligne n'a ete
   modifiee : le bloc a ete deplace tel quel.
   ========================================================================== */
/* ============ ROUTEUR SPA + animations de navigation (n'affecte pas la logique métier ci-dessus) ============ */
(function(){
  // Pages : vitrine (accueil), écrans d'auth (login/signup), et pages applicatives (dans la coquille).
  /* « cgu » et « confidentialite » sont des pages de vitrine : accessibles sans
     compte, puisqu'il faut pouvoir les lire AVANT de s'inscrire. C'est une
     obligation, pas un choix de confort (RGPD art. 13). */
  var PAGES=['accueil','login','signup','cgu','confidentialite','mentions','tableau','exercices','navigation','carte','epellation','cours','progression','parametres','compte','admin'];
  var APP_PAGES=['tableau','exercices','navigation','carte','epellation','cours','progression','parametres','compte'];
  /* Les trois pages qui se jouent devant une photo. Cette liste est la seule
     source de vérité : le CSS a une règle body.on-<page> pour chacune, et rien
     d'autre dans le code ne nomme ces pages au titre du décor. */
  var SCENES=['tableau','exercices','navigation','epellation'];
  /* La console d'administration est une page de plus, servie par CE routeur : une
     seule application, un seul historique, une seule barre d'adresse. Elle est la
     seule à porter des sous-routes (#admin/users/u_007) — d'où le découpage sur
     « / » dans showPage(). Les douze routes existantes n'ont pas de « / » et
     empruntent donc exactement le chemin d'avant. */
  var ADMIN_PAGE='admin';
  var pages={}; PAGES.forEach(function(p){pages[p]=document.getElementById('page-'+p);});
  var sideLinks=[].slice.call(document.querySelectorAll('.sidelink'));
  var sidebar=document.getElementById('sidebar');

  // État d'authentification : MOCK, uniquement en mémoire (pas de backend, pas de persistance,
  // pas de vérification, pas de stockage de mot de passe). Un rafraîchissement ramène à la vitrine.
  var authed=false, pendingTarget=null;
  /* Dernière route effectivement peinte. Sert à ignorer les hashchange que l'on
     provoque soi-même : sans ce garde-fou, un clic dans la console d'admin
     déclencherait deux rendus (celui du clic, puis celui du hashchange). */
  var routeAffichee=null;

  /* ---------- Le rôle d'administrateur -------------------------------------
     Il vient de la base : `profiles.role`, lu par assets/auth.js au moment ou la
     session s'ouvre. C'est EXACTEMENT la colonne que consultent les politiques
     RLS, donc l'interface et le serveur ne peuvent pas dire deux choses
     differentes. Rien dans le navigateur ne peut la contredire : ni une cle de
     stockage local, ni un champ du jeton.

     La lecture est synchrone, et elle est fiable : auth.js attend toujours la
     fin de chargerProfil() avant d'appeler rtEntrer() ou rtSessionOuverte(), si
     bien qu'au moment ou ce routeur en a besoin, le profil est la. Tant qu'il
     n'est pas la, la reponse est « non » — le bon sens du doute pour une porte.

     Ce n'est pas pour autant LA protection des donnees : un fichier servi par
     GitHub Pages se lit de toute facon. La protection des donnees est en base
     (RLS). Ceci ferme la porte de l'interface, ce qui restait a faire. */
  function estAdminReel(){
    return !!(window.RTAuth && RTAuth.estAdmin && RTAuth.estAdmin());
  }
  window.rtEstAdmin = estAdminReel;

  function macroState(name){
    if(name===ADMIN_PAGE) return 'admin';
    if(name==='login'||name==='signup') return 'auth';
    if(APP_PAGES.indexOf(name)>=0) return 'app';
    return 'vitrine';
  }
  function setDrawer(open){
    if(!sidebar) return;
    sidebar.classList.toggle('open', !!open);
    document.body.classList.toggle('drawer-open', !!open);
    var h=document.getElementById('hamburger'); if(h) h.setAttribute('aria-expanded', open?'true':'false');
  }

  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12});
  function observeReveals(){document.querySelectorAll('.reveal:not(.in)').forEach(function(el){io.observe(el);});}
  function revealNow(scope){(scope||document).querySelectorAll('.reveal:not(.in)').forEach(function(el){var r=el.getBoundingClientRect(); if(r.top<window.innerHeight*0.96){el.classList.add('in'); io.unobserve(el);}});}

  function showPage(route,push){
    /* Une route peut porter des segments (#admin/users/u_007). Seul le premier
       désigne la <section> à afficher ; le reste est passé à la page concernée. */
    var name=String(route||''), reste='';
    /* Mis a vrai quand une garde reecrit la route : il faut alors corriger
       l'adresse affichee meme si l'appelant demandait de ne pas y toucher. */
    var detourne=false;
    var barre=name.indexOf('/');
    if(barre>0){ reste=name.slice(barre+1); name=name.slice(0,barre); }
    if(PAGES.indexOf(name)<0){ name='accueil'; reste=''; }
    /* « Compte » a ete fondu dans « Parametres ». La route reste dans PAGES et
       continue de repondre, parce que des liens et des favoris la designent —
       la faire tomber sur l'accueil serait la casser silencieusement. On la
       renvoie donc, en corrigeant l'adresse affichee. */
    if(name==='compte'){ name='parametres'; reste=''; detourne=true; }
    // Garde d'accès : une page applicative exige d'être « connecté » → sinon, écran de connexion.
    if(macroState(name)==='app' && !authed){ pendingTarget=name; name='login'; reste=''; }
    /* La console d'administration exige le rôle, pas seulement une session. Deux
       issues distinctes, parce que les deux situations n'ont rien de commun :

         · personne n'est connecté → l'écran de connexion, destination mémorisée,
           pour qu'un administrateur qui arrive par un lien direct y atterrisse
           une fois identifié ;

         · connecté mais sans le rôle → le tableau de bord, SANS passer par la
           connexion. Renvoyer vers un formulaire de connexion quelqu'un qui est
           déjà connecté ne lui apprendrait rien et ressemblerait à une panne ;
           et le détour est signalé, pour que l'adresse affichée cesse de
           promettre une page qu'on ne montre pas.

       Voir ADMIN.md § 12 : la garde d'interface ne protège pas les données, elle
       ferme la porte. Les données sont protégées en base, par les politiques RLS
       adossées à la même colonne `profiles.role`. */
    if(name===ADMIN_PAGE && !authed){ pendingTarget=route; name='login'; reste=''; }
    else if(name===ADMIN_PAGE && !estAdminReel()){ name='tableau'; reste=''; detourne=true; }
    var routeComplete = name + (reste ? '/'+reste : '');
    routeAffichee = routeComplete;
    var st=macroState(name);
    document.body.classList.remove('state-vitrine','state-auth','state-app','state-admin');
    document.body.classList.add('state-'+st);
    setDrawer(false);
    PAGES.forEach(function(p){ if(pages[p]) pages[p].classList.toggle('active',p===name); });
    /* Le décor photographique ne se peint que sur les trois pages qui en ont un
       (il vit hors de <main>, voir son commentaire CSS). La classe on-<page>
       désigne la photo, scene-on allume la couche. */
    SCENES.forEach(function(p){ document.body.classList.toggle('on-'+p, p===name); });
    document.body.classList.toggle('scene-on', SCENES.indexOf(name)>=0);
    sideLinks.forEach(function(a){ a.classList.toggle('current',a.dataset.page===name); });
    if((push!==false || detourne) && ('#'+routeComplete)!==location.hash){
      /* replaceState sur un detour : l'adresse refusee n'a pas a s'installer
         dans l'historique, sinon le bouton « precedent » y ramenerait en
         boucle. */
      try{
        if(detourne) history.replaceState({p:routeComplete},'','#'+routeComplete);
        else         history.pushState({p:routeComplete},'','#'+routeComplete);
      }catch(e){}
    }
    window.scrollTo(0,0);
    requestAnimationFrame(function(){ revealNow(pages[name]); });
    // Notifie les modules autonomes qu'une page vient d'être affichée. La carte Leaflet
    // en a besoin : un conteneur créé en display:none a une taille nulle et doit être
    // recalculé (invalidateSize) une fois visible.
    try{ window.dispatchEvent(new CustomEvent('rt:page',{detail:{page:name, route:routeComplete}})); }catch(e){}
    /* La console d'administration se construit à la demande : elle écoute cet
       événement et reçoit la route complète, sous-segments compris. */
    if(name===ADMIN_PAGE){
      try{ window.dispatchEvent(new CustomEvent('rt:admin',{detail:{route:routeComplete}})); }catch(e){}
    }
  }

  // Liens directs de navigation (sidebar, bascules connexion↔inscription) : vont à la page nommée.
  document.querySelectorAll('[data-page]').forEach(function(b){
    b.addEventListener('click',function(e){ e.preventDefault(); showPage(b.dataset.page); });
  });
  // Boutons d'entrée (hero « Commencer » / « Passer l'examen ») : passent par la connexion,
  // en mémorisant la destination voulue pour y atterrir une fois « connecté ».
  document.querySelectorAll('[data-auth]').forEach(function(b){
    b.addEventListener('click',function(e){ e.preventDefault();
      var target=b.dataset.auth||'exercices';
      if(authed){ showPage(target); } else { pendingTarget=target; showPage('login'); }
    });
  });
  /* --- Frontière avec l'authentification ---------------------------------
     Le routeur ne décide plus qui entre. Il ne sait faire que trois choses :
     ouvrir l'application, la refermer, et rejouer la route courante quand une
     session est retrouvée au chargement. C'est assets/auth.js qui appelle,
     après que Supabase a tranché.
     `authed` n'est PAS une sécurité : il gouverne l'affichage, rien d'autre.
     Le vrai contrôle est dans les politiques RLS, côté base — un visiteur qui
     forcerait cette variable à true verrait l'interface se peindre et tous les
     tableaux répondre « aucune donnée ». */
  /* Un parcours d'inscription inachevé n'a pas de compte utilisable derrière :
     sans mot de passe, on ne pourra plus s'y reconnecter ; sans questionnaire,
     les exercices n'ont pas de niveau de départ. On renvoie donc à l'étape où
     il s'est arrêté, plutôt que de déposer quelqu'un sur un tableau de bord
     qu'il ne pourra pas retrouver. C'est assets/inscription.js qui répond.
     (La migration sql/001-inscription.sql § 6 remplit onboarding_le des comptes
     antérieurs — sans quoi TOUS seraient vus comme inachevés et piégés ici.) */
  function routeUtile(t){
    if(window.RTInscription && RTInscription.aReprendre()) return 'signup';
    return t;
  }
  function enterApp(){ authed=true; var t=routeUtile(pendingTarget||'tableau'); pendingTarget=null; showPage(t);
    if(window.rtMajLienAdmin) window.rtMajLienAdmin(); }
  window.rtEntrer = enterApp;
  window.rtSortir = function(){ authed=false; pendingTarget=null; showPage('accueil'); };
  window.rtConnecte = function(){ return authed; };
  /* Session déjà ouverte au chargement. On REJOUE la route affichée plutôt que
     d'imposer le tableau de bord : quelqu'un qui arrive sur la vitrine avec une
     session valide doit rester sur la vitrine, pas se faire happer. Et celui
     qui visait #progression avant d'être renvoyé vers la connexion y atterrit. */
  window.rtSessionOuverte = function(){
    authed=true;
    if(window.rtMajLienAdmin) window.rtMajLienAdmin();
    var r = pendingTarget || routeAffichee || 'accueil';
    if(r==='login' || r==='signup') r = pendingTarget || 'tableau';
    /* ARRIVÉE PAR LE LIEN D'UN E-MAIL. L'adresse ne désigne alors aucune page :
       elle ne portait que des jetons, que supabase-js a lus puis effacés. La
       route retenue vaut donc « accueil » par défaut, et l'on déposait sur la
       VITRINE quelqu'un qui venait de cliquer pour entrer — connecté, mais
       devant la page de présentation, sans rien qui signale que ça a marché.
       C'est exactement ce que décrit « ça me met juste sur mon site ».
       Une inscription inachevée repart quand même vers son étape : routeUtile()
       passe après et a le dernier mot. */
    if(r==='accueil' && window.RTAuth && RTAuth.arriveParLien && RTAuth.arriveParLien())
      r = 'tableau';
    r = routeUtile(r);
    pendingTarget=null;
    showPage(r, false);
  };
  /* La déconnexion passe par Supabase quand il est là : sans signOut(), le jeton
     resterait valide en stockage local et un simple rechargement rouvrirait la
     session. Sans lui, on se contente de refermer l'interface. */
  var logoutBtn=document.getElementById('logoutBtn');
  if(logoutBtn) logoutBtn.addEventListener('click',function(){
    if(window.RTAuth) RTAuth.deconnexion(); else window.rtSortir();
  });
  // Menu mobile (hamburger + overlay).
  var hb=document.getElementById('hamburger'); if(hb) hb.addEventListener('click',function(){ setDrawer(!(sidebar&&sidebar.classList.contains('open'))); });
  var ov=document.getElementById('sideOverlay'); if(ov) ov.addEventListener('click',function(){ setDrawer(false); });

  /* --- Menu repliable (bureau) ---
     Le choix est mémorisé : replier son menu à chaque visite serait une corvée.
     La largeur ne change qu'une variable CSS ; en revanche la zone de contenu,
     elle, change bel et bien de taille — et Leaflet ne s'en aperçoit pas tout
     seul. On lui envoie donc un resize À LA FIN de l'animation, sinon la carte
     de la Navigation et celle de la Carte restent grises sur la bande libérée. */
  var CLE_MENU='rt-menu-replie';
  var stg=document.getElementById('sideToggle');
  function majMenu(replie, memoriser){
    document.body.classList.toggle('side-collapsed', !!replie);
    if(stg){
      stg.setAttribute('aria-expanded', replie?'false':'true');
      var t = replie ? 'Déployer le menu' : 'Réduire le menu';
      stg.setAttribute('aria-label', t); stg.title = t;
    }
    /* Replié, il ne reste que des icônes : sans infobulle il faut deviner. On
       reprend le libellé masqué plutôt que d'écrire une seconde liste de noms. */
    sideLinks.concat([document.getElementById('logoutBtn')]).forEach(function(b){
      if(!b) return;
      var sp=b.querySelector('span');
      if(replie && sp) b.title=sp.textContent; else b.removeAttribute('title');
    });
    if(memoriser){ try{ localStorage.setItem(CLE_MENU, replie?'1':'0'); }catch(e){} }
    setTimeout(function(){ try{ window.dispatchEvent(new Event('resize')); }catch(e){} }, 240);
  }
  try{ if(localStorage.getItem(CLE_MENU)==='1') majMenu(true,false); }catch(e){}
  if(stg) stg.addEventListener('click', function(){
    majMenu(!document.body.classList.contains('side-collapsed'), true);
  });

  window.addEventListener('popstate',function(){ showPage((location.hash||'#accueil').slice(1),false); });
  /* Les liens internes de la console d'admin sont de vrais <a href="#admin/...">.
     Une navigation de fragment déclenche 'hashchange', pas 'popstate' : sans cet
     écouteur, l'URL changerait sans que la vue suive. */
  window.addEventListener('hashchange',function(){
    var r=(location.hash||'#accueil').slice(1);
    if(r!==routeAffichee) showPage(r,false);
  });
  /* Navigation programmatique, pour les modules chargés séparément (console
     d'administration). Ils n'ont pas accès à la portée de ce bloc. */
  window.rtNaviguer=function(route){ showPage(route); };
  window.addEventListener('scroll',function(){ revealNow(); },{passive:true});

  // Contrôles segmentés (pilule) : couche VISUELLE au-dessus des <select> existants.
  // Le <select> reste la source de vérité ; un clic met à jour sa valeur et déclenche
  // son événement 'change' → la logique métier réagit exactement comme avant.
  document.querySelectorAll('select.segmented').forEach(function(sel){
    var wrap=document.createElement('div'); wrap.className='segmented-ui'; wrap.setAttribute('role','group');
    [].slice.call(sel.options).forEach(function(opt){
      var b=document.createElement('button'); b.type='button'; b.className='seg-opt'+(opt.selected?' active':'');
      b.textContent=opt.textContent; b.title=opt.getAttribute('data-full')||opt.textContent;
      b.addEventListener('click',function(){
        if(sel.value!==opt.value){ sel.value=opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); }
        wrap.querySelectorAll('.seg-opt').forEach(function(x){x.classList.remove('active');});
        b.classList.add('active');
      });
      wrap.appendChild(b);
    });
    sel.style.display='none';
    sel.parentNode.insertBefore(wrap, sel.nextSibling);
    // Le <select> peut aussi être modifié de l'extérieur (page Paramètres) : on
    // resynchronise alors la pilule, sinon l'affichage mentirait sur l'état réel.
    sel.addEventListener('change',function(){
      [].slice.call(sel.options).forEach(function(opt,i){
        var b=wrap.children[i]; if(b) b.classList.toggle('active', opt.value===sel.value);
      });
    });
  });

  /* ===========================================================================
     L'OFFRE — un seul endroit à modifier
     ---------------------------------------------------------------------------
     Le tarif est ici, et nulle part ailleurs. Écrit en dur dans le HTML, il
     finirait recopié dans le hero, dans la bande, dans l'appel final, et l'un
     des trois resterait périmé le jour où il change — c'est déjà ce qui est
     arrivé aux nombres d'appareils et de scénarios.

     TANT QUE `prix` VAUT null, LA PAGE N'ANNONCE AUCUN MONTANT. Elle dit que
     l'abonnement vient et que le tarif sera annoncé, ce qui est exact : à ce
     jour le service est entièrement gratuit, et les CGU le disent aussi. Poser
     un prix de démonstration « en attendant » serait une affirmation
     commerciale fausse sur un site public — pas un détail de maquette.

     Pour ouvrir la formule payante, il n'y a que ces quatre lignes à remplir,
     et le paiement à brancher. Les textes de la page suivent tout seuls. */
  var RT_OFFRE = {
    prix:       null,    // ex. '14,90' — montant affiché, sans le symbole
    periode:    'mois',  // ce qui suit la barre : 'mois', 'an'…
    essaiJours: null,    // ex. 14 — null = essai ouvert, sans échéance annoncée
    carte:      false    // une carte bancaire est-elle demandée à l'inscription ?
  };
  (function(){
    var poser = function(cle, html){
      var e=document.querySelector('[data-offre="'+cle+'"]'); if(e) e.innerHTML=html;
    };
    var o = RT_OFFRE;
    poser('kind', o.prix ? 'Essai puis abonnement' : 'Essai');
    poser('duree', o.essaiJours
      ? o.essaiJours + ' jours<small>à compter de l\'inscription</small>'
      : "Sans limite<small>pendant la phase d'essai</small>");
    poser('carte', o.carte
      ? "Oui<small>demandée à l'inscription</small>"
      : "Non<small>rien à saisir aujourd'hui</small>");
    poser('prix', o.prix
      ? o.prix + ' €<small>par ' + o.periode + ', résiliable à tout moment</small>'
      : "Abonnement<small>tarif annoncé ici</small>");
    /* Le bas de la bande promet qu'aucune carte n'est enregistrée. Le jour où
       elle l'est, cette phrase deviendrait un mensonge : elle change avec le
       réglage, elle ne se contente pas de l'accompagner. */
    poser('foot', o.carte
      ? "<b>Votre carte n'est débitée qu'à la fin de l'essai.</b> Vous êtes prévenu avant, et vous pouvez arrêter d'ici là sans rien payer."
      : "<b>Rien ne peut vous être prélevé sans que vous l'ayez choisi.</b> Aucune carte n'est enregistrée à l'inscription, et le passage à l'abonnement se fera par un acte de votre part — jamais par reconduction silencieuse d'un essai.");
  })();

  // Indicateur de scroll du hero : défilement fluide vers la 1re section de contenu.
  var cue=document.getElementById('scrollCue');
  if(cue) cue.addEventListener('click',function(){
    var t=document.querySelector('#page-accueil .container');
    if(t) t.scrollIntoView({behavior:'smooth', block:'start'});
  });

  observeReveals();
  showPage((location.hash||'#accueil').slice(1),false);
})();

