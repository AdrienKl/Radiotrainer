/* =============================================================================
   Albatros VFR — Admin · /admin/voix — LA VOIX GOOGLE : CONSOMMATION ET COÛT
   -----------------------------------------------------------------------------
   Ajoutée le 27/09/2026. Trois questions, dans cet ordre :
     1. combien, aujourd'hui et ce mois, et combien ça coûte ?  → Vue globale
     2. QUI consomme ?                                         → Par utilisateur
     3. avec quelles voix ?                                    → Par modèle

   D'où viennent les chiffres : voix_historique (sql/006), écrite par la base
   dans la même transaction que le quota, à chaque requête ACCEPTÉE. Lisible
   par un administrateur seulement : c'est la RLS qui protège, pas cette page.
   Le texte prononcé n'est stocké nulle part — il n'y a que des compteurs.

   Le coût est ESTIMÉ, avec les tarifs de assets/admin/data/tarifs-voix.js —
   le seul fichier où un prix est écrit. Ce n'est pas une facture, et la page
   le dit en tête, avant le premier chiffre.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin, UI = RT.ui;
  var el = UI.el, esc = UI.esc, I = UI.I, F = UI.F;

  function familles(){ return (window.Voix && window.Voix.FAMILLES_GOOGLE) || []; }
  function libelleModele(code){
    var f = familles().filter(function(x){ return x.code === code; })[0];
    return f ? f.libelle : code;
  }

  /* ---- Les sommes ------------------------------------------------------------
     Pure : des lignes et un jour en entrée, des totaux en sortie. Exposée
     (RTAdmin.voixStats) pour que les tests la vérifient sur des cas écrits à
     la main — c'est ici que se joue la justesse des montants. */
  function calculer(d){
    var T = RT.tarifsVoix;
    var auj = d.aujourdhui, mois = auj.slice(0, 7), sept = T.decaler(auj, -6);
    var g = { jour:{ car:0, req:0 }, mois:{ car:0, req:0 } };
    var parU = {}, parM = {}, avantJour = {}, duJour = {};

    (d.rows || []).forEach(function(x){
      var car = x.caracteres || 0, req = x.requetes || 0, m = x.modele;
      var estAuj = x.jour === auj, enMois = x.jour.slice(0, 7) === mois;
      var en7 = x.jour >= sept && x.jour <= auj;
      var u = parU[x.userId] || (parU[x.userId] = { id:x.userId, nom:x.userName,
              jour:0, sept:0, mois:0, requetes:0, couts:[] });
      if (en7) u.sept += car;
      if (estAuj){
        u.jour += car; g.jour.car += car; g.jour.req += req;
        duJour[m] = (duJour[m] || 0) + car;
      }
      if (enMois){
        u.mois += car; u.requetes += req; g.mois.car += car; g.mois.req += req;
        u.couts.push(T.brut(m, car));
        var mm = parM[m] || (parM[m] = { code:m, car:0, req:0 });
        mm.car += car; mm.req += req;
        if (!estAuj) avantJour[m] = (avantJour[m] || 0) + car;
      }
    });

    /* Le coût du mois déduit la part gratuite PAR MODÈLE (elle est par SKU
       chez Google). Celui du jour est ce que le jour AJOUTE au mois. */
    var codes = Object.keys(parM);
    var coutMois = T.somme(codes.map(function(m){ return T.apresGratuite(m, parM[m].car); }));
    var coutJour = T.somme(Object.keys(duJour).map(function(m){
      return T.duJour(m, avantJour[m] || 0, duJour[m]);
    }));
    var nonPublies = codes.filter(function(m){ return !T.tarif(m); })
                          .reduce(function(a, m){ return a + parM[m].car; }, 0);

    var utilisateurs = Object.keys(parU).map(function(k){
      var u = parU[k]; u.cout = T.somme(u.couts); delete u.couts; return u;
    }).filter(function(u){ return u.sept > 0 || u.mois > 0; })
      .sort(function(a, b){ return b.mois - a.mois || b.sept - a.sept; });

    /* L'ordre des modèles est celui de l'écran des Paramètres ; un modèle
       inconnu de la table (Google en ajoute) passe à la fin, sans disparaître. */
    var ordre = familles().map(function(f){ return f.code; });
    var modeles = codes.sort(function(a, b){
      var ia = ordre.indexOf(a), ib = ordre.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    }).map(function(m){
      var x = parM[m];
      return { code:m, libelle:libelleModele(m), car:x.car, req:x.req,
               publie:!!T.tarif(m), brut:T.brut(m, x.car), apresGratuite:T.apresGratuite(m, x.car) };
    });

    return { aujourdhui:auj, jour:g.jour, mois:g.mois,
             actifsMois:utilisateurs.filter(function(u){ return u.mois > 0; }).length,
             premiumTotal:d.premiumTotal, coutJour:coutJour, coutMois:coutMois,
             nonPublies:nonPublies, utilisateurs:utilisateurs, modeles:modeles };
  }
  RT.voixStats = calculer;

  /* ---- Mise en forme ----------------------------------------------------------- */
  function dollars(v){
    if (v == null) return 'Tarif non publié';
    try {
      return new Intl.NumberFormat('fr-FR', { style:'currency', currency:RT.tarifsVoix.TARIFS.devise,
        minimumFractionDigits:2, maximumFractionDigits:(v > 0 && v < 1) ? 4 : 2 }).format(v);
    } catch(e){ return v.toFixed(2) + ' $'; }
  }
  /* Une somme dont une part n'a pas de tarif : on le dit à côté du montant,
     plutôt que de laisser croire que le total est complet. */
  function cout(s){
    if (!s) return '—';
    if (s.inconnu && !s.total) return esc('Tarif non publié');
    return esc(dollars(s.total)) + (s.inconnu ? ' <small>+ tarif non publié</small>' : '');
  }

  RT.page('admin/voix', {
    render:function(hote){
      var T = RT.tarifsVoix;

      var tete = el('div', 'adm-head');
      var g = el('div');
      g.appendChild(el('h1', 'adm-h1', 'Voix Google'));
      g.appendChild(el('p', 'adm-sub',
        'Consommation de la voix Google Cloud Text-to-Speech (comptes Premium) — caractères, requêtes, coût estimé.'));
      tete.appendChild(g);
      hote.appendChild(tete);

      hote.appendChild(UI.notice(
        'Coût estimé d\'après les tarifs publics de Google relevés le ' + T.TARIFS.releveLe
        + ', en dollars US. Ce n\'est pas une facture : la part gratuite mensuelle vaut pour tout '
        + 'le compte de facturation Google (elle est déduite du total du mois, pas du coût par '
        + 'utilisateur, qui est brut), et Google compte les caractères à sa façon. La facture '
        + 'réelle est dans la console Google Cloud › Facturation.',
        'warn', 'Coût estimé, pas une facture'));

      var zone = el('div');
      hote.appendChild(zone);
      UI.charger(zone, RT.data.voix(), function(d){
        var s = calculer(d);
        /* Les éléments se suivent dans UN conteneur (UI.charger n'en accepte
           qu'un) : l'espacement que la page donne à ses enfants directs ne
           s'applique plus, on le pose ici. */
        var box = el('div');
        box.style.cssText = 'display:flex;flex-direction:column;gap:18px';

        /* ---- 1. Vue globale : deux lignes de trois ---- */
        function montant(sm){
          return sm.inconnu && !sm.total ? 'Tarif non publié' : esc(dollars(sm.total));
        }
        var nonChiffre = 'hors caractères Chirp HD, au tarif non publié';
        var st = el('div', 'adm-stats adm-stats--3');
        st.appendChild(UI.tuile({ icon:I.mic, value:F.nb(s.jour.car), label:'caractères aujourd\'hui' }));
        st.appendChild(UI.tuile({ icon:I.chart, value:F.nb(s.mois.car), label:'caractères ce mois' }));
        st.appendChild(UI.tuile({ icon:I.users, value:F.nb(s.actifsMois), label:'comptes Premium l\'ayant utilisée ce mois',
          hint:s.premiumTotal != null ? 'sur ' + F.nb(s.premiumTotal) + ' compte' + (s.premiumTotal > 1 ? 's' : '') + ' Premium' : null }));
        st.appendChild(UI.tuile({ icon:I.play, value:F.nb(s.jour.req), label:'requêtes aujourd\'hui',
          hint:F.nb(s.mois.req) + ' ce mois' }));
        st.appendChild(UI.tuile({ icon:I.target, value:montant(s.coutJour), label:'coût estimé aujourd\'hui',
          hint:s.coutJour.inconnu ? nonChiffre : null }));
        st.appendChild(UI.tuile({ icon:I.target, value:montant(s.coutMois), label:'coût estimé ce mois',
          hint:s.coutMois.inconnu ? nonChiffre : 'part gratuite mensuelle déduite' }));
        box.appendChild(st);
        if (s.nonPublies > 0)
          box.appendChild(UI.notice(F.nb(s.nonPublies) + ' caractères ce mois viennent de voix Chirp HD, '
            + 'dont Google ne publie pas le tarif : ils ne sont comptés dans aucun montant.', 'info', 'Tarif non publié'));

        /* ---- 2. Par utilisateur ---- */
        var cU = UI.carte('Par utilisateur', { sub:'Trié par consommation du mois. Coût estimé brut, sans la part gratuite. '
          + 'Signalés : les comptes qui font à eux seuls plus du quart du mois.' });
        var gros = s.mois.car > 0 && s.utilisateurs.length > 1;
        cU.body.appendChild(UI.table({
          dense:true,
          columns:[
            { key:'nom', label:'Utilisateur', cell:function(u){
                return '<b>' + esc(u.nom || u.id) + '</b>'
                  + (gros && u.mois / s.mois.car > 0.25 ? ' ' + UI.badge('forte consommation', 'warn') : ''); } },
            { key:'jour', label:'Aujourd\'hui', align:'right', cell:function(u){ return F.nb(u.jour); } },
            { key:'sept', label:'7 jours', align:'right', cell:function(u){ return F.nb(u.sept); } },
            { key:'mois', label:'Ce mois', align:'right', cell:function(u){ return '<b>' + F.nb(u.mois) + '</b>'; } },
            { key:'requetes', label:'Requêtes', align:'right', hideSm:true, cell:function(u){ return F.nb(u.requetes); } },
            { key:'cout', label:'Coût estimé', align:'right', cell:function(u){ return cout(u.cout); } }
          ],
          rows:s.utilisateurs,
          empty:UI.etatVide('Aucune consommation', 'Personne n\'a utilisé la voix Google ce mois-ci.', I.mic)
        }));
        box.appendChild(cU);

        /* ---- 3. Par modèle ---- */
        var cM = UI.carte('Par modèle', { sub:'Ce mois. La part gratuite est propre à chaque modèle chez Google.' });
        cM.body.appendChild(UI.table({
          dense:true,
          columns:[
            { key:'libelle', label:'Modèle', cell:function(m){ return '<b>' + esc(m.libelle) + '</b>'; } },
            { key:'car', label:'Caractères', align:'right', cell:function(m){ return F.nb(m.car); } },
            { key:'req', label:'Requêtes', align:'right', cell:function(m){ return F.nb(m.req); } },
            { key:'brut', label:'Coût estimé (brut)', align:'right', hideSm:true,
              cell:function(m){ return esc(dollars(m.brut)); } },
            { key:'apresGratuite', label:'Coût estimé (après gratuité)', align:'right',
              cell:function(m){ return esc(dollars(m.apresGratuite)); } }
          ],
          rows:s.modeles,
          empty:UI.etatVide('Aucune voix utilisée', 'Rien ce mois-ci.', I.mic)
        }));
        box.appendChild(cM);
        return box;
      }, 'Lecture de la consommation…');
    }
  });
})();
