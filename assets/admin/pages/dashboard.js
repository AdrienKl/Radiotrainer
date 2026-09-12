/* =============================================================================
   RadioTrainer — Admin · /admin — TABLEAU DE BORD
   -----------------------------------------------------------------------------
   Ce qu'on veut savoir en trente secondes, le matin :
     1. est-ce que quelque chose ne va pas ?      → Alertes, en premier
     2. est-ce que ça bouge ?                     → Six chiffres + courbe
     3. qui a fait quoi, à l'instant ?            → Activité récente
   L'ordre de la page est celui-là, pas l'inverse : une console qui ouvre sur
   des jolis chiffres et cache les alertes en bas de page ne sert à rien.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin, UI = RT.ui;
  var el = UI.el, esc = UI.esc, I = UI.I, F = UI.F, C = UI.couleurs;

  function iconeAlerte(niveau){
    return niveau === 'error' ? I.error : (niveau === 'warn' ? I.warn : I.info);
  }

  function ligneActivite(a, ctx){
    var b = el('button', 'adm-feed__row');
    b.type = 'button';
    var ic = a.kind === 'flight' ? I.plane : (a.kind === 'spelling' ? I.mic : I.target);
    var etat = a.status === 'abandoned' ? UI.badge('abandonnée', 'bad')
             : (a.status === 'in_progress' ? UI.badge('en cours', 'warn') : '');
    b.innerHTML =
      '<span class="adm-feed__ic ' + a.kind + '">' + ic + '</span>' +
      '<span class="adm-feed__txt"><b>' + esc(a.userName || '—') + '</b>' +
        '<span>' + esc(a.label || '') + (a.detail ? ' · ' + esc(a.detail) : '') + '</span></span>' +
      '<span class="adm-feed__r">' +
        (a.scorePct != null ? UI.pastillePct(a.scorePct) : etat || '<span class="adm-pct nul">—</span>') +
        '<time>' + esc(F.depuis(a.at)) + '</time></span>';
    b.addEventListener('click', function(){
      if (a.kind === 'flight') ctx.go('admin/flights/' + a.id);
      else if (a.userId) ctx.go('admin/users/' + a.userId);
    });
    return b;
  }

  RT.page('admin', {
    render:function(hote, ctx){
      var jours = RT.state.days;

      var tete = el('div', 'adm-head');
      var g = el('div');
      g.appendChild(el('h1', 'adm-h1', 'Tableau de bord'));
      g.appendChild(el('p', 'adm-sub',
        'Vue d\'ensemble sur ' + jours + ' jours — activité, résultats et points de friction.'));
      tete.appendChild(g);
      var actions = el('div', 'adm-head__r');
      actions.appendChild(UI.bouton('Analytics détaillés',
        { icon:I.chart, onClick:function(){ ctx.go('admin/analytics'); } }));
      actions.appendChild(UI.bouton('Mode test',
        { icon:I.flask, onClick:function(){ ctx.go('admin/test'); } }));
      tete.appendChild(actions);
      hote.appendChild(tete);

      /* ---- 1. Alertes ---- */
      var cAl = UI.carte('Alertes', { sub:'Ce qui demande une décision aujourd\'hui.' });
      hote.appendChild(cAl);
      UI.charger(cAl.body, RT.data.alerts(), function(alertes){
        if (!alertes || !alertes.length)
          return UI.etatVide('Rien à signaler',
            'Aucune erreur récente, aucun exercice en difficulté, aucun abandon anormal.', I.target);
        var box = el('div', 'adm-alerts');
        alertes.forEach(function(a){
          var b = el('button', 'adm-alert adm-alert--' + (a.level || 'info'));
          b.type = 'button';
          b.innerHTML = '<span class="adm-alert__ic">' + iconeAlerte(a.level) + '</span>'
            + '<span><b>' + esc(a.title) + '</b><span>' + esc(a.detail || '') + '</span></span>';
          if (a.route) b.addEventListener('click', function(){ ctx.go(a.route); });
          box.appendChild(b);
        });
        return box;
      }, 'Recherche des anomalies…');

      /* ---- 2. Chiffres + courbe ---- */
      var stats = el('div', 'adm-stats');
      hote.appendChild(stats);

      var grille = el('div', 'adm-grid');
      /* « Lancées », pas « terminées » : sessionsPerDay compte toute séance
         DÉMARRÉE dans la journée, abandons et séances en cours comprises — sur
         les trois sources. Le sous-titre disait « terminées », ce qui était
         faux ; ça ne se voyait pas tant que la seule source réelle était le
         stockage local, qui n'écrit jamais un abandon. La part menée à terme se
         lit juste à droite, dans « Réussite moyenne ». */
      var cCourbe = UI.carte('Activité', { sub:'Séances lancées, par jour et par type.' });
      cCourbe.classList.add('c8');
      var cScore = UI.carte('Réussite moyenne', { sub:'Tous types de séances confondus.' });
      cScore.classList.add('c4');
      grille.appendChild(cCourbe); grille.appendChild(cScore);
      hote.appendChild(grille);

      UI.charger(stats, RT.data.overview({ days:jours }), function(o){
        var box = el('div', 'adm-stats adm-stats--3');   // six tuiles = deux lignes de trois
        var d = o.deltas || {};
        box.appendChild(UI.tuile({ icon:I.users, value:F.nb(o.users.total), label:'utilisateurs au total',
          hint:o.users.new != null ? '+' + F.nb(o.users.new) + ' sur la période' : null }));
        box.appendChild(UI.tuile({ icon:I.eye, value:F.nb(o.users.active), label:'utilisateurs actifs',
          delta:d.active }));
        box.appendChild(UI.tuile({ icon:I.play, value:F.nb(o.sessions.total), label:'séances lancées',
          delta:d.sessions }));
        box.appendChild(UI.tuile({ icon:I.target, value:F.nb(o.exercises.completed),
          label:'séances terminées',
          hint:o.sessions.abandoned != null
            ? F.nb(o.sessions.abandoned) + ' abandon' + (o.sessions.abandoned > 1 ? 's' : '') : null }));
        box.appendChild(UI.tuile({ icon:I.chart,
          value:o.score.avgPct == null ? '—' : o.score.avgPct + '<small> %</small>',
          label:'réussite moyenne', delta:d.score }));
        box.appendChild(UI.tuile({ icon:I.clock,
          value:o.sessions.avgDurationS == null ? '—' : F.duree(o.sessions.avgDurationS),
          label:'durée moyenne d\'une séance',
          hint:o.sessions.avgDurationS == null ? 'non mesurée par cette source' : null }));
        /* Les limites de la source sont dites ici, une fois, plutôt que répétées
           en petit sous chaque case vide. */
        if (o.notes && o.notes.length){
          var w = el('div');
          w.appendChild(box);
          w.appendChild(UI.notice(o.notes.join(' '), 'info', 'Ce que cette source ne peut pas mesurer'));
          w.firstChild.style.marginBottom = '14px';
          return w;
        }
        return box;
      }, 'Calcul des indicateurs…');

      UI.charger(cCourbe.body, RT.data.analytics({ days:jours }), function(a){
        var w = el('div');
        w.appendChild(UI.graphAire(a.sessionsPerDay, [
          { key:'scenario', label:'Scénarios', color:C.scenario },
          { key:'flight',   label:'Vols',      color:C.flight },
          { key:'spelling', label:'Épellation',color:C.spelling }
        ]));
        return w;
      }, 'Agrégation par jour…');

      UI.charger(cScore.body, RT.data.analytics({ days:jours }), function(a){
        var w = el('div');
        w.style.display = 'flex';
        w.style.flexDirection = 'column';
        w.style.alignItems = 'center';
        w.style.gap = '14px';
        w.appendChild(UI.anneau(a.totals.avgPct, 'de réussite', 132));
        var d = el('div');
        d.style.width = '100%';
        d.appendChild(UI.jauge(a.totals.successRate, 'Séances à 80 % ou plus',
          a.totals.successRate == null ? 'non mesurable' : 'sur ' + F.nb(a.totals.sessions) + ' séances'));
        if (a.totals.abandonRate != null){
          var j = UI.jauge(100 - a.totals.abandonRate, 'Séances menées à terme',
            a.totals.abandonRate + ' % d\'abandons');
          j.style.marginTop = '12px';
          d.appendChild(j);
        }
        w.appendChild(d);
        return w;
      }, 'Calcul…');

      /* ---- 3. Activité récente + points faibles collectifs ---- */
      var g2 = el('div', 'adm-grid');
      var cAct = UI.carte('Activité récente', { sub:'Les dernières séances, tous utilisateurs.' });
      cAct.classList.add('c7');
      var voirTout = UI.bouton('Voir les simulations',
        { onClick:function(){ ctx.go('admin/flights'); } });
      cAct.querySelector('.adm-card__head').appendChild(voirTout);

      var cFaible = UI.carte('Éléments les plus manqués',
        { sub:'Classés par axe de compétence — ce sur quoi ça coince.' });
      cFaible.classList.add('c5');
      g2.appendChild(cAct); g2.appendChild(cFaible);
      hote.appendChild(g2);

      UI.charger(cAct.body, RT.data.activity({ limit:12 }), function(rows){
        if (!rows || !rows.length)
          return UI.etatVide('Aucune séance enregistrée',
            'Les séances apparaîtront ici dès qu\'un utilisateur en terminera une.', I.mic);
        var f = el('div', 'adm-feed');
        rows.forEach(function(a){ f.appendChild(ligneActivite(a, ctx)); });
        return f;
      }, 'Lecture de l\'activité…');

      UI.charger(cFaible.body, RT.data.analytics({ days:jours }), function(a){
        if (!a.topMissed || !a.topMissed.length)
          return UI.etatVide('Rien de manqué à répétition', null, I.target);
        return UI.graphBarres(a.topMissed.slice(0, 9).map(function(m){
          return { label:m.label, n:m.n,
                   valueText:m.n + '  ·  ' + RT.taxonomy.labelOf(m.axis) };
        }), { onClick:function(){ ctx.go('admin/analytics'); } });
      }, 'Analyse des oublis…');
    }
  });
})();
