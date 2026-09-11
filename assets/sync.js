/* =============================================================================
   RadioTrainer — ENREGISTREMENT DES SÉANCES EN BASE
   -----------------------------------------------------------------------------
   L'application continue d'écrire dans le stockage local exactement comme avant.
   Ce module AJOUTE une copie en base ; il ne remplace rien. Trois raisons :
     · le site doit continuer de fonctionner hors-ligne ;
     · une panne Supabase ne doit rien faire perdre à l'élève ;
     · les données déjà présentes sur les appareils ne disparaissent pas.

   ┌─ L'IDENTIFIANT EST TIRÉ ICI, PAS EN BASE ───────────────────────────────┐
   │ Chaque séance reçoit son UUID côté client, avant le premier envoi. C'est │
   │ ce qui rend le rejeu inoffensif : réémettre une séance perdue écrase la  │
   │ même ligne au lieu d'en créer une seconde. Sans cela, une file d'attente │
   │ rejouée après une coupure dupliquerait tout.                            │
   └─────────────────────────────────────────────────────────────────────────┘

   CE QUE CE MODULE MESURE, ET QUE L'APPLICATION NE MESURAIT PAS
     · la DURÉE : l'heure de début est prise au lancement, pas déduite après ;
     · les ABANDONS : la séance est écrite DÈS SON DÉBUT avec le statut
       « in_progress ». Si elle ne se termine jamais, la ligne reste — et c'est
       précisément ce qui manquait pour savoir où les gens décrochent. Au
       lancement suivant, tout ce qui traîne est requalifié « abandoned ».
   ========================================================================== */
