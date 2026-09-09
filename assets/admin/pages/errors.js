/* =============================================================================
   RadioTrainer — Admin · /admin/errors
   -----------------------------------------------------------------------------
   La question à laquelle cette page doit répondre est toujours la même :
   « pourquoi cette personne a-t-elle eu ce problème ? »
   Elle s'organise donc autour du contexte, pas autour du message : qui, quand,
   sur quelle page, avec quel navigateur, pendant quelle séance.

   Source « Cet appareil » : les erreurs sont RÉELLES et captées en direct par
   assets/admin/data/error-log.js (erreurs JavaScript, promesses rejetées,
   ressources non chargées). Rien n'est envoyé sur Internet — c'est un journal
   de bord local, cohérent avec la promesse du pied de page du site.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin, UI = RT.ui;
  var el = UI.el, esc = UI.esc, I = UI.I, F = UI.F;

  var etat = { q:'', level:'all', kind:'all', resolved:'all', sort:'at', dir:'desc', page:1 };

  var KINDS = {
    js:'JavaScript', speech:'Reconnaissance vocale', audio:'Synthèse vocale',
    network:'Réseau / ressource', simulation:'Simulation', user_report:'Signalement'
  };
  function tonNiveau(n){ return n === 'error' ? 'bad' : (n === 'warn' ? 'warn' : null); }
  function iconeNiveau(n){ return n === 'error' ? I.error : (n === 'warn' ? I.warn : I.info); }

  function detailErreur(e, ctx){
    var c = el('div');
    var entete = el('div', 'adm-note adm-note--' + (e.level === 'error' ? 'danger'
                     : (e.level === 'warn' ? 'warn' : 'info')));
    entete.innerHTML = '<span class="adm-note__ic">' + iconeNiveau(e.level) + '</span>'
      + '<div><b>' + esc(KINDS[e.kind] || e.kind) + '</b><span>' + esc(e.message) + '</span></div>';
    c.appendChild(entete);

    c.appendChild(UI.fiche([
      ['Identifiant', e.id],
      ['Date', F.dateHeure(e.at) + ' (' + F.depuis(e.at) + ')'],
      ['Niveau', e.level],
      ['Nature', KINDS[e.kind] || e.kind],
      e.count && e.count > 1 ? ['Occurrences', String(e.count) + ' fois'] : null,
      ['Utilisateur', e.userName || 'inconnu'],
      ['Séance liée', e.sessionLabel || (e.sessionId || '—')],
      ['Page', e.url || '—'],
      ['Navigateur', e.userAgent || '—'],
      e.appVersion ? ['Version', e.appVersion] : null,
      ['État', e.resolved ? 'traitée' : 'non traitée']
    ]));

    if (e.stack){
      var h = el('h4', null, 'Trace');
      h.style.margin = '2px 0 0';
      c.appendChild(h);
      c.appendChild(el('pre', 'adm-pre', esc(e.stack)));
    }
    if (e.context && Object.keys(e.context).length){
      var h2 = el('h4', null, 'Contexte');
      h2.style.margin = '2px 0 0';
      c.appendChild(h2);
      c.appendChild(el('pre', 'adm-pre', esc(JSON.stringify(e.context, null, 2))));
    }

    var actions = el('div', 'adm-btnrow');
    if (e.userId && e.userId !== 'local')
      actions.appendChild(UI.bouton('Ouvrir la fiche utilisateur', { icon:I.users,
        onClick:function(){ UI.fermerTiroir(); ctx.go('admin/users/' + e.userId); } }));
    if (e.sessionId)
      actions.appendChild(UI.bouton('Ouvrir la simulation', { icon:I.plane,
        onClick:function(){ UI.fermerTiroir(); ctx.go('admin/flights/' + e.sessionId); } }));
    if (actions.children.length) c.appendChild(actions);

    c.appendChild(UI.notice(
      "Marquer une erreur comme traitée demande une écriture (`app_errors.resolved_at`), "
    + "donc Supabase. Aujourd'hui la console reste en lecture seule.", 'info', 'Lecture seule'));
    return c;
  }

  RT.page('admin/errors', {
    render:function(hote, ctx){
      var tete = el('div', 'adm-head');
      var g = el('div');
      g.appendChild(el('h1', 'adm-h1', 'Erreurs'));
      g.appendChild(el('p', 'adm-sub',
        'Erreurs techniques, incidents de simulation et signalements, avec leur contexte. '
      + 'Cliquez une ligne pour voir la trace complète.'));
      tete.appendChild(g);
      var act = el('div', 'adm-head__r');
      act.appendChild(UI.bouton('Vider le journal local', { icon:I.bug, onClick:function(){
        var suite = window.rtConfirm
          ? window.rtConfirm('Les erreurs captées sur CET appareil seront effacées. '
            + 'Les autres sources ne sont pas touchées.',
            { title:'Vider le journal local ?', ok:'Vider', cancel:'Annuler' })
          : Promise.resolve(window.confirm('Vider le journal local ?'));
        suite.then(function(ok){
          if (!ok) return;
          if (RT.clearErrors) RT.clearErrors();
          if (window.showToast) window.showToast('Journal local vidé.');
          peindre();
        });
      } }));
      tete.appendChild(act);
      hote.appendChild(tete);

      var resume = el('div');
      hote.appendChild(resume);

      var carte = UI.carte(null);
      hote.appendChild(carte);
      var resultats = el('div');

      var optsKind = [{ v:'all', l:'Toutes' }];
      Object.keys(KINDS).forEach(function(k){ optsKind.push({ v:k, l:KINDS[k] }); });

      carte.body.appendChild(UI.barreOutils({
        search:{ value:etat.q, placeholder:'Message, utilisateur, navigateur…',
                 onInput:function(v){ etat.q = v; etat.page = 1; peindre(); } },
        filters:[
          { label:'Niveau', value:etat.level, options:[
              { v:'all', l:'Tous' }, { v:'error', l:'Erreurs' },
              { v:'warn', l:'Avertissements' }, { v:'info', l:'Informations' }],
            onChange:function(v){ etat.level = v; etat.page = 1; peindre(); } },
          { label:'Nature', value:etat.kind, options:optsKind,
            onChange:function(v){ etat.kind = v; etat.page = 1; peindre(); } },
          { label:'État', value:etat.resolved, options:[
              { v:'all', l:'Tous' }, { v:'open', l:'Non traitées' }, { v:'done', l:'Traitées' }],
            onChange:function(v){ etat.resolved = v; etat.page = 1; peindre(); } }
        ]
      }));
      carte.body.appendChild(resultats);

      function peindreResume(){
        UI.charger(resume, RT.data.errors({ page:1, perPage:500 }), function(res){
          var rows = res.rows || [];
          var e7 = rows.filter(function(x){
            return Date.now() - new Date(x.at).getTime() < 7 * 86400000; });
          var parNature = {};
          rows.forEach(function(x){ parNature[x.kind] = (parNature[x.kind] || 0) + 1; });
          var pire = Object.keys(parNature).sort(function(a, b){
            return parNature[b] - parNature[a]; })[0];
          var box = el('div', 'adm-stats adm-stats--3');   // six tuiles = deux lignes de trois
          box.appendChild(UI.tuile({ icon:I.bug, value:F.nb(rows.length), label:'entrées au journal' }));
          box.appendChild(UI.tuile({ icon:I.error,
            value:F.nb(rows.filter(function(x){ return x.level === 'error'; }).length),
            label:'erreurs', tone:'bad' }));
          box.appendChild(UI.tuile({ icon:I.warn,
            value:F.nb(rows.filter(function(x){ return x.level === 'warn'; }).length),
            label:'avertissements', tone:'warn' }));
          box.appendChild(UI.tuile({ icon:I.clock, value:F.nb(e7.length), label:'sur 7 jours' }));
          box.appendChild(UI.tuile({ icon:I.warn,
            value:F.nb(rows.filter(function(x){ return !x.resolved; }).length),
            label:'non traitées', tone:'warn' }));
          box.appendChild(UI.tuile({ icon:I.info,
            value:pire ? (KINDS[pire] || pire) : '—', label:'nature la plus fréquente' }));
          return box;
        }, 'Résumé…');
      }

      function peindre(){
        peindreResume();
        UI.charger(resultats, RT.data.errors(etat), function(res){
          var w = el('div');
          w.appendChild(UI.table({
            dense:true,
            sort:etat.sort, dir:etat.dir,
            onSort:function(k, d){ etat.sort = k; etat.dir = d; etat.page = 1; peindre(); },
            onRow:function(r){
              UI.tiroir(KINDS[r.kind] || r.kind, detailErreur(r, ctx), { sub:F.dateHeure(r.at) });
            },
            columns:[
              { key:'at', label:'Date', sortable:true, descFirst:true, cls:'num muted',
                cell:function(r){ return esc(F.dateHeure(r.at)); } },
              { key:'level', label:'Niveau', sortable:true, cell:function(r){
                  return UI.badge(r.level, tonNiveau(r.level)); } },
              { key:'kind', label:'Nature', sortable:true, hideSm:true, cell:function(r){
                  return UI.badge(KINDS[r.kind] || r.kind); } },
              { key:'message', label:'Message', cell:function(r){
                  return '<span class="strong">' + esc(r.message) + '</span>'; } },
              { key:'userName', label:'Utilisateur', sortable:true, hideSm:true, cls:'muted',
                cell:function(r){ return esc(r.userName || '—'); } },
              { key:'sessionLabel', label:'Séance', hideSm:true, cls:'muted', cell:function(r){
                  return esc(r.sessionLabel || (r.sessionId ? r.sessionId : '—')); } },
              { key:'resolved', label:'État', align:'right', cell:function(r){
                  return UI.badge(r.resolved ? 'traitée' : 'ouverte', r.resolved ? 'ok' : 'warn'); } }
            ],
            rows:res.rows,
            empty:UI.etatVide('Aucune erreur',
              'Rien n\'a été capté, ou les filtres sont trop restrictifs. '
            + 'Sur la source « Cet appareil », le journal se remplit en direct : erreurs '
            + 'JavaScript, promesses rejetées et ressources manquantes.', I.target)
          }));
          w.appendChild(UI.pagination({ page:res.page, pages:res.pages, total:res.total,
            perPage:res.perPage, onPage:function(p){ etat.page = p; peindre(); } }));
          return w;
        }, 'Lecture du journal…');
      }
      peindre();

      hote.appendChild(UI.notice(
        "Sur la source « Cet appareil », le journal est réel et local : il est alimenté par "
      + "assets/admin/data/error-log.js, qui écoute les événements `error` et "
      + "`unhandledrejection` sans jamais rien intercepter ni envoyer. Le jour du branchement, "
      + "la même fonction `RTAdmin.logError()` écrira dans la table `app_errors` au lieu du "
      + "stockage local — les appelants ne changent pas.", 'info', 'D\'où viennent ces données'));
    }
  });
})();
