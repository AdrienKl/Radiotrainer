/* =============================================================================
   RadioTrainer — PARCOURS D'INSCRIPTION (5 étapes)
   -----------------------------------------------------------------------------
   L'ordre est celui d'un parcours honnête : on demande l'adresse, on la PROUVE
   par un code reçu dessus, et seulement ensuite on pose un mot de passe. Le
   signUp(email, password) de Supabase ne sait pas faire ça — il exige les deux
   d'un coup — d'où le passage par signInWithOtp / verifyOtp / updateUser.

   ┌─ CE QUI N'EST PAS FAIT ICI, ET NE DOIT JAMAIS L'ÊTRE ────────────────────┐
   │ · Aucun mot de passe n'est lu, comparé, stocké ni journalisé. Les deux   │
   │   champs servent à détecter une faute de frappe, puis sont vidés.        │
   │ · Aucune décision d'autorisation. Ce fichier remplit un formulaire ; ce  │
   │   qui est accepté est tranché par RLS, les contraintes CHECK et          │
   │   inscription_jalon(), côté base (sql/001-inscription.sql).              │
   │ · Aucune vérification anti-robot. L'emplacement existe, il est VIDE, et  │
   │   il le dit. Un contrôle écrit dans cette page ne protégerait rien : la  │
   │   page appartient au visiteur. Il faut le réglage Supabase, qui valide   │
   │   le jeton côté serveur.                                                 │
   │ · Aucun horodatage de consentement écrit par le client : cgu_le,         │
   │   age_15_le, mdp_le et onboarding_le sont posés par la base, à son       │
   │   horloge. Un consentement que l'utilisateur peut antidater ne vaut rien.│
   └─────────────────────────────────────────────────────────────────────────┘

   LES LISTES DE RÉPONSES ci-dessous sont la moitié d'un contrat : l'autre
   moitié est dans les contraintes CHECK de sql/001-inscription.sql. Ajouter un
   choix à une liste FERMÉE (profil, heures, niveau) sans toucher au SQL fait
   échouer l'enregistrement avec un message incompréhensible. Les listes
   OUVERTES (découverte, objectifs, avion) n'ont pas de CHECK, justement parce
   qu'elles finissent par « Autre » et un champ libre.
   ========================================================================== */