(function(){
  'use strict';

  var FILE = 'rt-sync-file';      // séances en attente d'envoi
  var MAX_FILE = 50;              // au-delà, on abandonne les plus vieilles

  function uuid(){
    try{ if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); }catch(e){}
    // Repli pour les navigateurs sans randomUUID : suffisant ici, l'unicité
    // n'a pas besoin d'être cryptographique — elle doit juste ne pas collisionner.
    var h='0123456789abcdef', s='';
    for (var i=0;i<36;i++) s += (i===8||i===13||i===18||i===23) ? '-'
      : (i===14 ? '4' : h[Math.floor(Math.random()*16)]);
    return s;
  }

  function client(){
    try{
      if (!window.RT_SUPABASE || !window.supabase) return null;
      if (!window.__rtSync_c) window.__rtSync_c = window.supabase.createClient(
        RT_SUPABASE.url, RT_SUPABASE.anonKey,
        { auth:{ persistSession:true, autoRefreshToken:true, storageKey:'rt-auth' } });
      return window.__rtSync_c;
    }catch(e){ return null; }
  }
  function moi(){
    return (window.RTAuth && RTAuth.utilisateur()) ? RTAuth.utilisateur().id : null;
  }

  /* ---------- La file d'attente ------------------------------------------
     Une séance qui n'a pas pu partir n'est pas perdue : elle attend ici, dans
     le stockage local, et repart au prochain démarrage. */
  function lireFile(){
    try{ return JSON.parse(localStorage.getItem(FILE) || '[]') || []; }catch(e){ return []; }
  }
  function ecrireFile(f){
    try{ localStorage.setItem(FILE, JSON.stringify(f.slice(-MAX_FILE))); }catch(e){}
  }
  function enfiler(paquet){
    var f = lireFile();
    // Même séance déjà en attente : on remplace, on n'empile pas.
    f = f.filter(function(x){ return x.session && x.session.id !== paquet.session.id; });
    f.push(paquet); ecrireFile(f);
  }
  function defiler(id){
    ecrireFile(lireFile().filter(function(x){ return !x.session || x.session.id !== id; }));
  }

  /* ---------- L'envoi ------------------------------------------------------
     upsert, jamais insert : c'est l'identifiant tiré côté client qui garantit
     qu'un rejeu écrase au lieu de dupliquer. */
  function pousser(paquet){
    var c = client(), u = moi();
    if (!c || !u) return Promise.reject(new Error('hors session'));
    var s = paquet.session;
    s.user_id = u;
    return c.from('sessions').upsert(s, {onConflict:'id'}).then(function(r){
      if (r.error) throw r.error;
      var et = paquet.steps || [];
      if (!et.length) return null;
      return c.from('session_steps').upsert(et, {onConflict:'session_id,idx'}).then(function(r2){
        if (r2.error) throw r2.error;
        return null;
      });
    });
  }

  /* Un envoi qui échoue ne doit jamais échouer EN SILENCE. La séance est mise
     de côté pour être rejouée, mais la cause est conservée et journalisée :
     sans cela, un champ refusé par la base se traduirait par une file qui
     grossit sans que personne ne sache pourquoi. */
  var dernierEchec = null;
  function tenter(paquet){
    return pousser(paquet).then(
      function(){ defiler(paquet.session.id); return true; },
      function(e){
        dernierEchec = { quand:new Date().toISOString(), id:paquet.session.id,
                         message:(e && e.message) || String(e),
                         details:(e && (e.details || e.hint)) || null };
        enfiler(paquet);
        try{ console.warn('[RadioTrainer] séance mise en attente :', dernierEchec.message,
                          dernierEchec.details || ''); }catch(x){}
        try{ if (window.RTAdmin && RTAdmin.logError)
               RTAdmin.logError({ level:'warn', kind:'network',
                 message:'Séance non enregistrée : ' + dernierEchec.message,
                 key:'sync-seance' }); }catch(x){}
        return false;
      }
    );
  }

  /* ---------- API ---------------------------------------------------------- */
  var RTSync = {
    /* Séance lancée. Renvoie un jeton à rendre plus tard à terminer().
       L'écriture part en arrière-plan : rien ici ne doit faire attendre
       l'élève, et un échec ne doit rien interrompre. */
    demarrer: function(infos){
      var jeton = { id: uuid(), debut: Date.now(), infos: infos || {} };
      var s = Object.assign({}, infos || {});
      delete s.steps;
      s.id = jeton.id;
      s.status = 'in_progress';
      s.started_at = new Date(jeton.debut).toISOString();
      s.app_version = (window.RT_VERSION || null);
      s.user_agent  = navigator.userAgent.slice(0,300);
      jeton.base = s;
      if (moi()) tenter({session:s, steps:[]});
      return jeton;
    },

    /* Séance terminée. `bilan` complète la ligne, `etapes` est la trace fine.
       On renvoie la MÊME ligne, avec le même identifiant : la séance
       « en cours » devient la séance terminée, elle ne se dédouble pas. */
    terminer: function(jeton, bilan, etapes){
      if (!jeton || !jeton.id) return Promise.resolve(false);
      var fin = Date.now();
      var s = Object.assign({}, jeton.base, bilan || {});
      s.id = jeton.id;
      s.status = (bilan && bilan.status) || 'completed';
      s.ended_at = new Date(fin).toISOString();
      s.duration_s = Math.max(0, Math.round((fin - jeton.debut)/1000));
      var et = (etapes || []).map(function(e, i){
        return { session_id: jeton.id, idx: i,
                 phase:e.phase||null, station:e.station||null, freq:e.freq!=null?String(e.freq):null,
                 expected:e.expected||null, said:e.said||null,
                 answered: !!e.answered,
                 missed: e.missed || [],
                 score_ok: e.score_ok||0, score_total: e.score_total||0 };
      });
      return tenter({session:s, steps:et});
    },

    /* Au démarrage : tout ce qui est resté « en cours » d'une session
       précédente est un abandon. C'est la seule façon fiable de les compter —
       un évènement de fermeture d'onglet n'arrive pas toujours. */
    solderLesAbandons: function(){
      var c = client(), u = moi();
      if (!c || !u) return Promise.resolve(0);
      return c.from('sessions')
        .update({ status:'abandoned' })
        .eq('user_id', u).eq('status', 'in_progress')
        .select('id')
        .then(function(r){ return (r.data||[]).length; }, function(){ return 0; });
    },

    /* Reprise de la file après une coupure. */
    viderLaFile: function(){
      var f = lireFile();
      if (!f.length || !moi()) return Promise.resolve(0);
      var n = 0;
      return f.reduce(function(p, paquet){
        return p.then(function(){ return tenter(paquet).then(function(ok){ if(ok) n++; }); });
      }, Promise.resolve()).then(function(){ return n; });
    },

    enAttente: function(){ return lireFile().length; },
    dernierEchec: function(){ return dernierEchec; }
  };
  window.RTSync = RTSync;

  /* Une session qui s'ouvre : on solde les abandons de la fois précédente,
     puis on renvoie ce qui attendait. L'ordre compte — solder d'abord évite de
     requalifier « abandonnée » une séance qu'on vient tout juste de renvoyer. */
  window.addEventListener('rt:auth', function(ev){
    if (!ev.detail || !ev.detail.connecte) return;
    RTSync.solderLesAbandons().then(function(){ return RTSync.viderLaFile(); })
      .then(function(n){ if (n) try{ console.info('[RadioTrainer] '+n+' séance(s) en attente envoyée(s).'); }catch(e){} });
  });
})();
