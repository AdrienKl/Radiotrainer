/* =============================================================================
   Albatros VFR — CONTACT / FEEDBACK
   -----------------------------------------------------------------------------
   Une modale, trois vues : la nature du message, le formulaire, la confirmation.
   Le message part chez Formspree (https://formspree.io/f/xjykwqbg), qui le
   remet par e-mail. Aucune base, aucune table, aucune RLS : un formulaire de
   contact n'a pas de raison d'entrer dans le schéma du produit tant qu'on ne
   veut pas en faire un suivi de tickets.

   Expose sur window : rtContactOuvrir(nature)   — ouvrir depuis ailleurs
   Emprunte          : rien. Ce module ne lit aucun symbole du moteur, et tout
                       ce qu'il touche est vérifié présent avant usage. Il peut
                       donc être chargé n'importe où après son markup, et le
                       retirer ne casse rien d'autre.

   ┌─ POURQUOI UN ENVOI EN ARRIÈRE-PLAN, ET PAS UNE VRAIE SOUMISSION ────────┐
   │ Un <form action="https://formspree.io/…" method="post"> fonctionne, mais │
   │ le navigateur QUITTE la page pour l'écran de remerciement de Formspree.  │
   │ Ici, ça voudrait dire perdre le scénario en cours, le vol en cours, et   │
   │ l'état de la session — exactement au moment où quelqu'un signale ce qui  │
   │ vient de mal se passer. D'où fetch() avec « Accept: application/json » : │
   │ c'est ce que Formspree attend pour répondre en JSON au lieu de rediriger.│
   └──────────────────────────────────────────────────────────────────────────┘

   LES DEUX PIÈGES DÉJÀ ÉVITÉS ICI

   1. Le bouton du menu ne porte PAS de data-page. Le routeur relie chaque
      [data-page] à une <section> : un data-page="contact" serait tombé sur
      l'accueil, sans erreur, puisque « contact » n'est pas dans PAGES.

   2. Le double envoi. Le garde n'est pas seulement `bouton.disabled` — un
      formulaire se soumet aussi par la touche Entrée depuis un champ, ce qui
      ne passe pas par le bouton. Le drapeau `envoiEnCours` est donc testé au
      DÉBUT du gestionnaire de submit, avant toute autre chose.

   Créé le 22/09/2026.
   ========================================================================== */
