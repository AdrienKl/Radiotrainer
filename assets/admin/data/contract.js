/* =============================================================================
   RadioTrainer — Admin · COUCHE DE DONNÉES : le contrat
   -----------------------------------------------------------------------------
   Ce fichier ne contient AUCUNE donnée. Il définit :
     1. le contrat que toute source de données doit remplir ;
     2. la façade RTAdmin.data que les pages appellent ;
     3. la taxonomie qui classe un élément manqué dans un axe de compétence.

   Règle d'or : une page Admin n'appelle JAMAIS localStorage, ne connaît JAMAIS
   une source, et n'écrit JAMAIS de valeur en dur. Elle appelle RTAdmin.data.
   Brancher Supabase = remplir source-supabase.js. Aucune page à réécrire.

   Toutes les méthodes renvoient une Promise : Supabase est asynchrone, donc le
   contrat l'est déjà, sinon chaque page serait à reprendre le jour du branchement.

   -----------------------------------------------------------------------------
   CONTRAT — une source est un objet exposant :

     id            'mock' | 'local' | 'supabase'
     label         nom affiché
     fictional     true si les données sont inventées (pilote les mentions « fictif »)
     available()   → true si la source peut répondre
     unavailableReason() → texte affiché quand available() est faux

     overview({from,to})        → {users:{total,new,active}, sessions:{total,completed,
                                   abandoned,avgDurationS}, exercises:{completed},
                                   score:{avgPct}, deltas:{…}}
                                exercises.completed = séances menées à leur terme,
                                TOUS types confondus (pas seulement les scénarios) :
                                deux sources qui n'y mettent pas la même chose
                                feraient mentir la même tuile selon la source.
     activity({limit})          → [{id,at,userId,userName,kind,label,detail,scorePct,status}]
     alerts()                   → [{id,at,level,kind,title,detail,route}]
     users({q,status,role,sort,dir,page,perPage})
                                → {rows:[UserRow], total}
     user(id)                   → UserDetail | null
     userSessions(id,{limit})   → [SessionRow]
     userWeaknesses(id)         → [{axis,label,attempts,missed,pct}]
     flights({q,status,alea,level,sort,dir,page,perPage})
                                → {rows:[FlightRow], total}
     flight(id)                 → FlightDetail (avec steps[]) | null
     analytics({from,to})       → voir § ANALYTICS ci-dessous
     exercises({q,category,level,status})
                                → [ExerciseRow]
     errors({q,level,kind,page,perPage})
                                → {rows:[ErrorRow], total}
     error(id)                  → ErrorDetail | null
     capabilities()             → {read,write,realtime,users,errors,analytics}

   FORMES
     UserRow      {id,name,email,role,status,createdAt,lastSeenAt,sessions,
                   flights,avgPct,progressPct,trainingS}
     UserDetail   UserRow + {callsign,plan,homeIcao,aircraft,notes}
     SessionRow   {id,at,kind,title,dep,arr,aircraft,level,mode,durationS,
                   scoreOk,scoreTotal,scorePct,status,alea,missed[]}
     FlightRow    SessionRow (kind:'flight') + {runway,cruiseAlt,pax,diverted}
     FlightDetail FlightRow + {steps:[{idx,phase,station,freq,expected,said,
                   answered,missed[]}], radio:{…}, squawk:'…'}
     ExerciseRow  {key,title,category,level,station,manualRef,isActive,turns,
                   runs,avgPct,failRate,source:'code'|'db'}
     ErrorRow     {id,at,level,kind,message,userId,userName,sessionId,url,
                   userAgent,stack,context}

   § ANALYTICS
     {range:{from,to},
      activeUsers:[{d,n}], sessionsPerDay:[{d,scenario,flight}],
      totals:{sessions,flights,scenarios,users,avgDurationS,avgPct,successRate,
              abandonRate},
      topExercises:[{key,title,runs,avgPct}],
      topAircraft:[{name,n}], topAirfields:[{icao,name,n}],
      topAleas:[{key,label,n}], topMissed:[{label,axis,n}],
      dropoff:[{phase,started,completed}]}
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin = window.RTAdmin || {};

  /* ---------------------------------------------------------------------------
     TAXONOMIE — d'un élément manqué vers un axe de compétence.
     Les libellés viennent des `motsCles[].label` réellement présents dans
     SCENARIOS et dans le module Navigation d'index.html : la classification
     fonctionne donc à l'identique sur les données fictives et sur les vraies.
     ------------------------------------------------------------------------ */
  var AXES = [
    { key:'radio',        label:'Radio',              desc:"Indicatif, station appelée, collationnement, fréquences" },
    { key:'navigation',   label:'Navigation',         desc:"Position, cap, altitude, verticale, points de report" },
    { key:'transpondeur', label:'Transpondeur',       desc:"Code assigné, ident, codes d'urgence" },
    { key:'procedures',   label:'Procédures',         desc:"Roulage, décollage, circuit, intégration, atterrissage" },
    { key:'imprevus',     label:"Situations imprévues", desc:"Remise de gaz, attente, changement de piste, trafic" },
    { key:'urgences',     label:'Urgences',           desc:"MAYDAY, PAN PAN, panne radio, nature du problème" }
  ];

  /* Ordre d'évaluation important : la première règle qui accroche gagne.
     C'est une HEURISTIQUE sur des libellés écrits pour des humains, pas une
     classification exacte — quelques cas frontières resteront discutables
     (« Sortie de circuit » est autant une procédure qu'une position). Elle est
     appliquée à l'identique par les trois sources, ce qui est le point qui
     compte : deux sources ne doivent jamais classer le même libellé ailleurs.

     Deux pièges corrigés, qui montrent pourquoi l'ordre ne suffit pas :
       · « mise en route » contient « route » — sans une règle dédiée AVANT la
         navigation, un démarrage moteur était classé en navigation ;
       · « prêt au départ » contient « départ » — même piège. */
  var REGLES = [
    { axis:'urgences',     re:/mayday|pan\s?pan|urgence|detresse|détresse|panne (moteur|radio)|en aveugle|nature du (probl|prob)|personnes à bord|personnes a bord|7700|7600|fum[ée]e|malaise/i },
    { axis:'transpondeur', re:/transpondeur|squawk|code assign|ident\b|7000|7500/i },
    /* Procédures « au sol / autour de la piste » : évaluées AVANT la navigation,
       parce que leurs libellés contiennent des mots que la navigation revendique. */
    { axis:'procedures',   re:/mise en route|d[ée]marrage|pr[êe]t (au |pour le |à )?d[ée]part|roulage|point d.?attente|align|d[ée]coll|atterri|touch|toucher|piste/i },
    { axis:'navigation',   re:/altitude|niveau|cap\b|valeur de cap|position|distance|verticale|terrain surv|balise|vent arri|branche|circuit|point de report|survol|estim/i },
    { axis:'imprevus',     re:/remise de gaz|go.?around|attente|maintien|je maintiens|standby|rappelez|je rappelle|veille|trafic|d[ée]routement|ferm[ée]|contournement|zone|activ/i },
    { axis:'procedures',   re:/int[ée]gration|final|[ée]tape de base|derni[èe]re|d[ée]gag[ée]|parking|virage|qnh|approche|transit|intention|rappel/i },
    { axis:'radio',        re:/indicatif|station|organisme|nom du terrain|accus[ée]|r[ée]ception|fr[ée]quence|contact|quitte|appel|collation|vfr/i }
  ];

  function axeDe(label){
    var s = String(label || '');
    for (var i = 0; i < REGLES.length; i++) if (REGLES[i].re.test(s)) return REGLES[i].axis;
    return 'radio';                      // défaut : c'est de la phraséologie
  }
  function axeLabel(key){
    for (var i = 0; i < AXES.length; i++) if (AXES[i].key === key) return AXES[i].label;
    return key;
  }

  RT.taxonomy = { axes:AXES, axisOf:axeDe, labelOf:axeLabel };

  /* ---------------------------------------------------------------------------
     Libellés partagés (repris tels quels du module Navigation d'index.html).
     ------------------------------------------------------------------------ */
  RT.labels = {
    alea:{ moteur:'Panne moteur (MAYDAY)', fumee:'Fumée en cabine (MAYDAY)',
           malaise:'Passager malade (PAN PAN)', cap:'Changement de cap imposé',
           radio:'Panne radio', ferme:"Terrain d'arrivée fermé" },
    level:{ debutant:'Débutant', reel:'Réel' },
    mode:{ voyage:'Voyage', local:'Vol local' },
    status:{ completed:'Terminée', abandoned:'Abandonnée', in_progress:'En cours' },
    userStatus:{ active:'Actif', suspended:'Suspendu', pending:'En attente' },
    role:{ user:'Élève', admin:'Administrateur', moderator:'Modérateur', content_manager:'Contenu' },
    kind:{ scenario:'Scénario', flight:'Vol', spelling:'Épellation' }
  };

  /* ---------------------------------------------------------------------------
     Registre des sources + façade.
     ------------------------------------------------------------------------ */
  var sources = {};        // id → source
  var ordre   = [];        // ordre d'affichage dans le sélecteur
  var courant = null;      // id de la source active
  var CLE = 'rt-admin-source';

  var METHODES = ['overview','activity','alerts','users','user','userSessions',
                  'userWeaknesses','flights','flight','analytics','exercises',
                  'errors','error','capabilities'];

  function enregistrer(src){
    sources[src.id] = src;
    if (ordre.indexOf(src.id) < 0) ordre.push(src.id);
    if (!courant) courant = src.id;
  }

  function source(){ return sources[courant] || null; }

  function definirSource(id){
    if (!sources[id]) return false;
    if (id === courant) return true;
    courant = id;
    try { localStorage.setItem(CLE, id); } catch(e){}
    emettre();
    return true;
  }

  function emettre(){
    try { window.dispatchEvent(new CustomEvent('rt:admin-source', { detail:{ id:courant } })); }
    catch(e){}
  }

  /* Une méthode absente d'une source ne doit pas casser une page : elle renvoie
     un refus explicite, que le kit d'interface affiche en « non disponible ». */
  function appeler(nom, args){
    var s = source();
    if (!s) return Promise.reject(new Error('Aucune source de données enregistrée.'));
    if (!s.available || !s.available()) {
      var e = new Error(s.unavailableReason ? s.unavailableReason() : 'Source indisponible.');
      e.rtUnavailable = true; e.rtSource = s.id;
      return Promise.reject(e);
    }
    if (typeof s[nom] !== 'function') {
      var e2 = new Error('« ' + nom + ' » n\'est pas fourni par la source « ' + s.label + ' ».');
      e2.rtUnavailable = true; e2.rtSource = s.id;
      return Promise.reject(e2);
    }
    try { return Promise.resolve(s[nom].apply(s, args)); }
    catch(err){ return Promise.reject(err); }
  }

  var data = {};
  METHODES.forEach(function(nom){
    data[nom] = function(){ return appeler(nom, Array.prototype.slice.call(arguments)); };
  });

  data.register       = enregistrer;
  data.setSource      = definirSource;
  data.currentSource  = function(){
    var s = source();
    return s ? { id:s.id, label:s.label, fictional:!!s.fictional,
                 available:!s.available || s.available(),
                 reason:(s.unavailableReason ? s.unavailableReason() : '') }
             : { id:null, label:'—', fictional:false, available:false, reason:'' };
  };
  data.sources = function(){
    return ordre.map(function(id){
      var s = sources[id];
      return { id:id, label:s.label, fictional:!!s.fictional,
               available:!s.available || s.available(),
               reason:(s.unavailableReason ? s.unavailableReason() : '') };
    });
  };
  /* Choix mémorisé, appliqué une fois toutes les sources enregistrées. */
  data.restoreSource = function(){
    var id = null;
    try { id = localStorage.getItem(CLE); } catch(e){}
    if (id && sources[id]) courant = id;
  };

  RT.data = data;

  /* ---------------------------------------------------------------------------
     « Voir comme un utilisateur » — architecture, niveau 2.
     Voir ADMIN.md § 11. Rien n'est implémenté ici au-delà du porteur d'état :
     la sécurité viendra des politiques RLS, pas d'un `if` dans le navigateur.
     ------------------------------------------------------------------------ */
  var vueCible = null;
  RT.viewAs = {
    get:function(){ return vueCible; },
    set:function(user){
      vueCible = user || null;
      /* Le jour du branchement : journaliser dans admin_audit_log AVANT
         d'afficher quoi que ce soit, puis lire avec le jeton de l'admin — les
         écritures resteront refusées par la politique « self write ». */
      try { window.dispatchEvent(new CustomEvent('rt:admin-viewas', { detail:{ user:vueCible } })); }
      catch(e){}
    },
    clear:function(){ RT.viewAs.set(null); }
  };

  /* ---------------------------------------------------------------------------
     Petites aides partagées par les sources et les pages.
     ------------------------------------------------------------------------ */
  RT.util = {
    jourISO:function(d){ return new Date(d).toISOString().slice(0,10); },
    ilYaJours:function(n){ var d = new Date(); d.setDate(d.getDate() - n); return d; },
    joursEntre:function(from, to){
      var out = [], d = new Date(from), fin = new Date(to);
      d.setHours(12,0,0,0); fin.setHours(12,0,0,0);
      while (d <= fin){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); }
      return out;
    },
    pct:function(ok, total){ return total ? Math.round(ok / total * 100) : 0; },
    /* Tri générique piloté par le tableau du kit d'interface. */
    trier:function(rows, cle, sens){
      var s = sens === 'desc' ? -1 : 1;
      return rows.slice().sort(function(a,b){
        var x = a[cle], y = b[cle];
        if (x == null && y == null) return 0;
        if (x == null) return 1;             // les vides toujours en fin
        if (y == null) return -1;
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * s;
        return String(x).localeCompare(String(y), 'fr', { numeric:true }) * s;
      });
    },
    paginer:function(rows, page, perPage){
      var p = Math.max(1, page || 1), n = perPage || 25;
      return { rows: rows.slice((p-1)*n, p*n), total: rows.length, page:p, perPage:n,
               pages: Math.max(1, Math.ceil(rows.length / n)) };
    },
    /* Recherche insensible à la casse ET aux accents : « Ferrière » se trouve
       en tapant « ferriere ». */
    normaliser:function(s){
      return String(s == null ? '' : s).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    },
    correspond:function(needle, champs){
      var q = RT.util.normaliser(needle).trim();
      if (!q) return true;
      var hay = champs.map(RT.util.normaliser).join(' ');
      return q.split(/\s+/).every(function(mot){ return hay.indexOf(mot) >= 0; });
    },
    duree:function(s){
      if (s == null) return '—';
      var m = Math.floor(s / 60), r = Math.round(s % 60);
      if (m < 60) return m + ' min' + (m < 5 && r ? ' ' + r + ' s' : '');
      return Math.floor(m/60) + ' h ' + String(m%60).padStart(2,'0');
    }
  };
})();
