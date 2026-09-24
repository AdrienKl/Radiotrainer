/* =============================================================================
   Albatros VFR — AUTHENTIFICATION (Supabase Auth)
   -----------------------------------------------------------------------------
   Remplace la fausse connexion d'origine, qui posait simplement `authed = true`
   dans une variable en mémoire. Ici, c'est Supabase qui délivre la session et la
   base qui décide de ce que cette session peut lire.

   ┌─ CE QUI N'EST PAS FAIT ICI, ET NE DOIT JAMAIS L'ÊTRE ────────────────────┐
   │ · Aucun mot de passe n'est lu, comparé, stocké ni journalisé. Il part    │
   │   directement à Supabase et n'existe nulle part ailleurs.                │
   │ · Aucune décision d'autorisation. Ce fichier sait qui vous êtes ; ce que │
   │   vous avez le droit de voir est tranché par les politiques RLS, côté    │
   │   base. Un `if` ici ne protégerait rien : le navigateur est à l'utilisa- │
   │   teur, pas à nous.                                                      │
   │ · Aucun secret. La clé publiable est publique par conception.            │
   └─────────────────────────────────────────────────────────────────────────┘

   Le routeur (index.html) ne décide plus qui entre : il expose rtEntrer(),
   rtSortir() et rtSessionOuverte(), et c'est ce fichier qui les appelle.
   ========================================================================== */
