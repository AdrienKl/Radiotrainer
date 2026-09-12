/* =============================================================================
   RadioTrainer — AUTHENTIFICATION (Supabase Auth)
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
     décider ce qu'on affiche ; il ne donne aucun droit par lui-même. */
  var profil = null;
  function chargerProfil(){
    var c = C(); if (!c) return Promise.resolve(null);
    return c.from('profiles').select('*').limit(1).maybeSingle()
      .then(function(r){ profil = r.error ? null : (r.data||null); return profil; })
      .catch(function(){ profil = null; return null; });
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

    connexion: function(email, mdp){
      var c = C();
      if (!c) return Promise.reject(new Error(RTAuth.raisonIndisponible()));
      return c.auth.signInWithPassword({ email:String(email||'').trim(), password:String(mdp||'') })
        .then(function(r){ if (r.error) throw r.error; return r.data; });
    },

    /* Renvoie {session:…} si le compte est utilisable tout de suite, ou
       {confirmation:true} si Supabase attend un clic dans un e-mail. Les deux
       cas sont normaux : c'est un réglage du projet, pas une erreur. */
    inscription: function(o){
      var c = C();
      if (!c) return Promise.reject(new Error(RTAuth.raisonIndisponible()));
      o = o || {};
      var nomAffiche = [o.prenom, o.nom].filter(Boolean).join(' ').trim() || o.pseudo || '';
      return c.auth.signUp({
        email: String(o.email||'').trim(), password: String(o.mdp||''),
        options:{ data:{ display_name:nomAffiche, pseudo:o.pseudo||'', nom:o.nom||'', prenom:o.prenom||'' },
                  emailRedirectTo: location.origin + location.pathname }
      }).then(function(r){
        if (r.error) throw r.error;
        return r.data && r.data.session ? { session:r.data.session } : { confirmation:true };
      });
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
    var bLog = $('loginSubmit'), bIns = $('signupSubmit');

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

    if (bIns) bIns.addEventListener('click', function(){
      var o = { email:($('suEmail').value||'').trim(), mdp:$('suPwd').value||'',
                pseudo:($('suUser').value||'').trim(),
                nom:($('suNom').value||'').trim(), prenom:($('suPrenom').value||'').trim() };
      if (!o.email || !o.mdp) return msg('signupMsg', "Une adresse e-mail et un mot de passe sont nécessaires.");
      if (o.mdp.length < 8)   return msg('signupMsg', "Choisissez un mot de passe d'au moins 8 caractères.");
      msg('signupMsg','');
      var libre = occuper(bIns, 'Création…');
      RTAuth.inscription(o).then(function(r){
        libre(); $('suPwd').value='';
        if (r.confirmation){
          msg('signupMsg', "Compte créé. Ouvrez le message envoyé à " + o.email +
                           " et cliquez sur le lien pour l'activer.", 'ok');
          return;
        }
        return chargerProfil().then(function(){
          annoncer(); if (window.rtEntrer) window.rtEntrer();
        });
      }).catch(function(e){ libre(); msg('signupMsg', messageFr(e)); });
    });

    // Entrée = valider, sur les deux formulaires.
    ['loginId','loginPwd'].forEach(function(id){
      var e=$(id); if(e) e.addEventListener('keydown', function(ev){ if(ev.key==='Enter' && bLog) bLog.click(); });
    });
    ['suEmail','suUser','suPwd','suNom','suPrenom'].forEach(function(id){
      var e=$(id); if(e) e.addEventListener('keydown', function(ev){ if(ev.key==='Enter' && bIns) bIns.click(); });
    });

    if (!C()){
      msg('loginMsg',  RTAuth.raisonIndisponible());
      msg('signupMsg', RTAuth.raisonIndisponible());
    }
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
