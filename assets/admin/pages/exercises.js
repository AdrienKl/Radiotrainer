/* =============================================================================
   RadioTrainer — Admin · /admin/exercises
   -----------------------------------------------------------------------------
   Le catalogue vient du CODE (const SCENARIOS, index.html) : c'est là qu'il doit
   rester, parce qu'un scénario n'est pas du contenu mais de la logique — des
   mots-clés avec leurs variantes, des références résolues à l'exécution, une
   variante AFIS par tour. Le mettre en base obligerait à écrire un interpréteur
   en base et interdirait toute relecture en diff Git.

   Ce que l'Admin fait donc ici :
     · LIRE le catalogue réel, avec le déroulé complet de chaque scénario ;
     · le croiser avec les statistiques d'usage ;
     · montrer précisément ce que l'écriture fera quand la table `exercises`
       existera — sans faire semblant de l'écrire aujourd'hui.

   La table `exercises` ne portera QUE des métadonnées de pilotage (actif,
   ordre, catégorie, difficulté, référence manuel, notes). Voir ADMIN.md § 10.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin, UI = RT.ui;
  var el = UI.el, esc = UI.esc, I = UI.I, F = UI.F;

  var etat = { q:'', category:'all', level:'all', status:'all' };

  /* Le déroulé d'un scénario est du référentiel applicatif, pas de la donnée
     utilisateur : il se lit directement dans SCENARIOS, comme le fait la page
     Scénarios elle-même. */
  function scenarioDeCode(key){
    if (typeof SCENARIOS === 'undefined') return null;
    return SCENARIOS.filter(function(s){ return s.id === key; })[0] || null;
  }

  /* Combien d'échanges ? La réponse honnête n'est pas toujours un nombre :
     « Tour de piste » et « Navigation / croisière » construisent leur déroulé au
     lancement (buildQueue), d'après le terrain et l'espace aérien réellement
     traversé ; « Urgence » se ramifie selon la réponse de l'élève. */
  function libelleEchanges(r){
    if (r.dynamic) return 'déroulé construit au lancement';
    return r.turns + ' échange' + (r.turns > 1 ? 's' : '')
         + (r.branching ? ' · à embranchements' : '');
  }

  /* Références au manuel DSNA : elles sont en commentaire dans le code source,
     pas dans les objets. On ne les invente donc pas — on affiche « — ». */
  function detailScenario(row){
    var sc = scenarioDeCode(row.key);
    var c = el('div');

    c.appendChild(UI.fiche([
      ['Clé', row.key],
      ['Titre', row.title],
      ['Catégorie', row.category],
      ['Difficulté', RT.labels.level[row.level] || row.level],
      ['Station', row.station],
      ['Terrain contrôlé', row.controllable ? 'oui (variante AFIS prévue)' : 'non'],
      ['Aléas possibles', row.alea ? 'oui' : 'non'],
      ['Échanges', libelleEchanges(row)],
      ['Source', 'const SCENARIOS — index.html'],
      ['Passages', F.nb(row.runs)],
      ['Réussite moyenne', row.avgPct == null ? '—' : row.avgPct + ' %'],
      ['Séances sous 50 %', row.failRate == null ? '—' : row.failRate + ' %']
    ]));

    if (!sc || !sc.tours || !sc.tours.length){
      c.appendChild(UI.notice(
        sc
          ? "Ce scénario ne déclare pas ses échanges : buildQueue() les fabrique au "
            + "lancement, d'après le terrain choisi, la piste en service et l'espace "
            + "aérien réellement traversé. Il n'y a donc rien de figé à montrer ici — "
            + "et c'est voulu : deux passages ne se ressemblent pas."
          : "Cet exercice est un module autonome (comme l'épellation) : il n'a pas "
            + "d'entrée dans SCENARIOS.",
        'info', sc ? 'Déroulé construit au lancement' : 'Hors catalogue SCENARIOS'));
      return c;
    }

    var h = el('h4', null, 'Déroulé — ' + sc.tours.length + ' échange'
                           + (sc.tours.length > 1 ? 's' : ''));
    h.style.margin = '4px 0 0';
    c.appendChild(h);
    c.appendChild(el('p', 'adm-sub',
      'Extrait tel quel du code. Les accolades sont des gabarits substitués au lancement '
    + '({CALL} indicatif, {PISTE} piste en service, {QNH}, {ADRM} nom du terrain…).'));

    var liste = el('div', 'adm-steps');
    sc.tours.forEach(function(t, i){
      var pilote = t.role === 'pilote' || !t.atc;
      var d = el('div', 'adm-step adm-step--' + (pilote ? 'ok' : 'skip'));
      var atc = t.atc ? (Array.isArray(t.atc) ? t.atc[0] : t.atc) : null;
      var html =
        '<div class="adm-step__head">'
        + '<span class="adm-step__n">#' + (i + 1) + '</span>'
        + '<span class="adm-step__ph">' + (pilote ? 'Le pilote parle' : 'Le contrôle parle') + '</span>'
        + (t.stn ? '<span class="adm-badge">' + esc(t.stn) + '</span>' : '')
        + (t.afis ? '<span class="adm-badge adm-badge--warn">variante AFIS</span>' : '')
        + '</div>';
      if (t.situation)
        html += '<div class="adm-step__line"><b>Situation</b><span>' + esc(t.situation) + '</span></div>';
      if (atc)
        html += '<div class="adm-step__line"><b>ATC</b><span>' + esc(atc) + '</span></div>';
      if (t.consigne)
        html += '<div class="adm-step__line"><b>Consigne</b><span>' + esc(t.consigne) + '</span></div>';
      if (t.attendu)
        html += '<div class="adm-step__line"><b>Attendu</b><span>' + esc(t.attendu) + '</span></div>';
      d.innerHTML = html;
      if (t.motsCles && t.motsCles.length){
        var chips = el('div', 'adm-step__miss');
        t.motsCles.forEach(function(mc){
          chips.innerHTML += UI.badge(mc.label + ' · ' + RT.taxonomy.labelOf(RT.taxonomy.axisOf(mc.label)));
        });
        d.appendChild(chips);
      }
      liste.appendChild(d);
    });
    c.appendChild(liste);
    return c;
  }

  function panneauEcriture(row, action){
    var c = el('div');
    c.appendChild(UI.notice(
      "Rien n'a été modifié. L'écriture n'est pas branchée : la table `exercises` n'existe pas "
    + "encore, et le déroulé du scénario, lui, restera dans le code de toute façon. "
    + "Ce panneau montre exactement ce qui sera exécuté le jour du branchement.",
      'warn', 'Aucune modification effectuée'));

    var sql;
    if (action === 'toggle'){
      sql = "update public.exercises\n"
          + "   set is_active = " + (row.isActive ? 'false' : 'true') + ",\n"
          + "       updated_at = now(), updated_by = auth.uid()\n"
          + " where key = '" + row.key + "';\n\n"
          + "-- Puis, obligatoirement :\n"
          + "insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)\n"
          + "values (auth.uid(), 'exercise_toggle', 'exercise', '" + row.key + "',\n"
          + "        jsonb_build_object('is_active', " + (row.isActive ? 'false' : 'true') + "));";
    } else if (action === 'edit'){
      sql = "update public.exercises\n"
          + "   set title       = '" + String(row.title).replace(/'/g, "''") + "',\n"
          + "       category    = '" + row.category + "',\n"
          + "       level       = '" + row.level + "',\n"
          + "       sort_order  = " + (row.sortOrder || 0) + ",\n"
          + "       manual_ref  = null,   -- page du manuel DSNA\n"
          + "       notes       = null,\n"
          + "       updated_at  = now(), updated_by = auth.uid()\n"
          + " where key = '" + row.key + "';\n\n"
          + "-- Le DÉROULÉ (tours, motsCles, variantes AFIS) n'est PAS touché :\n"
          + "-- il vit dans const SCENARIOS (index.html) et doit y rester.";
    } else {
      sql = "insert into public.exercises (key, title, category, level, station,\n"
          + "                              manual_ref, is_active, sort_order)\n"
          + "values ('nouvelle_cle', 'Nouveau scénario', 'Départ', 'debutant',\n"
          + "        '{ADRM} {STN}', 'p. ??', false, 99);\n\n"
          + "-- Et, dans index.html, ajouter l'entrée correspondante à SCENARIOS :\n"
          + "-- { id:'nouvelle_cle', titre:'…', station:'{ADRM} {STN}',\n"
          + "--   defaultTerrain:'dep', controllable:true, tours:[ … ] }\n"
          + "-- Les deux vont ensemble : la base pilote, le code définit.";
    }
    c.appendChild(el('pre', 'adm-pre', esc(sql)));

    c.appendChild(UI.notice(
      "Pourquoi le déroulé reste dans le code : un tour de scénario contient des `motsCles` avec "
    + "leurs variantes de reconnaissance vocale et des `ref` résolues à l'exécution (indicatif, "
    + "piste en service calculée d'après le vent, QNH tiré au sort). C'est du comportement, pas "
    + "du texte. En base, il faudrait un interpréteur en base — et plus aucune relecture possible "
    + "en diff Git.", 'info', 'Décision d\'architecture'));
    return c;
  }

  RT.page('admin/exercises', {
    render:function(hote, ctx){
      var tete = el('div', 'adm-head');
      var g = el('div');
      g.appendChild(el('h1', 'adm-h1', 'Exercices'));
      g.appendChild(el('p', 'adm-sub',
        'Le catalogue réel de l\'application, croisé avec son usage. Cliquez une ligne pour voir '
      + 'le déroulé complet, échange par échange.'));
      tete.appendChild(g);
      var act = el('div', 'adm-head__r');
      act.appendChild(UI.bouton('Créer un exercice', { icon:I.book, cls:'cta', onClick:function(){
        UI.tiroir('Créer un exercice', panneauEcriture({ key:'nouvelle_cle' }, 'create'),
          { sub:'Ce que fera l\'action une fois Supabase branché' });
      } }));
      tete.appendChild(act);
      hote.appendChild(tete);

      var carte = UI.carte(null);
      hote.appendChild(carte);
      var resultats = el('div');

      carte.body.appendChild(UI.barreOutils({
        search:{ value:etat.q, placeholder:'Titre, clé, catégorie…',
                 onInput:function(v){ etat.q = v; peindre(); } },
        filters:[
          { label:'Catégorie', value:etat.category, options:[
              { v:'all', l:'Toutes' }, { v:'Départ', l:'Départ' }, { v:'Arrivée', l:'Arrivée' },
              { v:'Circuit', l:'Circuit' }, { v:'Fondamentaux', l:'Fondamentaux' }],
            onChange:function(v){ etat.category = v; peindre(); } },
          { label:'Difficulté', value:etat.level, options:[
              { v:'all', l:'Toutes' }, { v:'debutant', l:'Débutant' }, { v:'reel', l:'Réel' }],
            onChange:function(v){ etat.level = v; peindre(); } },
          { label:'État', value:etat.status, options:[
              { v:'all', l:'Tous' }, { v:'active', l:'Actifs' }, { v:'inactive', l:'Désactivés' }],
            onChange:function(v){ etat.status = v; peindre(); } }
        ]
      }));
      carte.body.appendChild(resultats);

      function peindre(){
        UI.charger(resultats, RT.data.exercises(etat), function(rows){
          var w = el('div');
          w.appendChild(UI.table({
            onRow:function(r){
              UI.tiroir(r.title, detailScenario(r),
                { sub:r.category + ' · ' + (RT.labels.level[r.level] || r.level)
                     + ' · ' + F.nb(r.runs) + ' passage' + (r.runs > 1 ? 's' : '') });
            },
            columns:[
              { key:'title', label:'Exercice', cell:function(r){
                  return '<span class="adm-cellmain"><b>' + esc(r.title) + '</b><span>'
                       + esc(r.key + ' · ' + libelleEchanges(r)) + '</span></span>'; } },
              { key:'category', label:'Catégorie', cell:function(r){
                  return UI.badge(r.category); } },
              { key:'level', label:'Difficulté', hideSm:true, cell:function(r){
                  return UI.badge(RT.labels.level[r.level] || r.level,
                    r.level === 'reel' ? 'warn' : null); } },
              { key:'station', label:'Station', hideSm:true, cls:'muted',
                cell:function(r){ return esc(r.station); } },
              { key:'runs', label:'Passages', align:'right', cls:'num',
                cell:function(r){ return F.nb(r.runs); } },
              { key:'avgPct', label:'Réussite', align:'right', cell:function(r){
                  return UI.pastillePct(r.avgPct); } },
              { key:'failRate', label:'Échecs (< 50 %)', align:'right', hideSm:true,
                cls:'num muted', cell:function(r){
                  return r.failRate == null ? '—'
                    : '<span class="adm-pct ' + (r.failRate > 30 ? 'bas' : 'nul') + '">'
                      + r.failRate + ' %</span>'; } },
              { key:'isActive', label:'État', cell:function(r){
                  return UI.badge(r.isActive ? 'Actif' : 'Désactivé', r.isActive ? 'ok' : null); } },
              { key:'_act', label:'', align:'right', cell:function(){
                  return '<span class="muted">Modifier ›</span>'; } }
            ],
            rows:rows,
            empty:UI.etatVide('Aucun exercice ne correspond', null, I.book)
          }));
          /* Les actions d'écriture sont volontairement en dehors des lignes : un
             clic sur la ligne ouvre le contenu, ce qui est l'usage courant ; les
             actions de gestion demandent un geste délibéré. */
          var actions = el('div', 'adm-btnrow');
          actions.style.marginTop = '14px';
          actions.appendChild(UI.bouton('Modifier les métadonnées d\'un exercice', {
            onClick:function(){
              if (!rows.length) return;
              UI.tiroir('Modifier — ' + rows[0].title, panneauEcriture(rows[0], 'edit'),
                { sub:'Ce que fera l\'action une fois Supabase branché' });
            } }));
          actions.appendChild(UI.bouton('Désactiver un exercice', {
            onClick:function(){
              if (!rows.length) return;
              UI.tiroir('Désactiver — ' + rows[0].title, panneauEcriture(rows[0], 'toggle'),
                { sub:'Ce que fera l\'action une fois Supabase branché' });
            } }));
          w.appendChild(actions);
          w.appendChild(UI.notice(
            'Cette console est en lecture seule tant que Supabase n\'est pas branché. Les deux '
          + 'boutons ci-dessus montrent la requête exacte qui sera exécutée, plutôt que de '
          + 'simuler une modification qui n\'aurait aucun effet.', 'info', 'Lecture seule'));
          return w;
        }, 'Lecture du catalogue…');
      }
      peindre();
    }
  });
})();
