/* =============================================================================
   RadioTrainer — LA PROGRESSION VIT EN BASE
   -----------------------------------------------------------------------------
   Ce module répond à une seule question : « je m'inscris sur Chrome, je
   travaille, je me connecte sur Safari — est-ce que je retrouve tout ? »
   Avant lui la réponse était non. L'application ÉCRIVAIT déjà ses séances en
   base (assets/sync.js), mais ne les RELISAIT jamais : tout ce qui s'affichait
   — historique, badges, statistiques, série de jours, réglages — venait du
   stockage local, c'est-à-dire d'un seul navigateur.

   ┌─ LA RÈGLE ─────────────────────────────────────────────────────────────┐
   │ Supabase est la SOURCE DE VÉRITÉ. Le stockage local n'est plus qu'un    │
   │ CACHE : il sert à peindre l'écran tout de suite, et à continuer de      │
   │ fonctionner hors-ligne. À chaque connexion, la base écrase le cache.    │
   └────────────────────────────────────────────────────────────────────────┘

   POURQUOI LE CACHE GARDE LA FORME DE L'ANCIEN STOCKAGE LOCAL
   Les pages lisent `radiotrainer_history_v2`, `rt-vols`, `rt-jours` depuis des
   dizaines d'endroits. Réécrire tous ces appels aurait voulu dire toucher à
   l'affichage de l'historique, des badges, du tableau de bord et de la
   Navigation — pour un travail qui ne porte pas là-dessus. Ce module TRADUIT
   donc les lignes de la base dans la forme que ces clés avaient déjà. Les pages
   n'ont rien appris de nouveau ; elles lisent la même chose, qui vient
   désormais d'ailleurs.

   ┌─ LE CACHE PORTE LE NOM DE SON PROPRIÉTAIRE ────────────────────────────┐
   │ Sans cela, deux personnes qui se succèdent sur le même ordinateur       │
   │ voient l'historique l'une de l'autre : la seconde se connecte, le cache  │
   │ de la première est encore là, et l'écran se peint AVANT que la base ait  │
   │ répondu. Ce n'est pas une fuite en base — RLS tient bon — mais c'est une │
   │ fuite à l'écran, et elle suffit. Le cache est donc estampillé, et tout   │
   │ cache qui n'est pas le sien est effacé avant d'afficher quoi que ce soit.│
   └────────────────────────────────────────────────────────────────────────┘
   ========================================================================== */
