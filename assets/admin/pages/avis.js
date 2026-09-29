/* =============================================================================
   Albatros VFR — Admin · /admin/avis (29/09/2026)
   -----------------------------------------------------------------------------
   Tous les avis, quel que soit leur statut : publier, rejeter (avec un motif
   que l'auteur verra), mettre en avant (3 au plus, rang 1 à 3), supprimer.
   Filtre par statut — « en attente » d'abord : c'est la file à traiter, et la
   mention publique promet 3 jours au plus.

   Chaque action passe par une fonction de la base (sql/010,
   admin_avis_*), réservée à l'administrateur PLEIN et inscrite au journal
   d'audit dans la même transaction. Cette page ne décide rien : elle
   n'affiche que ce que la base accepte, et dit ses refus en clair.

   Pas de source « démo » ni « cet appareil » : les avis n'existent qu'en
   base. Sans client Supabase, la page le dit.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin, UI = RT.ui;
  var el = UI.el, esc = UI.esc, I = UI.I, F = UI.F;

  var filtre = { statut:'en_attente', tri:'date' };
  var LIB = { en_attente:'En attente', publie:'Publié', rejete:'Rejeté' };
  var TON = { en_attente:'warn', publie:'ok', rejete:'bad' };

  function client(){ try{ return window.RTAuth && RTAuth.client && RTAuth.client(); }catch(e){ return null; } }
  function toast(m){ try{ if (window.showToast) window.showToast(m); }catch(e){} }
  function erreurDe(e){ return (e && (e.message || e.details || e.hint)) || String(e); }
  function rpc(nom, args){
    var c = client();
    if (!c || !c.rpc) return Promise.reject(new Error('Base injoignable.'));
    return Promise.resolve(c.rpc(nom, args || {})).then(function(r){
      if (r && r.error) throw r.error;
      return r ? r.data : null;
    });
  }
  function etoiles(n){
    n = Math.max(0, Math.min(5, parseInt(n, 10) || 0));
    return '<span title="' + n + ' / 5" style="color:#e0a21b;letter-spacing:1px">' +
      '★★★★★'.slice(0, n) + '<span style="color:var(--adm-border,#ccc)">' + '★★★★★'.slice(n) + '</span></span>';
  }

  function rejeter(a, refaire){
    var boite = el('div');
    boite.appendChild(el('p', 'adm-sub', 'L\'auteur verra ce motif dans l\'application. Restez factuel, 300 caractères au plus.'));
    var t = el('textarea');
    t.maxLength = 300; t.rows = 4;
    t.style.cssText = 'width:100%;box-sizing:border-box;margin:10px 0;padding:10px;border-radius:10px;border:1px solid var(--adm-border,#ccc);font:inherit';
    t.placeholder = 'ex. Hors sujet, propos injurieux, données personnelles…';
    boite.appendChild(t);
    var d;
    boite.appendChild(UI.bouton('Rejeter cet avis', { cls:'cta', onClick:function(){
      rpc('admin_avis_moderer', { cible:a.id, nouveau:'rejete', motif:t.value.trim() || null }).then(function(){
        d.close(); toast('Avis rejeté.'); refaire();
      }, function(e){ toast('Refusé : ' + erreurDe(e)); });
    } }));
    d = UI.tiroir('Rejeter l\'avis de ' + a.pseudo, boite);
    t.focus();
  }

  function actions(a, refaire){
    var z = el('div');
    z.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center';
    function faire(nom, args, ok){
      return rpc(nom, args).then(function(){ toast(ok); refaire(); }, function(e){ toast('Refusé : ' + erreurDe(e)); });
    }
    if (a.statut !== 'publie')
      z.appendChild(UI.bouton('Publier', { cls:'cta', onClick:function(){ faire('admin_avis_moderer', { cible:a.id, nouveau:'publie' }, 'Avis publié.'); } }));
    if (a.statut !== 'rejete')
      z.appendChild(UI.bouton('Rejeter', { onClick:function(){ rejeter(a, refaire); } }));
    /* La vedette : seulement pour un avis publié — la base refuserait les autres. */
    if (a.statut === 'publie'){
      var s = el('select');
      s.setAttribute('aria-label', 'Mise en avant sur l\'accueil');
      s.style.cssText = 'padding:6px 8px;border-radius:9px;border:1px solid var(--adm-border,#ccc);font:inherit;font-size:12.5px';
      [['', 'Pas en avant'], ['1', 'Accueil, rang 1'], ['2', 'Accueil, rang 2'], ['3', 'Accueil, rang 3']].forEach(function(o){
        var op = el('option', null, esc(o[1])); op.value = o[0];
        if (String(a.ordre_mise_en_avant || '') === o[0]) op.selected = true;
        s.appendChild(op);
      });
      s.addEventListener('change', function(){
        faire('admin_avis_vedette', { cible:a.id, rang: s.value ? parseInt(s.value, 10) : null },
              s.value ? 'Mis en avant au rang ' + s.value + '.' : 'Retiré de l\'accueil.');
      });
      z.appendChild(s);
    }
    z.appendChild(UI.bouton('Supprimer', { onClick:function(){
      (window.rtConfirm ? window.rtConfirm('L\'avis de ' + a.pseudo + ' sera supprimé définitivement. La suppression est inscrite au journal.',
          { title:'Supprimer l\'avis', ok:'Supprimer', cancel:'Annuler' }) : Promise.resolve(true))
        .then(function(oui){ if (oui) faire('admin_avis_supprimer', { cible:a.id }, 'Avis supprimé.'); });
    } }));
    return z;
  }

  RT.page('admin/avis', {
    render:function(hote){
      var tete = el('div', 'adm-head');
      var g = el('div');
      g.appendChild(el('h1', 'adm-h1', 'Avis'));
      g.appendChild(el('p', 'adm-sub',
        'Les avis des élèves. Rien n\'est publié sans vous ; la page publique promet une vérification sous 3 jours au plus.'));
      tete.appendChild(g);
      hote.appendChild(tete);

      var carte = UI.carte('Tous les avis', { wide:true });
      hote.appendChild(carte);

      function redessiner(){
        UI.charger(carte.body, rpc('admin_avis_liste'), function(liste){
          liste = (liste || []).map(function(x){ return typeof x === 'string' ? JSON.parse(x) : x; });
          var enAttente = liste.filter(function(a){ return a.statut === 'en_attente'; });
          var vedettes = liste.filter(function(a){ return a.mis_en_avant; }).length;
          var z = el('div');
          /* Le plus vieil avis en attente, en jours : la promesse publique est de 3 jours. */
          if (enAttente.length){
            var plusVieux = enAttente.reduce(function(m, a){ return Math.min(m, new Date(a.cree_le).getTime()); }, Date.now());
            var jours = Math.floor((Date.now() - plusVieux) / 86400000);
            z.appendChild(UI.notice(enAttente.length + ' avis en attente — le plus ancien a ' + jours + ' jour' + (jours > 1 ? 's' : '') +
              '. Délai promis sur la page publique : 3 jours au plus.', jours >= 3 ? 'danger' : 'warn'));
          }
          z.appendChild(UI.barreOutils({
            filters:[
              { key:'statut', label:'Statut', value:filtre.statut, onChange:function(v){ filtre.statut = v; redessiner(); },
                options:[{ v:'tous', l:'Tous' }, { v:'en_attente', l:'En attente' }, { v:'publie', l:'Publiés' }, { v:'rejete', l:'Rejetés' }] },
              { key:'tri', label:'Tri', value:filtre.tri, onChange:function(v){ filtre.tri = v; redessiner(); },
                options:[{ v:'date', l:'Plus récents' }, { v:'ancien', l:'Plus anciens' }, { v:'note_haut', l:'Meilleures notes' }, { v:'note_bas', l:'Moins bonnes notes' }] }
            ],
            count: liste.length + ' avis · ' + vedettes + ' / 3 sur l\'accueil'
          }));
          var rows = liste.filter(function(a){ return filtre.statut === 'tous' || a.statut === filtre.statut; });
          rows.sort(function(a, b){
            var da = new Date(a.cree_le) - new Date(b.cree_le);
            if (filtre.tri === 'ancien') return da;
            if (filtre.tri === 'note_haut') return (b.note - a.note) || -da;
            if (filtre.tri === 'note_bas') return (a.note - b.note) || -da;
            return -da;
          });
          z.appendChild(UI.table({
            columns:[
              { key:'cree_le', label:'Déposé', cell:function(a){ return esc(F.dateHeure(a.cree_le)); } },
              { key:'pseudo', label:'Auteur', cell:function(a){
                  return '<b>' + esc(a.pseudo) + '</b>' + (a.email ? '<br><small>' + esc(a.email) + '</small>' : ''); } },
              { key:'note', label:'Note', cell:function(a){ return etoiles(a.note); } },
              { key:'commentaire', label:'Commentaire', cell:function(a){
                  return a.commentaire ? esc(a.commentaire) : '<i>sans commentaire</i>'; } },
              { key:'statut', label:'Statut', cell:function(a){
                  return UI.badge(LIB[a.statut] || a.statut, TON[a.statut]) +
                    (a.mis_en_avant ? ' ' + UI.badge('Accueil ' + a.ordre_mise_en_avant, 'violet') : '') +
                    (a.motif_rejet ? '<br><small>Motif : ' + esc(a.motif_rejet) + '</small>' : ''); } },
              { key:'act', label:'', align:'right', cell:function(a){ return '<span class="adm-avis-act" data-id="' + esc(a.id) + '"></span>'; } }
            ],
            rows:rows,
            empty:UI.etatVide(filtre.statut === 'en_attente' ? 'Rien à modérer' : 'Aucun avis',
              filtre.statut === 'en_attente' ? 'Tous les avis ont été traités.' : 'Aucun avis ne correspond à ce filtre.', I.star)
          }));
          rows.forEach(function(a){
            var h = z.querySelector('.adm-avis-act[data-id="' + a.id + '"]');
            if (h) h.appendChild(actions(a, redessiner));
          });
          return z;
        }, 'Lecture des avis…');
      }
      redessiner();
    }
  });
})();