(function(){
  "use strict";

  /* L'adresse du formulaire. Ce n'est PAS un secret : un identifiant de
     formulaire Formspree est public par construction — il part dans le code de
     la page, comme la clé anonyme de Supabase. La protection contre les abus
     est chez Formspree (quota, piège à robots, filtrage), pas ici.
     tests/contrat/secrets.test.mjs surveille qu'aucune vraie clé ne traîne. */
  var ENDPOINT = 'https://formspree.io/f/xjykwqbg';

  var $ = function(id){ return document.getElementById(id); };

  var modale = $('contactModal');
  if(!modale) return;                     // markup absent : on ne fait rien, sans bruit

  var vueChoix = $('ctChoix'),
      form     = $('ctForm'),
      vueFin   = $('ctFin'),
      sousTitre= $('ctSub'),
      titre    = $('ctTitre'),
      msg      = $('ctMsg'),
      btnEnvoi = $('ctEnvoyer'),
      btnRetour= $('ctRetour'),
      btnAutre = $('ctAutre'),
      champEmail = $('ctEmail'),
      champPage  = $('ctPage'),
      boiteCtx   = $('ctContexte'),
      valeurCtx  = $('ctContexteVal');

  var nature = null;            // 'bug' | 'amelioration'
  var envoiEnCours = false;     // LE garde anti-double-envoi (voir l'en-tête)
  var focusAvant = null;        // à qui rendre le clavier en refermant

  /* -------------------------------------------------------------------------
     1) OÙ ÉTAIT LA PERSONNE — le contexte joint automatiquement

     Tout se lit dans le DOM et dans l'adresse. Aucune variable du moteur n'est
     empruntée, et c'est délibéré : `state` et `SCENARIOS` sont des `const` au
     niveau racine, donc invisibles depuis une IIFE chargée avant eux, et les
     lire créerait une dépendance de plus au monolithe qu'on est en train de
     réduire (CLAUDE.md § 6.2). Si le relevé échoue, le champ reste vide — un
     contexte manquant n'a jamais empêché de lire un message.
     ---------------------------------------------------------------------- */
  var NOM_DE_PAGE = {
    accueil:'Accueil', login:'Connexion', signup:'Inscription',
    cgu:'Conditions d’utilisation', confidentialite:'Politique de confidentialité',
    mentions:'Mentions légales', tableau:'Tableau de bord', exercices:'Scénarios',
    navigation:'Navigation', carte:'Carte', epellation:'Épellation', cours:'Cours',
    progression:'Progression', parametres:'Paramètres', compte:'Paramètres',
    admin:'Administration'
  };

  function pageCourante(){
    var r = String(location.hash || '').replace(/^#/, '');
    r = r.split('/')[0];                                    // #admin/users/u_007 → admin
    return NOM_DE_PAGE[r] || NOM_DE_PAGE.accueil;
  }

  /* Le scénario en cours, s'il y en a un.

     `aria-current="true"` est posé par launchScenario() sur la tuile choisie, et
     il y RESTE après la sortie de session — il dit « dernier lancé », pas « en
     cours ». C'est `body.in-session`, posée et retirée par le moteur, qui dit
     vraiment qu'un échange est ouvert. Les deux ensemble, donc : sans la
     classe, on annoncerait un scénario à quelqu'un revenu à la liste. */
  function scenarioCourant(){
    try{
      if(!document.body.classList.contains('in-session')) return '';
      var b = document.querySelector('.sc-btn[aria-current="true"]');
      if(!b) return '';
      /* La tuile porte trois blocs : .num (« 03 »), .sc-t (le titre) et .sc-d
         (la description). On ne garde que .sc-t — le texte entier de la tuile
         rendrait une ligne de contexte plus longue que le message. */
      var t = b.querySelector('.sc-t');
      return t ? (t.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }catch(e){ return ''; }
  }

  /* Le vol en cours, s'il y en a un. Même principe : `body.in-flight` est posée
     par startFlight() et retirée à la fin du vol (assets/modules/navigation.js),
     et les deux terrains se lisent dans les champs du formulaire de vol, qui
     gardent leur valeur pendant toute la traversée. */
  function volCourant(){
    try{
      if(!document.body.classList.contains('in-flight')) return '';
      var d = document.getElementById('navDep'), a = document.getElementById('navArr');
      var dd = d && d.value.trim(), aa = a && a.value.trim();
      if(dd && aa) return dd + ' → ' + aa;
      return dd || aa || '';
    }catch(e){ return ''; }
  }

  function contexte(){
    var p = pageCourante(), sc = scenarioCourant(), vol = volCourant();
    if(sc)  return p + ' — ' + sc;
    if(vol) return p + ' — ' + vol;
    return p;
  }

  /* Ce qui aide à reproduire un bug et que personne ne pense à écrire : la
     taille de la fenêtre, le thème, le navigateur. Rien qui identifie — c'est
     ce que le navigateur annonce de lui-même à chaque page qu'il charge. */
  function technique(){
    var t = [];
    try{ t.push(window.innerWidth + '×' + window.innerHeight); }catch(e){}
    try{ t.push('thème ' + (document.documentElement.getAttribute('data-theme') || 'clair')); }catch(e){}
    try{ t.push(navigator.userAgent); }catch(e){}
    return t.join(' · ');
  }

  /* -------------------------------------------------------------------------
     2) LES TROIS VUES
     ---------------------------------------------------------------------- */
  function montrer(vue){
    vueChoix.hidden = (vue !== 'choix');
    form.hidden     = (vue !== 'form');
    vueFin.hidden   = (vue !== 'fin');
    /* La confirmation porte son PROPRE titre, centré sous la coche. Laisser en
       plus l'en-tête de la modale affichait « Message envoyé » deux fois, l'un
       au-dessus de l'autre — vu sur la capture du thème sombre. L'en-tête reste
       dans le document : `aria-labelledby` continue d'y puiser le nom de la
       boîte de dialogue, y compris caché. */
    titre.hidden     = (vue === 'fin');
    sousTitre.hidden = (vue === 'fin') || !sousTitre.textContent;
  }

  function direMsg(texte, type){
    if(!msg) return;
    msg.textContent = texte || '';
    msg.classList.toggle('hidden', !texte);
    msg.classList.toggle('auth-msg--err', type === 'err');
    msg.classList.toggle('auth-msg--ok',  type === 'ok');
    /* La carte défile quand elle dépasse l'écran (voir 15-contact.css) : sur un
       téléphone, le bandeau d'erreur pouvait naître sous le bord bas, et l'envoi
       paraissait n'avoir aucun effet. */
    if(texte && msg.scrollIntoView){
      try{ msg.scrollIntoView({ block:'nearest', behavior:'smooth' }); }catch(e){}
    }
  }

  /* Les champs d'une nature sont affichés, ceux de l'autre sont cachés ET
     désactivés. Le `disabled` n'est pas décoratif : un champ caché mais actif
     reste dans le FormData, et un `required` sur un champ invisible bloquerait
     une validation qu'on ne pourrait pas comprendre à l'écran. */
  function appliquerNature(n){
    nature = n;
    var champs = form.querySelectorAll('[data-ct-si]');
    for(var i = 0; i < champs.length; i++){
      var bloc = champs[i], actif = (bloc.getAttribute('data-ct-si') === n);
      bloc.hidden = !actif;
      var saisies = bloc.querySelectorAll('input, textarea');
      for(var j = 0; j < saisies.length; j++) saisies[j].disabled = !actif;
    }
    titre.textContent = (n === 'bug') ? 'Signaler un bug' : 'Proposer une amélioration';
    sousTitre.textContent = (n === 'bug')
      ? 'Décrivez ce qui s’est passé. Plus c’est précis, plus c’est réparable.'
      : 'Toutes les idées sont lues — y compris « il manque telle phraséologie ».';
  }

  /* -------------------------------------------------------------------------
     3) OUVRIR / FERMER
     ---------------------------------------------------------------------- */
  function ouvrir(natureDemandee){
    focusAvant = document.activeElement;

    /* Le contexte est relevé À L'OUVERTURE, pas à l'envoi. Entre les deux, la
       personne a pu quitter son scénario pour venir cliquer sur « Contact » —
       relever à l'envoi rapporterait alors la page d'où elle écrit, pas celle
       dont elle parle. */
    var ctx = contexte();
    modale.setAttribute('data-ct-contexte', ctx);
    if(valeurCtx) valeurCtx.textContent = ctx;
    if(boiteCtx)  boiteCtx.hidden = !ctx;

    /* L'e-mail de la session, quand il y en a une. C'est celui auquel on
       répondra ; le redemander à quelqu'un de connecté est une corvée. Il reste
       modifiable — on peut vouloir être joint ailleurs. */
    if(champEmail && !champEmail.value){
      try{
        var u = window.RTAuth && RTAuth.utilisateur && RTAuth.utilisateur();
        if(u && u.email) champEmail.value = u.email;
      }catch(e){}
    }

    direMsg('');
    modale.hidden = false;

    if(natureDemandee === 'bug' || natureDemandee === 'amelioration'){
      choisir(natureDemandee);
    }else{
      nature = null;
      titre.textContent = 'Contact / Feedback';
      sousTitre.textContent = 'Une anomalie, une idée ? Dites-la ici — c’est lu.';
      montrer('choix');
      var premier = vueChoix.querySelector('.ct-opt');
      if(premier) premier.focus();
    }
  }

  function choisir(n){
    appliquerNature(n);
    /* Le champ « page ou scénario concerné » part pré-rempli du contexte relevé,
       et reste modifiable : la machine sait où on était, elle ne sait pas de
       quoi on veut parler. */
    if(champPage && !champPage.value) champPage.value = modale.getAttribute('data-ct-contexte') || '';
    direMsg('');
    montrer('form');
    if(champEmail) champEmail.focus();
  }

  function fermer(){
    /* On ne referme PAS pendant un envoi : la requête continuerait sans que
       personne puisse en voir le résultat, et on réécrirait le même message. */
    if(envoiEnCours) return;
    modale.hidden = true;
    if(focusAvant && focusAvant.focus){ try{ focusAvant.focus(); }catch(e){} }
    focusAvant = null;
  }

  /* Repartir d'un formulaire propre après un envoi réussi. L'e-mail est
     conservé : c'est la seule chose qu'on ne veut pas faire retaper. */
  function vider(){
    var saisies = form.querySelectorAll('textarea, input[type="text"]');
    for(var i = 0; i < saisies.length; i++) saisies[i].value = '';
    direMsg('');
  }

  /* -------------------------------------------------------------------------
     4) L'ENVOI
     ---------------------------------------------------------------------- */
  function valider(){
    var email = (champEmail.value || '').trim();
    /* Contrôle volontairement large : un motif d'adresse strict rejette des
       adresses valides, et l'adresse est de toute façon revérifiée par
       Formspree. On ne cherche ici qu'à attraper la faute de frappe évidente. */
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){
      direMsg('Indiquez une adresse e-mail valide — c’est par là qu’on vous répondra.', 'err');
      champEmail.focus();
      return null;
    }
    var principal = (nature === 'bug') ? $('ctDescription') : $('ctIdee');
    if(!principal || !(principal.value || '').trim()){
      direMsg(nature === 'bug'
        ? 'Décrivez le problème, même en une phrase.'
        : 'Décrivez votre idée, même en une phrase.', 'err');
      if(principal) principal.focus();
      return null;
    }
    return { email:email, texte:principal.value.trim() };
  }

  function envoyer(e){
    if(e) e.preventDefault();
    if(envoiEnCours) return;               // ← le garde, AVANT tout le reste
    var ok = valider();
    if(!ok) return;

    envoiEnCours = true;
    btnEnvoi.disabled = true;
    btnRetour.disabled = true;
    var libelle = btnEnvoi.textContent;
    btnEnvoi.textContent = 'Envoi…';
    direMsg('');

    /* Les champs partent sous des noms lisibles : le message arrive par e-mail,
       et « page_concernee » y sera lu par un humain, pas par un programme.
       `_subject` est un champ reconnu par Formspree — il donne son objet à
       l'e-mail, sans quoi tous les messages arrivent avec le même titre et on
       ne trie plus rien. */
    var corps = {
      type:          (nature === 'bug') ? 'Bug' : 'Amélioration',
      email:         ok.email,
      contexte:      modale.getAttribute('data-ct-contexte') || '',
      technique:     technique(),
      _subject:      '[Albatros VFR] ' + ((nature === 'bug') ? 'Bug' : 'Amélioration')
                     + ' — ' + (modale.getAttribute('data-ct-contexte') || 'sans contexte')
    };
    if(nature === 'bug'){
      corps.page_concernee = (champPage.value || '').trim();
      corps.description    = ok.texte;
    }else{
      corps.idee     = ok.texte;
      corps.pourquoi = ($('ctPourquoi').value || '').trim();
    }

    var fini = function(){
      envoiEnCours = false;
      btnEnvoi.disabled = false;
      btnRetour.disabled = false;
      btnEnvoi.textContent = libelle;
    };

    fetch(ENDPOINT, {
      method: 'POST',
      /* Sans cet en-tête, Formspree répond par une redirection HTTP vers sa
         page de remerciement — et fetch la suit en silence, si bien que l'envoi
         paraît réussir sans qu'on sache rien de ce qui s'est passé. */
      headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify(corps)
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(data){
        return { ok:r.ok, statut:r.status, data:data };
      });
    }).then(function(res){
      fini();
      if(res.ok){ reussi(); return; }
      direMsg(raison(res), 'err');
    }).catch(function(){
      fini();
      /* Ici, la requête n'est jamais partie : réseau coupé, ou un bloqueur de
         contenu qui filtre le domaine. Les deux se disent de la même façon —
         l'utilisateur ne peut rien faire de la distinction. */
      direMsg('L’envoi n’a pas pu aboutir. Vérifiez votre connexion et réessayez.', 'err');
    });
  }

  /* Formspree renvoie ses motifs dans `errors[]`. On les rend tels quels quand
     ils existent (ils sont explicites : adresse invalide, quota atteint), et on
     retombe sur une phrase générale sinon. Écrire « une erreur est survenue »
     alors que le service a dit « quota du mois atteint » fait perdre du temps
     des deux côtés. */
  function raison(res){
    try{
      var errs = res.data && res.data.errors;
      if(errs && errs.length){
        return errs.map(function(x){ return x.message || String(x); }).join(' ');
      }
    }catch(e){}
    if(res.statut === 429) return 'Trop de messages envoyés d’affilée. Réessayez dans quelques minutes.';
    return 'L’envoi a échoué (code ' + res.statut + '). Réessayez dans un instant.';
  }

  function reussi(){
    var t = $('ctFinTxt');
    if(t){
      t.textContent = (nature === 'bug')
        ? 'Merci — le rapport est parti. Nous vous répondrons à l’adresse indiquée.'
        : 'Merci — l’idée est partie. Nous vous répondrons à l’adresse indiquée.';
    }
    sousTitre.textContent = '';
    vider();
    montrer('fin');
    var b = vueFin.querySelector('.btn');
    if(b) b.focus();
  }

  /* -------------------------------------------------------------------------
     5) LES ÉCOUTEURS
     ---------------------------------------------------------------------- */
  /* Délégué sur le document, et non posé sur les boutons trouvés au chargement :
     le lien du pied de page et celui du menu existent dès le départ, mais rien
     n'interdit qu'un autre point d'entrée apparaisse plus tard dans une page
     construite en JavaScript. */
  document.addEventListener('click', function(ev){
    var b = ev.target && ev.target.closest && ev.target.closest('[data-contact]');
    if(!b) return;
    ev.preventDefault();
    ouvrir(b.getAttribute('data-contact') || null);
  });

  vueChoix.addEventListener('click', function(ev){
    var b = ev.target.closest('[data-ct-nature]');
    if(b) choisir(b.getAttribute('data-ct-nature'));
  });

  modale.addEventListener('click', function(ev){
    if(ev.target.closest('[data-ct-fermer]')) fermer();
    /* Le lien vers la politique de confidentialité navigue : laisser la modale
       ouverte par-dessus la page qu'on vient d'ouvrir serait absurde. Le
       routeur fait la navigation de son côté, on ne fait que refermer. */
    if(ev.target.closest('[data-page]')){ envoiEnCours = false; fermer(); }
  });

  /* Clic sur le fond = fermer, comme rtConfirm(). `mousedown` et non `click` :
     un clic commencé DANS la carte et relâché sur le fond (une sélection de
     texte qui déborde) produit un `click` sur le fond, et refermait la modale
     en perdant le message en cours d'écriture. */
  modale.addEventListener('mousedown', function(ev){ if(ev.target === modale) fermer(); });

  document.addEventListener('keydown', function(ev){
    if(ev.key === 'Escape' && !modale.hidden) fermer();
  });

  form.addEventListener('submit', envoyer);
  btnRetour.addEventListener('click', function(){
    direMsg('');
    titre.textContent = 'Contact / Feedback';
    sousTitre.textContent = 'Une anomalie, une idée ? Dites-la ici — c’est lu.';
    montrer('choix');
  });
  if(btnAutre) btnAutre.addEventListener('click', function(){
    titre.textContent = 'Contact / Feedback';
    sousTitre.textContent = 'Une anomalie, une idée ? Dites-la ici — c’est lu.';
    montrer('choix');
  });

  /* Ouverture programmatique. Sert aux tests de parcours, et ouvre la porte à
     un « signaler ce scénario » posé plus tard à même le récapitulatif. */
  window.rtContactOuvrir = function(n){ ouvrir(n || null); };

  /* ----------------------------------------------------------------------
     6) LA BULLE DE PREMIÈRE CONNEXION
     ----------------------------------------------------------------------
     Un bouton rond sans libellé, en bas à droite, ne dit pas ce qu'il fait. La
     bulle le dit UNE fois, à la première entrée dans l'application, puis se
     tait pour de bon.

     ┌─ OÙ EST RETENU « DÉJÀ VUE » ─────────────────────────────────────────┐
     │ Dans les RÉGLAGES (`rt-settings`, clé `bulleContactVue`), et pas dans │
     │ une clé de stockage à elle. Les réglages montent dans                │
     │ profiles.settings et redescendent sur chaque appareil (donnees.js    │
     │ § 7) : la bulle vue sur l'ordinateur ne se remontre pas sur le       │
     │ téléphone. Une clé de plus, elle, resterait collée au navigateur —   │
     │ exactement ce que CLAUDE.md § 7.2 veut éviter.                       │
     └──────────────────────────────────────────────────────────────────────┘

     Le délai avant l'affichage laisse aux réglages du compte le temps de
     redescendre de la base : sans lui, un nouvel appareil montrerait la bulle
     avant d'apprendre qu'elle a déjà été vue ailleurs.

     Comme le reste de ce fichier, rien n'est emprunté sans test : rtSettings
     et rtSaveSettings viennent du noyau, et leur absence coupe la bulle au
     lieu de casser la page. */
  var bulle = document.getElementById('ctBulle');
  var bulleOk = document.getElementById('ctBulleOk');
  var minuteurBulle = null;
  function bulleDejaVue(){
    try { return typeof rtSettings === 'function' && !!rtSettings().bulleContactVue; }
    catch(e){ return true; }
  }
  function retenirBulle(){
    try {
      if (typeof rtSettings !== 'function' || typeof rtSaveSettings !== 'function') return;
      var s = rtSettings();
      if (s.bulleContactVue) return;
      s.bulleContactVue = true;
      rtSaveSettings(s);
    } catch(e){}
  }
  function cacherBulle(){
    if (minuteurBulle){ clearTimeout(minuteurBulle); minuteurBulle = null; }
    if (bulle && !bulle.hidden){ bulle.hidden = true; retenirBulle(); }
  }
  /* force : montrer même si déjà vue — la simulation de première connexion
     de la console d'administration en a besoin. */
  function montrerBulle(force){
    if (!bulle) return;
    if (!force && bulleDejaVue()) return;
    if (minuteurBulle) clearTimeout(minuteurBulle);
    minuteurBulle = setTimeout(function(){
      minuteurBulle = null;
      if (!document.body.classList.contains('state-app')) return;
      if (!force && bulleDejaVue()) return;
      bulle.hidden = false;
    }, force ? 600 : 1500);
  }
  if (bulleOk) bulleOk.addEventListener('click', cacherBulle);
  /* Ouvrir la modale par le bouton, c'est avoir compris : la bulle se retire. */
  document.addEventListener('click', function(ev){
    if (ev.target && ev.target.closest && ev.target.closest('[data-contact]')) cacherBulle();
  });
  window.addEventListener('rt:page', function(){
    /* Hors de l'application (vitrine, connexion, déconnexion), la bulle n'a
       rien à faire là. Sans marquer « vue » : elle n'a pas été lue. */
    if (!document.body.classList.contains('state-app')){
      if (minuteurBulle){ clearTimeout(minuteurBulle); minuteurBulle = null; }
      if (bulle) bulle.hidden = true;
      return;
    }
    if (bulle && bulle.hidden) montrerBulle(false);
  });

  window.RTContact = { bulle: function(force){ montrerBulle(!!force); } };
})();
