/* =============================================================================
   RadioTrainer — Admin · /admin/flights et /admin/flights/:id
   -----------------------------------------------------------------------------
   L'Admin ne simule rien : il lit la TRACE laissée par le module Navigation
   d'index.html. Un vol y est construit dynamiquement par buildFlight() et n'est
   jamais sérialisé ; ce qui reste, c'est la suite des échanges (phase, station,
   fréquence, phrase attendue, phrase dite, éléments manqués). C'est exactement
   ce que cette page montre.

   La fiche d'un vol est le cœur du « pourquoi ? » : on y lit, échange par
   échange, ce qui était attendu et ce qui a été dit.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin, UI = RT.ui;
  var el = UI.el, esc = UI.esc, I = UI.I, F = UI.F;

  var etat = { q:'', status:'all', level:'all', alea:'all', sort:'at', dir:'desc', page:1 };

  function tonStatut(s){
    return s === 'completed' ? 'ok' : (s === 'abandoned' ? 'bad' : 'warn');
  }

  /* ---------------------------------------------------------------------------
     LISTE
     ------------------------------------------------------------------------ */
  RT.page('admin/flights', {
    render:function(hote, ctx){
      var tete = el('div', 'adm-head');
      var g = el('div');
      g.appendChild(el('h1', 'adm-h1', 'Simulations'));
      g.appendChild(el('p', 'adm-sub',
        'Les vols menés dans la page Navigation. Ouvrez-en un pour voir le déroulé complet, '
      + 'échange par échange.'));
      tete.appendChild(g);
      hote.appendChild(tete);

      var carte = UI.carte(null);
      hote.appendChild(carte);
      var resultats = el('div');

      var optsAlea = [{ v:'all', l:'Tous' }, { v:'with', l:'Avec imprévu' }, { v:'none', l:'Sans imprévu' }];
      Object.keys(RT.labels.alea).forEach(function(k){
        optsAlea.push({ v:k, l:RT.labels.alea[k] });
      });

      carte.body.appendChild(UI.barreOutils({
        search:{ value:etat.q, placeholder:'Utilisateur, terrain, appareil, imprévu…',
                 onInput:function(v){ etat.q = v; etat.page = 1; peindre(); } },
        filters:[
          { label:'Statut', value:etat.status, options:[
              { v:'all', l:'Tous' }, { v:'completed', l:'Terminés' },
              { v:'abandoned', l:'Abandonnés' }, { v:'in_progress', l:'En cours' }],
            onChange:function(v){ etat.status = v; etat.page = 1; peindre(); } },
          { label:'Mode', value:etat.level, options:[
              { v:'all', l:'Tous' }, { v:'debutant', l:'Débutant' }, { v:'reel', l:'Réel' }],
            onChange:function(v){ etat.level = v; etat.page = 1; peindre(); } },
          { label:'Imprévu', value:etat.alea, options:optsAlea,
            onChange:function(v){ etat.alea = v; etat.page = 1; peindre(); } }
        ]
      }));
      carte.body.appendChild(resultats);

      function peindre(){
        UI.charger(resultats, RT.data.flights(etat), function(res){
          var w = el('div');
          w.appendChild(UI.table({
            sort:etat.sort, dir:etat.dir,
            onSort:function(k, d){ etat.sort = k; etat.dir = d; etat.page = 1; peindre(); },
            onRow:function(r){ ctx.go('admin/flights/' + r.id); },
            columns:[
              { key:'at', label:'Date', sortable:true, descFirst:true, cls:'num muted',
                cell:function(r){ return esc(F.dateHeure(r.at)); } },
              { key:'userName', label:'Utilisateur', sortable:true, cell:function(r){
                  return '<span class="strong">' + esc(r.userName || '—') + '</span>'; } },
              { key:'title', label:'Vol', sortable:true, cell:function(r){
                  return '<span class="adm-cellmain"><b>' + esc(r.title) + '</b><span>'
                    + esc([r.depName, r.arrName].filter(Boolean).join(' → ')) + '</span></span>'; } },
              { key:'aircraft', label:'Appareil', sortable:true, hideSm:true, cls:'muted',
                cell:function(r){ return esc(r.aircraft || '—'); } },
              { key:'level', label:'Mode', hideSm:true, cell:function(r){
                  return r.level ? UI.badge(RT.labels.level[r.level] || r.level,
                    r.level === 'reel' ? 'warn' : null) : '—'; } },
              { key:'alea', label:'Imprévu', hideSm:true, cls:'muted', cell:function(r){
                  return r.alea ? esc(RT.labels.alea[r.alea] || r.aleaLabel || r.alea) : '—'; } },
              { key:'durationS', label:'Durée', sortable:true, descFirst:true, align:'right',
                cls:'num muted', hideSm:true, cell:function(r){ return esc(F.duree(r.durationS)); } },
              { key:'status', label:'Statut', sortable:true, cell:function(r){
                  return UI.badge(RT.labels.status[r.status] || r.status, tonStatut(r.status)); } },
              { key:'scorePct', label:'Score', sortable:true, descFirst:true, align:'right',
                cell:function(r){ return UI.pastillePct(r.scorePct); } }
            ],
            rows:res.rows,
            empty:UI.etatVide('Aucune simulation ne correspond',
              'Élargissez les filtres, ou changez de source de données.', I.plane)
          }));
          w.appendChild(UI.pagination({ page:res.page, pages:res.pages, total:res.total,
            perPage:res.perPage, onPage:function(p){ etat.page = p; peindre(); } }));
          return w;
        }, 'Lecture des simulations…');
      }
      peindre();
    }
  });

  /* ---------------------------------------------------------------------------
     FICHE D'UN VOL — le déroulé complet
     ------------------------------------------------------------------------ */
  RT.page('admin/flights/:id', {
    render:function(hote, ctx){
      var id = ctx.params.id;
      var w0 = el('div');
      w0.style.display = 'flex'; w0.style.flexDirection = 'column'; w0.style.gap = 'var(--adm-gap)';
      hote.appendChild(w0);

      UI.charger(w0, RT.data.flight(id), function(v){
        if (!v){
          ctx.setCrumb('Introuvable');
          return UI.etatVide('Simulation introuvable',
            'L\'identifiant « ' + id + ' » n\'existe pas dans la source courante.', I.warn);
        }
        ctx.setCrumb(v.title);
        var w = el('div');
        w.style.display = 'flex'; w.style.flexDirection = 'column'; w.style.gap = 'var(--adm-gap)';

        /* ---- En-tête ---- */
        var tete = el('div', 'adm-head');
        var g = el('div');
        g.appendChild(el('h1', 'adm-h1', esc(v.title)));
        var sous = el('p', 'adm-sub');
        sous.innerHTML = esc(F.dateHeure(v.at)) + ' · ' + esc(v.userName || '—') + ' '
          + UI.badge(RT.labels.status[v.status] || v.status, tonStatut(v.status))
          + (v.level ? ' ' + UI.badge(RT.labels.level[v.level] || v.level,
              v.level === 'reel' ? 'warn' : null) : '');
        g.appendChild(sous);
        tete.appendChild(g);
        var act = el('div', 'adm-head__r');
        act.appendChild(UI.bouton('Retour aux simulations',
          { icon:I.back, onClick:function(){ ctx.go('admin/flights'); } }));
        if (v.userId) act.appendChild(UI.bouton('Fiche de l\'utilisateur',
          { icon:I.users, onClick:function(){ ctx.go('admin/users/' + v.userId); } }));
        tete.appendChild(act);
        w.appendChild(tete);

        /* ---- Chiffres du vol ---- */
        var st = el('div', 'adm-stats adm-stats--4');
        st.appendChild(UI.tuile({ icon:I.target,
          value:v.scoreTotal ? v.scoreOk + '<small> / ' + v.scoreTotal + '</small>' : '—',
          label:'éléments corrects' }));
        st.appendChild(UI.tuile({ icon:I.chart,
          value:v.scorePct == null ? '—' : v.scorePct + '<small> %</small>', label:'de réussite' }));
        st.appendChild(UI.tuile({ icon:I.clock, value:F.duree(v.durationS), label:'durée du vol',
          hint:v.durationS == null ? 'non mesurée par cette source' : null }));
        var nEch = v.steps ? v.steps.length : null;
        var nRep = v.steps ? v.steps.filter(function(s){ return s.answered; }).length : null;
        st.appendChild(UI.tuile({ icon:I.mic,
          value:nEch == null ? '—' : nRep + '<small> / ' + nEch + '</small>',
          label:'échanges répondus' }));
        w.appendChild(st);

        /* ---- Paramètres du vol ---- */
        var g1 = el('div', 'adm-grid');
        var cCtx = UI.carte('Paramètres du vol');
        cCtx.classList.add('c5');
        cCtx.body.appendChild(UI.fiche([
          ['Identifiant', v.id],
          ['Utilisateur', v.userName || '—'],
          ['Départ', v.dep ? v.dep + (v.depName ? ' — ' + v.depName : '') : '—'],
          ['Arrivée', v.arr ? v.arr + (v.arrName ? ' — ' + v.arrName : '') : 'vol local'],
          v.diverted ? ['Déroutement', v.diverted] : null,
          ['Piste', v.runway || '—'],
          ['Appareil', v.aircraft || '—'],
          ['Altitude de croisière', v.cruiseAlt ? v.cruiseAlt + ' ft' : '—'],
          ['Passagers', v.pax == null ? '—' : String(v.pax)],
          ['Mode de vol', RT.labels.mode[v.mode] || v.mode || '—'],
          ['Difficulté', RT.labels.level[v.level] || v.level || '—'],
          ['Transpondeur', v.squawk || '—'],
          v.radio ? ['Radio (fin de vol)', 'active ' + v.radio.active + ' · standby ' + v.radio.standby] : null,
          ['Imprévu', v.alea ? (RT.labels.alea[v.alea] || v.aleaLabel || v.alea) : 'aucun']
        ], { }));
        g1.appendChild(cCtx);

        /* ---- Erreurs par axe ---- */
        var cAxes = UI.carte('Où ça a coincé',
          { sub:'Répartition des éléments manqués par axe de compétence.' });
        cAxes.classList.add('c7');
        var manques = {};
        (v.missed || []).forEach(function(m){ manques[m] = (manques[m] || 0) + 1; });
        if (v.steps) v.steps.forEach(function(s){
          (s.missed || []).forEach(function(m){ manques[m] = (manques[m] || 0) + 1; });
        });
        /* Un même libellé peut arriver des deux côtés (missed agrégé ET steps) :
           on ne double pas, on prend la valeur la plus élevée par libellé. */
        var listeM = Object.keys(manques);
        if (!listeM.length){
          cAxes.body.appendChild(UI.etatVide('Aucun élément manqué',
            'Tout ce qui était attendu a été dit.', I.target));
        } else {
          var parAxe = {};
          RT.taxonomy.axes.forEach(function(a){ parAxe[a.key] = 0; });
          listeM.forEach(function(m){ parAxe[RT.taxonomy.axisOf(m)] += 1; });
          cAxes.body.appendChild(UI.graphBarres(
            RT.taxonomy.axes.map(function(a){
              return { label:a.label, n:parAxe[a.key],
                       tone:parAxe[a.key] === 0 ? 'bon' : (parAxe[a.key] > 2 ? 'bas' : 'moy') };
            }).filter(function(x){ return x.n > 0; })
              .sort(function(a, b){ return b.n - a.n; })));
          var chips = el('div', 'adm-step__miss');
          chips.style.marginTop = '13px';
          listeM.forEach(function(m){ chips.innerHTML += UI.badge(m, 'bad'); });
          cAxes.body.appendChild(chips);
        }
        g1.appendChild(cAxes);
        w.appendChild(g1);

        /* ---- Le déroulé ---- */
        var cSteps = UI.carte('Déroulé de la simulation',
          { sub:'Phrase attendue et phrase prononcée, échange par échange. C\'est ici qu\'on '
               + 'comprend ce qui s\'est passé.' });
        w.appendChild(cSteps);
        if (!v.steps || !v.steps.length){
          cSteps.body.appendChild(UI.etatVide('Trace non disponible',
            v.status === 'in_progress'
              ? 'Ce vol est encore en cours : la trace ne sera écrite qu\'au débriefing.'
              : 'Cette source ne conserve pas le détail des échanges pour cette séance.',
            I.info));
        } else {
          /* Un filtre « seulement les échanges ratés » : sur un vol de trente
             échanges, on cherche les trois qui ont posé problème. */
          var seulementRates = false;
          var liste = el('div', 'adm-steps');
          var barre = el('div', 'adm-btnrow');
          barre.style.marginBottom = '13px';
          var bFiltre = UI.bouton('N\'afficher que les échanges avec un oubli', {
            onClick:function(){
              seulementRates = !seulementRates;
              bFiltre.classList.toggle('cta', seulementRates);
              bFiltre.querySelector('span').textContent = seulementRates
                ? 'Afficher tous les échanges'
                : 'N\'afficher que les échanges avec un oubli';
              peindreSteps();
            } });
          barre.appendChild(bFiltre);
          cSteps.body.appendChild(barre);
          cSteps.body.appendChild(liste);

          function peindreSteps(){
            UI.vide(liste);
            var rows = v.steps.filter(function(s){
              return !seulementRates || (s.missed && s.missed.length);
            });
            if (!rows.length){
              liste.appendChild(UI.etatVide('Aucun échange avec un oubli',
                'Ce vol n\'a rien laissé passer.', I.target));
              return;
            }
            rows.forEach(function(s){
              var rate = s.missed && s.missed.length;
              var cls = !s.answered ? 'skip' : (rate ? 'miss' : 'ok');
              var d = el('div', 'adm-step adm-step--' + cls);
              var html =
                '<div class="adm-step__head">'
                + '<span class="adm-step__n">#' + s.idx + '</span>'
                + '<span class="adm-step__ph">' + esc(s.phase || '—') + '</span>'
                + (s.station ? '<span class="adm-badge">' + esc(s.station) + '</span>' : '')
                + (s.freq ? '<span class="adm-step__freq">' + esc(s.freq) + '</span>' : '')
                + '</div>';
              if (!s.answered){
                html += '<div class="adm-step__line"><b>Non traité</b><span>'
                     + 'Le vol s\'est arrêté avant cet échange.</span></div>';
              } else {
                html += '<div class="adm-step__line"><b>Attendu</b><span>'
                     + esc(s.expected || '—') + '</span></div>'
                     + '<div class="adm-step__line"><b>Dit</b><span>'
                     + (s.said ? esc(s.said) : '<i>rien n\'a été enregistré</i>') + '</span></div>';
              }
              d.innerHTML = html;
              if (rate){
                var chips = el('div', 'adm-step__miss');
                s.missed.forEach(function(m){ chips.innerHTML += UI.badge(m, 'bad'); });
                d.appendChild(chips);
              }
              liste.appendChild(d);
            });
          }
          peindreSteps();
        }
        return w;
      }, 'Ouverture de la simulation…');
    }
  });
})();
