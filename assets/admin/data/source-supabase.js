/* =============================================================================
   RadioTrainer — Admin · SOURCE « SUPABASE »
   -----------------------------------------------------------------------------
   Les données sont RÉELLES : elles viennent du projet Supabase, lues avec la
   session de la personne connectée.

   ┌─ QUI VOIT QUOI ─────────────────────────────────────────────────────────┐
   │ Ce fichier ne prend AUCUNE décision d'autorisation, et ne peut pas en    │
   │ prendre : il n'y a pas un seul `if (role === 'admin')` ici. Les mêmes    │
   │ requêtes envoyées par un élève ne renvoient que SES lignes, parce que    │
   │ les politiques RLS de la base en décident ainsi. Un élève qui ouvrirait  │
   │ /admin verrait donc une console honnête sur ses propres données, jamais  │
   │ celles des autres. C'est la base qui garde, pas le navigateur.           │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─ SÉCURITÉ — CE QUI N'A PAS SA PLACE ICI ────────────────────────────────┐
   │   · la clé `service_role` (elle contourne RLS — usage serveur seulement) │
   │   · un mot de passe, un jeton d'administration, un secret quelconque     │
   │ Seule la clé publique `anon` a sa place dans un client, et elle n'ouvre  │
   │ que ce que les politiques autorisent.                                   │
   └─────────────────────────────────────────────────────────────────────────┘

   POURQUOI L'AGRÉGATION SE FAIT EN JAVASCRIPT
   -----------------------------------------------------------------------------
   PostgREST ne sait pas faire `group by`. Deux voies s'offraient :
     a) écrire une fonction SQL par indicateur et les appeler en `rpc()` ;
     b) rapatrier les séances de la fenêtre demandée et compter ici.
   (b) est retenu tant que la volumétrie le permet — une école, quelques milliers
   de séances par an — parce qu'il garde TOUTE la logique de comptage au même
   endroit que les deux autres sources, donc les mêmes chiffres pour la même
   question. Le jour où ce ne sera plus tenable, PLAFOND ci-dessous le dira :
   il n'y a pas de troncature silencieuse, la console affiche une note quand
   elle a dû s'arrêter. C'est le signal qu'il faut passer en (a).
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin; if (!RT || !RT.data) return;
  var U = RT.util;

  /* Les coordonnées vivent dans assets/supabase-config.js — un seul endroit à
     changer pour tout le site. Les recopier ici garantirait qu'un jour la
     console et l'authentification pointeraient sur deux projets différents. */
  var CONFIG = window.RT_SUPABASE || { url:'', anonKey:'' };

  /* Au-delà, on cesse de rapatrier et on le DIT. Voir l'en-tête. */
  var PLAFOND = 5000;

  var client = null;
  function connecte(){
    if (client) return client;
    /* RTAuth a déjà un client sur cette session : le réutiliser évite d'ouvrir
       une seconde connexion qui rafraîchirait les jetons en parallèle. */
    if (window.RTAuth && window.RTAuth.client){
      var c = window.RTAuth.client();
      if (c) return (client = c);
    }
    if (!CONFIG.url || !CONFIG.anonKey) return null;
    if (!window.supabase || !window.supabase.createClient) return null;
    /* Même `storageKey` que assets/auth.js : les deux modules doivent partager
       LA session. Avec deux clés distinctes, la console interrogerait la base en
       anonyme et ne verrait jamais rien — les politiques RLS s'appuient toutes
       sur auth.uid(). */
    client = window.supabase.createClient(CONFIG.url, CONFIG.anonKey, {
      auth:{ persistSession:true, autoRefreshToken:true, storageKey:'rt-auth' }
    });
    return client;
  }

  /* --------------------------------------------------------------------------
     Plomberie.
     ----------------------------------------------------------------------- */
  function ex(p){                       // exécute et lève au lieu de renvoyer {error}
    return Promise.resolve(p).then(function(r){
      if (r && r.error) throw r.error;
      return r;
    });
  }
  function lignes(p){ return ex(p).then(function(r){ return r.data || []; }); }

  /* Un drapeau posé quand une requête a buté sur le plafond : les méthodes le
     relèvent dans leurs `notes`, que le tableau de bord affiche tel quel. */
  var tronque = false;
  function plafonne(p){
    return lignes(p).then(function(rows){
      if (rows.length >= PLAFOND) tronque = true;
      return rows;
    });
  }
  function notesPlafond(){
    return tronque
      ? ["Volumétrie atteinte : seules les " + PLAFOND + " séances les plus récentes "
       + "de la fenêtre ont été comptées. Les totaux ci-dessus sont donc des minorants — "
       + "il est temps de passer les agrégats en fonctions SQL."]
      : [];
  }

  function fenetre(opts){
    opts = opts || {};
    var to   = opts.to   ? new Date(opts.to)   : new Date();
    var from = opts.from ? new Date(opts.from) : U.ilYaJours(opts.days || 30);
    return { from:from, to:to, fromISO:from.toISOString(), toISO:to.toISOString() };
  }

  /* Les noms d'affichage, en UNE requête pour toute une page de résultats.
     Les demander séance par séance ferait N allers-retours pour rien — et
     PostgREST ne sait pas joindre `sessions` à `profiles` sans clé étrangère
     déclarée entre les deux, ce qui n'est pas le cas ici. */
  function noms(ids){
    var uniq = [];
    (ids || []).forEach(function(i){ if (i && uniq.indexOf(i) < 0) uniq.push(i); });
    if (!uniq.length) return Promise.resolve({});
    var c = connecte();
    return lignes(c.from('profiles').select('id,display_name,email').in('id', uniq))
      .then(function(rows){
        var m = {};
        rows.forEach(function(p){ m[p.id] = p.display_name || p.email || p.id.slice(0,8); });
        return m;
      })
      /* Un élève n'a le droit de lire que son propre profil : la requête réussit
         mais ne renvoie qu'une ligne. Les autres noms restent inconnus — on
         affiche l'identifiant court plutôt que d'inventer un nom. */
      .catch(function(){ return {}; });
  }

  function nomAerodrome(icao){
    if (!icao || typeof AERODROMES === 'undefined') return '';
    var a = AERODROMES.filter(function(x){ return x.icao === icao; })[0];
    return a ? a.nom : '';
  }
  function titreSeance(s){
    if (s.kind === 'flight')
      return (s.dep_icao || '') + (s.arr_icao ? ' → ' + s.arr_icao : ' — vol local');
    if (s.kind === 'spelling') return 'Épellation';
    return titreExercice(s.exercise_key) || 'Scénario';
  }
  /* Le titre d'un exercice vient du catalogue en base s'il y est, du code
     sinon : `exercises` ne porte que les métadonnées de pilotage, le déroulé
     reste dans SCENARIOS (voir ADMIN.md § 10). */
  var catalogue = null;
  function titreExercice(cle){
    if (!cle) return null;
    if (catalogue && catalogue[cle]) return catalogue[cle].title;
    if (typeof SCENARIOS !== 'undefined'){
      var sc = SCENARIOS.filter(function(x){ return x.id === cle; })[0];
      if (sc) return sc.titre;
    }
    return null;
  }

  /* Une ligne de `sessions` → un SessionRow du contrat. Un seul endroit où la
     traduction se fait : toutes les méthodes passent par là. */
  function enSeance(s, mNoms){
    return {
      id:s.id,
      userId:s.user_id,
      userName:(mNoms && mNoms[s.user_id]) || (s.user_id ? s.user_id.slice(0,8) : '—'),
      kind:s.kind,
      at:s.started_at,
      title:titreSeance(s),
      exerciseKey:s.exercise_key || null,
      dep:s.dep_icao || null,  depName:nomAerodrome(s.dep_icao),
      arr:s.arr_icao || null,  arrName:nomAerodrome(s.arr_icao),
      alt:s.alt_icao || null,
      diverted:s.diverted_icao || null,
      runway:s.runway || null,
      aircraft:s.aircraft || null,
      cruiseAlt:s.cruise_alt_ft != null ? s.cruise_alt_ft : null,
      pax:s.pax != null ? s.pax : null,
      level:s.level || null,
      mode:s.mode || null,
      durationS:s.duration_s != null ? s.duration_s : null,
      scoreOk:s.score_ok != null ? s.score_ok : null,
      scoreTotal:s.score_total != null ? s.score_total : null,
      scorePct:s.score_pct != null ? s.score_pct : null,
      status:s.status,
      alea:s.alea || null,
      aleaLabel:s.alea ? (RT.labels.alea[s.alea] || s.alea) : null,
      missed:[],                          // rempli par flight() depuis session_steps
      steps:null
    };
  }

  /* Tri et pagination : PostgREST sait les faire, mais les noms de colonnes du
     contrat ne sont pas ceux de la base. Cette table est la seule traduction. */
  var COL = { at:'started_at', durationS:'duration_s', scorePct:'score_pct',
              scoreOk:'score_ok', scoreTotal:'score_total', status:'status',
              kind:'kind', level:'level', aircraft:'aircraft', dep:'dep_icao',
              arr:'arr_icao', alea:'alea',
              name:'display_name', email:'email', role:'role',
              createdAt:'created_at', lastSeenAt:'last_seen_at' };
  function colonne(cle, defaut){ return COL[cle] || defaut; }

  /* --------------------------------------------------------------------------
     LA SOURCE.
     ----------------------------------------------------------------------- */
  var src = {
    id:'supabase',
    label:'Supabase',
    fictional:false,

    available:function(){ return !!connecte(); },
    unavailableReason:function(){
      if (!CONFIG.url || !CONFIG.anonKey)
        return "Supabase n'est pas configuré : l'URL du projet et la clé publique "
             + "`anon` manquent dans assets/supabase-config.js.";
      if (!window.supabase)
        return "Le client Supabase n'est pas chargé. Vérifiez la balise <script> de "
             + "assets/vendor/supabase.js.";
      return '';
    },

    capabilities:function(){
      var connu = window.RTAuth && window.RTAuth.utilisateur && window.RTAuth.utilisateur();
      var admin = window.RTAuth && window.RTAuth.estAdmin && window.RTAuth.estAdmin();
      return {
        read:true, write:false, realtime:false,
        users:true, errors:true, analytics:true,
        note: !connu
          ? "Aucune session ouverte : les politiques RLS ne renverront aucune ligne. "
          + "Connectez-vous pour lire la base."
          : (admin
            ? "Lecture de l'ensemble des comptes, autorisée par les politiques RLS "
            + "de la base — pas par cette page."
            : "Session sans rôle d'administrateur : la base ne renvoie que VOS "
            + "propres lignes. Ce que vous voyez est exact, mais c'est votre "
            + "périmètre, pas celui de l'école.")
      };
    },

    /* ---- Vue d'ensemble ---------------------------------------------------
       Quatre lectures : les profils (total et nouveaux), et les séances de la
       fenêtre courante puis de la fenêtre précédente — cette dernière sert
       uniquement à calculer les écarts affichés sous chaque tuile. */
    overview:function(opts){
      var c = connecte(), f = fenetre(opts);
      var duree = f.to.getTime() - f.from.getTime();
      var avantISO = new Date(f.from.getTime() - duree).toISOString();

      var champs = 'id,user_id,kind,status,started_at,duration_s,score_ok,score_total,score_pct';
      return Promise.all([
        ex(c.from('profiles').select('id,created_at', { count:'exact', head:true })),
        ex(c.from('profiles').select('id', { count:'exact', head:true }).gte('created_at', f.fromISO)),
        plafonne(c.from('sessions').select(champs)
                  .gte('started_at', f.fromISO).lte('started_at', f.toISO)
                  .order('started_at', { ascending:false }).limit(PLAFOND)),
        plafonne(c.from('sessions').select(champs)
                  .gte('started_at', avantISO).lt('started_at', f.fromISO)
                  .order('started_at', { ascending:false }).limit(PLAFOND))
      ]).then(function(r){
        var total = r[0].count || 0, nouveaux = r[1].count || 0;
        var maintenant = r[2], avant = r[3];

        function bilan(S){
          var ok = 0, tot = 0, sommeDuree = 0, nDuree = 0, actifs = {};
          var fini = 0, abandon = 0, cours = 0;
          S.forEach(function(s){
            ok += s.score_ok || 0; tot += s.score_total || 0;
            if (s.duration_s != null){ sommeDuree += s.duration_s; nDuree++; }
            if (s.user_id) actifs[s.user_id] = 1;
            if (s.status === 'completed') fini++;
            else if (s.status === 'abandoned') abandon++;
            else cours++;
          });
          return { n:S.length, fini:fini, abandon:abandon, cours:cours,
                   actifs:Object.keys(actifs).length,
                   avgPct:tot ? U.pct(ok, tot) : null,
                   avgDurationS:nDuree ? Math.round(sommeDuree / nDuree) : null };
        }
        var a = bilan(maintenant), b = bilan(avant);
        function ecart(x, y){ return (x == null || y == null) ? null : (x - y); }

        return {
          range:{ from:f.fromISO, to:f.toISO },
          users:{ total:total, new:nouveaux, active:a.actifs },
          sessions:{ total:a.n, completed:a.fini, abandoned:a.abandon,
                     inProgress:a.cours, avgDurationS:a.avgDurationS },
          /* « Terminées » au sens du contrat : les séances menées à leur terme,
             TOUS types confondus — le même sens que sur les deux autres
             sources, sinon la même tuile dirait deux choses. */
          exercises:{ completed:a.fini,
                      scenarios:maintenant.filter(function(s){ return s.kind === 'scenario'; }).length },
          score:{ avgPct:a.avgPct },
          deltas:{ users:nouveaux, active:ecart(a.actifs, b.actifs),
                   sessions:ecart(a.n, b.n), score:ecart(a.avgPct, b.avgPct) },
          notes:notesPlafond()
        };
      });
    },

    /* ---- Fil d'activité --------------------------------------------------- */
    activity:function(opts){
      var c = connecte(), n = (opts && opts.limit) || 12;
      return lignes(c.from('sessions')
              .select('id,user_id,kind,status,started_at,level,score_pct,exercise_key,'
                    + 'dep_icao,arr_icao,runway,aircraft,alea,duration_s')
              .order('started_at', { ascending:false }).limit(n))
        .then(function(rows){
          return noms(rows.map(function(s){ return s.user_id; })).then(function(m){
            return rows.map(function(s){
              var e = enSeance(s, m);
              return { id:e.id, at:e.at, userId:e.userId, userName:e.userName,
                       kind:e.kind, label:e.title, status:e.status, level:e.level,
                       scorePct:e.scorePct,
                       detail:(e.kind === 'flight'
                                ? [e.aircraft, e.aleaLabel].filter(Boolean).join(' · ')
                                : [e.dep, e.runway ? 'piste ' + e.runway : null]
                                    .filter(Boolean).join(' · ')) };
            });
          });
        });
    },

    /* ---- Alertes ----------------------------------------------------------
       Trois signaux, chacun une vraie mesure :
         a) les erreurs non résolues des sept derniers jours ;
         b) les exercices dont le score moyen décroche sur un échantillon
            suffisant (moins de douze passages, la moyenne ne veut rien dire) ;
         c) un taux d'abandon élevé sur quinze jours. */
    alerts:function(){
      var c = connecte();
      var il7  = U.ilYaJours(7).toISOString();
      var il15 = U.ilYaJours(15).toISOString();
      return Promise.all([
        lignes(c.from('app_errors').select('id,occurred_at,level,kind,message')
                .is('resolved_at', null).gte('occurred_at', il7)
                .order('occurred_at', { ascending:false }).limit(200)).catch(function(){ return []; }),
        plafonne(c.from('sessions').select('kind,status,exercise_key,score_pct,started_at')
                  .gte('started_at', il15).limit(PLAFOND))
      ]).then(function(r){
        var errs = r[0], S = r[1], out = [];

        if (errs.length)
          out.push({ id:'al_err', at:errs[0].occurred_at, level:'error', kind:'technique',
            title:errs.length + ' erreur' + (errs.length > 1 ? 's' : '') + ' non résolue'
                + (errs.length > 1 ? 's' : '') + ' sur sept jours',
            detail:errs[0].message, route:'admin/errors' });

        var parEx = {};
        S.forEach(function(s){
          if (s.kind !== 'scenario' || !s.exercise_key || s.score_pct == null) return;
          var a = parEx[s.exercise_key] || (parEx[s.exercise_key] = { n:0, somme:0 });
          a.n++; a.somme += s.score_pct;
        });
        Object.keys(parEx).forEach(function(k){
          var a = parEx[k], moy = Math.round(a.somme / a.n);
          if (a.n >= 12 && moy < 58)
            out.push({ id:'al_ex_' + k, at:new Date().toISOString(), level:'warn',
              kind:'pédagogie',
              title:'« ' + (titreExercice(k) || k) + ' » décroche : ' + moy + ' % de moyenne',
              detail:'Sur ' + a.n + ' passages en quinze jours. Une consigne ambiguë ou une '
                   + 'phraséologie attendue trop stricte se manifestent ainsi.',
              route:'admin/exercises' });
        });

        var termine = S.filter(function(s){ return s.status !== 'in_progress'; }).length;
        var abandon = S.filter(function(s){ return s.status === 'abandoned'; }).length;
        if (termine >= 20){
          var taux = Math.round(abandon / termine * 100);
          if (taux >= 30)
            out.push({ id:'al_abandon', at:new Date().toISOString(), level:'warn',
              kind:'usage',
              title:taux + ' % des séances sont abandonnées',
              detail:abandon + ' abandons sur ' + termine + ' séances en quinze jours.',
              route:'admin/analytics' });
        }
        return out;
      });
    },

    /* ---- Utilisateurs -----------------------------------------------------
       Deux lectures plutôt qu'une jointure : `v_user_progress` est une vue sur
       `sessions`, sans clé étrangère déclarée vers `profiles`, donc PostgREST
       ne sait pas l'imbriquer. On rapproche ici, sur l'identifiant. */
    users:function(opts){
      opts = opts || {};
      var c = connecte();
      var page = Math.max(1, opts.page || 1), par = opts.perPage || 25;
      var q = c.from('profiles').select('*', { count:'exact' });

      if (opts.q){
        var m = String(opts.q).replace(/[%,()]/g, ' ').trim();
        if (m) q = q.or('display_name.ilike.%' + m + '%,email.ilike.%' + m + '%,callsign.ilike.%' + m + '%');
      }
      if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status);
      if (opts.role   && opts.role   !== 'all') q = q.eq('role', opts.role);

      /* Les colonnes de progression vivent dans la vue, pas dans `profiles` :
         trier dessus exigerait de tout rapatrier. On trie donc en base sur ce
         qu'elle sait trier, et sur le reste après rapprochement — la
         pagination reste celle de la base dans le premier cas. */
      var triBase = COL[opts.sort] && ['name','email','role','createdAt','lastSeenAt','status']
                      .indexOf(opts.sort) >= 0;
      if (triBase) q = q.order(colonne(opts.sort), { ascending:opts.dir !== 'desc' });
      else         q = q.order('created_at', { ascending:false });

      if (triBase) q = q.range((page-1)*par, page*par - 1);

      return ex(q).then(function(r){
        var profs = r.data || [], total = r.count || profs.length;
        return lignes(c.from('v_user_progress').select('*')
                       .in('user_id', profs.map(function(p){ return p.id; })))
          .catch(function(){ return []; })
          .then(function(prog){
            var m = {}; prog.forEach(function(v){ m[v.user_id] = v; });
            var rows = profs.map(function(p){ return enProfil(p, m[p.id]); });
            if (!triBase){
              rows = U.trier(rows, opts.sort || 'createdAt', opts.dir || 'desc');
              var page2 = U.paginer(rows, page, par);
              return { rows:page2.rows, total:total };
            }
            return { rows:rows, total:total };
          });
      });
    },

    user:function(id){
      var c = connecte();
      return Promise.all([
        ex(c.from('profiles').select('*').eq('id', id).maybeSingle()),
        ex(c.from('v_user_progress').select('*').eq('user_id', id).maybeSingle())
          .catch(function(){ return { data:null }; }),
        lignes(c.from('v_daily_activity').select('day').eq('user_id', id))
          .catch(function(){ return []; })
      ]).then(function(r){
        if (!r[0].data) return null;
        var u = enProfil(r[0].data, r[1].data);
        u.days = (r[2] || []).length;
        u.notes = null;
        return u;
      });
    },

    userSessions:function(id, opts){
      var c = connecte(), n = (opts && opts.limit) || 30;
      return lignes(c.from('sessions').select('*').eq('user_id', id)
              .order('started_at', { ascending:false }).limit(n))
        .then(function(rows){
          return noms([id]).then(function(m){
            return rows.map(function(s){ return enSeance(s, m); });
          });
        });
    },

    /* ---- Axes de compétence ------------------------------------------------
       Les éléments MANQUÉS sont comptés un par un, par leur libellé, classés
       par la taxonomie partagée (RTAdmin.taxonomy) — donc exactement comme sur
       les deux autres sources.
       Les éléments RÉUSSIS, eux, ne sont pas conservés individuellement : la
       base garde un score_ok et un score_total par échange, pas la liste de ce
       qui a été dit juste. Les tentatives sont donc réparties au prorata entre
       les axes, comme sur la source locale. C'est une approximation, elle est
       la même partout, et le ratio manqués/tentatives garde son sens relatif. */
    userWeaknesses:function(id){
      var c = connecte();
      return Promise.all([
        lignes(c.from('v_missed_items').select('label').eq('user_id', id)).catch(function(){ return []; }),
        lignes(c.from('sessions').select('score_total').eq('user_id', id).limit(PLAFOND))
      ]).then(function(r){
        var manques = r[0], seances = r[1];
        var parAxe = {};
        RT.taxonomy.axes.forEach(function(a){ parAxe[a.key] = { attempts:0, missed:0 }; });
        manques.forEach(function(m){ parAxe[RT.taxonomy.axisOf(m.label)].missed++; });
        var totalAttendu = seances.reduce(function(n, s){ return n + (s.score_total || 0); }, 0);
        var part = Math.round(totalAttendu / RT.taxonomy.axes.length);
        RT.taxonomy.axes.forEach(function(a){ parAxe[a.key].attempts = part; });
        return RT.taxonomy.axes.map(function(a){
          var v = parAxe[a.key];
          return { axis:a.key, label:a.label, desc:a.desc,
                   attempts:v.attempts, missed:v.missed,
                   pct:v.attempts ? Math.max(0, 100 - Math.round(v.missed / v.attempts * 100)) : null };
        });
      });
    },

    /* ---- Vols -------------------------------------------------------------- */
    flights:function(opts){
      opts = opts || {};
      var c = connecte();
      var page = Math.max(1, opts.page || 1), par = opts.perPage || 25;
      var q = c.from('sessions').select('*', { count:'exact' }).eq('kind', 'flight');

      if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status);
      if (opts.level  && opts.level  !== 'all') q = q.eq('level', opts.level);
      if (opts.alea   && opts.alea   !== 'all')
        q = (opts.alea === 'none') ? q.is('alea', null) : q.eq('alea', opts.alea);
      if (opts.q){
        var m = String(opts.q).replace(/[%,()]/g, ' ').trim().toUpperCase();
        if (m) q = q.or('dep_icao.ilike.%'+m+'%,arr_icao.ilike.%'+m+'%,aircraft.ilike.%'+m+'%');
      }
      q = q.order(colonne(opts.sort, 'started_at'), { ascending:opts.dir !== 'desc' })
           .range((page-1)*par, page*par - 1);

      return ex(q).then(function(r){
        var rows = r.data || [];
        return noms(rows.map(function(s){ return s.user_id; })).then(function(mn){
          return { rows:rows.map(function(s){ return enSeance(s, mn); }), total:r.count || rows.length };
        });
      });
    },

    flight:function(id){
      var c = connecte();
      return Promise.all([
        ex(c.from('sessions').select('*').eq('id', id).maybeSingle()),
        lignes(c.from('session_steps').select('*').eq('session_id', id).order('idx'))
      ]).then(function(r){
        if (!r[0].data) return null;
        var s = r[0].data, steps = r[1];
        return noms([s.user_id]).then(function(mn){
          var e = enSeance(s, mn);
          e.steps = steps.map(function(st){
            return { idx:st.idx, phase:st.phase || null, station:st.station || null,
                     freq:st.freq != null ? String(st.freq) : null,
                     expected:st.expected || '', said:st.said || '',
                     answered:!!st.answered, missed:st.missed || [],
                     scoreOk:st.score_ok || 0, scoreTotal:st.score_total || 0 };
          });
          /* Les éléments manqués de la séance : la réunion de ceux des échanges.
             C'est l'unique source — il n'existe pas de colonne « missed » sur
             `sessions`, et il ne doit pas y en avoir : elle serait à tenir
             synchronisée avec les échanges pour rien. */
          var vus = {};
          e.missed = e.steps.reduce(function(acc, st){
            (st.missed || []).forEach(function(l){ if (!vus[l]){ vus[l] = 1; acc.push(l); } });
            return acc;
          }, []);
          e.squawk = null;
          return e;
        });
      });
    },

    /* ---- Analyse -----------------------------------------------------------
       Une lecture des séances de la fenêtre, une des éléments manqués, et tout
       le comptage ici. Voir l'en-tête pour le pourquoi. */
    analytics:function(opts){
      var c = connecte(), f = fenetre(opts);
      return Promise.all([
        plafonne(c.from('sessions')
          .select('id,user_id,kind,status,started_at,duration_s,level,mode,exercise_key,'
                + 'dep_icao,arr_icao,aircraft,alea,score_ok,score_total,score_pct')
          .gte('started_at', f.fromISO).lte('started_at', f.toISO)
          .order('started_at', { ascending:false }).limit(PLAFOND)),
        lignes(c.from('v_missed_items').select('label,started_at')
          .gte('started_at', f.fromISO).lte('started_at', f.toISO).limit(PLAFOND))
          .catch(function(){ return []; })
      ]).then(function(r){
        var S = r[0], M = r[1];
        var jours = U.joursEntre(f.from, f.to);

        var parJour = {}, actifsJour = {};
        jours.forEach(function(d){ parJour[d] = { d:d, scenario:0, flight:0, spelling:0 };
                                   actifsJour[d] = {}; });
        var ok = 0, tot = 0, sommeD = 0, nD = 0, users = {};
        var parEx = {}, parAvion = {}, parTerrain = {}, parAlea = {};

        S.forEach(function(s){
          var d = String(s.started_at).slice(0,10);
          if (parJour[d]) parJour[d][s.kind] = (parJour[d][s.kind] || 0) + 1;
          if (actifsJour[d] && s.user_id) actifsJour[d][s.user_id] = 1;
          ok += s.score_ok || 0; tot += s.score_total || 0;
          if (s.duration_s != null){ sommeD += s.duration_s; nD++; }
          if (s.user_id) users[s.user_id] = 1;

          if (s.exercise_key){
            var a = parEx[s.exercise_key] || (parEx[s.exercise_key] = { runs:0, ok:0, tot:0 });
            a.runs++; a.ok += s.score_ok || 0; a.tot += s.score_total || 0;
          }
          if (s.aircraft)  parAvion[s.aircraft]   = (parAvion[s.aircraft] || 0) + 1;
          if (s.dep_icao)  parTerrain[s.dep_icao] = (parTerrain[s.dep_icao] || 0) + 1;
          if (s.arr_icao)  parTerrain[s.arr_icao] = (parTerrain[s.arr_icao] || 0) + 1;
          if (s.alea)      parAlea[s.alea]        = (parAlea[s.alea] || 0) + 1;
        });

        var parLabel = {};
        M.forEach(function(m){ if (m.label) parLabel[m.label] = (parLabel[m.label] || 0) + 1; });

        function top(obj, faire, n){
          return Object.keys(obj).map(function(k){ return faire(k, obj[k]); })
                   .sort(function(a,b){ return b.n - a.n; }).slice(0, n || 8);
        }
        var termine = S.filter(function(s){ return s.status !== 'in_progress'; }).length;
        var abandon = S.filter(function(s){ return s.status === 'abandoned'; }).length;
        var reussi  = S.filter(function(s){ return s.status === 'completed'
                                                 && (s.score_pct != null && s.score_pct >= 70); }).length;

        /* L'entonnoir par phase demande la trace fine : on ne va la chercher que
           pour les séances de la fenêtre, et seulement si elles existent. */
        var idsFlight = S.filter(function(s){ return s.kind !== 'spelling'; })
                         .map(function(s){ return s.id; }).slice(0, 400);
        var pEntonnoir = idsFlight.length
          ? lignes(c.from('session_steps').select('session_id,phase,idx,answered')
                    .in('session_id', idsFlight))
              .catch(function(){ return []; })
          : Promise.resolve([]);

        return pEntonnoir.then(function(steps){
          /* UN ENTONNOIR SUIT L'ORDRE DU VOL, pas l'ordre des volumes. Trier par
             nombre de passages produit une figure qui A L'AIR d'un entonnoir et
             ne veut rien dire — « mise en route » après « changement de
             fréquence » ne décrit aucun déroulé. On classe donc les phases par
             leur rang moyen dans les échanges.

             Et on compte des SÉANCES, pas des échanges : une phase peut revenir
             plusieurs fois dans un même vol (on change de fréquence plus d'une
             fois), et la compter deux fois gonflerait une marche sans que
             personne de plus y soit passé. « Atteinte » = la séance a un
             échange dans cette phase ; « franchie » = elle en a répondu au
             moins un. */
          var parPhase = {};
          steps.forEach(function(st){
            var nom = st.phase || '—';
            var p = parPhase[nom] || (parPhase[nom] =
              { phase:nom, vues:{}, faites:{}, sommeIdx:0, n:0 });
            p.vues[st.session_id] = 1;
            if (st.answered) p.faites[st.session_id] = 1;
            p.sommeIdx += (st.idx || 0); p.n++;
          });
          var dropoff = Object.keys(parPhase).map(function(nom){
            var p = parPhase[nom];
            return { phase:nom,
                     started:Object.keys(p.vues).length,
                     completed:Object.keys(p.faites).length,
                     rang:p.sommeIdx / Math.max(1, p.n) };
          }).sort(function(a, b){ return a.rang - b.rang; }).slice(0, 12)
            .map(function(d){ delete d.rang; return d; });

          return {
            range:{ from:f.fromISO, to:f.toISO },
            activeUsers:jours.map(function(d){ return { d:d, n:Object.keys(actifsJour[d]).length }; }),
            sessionsPerDay:jours.map(function(d){ return parJour[d]; }),
            totals:{
              sessions:S.length,
              flights:S.filter(function(s){ return s.kind === 'flight'; }).length,
              scenarios:S.filter(function(s){ return s.kind === 'scenario'; }).length,
              spellings:S.filter(function(s){ return s.kind === 'spelling'; }).length,
              users:Object.keys(users).length,
              avgDurationS:nD ? Math.round(sommeD / nD) : null,
              avgPct:tot ? U.pct(ok, tot) : null,
              successRate:termine ? Math.round(reussi / termine * 100) : null,
              abandonRate:termine ? Math.round(abandon / termine * 100) : null
            },
            topExercises:top(parEx, function(k, a){
              return { key:k, title:titreExercice(k) || k, runs:a.runs,
                       avgPct:a.tot ? U.pct(a.ok, a.tot) : null, n:a.runs }; }, 10),
            topAircraft:top(parAvion, function(k, n){ return { name:k, n:n }; }),
            topAirfields:top(parTerrain, function(k, n){
              return { icao:k, name:nomAerodrome(k), n:n }; }),
            topAleas:top(parAlea, function(k, n){
              return { key:k, label:RT.labels.alea[k] || k, n:n }; }),
            topMissed:top(parLabel, function(k, n){
              return { label:k, axis:RT.taxonomy.axisOf(k), n:n }; }, 12),
            dropoff:dropoff.length ? dropoff : null,
            notes:notesPlafond().concat(
              idsFlight.length >= 400
                ? ["L'entonnoir par phase ne porte que sur les 400 séances les plus "
                 + "récentes de la fenêtre."] : [])
          };
        });
      });
    },

    /* ---- Catalogue ---------------------------------------------------------
       Le catalogue en base porte les métadonnées de pilotage ; le DÉROULÉ des
       scénarios reste dans le code (ADMIN.md § 10). On affiche donc l'union :
       ce que la base connaît, enrichi de ce que le code seul sait (nombre de
       tours, station), et on marque la provenance de chaque ligne. */
    exercises:function(opts){
      opts = opts || {};
      var c = connecte();
      return Promise.all([
        lignes(c.from('exercises').select('*').order('sort_order')),
        plafonne(c.from('sessions').select('exercise_key,score_ok,score_total,score_pct')
                  .not('exercise_key', 'is', null).limit(PLAFOND))
      ]).then(function(r){
        var cat = r[0], S = r[1];
        catalogue = {}; cat.forEach(function(e){ catalogue[e.key] = e; });

        var stats = {};
        S.forEach(function(s){
          var a = stats[s.exercise_key] || (stats[s.exercise_key] = { runs:0, ok:0, tot:0, fail:0 });
          a.runs++; a.ok += s.score_ok || 0; a.tot += s.score_total || 0;
          if (s.score_pct != null && s.score_pct < 50) a.fail++;
        });

        var SC = (typeof SCENARIOS !== 'undefined') ? SCENARIOS : [];
        function duCode(cle){ return SC.filter(function(x){ return x.id === cle; })[0] || null; }

        var rows = cat.map(function(e){
          var a = stats[e.key] || { runs:0, ok:0, tot:0, fail:0 };
          var code = duCode(e.key);
          return {
            key:e.key, title:e.title,
            category:e.category || null, level:e.level || null,
            station:e.station || (code && code.station) || '—',
            manualRef:e.manual_ref || null,
            isActive:e.is_active !== false,
            turns:code ? (code.tours || []).length : null,
            dynamic:code ? !(code.tours || []).length : null,
            runs:a.runs, avgPct:a.tot ? U.pct(a.ok, a.tot) : null,
            failRate:a.runs ? Math.round(a.fail / a.runs * 100) : null,
            source:'db', notes:e.notes || null, updatedAt:e.updated_at || null
          };
        });
        /* Un scénario présent dans le code mais absent du catalogue est une
           vraie anomalie de configuration : on le montre plutôt que de le
           taire, marqué « code », pour qu'on pense à l'ajouter en base. */
        SC.forEach(function(sc){
          if (catalogue[sc.id]) return;
          var a = stats[sc.id] || { runs:0, ok:0, tot:0, fail:0 };
          rows.push({ key:sc.id, title:sc.titre, category:null, level:null,
            station:sc.station || '—', manualRef:null, isActive:true,
            turns:(sc.tours || []).length, dynamic:!(sc.tours || []).length,
            runs:a.runs, avgPct:a.tot ? U.pct(a.ok, a.tot) : null,
            failRate:a.runs ? Math.round(a.fail / a.runs * 100) : null,
            source:'code',
            notes:"Absent du catalogue en base : ajoutez-le dans `exercises` pour "
                + "pouvoir le piloter (ordre, niveau, référence au manuel)." });
        });

        if (opts.q) rows = rows.filter(function(x){
          return U.correspond(opts.q, [x.key, x.title, x.station, x.category].filter(Boolean)); });
        if (opts.category && opts.category !== 'all')
          rows = rows.filter(function(x){ return x.category === opts.category; });
        if (opts.level && opts.level !== 'all')
          rows = rows.filter(function(x){ return x.level === opts.level; });
        if (opts.status === 'active')   rows = rows.filter(function(x){ return x.isActive; });
        if (opts.status === 'inactive') rows = rows.filter(function(x){ return !x.isActive; });
        return rows;
      });
    },

    /* ---- Erreurs ----------------------------------------------------------- */
    errors:function(opts){
      opts = opts || {};
      var c = connecte();
      var page = Math.max(1, opts.page || 1), par = opts.perPage || 25;
      var q = c.from('app_errors').select('*', { count:'exact' });
      if (opts.level && opts.level !== 'all') q = q.eq('level', opts.level);
      if (opts.kind  && opts.kind  !== 'all') q = q.eq('kind', opts.kind);
      if (opts.q){
        var m = String(opts.q).replace(/[%,()]/g, ' ').trim();
        if (m) q = q.ilike('message', '%' + m + '%');
      }
      q = q.order('occurred_at', { ascending:false }).range((page-1)*par, page*par - 1);

      return ex(q).then(function(r){
        var rows = r.data || [];
        return noms(rows.map(function(e){ return e.user_id; })).then(function(mn){
          return { rows:rows.map(function(e){ return enErreur(e, mn); }), total:r.count || rows.length };
        });
      });
    },

    error:function(id){
      var c = connecte();
      return ex(c.from('app_errors').select('*').eq('id', id).maybeSingle())
        .then(function(r){
          if (!r.data) return null;
          return noms([r.data.user_id]).then(function(mn){ return enErreur(r.data, mn); });
        });
    }
  };

  /* --------------------------------------------------------------------------
     Deux traductions de plus, sorties du corps pour ne pas l'alourdir.
     ----------------------------------------------------------------------- */
  function enProfil(p, prog){
    prog = prog || {};
    var seances = prog.sessions || 0;
    var moy = (prog.avg_pct != null) ? prog.avg_pct : null;
    return {
      id:p.id,
      name:p.display_name || p.email || p.id.slice(0,8),
      email:p.email || null,
      role:p.role || 'user',
      status:p.status || 'active',
      plan:p.plan || null,
      callsign:p.callsign || null,
      homeIcao:null, aircraft:null,
      createdAt:p.created_at || null,
      /* La vue connaît la dernière séance ; `profiles.last_seen_at` n'est
         écrite par personne aujourd'hui. On prend la mesure qui existe, et on
         retombe sur l'autre si la vue n'a rien (compte sans aucune séance). */
      lastSeenAt:prog.last_seen_at || p.last_seen_at || null,
      sessions:seances,
      flights:prog.flights || 0,
      avgPct:moy,
      trainingS:prog.training_s != null ? prog.training_s : null,
      /* Une jauge de progression n'est pas une note : elle mêle l'assiduité
         (jusqu'à trente séances) et la réussite. Même formule que sur la
         source locale, pour que la même personne ait la même barre partout. */
      progressPct:seances ? Math.min(100, Math.round(
        Math.min(1, seances / 30) * 60 + (moy || 0) * 0.4)) : 0,
      settings:p.settings || {},
      notes:null
    };
  }

  function enErreur(e, mn){
    return {
      id:e.id, at:e.occurred_at,
      level:e.level || 'error', kind:e.kind || 'js',
      message:e.message || '',
      stack:e.stack || null,
      userId:e.user_id || null,
      userName:e.user_id ? ((mn && mn[e.user_id]) || e.user_id.slice(0,8)) : null,
      sessionId:e.session_id || null, sessionLabel:null,
      url:e.url || '', userAgent:e.user_agent || '',
      appVersion:e.app_version || null,
      resolved:!!e.resolved_at, count:1,
      context:e.context || {}
    };
  }

  RT.data.register(src);
})();
