/* =============================================================================
   RadioTrainer — Admin · /admin/analytics
   -----------------------------------------------------------------------------
   La page est organisée autour des QUESTIONS, pas autour des colonnes de la
   base. Chaque bloc porte en sous-titre la question à laquelle il répond :

     · Sur quoi mes utilisateurs ont-ils le plus de difficultés ?
     · Quel exercice fonctionne le mieux — et lequel fonctionne mal ?
     · À quel moment les utilisateurs abandonnent-ils ?
     · Que choisissent-ils quand on les laisse libres ?

   Un graphique qui ne répond à aucune question n'a rien à faire ici.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin, UI = RT.ui;
  var el = UI.el, esc = UI.esc, I = UI.I, F = UI.F, C = UI.couleurs;

  RT.page('admin/analytics', {
    render:function(hote, ctx){
      var jours = RT.state.days;

      var tete = el('div', 'adm-head');
      var g = el('div');
      g.appendChild(el('h1', 'adm-h1', 'Analytics'));
      g.appendChild(el('p', 'adm-sub',
        'Comment l\'application est réellement utilisée, sur ' + jours + ' jours. '
      + 'La période se règle en haut à droite.'));
      tete.appendChild(g);
      hote.appendChild(tete);

      var zone = el('div');
      zone.style.display = 'flex'; zone.style.flexDirection = 'column'; zone.style.gap = 'var(--adm-gap)';
      hote.appendChild(zone);

      UI.charger(zone, RT.data.analytics({ days:jours }), function(a){
        var w = el('div');
        w.style.display = 'flex'; w.style.flexDirection = 'column'; w.style.gap = 'var(--adm-gap)';
        var t = a.totals || {};

        /* ---- Chiffres de tête ---- */
        var st = el('div', 'adm-stats adm-stats--4');   // huit tuiles = deux lignes de quatre
        st.appendChild(UI.tuile({ icon:I.users, value:F.nb(t.users), label:'utilisateurs actifs' }));
        st.appendChild(UI.tuile({ icon:I.play, value:F.nb(t.sessions), label:'séances' }));
        st.appendChild(UI.tuile({ icon:I.plane, value:F.nb(t.flights), label:'simulations de vol' }));
        st.appendChild(UI.tuile({ icon:I.book, value:F.nb(t.scenarios), label:'scénarios joués' }));
        st.appendChild(UI.tuile({ icon:I.clock, value:F.duree(t.avgDurationS),
          label:'durée moyenne',
          hint:t.avgDurationS == null ? 'non mesurée par cette source' : null }));
        st.appendChild(UI.tuile({ icon:I.target,
          value:t.avgPct == null ? '—' : t.avgPct + '<small> %</small>', label:'score moyen' }));
        st.appendChild(UI.tuile({ icon:I.chart,
          value:t.successRate == null ? '—' : t.successRate + '<small> %</small>',
          label:'séances réussies (≥ 80 %)' }));
        st.appendChild(UI.tuile({ icon:I.warn,
          value:t.abandonRate == null ? '—' : t.abandonRate + '<small> %</small>',
          label:'taux d\'abandon', tone:'warn',
          hint:t.abandonRate == null ? 'non enregistré par cette source' : null }));
        w.appendChild(st);

        if (a.notes && a.notes.length)
          w.appendChild(UI.notice(a.notes.join(' '), 'info', 'Limites de la source courante'));

        /* ---- Volume + utilisateurs actifs ---- */
        var g1 = el('div', 'adm-grid');
        var cVol = UI.carte('Séances par jour',
          { sub:'Le volume monte-t-il, et par quel type de séance ?' });
        cVol.classList.add('c7');
        cVol.body.appendChild(UI.graphAire(a.sessionsPerDay, [
          { key:'scenario', label:'Scénarios', color:C.scenario },
          { key:'flight',   label:'Vols',      color:C.flight },
          { key:'spelling', label:'Épellation',color:C.spelling }
        ], { height:200 }));
        g1.appendChild(cVol);

        var cAct = UI.carte('Utilisateurs actifs par jour',
          { sub:'Combien de personnes différentes s\'entraînent chaque jour ?' });
        cAct.classList.add('c5');
        cAct.body.appendChild(UI.graphAire(a.activeUsers,
          [{ key:'n', label:'Utilisateurs actifs', color:C.scenario }], { height:200 }));
        g1.appendChild(cAct);
        w.appendChild(g1);

        /* ---- Difficultés ---- */
        var g2 = el('div', 'adm-grid');
        var cDiff = UI.carte('Sur quoi ça coince',
          { sub:'« Sur quoi mes utilisateurs ont-ils le plus de difficultés ? » — '
               + 'éléments de phraséologie les plus souvent manqués.' });
        cDiff.classList.add('c6');
        if (a.topMissed && a.topMissed.length){
          cDiff.body.appendChild(UI.graphBarres(a.topMissed.map(function(m){
            return { label:m.label, n:m.n, valueText:m.n + '  ·  ' + RT.taxonomy.labelOf(m.axis),
                     tone:'bas' };
          })));
        } else {
          cDiff.body.appendChild(UI.etatVide('Aucun élément manqué sur la période', null, I.target));
        }
        g2.appendChild(cDiff);

        var cAxes = UI.carte('Par axe de compétence',
          { sub:'Le même constat, regroupé : radio, navigation, transpondeur, procédures, '
               + 'imprévus, urgences.' });
        cAxes.classList.add('c6');
        var parAxe = {};
        RT.taxonomy.axes.forEach(function(x){ parAxe[x.key] = 0; });
        (a.topMissed || []).forEach(function(m){ parAxe[m.axis] += m.n; });
        var totalAxes = RT.taxonomy.axes.reduce(function(s2, x){ return s2 + parAxe[x.key]; }, 0);
        if (totalAxes){
          cAxes.body.appendChild(UI.graphBarres(RT.taxonomy.axes.map(function(x){
            return { label:x.label, n:parAxe[x.key],
                     valueText:parAxe[x.key] + '  ('
                       + Math.round(parAxe[x.key] / totalAxes * 100) + ' %)',
                     tone:'bas' };
          }).sort(function(p, q){ return q.n - p.n; })));
          cAxes.body.appendChild(UI.notice(
            'Le classement est établi à partir des libellés d\'éléments attendus par les scénarios '
          + '(motsCles) : ce sont les mêmes que ceux du manuel DSNA, pas une catégorisation '
          + 'inventée pour la console.', 'info'));
        } else {
          cAxes.body.appendChild(UI.etatVide('Pas encore de données par axe', null, I.chart));
        }
        g2.appendChild(cAxes);
        w.appendChild(g2);

        /* ---- Exercices ---- */
        var cEx = UI.carte('Quels exercices fonctionnent',
          { sub:'« Quel exercice fonctionne le mieux ? » — nombre de passages et réussite moyenne. '
               + 'Un exercice très joué mais mal réussi est un exercice à revoir, pas à supprimer.' });
        var actEx = UI.bouton('Gérer les exercices',
          { icon:I.book, onClick:function(){ ctx.go('admin/exercises'); } });
        cEx.querySelector('.adm-card__head').appendChild(actEx);
        if (a.topExercises && a.topExercises.length){
          cEx.body.appendChild(UI.table({
            dense:true,
            onRow:function(){ ctx.go('admin/exercises'); },
            columns:[
              { key:'title', label:'Exercice', cell:function(r){
                  return '<span class="strong">' + esc(r.title) + '</span>'; } },
              { key:'runs', label:'Passages', align:'right', cls:'num',
                cell:function(r){ return F.nb(r.runs); } },
              { key:'part', label:'Part des passages', width:'34%', cell:function(r){
                  var max = a.topExercises[0].runs || 1;
                  return '<span class="adm-bar__track" style="display:block"><i style="width:'
                       + Math.max(2, r.runs / max * 100) + '%"></i></span>'; } },
              { key:'avgPct', label:'Réussite moyenne', align:'right',
                cell:function(r){ return UI.pastillePct(r.avgPct); } }
            ],
            rows:a.topExercises
          }));
        } else {
          cEx.body.appendChild(UI.etatVide('Aucun scénario joué sur la période', null, I.book));
        }
        w.appendChild(cEx);

        /* ---- Abandons ---- */
        var cDrop = UI.carte('À quel moment on abandonne',
          { sub:'« À quel moment les utilisateurs abandonnent-ils ? » — nombre de vols encore en '
               + 'cours à chaque phase, et pertes entre deux phases.' });
        if (a.dropoff && a.dropoff.length){
          cDrop.body.appendChild(UI.entonnoir(a.dropoff));
          var pires = a.dropoff.map(function(d, i){
            return { i:i, phase:d.phase, perte:(d.started || 0) - (d.completed || 0),
                     taux:d.started ? (d.started - d.completed) / d.started : 0 };
          }).filter(function(d){ return d.perte > 0; })
            .sort(function(p, q){ return q.taux - p.taux; }).slice(0, 3);
          if (pires.length)
            cDrop.body.appendChild(UI.notice(
              'Les phases les plus coûteuses : '
              + pires.map(function(d){
                  return d.phase + ' (' + Math.round(d.taux * 100) + ' % de perte)'; }).join(', ')
              + '. C\'est là qu\'il faut regarder d\'abord.', 'warn', 'Lecture'));
        } else {
          cDrop.body.appendChild(UI.etatVide('Abandons non mesurés par cette source',
            'Le suivi des abandons demande d\'enregistrer une séance dès son démarrage, ce que '
          + 'le stockage local ne fait pas : seules les séances terminées y sont écrites. '
          + 'La table `sessions` avec son statut « in_progress » comblera ce manque.', I.warn));
        }
        w.appendChild(cDrop);

        /* ---- Choix libres ---- */
        var g3 = el('div', 'adm-grid');
        function carteTop(titre, sub, items, span, mapper){
          var c = UI.carte(titre, { sub:sub });
          c.classList.add(span);
          if (items && items.length) c.body.appendChild(UI.graphBarres(items.map(mapper)));
          else c.body.appendChild(UI.etatVide('Pas de données sur la période', null, I.chart));
          return c;
        }
        g3.appendChild(carteTop('Appareils les plus utilisés',
          'Ce que les élèves choisissent quand on les laisse libres.',
          a.topAircraft, 'c4', function(x){ return { label:x.name, n:x.n }; }));
        g3.appendChild(carteTop('Aérodromes les plus utilisés',
          'Départs et arrivées confondus.',
          a.topAirfields, 'c4', function(x){
            return { label:x.icao + (x.name ? ' — ' + x.name : ''), n:x.n }; }));
        g3.appendChild(carteTop('Imprévus rencontrés',
          'Les situations que le simulateur a réellement déclenchées.',
          a.topAleas, 'c4', function(x){ return { label:x.label, n:x.n, tone:'moy' }; }));
        w.appendChild(g3);

        return w;
      }, 'Agrégation des données…');
    }
  });
})();