(function(){
  'use strict';

  /* Version des CGU acceptées. Tant que le texte n'existe pas (voir #page-cgu),
     ce n'est PAS un vrai consentement, et l'enregistrer sous un nom de brouillon
     est la seule façon honnête de le dire : le jour où la version 1 paraîtra,
     un simple « where cgu_version = 'brouillon-0' » retrouve tout le monde à qui
     il faut redemander son accord. */
  var CGU_VERSION = 'brouillon-0';

  var QUESTIONS = [
    { id:'decouverte', colonne:'decouverte', type:'un', facultative:true,
      titre:"Où nous avez-vous connu ?",
      /* FACULTATIVE PAR OBLIGATION, pas par gentillesse : c'est la seule
         question de nature commerciale du questionnaire, sa base légale est le
         consentement, et un consentement contraint n'est pas un consentement
         (RGPD art. 7.4). Ne jamais la rendre obligatoire. */
      sous:"Question facultative, purement statistique. Vous pouvez passer.",
      choix:[
        ['reseaux',     "Réseaux sociaux (Instagram, TikTok, YouTube…)"],
        ['bouche',      "Bouche à oreille — un ami, un autre élève"],
        ['aeroclub',    "Mon aéro-club ou mon instructeur"],
        ['forum',       "Un forum ou un groupe de pilotes"],
        ['recherche',   "Une recherche sur Internet"],
        ['autre',       "Autre"]
      ] },

    { id:'profil', colonne:'profil_pilote', type:'un',
      titre:"Où en êtes-vous ?",
      sous:"C'est ce qui règle la difficulté de départ.",
      /* Liste FERMÉE — contrainte profils_profil_pilote dans le SQL. */
      choix:[
        ['eleve-debut', "Élève pilote, je débute"],
        ['eleve-cours', "Élève pilote, en cours de formation"],
        ['brevete',     "Pilote breveté (PPL, LAPL, ULM…)"],
        ['simulateur',  "Pilote sur simulateur (MSFS, X-Plane…)"],
        ['curieux',     "Curieux, je découvre l'aviation"],
        ['autre',       "Autre"]
      ] },

    { id:'heures', colonne:'heures_vol', type:'un',
      titre:"Combien d'heures de vol, à peu près ?",
      /* Des TRANCHES, jamais le chiffre exact : le chiffre exact n'apporte rien
         à l'application et relève donc de la collecte inutile (art. 5.1.c).
         La question ne s'affiche que pour ceux qui volent — la poser à un
         curieux serait absurde, et une réponse absurde pollue les statistiques. */
      sous:"Une tranche suffit — nous n'avons aucun besoin du chiffre exact.",
      siProfil:['eleve-cours','brevete'],
      choix:[
        ['-10',    "Moins de 10 heures"],
        ['10-50',  "Entre 10 et 50 heures"],
        ['50-200', "Entre 50 et 200 heures"],
        ['200+',   "Plus de 200 heures"],
        ['tait',   "Je préfère ne pas le dire"]
      ] },

    { id:'objectifs', colonne:'objectifs', type:'plusieurs',
      titre:"Qu'est-ce que vous venez chercher ?",
      sous:"Plusieurs réponses possibles.",
      choix:[
        ['examen',    "Préparer l'examen ou l'oral"],
        ['aise',      "Être à l'aise au micro en vol"],
        ['comprendre',"Comprendre ce que disent les contrôleurs"],
        ['alphabet',  "Maîtriser l'alphabet et les nombres"],
        ['anglais',   "La phraséologie en anglais"],
        ['nav',       "Préparer une navigation"],
        ['controle',  "Passer un terrain contrôlé sans stress"],
        ['plaisir',   "Pour le plaisir, sans objectif précis"],
        ['autre',     "Autre"]
      ] },

    { id:'avion', colonne:'type_avion', type:'un',
      titre:"Sur quoi volez-vous, ou aimeriez-vous voler ?",
      choix:[
        ['dr400',   "DR400 ou autre Robin"],
        ['cessna',  "Cessna 152 / 172"],
        ['piper',   "Piper PA-28"],
        ['ulm',     "ULM"],
        ['planeur', "Planeur"],
        ['helico',  "Hélicoptère"],
        ['jet',     "Jet ou aviation d'affaires"],
        ['ligne',   "Avion de ligne (A320, B737…)"],
        ['sais-pas',"Je ne sais pas encore"],
        ['autre',   "Autre"]
      ] },

    { id:'radio', colonne:'niveau_radio', type:'un',
      titre:"Votre niveau à la radio, aujourd'hui ?",
      sous:"Personne ne juge. C'est le point de départ, pas une note.",
      /* Liste FERMÉE — contrainte profils_niveau_radio dans le SQL. */
      choix:[
        ['debutant',      "Débutant complet, le micro m'intimide"],
        ['bases',         "Je connais les bases, je cherche mes mots"],
        ['terrain-connu', "Je m'en sors sur un terrain que je connais"],
        ['aise',          "À l'aise, je veux me perfectionner"],
        ['tait',          "Je préfère ne pas m'évaluer"]
      ] }
  ];

  /* Le pseudo : mêmes règles que la contrainte profils_pseudo_forme et que la
     fonction pseudo_libre(). Trois copies de la même règle, c'est deux de trop —
     mais l'alternative serait soit de ne rien vérifier avant l'envoi (et
     d'infliger un aller-retour réseau pour une faute de frappe), soit de ne
     rien vérifier en base (et d'accepter n'importe quoi par un client modifié). */
  var FORME_PSEUDO = /^[a-z0-9][a-z0-9_-]{1,18}[a-z0-9]$/;

  /* --------------------------------------------------------------------------
     État du parcours. En mémoire seulement : rien dans localStorage. Une
     inscription à moitié faite qui ressusciterait trois jours plus tard dans un
     autre onglet ferait plus de dégâts que de bien — et de toute façon la
     vérité est en base, dans les jalons.
     -------------------------------------------------------------------------- */
  var etat = { etape:1, email:'', reponses:{}, libres:{} };

  function $(id){ return document.getElementById(id); }
  function msg(n, texte, type){
    var e = $('insMsg'+n); if (!e) return;
    e.textContent = texte || '';
    e.className = 'auth-msg' + (texte ? (' auth-msg--'+(type||'err')) : ' hidden');
  }
  function erreur(n, e){ msg(n, window.RTAuth ? RTAuth.message(e) : String(e && e.message || e)); }

  /* Le bouton se verrouille pendant l'appel. Sans cela, un double-clic sur
     « Recevoir mon code » consomme deux des deux envois autorisés par heure. */
  function occuper(btn, texte){
    if (!btn) return function(){};
    var avant = btn.textContent;
    btn.disabled = true; btn.textContent = texte;
    return function(){ btn.disabled = false; btn.textContent = avant; };
  }

  function aller(n){
    etat.etape = n;
    [].forEach.call(document.querySelectorAll('#page-signup .ins-etape'), function(d){
      d.hidden = (d.getAttribute('data-etape') !== String(n));
    });
    [].forEach.call(document.querySelectorAll('#insFil li'), function(li){
      var k = parseInt(li.getAttribute('data-fil'), 10);
      li.classList.toggle('ici',   k === n);
      li.classList.toggle('faite', k <  n);
    });
    if (n === 4) peindreQcm();
    if (n === 5) remplirAerodromes();
    /* Le focus suit l'étape : au clavier comme au lecteur d'écran, un écran qui
       change sans déplacer le focus laisse l'utilisateur au bouton précédent.
       MAIS seulement si la page est effectivement affichée — sinon l'appel
       d'initialisation aller(1) volerait le focus au chargement et ferait
       défiler la vitrine jusqu'au formulaire, qui vit dans la même page. */
    var hote = document.getElementById('page-signup');
    if (hote && hote.classList.contains('active')){
      var prem = document.querySelector('.ins-etape[data-etape="'+n+'"] input');
      if (prem) try{ prem.focus(); }catch(e){}
    }
  }

  /* ==========================================================================
     ÉTAPE 1 — adresse, conditions, âge
     ========================================================================== */
  /* Volontairement permissif : le seul juge de la validité d'une adresse est le
     serveur qui lui envoie le code. Un motif trop strict refuse des adresses
     parfaitement valides (apostrophes, domaines longs, nouveaux TLD), et c'est
     bien plus agaçant qu'un aller-retour inutile. On n'écarte donc que ce qui ne
     peut pas être une adresse du tout. */
  function emailPlausible(v){ return /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(v); }

  function envoyerCode(){
    /* Le bandeau le dit déjà, mais il peut avoir été survolé : mieux vaut un
       refus net qu'un code envoyé sur une adresse qui remplacerait la session
       en cours au milieu du parcours. */
    if (sessionEnTrop())
      return msg(1, "Vous êtes déjà connecté. Déconnectez-vous d'abord pour créer un autre compte.");
    var email = ($('insEmail').value || '').trim();
    if (!emailPlausible(email)) return msg(1, "Vérifiez votre adresse e-mail.");
    if (!$('insCgu').checked)   return msg(1, "Vous devez accepter les conditions d'utilisation pour créer un compte.");
    if (!$('insAge').checked)   return msg(1, "L'inscription est réservée aux personnes de 15 ans révolus.");
    msg(1, '');
    var libre = occuper($('insEnvoyer'), 'Envoi…');
    RTAuth.otpEnvoyer(email, true).then(function(){
      libre();
      etat.email = email;
      $('insRappelMail').textContent = email;
      aller(2);
      msg(2, "Code envoyé. Il peut mettre une minute à arriver.", 'ok');
    }).catch(function(e){ libre(); erreur(1, e); });
  }

  /* ==========================================================================
     ÉTAPE 2 — le code
     ========================================================================== */
  function verifier(){
    var code = ($('insCode').value || '').replace(/\s+/g, '');
    if (code.length < 6) return msg(2, "Saisissez le code à six chiffres reçu par e-mail.");
    msg(2, '');
    var libre = occuper($('insVerifier'), 'Vérification…');
    RTAuth.otpVerifier(etat.email, code)
      .then(function(){ return RTAuth.rechargerProfil(); })
      .then(apresVerification)
      .then(function(){ libre(); })
      .catch(function(e){ libre(); erreur(2, e); });
  }

  /* Le code a été accepté : l'adresse est prouvée et la session est ouverte.
     Trois cas, et un seul mérite de continuer le parcours. */
  function apresVerification(){
    var p = RTAuth.profil();

    /* Cas 1 — le compte existait déjà et son parcours est terminé. verifyOtp
       vient donc de CONNECTER quelqu'un, pas d'inscrire. On ne le renvoie pas
       à l'écran de connexion : il est chez lui, on le laisse entrer. Et on ne
       lui a rien révélé au passage — le code n'arrive que dans SA boîte. */
    if (p && p.onboarding_le){
      msg(2, "Vous aviez déjà un compte : vous êtes connecté.", 'ok');
      if (window.rtEntrer) window.rtEntrer();
      return;
    }

    /* Cas 2 et 3 — inscription neuve, ou reprise d'un parcours abandonné. On
       enregistre le consentement MAINTENANT : c'est le premier instant où il y
       a une session, donc le premier instant où la base peut l'attribuer à
       quelqu'un. Les cases ont été cochées à l'étape 1. */
    return RTAuth.jalon('consentement', CGU_VERSION)
      .then(function(){ return RTAuth.rechargerProfil(); })
      .then(function(){ aller(etapeAReprendre()); });
  }

  /* Où reprendre un parcours inachevé. L'ordre suit les jalons : sans mot de
     passe le compte n'est pas récupérable, c'est donc le plus urgent. */
  function etapeAReprendre(){
    var p = RTAuth.profil() || {};
    if (!p.mdp_le) return 3;
    if (!p.profil_pilote || !p.niveau_radio) return 4;
    return 5;
  }

  /* ==========================================================================
     ÉTAPE 3 — le mot de passe
     ========================================================================== */
  function poserMotDePasse(){
    var a = $('insMdp1').value || '', b = $('insMdp2').value || '';
    if (a.length < 8) return msg(3, "Choisissez un mot de passe d'au moins 8 caractères.");
    if (a !== b)      return msg(3, "Les deux mots de passe ne sont pas identiques.");
    msg(3, '');
    var libre = occuper($('insMdpOk'), 'Enregistrement…');
    /* Les champs sont vidés dans TOUS les cas, succès comme échec : un mot de
       passe qui reste dans le DOM traîne dans la page, dans les captures
       d'écran et dans les outils de développement. */
    var vider = function(){ $('insMdp1').value = ''; $('insMdp2').value = ''; };
    RTAuth.definirMotDePasse(a)
      .then(function(){ return RTAuth.jalon('mot-de-passe'); })
      .then(function(){ return RTAuth.rechargerProfil(); })
      .then(function(){ libre(); vider(); aller(4); })
      .catch(function(e){ libre(); vider(); erreur(3, e); });
  }

  /* ==========================================================================
     ÉTAPE 4 — le questionnaire
     ========================================================================== */
  function peindreQcm(){
    var hote = $('insQcm'); if (!hote) return;
    hote.textContent = '';
    QUESTIONS.forEach(function(q){
      /* La question des heures de vol ne concerne que ceux qui volent. Elle est
         peinte quand même mais masquée, pour que la réponse déjà donnée ne soit
         pas perdue si l'on revient changer son profil. */
      var bloc = document.createElement('div');
      bloc.className = 'ins-q';
      bloc.setAttribute('data-q', q.id);

      var h = document.createElement('h3');
      h.textContent = q.titre;
      if (q.facultative){
        var opt = document.createElement('i');
        opt.className = 'ins-opt'; opt.textContent = ' (facultatif)';
        h.appendChild(opt);
      }
      bloc.appendChild(h);

      if (q.sous){ var s = document.createElement('p'); s.textContent = q.sous; bloc.appendChild(s); }

      var liste = document.createElement('div');
      liste.className = 'ins-choix';
      /* role=group et non radiogroup : ce sont des <button aria-pressed>, pas
         des boutons radio. Annoncer un type de contrôle qu'on n'implémente pas
         désoriente les lecteurs d'écran plus qu'il ne les aide. */
      liste.setAttribute('role', 'group');
      liste.setAttribute('aria-label', q.titre);
      q.choix.forEach(function(c){
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = c[1];
        b.setAttribute('data-val', c[0]);
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', function(){ choisir(q, c[0], liste); });
        liste.appendChild(b);
      });
      bloc.appendChild(liste);

      /* « Autre » ouvre un champ libre. Il reste dans le DOM et se contente de
         se masquer : le texte déjà tapé survit à un changement d'avis. */
      var libre = document.createElement('div');
      libre.className = 'ins-libre'; libre.hidden = true;
      var inp = document.createElement('input');
      inp.type = 'text'; inp.maxLength = 60;
      inp.placeholder = 'Précisez (facultatif)';
      inp.setAttribute('aria-label', q.titre + ' — précisez');
      inp.addEventListener('input', function(){ etat.libres[q.id] = inp.value; });
      libre.appendChild(inp);
      bloc.appendChild(libre);

      hote.appendChild(bloc);
    });
    rejouerQcm();
    majVisibilite();
  }

  function choisir(q, val, liste){
    if (q.type === 'plusieurs'){
      var d = etat.reponses[q.id] || [];
      var i = d.indexOf(val);
      if (i >= 0) d.splice(i, 1); else d.push(val);
      etat.reponses[q.id] = d;
    } else {
      /* Recliquer sa propre réponse la retire : sur une question facultative
         c'est le seul moyen de revenir sur un clic involontaire. */
      etat.reponses[q.id] = (etat.reponses[q.id] === val) ? null : val;
    }
    peindreChoix(q, liste);
    if (q.id === 'profil') majVisibilite();
  }

  function peindreChoix(q, liste){
    var d = etat.reponses[q.id];
    var pris = (q.type === 'plusieurs') ? (d || []) : (d ? [d] : []);
    [].forEach.call(liste.querySelectorAll('button'), function(b){
      b.setAttribute('aria-pressed', pris.indexOf(b.getAttribute('data-val')) >= 0 ? 'true' : 'false');
    });
    var libre = liste.parentNode.querySelector('.ins-libre');
    if (libre) libre.hidden = pris.indexOf('autre') < 0;
  }

  function rejouerQcm(){
    QUESTIONS.forEach(function(q){
      var bloc = document.querySelector('.ins-q[data-q="'+q.id+'"]');
      if (!bloc) return;
      peindreChoix(q, bloc.querySelector('.ins-choix'));
      var inp = bloc.querySelector('.ins-libre input');
      if (inp && etat.libres[q.id]) inp.value = etat.libres[q.id];
    });
  }

  function majVisibilite(){
    QUESTIONS.forEach(function(q){
      if (!q.siProfil) return;
      var bloc = document.querySelector('.ins-q[data-q="'+q.id+'"]');
      if (bloc) bloc.hidden = q.siProfil.indexOf(etat.reponses.profil) < 0;
    });
  }

  /* Une question obligatoire est une question sans `facultative`, et qui est
     visible. Poser une question masquée serait un piège : l'utilisateur
     chercherait en vain ce qu'il n'a pas rempli. */
  function manquante(){
    for (var i=0; i<QUESTIONS.length; i++){
      var q = QUESTIONS[i];
      if (q.facultative) continue;
      if (q.siProfil && q.siProfil.indexOf(etat.reponses.profil) < 0) continue;
      var d = etat.reponses[q.id];
      if (q.type === 'plusieurs' ? !(d && d.length) : !d) return q;
    }
    return null;
  }

  /* Le texte libre d'« Autre » est joint à la valeur : « autre: hélico de
     montagne ». Un « autre » nu ne dit rien, et créer une colonne par question
     pour recueillir une précision facultative serait disproportionné. */
  function valeur(q){
    var d = etat.reponses[q.id];
    var precision = (etat.libres[q.id] || '').trim().slice(0, 40);
    if (q.type === 'plusieurs'){
      return (d || []).map(function(v){
        return (v === 'autre' && precision) ? ('autre: ' + precision) : v;
      });
    }
    if (!d) return null;
    return (d === 'autre' && precision) ? ('autre: ' + precision) : d;
  }

  function enregistrerQcm(){
    var q = manquante();
    if (q){
      msg(4, "Il reste une question sans réponse : « " + q.titre + " »");
      var bloc = document.querySelector('.ins-q[data-q="'+q.id+'"]');
      if (bloc) try{ bloc.scrollIntoView({ block:'center', behavior:'smooth' }); }catch(e){}
      return;
    }
    msg(4, '');
    var champs = {};
    QUESTIONS.forEach(function(qq){
      /* Une question masquée n'est pas enregistrée, et sa colonne est remise à
         vide : quelqu'un qui se déclarait breveté puis se corrige en « curieux »
         ne doit pas garder ses heures de vol accrochées à son profil. */
      if (qq.siProfil && qq.siProfil.indexOf(etat.reponses.profil) < 0){
        champs[qq.colonne] = (qq.type === 'plusieurs') ? [] : null;
      } else {
        champs[qq.colonne] = valeur(qq);
      }
    });
    var libre = occuper($('insQcmOk'), 'Enregistrement…');
    RTAuth.majProfil(champs)
      .then(function(){ return RTAuth.rechargerProfil(); })
      .then(function(){ libre(); aller(5); })
      .catch(function(e){ libre(); erreur(4, e); });
  }

  /* ==========================================================================
     ÉTAPE 5 — identité
     ========================================================================== */
  function remplirAerodromes(){
    var dl = $('insAeroListe');
    if (!dl || dl.childElementCount) return;          // une seule fois
    if (typeof AERODROMES === 'undefined') return;    // base absente : champ libre
    AERODROMES.forEach(function(a){
      if (!a || !a.icao) return;
      var o = document.createElement('option');
      o.value = a.icao;
      if (a.nom) o.label = a.nom;
      dl.appendChild(o);
    });
  }

  /* Résout ce que l'utilisateur a tapé — un code OACI ou un nom de terrain —
     en code OACI. Sans ça, la colonne contiendrait un mélange de « LFOP », de
     « Rouen » et de « rouen vallee de seine », et le jour où les exercices
     s'appuieront dessus rien ne se rejoindrait. */
  function resoudreAerodrome(v){
    v = (v || '').trim();
    if (!v) return { vide:true };
    if (typeof AERODROMES === 'undefined') return { icao:v.toUpperCase().slice(0, 8) };
    var haut = v.toUpperCase();
    var parCode = AERODROMES.filter(function(a){ return a.icao === haut; })[0];
    if (parCode) return { icao:parCode.icao };
    /* Comparer sans accent ni casse : personne ne tape « Chalons Vatry » avec
       l'accent au bon endroit, et refuser pour un accent serait absurde. */
    var sansAccent = function(t){
      var x = String(t || '');
      return (x.normalize ? x.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : x).toLowerCase();
    };
    var cible = sansAccent(v);
    var parNom = AERODROMES.filter(function(a){ return sansAccent(a.nom) === cible; })[0]
              || AERODROMES.filter(function(a){ return sansAccent(a.nom).indexOf(cible) === 0; })[0];
    if (parNom) return { icao:parNom.icao };
    return { inconnu:true };
  }

  var minuteurPseudo = null, dernierPseudoTeste = null, pseudoLibre = false;
  function aidePseudo(texte, classe){
    var e = $('insPseudoEtat'); if (!e) return;
    e.textContent = texte;
    e.className = 'ins-aide' + (classe ? ' '+classe : '');
  }

  function testerPseudo(){
    var v = ($('insPseudo').value || '').trim().toLowerCase();
    pseudoLibre = false;
    if (!v){ return aidePseudo("3 à 20 caractères : minuscules, chiffres, tiret ou souligné."); }
    if (!FORME_PSEUDO.test(v)){
      return aidePseudo("3 à 20 caractères, en minuscules. Chiffres, tiret et souligné autorisés ; "
                      + "ni espace, ni accent, et pas de tiret en début ou en fin.", 'nok');
    }
    aidePseudo("Vérification…");
    dernierPseudoTeste = v;
    RTAuth.pseudoLibre(v).then(function(ok){
      if (dernierPseudoTeste !== v) return;           // une frappe plus récente a pris le relais
      pseudoLibre = ok;
      aidePseudo(ok ? "« " + v + " » est disponible."
                    : "« " + v + " » n'est pas disponible.", ok ? 'ok' : 'nok');
    }).catch(function(){
      if (dernierPseudoTeste !== v) return;
      /* Le test a échoué (réseau, session expirée). On ne bloque pas pour
         autant : l'index unique de la base reste le juge, et il refusera
         l'enregistrement s'il le faut. Mieux vaut un refus clair à la fin
         qu'un parcours bloqué par une vérification de confort. */
      pseudoLibre = true;
      aidePseudo("Impossible de vérifier la disponibilité pour l'instant.");
    });
  }

  function terminer(){
    var pseudo = ($('insPseudo').value || '').trim().toLowerCase();
    var prenom = ($('insPrenom').value || '').trim();
    var nom    = ($('insNom').value || '').trim();

    if (!FORME_PSEUDO.test(pseudo))
      return msg(5, "Choisissez un nom d'utilisateur de 3 à 20 caractères, en minuscules.");
    if (!pseudoLibre)
      return msg(5, "Ce nom d'utilisateur n'est pas disponible. Essayez-en un autre.");
    if (!prenom)
      return msg(5, "Votre prénom est nécessaire : l'application s'en sert pour vous appeler par votre nom.");

    var aero = resoudreAerodrome($('insAero').value);
    if (aero.inconnu)
      return msg(5, "Ce terrain n'est pas dans notre base. Choisissez-le dans la liste déroulante, "
                  + "ou laissez le champ vide — il est facultatif.");
    msg(5, '');

    var champs = {
      pseudo: pseudo, prenom: prenom, nom: nom || null,
      aerodrome: aero.vide ? null : aero.icao,
      /* display_name reste la colonne que lisent la barre latérale et la console
         d'administration. On la tient à jour ici pour ne pas avoir deux sources
         de vérité sur « comment s'appelle cette personne ». */
      display_name: [prenom, nom].filter(Boolean).join(' ')
    };
    var libre = occuper($('insTerminer'), 'Création…');
    RTAuth.majProfil(champs)
      .then(function(){ return RTAuth.jalon('termine'); })
      .then(function(){ return RTAuth.rechargerProfil(); })
      .then(function(){
        libre();
        if (window.rtEntrer) window.rtEntrer();
      })
      .catch(function(e){ libre(); erreur(5, e); });
  }

  /* ==========================================================================
     Reprise d'un parcours abandonné
     --------------------------------------------------------------------------
     Quelqu'un qui ferme l'onglet entre l'étape 2 et l'étape 5 a un compte
     RÉEL mais inutilisable : sans mot de passe il ne pourra plus se connecter
     autrement qu'en redemandant un code. Le routeur consulte donc aReprendre()
     avant d'ouvrir l'application, et le renvoie ici au bon endroit.

     Cette fonction est aussi la raison pour laquelle la migration SQL remplit
     onboarding_le des comptes existants (§ 6 du fichier) : sans ce remplissage,
     TOUS les comptes d'avant — celui du propriétaire du site compris — seraient
     vus comme inachevés et piégés dans ce parcours.
     ========================================================================== */
  window.RTInscription = {
    aReprendre: function(){
      var p = window.RTAuth && RTAuth.profil();
      if (!p) return false;
      /* LA COLONNE ABSENTE N'EST PAS UN PARCOURS INACHEVÉ.
         Si sql/001-inscription.sql n'a pas encore été exécuté, `profiles` n'a
         pas de colonne onboarding_le et le profil arrive sans cette clé :
         `!p.onboarding_le` serait donc vrai pour TOUT LE MONDE, et tous les
         comptes existants — le vôtre compris — se retrouveraient enfermés dans
         le questionnaire à leur prochaine connexion. On distingue donc
         « absente » de « vide » avec `in`, et tant que la base n'a pas les
         jalons, le parcours ne réclame rien à personne. */
      if (!('onboarding_le' in p)) return false;
      return !p.onboarding_le;
    },
    /* ---- Couture de test (même motif que RT_TEST_EPEL pour l'épellation) ----
       Elle permet d'exercer les étapes 4 et 5 sans consommer un e-mail : le
       service d'envoi intégré de Supabase n'en autorise que deux par heure, et
       une suite de tests qui en dépend n'est pas une suite de tests.

       Elle n'accorde AUCUN droit. _aller() ne fait qu'afficher un panneau ;
       tout ce qui compte est vérifié ailleurs et par la base — RLS borne
       chaque écriture à sa propre ligne, et inscription_jalon('termine')
       refuse de clore un questionnaire incomplet. Sauter une étape ici ne fait
       donc qu'afficher un formulaire vide. */
    _etape:     function(){ return etat.etape; },
    _aller:     function(n){ aller(n); },
    _reponses:  function(){ return etat.reponses; },
    _manquante: function(){ var q = manquante(); return q ? q.id : null; },
    _aero:      function(v){ return resoudreAerodrome(v); },
    _pseudoOk:  function(){ return pseudoLibre; },

    /* La définition du questionnaire, pour la page Compte. Elle doit y afficher
       EXACTEMENT les mêmes questions et les mêmes choix : la rectification
       (RGPD art. 16) n'a aucun sens si le formulaire de correction propose
       autre chose que le formulaire de collecte. Deux copies de ces listes
       finiraient par divergier, et c'est la copie oubliée qui écrirait en base
       une valeur que la contrainte CHECK refuse.
       Copie de surface : la liste est à nous, les questions sont partagées. */
    questions: function(){ return QUESTIONS.slice(); },
    /* Le libellé d'une valeur enregistrée, pour l'afficher en clair. Le texte
       libre d'« Autre » est stocké sous la forme « autre: hélico de montagne ». */
    libelle: function(idQuestion, valeur){
      var q = QUESTIONS.filter(function(x){ return x.id === idQuestion; })[0];
      if (!q || !valeur) return '';
      var v = String(valeur), libre = '';
      if (v.indexOf('autre:') === 0){ libre = v.slice(6).trim(); v = 'autre'; }
      var c = q.choix.filter(function(x){ return x[0] === v; })[0];
      var t = c ? c[1] : v;
      return libre ? (t + ' — ' + libre) : t;
    }
  };

  /* Session déjà ouverte sur l'étape 1 : on affiche un bandeau, on ne navigue
     PAS. La première version appelait rtEntrer() ici, et cliquer « S'inscrire »
     depuis l'écran de connexion ouvrait donc l'application sans qu'on ait rien
     saisi. La session derrière était légitime, mais une navigation que
     l'utilisateur n'a pas demandée reste un bug — et sur un poste partagé,
     c'était la session du précédent qui s'ouvrait d'un clic. */
  function bandeauDeja(oui){
    var b = $('insDeja'); if (!b) return;
    b.classList.toggle('hidden', !oui);
    if (!oui) return;
    var m = $('insDejaMail');
    if (m) m.textContent = (window.RTAuth && (RTAuth.utilisateur()||{}).email) || 'cette adresse';
  }

  /* Créer un compte pendant qu'une session est ouverte écrirait les réponses du
     questionnaire dans le profil de la session en cours si quoi que ce soit
     tournait mal entre-temps. Exiger la déconnexion coûte un clic et supprime
     toute la classe de demi-états. Ne concerne que l'étape 1 : une reprise de
     parcours a forcément une session, et c'est normal. */
  function sessionEnTrop(){
    return !!(window.RTAuth && RTAuth.profil() && !RTInscription.aReprendre());
  }

  window.addEventListener('rt:page', function(ev){
    if (!ev.detail || ev.detail.page !== 'signup') return;
    if (!window.RTAuth) return;
    if (RTInscription.aReprendre()){
      etat.email = (RTAuth.utilisateur() || {}).email || etat.email;
      var e = $('insRappelMail'); if (e) e.textContent = etat.email;
      bandeauDeja(false);
      aller(etapeAReprendre());
      return;
    }
    bandeauDeja(!!RTAuth.profil());
  });

  /* Se déconnecter depuis le bandeau doit le faire disparaître sans recharger :
     l'utilisateur vient de cliquer pour pouvoir s'inscrire, le laisser devant
     un avertissement périmé serait absurde. */
  window.addEventListener('rt:auth', function(){
    if (!document.body.classList.contains('state-auth')) return;
    if (location.hash.indexOf('#signup') !== 0) return;
    bandeauDeja(sessionEnTrop());
  });

  /* --------------------------------------------------------------------------
     Branchement
     -------------------------------------------------------------------------- */
  function brancher(){
    if (!$('insEnvoyer')) return;

    $('insEnvoyer').addEventListener('click', envoyerCode);
    $('insVerifier').addEventListener('click', verifier);
    $('insMdpOk').addEventListener('click', poserMotDePasse);
    $('insQcmOk').addEventListener('click', enregistrerQcm);
    $('insTerminer').addEventListener('click', terminer);

    $('insDejaSortir').addEventListener('click', function(){
      msg(1, '');
      /* La déconnexion ramène à l'accueil (rtSortir), or la personne vient de
         cliquer pour pouvoir s'inscrire : on la remet sur l'inscription.
         Il faut ATTENDRE la promesse. Une première version posait le hash après
         60 ms : le minuteur partait avant que signOut() ne réponde, et le retour
         à l'accueil l'écrasait — on atterrissait sur la vitrine. */
      var revenir = function(){ location.hash = '#signup'; };
      if (window.RTAuth) RTAuth.deconnexion().then(revenir, revenir);
      else { if (window.rtSortir) window.rtSortir(); revenir(); }
    });

    $('insRetourMail').addEventListener('click', function(){ msg(2, ''); aller(1); });
    $('insRenvoyer').addEventListener('click', function(){
      msg(2, '');
      var libre = occuper($('insRenvoyer'), 'Envoi…');
      RTAuth.otpEnvoyer(etat.email, true).then(function(){
        libre(); msg(2, "Nouveau code envoyé.", 'ok');
      }).catch(function(e){ libre(); erreur(2, e); });
    });

    /* Le pseudo se vérifie pendant la frappe, mais pas à chaque touche : une
       requête par caractère, c'est huit requêtes pour « pilote28 ».

       Les majuscules sont mises en bas DANS LE CHAMP, et pas seulement au
       moment d'enregistrer. Corriger en silence laisserait quelqu'un qui a tapé
       « Pilote28 » lire « Pilote28 » à l'écran et recevoir « pilote28 » comme
       nom d'utilisateur — un écart discret entre ce qu'on montre et ce qu'on
       fait, qui se découvre bien plus tard. La longueur ne changeant pas, le
       curseur est remis exactement où il était, sinon il sauterait en fin de
       ligne à chaque correction en milieu de mot. */
    $('insPseudo').addEventListener('input', function(){
      var e = this, bas = e.value.toLowerCase();
      if (bas !== e.value){
        var pos = e.selectionStart;
        e.value = bas;
        try{ e.setSelectionRange(pos, pos); }catch(_){}
      }
      clearTimeout(minuteurPseudo);
      minuteurPseudo = setTimeout(testerPseudo, 420);
    });
    $('insPseudo').addEventListener('blur', function(){
      clearTimeout(minuteurPseudo); testerPseudo();
    });

    // Entrée valide l'étape courante.
    [['insEmail','insEnvoyer'], ['insCode','insVerifier'],
     ['insMdp1','insMdpOk'], ['insMdp2','insMdpOk'],
     ['insPseudo','insTerminer'], ['insPrenom','insTerminer'],
     ['insNom','insTerminer'], ['insAero','insTerminer']].forEach(function(paire){
      var e = $(paire[0]); if (!e) return;
      e.addEventListener('keydown', function(ev){
        if (ev.key === 'Enter'){ ev.preventDefault(); $(paire[1]).click(); }
      });
    });

    if (window.RTAuth && !RTAuth.disponible()) msg(1, RTAuth.raisonIndisponible());
    aller(1);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancher);
  else brancher();
})();