(function(){
  'use strict';

  /* ---------- Le client ---------------------------------------------------
     Créé une seule fois, à la demande. `persistSession` garde la session dans
     le stockage local : recharger la page ne déconnecte pas. `autoRefreshToken`
     renouvelle le jeton avant expiration — sans lui, une séance d'une heure se
     terminerait par des écritures refusées. */
  var client = null, erreurClient = null;
  /* ---------- ARRIVE-T-ON PAR UN LIEN D'E-MAIL ? --------------------------
     À relever MAINTENANT, au chargement du script, et pas plus tard : dès que
     supabase-js a lu les jetons du fragment il l'efface — c'est ce qu'il doit
     faire, un jeton n'a rien à faire dans une barre d'adresse, dans l'historique
     ou dans une capture d'écran. Mais après ce nettoyage, plus rien ne dit d'où
     l'on vient.

     Or la différence compte. Une session retrouvée en stockage local, c'est un
     rechargement : on remet la personne sur la page qu'elle regardait. Une
     session qui arrive par le FRAGMENT, c'est quelqu'un qui vient de cliquer le
     lien de son e-mail : l'adresse ne désigne aucune page, et la déposer sur la
     vitrine revient à ne rien faire de son geste. Il faut l'emmener quelque part.

     On regarde aussi la chaîne de requête : le flux PKCE met son `code` là. */
  var PAR_LIEN = /[#?&](access_token|token_hash|code|error_description|error_code)=/
                   .test(String(location.hash || '') + String(location.search || ''));

  function C(){
    if (client || erreurClient) return client;
    try{
      var cfg = window.RT_SUPABASE || null;
      if (!cfg || !cfg.url || !cfg.anonKey) throw new Error('configuration absente');
      if (!window.supabase || !window.supabase.createClient) throw new Error('bibliothèque absente');
      client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true,
               storageKey:'rt-auth' }
      });
    }catch(e){ erreurClient = e; client = null; }
    return client;
  }

  /* ---------- Messages -----------------------------------------------------
     Supabase répond en anglais, et parfois de façon technique. On traduit, sans
     jamais en dire plus que l'original : « identifiants incorrects » ne précise
     pas si c'est l'adresse ou le mot de passe qui est faux, et c'est voulu —
     l'inverse permettrait de découvrir quelles adresses ont un compte. */
  var TRAD = [
    [/invalid login credentials/i,        "Adresse ou mot de passe incorrect."],
    [/email not confirmed/i,              "Adresse pas encore confirmée. Ouvrez le message que nous vous avons envoyé."],
    [/user already registered|already been registered/i,
                                          "Un compte existe déjà avec cette adresse. Connectez-vous."],
    [/password should be at least (\d+)/i,"Mot de passe trop court : $1 caractères au minimum."],
    /* Supabase refuse aussi certains domaines d'exemple (example.com, test.com…)
       avec ce même message : « ... is invalid ». Pour l'utilisateur, la cause
       exacte n'a pas d'intérêt — son adresse n'est pas acceptée, point. */
    [/unable to validate email|invalid format|address .* is invalid|email address.*invalid/i,
                                          "Cette adresse e-mail n'est pas acceptée. Vérifiez-la."],
    /* AVANT l'entrée générique ci-dessous, et ce n'est pas un détail d'ordre :
       Supabase répond « Signups not allowed for otp » quand on demande un code
       pour une adresse SANS compte (shouldCreateUser:false). Le motif générique
       l'attrapait et affichait « Les inscriptions sont fermées », ce qui est
       faux — et surtout différent du message affiché quand le code part
       vraiment, donc de quoi savoir quelles adresses ont un compte.
       Le seul appelant (le secours de l'écran de connexion) ne montre de toute
       façon jamais ce message : il affiche la même phrase neutre dans les deux
       cas. Cette entrée est le filet, pour qu'un futur appelant ne retombe pas
       dans le piège. */
    [/signups? not allowed for otp|user not found|otp_disabled/i,
                                          "Impossible d'envoyer un code à cette adresse."],
    /* Supabase formule ce refus d'au moins trois façons selon la version et le
       réglage exact : « Signups not allowed », « signup is disabled »,
       « Email signups are disabled ». Le motif couvre les trois. */
    [/signups?\s+(?:not allowed|are disabled|is disabled)|signup is disabled/i,
                                          "Les inscriptions sont fermées pour le moment."],
    [/for security purposes.*(\d+) seconds/i,
                                          "Trop d'essais. Patientez $1 secondes avant de réessayer."],
    /* Distinct du précédent : ce n'est pas l'utilisateur qui insiste, c'est le
       serveur d'envoi de Supabase qui est saturé (2 messages par heure sur le
       service intégré). Lui dire « trop d'essais » l'enverrait chercher une
       faute de son côté. */
    [/email rate limit exceeded/i,        "Le service d'envoi d'e-mails est momentanément saturé. Réessayez dans une heure, ou contactez-nous."],
    /* Parcours par code à 8 chiffres (longueur réglée côté Supabase, « Email OTP Length »). Supabase emploie « token » pour désigner
       le code ; l'utilisateur, lui, n'a jamais vu ce mot. On ne distingue pas
       « expiré » de « faux » : le message de Supabase ne le fait pas non plus,
       et deviner serait mentir. */
    [/token has expired or is invalid|invalid.*(otp|token)|otp.*expired/i,
                                          "Code incorrect ou expiré. Demandez-en un nouveau."],
    [/new password should be different/i, "Le nouveau mot de passe doit être différent de l'ancien."],
    /* La contrainte d'unicité sur lower(pseudo). Deux personnes peuvent viser le
       même pseudo dans le même quart de seconde : la base tranche, pas nous. */
    [/profils_pseudo_unique|duplicate key.*pseudo/i,
                                          "Ce nom d'utilisateur vient d'être pris. Choisissez-en un autre."],
    [/profils_pseudo_forme/i,             "Nom d'utilisateur invalide : 3 à 20 caractères, minuscules, chiffres, tiret ou souligné."],
    [/inscription incomplete/i,           "Il manque une réponse. Revenez en arrière pour compléter."],
    /* PostgREST répond ceci quand la fonction ou la colonne n'existe pas —
       autrement dit quand la migration n'a pas été exécutée. Le message brut
       (« Could not find the function public.inscription_jalon in the schema
       cache ») n'aide personne ; celui-ci dit quoi faire. */
    [/could not find the (function|column|table)|schema cache|does not exist/i,
                                          "La base de données n'est pas à jour : la migration sql/001-inscription.sql n'a pas encore été exécutée."],
    [/aucune session/i,                   "Votre session a expiré. Reprenez depuis le début."],
    [/rate limit|too many requests/i,     "Trop d'essais. Réessayez dans quelques minutes."],
    [/failed to fetch|network|load failed/i,
                                          "Serveur injoignable. Vérifiez votre connexion Internet."]
  ];
  function messageFr(e){
    var m = (e && (e.message || e.error_description)) || String(e || '');
    for (var i=0;i<TRAD.length;i++){
      var r = TRAD[i][0].exec(m);
      if (r) return TRAD[i][1].replace('$1', r[1]||'');
    }
    return "Échec de l'opération : " + m;
  }

  /* ---------- Le profil ----------------------------------------------------
     Créé en base par le déclencheur on_auth_user_created. On le lit pour
     connaître le nom affiché, l'indicatif et le rôle. Le rôle sert UNIQUEMENT à
     décider ce qu'on affiche ; il ne donne aucun droit par lui-même.

     LA LIGNE EST DÉSIGNÉE PAR SON IDENTIFIANT, jamais par `limit(1)`.
     Ce n'en est pas un détail de style : la politique RLS « admin read all »
     ouvre `profiles` en entier aux comptes qui portent le rôle. Pour un élève,
     la base ne renvoie qu'une ligne — la sienne — et `limit(1)` tombait juste
     par accident. Pour un administrateur, elle en renvoie des centaines, sans
     ordre garanti : `limit(1)` rendait la ligne de quelqu'un d'autre, presque
     toujours un élève. Le rôle lu valait alors 'user', l'entrée du menu
     disparaissait et la garde du routeur refusait #admin — l'administrateur
     était le SEUL compte à perdre la console, et la page Compte affichait par
     surcroît le pseudo d'un inconnu. Plus le compte a de droits, plus il en
     avait l'air démuni.

     L'identifiant vient de la session, pas d'une supposition : au retour de
     signInWithPassword, `RTAuth._u` n'est pas encore posé (c'est
     onAuthStateChange qui le fait, un instant plus tard), et chargerProfil()
     est appelé dans l'intervalle. On redemande donc la session quand elle
     manque, plutôt que d'interroger `profiles` avec un id nul. */
  var profil = null;
  function idSession(){
    var c = C(); if (!c) return Promise.resolve(null);
    var u = RTAuth._u;
    if (u && u.id) return Promise.resolve(u.id);
    return c.auth.getSession().then(function(r){
      var s = r && r.data && r.data.session;
      if (s && s.user){ RTAuth._u = s.user; return s.user.id; }
      return null;
    }).catch(function(){ return null; });
  }
  function chargerProfil(){
    var c = C(); if (!c) return Promise.resolve(null);
    return idSession().then(function(id){
      if (!id){ profil = null; return null; }
      return c.from('profiles').select('*').eq('id', id).maybeSingle()
        .then(function(r){ profil = r.error ? null : (r.data||null); return profil; });
    }).catch(function(){ profil = null; return null; });
  }

  function annoncer(){
    try{ window.dispatchEvent(new CustomEvent('rt:auth',
      {detail:{ connecte: !!RTAuth.utilisateur(), profil: profil }})); }catch(e){}
  }

  var RTAuth = {
    disponible: function(){ return !!C(); },
    raisonIndisponible: function(){
      if (C()) return '';
      return erreurClient ? ('Connexion au serveur impossible (' + erreurClient.message + ').')
                          : 'Connexion au serveur impossible.';
    },
    utilisateur: function(){ return RTAuth._u || null; },
    profil:      function(){ return profil; },
    estAdmin:    function(){ return !!profil && (profil.role==='admin' || profil.role==='moderator'); },

    /* Le client, pour les modules qui doivent lire ou écrire en base sous LA
       session en cours (la page Compte, la console d'administration). En créer
       un second ailleurs marcherait — même storageKey, même session — mais
       multiplierait les connexions temps réel et les jetons rafraîchis en
       parallèle pour rien. */
    client: function(){ return C(); },
    /* Le message d'erreur traduit en français, pour que tous les modules disent
       la même chose de la même panne. */
    message: messageFr,
    /* Après une écriture sur `profiles`, la copie en mémoire est périmée. */
    rechargerProfil: function(){ return chargerProfil().then(function(p){ annoncer(); return p; }); },

    /* Vrai quand la page a été ouverte par le lien d'un e-mail. Le routeur s'en
       sert pour ne pas déposer sur la vitrine quelqu'un qui vient de prouver
       son identité. Relevé au chargement : voir PAR_LIEN plus haut. */
    arriveParLien: function(){ return PAR_LIEN; },

    /* ---------- Inscription par code à 8 chiffres --------------------------
       Le parcours en plusieurs étapes demande l'adresse AVANT le mot de passe,
       ce que signUp(email, password) ne sait pas faire : il exige les deux
       d'un coup. On passe donc par signInWithOtp, primitive prévue pour ça —
       elle crée le compte non confirmé et envoie un code.

       Le code plutôt que le lien magique : un lien s'ouvre dans un nouvel
       onglet, et le parcours reprendrait à zéro dans l'ancien. Le code se
       saisit sur place. Les deux restent possibles cependant (detectSessionInUrl
       est actif), et le formulaire avance aussi quand la session arrive par le
       lien — quelqu'un qui clique n'est pas puni.

       À SAVOIR, réglage Supabase : le gabarit « Magic Link » ne contient par
       défaut que {{ .ConfirmationURL }}. Sans {{ .Token }} dedans, le message
       arrive SANS code et cette étape est infranchissable autrement qu'en
       cliquant le lien. Voir sql/001-inscription.sql et le README. */
    /* L'adresse de retour n'est envoyée QUE depuis http(s).

       Ouvert par double-clic, le site tourne en file:// et location.origin vaut
       « file:// » : on demandait alors à Supabase de renvoyer le navigateur vers
       file:///Users/…/index.html. Aucun service ne peut faire ça, et GoTrue ne
       le tente même pas — il retombe silencieusement sur le « Site URL » du
       projet. Si celui-ci est resté sur sa valeur d'usine, le lien du message
       pointe vers http://localhost:3000 et ne mène nulle part. Mieux vaut ne
       rien demander et laisser le projet décider. */
    lienRetour: function(){
      return (location.protocol === 'http:' || location.protocol === 'https:')
             ? location.origin + location.pathname : null;
    },

    otpEnvoyer: function(email, creer){
      var c = C();
      if (!c) return Promise.reject(new Error(RTAuth.raisonIndisponible()));
      var opts = { shouldCreateUser: creer !== false };
      var retour = RTAuth.lienRetour();
      if (retour) opts.emailRedirectTo = retour;
      return c.auth.signInWithOtp({
        email: String(email||'').trim(),
        options: opts
      }).then(function(r){ if (r.error) throw r.error; return true; });
    },

    /* SECOURS : ouvrir la session à partir du LIEN du message, pas du code.

       Deux situations le rendent nécessaire, et elles se produisent ensemble
       chez un projet neuf. D'une part le gabarit « Magic Link » de Supabase ne
       contient d'origine que {{ .ConfirmationURL }} : tant qu'on n'y a pas
       ajouté {{ .Token }}, le message part SANS code et l'étape est
       infranchissable. D'autre part le lien, lui, ne ramène au site que si son
       adresse figure dans la liste blanche du projet — sinon il retombe sur le
       « Site URL », qui vaut http://localhost:3000 à la sortie d'usine.
       Résultat : ni code utilisable, ni lien qui aboutisse.

       Le lien contient pourtant tout ce qu'il faut. Son paramètre `token` est
       le jeton de vérification, et GoTrue l'accepte sous le nom `token_hash`
       sans qu'on ait à SUIVRE le lien. Coller l'adresse suffit donc, et le
       parcours se termine sans toucher au tableau de bord.

       Un lien DÉJÀ CLIQUÉ ne marchera pas : le suivre consomme le jeton, même
       si la page d'arrivée était morte. Il faut alors en redemander un. */
    otpVerifierLien: function(lien){
      var c = C();
      if (!c) return Promise.reject(new Error(RTAuth.raisonIndisponible()));
      var j = RTAuth.jetonDuLien(lien);
      if (!j) return Promise.reject(new Error("Ce lien ne contient pas de jeton de vérification."));
      return c.auth.verifyOtp({ token_hash: j.jeton, type: j.type })
              .then(function(r){ if (r.error) throw r.error; return r.data; });
    },

    /* Reconnaît le lien de Supabase et en extrait le jeton. Rend null pour tout
       le reste — c'est ce qui permet à l'appelant de distinguer « il a collé un
       lien » de « il a tapé huit chiffres ». */
    jetonDuLien: function(lien){
      var t = String(lien||'').trim();
      if (t.indexOf('token') < 0) return null;
      var m = /[?&#]token(?:_hash)?=([^&\s#]+)/.exec(t);
      if (!m) return null;
      var ty = /[?&#]type=([^&\s#]+)/.exec(t);
      return { jeton: decodeURIComponent(m[1]),
               type: ty ? decodeURIComponent(ty[1]) : 'magiclink' };
    },

    /* ---------- Vérifier le code à huit chiffres -----------------------------
       Le même code à l'écran, mais PAS le même type côté serveur, et c'est ce
       qui piégeait le compte neuf.

       Une adresse qui n'a jamais servi déclenche une inscription : Supabase
       range le code dans `confirmation_token` et l'attend sous le type
       'signup'. Une adresse déjà connue reçoit un lien magique : le code va
       dans `recovery_token`, attendu sous 'magiclink'. Le type 'email' est le
       générique qui couvre normalement les deux — « normalement » : il dépend
       de la version de GoTrue et de l'état confirmé ou non du compte, et quand
       il ne couvre pas, le refus est indiscernable d'un code faux.

       On essaie donc les trois, dans l'ordre du plus général au plus précis.
       Aucun risque à insister : un code erroné le reste sous tous les types, et
       GoTrue ne décompte pas les tentatives d'un code e-mail — seule une
       limite par adresse IP existe, très au-dessus de trois appels.

       L'erreur rendue en cas d'échec total est CELLE DU PREMIER essai : les
       suivantes diraient la même chose, et la première est celle du type le
       plus probable. */
    otpVerifier: function(email, code){
      var c = C();
      if (!c) return Promise.reject(new Error(RTAuth.raisonIndisponible()));
      var mail  = String(email||'').trim();
      var jeton = String(code||'').replace(/\s+/g, '');   // « 123 456 » recopié depuis l'e-mail
      var TYPES = ['email', 'signup', 'magiclink'];
      var premiere = null;
      function essayer(i){
        if (i >= TYPES.length) return Promise.reject(premiere || new Error('token has expired or is invalid'));
        return c.auth.verifyOtp({ email: mail, token: jeton, type: TYPES[i] })
          .then(function(r){
            if (!r.error) return r.data;
            if (!premiere) premiere = r.error;
            return essayer(i + 1);
          }, function(e){
            if (!premiere) premiere = e;
            return essayer(i + 1);
          });
      }
      return essayer(0);
    },

    /* ---------- MOT DE PASSE OUBLIÉ : le parcours de récupération ----------
       ┌─ POURQUOI UNE PORTE À PART, ET PAS L'OTP DE CONNEXION ──────────────┐
       │ Le bouton « recevoir un code » ci-dessous existait déjà et servait à │
       │ DEUX choses : l'inscription interrompue (un compte SANS mot de       │
       │ passe) et le mot de passe oublié. Il ouvrait une session, puis       │
       │ laissait l'utilisateur trouver tout seul le chemin des Paramètres    │
       │ pour changer son mot de passe. Ce n'était pas un parcours de         │
       │ récupération, c'était un contournement.                              │
       │                                                                       │
       │ Les deux cas sont désormais distincts, parce qu'ils NE SONT PAS la   │
       │ même chose :                                                          │
       │   · inscription interrompue → otpEnvoyer / otpVerifier, type de      │
       │     connexion, et le parcours d'inscription reprend où il s'est      │
       │     arrêté ;                                                          │
       │   · mot de passe oublié → resetPasswordForEmail / verifyOtp type     │
       │     'recovery', puis updateUser. C'est le mécanisme que Supabase a   │
       │     prévu pour ça, et il emploie un AUTRE gabarit d'e-mail — celui   │
       │     de récupération, qu'on identifie comme tel.                      │
       └───────────────────────────────────────────────────────────────────────┘

       LE CODE EST UN VRAI OTP SUPABASE. resetPasswordForEmail engendre un
       `recovery_token` à usage unique, que {{ .Token }} affiche dans l'e-mail
       et que verifyOtp consomme. Rien n'est fabriqué, stocké ni comparé ici. */
    recuperationEnvoyer: function(email){
      var c = C();
      if (!c) return Promise.reject(new Error(RTAuth.raisonIndisponible()));
      var opts = {};
      var retour = RTAuth.lienRetour();
      if (retour) opts.redirectTo = retour;
      return c.auth.resetPasswordForEmail(String(email||'').trim(), opts)
        .then(function(r){ if (r && r.error) throw r.error; return true; });
    },

    /* Le type est 'recovery', et UNIQUEMENT lui.
       otpVerifier() essaie trois types parce que le code de connexion peut
       arriver sous 'signup' ou 'magiclink' selon que l'adresse est neuve ou
       connue. Ici il n'y a aucune ambiguïté : resetPasswordForEmail range
       toujours le code dans `recovery_token`. Essayer les autres types
       ouvrirait une session de CONNEXION là où on attend une session de
       RÉCUPÉRATION — et laisserait entrer quelqu'un qui a un code de
       connexion en cours dans un parcours qui va changer le mot de passe. */
    recuperationVerifier: function(email, code){
      var c = C();
      if (!c) return Promise.reject(new Error(RTAuth.raisonIndisponible()));
      return c.auth.verifyOtp({
        email: String(email||'').trim(),
        token: String(code||'').replace(/\s+/g, ''),
        type: 'recovery'
      }).then(function(r){ if (r.error) throw r.error; return r.data; });
    },

    /* ---------- Le délai entre deux envois ---------------------------------
       ┌─ CE N'EST PAS UNE PROTECTION, ET IL FAUT LE DIRE ───────────────────┐
       │ Un compteur dans le navigateur ne protège de rien : la page          │
       │ appartient à l'utilisateur, et la console la contourne en une ligne. │
       │ CLAUDE.md § 8 le répète — toute règle qui compte se prend en base.   │
       │                                                                       │
       │ CE QUI PROTÈGE VRAIMENT est chez Supabase, et existe déjà :          │
       │   · une limite par adresse IP sur les envois d'e-mail ;              │
       │   · le plafond du service d'envoi (2 messages/heure sur l'intégré) ; │
       │   · « For security purposes, you can only request this after N       │
       │     seconds », que GoTrue renvoie de lui-même.                       │
       │                                                                       │
       │ CE COMPTEUR-CI sert à autre chose : éviter que quelqu'un qui n'a pas │
       │ encore reçu son message clique cinq fois et consomme le plafond de   │
       │ son propre projet — puis attende une heure. C'est de l'ergonomie qui │
       │ évite un dégât réel, pas un rempart.                                 │
       └───────────────────────────────────────────────────────────────────────┘ */
    DELAI_RENVOI: 120,
    _dernierEnvoi: {},
    attenteRestante: function(quoi){
      var t = RTAuth._dernierEnvoi[quoi || 'otp'] || 0;
      var reste = Math.ceil((t + RTAuth.DELAI_RENVOI * 1000 - Date.now()) / 1000);
      return reste > 0 ? reste : 0;
    },
    marquerEnvoi: function(quoi){
      RTAuth._dernierEnvoi[quoi || 'otp'] = Date.now();
    },

    /* Pose le mot de passe d'un compte qui vient d'être vérifié par code. Le
       mot de passe part directement à Supabase : il n'est ni lu, ni comparé, ni
       conservé ici — exactement comme dans connexion(). */
    definirMotDePasse: function(mdp){
      var c = C();
      if (!c) return Promise.reject(new Error(RTAuth.raisonIndisponible()));
      return c.auth.updateUser({ password: String(mdp||'') })
        .then(function(r){ if (r.error) throw r.error; return r.data; });
    },

    /* ---------- Les deux fonctions de la base -----------------------------
       pseudo_libre : le navigateur ne peut pas interroger `profiles` pour
       savoir si un pseudo est pris — RLS ne lui montre que sa propre ligne, et
       l'ouvrir livrerait la liste des utilisateurs. La base répond oui ou non.

       inscription_jalon : consentement, mot de passe posé, parcours terminé.
       Ces horodatages sont des preuves, donc datés par l'horloge du serveur ;
       le déclencheur profiles_garde() interdit au client de les écrire
       autrement. Voir sql/001-inscription.sql § 4 et § 5. */
    pseudoLibre: function(p){
      var c = C();
      if (!c) return Promise.reject(new Error(RTAuth.raisonIndisponible()));
      return c.rpc('pseudo_libre', { p: String(p||'') })
        .then(function(r){ if (r.error) throw r.error; return r.data === true; });
    },

    jalon: function(nom, cguVersion){
      var c = C();
      if (!c) return Promise.reject(new Error(RTAuth.raisonIndisponible()));
      return c.rpc('inscription_jalon',
                   { p_jalon: String(nom||''), p_cgu_version: cguVersion || null })
        .then(function(r){ if (r.error) throw r.error; return true; });
    },

    /* Écriture des réponses du questionnaire. Aucun contrôle d'autorisation
       ici : la politique « profil : mise à jour de soi » borne la requête à sa
       propre ligne, et le eq('id') ne fait que l'expliciter. */
    majProfil: function(champs){
      var c = C(), u = RTAuth.utilisateur();
      if (!c) return Promise.reject(new Error(RTAuth.raisonIndisponible()));
      if (!u)  return Promise.reject(new Error('aucune session'));
      return c.from('profiles').update(champs).eq('id', u.id)
        .then(function(r){ if (r.error) throw r.error; return true; });
    },

    connexion: function(email, mdp){
      var c = C();
      if (!c) return Promise.reject(new Error(RTAuth.raisonIndisponible()));
      return c.auth.signInWithPassword({ email:String(email||'').trim(), password:String(mdp||'') })
        .then(function(r){ if (r.error) throw r.error; return r.data; });
    },

    deconnexion: function(){
      var c = C();
      var fin = function(){
        RTAuth._u = null; profil = null; annoncer();
        if (window.rtSortir) window.rtSortir();
      };
      if (!c) { fin(); return Promise.resolve(); }
      return c.auth.signOut().then(fin, fin);
    }
  };
  RTAuth._u = null;
  window.RTAuth = RTAuth;

  /* ---------- Formulaires --------------------------------------------------- */
  function $(id){ return document.getElementById(id); }
  function msg(id, texte, type){
    var e = $(id); if (!e) return;
    e.textContent = texte || '';
    e.className = 'auth-msg' + (texte ? (' auth-msg--'+(type||'err')) : ' hidden');
  }
  /* Le bouton se verrouille pendant l'appel : sans cela un double-clic envoie
     deux inscriptions, et la seconde échoue sur « compte déjà existant ». */
  function occuper(btn, texte){
    if (!btn) return function(){};
    var avant = btn.textContent;
    btn.disabled = true; btn.textContent = texte;
    return function(){ btn.disabled = false; btn.textContent = avant; };
  }

  function brancher(){
    var bLog = $('loginSubmit');

    if (bLog) bLog.addEventListener('click', function(){
      var email = ($('loginId').value||'').trim(), mdp = $('loginPwd').value||'';
      if (!email || !mdp) return msg('loginMsg', "Renseignez votre adresse et votre mot de passe.");
      msg('loginMsg','');
      var libre = occuper(bLog, 'Connexion…');
      RTAuth.connexion(email, mdp)
        .then(function(){ return chargerProfil(); })
        .then(function(){
          libre(); $('loginPwd').value='';      // le mot de passe ne traîne pas dans le DOM
          annoncer(); if (window.rtEntrer) window.rtEntrer();
        })
        .catch(function(e){ libre(); msg('loginMsg', messageFr(e)); });
    });

    /* ---- MOT DE PASSE OUBLIÉ : les trois étapes -----------------------
       Un seul panneau à la fois. L'étape 3 n'apparaît qu'APRÈS que le code a
       été vérifié : sans session de récupération ouverte, updateUser échoue,
       et proposer le champ avant reviendrait à faire saisir un mot de passe
       pour rien. */
    var bOubli = $('mdpOublie'), mdpBloc = $('mdpBloc');
    var mdpE1 = $('mdpEtape1'), mdpE2 = $('mdpEtape2'), mdpE3 = $('mdpEtape3');
    var bMdpDem = $('mdpDemander'), bMdpVal = $('mdpValider');
    var bMdpRen = $('mdpRenvoyer'), bMdpEnr = $('mdpEnregistrer');

    function mdpEtape(n){
      if (mdpE1) mdpE1.hidden = n !== 1;
      if (mdpE2) mdpE2.hidden = n !== 2;
      if (mdpE3) mdpE3.hidden = n !== 3;
    }

    if (bOubli) bOubli.addEventListener('click', function(){
      if (!mdpBloc) return;
      mdpBloc.hidden = !mdpBloc.hidden;
      if (!mdpBloc.hidden){
        mdpEtape(1);
        /* L'autre porte se referme : deux champs « code » ouverts en même
           temps, c'est l'assurance de coller le code dans le mauvais. */
        if (bloc) bloc.hidden = true;
        msg('loginMsg','');
      }
    });

    /* L'envoi, partagé par « Envoyer » et « Renvoyer » — c'est le même appel,
       et le même garde-fou. */
    function mdpEnvoyer(bouton){
      var email = ($('loginId').value||'').trim();
      if (!email) return msg('loginMsg', "Renseignez d'abord votre adresse e-mail.");
      var reste = RTAuth.attenteRestante('recuperation');
      if (reste) return msg('loginMsg', 'Patientez ' + reste + ' seconde' + (reste > 1 ? 's' : '')
                                      + ' avant de demander un nouveau code.');
      msg('loginMsg','');
      var libre = occuper(bouton, 'Envoi…');
      /* Réponse NEUTRE, au conditionnel, et identique que le compte existe ou
         non : sinon, comparer les deux réponses suffirait à savoir quelles
         adresses ont un compte ici. Supabase applique d'ailleurs la même
         prudence — resetPasswordForEmail réussit sur une adresse inconnue. */
      var neutre = function(){
        libre();
        RTAuth.marquerEnvoi('recuperation');
        mdpEtape(2);
        var ch = $('mdpCode'); if (ch) try{ ch.focus(); }catch(e){}
        msg('loginMsg', "Si un compte existe pour cette adresse, un code de récupération vient d'y être envoyé.", 'ok');
      };
      RTAuth.recuperationEnvoyer(email).then(neutre).catch(function(e){
        var m = (e && e.message) || '';
        if (/user not found|not found/i.test(m)) return neutre();
        libre(); msg('loginMsg', messageFr(e));
      });
    }

    if (bMdpDem) bMdpDem.addEventListener('click', function(){ mdpEnvoyer(bMdpDem); });
    if (bMdpRen) bMdpRen.addEventListener('click', function(){ mdpEnvoyer(bMdpRen); });

    if (bMdpVal) bMdpVal.addEventListener('click', function(){
      var email = ($('loginId').value||'').trim();
      var code  = ($('mdpCode').value||'').replace(/\s+/g,'');
      if (code.length < 8) return msg('loginMsg', "Saisissez le code à huit chiffres reçu par e-mail.");
      msg('loginMsg','');
      var libre = occuper(bMdpVal, 'Vérification…');
      RTAuth.recuperationVerifier(email, code)
        .then(function(){
          libre();
          $('mdpCode').value = '';        // le code est consommé : il ne traîne pas dans le DOM
          mdpEtape(3);
          var n = $('mdpNouveau'); if (n) try{ n.focus(); }catch(e){}
          msg('loginMsg', 'Code vérifié. Choisissez votre nouveau mot de passe.', 'ok');
        })
        .catch(function(e){ libre(); msg('loginMsg', messageFr(e)); });
    });

    if (bMdpEnr) bMdpEnr.addEventListener('click', function(){
      var a = $('mdpNouveau').value || '', b = $('mdpConfirme').value || '';
      /* Les deux mêmes garde-fous que l'inscription, et pas un de plus : la
         longueur minimale est celle de Supabase, qui refuserait de toute façon.
         Vérifier ici évite un aller-retour, ça ne remplace rien. */
      if (a.length < 8) return msg('loginMsg', 'Le mot de passe doit faire au moins 8 caractères.');
      if (a !== b)      return msg('loginMsg', 'Les deux mots de passe ne correspondent pas.');
      msg('loginMsg','');
      var libre = occuper(bMdpEnr, 'Enregistrement…');
      RTAuth.definirMotDePasse(a)
        .then(function(){ return chargerProfil(); })
        .then(function(){
          libre();
          /* Le mot de passe ne traîne dans aucun des deux champs. */
          $('mdpNouveau').value = ''; $('mdpConfirme').value = '';
          if (mdpBloc) mdpBloc.hidden = true;
          annoncer();
          /* La session de récupération EST une session : l'utilisateur est
             déjà entré. rtSessionOuverte plutôt que rtEntrer, pour qu'un
             parcours d'inscription inachevé reprenne où il s'était arrêté. */
          if (window.rtSessionOuverte) window.rtSessionOuverte();
        })
        .catch(function(e){ libre(); msg('loginMsg', messageFr(e)); });
    });

    ['mdpCode'].forEach(function(id){
      var e=$(id); if(e) e.addEventListener('keydown', function(ev){ if(ev.key==='Enter' && bMdpVal) bMdpVal.click(); });
    });
    ['mdpNouveau','mdpConfirme'].forEach(function(id){
      var e=$(id); if(e) e.addEventListener('keydown', function(ev){ if(ev.key==='Enter' && bMdpEnr) bMdpEnr.click(); });
    });

    /* ---- Secours : entrer avec un code reçu par e-mail ----------------
       Deux usages pour un seul mécanisme : le mot de passe oublié, et le
       compte dont l'inscription s'est arrêtée avant l'étape du mot de passe —
       celui-là n'en a AUCUN, et le formulaire ci-dessus ne peut rien pour lui.

       creer = false : cette porte ne crée jamais de compte. Sinon une faute de
       frappe dans l'adresse fabriquerait un compte fantôme à chaque tentative.

       Une fois le code validé, le reste se fait tout seul : Supabase ouvre la
       session, auth.js appelle rtSessionOuverte(), et le routeur consulte
       RTInscription.aReprendre() pour décider entre l'application et la suite
       du parcours d'inscription. */
    var bDem = $('logCodeDemander'), bVal = $('logCodeValider'), bloc = $('logCodeBloc');

    if (bDem) bDem.addEventListener('click', function(){
      var email = ($('loginId').value||'').trim();
      if (!email) return msg('loginMsg', "Renseignez d'abord votre adresse e-mail.");
      /* Le même garde-fou que la porte 1, et pour la même raison : cinq clics
         d'affilée consomment le plafond d'envoi du projet, et c'est une heure
         d'attente pour tout le monde. Compteur distinct — les deux portes
         emploient deux gabarits différents et deux jetons différents. */
      var reste = RTAuth.attenteRestante('otp');
      if (reste) return msg('loginMsg', 'Patientez ' + reste + ' seconde' + (reste > 1 ? 's' : '')
                                      + ' avant de demander un nouveau code.');
      msg('loginMsg','');
      /* L'autre porte se referme : deux champs « code » ouverts en même temps,
         c'est l'assurance de coller le code dans le mauvais. */
      if (mdpBloc) mdpBloc.hidden = true;
      var libre = occuper(bDem, 'Envoi…');
      /* La phrase est au conditionnel, et c'est voulu : elle est affichée à
         l'identique que le compte existe ou non. Sans ça, comparer les deux
         réponses suffirait à savoir quelles adresses ont un compte ici — la
         même prudence que « adresse ou mot de passe incorrect », qui ne dit
         pas lequel des deux est faux. */
      var neutre = function(){
        libre();
        RTAuth.marquerEnvoi('otp');
        if (bloc) bloc.hidden = false;
        var c = $('logCode'); if (c) try{ c.focus(); }catch(e){}
        msg('loginMsg', "Si un compte existe pour cette adresse, un code vient d'y être envoyé.", 'ok');
      };
      RTAuth.otpEnvoyer(email, false).then(neutre).catch(function(e){
        var m = (e && e.message) || '';
        /* « Pas de compte pour cette adresse » doit rester indiscernable du
           succès. Les autres pannes, en revanche, doivent se dire : les taire
           laisserait quelqu'un attendre un code qui ne partira jamais. */
        if (/signups? not allowed for otp|user not found|otp_disabled/i.test(m)) return neutre();
        libre(); msg('loginMsg', messageFr(e));
      });
    });

    if (bVal) bVal.addEventListener('click', function(){
      var email = ($('loginId').value||'').trim();
      var code  = ($('logCode').value||'').replace(/\s+/g,'');
      if (code.length < 8) return msg('loginMsg', "Saisissez le code à huit chiffres reçu par e-mail.");
      msg('loginMsg','');
      var libre = occuper(bVal, 'Vérification…');
      RTAuth.otpVerifier(email, code)
        .then(function(){ return chargerProfil(); })
        .then(function(){
          libre(); $('logCode').value = '';
          annoncer();
          /* rtSessionOuverte plutôt que rtEntrer : c'est lui qui sait renvoyer
             vers le parcours d'inscription quand celui-ci est inachevé. */
          if (window.rtSessionOuverte) window.rtSessionOuverte();
        })
        .catch(function(e){ libre(); msg('loginMsg', messageFr(e)); });
    });

    // Entrée = valider.
    ['loginId','loginPwd'].forEach(function(id){
      var e=$(id); if(e) e.addEventListener('keydown', function(ev){ if(ev.key==='Enter' && bLog) bLog.click(); });
    });
    var cc=$('logCode');
    if(cc) cc.addEventListener('keydown', function(ev){ if(ev.key==='Enter' && bVal) bVal.click(); });

    if (!C()) msg('loginMsg', RTAuth.raisonIndisponible());
  }

  /* ---------- Reprise de session au chargement ------------------------------
     Une session valide en stockage local doit rouvrir l'application sans
     repasser par le formulaire. onAuthStateChange couvre aussi le retour du
     lien de confirmation reçu par e-mail, qui arrive après coup. */
  function demarrer(){
    brancher();
    var c = C(); if (!c) return;
    c.auth.getSession().then(function(r){
      var s = r && r.data && r.data.session;
      if (!s) return;
      RTAuth._u = s.user;
      return chargerProfil().then(function(){
        annoncer();
        if (window.rtSessionOuverte) window.rtSessionOuverte();
      });
    }).catch(function(){});
    c.auth.onAuthStateChange(function(ev, s){
      RTAuth._u = s ? s.user : null;
      if (ev === 'SIGNED_IN' && s){
        chargerProfil().then(function(){
          annoncer();
          if (window.rtSessionOuverte) window.rtSessionOuverte();
        });
      } else if (ev === 'SIGNED_OUT'){
        profil = null; annoncer();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
