/* =============================================================================
   RadioTrainer — Admin · SOURCE « DÉMONSTRATION »
   -----------------------------------------------------------------------------
   ⚠️  TOUTES LES DONNÉES DE CE FICHIER SONT FICTIVES.
   Aucune personne, aucun vol, aucune erreur listée ici n'a jamais existé. Le
   drapeau `fictional:true` fait apparaître la mention « fictif » partout dans
   l'interface : rien n'est présenté comme réel.

   Pourquoi ce fichier existe : dessiner et éprouver la console avant que Supabase
   ne soit branché. Il est ENTIÈREMENT jetable — supprimez-le, retirez sa balise
   <script> d'index.html, et l'Admin bascule sur les autres sources sans qu'une
   seule ligne de page ne change.

   Deux partis pris qui font la différence à l'usage :
     · Tirage DÉTERMINISTE (générateur à graine fixe) : les mêmes chiffres à
       chaque rechargement. Une interface dont les nombres dansent est intestable.
     · Les référentiels sont les VRAIS : AERODROMES, SCENARIOS, NAV_AVIONS et les
       libellés de `motsCles` d'index.html. Ce sont donc de vrais codes OACI, de
       vrais titres de scénarios, de vrais éléments de phraséologie — seuls les
       gens et leurs résultats sont inventés.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin; if (!RT || !RT.data) return;
  var U = RT.util;

  /* ---------- Générateur pseudo-aléatoire à graine (LCG « Numerical Recipes ») ---- */
  function rng(graine){
    var s = graine >>> 0;
    function suivant(){ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }
    return {
      f:suivant,
      i:function(min, max){ return min + Math.floor(suivant() * (max - min + 1)); },
      pick:function(arr){ return arr[Math.floor(suivant() * arr.length)]; },
      chance:function(p){ return suivant() < p; },
      /* Loi normale tronquée : les scores réels se massent autour d'une moyenne,
         un tirage uniforme donnerait un histogramme plat invraisemblable. */
      gauss:function(mu, sigma, min, max){
        var u1 = Math.max(1e-9, suivant()), u2 = suivant();
        var z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return Math.max(min, Math.min(max, Math.round(mu + z * sigma)));
      }
    };
  }

  /* ---------- Référentiels : les vrais, lus dans index.html ---------------------- */
  function refAerodromes(){
    if (typeof AERODROMES === 'undefined') return [{ icao:'LFPT', nom:'Pontoise' }];
    /* Terrains « crédibles » pour un entraînement : on garde les codes LF?? à
       quatre lettres, ce qui écarte les plateformes privées numérotées. */
    var a = AERODROMES.filter(function(x){ return /^LF[A-Z]{2}$/.test(x.icao); });
    return a.length ? a : AERODROMES;
  }
  function refScenarios(){
    if (typeof SCENARIOS === 'undefined')
      return [{ id:'roulage', titre:'Mise en route + roulage' }];
    return SCENARIOS;
  }
  /* Les VRAIS types sélectionnables sont ceux du formulaire de Navigation (58
     entrées, de l'ULM au planeur), exposés par window.RT_TEST. NAV_AVIONS, lui,
     ne liste que les six photos détourées — s'en servir donnait des Boeing 777
     en vol VFR local, ce qui n'a rien à voir avec l'usage réel. */
  function refAvions(){
    var noms = [];
    try { if (window.RT_TEST && window.RT_TEST.avions) noms = window.RT_TEST.avions() || []; }
    catch(e){}
    if (!noms.length && typeof NAV_AVIONS !== 'undefined')
      noms = NAV_AVIONS.map(function(a){ return a.nom; });
    var vus = {}, out = [];
    noms.forEach(function(x){ if (x && !vus[x]) { vus[x] = 1; out.push(x); } });
    return out.length ? out : ['Cessna 152','Robin DR400-140B Major','Piper PA-28 161 Warrior'];
  }
  /* Un aéro-club, c'est 80 % de DR400, de Cessna monomoteurs et de PA-28 ; le
     reste se partage tout le catalogue. Un tirage uniforme sur 58 types
     donnerait autant de planeurs que de Cessna 152 — un classement « appareils
     les plus utilisés » n'y voudrait plus rien dire. */
  function avionPondere(r, tous){
    var courants = tous.filter(function(n){
      return /DR400|DR401|Cessna 15[02]|Cessna 172|PA-28|HR200|Aquila|Tecnam/i.test(n); });
    if (courants.length && r.chance(0.8)) return r.pick(courants);
    return r.pick(tous);
  }
  /* Éléments de phraséologie réellement attendus par l'application : on parcourt
     SCENARIOS et on ramasse les libellés de motsCles. Les « éléments manqués »
     du jeu de démonstration sont donc de vrais éléments, classables par la
     taxonomie exactement comme les vrais. */
  var _labels = null;
  function refLabels(){
    if (_labels) return _labels;
    var vus = {}, out = [];
    function visiter(tours){
      (tours || []).forEach(function(t){
        (t.motsCles || []).forEach(function(mc){
          if (mc && mc.label && !vus[mc.label]) { vus[mc.label] = 1; out.push(mc.label); }
        });
        if (t.afis) visiter([t.afis]);
      });
    }
    refScenarios().forEach(function(sc){ visiter(sc.tours); });
    /* Éléments propres au vol Navigation, absents de SCENARIOS. */
    ['Code assigné','Transpondeur','Transpondeur ident','Nouvelle fréquence',
     'Valeur de cap','Altitude','Position / distance','Nature du problème',
     'Personnes à bord','Urgence — PAN PAN','Panne radio / en aveugle']
      .forEach(function(l){ if (!vus[l]) { vus[l] = 1; out.push(l); } });
    _labels = out.length ? out : ['Votre indicatif','Numéro de piste','QNH'];
    return _labels;
  }

  var PHASES_VOL = ['Écoute ATIS','Mise en route','Collationnement roulage','Roulage',
    'Prêt au départ','Décollage','Montée initiale','Changement de fréquence',
    'Identification','Code transpondeur','Transit VFR','Information de trafic',
    'Intégration','Vent arrière','Finale','Piste dégagée','Roulage parking'];

  var PRENOMS = ['Alice','Nicolas','Camille','Thomas','Léa','Julien','Sarah','Mehdi',
    'Claire','Antoine','Émilie','Rémi','Chloé','Baptiste','Inès','Guillaume','Manon',
    'Pierre-Yves','Anaïs','Hugo','Margaux','Sofiane','Élodie','Vincent','Jeanne',
    'Maxime','Louise','Adrien','Noémie','Grégoire','Salomé','Étienne'];
  var NOMS = ['Berthier','Nguyen','Lambert','Fontaine','Marchand','Oliveira','Dubois',
    'Benali','Rousseau','Chevalier','Perrin','Da Silva','Moreau','Lefèvre','Garnier',
    'Kowalski','Barbier','Renaud','Aubert','Mercier','Vasseur','Charpentier','Leroy',
    'Dumas','Bonnet','Schmitt','Delaunay','Ferreira','Guillon','Maréchal'];
  var DOMAINES = ['exemple.fr','aeroclub-demo.fr','mail-fictif.fr','demo.test'];

  /* ---------- Construction du monde fictif (une seule fois) --------------------- */
  var monde = null;
  var GRAINE = 20260909;              // fixe : mêmes données à chaque chargement
  var JOURS  = 180;                   // profondeur d'historique

  function construire(){
    if (monde) return monde;
    var r = rng(GRAINE);
    var AD = refAerodromes(), SC = refScenarios(), AV = refAvions(), LB = refLabels();
    var maintenant = Date.now();
    var jour = 86400000;

    /* --- Utilisateurs --- */
    var users = [], utilises = {};
    var NB = 84;
    for (var i = 0; i < NB; i++){
      var prenom = r.pick(PRENOMS), nom = r.pick(NOMS);
      var base = (prenom + '.' + nom).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z.]/g,'');
      var mail = base + '@' + r.pick(DOMAINES);
      while (utilises[mail]) { base += r.i(2,9); mail = base + '@' + r.pick(DOMAINES); }
      utilises[mail] = 1;

      /* Ancienneté : beaucoup d'inscrits récents, quelques anciens — la forme
         normale d'une base qui grossit. Le +1 et le décalage horaire évitent que
         plusieurs inscriptions tombent à la milliseconde près, ce qui saute aux
         yeux dès qu'on trie par date. */
      var ageJours = 1 + Math.floor(Math.pow(r.f(), 1.7) * JOURS);
      var cree = maintenant - ageJours * jour + r.i(0, 22) * 3600000;

      /* Assiduité : trois profils bien séparés. Un tirage uniforme donnait une
         majorité de comptes quasi inactifs — vrai dans l'absolu, mais inutile
         pour éprouver une interface. */
      var profil = r.f();
      var assiduite = profil < 0.28 ? 0.05 + r.f() * 0.20      // occasionnels
                    : (profil < 0.76 ? 0.30 + r.f() * 0.35     // réguliers
                    : 0.65 + r.f() * 0.35);                    // assidus
      var statut = r.chance(0.045) ? 'suspended' : (r.chance(0.05) ? 'pending' : 'active');
      var role = i === 0 ? 'admin' : (i === 1 ? 'moderator' : 'user');

      users.push({
        id:'u_' + String(i + 1).padStart(3,'0'),
        name:prenom + ' ' + nom,
        email:mail,
        role:role,
        status:statut,
        plan:r.chance(0.18) ? 'pro' : 'free',
        callsign:'F-' + String.fromCharCode(71 + r.i(0,2)) + 
                 String.fromCharCode(65 + r.i(0,25)) + String.fromCharCode(65 + r.i(0,25)) +
                 String.fromCharCode(65 + r.i(0,25)),
        homeIcao:r.pick(AD).icao,
        aircraft:avionPondere(r, AV),
        createdAt:new Date(cree).toISOString(),
        _assiduite:assiduite,
        _ageJours:ageJours,
        _niveau: r.f()                             // aptitude : pilote la moyenne des scores
      });
    }

    /* --- Sessions --- */
    var sessions = [], nSess = 0;
    users.forEach(function(us){
      if (us.status === 'pending') { us.lastSeenAt = null; return; }
      /* Nombre de séances : proportionnel à l'ancienneté ET à l'assiduité. */
      var n = Math.round(us._ageJours * us._assiduite * 0.45 * (0.5 + r.f()));
      n = Math.min(n, 110);
      var dernier = 0;
      /* Progression : on démarre bas et on monte, d'autant plus vite que le
         « niveau » est élevé. C'est ce qui rend la courbe de progression lisible. */
      for (var k = 0; k < n; k++){
        var avance = k / Math.max(1, n - 1);
        var quand = maintenant - Math.round(
          (us._ageJours - avance * us._ageJours * (0.75 + 0.25 * r.f())) * jour)
          - r.i(0, 20) * 3600000;
        if (quand > maintenant) quand = maintenant - r.i(1,6) * 3600000;
        if (quand > dernier) dernier = quand;

        var kind = r.chance(0.46) ? 'flight' : (r.chance(0.12) ? 'spelling' : 'scenario');
        var abandon = r.chance(kind === 'flight' ? 0.13 : 0.07);
        var moyenne = 44 + us._niveau * 26 + avance * 22;    // 44 → 92 selon niveau/avancée
        var pct = r.gauss(moyenne, 13, 8, 100);
        var total = kind === 'spelling' ? r.i(8,20)
                  : kind === 'flight'   ? r.i(14,30) : r.i(4,12);
        var ok = Math.round(total * pct / 100);
        pct = U.pct(ok, total);

        var dep = r.pick(AD), arr = null, alt = null, deroute = null;
        var mode = 'voyage';
        if (kind === 'flight'){
          if (r.chance(0.22)) { mode = 'local'; }
          else { do { arr = r.pick(AD); } while (arr.icao === dep.icao); }
        } else if (r.chance(0.4)) {
          do { arr = r.pick(AD); } while (arr.icao === dep.icao);
        }

        var alea = null;
        if (kind === 'flight' && arr && r.chance(0.42)){
          alea = r.pick(['moteur','fumee','malaise','cap','radio','ferme']);
          if (alea === 'ferme'){ do { alt = r.pick(AD); } while (alt.icao === arr.icao); deroute = alt; }
        }

        var sc = r.pick(SC);
        var duree = kind === 'flight' ? r.i(420, 1500)
                  : kind === 'spelling' ? r.i(90, 300) : r.i(180, 620);
        if (abandon) duree = Math.round(duree * (0.15 + 0.5 * r.f()));

        /* Éléments manqués : tirés dans les vrais libellés, en nombre cohérent
           avec le score — un 95 % ne peut pas avoir six oublis. */
        var nbManques = Math.min(8, Math.max(0, Math.round((100 - pct) / 12)));
        var manques = [], vusM = {};
        for (var m = 0; m < nbManques; m++){
          var lb = r.pick(LB);
          if (!vusM[lb]) { vusM[lb] = 1; manques.push(lb); }
        }

        nSess++;
        var titre = kind === 'flight'
            ? (arr ? dep.icao + ' → ' + (deroute ? deroute.icao : arr.icao)
                   : dep.icao + ' — vol local')
            : (kind === 'spelling' ? 'Épellation radio' : sc.titre);

        sessions.push({
          id:'s_' + String(nSess).padStart(4,'0'),
          userId:us.id, userName:us.name,
          kind:kind,
          at:new Date(quand).toISOString(),
          title:titre,
          exerciseKey: kind === 'scenario' ? sc.id : (kind === 'spelling' ? 'epellation' : null),
          dep: kind === 'spelling' ? null : dep.icao,
          depName: kind === 'spelling' ? null : dep.nom,
          arr: arr ? arr.icao : null,
          arrName: arr ? arr.nom : null,
          diverted: deroute ? deroute.icao : null,
          runway: kind === 'spelling' ? null
                : (dep.pistes && dep.pistes[0] ? r.pick(dep.pistes[0].ids) : String(r.i(1,36)).padStart(2,'0')),
          aircraft: kind === 'spelling' ? null : us.aircraft,
          cruiseAlt: kind === 'flight' ? r.i(15, 55) * 100 : null,
          pax: kind === 'flight' ? r.i(0,3) : null,
          level: r.chance(0.35 + us._niveau * 0.3) ? 'reel' : 'debutant',
          mode: kind === 'flight' ? mode : null,
          durationS:duree,
          scoreOk:ok, scoreTotal:total, scorePct:pct,
          status: abandon ? 'abandoned' : 'completed',
          alea:alea,
          missed:manques,
          _seed: (GRAINE + nSess * 7919) >>> 0,
          _abandonAt: abandon ? r.f() : null   // fraction du déroulé au moment de l'abandon
        });
      }
      /* Sans séance, il n'y a pas de « dernière séance ». Y mettre la date
         d'inscription remonterait les comptes vides en tête du tri et ferait
         dire à la colonne autre chose que son titre. */
      us.lastSeenAt = dernier ? new Date(dernier).toISOString() : null;
    });

    sessions.sort(function(a,b){ return a.at < b.at ? 1 : -1; });

    /* --- Agrégats par utilisateur --- */
    var parUser = {};
    sessions.forEach(function(s){
      var a = parUser[s.userId] || (parUser[s.userId] = { n:0, flights:0, ok:0, total:0, secs:0, jours:{} });
      a.n++; if (s.kind === 'flight') a.flights++;
      a.ok += s.scoreOk; a.total += s.scoreTotal; a.secs += s.durationS;
      a.jours[s.at.slice(0,10)] = 1;
    });
    users.forEach(function(us){
      var a = parUser[us.id] || { n:0, flights:0, ok:0, total:0, secs:0, jours:{} };
      us.sessions = a.n; us.flights = a.flights;
      us.avgPct = a.total ? U.pct(a.ok, a.total) : null;
      us.trainingS = a.secs;
      us.days = Object.keys(a.jours).length;
      /* « Progression » : part du programme couverte — combien des scénarios du
         catalogue ont été travaillés au moins une fois, pondéré par la réussite. */
      us.progressPct = a.n ? Math.min(100, Math.round(
        (Math.min(1, a.n / 30) * 60) + (us.avgPct || 0) * 0.4)) : 0;
    });

    /* --- Erreurs techniques --- */
    var GABARITS = [
      { level:'error', kind:'speech',     message:"SpeechRecognition : 'no-speech' — aucun signal détecté pendant 8 s",
        stack:"onerror(no-speech)\n  at reco.onerror (index.html:5240)" },
      { level:'error', kind:'speech',     message:"SpeechRecognition : 'not-allowed' — micro refusé par le navigateur",
        stack:"onerror(not-allowed)\n  at startListening (index.html:5188)" },
      { level:'warn',  kind:'audio',      message:"speechSynthesis : voix française absente, repli sur la voix par défaut",
        stack:null },
      { level:'error', kind:'audio',      message:"speechSynthesis.speak() sans effet — Chrome, onglet réactivé après mise en veille",
        stack:"parler()\n  at scMajEcouteAtis (index.html:4977)" },
      { level:'error', kind:'network',    message:"Tuile OACI 7_64_46.webp : 404 — fond de carte incomplet",
        stack:null },
      { level:'error', kind:'simulation', message:"buildFlight() : aucune fréquence publiée pour le terrain d'arrivée, repli sur l'auto-information",
        stack:"freqOf()\n  at buildFlight (index.html:8412)" },
      { level:'warn',  kind:'simulation', message:"insererAleaMajeur() : phase « Intégration » introuvable, aléa non inséré",
        stack:null },
      { level:'error', kind:'js',         message:"TypeError: Cannot read properties of null (reading 'pistes')",
        stack:"at pisteEnService (index.html:3612)\n  at startFlight (index.html:9520)" },
      { level:'info',  kind:'user_report',message:"« Le contrôleur parle trop vite même en débit lent »", stack:null },
      { level:'info',  kind:'user_report',message:"« L'ATIS ne s'arrête pas quand je change de fréquence »", stack:null },
      { level:'warn',  kind:'js',         message:"localStorage plein : l'historique des vols n'a pas pu être enregistré",
        stack:"at enregistrerVol (index.html:9709)" }
    ];
    var UAS = [
      'Chrome/131 · macOS 15','Chrome/130 · Windows 11','Edge/131 · Windows 11',
      'Safari/18 · macOS 15','Safari/17 · iPadOS 18','Chrome/131 · Android 15'
    ];
    var erreurs = [];
    var re = rng(GRAINE + 4242);
    for (var e = 0; e < 58; e++){
      var g = re.pick(GABARITS);
      var s = re.chance(0.7) ? re.pick(sessions) : null;
      var quandE = maintenant - Math.round(Math.pow(re.f(), 2) * 45 * jour) - re.i(0,23) * 3600000;
      erreurs.push({
        id:'e_' + String(e + 1).padStart(3,'0'),
        at:new Date(quandE).toISOString(),
        level:g.level, kind:g.kind, message:g.message, stack:g.stack,
        userId:s ? s.userId : null, userName:s ? s.userName : null,
        sessionId:s ? s.id : null,
        sessionLabel:s ? (RT.labels.kind[s.kind] + ' · ' + s.title) : null,
        url:'index.html#' + (s && s.kind === 'flight' ? 'navigation' : 'exercices'),
        userAgent:re.pick(UAS),
        appVersion:'2026.09.09',
        resolved:re.chance(0.25),
        context:s ? { dep:s.dep, arr:s.arr, level:s.level, alea:s.alea } : {}
      });
    }
    erreurs.sort(function(a,b){ return a.at < b.at ? 1 : -1; });

    monde = { users:users, sessions:sessions, erreurs:erreurs, AD:AD, SC:SC, AV:AV, LB:LB };
    return monde;
  }

  /* Les étapes d'un vol sont fabriquées à la demande, à partir de la graine de la
     session : mêmes étapes à chaque ouverture, sans stocker 10 000 objets. */
  function etapesDe(s){
    var r = rng(s._seed);
    var n = s.scoreTotal;
    var manquesRestants = s.missed.slice();
    var out = [];
    var stations = [];
    if (s.dep) stations.push(s.depName + ' Sol', s.depName + ' Tour');
    stations.push('Information', 'Approche');
    if (s.arr) stations.push((s.arrName || s.arr) + ' Tour', (s.arrName || s.arr) + ' Sol');
    var coupe = s._abandonAt != null ? Math.max(1, Math.round(n * s._abandonAt)) : n;

    for (var i = 0; i < n; i++){
      var ph = PHASES_VOL[Math.min(PHASES_VOL.length - 1, Math.floor(i / n * PHASES_VOL.length))];
      var repondu = i < coupe;
      var mq = [];
      if (repondu && manquesRestants.length && r.chance(0.45)) mq.push(manquesRestants.shift());
      var freq = (118 + r.i(0, 18)) + '.' + String(r.i(0, 19) * 25).padStart(3,'0').slice(0,3);
      out.push({
        idx:i + 1,
        phase:ph,
        station:r.pick(stations),
        freq:freq,
        expected:'(phraséologie attendue — voir le manuel DSNA)',
        said: repondu ? (mq.length ? '(message incomplet)' : '(message conforme)') : '',
        answered:repondu,
        missed:mq
      });
    }
    /* Ce qui restait à placer est reporté sur les derniers échanges répondus. */
    for (var j = out.length - 1; j >= 0 && manquesRestants.length; j--){
      if (out[j].answered) out[j].missed.push(manquesRestants.shift());
    }
    return out;
  }

  function enrichirFlight(s){
    var o = {};
    for (var k in s) if (s.hasOwnProperty(k) && k.charAt(0) !== '_') o[k] = s[k];
    o.steps = etapesDe(s);
    o.squawk = '7000';
    o.radio = { active:o.steps.length ? o.steps[o.steps.length-1].freq : '—',
                standby:o.steps.length ? o.steps[0].freq : '—' };
    return o;
  }

  function fenetre(opts){
    opts = opts || {};
    var to = opts.to ? new Date(opts.to) : new Date();
    var from = opts.from ? new Date(opts.from) : U.ilYaJours(opts.days || 30);
    return { from:from, to:to };
  }
  function dansFenetre(iso, f){
    var t = new Date(iso).getTime();
    return t >= f.from.getTime() && t <= f.to.getTime();
  }

  /* ---------- Implémentation du contrat ----------------------------------------- */
  var src = {
    id:'mock',
    label:'Démonstration',
    fictional:true,
    available:function(){ return true; },
    unavailableReason:function(){ return ''; },

    capabilities:function(){
      return { read:true, write:false, realtime:false, users:true, errors:true, analytics:true,
               note:"Jeu de démonstration en lecture seule. Les actions d'écriture sont désactivées." };
    },

    overview:function(opts){
      var M = construire(), f = fenetre(opts);
      var duree = f.to - f.from;
      var fPrec = { from:new Date(f.from - duree), to:f.from };

      function agr(fen){
        var s = M.sessions.filter(function(x){ return dansFenetre(x.at, fen); });
        var ok = 0, tot = 0, secs = 0, ab = 0, ex = 0;
        s.forEach(function(x){
          ok += x.scoreOk; tot += x.scoreTotal; secs += x.durationS;
          if (x.status === 'abandoned') ab++; else ex++;
        });
        var actifs = {};
        s.forEach(function(x){ actifs[x.userId] = 1; });
        return { sessions:s.length, abandoned:ab, completed:ex,
                 avgDurationS:s.length ? Math.round(secs / s.length) : null,
                 avgPct:tot ? U.pct(ok, tot) : null,
                 active:Object.keys(actifs).length };
      }
      var a = agr(f), b = agr(fPrec);
      var nouveaux = M.users.filter(function(u){ return dansFenetre(u.createdAt, f); }).length;
      var nouveauxP = M.users.filter(function(u){ return dansFenetre(u.createdAt, fPrec); }).length;

      function delta(x, y){ return (y == null || x == null) ? null : (y === 0 ? null : Math.round((x - y) / y * 100)); }

      return {
        range:{ from:f.from.toISOString(), to:f.to.toISOString() },
        users:{ total:M.users.length, new:nouveaux, active:a.active },
        sessions:{ total:a.sessions, completed:a.completed, abandoned:a.abandoned,
                   avgDurationS:a.avgDurationS },
        exercises:{ completed:a.completed },
        score:{ avgPct:a.avgPct },
        deltas:{ users:delta(nouveaux, nouveauxP), active:delta(a.active, b.active),
                 sessions:delta(a.sessions, b.sessions), score:delta(a.avgPct, b.avgPct) }
      };
    },

    activity:function(opts){
      var M = construire(), n = (opts && opts.limit) || 12;
      return M.sessions.slice(0, n).map(function(s){
        return {
          id:s.id, at:s.at, userId:s.userId, userName:s.userName,
          kind:s.kind, label:s.title,
          detail:(s.kind === 'flight'
                    ? (s.aircraft || '') + (s.alea ? ' · ' + RT.labels.alea[s.alea] : '')
                    : (s.dep ? s.dep : '') + (s.runway ? ' · piste ' + s.runway : '')),
          scorePct:s.scorePct, status:s.status, level:s.level
        };
      });
    },

    alerts:function(){
      var M = construire(), out = [];
      var recentes = M.erreurs.filter(function(e){
        return Date.now() - new Date(e.at).getTime() < 7 * 86400000;
      });
      var erreursGraves = recentes.filter(function(e){ return e.level === 'error' && !e.resolved; });
      if (erreursGraves.length)
        out.push({ id:'a_err', at:erreursGraves[0].at, level:'error', kind:'technique',
          title:erreursGraves.length + ' erreur' + (erreursGraves.length>1?'s':'') + ' technique' + (erreursGraves.length>1?'s':'') + ' non traitée' + (erreursGraves.length>1?'s':'') + ' (7 j)',
          detail:erreursGraves[0].message, route:'admin/errors' });

      /* Exercices en difficulté : ceux dont le taux de réussite moyen est bas
         sur un nombre de passages suffisant pour que le chiffre veuille dire
         quelque chose. */
      var parEx = {};
      M.sessions.forEach(function(s){
        if (s.kind !== 'scenario' || !s.exerciseKey) return;
        var a = parEx[s.exerciseKey] || (parEx[s.exerciseKey] = { ok:0, tot:0, n:0, ab:0 });
        a.ok += s.scoreOk; a.tot += s.scoreTotal; a.n++;
        if (s.status === 'abandoned') a.ab++;
      });
      Object.keys(parEx).forEach(function(k){
        var a = parEx[k]; if (a.n < 12) return;
        var pct = U.pct(a.ok, a.tot);
        if (pct < 58){
          var sc = M.SC.filter(function(x){ return x.id === k; })[0];
          out.push({ id:'a_ex_' + k, at:new Date().toISOString(), level:'warn', kind:'pedagogie',
            title:'Scénario en difficulté : ' + (sc ? sc.titre : k),
            detail:pct + ' % de réussite moyenne sur ' + a.n + ' passages.',
            route:'admin/exercises' });
        }
      });

      /* Abandons : le signal le plus parlant sur un parcours qui coince. */
      var ab = M.sessions.filter(function(s){
        return s.status === 'abandoned' && Date.now() - new Date(s.at).getTime() < 14 * 86400000;
      });
      var tot14 = M.sessions.filter(function(s){
        return Date.now() - new Date(s.at).getTime() < 14 * 86400000;
      }).length;
      if (tot14 && ab.length / tot14 > 0.12)
        out.push({ id:'a_ab', at:new Date().toISOString(), level:'warn', kind:'usage',
          title:'Taux d\'abandon élevé : ' + Math.round(ab.length / tot14 * 100) + ' % sur 14 jours',
          detail:ab.length + ' séances interrompues sur ' + tot14 + '.', route:'admin/analytics' });

      var susp = M.users.filter(function(u){ return u.status === 'suspended'; });
      if (susp.length)
        out.push({ id:'a_susp', at:new Date().toISOString(), level:'info', kind:'comptes',
          title:susp.length + ' compte' + (susp.length>1?'s':'') + ' suspendu' + (susp.length>1?'s':''),
          detail:susp.slice(0,3).map(function(u){ return u.name; }).join(', ') + (susp.length>3 ? '…' : ''),
          route:'admin/users' });

      return out;
    },

    users:function(opts){
      opts = opts || {};
      var M = construire();
      var rows = M.users.filter(function(u){
        if (opts.status && opts.status !== 'all' && u.status !== opts.status) return false;
        if (opts.role && opts.role !== 'all' && u.role !== opts.role) return false;
        return U.correspond(opts.q, [u.name, u.email, u.id, u.callsign, u.homeIcao]);
      }).map(function(u){
        return { id:u.id, name:u.name, email:u.email, role:u.role, status:u.status,
                 createdAt:u.createdAt, lastSeenAt:u.lastSeenAt, sessions:u.sessions,
                 flights:u.flights, avgPct:u.avgPct, progressPct:u.progressPct,
                 trainingS:u.trainingS, plan:u.plan };
      });
      rows = U.trier(rows, opts.sort || 'lastSeenAt', opts.dir || 'desc');
      return U.paginer(rows, opts.page, opts.perPage || 20);
    },

    user:function(id){
      var M = construire();
      var u = M.users.filter(function(x){ return x.id === id; })[0];
      if (!u) return null;
      var o = {};
      for (var k in u) if (u.hasOwnProperty(k) && k.charAt(0) !== '_') o[k] = u[k];
      return o;
    },

    userSessions:function(id, opts){
      var M = construire(), n = (opts && opts.limit) || 40;
      return M.sessions.filter(function(s){ return s.userId === id; }).slice(0, n)
        .map(function(s){
          var o = {};
          for (var k in s) if (s.hasOwnProperty(k) && k.charAt(0) !== '_') o[k] = s[k];
          return o;
        });
    },

    userWeaknesses:function(id){
      var M = construire();
      var ses = M.sessions.filter(function(s){ return s.userId === id; });
      var parAxe = {};
      RT.taxonomy.axes.forEach(function(a){ parAxe[a.key] = { attempts:0, missed:0 }; });
      ses.forEach(function(s){
        /* Tentatives : réparties sur les axes au prorata du nombre d'éléments —
           approximation assumée du jeu de démonstration, la vraie source les
           comptera exactement via session_steps. */
        var parts = Math.max(1, Math.round(s.scoreTotal / RT.taxonomy.axes.length));
        RT.taxonomy.axes.forEach(function(a){ parAxe[a.key].attempts += parts; });
        s.missed.forEach(function(lb){ parAxe[RT.taxonomy.axisOf(lb)].missed++; });
      });
      return RT.taxonomy.axes.map(function(a){
        var v = parAxe[a.key];
        return { axis:a.key, label:a.label, desc:a.desc, attempts:v.attempts, missed:v.missed,
                 pct: v.attempts ? Math.max(0, 100 - Math.round(v.missed / v.attempts * 100)) : null };
      });
    },

    flights:function(opts){
      opts = opts || {};
      var M = construire();
      var rows = M.sessions.filter(function(s){
        if (s.kind !== 'flight') return false;
        if (opts.status && opts.status !== 'all' && s.status !== opts.status) return false;
        if (opts.level  && opts.level  !== 'all' && s.level  !== opts.level)  return false;
        if (opts.alea === 'with' && !s.alea) return false;
        if (opts.alea === 'none' && s.alea) return false;
        if (opts.alea && opts.alea !== 'all' && opts.alea !== 'with' && opts.alea !== 'none'
            && s.alea !== opts.alea) return false;
        if (opts.userId && s.userId !== opts.userId) return false;
        return U.correspond(opts.q, [s.userName, s.title, s.dep, s.arr, s.aircraft, s.id,
                                     s.alea ? RT.labels.alea[s.alea] : '']);
      }).map(function(s){
        var o = {};
        for (var k in s) if (s.hasOwnProperty(k) && k.charAt(0) !== '_') o[k] = s[k];
        return o;
      });
      rows = U.trier(rows, opts.sort || 'at', opts.dir || 'desc');
      return U.paginer(rows, opts.page, opts.perPage || 20);
    },

    flight:function(id){
      var M = construire();
      var s = M.sessions.filter(function(x){ return x.id === id; })[0];
      return s ? enrichirFlight(s) : null;
    },

    analytics:function(opts){
      var M = construire(), f = fenetre(opts);
      var ses = M.sessions.filter(function(s){ return dansFenetre(s.at, f); });
      var jours = U.joursEntre(f.from, f.to);

      var parJour = {};
      jours.forEach(function(d){ parJour[d] = { d:d, scenario:0, flight:0, spelling:0, users:{} }; });
      var ok = 0, tot = 0, secs = 0, ab = 0;
      var ex = {}, ac = {}, ad = {}, al = {}, mi = {};
      ses.forEach(function(s){
        var d = s.at.slice(0,10);
        if (parJour[d]) { parJour[d][s.kind]++; parJour[d].users[s.userId] = 1; }
        ok += s.scoreOk; tot += s.scoreTotal; secs += s.durationS;
        if (s.status === 'abandoned') ab++;
        if (s.exerciseKey) { var a = ex[s.exerciseKey] || (ex[s.exerciseKey] = { runs:0, ok:0, tot:0 });
                             a.runs++; a.ok += s.scoreOk; a.tot += s.scoreTotal; }
        if (s.aircraft) ac[s.aircraft] = (ac[s.aircraft] || 0) + 1;
        if (s.dep) ad[s.dep] = (ad[s.dep] || 0) + 1;
        if (s.arr) ad[s.arr] = (ad[s.arr] || 0) + 1;
        if (s.alea) al[s.alea] = (al[s.alea] || 0) + 1;
        s.missed.forEach(function(lb){ mi[lb] = (mi[lb] || 0) + 1; });
      });

      function top(obj, mapper, n){
        return Object.keys(obj).map(mapper).sort(function(a,b){ return b.n - a.n; }).slice(0, n || 8);
      }
      var nomAd = {};
      M.AD.forEach(function(a){ nomAd[a.icao] = a.nom; });
      var titreSc = {};
      M.SC.forEach(function(s){ titreSc[s.id] = s.titre; });

      /* Abandons par phase : où le vol s'arrête. Le point de coupure est stocké
         dans _abandonAt, on le projette sur la liste des phases. */
      var dropoff = PHASES_VOL.map(function(p){ return { phase:p, started:0, completed:0 }; });
      ses.filter(function(s){ return s.kind === 'flight'; }).forEach(function(s){
        var stop = s._abandonAt == null ? 1 : s._abandonAt;
        var idx = Math.min(dropoff.length - 1, Math.floor(stop * dropoff.length));
        for (var i = 0; i < dropoff.length; i++){
          if (i <= idx) dropoff[i].started++;
          if (i < idx || (i === idx && s._abandonAt == null)) dropoff[i].completed++;
        }
      });

      return {
        range:{ from:f.from.toISOString(), to:f.to.toISOString() },
        activeUsers:jours.map(function(d){ return { d:d, n:Object.keys(parJour[d].users).length }; }),
        sessionsPerDay:jours.map(function(d){
          return { d:d, scenario:parJour[d].scenario, flight:parJour[d].flight,
                   spelling:parJour[d].spelling }; }),
        totals:{
          sessions:ses.length,
          flights:ses.filter(function(s){ return s.kind === 'flight'; }).length,
          scenarios:ses.filter(function(s){ return s.kind === 'scenario'; }).length,
          users:Object.keys(ses.reduce(function(m,s){ m[s.userId]=1; return m; }, {})).length,
          avgDurationS:ses.length ? Math.round(secs / ses.length) : null,
          avgPct:tot ? U.pct(ok, tot) : null,
          successRate:ses.length
            ? Math.round(ses.filter(function(s){ return s.scorePct >= 80; }).length / ses.length * 100) : null,
          abandonRate:ses.length ? Math.round(ab / ses.length * 100) : null
        },
        topExercises:Object.keys(ex).map(function(k){
          return { key:k, title:titreSc[k] || (k === 'epellation' ? 'Épellation radio' : k),
                   n:ex[k].runs, runs:ex[k].runs, avgPct:U.pct(ex[k].ok, ex[k].tot) };
        }).sort(function(a,b){ return b.n - a.n; }),
        topAircraft:top(ac, function(k){ return { name:k, n:ac[k] }; }),
        topAirfields:top(ad, function(k){ return { icao:k, name:nomAd[k] || '', n:ad[k] }; }, 10),
        topAleas:top(al, function(k){ return { key:k, label:RT.labels.alea[k] || k, n:al[k] }; }),
        topMissed:top(mi, function(k){
          return { label:k, axis:RT.taxonomy.axisOf(k), n:mi[k] }; }, 12),
        dropoff:dropoff
      };
    },

    exercises:function(opts){
      opts = opts || {};
      var M = construire();
      /* Statistiques d'usage rattachées au catalogue RÉEL : la liste vient de
         SCENARIOS (index.html), les chiffres du jeu de démonstration. */
      var stats = {};
      M.sessions.forEach(function(s){
        if (!s.exerciseKey) return;
        var a = stats[s.exerciseKey] || (stats[s.exerciseKey] = { runs:0, ok:0, tot:0, ab:0, fail:0 });
        a.runs++; a.ok += s.scoreOk; a.tot += s.scoreTotal;
        if (s.status === 'abandoned') a.ab++;
        if (s.scorePct < 50) a.fail++;
      });
      var rows = M.SC.map(function(sc, i){
        var a = stats[sc.id] || { runs:0, ok:0, tot:0, ab:0, fail:0 };
        return {
          key:sc.id, title:sc.titre,
          category: sc.isCircuit ? 'Circuit' : (sc.defaultTerrain === 'arr' ? 'Arrivée' : 'Départ'),
          level: sc.alea ? 'reel' : 'debutant',
          station: sc.station || '—',
          turns:(sc.tours || []).length,
          /* Certains scénarios ne DÉCLARENT pas leurs échanges : buildQueue() les
             fabrique au lancement, d'après le terrain, l'espace aérien traversé
             ou une réponse de l'élève. Écrire « 0 échanges » serait faux. */
          dynamic:!(sc.tours || []).length,
          branching:(sc.tours || []).some(function(t){ return t.type === 'choice'; }),
          controllable:!!sc.controllable,
          alea:!!sc.alea,
          isActive:true,
          sortOrder:i + 1,
          runs:a.runs,
          avgPct:a.tot ? U.pct(a.ok, a.tot) : null,
          failRate:a.runs ? Math.round(a.fail / a.runs * 100) : null,
          abandonRate:a.runs ? Math.round(a.ab / a.runs * 100) : null,
          source:'code'
        };
      }).concat([{
        key:'epellation', title:'Épellation radio', category:'Fondamentaux', level:'debutant',
        station:'—', turns:0, dynamic:true, branching:false,
        controllable:false, alea:false, isActive:true,
        sortOrder:0, runs:(stats.epellation || {}).runs || 0,
        avgPct:(stats.epellation && stats.epellation.tot) ? U.pct(stats.epellation.ok, stats.epellation.tot) : null,
        failRate:null, abandonRate:null, source:'code'
      }]);

      return rows.filter(function(x){
        if (opts.category && opts.category !== 'all' && x.category !== opts.category) return false;
        if (opts.level && opts.level !== 'all' && x.level !== opts.level) return false;
        if (opts.status === 'active' && !x.isActive) return false;
        if (opts.status === 'inactive' && x.isActive) return false;
        return U.correspond(opts.q, [x.title, x.key, x.category, x.station]);
      });
    },

    errors:function(opts){
      opts = opts || {};
      var M = construire();
      var rows = M.erreurs.filter(function(e){
        if (opts.level && opts.level !== 'all' && e.level !== opts.level) return false;
        if (opts.kind  && opts.kind  !== 'all' && e.kind  !== opts.kind)  return false;
        if (opts.resolved === 'open' && e.resolved) return false;
        if (opts.resolved === 'done' && !e.resolved) return false;
        if (opts.userId && e.userId !== opts.userId) return false;
        return U.correspond(opts.q, [e.message, e.kind, e.userName || '', e.sessionId || '', e.userAgent]);
      });
      rows = U.trier(rows, opts.sort || 'at', opts.dir || 'desc');
      return U.paginer(rows, opts.page, opts.perPage || 25);
    },

    error:function(id){
      var M = construire();
      return M.erreurs.filter(function(e){ return e.id === id; })[0] || null;
    }
  };

  RT.data.register(src);
})();
