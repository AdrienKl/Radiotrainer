/* =============================================================================
   Albatros VFR — Admin · /admin/questionnaire (03/10/2026)
   -----------------------------------------------------------------------------
   Les réponses au questionnaire de première connexion (assets/inscription.js) :
   la répartition question par question, puis les réponses compte par compte.

   LES QUESTIONS NE SONT PAS RECOPIÉES ICI. Titres, choix et libellés viennent
   de RTInscription.questions(), la liste même qui sert à poser les questions
   et à les corriger dans Paramètres. Une copie finirait par diverger, et cette
   page afficherait un code brut (« eleve-cours ») le jour où un choix change
   de libellé.

   Lecture seule, et rien de nouveau côté base : les réponses sont des colonnes
   de `profiles`, que la politique « profil : lecture admin » (sql/002) ouvre
   déjà à la console. Pas de source « démo » ni « cet appareil » : ces réponses
   n'existent qu'en base.

   On lit les comptes dont l'inscription est TERMINÉE (`onboarding_le`
   rempli) : un compte en cours d'inscription n'a encore rien répondu.

   Mais « terminé » ne veut pas dire « a répondu » : sql/001 § 6 a déclaré
   terminés, à leur date de création, tous les comptes antérieurs au
   questionnaire — sans aucune réponse. Les répartitions se calculent donc sur
   les comptes qui ont répondu à au moins une question ; la table, elle,
   montre TOUS les inscrits, les anciens avec « aucune réponse ».
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin, UI = RT.ui;
  var el = UI.el, esc = UI.esc, I = UI.I, F = UI.F;

  var COLONNES = 'id,display_name,pseudo,email,created_at,onboarding_le,aerodrome,'
               + 'decouverte,profil_pilote,heures_vol,objectifs,type_avion,niveau_radio';

  function client(){ try{ return window.RTAuth && RTAuth.client && RTAuth.client(); }catch(e){ return null; } }
  function questions(){
    try{ return (window.RTInscription && RTInscription.questions) ? RTInscription.questions() : []; }
    catch(e){ return []; }
  }
  function valeursDe(p, q){
    var v = p[q.colonne];
    if (q.type === 'plusieurs') return Array.isArray(v) ? v : [];
    return (v == null || v === '') ? [] : [v];
  }
  function aRepondu(p){
    return !!p.aerodrome || questions().some(function(q){ return valeursDe(p, q).length > 0; });
  }
  function libelle(q, code){
    for (var i = 0; i < q.choix.length; i++) if (q.choix[i][0] === code) return q.choix[i][1];
    return code;   // une valeur hors liste s'affiche telle quelle, jamais masquée
  }

  /* Les réponses d'UN compte, lisibles : [[titre, réponse], …]. Servie aussi à
     la fiche utilisateur (users.js), pour qu'elle dise exactement la même chose. */
  RT.reponsesQuestionnaire = function(p){
    if (!p) return [];
    var lignes = questions().map(function(q){
      var v = valeursDe(p, q);
      return [q.titre, v.length ? v.map(function(c){ return libelle(q, c); }).join(' · ') : '—'];
    });
    lignes.push(['Aérodrome d\'attache', p.aerodrome || '—']);
    return lignes;
  };

  /* Une question → des barres, choix dans l'ordre du questionnaire. Les choix
     jamais cochés restent affichés à zéro : savoir que personne ne vient pour
     l'anglais est une information. */
  function carteQuestion(q, profils){
    var concernes = profils;
    var sub = null;
    /* « Heures de vol » n'est posée qu'aux profils qui volent : la rapporter à
       tous les comptes noierait les réponses sous des « sans réponse » qui n'en
       sont pas — la question n'a jamais été posée. */
    if (q.siProfil){
      concernes = profils.filter(function(p){ return q.siProfil.indexOf(p.profil_pilote) >= 0; });
      sub = 'Posée seulement aux profils qui volent : ' + concernes.length + ' compte' + (concernes.length > 1 ? 's' : '') + '.';
    }
    if (q.type === 'plusieurs') sub = 'Plusieurs réponses possibles : le total dépasse 100 %.';
    if (q.facultative) sub = 'Facultative.';

    var n = {}, sans = 0;
    concernes.forEach(function(p){
      var v = valeursDe(p, q);
      if (!v.length) sans++;
      v.forEach(function(c){ n[c] = (n[c] || 0) + 1; });
    });
    var base = concernes.length || 1;
    var items = q.choix.map(function(c){
      var k = n[c[0]] || 0; delete n[c[0]];
      return { label:c[1], n:k, valueText:k + ' · ' + Math.round(k * 100 / base) + ' %' };
    });
    Object.keys(n).forEach(function(c){
      items.push({ label:c + ' (hors liste)', n:n[c], valueText:n[c] + ' · ' + Math.round(n[c] * 100 / base) + ' %' });
    });
    if (sans) items.push({ label:'Sans réponse', n:sans, valueText:sans + ' · ' + Math.round(sans * 100 / base) + ' %', tone:'nul' });

    var c = UI.carte(q.titre, { sub:sub });
    c.classList.add('c6');
    c.body.appendChild(UI.graphBarres(items));
    return c;
  }

  function carteAerodromes(profils){
    var n = {};
    profils.forEach(function(p){ if (p.aerodrome) n[p.aerodrome] = (n[p.aerodrome] || 0) + 1; });
    var items = Object.keys(n).sort(function(a, b){ return n[b] - n[a] || (a < b ? -1 : 1); })
      .slice(0, 12).map(function(k){ return { label:k, n:n[k] }; });
    var c = UI.carte('Aérodromes d\'attache', { sub:'Les douze plus cités.' });
    c.classList.add('c6');
    c.body.appendChild(UI.graphBarres(items, { emptyTitle:'Aucun aérodrome renseigné' }));
    return c;
  }

  function tableReponses(profils){
    var qs = questions();
    var cols = [
      { key:'qui', label:'Compte', cell:function(p){
          return '<a href="#admin/users/' + esc(p.id) + '"><b>' + esc(p.pseudo || p.display_name || p.email || p.id.slice(0, 8)) + '</b></a>'
            + '<br><small>' + esc(F.date(p.onboarding_le || p.created_at)) + '</small>'
            + (aRepondu(p) ? '' : '<br><small class="adm-sub">aucune réponse</small>'); } }
    ];
    qs.forEach(function(q){
      cols.push({ key:q.id, label:esc(q.titre), cell:function(p){
        var v = valeursDe(p, q);
        return v.length ? v.map(function(x){ return esc(libelle(q, x)); }).join('<br>') : '<span class="adm-sub">—</span>';
      } });
    });
    cols.push({ key:'aerodrome', label:'Aérodrome', cell:function(p){ return esc(p.aerodrome || '—'); } });
    return UI.table({ columns:cols, rows:profils, dense:true,
      empty:UI.etatVide('Aucun compte', 'Aucune inscription terminée pour l\'instant.', I.users) });
  }

  RT.page('admin/questionnaire', {
    render:function(hote){
      var tete = el('div', 'adm-head');
      var g = el('div');
      g.appendChild(el('h1', 'adm-h1', 'Questionnaire'));
      g.appendChild(el('p', 'adm-sub',
        'Les réponses au questionnaire de première connexion. Lecture seule.'));
      tete.appendChild(g);
      hote.appendChild(tete);

      var zone = el('div');
      hote.appendChild(zone);
      var c = client();
      if (!c){
        zone.appendChild(UI.etatVide('Base injoignable', 'Ces réponses n\'existent qu\'en base : connectez-vous à Supabase.', I.db));
        return;
      }
      var lecture = Promise.resolve(c.from('profiles').select(COLONNES)
          .not('onboarding_le', 'is', null).order('onboarding_le', { ascending:false }).limit(5000))
        .then(function(r){ if (r && r.error) throw r.error; return (r && r.data) || []; });

      UI.charger(zone, lecture, function(inscrits){
        var w = el('div');
        var profils = inscrits.filter(aRepondu);
        var qs = questions();
        if (!qs.length){
          w.appendChild(UI.notice('La définition du questionnaire (assets/inscription.js) n\'est pas chargée.', 'warn'));
          return w;
        }
        var st = el('div', 'adm-stats');
        st.appendChild(UI.tuile({ icon:I.users, value:F.nb(inscrits.length), label:'comptes inscrits' }));
        st.appendChild(UI.tuile({ icon:I.book, value:F.nb(profils.length), label:'ont répondu au questionnaire',
          hint:inscrits.length > profils.length ? (inscrits.length - profils.length) + ' sans réponse (comptes antérieurs au questionnaire)' : null }));
        var dec = profils.filter(function(p){ return p.decouverte; }).length;
        st.appendChild(UI.tuile({ icon:I.chart, value:profils.length ? Math.round(dec * 100 / profils.length) + '<small> %</small>' : '—',
          label:'ont dit où ils nous ont connus' }));
        w.appendChild(st);

        var grille = el('div', 'adm-grid');
        grille.style.marginTop = 'var(--adm-gap)';
        qs.forEach(function(q){ grille.appendChild(carteQuestion(q, profils)); });
        grille.appendChild(carteAerodromes(profils));
        w.appendChild(grille);

        var ct = UI.carte('Réponses par compte', { wide:true, sub:'Tous les comptes inscrits, les plus récents d\'abord. Cliquez un compte pour ouvrir sa fiche.' });
        ct.style.marginTop = 'var(--adm-gap)';
        ct.body.appendChild(tableReponses(inscrits));
        w.appendChild(ct);
        return w;
      }, 'Lecture des réponses…');
    }
  });
})();
