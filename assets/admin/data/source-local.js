/* =============================================================================
   RadioTrainer — Admin · SOURCE « CET APPAREIL »
   -----------------------------------------------------------------------------
   Ces données sont RÉELLES. Elles viennent du localStorage de ce navigateur —
   les vols et les sessions de la personne qui utilise l'application ici. Rien
   n'est inventé, rien n'est envoyé ailleurs.

   Cette source a deux raisons d'être :
     1. Voir la console fonctionner sur de vraies données, dès aujourd'hui.
     2. Servir de banc d'essai permanent au contrat : si une méthode ne peut pas
        être servie honnêtement à partir des vraies données, elle renvoie `null`
        et l'interface écrit « — » plutôt qu'un chiffre inventé.

   Ce que le stockage local NE contient PAS (et que l'interface signale) :
     · la durée des séances — elle n'est pas mesurée aujourd'hui ;
     · plusieurs utilisateurs — un appareil, un historique ;
     · la trace fine des scénarios — seuls les vols gardent leurs échanges
       (`rt-vols[].lignes[]`) ; les scénarios ne gardent que le score et les
       éléments manqués.
   Ces manques sont exactement ce que Supabase viendra combler. Les voir en
   creux ici, c'est la meilleure spécification possible du schéma à créer.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin; if (!RT || !RT.data) return;
  var U = RT.util;

  var K_SCEN = 'radiotrainer_history_v2';
  var K_VOLS = 'rt-vols';
  var K_ENC  = 'rt-vol-en-cours';
  var K_JOUR = 'rt-jours';
  var K_SET  = 'rt-settings';

  function lu(cle, def){
    try { var v = JSON.parse(localStorage.getItem(cle)); return v == null ? def : v; }
    catch(e){ return def; }
  }

  var UID = 'local';

  function reglages(){ return lu(K_SET, {}) || {}; }

  function nomAerodrome(icao){
    if (!icao || typeof AERODROMES === 'undefined') return '';
    var a = AERODROMES.filter(function(x){ return x.icao === icao; })[0];
    return a ? a.nom : '';
  }
  function titreScenario(idx){
    if (typeof idx !== 'number' || typeof SCENARIOS === 'undefined') return null;
    return SCENARIOS[idx] ? SCENARIOS[idx].titre : null;
  }
  function cleScenario(idx, titre){
    if (typeof SCENARIOS === 'undefined') return null;
    if (typeof idx === 'number' && SCENARIOS[idx]) return SCENARIOS[idx].id;
    var s = SCENARIOS.filter(function(x){ return x.titre === titre; })[0];
    return s ? s.id : null;
  }
  /* Le libellé d'aléa est stocké en clair dans rt-vols (« panne moteur
     (MAYDAY) ») : on remonte à la clé pour pouvoir filtrer et agréger. */
  function cleAlea(libelle){
    if (!libelle) return null;
    var L = RT.labels.alea;
    for (var k in L) if (L.hasOwnProperty(k) && U.normaliser(L[k]) === U.normaliser(libelle)) return k;
    var n = U.normaliser(libelle);
    if (/moteur/.test(n)) return 'moteur';
    if (/fumee/.test(n)) return 'fumee';
    if (/malade|malaise/.test(n)) return 'malaise';
    if (/cap/.test(n)) return 'cap';
    if (/radio/.test(n)) return 'radio';
    if (/ferme|deroute/.test(n)) return 'ferme';
    return null;
  }

  /* --- Normalisation : les deux historiques deviennent des SessionRow ---------- */
  function sessionsScenarios(){
    return (lu(K_SCEN, []) || []).map(function(e, i){
      var ok = e.found || 0, tot = e.total || 0;
      return {
        id:'ls_' + i, userId:UID, userName:'Cet appareil',
        kind:'scenario', at:e.date,
        title:e.scenario || titreScenario(e.scIdx) || 'Scénario',
        exerciseKey:cleScenario(e.scIdx, e.scenario),
        dep:e.terrain || null, depName:nomAerodrome(e.terrain), arr:null, arrName:null,
        diverted:null, runway:e.piste || null, aircraft:null, cruiseAlt:null, pax:null,
        level:e.mode || null, mode:null,
        /* Mesurées depuis que les scénarios horodatent leur début et gardent
           leur trace, comme les vols. Les sessions enregistrées AVANT n'ont ni
           l'un ni l'autre : elles restent à null, et la console affiche « — »
           plutôt qu'un zéro qui passerait pour une session instantanée. */
        durationS:(e.duree != null ? Number(e.duree) : null),
        scoreOk:ok, scoreTotal:tot, scorePct:U.pct(ok, tot),
        status:'completed',                   // seules les sessions terminées sont écrites
        alea:null, missed:e.missed || [],
        steps:(e.lignes && e.lignes.length) ? e.lignes.map(function(l, k){
          return { idx:k, phase:l.ph || null, station:l.stn || null,
                   freq:l.freq != null ? String(l.freq) : null,
                   expected:l.attendu || '', said:l.dit || '',
                   answered:!!l.repondu, missed:l.manquants || [],
                   scoreOk:l.ok || 0, scoreTotal:l.total || 0 };
        }) : null
      };
    });
  }

  function sessionsVols(){
    return (lu(K_VOLS, []) || []).map(function(e, i){
      var lignes = e.lignes || [];
      return {
        id:'lv_' + i, userId:UID, userName:'Cet appareil',
        kind:'flight', at:e.date,
        title:e.titre || ((e.dep || '') + (e.arr ? ' → ' + e.arr : '')),
        exerciseKey:null,
        dep:e.dep || null, depName:nomAerodrome(e.dep),
        arr:e.arr || null, arrName:nomAerodrome(e.arr),
        diverted:null,
        runway:null, aircraft:e.avion || e.acftNom || null,
        cruiseAlt:e.alt || null, pax:e.pax != null ? e.pax : null,
        level:e.level || null, mode:e.mode || null,
        /* Mesurée depuis que le vol horodate son départ. Les vols enregistrés
           AVANT n'ont pas ce champ : ils restent à null, et la console affiche
           « — » plutôt qu'un zéro qui passerait pour un vol instantané. */
        durationS:(e.duree != null ? Number(e.duree) : null),
        scoreOk:e.ok || 0, scoreTotal:e.total || 0,
        scorePct:e.pct != null ? e.pct : U.pct(e.ok || 0, e.total || 0),
        /* Un vol enregistré est un vol allé au bout du débriefing. Un vol
           réellement abandonné n'est pas écrit dans rt-vols : il ne reste que
           dans rt-vol-en-cours, exposé séparément. */
        status:'completed',
        alea:cleAlea(e.alea), aleaLabel:e.alea || null,
        missed:lignes.reduce(function(acc, l){
          return acc.concat(l.manquants || []); }, []),
        steps:lignes.map(function(l, j){
          return { idx:j + 1, phase:l.ph || '', station:l.stn || '', freq:l.freq || '',
                   expected:l.attendu || '', said:l.dit || '', answered:!!l.repondu,
                   missed:l.manquants || [] };
        })
      };
    });
  }

  var cache = null;
  function toutes(){
    /* Pas de mémorisation durable : l'utilisateur peut terminer un vol puis
       revenir sur la console. On ne garde le calcul que le temps d'un rendu. */
    if (cache && Date.now() - cache.t < 1500) return cache.v;
    var v = sessionsScenarios().concat(sessionsVols())
      .filter(function(s){ return s.at; })
      .sort(function(a,b){ return a.at < b.at ? 1 : -1; });
    cache = { t:Date.now(), v:v };
    return v;
  }

  function volEnCours(){
    var v = lu(K_ENC, null);
    if (!v || !v.dep) return null;
    return {
      id:'lv_encours', userId:UID, userName:'Cet appareil', kind:'flight',
      at:v.date || new Date().toISOString(),
      title:(v.dep || '') + (v.arr ? ' → ' + v.arr : ' — vol local'),
      exerciseKey:null, dep:v.dep, depName:nomAerodrome(v.dep),
      arr:v.arr || null, arrName:nomAerodrome(v.arr), diverted:null,
      runway:v.rwy ? v.rwy.id : null, aircraft:v.acft || null,
      cruiseAlt:v.altCruise || null, pax:v.pax != null ? Number(v.pax) : null,
      level:v.level || null, mode:v.mode || null, durationS:null,
      scoreOk:null, scoreTotal:null, scorePct:null,
      status:'in_progress', alea:null, missed:[],
      steps:null, stepIndex:(v.i || 0) + 1
    };
  }

  function profil(){
    var S = toutes(), R = reglages();
    var ok = 0, tot = 0, jours = {};
    S.forEach(function(s){ ok += s.scoreOk || 0; tot += s.scoreTotal || 0; jours[s.at.slice(0,10)] = 1; });
    var jrs = lu(K_JOUR, []) || [];
    var dates = S.map(function(s){ return s.at; }).sort();
    return {
      id:UID,
      name:'Cet appareil',
      email:null,
      role:'user',
      status:'active',
      plan:null,
      callsign:R.call || 'F-ABCD',
      homeIcao:S.length ? (S[S.length - 1].dep || null) : null,
      aircraft:(S.filter(function(s){ return s.aircraft; })[0] || {}).aircraft || null,
      createdAt:dates.length ? dates[0] : null,
      lastSeenAt:dates.length ? dates[dates.length - 1] : null,
      sessions:S.length,
      flights:S.filter(function(s){ return s.kind === 'flight'; }).length,
      avgPct:tot ? U.pct(ok, tot) : null,
      trainingS:null,
      days:Math.max(Object.keys(jours).length, jrs.length),
      progressPct:S.length ? Math.min(100, Math.round(
        Math.min(1, S.length / 30) * 60 + (tot ? U.pct(ok, tot) : 0) * 0.4)) : 0,
      settings:R,
      notes:"Profil déduit du stockage local : un seul historique, pas de compte."
    };
  }

  function fenetre(opts){
    opts = opts || {};
    var to = opts.to ? new Date(opts.to) : new Date();
    var from = opts.from ? new Date(opts.from) : U.ilYaJours(opts.days || 30);
    return { from:from, to:to };
  }
  function dedans(iso, f){
    var t = new Date(iso).getTime();
    return t >= f.from.getTime() && t <= f.to.getTime();
  }

  function erreursLocales(){
    var brut = (RT.readErrors ? RT.readErrors() : []) || [];
    return brut.map(function(e){
      return {
        id:e.id, at:e.at, level:e.level || 'error', kind:e.kind || 'js',
        message:e.message + (e.count > 1 ? '  (× ' + e.count + ')' : ''),
        stack:e.stack || (e.detail ? 'Dernière occurrence : ' + e.detail : null),
        userId:UID, userName:'Cet appareil',
        sessionId:null, sessionLabel:null,
        url:e.url || '', userAgent:e.userAgent || navigator.userAgent,
        appVersion:null, resolved:!!e.resolved, count:e.count || 1,
        context:{}
      };
    });
  }

  var src = {
    id:'local',
    label:'Cet appareil',
    fictional:false,
    available:function(){ return true; },
    unavailableReason:function(){ return ''; },

    capabilities:function(){
      return { read:true, write:false, realtime:false, users:false, errors:true, analytics:true,
               note:"Données réelles de ce navigateur. Un seul historique, pas de comptes : "
                  + "les vues « utilisateurs » n'ont qu'une ligne, et les durées de séance "
                  + "ne sont pas mesurées aujourd'hui (elles s'afficheront en « — »)." };
    },

    overview:function(opts){
      var S = toutes(), f = fenetre(opts);
      var dans = S.filter(function(s){ return dedans(s.at, f); });
      var ok = 0, tot = 0;
      dans.forEach(function(s){ ok += s.scoreOk || 0; tot += s.scoreTotal || 0; });
      var enc = volEnCours();
      var p = profil();
      return {
        range:{ from:f.from.toISOString(), to:f.to.toISOString() },
        users:{ total:S.length ? 1 : 0, new:null, active:dans.length ? 1 : 0 },
        sessions:{ total:dans.length, completed:dans.length, abandoned:null,
                   avgDurationS:null, inProgress:enc ? 1 : 0 },
        /* « Terminées » au sens du contrat : les séances menées à leur terme, tous
           types confondus. Le stockage local n'écrit que celles-là, d'où l'égalité
           avec le total — et non le nombre de scénarios, qui répondrait à une
           autre question que celle posée par la tuile. */
        exercises:{ completed:dans.length,
                    scenarios:dans.filter(function(s){ return s.kind === 'scenario'; }).length },
        score:{ avgPct:tot ? U.pct(ok, tot) : null },
        deltas:{ users:null, active:null, sessions:null, score:null },
        notes:[
          "Un seul historique : celui de ce navigateur.",
          "La durée des séances n'est pas enregistrée aujourd'hui.",
          p.days ? (p.days + ' journée' + (p.days > 1 ? 's' : '') + ' de pratique enregistrée'
                    + (p.days > 1 ? 's' : '') + '.') : null
        ].filter(Boolean)
      };
    },

    activity:function(opts){
      var n = (opts && opts.limit) || 12;
      var out = [];
      var enc = volEnCours();
      if (enc) out.push({ id:enc.id, at:enc.at, userId:UID, userName:'Cet appareil',
        kind:'flight', label:enc.title, detail:'échange ' + enc.stepIndex + ' — vol interrompu',
        scorePct:null, status:'in_progress', level:enc.level });
      toutes().slice(0, n).forEach(function(s){
        out.push({ id:s.id, at:s.at, userId:UID, userName:'Cet appareil', kind:s.kind,
          label:s.title,
          detail:(s.kind === 'flight'
                    ? (s.aircraft || '') + (s.aleaLabel ? ' · ' + s.aleaLabel : '')
                    : (s.dep || '') + (s.runway ? ' · piste ' + s.runway : '')),
          scorePct:s.scorePct, status:s.status, level:s.level });
      });
      return out.slice(0, n);
    },

    alerts:function(){
      var out = [], S = toutes();
      var errs = erreursLocales().filter(function(e){
        return e.level === 'error' && !e.resolved
            && Date.now() - new Date(e.at).getTime() < 7 * 86400000; });
      if (errs.length)
        out.push({ id:'la_err', at:errs[0].at, level:'error', kind:'technique',
          title:errs.length + ' erreur' + (errs.length>1?'s':'') + ' captée' + (errs.length>1?'s':'') + ' sur cet appareil (7 j)',
          detail:errs[0].message, route:'admin/errors' });

      var enc = volEnCours();
      if (enc)
        out.push({ id:'la_enc', at:enc.at, level:'info', kind:'usage',
          title:'Un vol est resté en cours', detail:enc.title + ' — échange ' + enc.stepIndex + '.',
          route:'admin/flights' });

      /* Éléments manqués récurrents : la seule alerte pédagogique que les
         données locales permettent d'établir honnêtement. */
      var freq = {};
      S.slice(0, 20).forEach(function(s){ (s.missed || []).forEach(function(l){ freq[l] = (freq[l]||0)+1; }); });
      var pire = Object.keys(freq).sort(function(a,b){ return freq[b]-freq[a]; })[0];
      if (pire && freq[pire] >= 3)
        out.push({ id:'la_faible', at:new Date().toISOString(), level:'warn', kind:'pedagogie',
          title:'Élément manqué à répétition : « ' + pire + ' »',
          detail:'Oublié ' + freq[pire] + ' fois sur les 20 dernières séances — axe '
                 + RT.taxonomy.labelOf(RT.taxonomy.axisOf(pire)) + '.',
          route:'admin/users/local' });

      if (!S.length)
        out.push({ id:'la_vide', at:new Date().toISOString(), level:'info', kind:'usage',
          title:'Aucune séance enregistrée sur cet appareil',
          detail:'Terminez un scénario ou un vol pour alimenter cette console.',
          route:'admin' });
      return out;
    },

    users:function(opts){
      opts = opts || {};
      var p = profil();
      var rows = (p.sessions || p.createdAt) ? [p] : [];
      rows = rows.filter(function(u){
        if (opts.status && opts.status !== 'all' && u.status !== opts.status) return false;
        if (opts.role && opts.role !== 'all' && u.role !== opts.role) return false;
        return U.correspond(opts.q, [u.name, u.callsign, u.homeIcao || '']);
      });
      return U.paginer(rows, opts.page, opts.perPage || 20);
    },

    user:function(id){ return (id === UID) ? profil() : null; },

    userSessions:function(id, opts){
      if (id !== UID) return [];
      var n = (opts && opts.limit) || 40;
      var enc = volEnCours();
      var base = toutes().slice(0, n);
      return enc ? [enc].concat(base) : base;
    },

    userWeaknesses:function(id){
      if (id !== UID) return [];
      var S = toutes();
      var parAxe = {};
      RT.taxonomy.axes.forEach(function(a){ parAxe[a.key] = { attempts:0, missed:0 }; });
      /* Les vols donnent la trace fine : on compte l'axe de CHAQUE élément
         attendu, pas une répartition au prorata. C'est un vrai décompte. */
      S.forEach(function(s){
        if (s.steps){
          s.steps.forEach(function(st){
            (st.missed || []).forEach(function(l){ parAxe[RT.taxonomy.axisOf(l)].missed++; });
          });
          /* Les éléments réussis ne sont pas conservés individuellement : on
             attribue les tentatives au prorata du score de l'échange. */
          var parts = Math.max(1, Math.round((s.scoreTotal || 0) / RT.taxonomy.axes.length));
          RT.taxonomy.axes.forEach(function(a){ parAxe[a.key].attempts += parts; });
        } else {
          var p2 = Math.max(1, Math.round((s.scoreTotal || 0) / RT.taxonomy.axes.length));
          RT.taxonomy.axes.forEach(function(a){ parAxe[a.key].attempts += p2; });
          (s.missed || []).forEach(function(l){ parAxe[RT.taxonomy.axisOf(l)].missed++; });
        }
      });
      return RT.taxonomy.axes.map(function(a){
        var v = parAxe[a.key];
        return { axis:a.key, label:a.label, desc:a.desc, attempts:v.attempts, missed:v.missed,
                 pct:v.attempts ? Math.max(0, 100 - Math.round(v.missed / v.attempts * 100)) : null };
      });
    },

    flights:function(opts){
      opts = opts || {};
      var enc = volEnCours();
      var rows = toutes().filter(function(s){ return s.kind === 'flight'; });
      if (enc) rows = [enc].concat(rows);
      rows = rows.filter(function(s){
        if (opts.status && opts.status !== 'all' && s.status !== opts.status) return false;
        if (opts.level  && opts.level  !== 'all' && s.level  !== opts.level)  return false;
        if (opts.alea === 'with' && !s.alea) return false;
        if (opts.alea === 'none' && s.alea) return false;
        if (opts.alea && ['all','with','none'].indexOf(opts.alea) < 0 && s.alea !== opts.alea) return false;
        return U.correspond(opts.q, [s.title, s.dep || '', s.arr || '', s.aircraft || '',
                                     s.aleaLabel || '']);
      });
      rows = U.trier(rows, opts.sort || 'at', opts.dir || 'desc');
      return U.paginer(rows, opts.page, opts.perPage || 20);
    },

    flight:function(id){
      var enc = volEnCours();
      if (enc && id === enc.id) return enc;
      return toutes().filter(function(s){ return s.id === id; })[0] || null;
    },

    analytics:function(opts){
      var f = fenetre(opts), S = toutes().filter(function(s){ return dedans(s.at, f); });
      var jours = U.joursEntre(f.from, f.to);
      var parJour = {};
      jours.forEach(function(d){ parJour[d] = { d:d, scenario:0, flight:0, spelling:0, actif:0 }; });
      var ok = 0, tot = 0, ex = {}, ac = {}, ad = {}, al = {}, mi = {};
      S.forEach(function(s){
        var d = s.at.slice(0,10);
        if (parJour[d]) { parJour[d][s.kind]++; parJour[d].actif = 1; }
        ok += s.scoreOk || 0; tot += s.scoreTotal || 0;
        if (s.exerciseKey) { var a = ex[s.exerciseKey] || (ex[s.exerciseKey] = { runs:0, ok:0, tot:0 });
                             a.runs++; a.ok += s.scoreOk||0; a.tot += s.scoreTotal||0; }
        if (s.aircraft) ac[s.aircraft] = (ac[s.aircraft] || 0) + 1;
        if (s.dep) ad[s.dep] = (ad[s.dep] || 0) + 1;
        if (s.arr) ad[s.arr] = (ad[s.arr] || 0) + 1;
        if (s.alea) al[s.alea] = (al[s.alea] || 0) + 1;
        (s.missed || []).forEach(function(l){ mi[l] = (mi[l] || 0) + 1; });
      });
      function top(obj, mapper, n){
        return Object.keys(obj).map(mapper).sort(function(a,b){ return b.n - a.n; }).slice(0, n || 8);
      }
      var titres = {};
      if (typeof SCENARIOS !== 'undefined') SCENARIOS.forEach(function(s){ titres[s.id] = s.titre; });
      return {
        range:{ from:f.from.toISOString(), to:f.to.toISOString() },
        activeUsers:jours.map(function(d){ return { d:d, n:parJour[d].actif }; }),
        sessionsPerDay:jours.map(function(d){
          return { d:d, scenario:parJour[d].scenario, flight:parJour[d].flight,
                   spelling:parJour[d].spelling }; }),
        totals:{
          sessions:S.length,
          flights:S.filter(function(s){ return s.kind === 'flight'; }).length,
          scenarios:S.filter(function(s){ return s.kind === 'scenario'; }).length,
          users:S.length ? 1 : 0,
          avgDurationS:null,
          avgPct:tot ? U.pct(ok, tot) : null,
          successRate:S.length
            ? Math.round(S.filter(function(s){ return (s.scorePct||0) >= 80; }).length / S.length * 100) : null,
          abandonRate:null
        },
        topExercises:Object.keys(ex).map(function(k){
          return { key:k, title:titres[k] || k, n:ex[k].runs, runs:ex[k].runs,
                   avgPct:U.pct(ex[k].ok, ex[k].tot) }; })
          .sort(function(a,b){ return b.n - a.n; }),
        topAircraft:top(ac, function(k){ return { name:k, n:ac[k] }; }),
        topAirfields:top(ad, function(k){ return { icao:k, name:nomAerodrome(k), n:ad[k] }; }, 10),
        topAleas:top(al, function(k){ return { key:k, label:RT.labels.alea[k] || k, n:al[k] }; }),
        topMissed:top(mi, function(k){ return { label:k, axis:RT.taxonomy.axisOf(k), n:mi[k] }; }, 12),
        dropoff:null,
        notes:["Les abandons et les durées ne sont pas enregistrés localement : "
             + "ces indicateurs restent vides tant que le suivi serveur n'est pas en place."]
      };
    },

    exercises:function(opts){
      opts = opts || {};
      var S = toutes(), stats = {};
      S.forEach(function(s){
        if (!s.exerciseKey) return;
        var a = stats[s.exerciseKey] || (stats[s.exerciseKey] = { runs:0, ok:0, tot:0, fail:0 });
        a.runs++; a.ok += s.scoreOk||0; a.tot += s.scoreTotal||0;
        if ((s.scorePct||0) < 50) a.fail++;
      });
      var SC = (typeof SCENARIOS !== 'undefined') ? SCENARIOS : [];
      var rows = SC.map(function(sc, i){
        var a = stats[sc.id] || { runs:0, ok:0, tot:0, fail:0 };
        return { key:sc.id, title:sc.titre,
                 category: sc.isCircuit ? 'Circuit' : (sc.defaultTerrain === 'arr' ? 'Arrivée' : 'Départ'),
                 level: sc.alea ? 'reel' : 'debutant',
                 station:sc.station || '—', turns:(sc.tours || []).length,
                 dynamic:!(sc.tours || []).length,
                 branching:(sc.tours || []).some(function(t){ return t.type === 'choice'; }),
                 controllable:!!sc.controllable, alea:!!sc.alea,
                 isActive:true, sortOrder:i + 1,
                 runs:a.runs, avgPct:a.tot ? U.pct(a.ok, a.tot) : null,
                 failRate:a.runs ? Math.round(a.fail / a.runs * 100) : null,
                 abandonRate:null, source:'code' };
      });
      return rows.filter(function(x){
        if (opts.category && opts.category !== 'all' && x.category !== opts.category) return false;
        if (opts.level && opts.level !== 'all' && x.level !== opts.level) return false;
        if (opts.status === 'inactive') return false;
        return U.correspond(opts.q, [x.title, x.key, x.category, x.station]);
      });
    },

    errors:function(opts){
      opts = opts || {};
      var rows = erreursLocales().filter(function(e){
        if (opts.level && opts.level !== 'all' && e.level !== opts.level) return false;
        if (opts.kind  && opts.kind  !== 'all' && e.kind  !== opts.kind)  return false;
        if (opts.resolved === 'open' && e.resolved) return false;
        if (opts.resolved === 'done' && !e.resolved) return false;
        return U.correspond(opts.q, [e.message, e.kind, e.url, e.userAgent]);
      });
      rows = U.trier(rows, opts.sort || 'at', opts.dir || 'desc');
      return U.paginer(rows, opts.page, opts.perPage || 25);
    },

    error:function(id){
      return erreursLocales().filter(function(e){ return e.id === id; })[0] || null;
    }
  };

  RT.data.register(src);
})();