(function(){
  'use strict';

  /* Les clés du cache local. Ce sont les MÊMES qu'avant : elles ne changent pas
     de nom parce qu'elles ne changent pas de forme — seule leur origine change. */
  var K = {
    scenarios : 'radiotrainer_history_v2',
    vols      : 'rt-vols',
    jours     : 'rt-jours',
    quota     : 'rt-quota',
    volEnCours: 'rt-vol-en-cours',
    reglages  : 'rt-settings'
  };
  var K_PROPRIO = 'rt-cache-proprio';    // l'identifiant de celui à qui le cache appartient
  var K_ATTENTE = 'rt-push-attente';     // ce qui n'a pas pu partir : {reglages:bool, etatVol:bool}

  /* Plafond de rapatriement. Le cache local n'a jamais gardé que 50 scénarios et
     40 vols ; rapatrier davantage ne servirait qu'à remplir un cache qui les
     jette ensuite. La SÉRIE DE JOURS, elle, ne passe pas par ce plafond : elle
     vient de la vue v_daily_activity, agrégée par le serveur, et reste donc
     juste même après mille séances. */
  var PLAFOND = 300;

  function client(){
    try{ return (window.RTAuth && RTAuth.client && RTAuth.client()) || null; }catch(e){ return null; }
  }
  function moi(){
    try{ var u = window.RTAuth && RTAuth.utilisateur(); return (u && u.id) || null; }catch(e){ return null; }
  }
  function lire(k, d){ try{ var v = localStorage.getItem(k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } }
  function ecrire(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function oublier(k){ try{ localStorage.removeItem(k); }catch(e){} }
  function jourISO(d){
    /* PAS toISOString() : celui-ci bascule en UTC, et une séance faite à 00h30
       à Paris en hiver serait comptée la veille. La série de jours consécutifs
       se trompait alors d'un jour, au hasard des heures de pratique. */
    d = d || new Date();
    var p = function(n){ return String(n).padStart(2,'0'); };
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  }

  function journaliser(niveau, message, detail, cle){
    try{ console[niveau==='error'?'warn':'info']('[RadioTrainer] '+message, detail||''); }catch(e){}
    try{ if (window.RTAdmin && RTAdmin.logError)
           RTAdmin.logError({ level:niveau, kind:'network', message:message,
                              detail:detail||null, key:cle||'donnees' }); }catch(e){}
  }

  /* =========================================================================
     1) LE CATALOGUE DES SCÉNARIOS
     -------------------------------------------------------------------------
     La base range une séance de scénario sous sa CLÉ (`exercise_key`) ; l'écran,
     lui, affiche un TITRE et rejoue un scénario par son RANG dans SCENARIOS.
     index.html expose la correspondance (window.RT_SCENARIOS_MAP) : la
     recopier ici en ferait une seconde liste à tenir à jour, et le jour où un
     scénario serait ajouté, l'historique afficherait « Scénario » à la place de
     son nom sans que personne comprenne pourquoi.
     ====================================================================== */
  function catalogue(){ return window.RT_SCENARIOS_MAP || {}; }
  function titreDe(cle){
    var e = catalogue()[cle];
    return (e && e.titre) || (cle ? String(cle) : 'Scénario');
  }
  function rangDe(cle){
    var e = catalogue()[cle];
    return (e && typeof e.idx === 'number') ? e.idx : null;
  }
  function cleDeRang(idx){
    var c = catalogue();
    for (var k in c) if (c[k].idx === idx) return k;
    return null;
  }

  /* Les aléas de la Navigation : la base garde la CLÉ (« moteur »), l'historique
     local affiche le LIBELLÉ (« panne moteur (MAYDAY) »). La table vit dans le
     module Navigation ; on la redit ici dans les deux sens, parce que la
     migration doit savoir relire des libellés déjà écrits sur les appareils. */
  var ALEA_LIB = { moteur:'panne moteur (MAYDAY)', fumee:'fumée en cabine (MAYDAY)',
                   malaise:'passager malade (PAN PAN)', cap:'changement de cap imposé',
                   radio:'panne radio', ferme:'terrain d\'arrivée fermé' };
  function aleaCle(lib){
    if (!lib) return null;
    if (ALEA_LIB[lib]) return lib;                       // c'est déjà une clé
    for (var k in ALEA_LIB) if (ALEA_LIB[k] === lib) return k;
    return String(lib).slice(0,40);
  }

  /* =========================================================================
     2) UN IDENTIFIANT STABLE POUR CE QUI EXISTE DÉJÀ EN LOCAL
     -------------------------------------------------------------------------
     Les séances déjà enregistrées sur les appareils n'ont PAS d'identifiant :
     elles datent d'avant assets/sync.js, qui en tire un à la création. Pour les
     faire monter en base sans jamais les dupliquer, on en FABRIQUE un, déduit
     du contenu de la séance : même séance, même identifiant, et l'upsert récrit
     la même ligne au lieu d'en créer une seconde.

     Cela rend la migration rejouable autant de fois qu'on veut — ce qui compte,
     parce qu'elle tourne à CHAQUE connexion : quelqu'un qui aurait travaillé
     hors-ligne sur un vieux navigateur verra ses séances monter le jour où il
     se reconnecte, sans qu'on ait à retenir ce qui est déjà parti.

     Le haché n'a pas besoin d'être cryptographique : il doit seulement ne pas
     collisionner entre les quelques dizaines de séances d'une même personne.
     ====================================================================== */
  function hacher32(txt, graine){
    var h = (graine >>> 0) ^ 0x9e3779b9;
    for (var i = 0; i < txt.length; i++){
      h = Math.imul(h ^ txt.charCodeAt(i), 0x85ebca6b);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
    return (h ^ (h >>> 13)) >>> 0;
  }
  function uuidStable(signature){
    var a = hacher32(signature, 1), b = hacher32(signature, 2),
        c = hacher32(signature, 3), d = hacher32(signature, 4);
    var hex = function(n){ return ('00000000' + n.toString(16)).slice(-8); };
    var s = hex(a) + hex(b) + hex(c) + hex(d);
    /* Forme d'un UUID de version 4 : la base n'accepte rien d'autre dans une
       colonne uuid, et un identifiant qui ment sur sa version se repère mal. */
    return s.slice(0,8) + '-' + s.slice(8,12) + '-4' + s.slice(13,16) + '-'
         + '8' + s.slice(17,20) + '-' + s.slice(20,32);
  }

  /* =========================================================================
     3) DE LA BASE VERS L'ÉCRAN
     -------------------------------------------------------------------------
     Une ligne `sessions` + ses `session_steps` redeviennent exactement l'objet
     que l'historique local contenait. Aucune page n'a à savoir d'où ça vient.
     ====================================================================== */
  function etapesVersLignes(etapes){
    return (etapes || []).slice().sort(function(a,b){ return (a.idx||0) - (b.idx||0); })
      .map(function(e){
        return { ph: e.phase || '', stn: e.station || null,
                 freq: e.freq != null ? e.freq : null,
                 attendu: e.expected || '', dit: e.said || '',
                 manquants: e.missed || [], repondu: !!e.answered,
                 ok: e.score_ok || 0, total: e.score_total || 0 };
      });
  }
  function manquesDe(lignes){
    var vus = {}, out = [];
    lignes.forEach(function(l){ (l.manquants||[]).forEach(function(m){
      if (!vus[m]){ vus[m] = 1; out.push(m); } }); });
    return out;
  }

  function versScenarioLocal(s, etapes){
    var lignes = etapesVersLignes(etapes);
    return {
      date    : s.ended_at || s.started_at,
      scenario: titreDe(s.exercise_key),
      scIdx   : rangDe(s.exercise_key),
      terrain : s.dep_icao || '',
      piste   : s.runway || '',
      found   : s.score_ok || 0,
      total   : s.score_total || 0,
      missed  : manquesDe(lignes),
      mode    : s.level || 'debutant',
      duree   : s.duration_s != null ? s.duration_s : null,
      lignes  : lignes
    };
  }
  function versVolLocal(s, etapes){
    var lignes = etapesVersLignes(etapes);
    var arrivee = s.diverted_icao || s.arr_icao;
    var tot = s.score_total || 0;
    return {
      date  : s.ended_at || s.started_at,
      titre : s.arr_icao ? ((s.dep_icao||'?') + ' → ' + (arrivee||'?'))
                         : ((s.dep_icao||'?') + ' — vol local'),
      dep   : s.dep_icao || null, arr: s.arr_icao || null, deg: s.alt_icao || null,
      mode  : s.mode || 'voyage', level: s.level || 'debutant',
      avion : s.aircraft || null, acftNom: s.aircraft || null,
      alt   : s.cruise_alt_ft != null ? s.cruise_alt_ft : null,
      pax   : s.pax != null ? s.pax : null,
      ok    : s.score_ok || 0, total: tot,
      pct   : tot ? Math.round((s.score_ok||0) * 100 / tot) : 0,
      duree : s.duration_s != null ? s.duration_s : null,
      alea  : s.alea ? (ALEA_LIB[s.alea] || s.alea) : null,
      lignes: lignes
    };
  }

  /* =========================================================================
     4) DE L'ÉCRAN VERS LA BASE  (la migration de l'existant)
     ====================================================================== */
  function debutDe(entree){
    /* L'historique local horodate la FIN de la séance. La base veut le début :
       on le retrouve en retirant la durée, et à défaut de durée on pose les deux
       au même instant plutôt que d'inventer un écart. */
    var fin = new Date(entree.date).getTime();
    if (!isFinite(fin)) fin = Date.now();
    var d = (entree.duree != null && entree.duree >= 0) ? fin - entree.duree * 1000 : fin;
    return { debut:new Date(d).toISOString(), fin:new Date(fin).toISOString() };
  }
  function lignesVersEtapes(id, lignes){
    return (lignes || []).map(function(l, i){
      return { session_id:id, idx:i,
               phase:l.ph || null, station:l.stn || null,
               freq: l.freq != null ? String(l.freq) : null,
               expected:l.attendu || null, said:l.dit || null,
               answered: !!l.repondu, missed: l.manquants || [],
               score_ok: l.ok || 0, score_total: l.total || 0 };
    });
  }

  function scenarioLocalVersBase(e, uid){
    var t = debutDe(e);
    var cle = (typeof e.scIdx === 'number') ? cleDeRang(e.scIdx) : null;
    var id = uuidStable(uid + '|scenario|' + e.date + '|' + (e.scenario||'') + '|' + (e.found||0) + '/' + (e.total||0));
    return {
      session: { id:id, user_id:uid, kind:'scenario', status:'completed',
                 started_at:t.debut, ended_at:t.fin,
                 duration_s: e.duree != null ? e.duree : null,
                 level: (e.mode === 'reel' ? 'reel' : 'debutant'),
                 exercise_key: cle,
                 dep_icao: e.terrain || null,
                 runway: e.piste ? String(e.piste) : null,
                 score_ok: e.found || 0, score_total: e.total || 0 },
      steps: lignesVersEtapes(id, e.lignes)
    };
  }
  function volLocalVersBase(e, uid){
    var t = debutDe(e);
    var id = uuidStable(uid + '|flight|' + e.date + '|' + (e.dep||'') + '>' + (e.arr||'') + '|' + (e.ok||0) + '/' + (e.total||0));
    return {
      session: { id:id, user_id:uid, kind:'flight', status:'completed',
                 started_at:t.debut, ended_at:t.fin,
                 duration_s: e.duree != null ? e.duree : null,
                 level: (e.level === 'reel' ? 'reel' : 'debutant'),
                 mode: (e.mode === 'local' ? 'local' : 'voyage'),
                 dep_icao: e.dep || null, arr_icao: e.arr || null, alt_icao: e.deg || null,
                 aircraft: e.avion || e.acftNom || null,
                 cruise_alt_ft: e.alt != null ? e.alt : null,
                 pax: e.pax != null ? e.pax : null,
                 alea: aleaCle(e.alea),
                 score_ok: e.ok || 0, score_total: e.total || 0 },
      steps: lignesVersEtapes(id, e.lignes)
    };
  }

  /* La montée se fait par paquets : une requête par séance ferait cinquante
     allers-retours à la première connexion d'un ancien compte. */
  function monterPaquet(c, paquets){
    if (!paquets.length) return Promise.resolve(0);
    var seances = paquets.map(function(p){ return p.session; });
    var etapes  = paquets.reduce(function(a,p){ return a.concat(p.steps); }, []);
    return c.from('sessions').upsert(seances, {onConflict:'id'}).then(function(r){
      if (r.error) throw r.error;
      if (!etapes.length) return null;
      return c.from('session_steps').upsert(etapes, {onConflict:'session_id,idx'})
        .then(function(r2){ if (r2.error) throw r2.error; });
    }).then(function(){ return seances.length; });
  }

  /* =========================================================================
     5) LA MIGRATION
     -------------------------------------------------------------------------
     Elle tourne AVANT la relecture, et seulement sur ce que le cache contient
     encore. Trois garde-fous :
       · rien n'est effacé localement tant que la montée n'a pas réussi ;
       · l'identifiant étant déduit du contenu, rejouer ne duplique pas ;
       · un cache appartenant à quelqu'un d'autre a déjà été effacé avant
         d'arriver ici (voir garderLeCache), donc on ne peut pas verser les
         séances d'une personne dans le compte d'une autre.
     ====================================================================== */
  function migrer(){
    var c = client(), uid = moi();
    if (!c || !uid) return Promise.resolve({ montees:0 });

    var S = lire(K.scenarios, []) || [], V = lire(K.vols, []) || [];
    if (!S.length && !V.length) return Promise.resolve({ montees:0 });

    var paquets = [];
    try{
      S.forEach(function(e){ if (e && e.date) paquets.push(scenarioLocalVersBase(e, uid)); });
      V.forEach(function(e){ if (e && e.date) paquets.push(volLocalVersBase(e, uid)); });
    }catch(e){ return Promise.resolve({ montees:0 }); }
    if (!paquets.length) return Promise.resolve({ montees:0 });

    /* Un scénario dont la clé est inconnue de `exercises` serait refusé par la
       clé étrangère et emporterait tout le paquet avec lui. On préfère le monter
       SANS sa clé : la séance, le score et les échanges valent mieux que rien,
       et c'est plus honnête que de faire disparaître la séance en silence.
       (sql/002-progression.sql pose les treize clés ; ceci couvre le cas d'une
       base où la migration n'aurait pas encore été jouée.) */
    var cat = catalogue();
    paquets.forEach(function(p){
      if (p.session.exercise_key && !cat[p.session.exercise_key]) p.session.exercise_key = null;
    });

    return monterPaquet(c, paquets).then(function(n){
      journaliser('info', n + ' séance(s) locale(s) versée(s) dans le compte.', null, 'migration');
      return { montees:n };
    }, function(err){
      journaliser('warn', 'Reprise des séances locales impossible : ' + ((err && err.message) || err),
                  (err && (err.details || err.hint)) || null, 'migration');
      return { montees:0, erreur:err };
    });
  }

  /* =========================================================================
     6) LA RELECTURE
     ====================================================================== */
  function charger(){
    var c = client(), uid = moi();
    if (!c || !uid) return Promise.resolve(null);

    var seances = c.from('sessions')
      .select('id,kind,status,started_at,ended_at,duration_s,level,mode,exercise_key,'
            + 'dep_icao,arr_icao,alt_icao,diverted_icao,runway,aircraft,cruise_alt_ft,pax,alea,'
            + 'score_ok,score_total')
      /* `completed`, et NON `<> in_progress` : une séance abandonnée existe en
         base (c'est elle qui permet de compter les décrochages), mais elle n'a
         ni score ni échange. La faire entrer dans l'historique remplirait la
         liste de lignes à 0 % que l'élève n'a jamais jouées, et ferait chuter
         sa moyenne pour des vols qu'il a simplement fermés. */
      .eq('user_id', uid).eq('status', 'completed')
      .order('started_at', { ascending:false }).limit(PLAFOND);

    /* Les jours de pratique viennent d'une VUE, agrégée par le serveur : la
       série de jours consécutifs reste juste au-delà du plafond de séances.
       v_daily_PRACTICE et non v_daily_ACTIVITY : la seconde compte aussi les
       séances abandonnées — c'est ce qu'il faut à la console d'administration,
       qui mesure la fréquentation. Ici on récompense la PRATIQUE, et fermer un
       vol au deuxième échange n'en est pas. C'était déjà la règle en local. */
    var jours = c.from('v_daily_practice').select('day').eq('user_id', uid)
                 .order('day', { ascending:false }).limit(500);

    /* `select('*')` plutôt que la liste des deux colonnes : `etat_vol` n'existe
       pas tant que sql/002-progression.sql n'a pas été joué, et nommer une
       colonne absente fait échouer TOUTE la requête (42703) — la progression
       ne serait pas relue du tout. Avec `*`, la colonne manquante est
       simplement absente de la réponse, et on sait le voir. */
    var profil = c.from('profiles').select('*').eq('id', uid).maybeSingle();

    /* Le quota du jour compte les vols COMMENCÉS aujourd'hui, terminés ou non —
       c'est ce que faisait le compteur local, qui s'incrémentait au départ du
       vol. Le déduire des seules séances terminées ferait retomber le quota
       après un vol abandonné, et donnerait un tour gratuit à qui ferme l'onglet.
       D'où cette requête à part : les listes, elles, ne veulent que les séances
       finies. `head:true` ne rapatrie aucune ligne, juste le compte. */
    var debutJour = new Date(); debutJour.setHours(0,0,0,0);
    var quota = c.from('sessions').select('id', { count:'exact', head:true })
                 .eq('user_id', uid).eq('kind', 'flight')
                 .gte('started_at', debutJour.toISOString());

    return Promise.all([seances, jours, profil, quota]).then(function(r){
      if (r[0].error) throw r[0].error;
      var lignes = r[0].data || [];

      return etapesDes(c, lignes.map(function(s){ return s.id; })).then(function(parId){
        var scen = [], vols = [], auj = jourISO(), quotaRepli = 0;
        /* Le compte vient du serveur ; s'il n'a pas répondu, on retombe sur ce
           qu'on a sous la main plutôt que d'afficher zéro. */
        var quotaJour = (!r[3].error && typeof r[3].count === 'number') ? r[3].count : null;
        lignes.forEach(function(s){
          var et = parId[s.id] || [];
          if (s.kind === 'scenario') scen.push(versScenarioLocal(s, et));
          else if (s.kind === 'flight'){
            vols.push(versVolLocal(s, et));
            if (quotaJour === null && jourISO(new Date(s.started_at)) === auj) quotaRepli++;
          }
          /* `spelling` n'a pas d'historique à l'écran : il compte pour la série
             de jours (la vue le compte) et pour rien d'autre. Rien à traduire. */
        });

        ecrire(K.scenarios, scen.slice(0, 50));
        ecrire(K.vols,      vols.slice(0, 40));
        ecrire(K.quota,     { date:auj, n: quotaJour === null ? quotaRepli : quotaJour });

        /* Jours de pratique. La vue peut échouer (elle n'existe pas encore sur
           une base non migrée) : on retombe alors sur les dates des séances
           qu'on vient de lire, ce qui est juste tant qu'on reste sous le
           plafond. Mieux vaut une série approchée qu'une série à zéro. */
        var j = [];
        if (!r[1].error && r[1].data) j = r[1].data.map(function(x){ return String(x.day).slice(0,10); });
        else lignes.forEach(function(s){
          var d = jourISO(new Date(s.started_at));
          if (j.indexOf(d) < 0) j.push(d);
        });
        ecrire(K.jours, j.slice(0, 400));

        var p = (!r[2].error && r[2].data) ? r[2].data : null;
        appliquerReglages(p ? p.settings : null);
        /* Colonne absente = migration SQL pas encore jouée. On ne touche alors
           PAS au vol local : l'effacer parce que la base ne sait pas encore le
           stocker ferait perdre un vol en cours pour rien. */
        if (p && Object.prototype.hasOwnProperty.call(p, 'etat_vol')) appliquerEtatVol(p.etat_vol);
        else volPortable = false;

        ecrire(K_PROPRIO, uid);
        annoncer({ scenarios:scen.length, vols:vols.length, jours:j.length });
        return { scenarios:scen.length, vols:vols.length, jours:j.length };
      });
    }).catch(function(err){
      /* Base injoignable : on garde le cache tel quel et on le dit. C'est le cas
         hors-ligne, et l'application doit continuer de fonctionner. */
      journaliser('warn', 'Progression non rechargée depuis la base : ' + ((err && err.message) || err),
                  (err && (err.details || err.hint)) || null, 'lecture');
      return null;
    });
  }

  /* Les échanges de plusieurs séances en une requête. PostgREST sait faire un
     `in.(…)` ; découpé par tranches, parce qu'une liste de trois cents
     identifiants dans une URL finit par se faire refuser sa longueur. */
  function etapesDes(c, ids){
    var parId = {};
    if (!ids.length) return Promise.resolve(parId);
    var tranches = [];
    for (var i = 0; i < ids.length; i += 60) tranches.push(ids.slice(i, i+60));
    return tranches.reduce(function(p, t){
      return p.then(function(){
        return c.from('session_steps')
          .select('session_id,idx,phase,station,freq,expected,said,answered,missed,score_ok,score_total')
          .in('session_id', t)
          .then(function(r){
            if (r.error) throw r.error;
            (r.data || []).forEach(function(e){
              (parId[e.session_id] = parId[e.session_id] || []).push(e);
            });
          });
      });
    }, Promise.resolve()).then(function(){ return parId; },
       function(){ return parId; });   // sans les échanges, les scores restent justes
  }

  /* =========================================================================
     7) LES RÉGLAGES
     -------------------------------------------------------------------------
     Ils sont lus PARTOUT et de façon synchrone — jusque dans le <head>, par le
     script qui pose le thème avant le premier pixel. Ils restent donc en
     stockage local, et ce module les tient à jour dans les deux sens.

     QUI GAGNE, EN CAS DE DÉSACCORD : le plus récent. Chaque enregistrement
     estampille les réglages (`_maj`). Quelqu'un qui change son thème hors-ligne
     dans Safari, puis rouvre Chrome, ne se fait pas rendre son ancien thème par
     la base — et inversement. Sans cet horodatage il aurait fallu choisir un
     gagnant à l'aveugle, et l'un des deux appareils aurait toujours tort.
     ====================================================================== */
  function appliquerReglages(base){
    var local = lire(K.reglages, {}) || {};
    var tLocal = Date.parse(local._maj || '') || 0;
    var tBase  = (base && Date.parse(base._maj || '')) || 0;
    var vide   = function(o){ return !o || !Object.keys(o).filter(function(k){ return k !== '_maj'; }).length; };

    if (!vide(base) && tBase >= tLocal){
      ecrire(K.reglages, base);
      return;
    }
    if (!vide(local)){
      /* Le local est plus récent (ou la base n'a jamais rien reçu) : on monte.
         C'est ce qui fait remonter les réglages d'un ancien compte la première
         fois qu'il se connecte après cette mise à jour. */
      pousserReglages();
    }
  }

  var minuteurReglages = null;
  function pousserReglages(){
    var c = client(), uid = moi();
    if (!c || !uid){ marquerAttente('reglages', true); return Promise.resolve(false); }
    var s = lire(K.reglages, {}) || {};
    if (!s._maj){ s._maj = new Date().toISOString(); ecrire(K.reglages, s); }
    return c.from('profiles').update({ settings:s }).eq('id', uid).then(function(r){
      if (r.error) throw r.error;
      marquerAttente('reglages', false);
      return true;
    }, function(err){
      marquerAttente('reglages', true);
      journaliser('warn', 'Réglages non enregistrés en base : ' + ((err && err.message) || err),
                  (err && (err.details || err.hint)) || null, 'reglages');
      return false;
    });
  }

  /* Appelé par rtSaveSettings() à chaque réglage touché. On temporise : faire
     glisser un curseur ne doit pas produire vingt écritures. */
  function reglagesModifies(){
    var s = lire(K.reglages, {}) || {};
    s._maj = new Date().toISOString();
    ecrire(K.reglages, s);
    if (minuteurReglages) clearTimeout(minuteurReglages);
    minuteurReglages = setTimeout(function(){ minuteurReglages = null; pousserReglages(); }, 900);
  }

  /* =========================================================================
     8) LE VOL INTERROMPU
     ====================================================================== */
  /* Faux dès qu'on a constaté que la base ne porte pas encore `etat_vol`.
     Évite d'écrire en boucle une colonne qui n'existe pas, et de remplir le
     journal d'erreurs d'un incident qu'un seul script SQL règle. */
  var volPortable = true;

  function appliquerEtatVol(v){
    if (v && v.dep) ecrire(K.volEnCours, v);
    else oublier(K.volEnCours);
  }

  var minuteurVol = null;
  function pousserEtatVol(){
    var c = client(), uid = moi();
    if (!volPortable){ marquerAttente('etatVol', false); return Promise.resolve(false); }
    if (!c || !uid){ marquerAttente('etatVol', true); return Promise.resolve(false); }
    var v = lire(K.volEnCours, null);
    return c.from('profiles').update({ etat_vol: v || null }).eq('id', uid).then(function(r){
      if (r.error) throw r.error;
      marquerAttente('etatVol', false);
      return true;
    }, function(err){
      if (err && err.code === '42703'){
        /* La colonne n'est pas là. Ce n'est pas une panne passagère : inutile de
           réessayer à chaque échange. On le dit UNE fois, clairement, et on
           s'arrête — le vol continue de se sauvegarder en local. */
        volPortable = false; marquerAttente('etatVol', false);
        journaliser('warn', 'Le vol en cours reste local : la colonne profiles.etat_vol '
                  + 'n\'existe pas. Jouer sql/002-progression.sql dans Supabase.', null, 'etat-vol');
        return false;
      }
      marquerAttente('etatVol', true);
      journaliser('warn', 'Vol en cours non enregistré en base : ' + ((err && err.message) || err),
                  (err && (err.details || err.hint)) || null, 'etat-vol');
      return false;
    });
  }
  /* Appelé à chaque échange d'un vol. Temporisé plus longuement que les
     réglages : c'est un filet de sécurité, pas une donnée qu'on consulte. */
  function volModifie(){
    if (minuteurVol) clearTimeout(minuteurVol);
    minuteurVol = setTimeout(function(){ minuteurVol = null; pousserEtatVol(); }, 2500);
  }

  /* =========================================================================
     9) CE QUI N'EST PAS PARTI
     ====================================================================== */
  function marquerAttente(quoi, oui){
    var a = lire(K_ATTENTE, {}) || {};
    if (oui) a[quoi] = true; else delete a[quoi];
    ecrire(K_ATTENTE, a);
  }
  function rejouerAttente(){
    var a = lire(K_ATTENTE, {}) || {};
    var p = Promise.resolve();
    if (a.reglages) p = p.then(pousserReglages);
    if (a.etatVol)  p = p.then(pousserEtatVol);
    return p;
  }

  /* =========================================================================
     10) LE CACHE ET SON PROPRIÉTAIRE
     ====================================================================== */
  function viderCache(){
    [K.scenarios, K.vols, K.jours, K.quota, K.volEnCours, K_PROPRIO].forEach(oublier);
  }
  /* Appelé AVANT toute lecture : si le cache appartient à quelqu'un d'autre —
     ou à personne, parce qu'il date d'avant les comptes — il n'a rien à faire
     sous les yeux de celui qui vient d'arriver.
     Le cas « proprio absent » est traité à part : c'est le cache d'un appareil
     qui travaillait avant cette version. On ne l'efface PAS, on le laisse à la
     migration, qui va le verser dans le compte en cours. */
  function garderLeCache(){
    var uid = moi(), proprio = lire(K_PROPRIO, null);
    if (!uid) return;
    if (proprio && proprio !== uid){
      viderCache();
      journaliser('info', 'Cache d\'un autre compte effacé avant affichage.', null, 'cache');
    }
  }

  /* =========================================================================
     11) TOUT EFFACER  (RGPD art. 17 — et la promesse du bouton)
     -------------------------------------------------------------------------
     Le bouton « Tout effacer » des Paramètres ne vidait que le navigateur.
     Depuis que la base est la source de vérité, effacer le seul cache ne fait
     rien disparaître : tout revient à la connexion suivante. Il faut donc
     effacer EN BASE, et ne toucher au cache qu'après.
     ====================================================================== */
  function effacerTout(){
    var c = client(), uid = moi();
    if (!c || !uid){ viderCache(); return Promise.resolve({ base:false }); }
    return c.from('sessions').delete().eq('user_id', uid).then(function(r){
      if (r.error) throw r.error;
      /* ┌─ POURQUOI ON RECOMPTE ────────────────────────────────────────────┐
         │ Un DELETE que la politique RLS n'autorise pas ne lève AUCUNE      │
         │ erreur : PostgREST renvoie 204, zéro ligne touchée, et tout a     │
         │ l'air d'avoir marché. C'est exactement le cas d'une base où la    │
         │ politique « séance : effacement de soi » n'a pas été posée        │
         │ (sql/002-progression.sql § 4) — le bouton dirait « effacé » et    │
         │ tout reviendrait à la connexion suivante. On vérifie donc qu'il   │
         │ ne reste rien, plutôt que de croire un succès silencieux.         │
         └───────────────────────────────────────────────────────────────────┘ */
      return c.from('sessions').select('id', { count:'exact', head:true }).eq('user_id', uid);
    }).then(function(r){
      if (r && r.error) throw r.error;
      if (r && r.count) throw new Error('l\'effacement a été refusé par la base ('
                                      + r.count + ' séance(s) restante(s))');
      /* `session_steps` est parti avec : la clé étrangère est en on delete
         cascade. Le vol interrompu aussi — il n'a plus de sens sans son
         historique. Un échec ici ne doit pas annuler l'effacement réussi des
         séances, d'où le rattrapage silencieux. */
      return c.from('profiles').update({ etat_vol:null }).eq('id', uid)
              .then(function(){}, function(){});
    }).then(function(){
      viderCache(); ecrire(K_PROPRIO, uid);
      annoncer({ scenarios:0, vols:0, jours:0 });
      return { base:true };
    }, function(err){
      journaliser('error', 'Effacement en base impossible : ' + ((err && err.message) || err),
                  (err && (err.details || err.hint)) || null, 'effacement');
      throw err;   // l'appelant doit pouvoir le dire à l'utilisateur
    });
  }

  /* =========================================================================
     12) ANNONCE
     ====================================================================== */
  function annoncer(resume){
    try{ window.dispatchEvent(new CustomEvent('rt:donnees', { detail: resume || {} })); }catch(e){}
  }

  /* =========================================================================
     13) LA SÉQUENCE DE CONNEXION
     -------------------------------------------------------------------------
     L'ORDRE EST LA MOITIÉ DU TRAVAIL :
       1. écarter un cache qui n'est pas le sien — avant tout affichage ;
       2. laisser assets/sync.js finir sa reprise (abandons soldés, file vidée) :
          sans quoi on relirait la base AVANT que les séances en attente y
          soient arrivées, et elles n'apparaîtraient qu'à la connexion d'après ;
       3. faire monter ce qui n'existait qu'en local ;
       4. relire la base, qui a maintenant tout, et écraser le cache ;
       5. rejouer ce qui n'avait pas pu partir.
     ====================================================================== */
  var enCours = null;
  function synchroniser(){
    if (enCours) return enCours;
    garderLeCache();
    var reprise = (window.RTSync && RTSync.reprise) ? RTSync.reprise : Promise.resolve();
    enCours = Promise.resolve(reprise)
      .catch(function(){})
      .then(migrer)
      .then(charger)
      .then(rejouerAttente)
      .catch(function(e){
        journaliser('warn', 'Synchronisation interrompue : ' + ((e && e.message) || e), null, 'sync');
      })
      .then(function(){ enCours = null; });
    return enCours;
  }

  window.addEventListener('rt:auth', function(ev){
    if (!ev || !ev.detail) return;
    if (ev.detail.connecte){ synchroniser(); return; }
    /* Déconnexion : le cache s'en va avec la session. Le laisser serait offrir
       l'historique de la personne qui vient de partir à la suivante. */
    viderCache(); annoncer({ scenarios:0, vols:0, jours:0 });
  });

  /* Le réseau revient : ce qui attendait repart. */
  window.addEventListener('online', function(){
    if (!moi()) return;
    rejouerAttente();
    if (window.RTSync && RTSync.viderLaFile) RTSync.viderLaFile();
  });

  window.RTDonnees = {
    synchroniser     : synchroniser,
    charger          : charger,
    migrer           : migrer,
    reglagesModifies : reglagesModifies,
    volModifie       : volModifie,
    effacerTout      : effacerTout,
    viderCache       : viderCache,
    /* Pour la page Paramètres : dire si quelque chose attend encore. */
    enAttente        : function(){ return lire(K_ATTENTE, {}) || {}; }
  };
})();
