/* =============================================================================
   RadioTrainer — Admin · /admin/users et /admin/users/:id
   -----------------------------------------------------------------------------
   La liste sert à TROUVER quelqu'un ; la fiche sert à COMPRENDRE quelqu'un.
   Deux intentions différentes, donc deux mises en page différentes — pas la
   même table affichée deux fois avec plus ou moins de colonnes.

   Détail d'implémentation qui compte : la barre d'outils est construite UNE
   fois et seuls les résultats sont repeints. Reconstruire la barre à chaque
   frappe ferait perdre le curseur du champ de recherche à chaque lettre.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin, UI = RT.ui, U = RT.util;
  var el = UI.el, esc = UI.esc, I = UI.I, F = UI.F;

  /* Les filtres survivent à un aller-retour vers une fiche : revenir sur une
     liste remise à zéro après avoir consulté trois profils est une punition. */
  var etat = { q:'', status:'all', role:'all', sort:'lastSeenAt', dir:'desc', page:1 };

  function tonStatut(s){ return s === 'active' ? 'ok' : (s === 'suspended' ? 'bad' : 'warn'); }
  function tonRole(r){ return r === 'admin' ? 'violet' : (r === 'user' ? null : 'warn'); }

  /* ---------------------------------------------------------------------------
     LISTE
     ------------------------------------------------------------------------ */
  RT.page('admin/users', {
    render:function(hote, ctx){
      var tete = el('div', 'adm-head');
      var g = el('div');
      g.appendChild(el('h1', 'adm-h1', 'Utilisateurs'));
      g.appendChild(el('p', 'adm-sub',
        'Rechercher, filtrer et ouvrir une fiche d\'analyse. Cliquez une ligne pour voir le détail.'));
      tete.appendChild(g);
      hote.appendChild(tete);

      var carte = UI.carte(null, { plain:true });
      carte.classList.add('adm-card');
      carte.classList.remove('adm-card--plain');
      hote.appendChild(carte);

      var resultats = el('div');

      var barre = UI.barreOutils({
        search:{ value:etat.q, placeholder:'Nom, email, indicatif, terrain…',
                 onInput:function(v){ etat.q = v; etat.page = 1; peindre(); } },
        filters:[
          { label:'Statut', value:etat.status, options:[
              { v:'all', l:'Tous' }, { v:'active', l:'Actifs' },
              { v:'suspended', l:'Suspendus' }, { v:'pending', l:'En attente' }],
            onChange:function(v){ etat.status = v; etat.page = 1; peindre(); } },
          { label:'Rôle', value:etat.role, options:[
              { v:'all', l:'Tous' }, { v:'user', l:'Élèves' }, { v:'admin', l:'Administrateurs' },
              { v:'moderator', l:'Modérateurs' }, { v:'content_manager', l:'Contenu' }],
            onChange:function(v){ etat.role = v; etat.page = 1; peindre(); } }
        ]
      });
      carte.body.appendChild(barre);
      carte.body.appendChild(resultats);

      function peindre(){
        UI.charger(resultats, RT.data.users(etat), function(res){
          var w = el('div');
          w.appendChild(UI.table({
            sort:etat.sort, dir:etat.dir,
            onSort:function(k, d){ etat.sort = k; etat.dir = d; etat.page = 1; peindre(); },
            onRow:function(row){ ctx.go('admin/users/' + row.id); },
            columns:[
              { key:'name', label:'Utilisateur', sortable:true, cell:function(r){
                  return '<span class="adm-cellmain"><b>' + esc(r.name) + '</b>'
                       + '<span>' + esc(r.email || r.callsign || r.id) + '</span></span>'; } },
              { key:'role', label:'Rôle', sortable:true, hideSm:true, cell:function(r){
                  return UI.badge(RT.labels.role[r.role] || r.role, tonRole(r.role)); } },
              { key:'status', label:'Statut', sortable:true, cell:function(r){
                  return UI.badge(RT.labels.userStatus[r.status] || r.status, tonStatut(r.status)); } },
              { key:'createdAt', label:'Inscription', sortable:true, descFirst:true, hideSm:true,
                align:'right', cls:'num muted', cell:function(r){ return esc(F.date(r.createdAt)); } },
              { key:'sessions', label:'Séances', sortable:true, descFirst:true, align:'right',
                cls:'num', cell:function(r){
                  return F.nb(r.sessions) + (r.flights ? '<span class="muted"> · '
                       + F.nb(r.flights) + ' vol' + (r.flights > 1 ? 's' : '')
                       + '</span>' : ''); } },
              { key:'progressPct', label:'Progression', sortable:true, descFirst:true, hideSm:true,
                width:'150px', cell:function(r){
                  return '<span class="adm-bar__track" style="display:block"><i style="width:'
                       + Math.max(2, r.progressPct || 0) + '%" class="'
                       + F.classePct(r.progressPct) + '"></i></span>'; } },
              { key:'avgPct', label:'Score moyen', sortable:true, descFirst:true, align:'right',
                cell:function(r){ return UI.pastillePct(r.avgPct); } },
              { key:'lastSeenAt', label:'Dernière séance', sortable:true, descFirst:true,
                align:'right', cls:'muted', cell:function(r){ return esc(F.depuis(r.lastSeenAt)); } }
            ],
            rows:res.rows,
            empty:UI.etatVide('Aucun utilisateur ne correspond',
              'Essayez un autre terme, ou remettez les filtres sur « Tous ».', I.search)
          }));
          w.appendChild(UI.pagination({ page:res.page, pages:res.pages, total:res.total,
            perPage:res.perPage, onPage:function(p){ etat.page = p; peindre(); } }));
          return w;
        }, 'Lecture des utilisateurs…');
      }
      peindre();
    }
  });

  /* ---------------------------------------------------------------------------
     FICHE
     ------------------------------------------------------------------------ */
  RT.page('admin/users/:id', {
    render:function(hote, ctx){
      var id = ctx.params.id;
      var enveloppe = el('div');
      enveloppe.style.display = 'flex';
      enveloppe.style.flexDirection = 'column';
      enveloppe.style.gap = 'var(--adm-gap)';
      hote.appendChild(enveloppe);

      UI.charger(enveloppe, RT.data.user(id), function(u){
        if (!u){
          ctx.setCrumb('Introuvable');
          return UI.etatVide('Utilisateur introuvable',
            'L\'identifiant « ' + id + ' » n\'existe pas dans la source courante.', I.warn);
        }
        ctx.setCrumb(u.name);
        var w = el('div');
        w.style.display = 'flex'; w.style.flexDirection = 'column'; w.style.gap = 'var(--adm-gap)';

        /* ---- En-tête ---- */
        var tete = el('div', 'adm-head');
        var g = el('div');
        var h = el('h1', 'adm-h1', esc(u.name));
        g.appendChild(h);
        var sous = el('p', 'adm-sub');
        sous.innerHTML = esc(u.email || 'pas d\'adresse enregistrée')
          + ' · ' + UI.badge(RT.labels.role[u.role] || u.role, tonRole(u.role))
          + ' ' + UI.badge(RT.labels.userStatus[u.status] || u.status, tonStatut(u.status))
          + (u.plan ? ' ' + UI.badge('Abonnement : ' + u.plan, u.plan === 'pro' ? 'violet' : null) : '');
        g.appendChild(sous);
        tete.appendChild(g);
        var act = el('div', 'adm-head__r');
        act.appendChild(UI.bouton('Retour à la liste',
          { icon:I.back, onClick:function(){ ctx.go('admin/users'); } }));
        act.appendChild(UI.bouton('Voir son expérience',
          { icon:I.eye, cls:'cta', onClick:function(){ ouvrirVueEleve(u); } }));
        tete.appendChild(act);
        w.appendChild(tete);

        /* ---- Ligne 1 : identité + progression ---- */
        var g1 = el('div', 'adm-grid');

        var cInfo = UI.carte('Informations générales');
        cInfo.classList.add('c5');
        cInfo.body.appendChild(UI.fiche([
          ['Identifiant', u.id],
          ['Nom', u.name],
          ['Email', u.email || '—'],
          ['Indicatif', u.callsign || '—'],
          ['Rôle', RT.labels.role[u.role] || u.role],
          ['Statut', RT.labels.userStatus[u.status] || u.status],
          ['Abonnement', u.plan || 'non géré pour l\'instant'],
          ['Inscription', F.date(u.createdAt) + (u.createdAt ? ' (' + F.depuis(u.createdAt) + ')' : '')],
          ['Dernière séance', F.depuis(u.lastSeenAt)],
          u.homeIcao ? ['Terrain habituel', u.homeIcao] : null,
          u.aircraft ? ['Appareil', u.aircraft] : null
        ]));
        if (u.notes) cInfo.body.appendChild(UI.notice(u.notes, 'info'));
        g1.appendChild(cInfo);

        var cProg = UI.carte('Progression');
        cProg.classList.add('c7');
        var bloc = el('div');
        bloc.style.display = 'flex';
        bloc.style.gap = '22px';
        bloc.style.flexWrap = 'wrap';
        bloc.style.alignItems = 'center';
        bloc.appendChild(UI.anneau(u.progressPct, 'de progression', 128));
        var st = el('div', 'adm-stats');
        st.style.flex = '1 1 300px';
        /* Deux colonnes fixes : quatre tuiles en auto-fit donnaient 3 + 1, une
           orpheline à côté de l'anneau. minmax(0,…) autorise la compression, donc
           ça tient aussi sur un téléphone. */
        st.style.gridTemplateColumns = 'repeat(2,minmax(0,1fr))';
        st.style.maxWidth = '480px';
        st.appendChild(UI.tuile({ icon:I.play, value:F.nb(u.sessions), label:'séances au total' }));
        st.appendChild(UI.tuile({ icon:I.plane, value:F.nb(u.flights), label:'vols réalisés' }));
        st.appendChild(UI.tuile({ icon:I.target,
          value:u.avgPct == null ? '—' : u.avgPct + '<small> %</small>', label:'score moyen' }));
        st.appendChild(UI.tuile({ icon:I.clock,
          value:u.trainingS == null ? '—' : F.duree(u.trainingS),
          label:'temps d\'entraînement',
          hint:u.trainingS == null ? 'non mesuré par cette source' : null }));
        bloc.appendChild(st);
        cProg.body.appendChild(bloc);
        g1.appendChild(cProg);
        w.appendChild(g1);

        /* ---- Ligne 2 : points faibles ---- */
        var cFaible = UI.carte('Points faibles',
          { sub:'Six axes de compétence. Le pourcentage est la part d\'éléments réussis sur l\'axe.' });
        w.appendChild(cFaible);
        UI.charger(cFaible.body, RT.data.userWeaknesses(u.id), function(axes){
          if (!axes || !axes.length)
            return UI.etatVide('Pas encore assez de séances',
              'Les axes de compétence se calculent à partir des éléments manqués.', I.chart);
          var box = el('div', 'adm-gauges');
          axes.slice().sort(function(a, b){
            return (a.pct == null ? 999 : a.pct) - (b.pct == null ? 999 : b.pct);
          }).forEach(function(a){
            box.appendChild(UI.jauge(a.pct, a.label,
              a.missed ? a.missed + ' oubli' + (a.missed > 1 ? 's' : '') + ' · ' + a.desc : a.desc));
          });
          return box;
        }, 'Analyse des axes…');

        /* ---- Ligne 3 : activité ---- */
        var cAct = UI.carte('Activité récente',
          { sub:'Chaque ligne ouvre le détail de la séance.' });
        w.appendChild(cAct);
        UI.charger(cAct.body, RT.data.userSessions(u.id, { limit:40 }), function(rows){
          if (!rows || !rows.length)
            return UI.etatVide('Aucune séance', 'Cet utilisateur n\'a encore rien terminé.', I.mic);
          return UI.table({
            dense:true,
            onRow:function(r){
              if (r.kind === 'flight') ctx.go('admin/flights/' + r.id);
              else detailSeance(r);
            },
            columns:[
              { key:'at', label:'Date', align:'left', cls:'num muted',
                cell:function(r){ return esc(F.dateHeure(r.at)); } },
              { key:'kind', label:'Type', cell:function(r){
                  return UI.badge(RT.labels.kind[r.kind] || r.kind,
                    r.kind === 'flight' ? 'warn' : (r.kind === 'spelling' ? 'ok' : 'violet')); } },
              { key:'title', label:'Séance', cell:function(r){
                  return '<span class="adm-cellmain"><b>' + esc(r.title) + '</b><span>'
                    + esc([r.dep, r.arr].filter(Boolean).join(' → ')
                        + (r.aircraft ? ' · ' + r.aircraft : '')) + '</span></span>'; } },
              { key:'level', label:'Mode', hideSm:true, cell:function(r){
                  return r.level ? UI.badge(RT.labels.level[r.level] || r.level,
                    r.level === 'reel' ? 'warn' : null) : '<span class="muted">—</span>'; } },
              { key:'alea', label:'Imprévu', hideSm:true, cls:'muted', cell:function(r){
                  return r.alea ? esc(RT.labels.alea[r.alea] || r.aleaLabel || r.alea) : '—'; } },
              { key:'durationS', label:'Durée', align:'right', cls:'num muted', hideSm:true,
                cell:function(r){ return esc(F.duree(r.durationS)); } },
              { key:'scorePct', label:'Score', align:'right', cell:function(r){
                  return r.status === 'in_progress'
                    ? UI.badge('en cours', 'warn')
                    : UI.pastillePct(r.scorePct); } },
              { key:'missed', label:'Erreurs principales', cls:'muted', cell:function(r){
                  var m = (r.missed || []);
                  if (!m.length) return '—';
                  var u2 = [];
                  m.forEach(function(x){ if (u2.indexOf(x) < 0) u2.push(x); });
                  return esc(u2.slice(0, 3).join(' · ')) + (u2.length > 3 ? ' …' : ''); } }
            ],
            rows:rows
          });
        }, 'Lecture des séances…');

        /* ---- Ligne 4 : voir comme un utilisateur ---- */
        var cVue = UI.carte('Voir comme cet utilisateur',
          { sub:'Architecture posée, fonctionnalité volontairement non activée.' });
        cVue.body.appendChild(UI.notice(
          "Le rejeu en lecture seule est déjà là : chaque séance ci-dessus s'ouvre sur la trace "
        + "complète — phrase attendue, phrase dite, éléments manqués. C'est ce qui répond à "
        + "« pourquoi cette personne a-t-elle eu ce problème ? ». Aucune authentification n'est "
        + "en jeu, aucun jeton n'est échangé.", 'info', 'Niveau 1 — disponible'));
        cVue.body.appendChild(UI.notice(
          "Rendre l'interface élève avec les données de cette personne, en lecture seule, sous le "
        + "jeton de l'administrateur : la politique RLS « admin read all » autorise la lecture, la "
        + "politique « self write » refuse toute écriture. La sécurité vient de la base, pas d'un "
        + "test dans le navigateur. Chaque entrée sera journalisée dans admin_audit_log.",
          'info', 'Niveau 2 — à activer avec Supabase'));
        cVue.body.appendChild(UI.notice(
          "Se connecter réellement à la place de quelqu'un ne doit pas être fait depuis le "
        + "navigateur. Si cela devient indispensable : Edge Function côté serveur, jeton de cinq "
        + "minutes, audit écrit avant émission, bandeau permanent, consentement préalable. "
        + "Et jamais, en aucun cas, l'accès au mot de passe — l'administrateur n'y a pas accès "
        + "et ne doit pas pouvoir en obtenir un.", 'warn', 'Niveau 3 — impersonation : à éviter'));
        var bt = UI.bouton('Simuler l\'entrée en vue élève', { icon:I.eye,
          onClick:function(){ ouvrirVueEleve(u); } });
        var row = el('div', 'adm-btnrow');
        row.appendChild(bt);
        cVue.body.appendChild(row);
        w.appendChild(cVue);

        return w;
      }, 'Ouverture de la fiche…');

      function ouvrirVueEleve(u){
        RT.viewAs.set({ id:u.id, name:u.name });
        var c = el('div');
        c.appendChild(UI.notice(
          'Rien n\'a été ouvert et aucune donnée n\'a été chargée : la fonctionnalité n\'est pas '
        + 'active. Ce panneau montre ce qui se passerait, et ce qui serait écrit dans le journal '
        + 'd\'audit.', 'warn', 'Démonstration — aucune action réelle'));
        c.appendChild(UI.fiche([
          ['Cible', u.name + ' (' + u.id + ')'],
          ['Mode', 'Lecture seule — aucune écriture possible'],
          ['Jeton utilisé', "celui de l'administrateur, jamais celui de la cible"],
          ['Mot de passe', "jamais lu, jamais stocké, jamais accessible"],
          ['Autorisation', 'politique RLS « admin read all » sur profiles / sessions / session_steps'],
          ['Journal', 'admin_audit_log — action « view_as », cible ' + u.id]
        ]));
        var pre = el('pre', 'adm-pre',
          esc("-- Écrit AVANT tout affichage, jamais après :\n"
            + "insert into admin_audit_log (admin_id, action, target_type, target_id, meta)\n"
            + "values (auth.uid(), 'view_as', 'profile', '" + u.id + "',\n"
            + "        jsonb_build_object('mode','read_only','at',now()));"));
        c.appendChild(pre);
        UI.tiroir('Voir comme ' + u.name, c,
          { sub:'Architecture — voir ADMIN.md § 11' });
      }

      function detailSeance(r){
        var c = el('div');
        c.appendChild(UI.fiche([
          ['Type', RT.labels.kind[r.kind] || r.kind],
          ['Date', F.dateHeure(r.at)],
          ['Terrain', [r.dep, r.arr].filter(Boolean).join(' → ') || '—'],
          ['Piste', r.runway || '—'],
          ['Mode', RT.labels.level[r.level] || r.level || '—'],
          ['Durée', F.duree(r.durationS)],
          ['Score', r.scoreTotal ? (r.scoreOk + ' / ' + r.scoreTotal + ' éléments') : '—'],
          ['Réussite', UI.pastillePct(r.scorePct), 'html']
        ]));
        var m = [];
        (r.missed || []).forEach(function(x){ if (m.indexOf(x) < 0) m.push(x); });
        if (m.length){
          var box = el('div');
          box.appendChild(el('h4', null, 'Éléments manqués'));
          var chips = el('div', 'adm-step__miss');
          m.forEach(function(x){
            chips.innerHTML += UI.badge(x + ' — ' + RT.taxonomy.labelOf(RT.taxonomy.axisOf(x)), 'bad');
          });
          box.appendChild(chips);
          c.appendChild(box);
        } else {
          c.appendChild(UI.notice('Tous les éléments attendus ont été dits.', 'info'));
        }
        if (!r.steps)
          c.appendChild(UI.notice(
            "Les scénarios ne conservent pas la trace échange par échange aujourd'hui : "
          + "seuls le score et les éléments manqués sont enregistrés. La table session_steps "
          + "comblera ce manque (voir ADMIN.md § 10).", 'info', 'Trace fine indisponible'));
        UI.tiroir(r.title, c, { sub:F.dateHeure(r.at) });
      }
    }
  });
})();
