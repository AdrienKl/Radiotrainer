/* =============================================================================
   Albatros VFR — Admin · /admin/voix — LA VOIX GOOGLE : CONSOMMATION ET COÛT
   -----------------------------------------------------------------------------
   Ajoutée le 27/09/2026. Trois onglets :
     · Consommation      — combien, qui, avec quelles voix, et à quel coût ;
     · Voix proposées    — quelles voix les élèves peuvent choisir, laquelle
                           par défaut ; les écouter ;
     · Quotas et comptes — le plafond journalier, qui est Premium, et le
                           journal de ces changements.
   Les deux derniers ÉCRIVENT, et ce sont les seules pages de la console à le
   faire : toutes leurs écritures passent par des fonctions de la base
   (sql/007) qui exigent le rôle « admin » et laissent une ligne d'audit.

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
    var parU = {}, parM = {}, avantJour = {}, duJour = {}, parJ = {};

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
        var jj = parJ[x.jour] || (parJ[x.jour] = { jour:x.jour, car:0, req:0 });
        jj.car += car; jj.req += req;
      }
    });

    /* Le coût du mois déduit la part gratuite PAR MODÈLE (elle est par SKU
       chez Google). Celui du jour est ce que le jour AJOUTE au mois. */
    var codes = Object.keys(parM);
    var coutMois = T.somme(codes.map(function(m){ return T.apresGratuite(m, parM[m].car); }));
    var coutJour = T.somme(Object.keys(duJour).map(function(m){
      return T.duJour(m, avantJour[m] || 0, duJour[m]);
    }));
    /* Le coût BRUT, sans la part gratuite : ce que ces caractères coûteraient
       si Google n'offrait rien. Tant que la gratuité couvre tout, le coût à
       payer vaut 0 — et un « 0,00 $ » seul ressemble à une panne (remarqué le
       27/09/2026). On affiche donc le brut, marqué d'une astérisque quand la
       gratuité en couvre une part. */
    var brutMois = T.somme(codes.map(function(m){ return T.brut(m, parM[m].car); }));
    var brutJour = T.somme(Object.keys(duJour).map(function(m){ return T.brut(m, duJour[m]); }));
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
             brutJour:brutJour, brutMois:brutMois,
             nonPublies:nonPublies, utilisateurs:utilisateurs, modeles:modeles,
             parJour:Object.keys(parJ).sort().map(function(k){ return parJ[k]; }) };
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

  function toast(m){ try{ if (window.showToast) window.showToast(m); }catch(e){} }
  function erreurDe(e){ return (e && (e.message || e.details || e.hint)) || String(e); }
  function libelleVoix(v, avecModele){ return (window.Voix && window.Voix.libelleGoogle) ? window.Voix.libelleGoogle(v, avecModele) : v.nom; }
  function modeleDe(nom){ var f = window.Voix && window.Voix.familleGoogle && window.Voix.familleGoogle(nom); return f ? f.code : ''; }
  function tarifTexte(code){
    var prix = RT.tarifsVoix.prixAuMillion(code);
    return prix != null ? dollars(prix) + ' / million' : 'Tarif non publié';
  }

  /* ======================= 1. CONSOMMATION ============================== */
  function ongletConsommation(zone){
    var T = RT.tarifsVoix;
    zone.appendChild(UI.notice(
      'Coût estimé d\'après les tarifs publics de Google relevés le ' + T.TARIFS.releveLe
      + ', en dollars US. Ce n\'est pas une facture : la part gratuite mensuelle vaut pour tout '
      + 'le compte de facturation Google (elle est déduite du total du mois, pas du coût par '
      + 'utilisateur, qui est brut), et Google compte les caractères à sa façon. La facture '
      + 'réelle est dans la console Google Cloud › Facturation.',
      'warn', 'Coût estimé, pas une facture'));
    var z = el('div');
    zone.appendChild(z);
    UI.charger(z, RT.data.voix(), function(d){
      var s = calculer(d);
      var box = el('div');
      box.style.cssText = 'display:flex;flex-direction:column;gap:18px';
      function montant(sm){ return sm.inconnu && !sm.total ? 'Tarif non publié' : esc(dollars(sm.total)); }
      var nonChiffre = 'hors caractères Chirp HD, au tarif non publié';
      /* Le montant affiché est le coût estimé BRUT. L'astérisque dit que la
         part gratuite de Google en couvre tout ou partie ; l'indice dit ce
         qui reste à payer. */
      function tuileCout(brut, apayer, libelle){
        var couvert = brut.total > apayer.total;
        var indices = [];
        if (couvert) indices.push('* couvert par les crédits gratuits de Google — à payer : ' + dollars(apayer.total));
        if (brut.inconnu) indices.push(nonChiffre);
        return UI.tuile({ icon:I.target, value:montant(brut) + (couvert ? '<sup class="adm-asterisque">*</sup>' : ''),
                          label:libelle, hint:indices.join(' · ') || null });
      }
      var st = el('div', 'adm-stats adm-stats--3');
      st.appendChild(UI.tuile({ icon:I.mic, value:F.nb(s.jour.car), label:'caractères aujourd\'hui' }));
      st.appendChild(UI.tuile({ icon:I.chart, value:F.nb(s.mois.car), label:'caractères ce mois' }));
      st.appendChild(UI.tuile({ icon:I.users, value:F.nb(s.actifsMois), label:'comptes Premium l\'ayant utilisée ce mois',
        hint:s.premiumTotal != null ? 'sur ' + F.nb(s.premiumTotal) + ' compte' + (s.premiumTotal > 1 ? 's' : '') + ' Premium' : null }));
      st.appendChild(UI.tuile({ icon:I.play, value:F.nb(s.jour.req), label:'requêtes aujourd\'hui',
        hint:F.nb(s.mois.req) + ' ce mois' }));
      st.appendChild(tuileCout(s.brutJour, s.coutJour, 'coût estimé aujourd\'hui'));
      st.appendChild(tuileCout(s.brutMois, s.coutMois, 'coût estimé ce mois'));
      box.appendChild(st);
      if (s.brutMois.total > s.coutMois.total)
        box.appendChild(UI.notice('Coût estimé sans les crédits gratuits de Google : 1 million de caractères '
          + 'offerts chaque mois par modèle (4 millions pour WaveNet), pour tout le compte de facturation. '
          + 'Tant qu\'ils suffisent, Google ne facture rien.', 'info', '* Couvert par les crédits gratuits'));
      if (s.nonPublies > 0)
        box.appendChild(UI.notice(F.nb(s.nonPublies) + ' caractères ce mois viennent de voix Chirp HD, '
          + 'dont Google ne publie pas le tarif : ils ne sont comptés dans aucun montant.', 'info', 'Tarif non publié'));

      /* Jour par jour, ce mois : voir d'un coup d'œil un pic, ou une pente. */
      var cJ = UI.carte('Jour par jour', { sub:'Caractères synthétisés chaque jour de ce mois.' });
      cJ.body.appendChild(UI.graphBarres(s.parJour.map(function(j){
        return { label:j.jour.slice(8, 10) + '/' + j.jour.slice(5, 7), n:j.car,
                 valueText:F.nb(j.car) + ' car. · ' + F.nb(j.req) + ' req.' };
      }), { emptyTitle:'Rien ce mois-ci', emptyDetail:'Personne n\'a encore utilisé la voix Google ce mois.' }));
      box.appendChild(cJ);

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

  /* ======================= 2. VOIX PROPOSÉES ============================ */
  function ongletCatalogue(zone, redessiner){
    var c = UI.carte('Voix proposées aux élèves', { sub:'Une voix désactivée n\'est plus proposée dans les Paramètres, '
      + 'et la base la refuse même si un élève l\'avait déjà choisie. La voix par défaut est présélectionnée '
      + 'quand un élève passe à Google. Une voix que Google ajoutera sera proposée d\'office.' });
    zone.appendChild(c);
    UI.charger(c.body, RT.data.voixCatalogue(), function(liste){
      var ordre = familles().map(function(f){ return f.code; });
      liste.sort(function(a, b){
        var ia = ordre.indexOf(modeleDe(a.nom)), ib = ordre.indexOf(modeleDe(b.nom));
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.nom.localeCompare(b.nom);
      });
      function regler(v, active, parDefaut, texte){
        RT.data.voixRegler(v.nom, active, parDefaut).then(function(){ toast(texte); redessiner(); },
          function(e){ toast('Refusé : ' + erreurDe(e)); });
      }
      var tab = UI.table({
        dense:true,
        columns:[
          { key:'nom', label:'Voix', cell:function(v){
              return '<b>' + esc(libelleVoix(v)) + '</b>'
                + (v.parDefaut ? ' ' + UI.badge('par défaut', 'violet') : '')
                + (!v.active ? ' ' + UI.badge('désactivée', 'bad') : ''); } },
          { key:'modele', label:'Modèle', cell:function(v){ return esc(libelleModele(modeleDe(v.nom))); } },
          { key:'tarif', label:'Tarif', align:'right', hideSm:true, cell:function(v){ return esc(tarifTexte(modeleDe(v.nom))); } },
          { key:'actions', label:'', align:'right', cell:function(v){
              return '<span class="adm-voix-actions" data-voix="' + esc(v.nom) + '"></span>'; } }
        ],
        rows:liste,
        empty:UI.etatVide('Aucune voix', 'voix-atc n\'a renvoyé aucune voix française.', I.mic)
      });
      /* Les boutons sont posés APRÈS le rendu du tableau : ses cellules
         reçoivent du HTML, pas des éléments avec leurs écouteurs. */
      liste.forEach(function(v){
        var hote = tab.querySelector('.adm-voix-actions[data-voix="' + v.nom + '"]');
        if (!hote) return;
        hote.style.cssText = 'display:inline-flex;gap:6px;flex-wrap:wrap;justify-content:flex-end';
        hote.appendChild(UI.bouton('Écouter', { disabled:!v.active,
          title:v.active ? 'Une phrase de contrôleur avec cette voix' : 'Réactivez-la pour l\'écouter',
          onClick:function(){ ecouter(v); } }));
        hote.appendChild(UI.bouton(v.active ? 'Désactiver' : 'Activer', { onClick:function(){
          if (v.active && v.parDefaut) return toast('Choisissez d\'abord une autre voix par défaut.');
          regler(v, !v.active, false, v.active ? 'Voix désactivée : ' + libelleVoix(v, true) : 'Voix réactivée : ' + libelleVoix(v, true));
        } }));
        if (v.active && !v.parDefaut)
          hote.appendChild(UI.bouton('Par défaut', { onClick:function(){
            regler(v, true, true, 'Voix par défaut : ' + libelleVoix(v, true)); } }));
      });
      return tab;
    }, 'Lecture des voix…');
  }

  /* L'écoute passe par le MÊME moteur que les exercices, avec la voix imposée
     pour ce seul message (opts.voixGoogle). Elle est décomptée sur le quota de
     l'administrateur, qui doit être Premium : la base ne fait pas d'exception. */
  function ecouter(v){
    if (!window.Voix) return toast('Le moteur de voix n\'est pas chargé.');
    if (window.Voix.relancerGoogle) window.Voix.relancerGoogle();
    window.Voix.parler('Fox-trot Alpha Bravo Charlie Delta, autorisé atterrissage piste deux sept, vent deux cinq zéro degrés, dix nœuds.', {
      voixGoogle:v.nom,
      onDebut:function(){
        var e = window.Voix.etatGoogle ? window.Voix.etatGoogle() : {};
        if (e.dernier !== 'google')
          toast('Voix du navigateur : ' + (e.erreur && e.erreur.statut === 403
            ? 'l\'écoute des voix Google demande un compte Premium' : 'Google indisponible pour le moment') + '.');
      }
    });
  }

  /* ======================= 3. QUOTAS ET COMPTES ========================= */
  function ongletQuotas(zone, redessiner){
    /* ---- Le plafond ---- */
    var cP = UI.carte('Plafond journalier', { sub:'Caractères par compte Premium et par jour (heure de Paris). '
      + 'Au-delà, la base refuse, et l\'élève entend la voix du navigateur. Bornes : 1 000 à 10 000 000.' });
    zone.appendChild(cP);
    UI.charger(cP.body, RT.data.voixPlafond(), function(p){
      var box = el('div');
      box.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap';
      var champ = el('input', 'set-input');
      champ.type = 'number'; champ.min = 1000; champ.max = 10000000; champ.step = 1000;
      champ.value = p.plafond; champ.setAttribute('aria-label', 'Plafond journalier en caractères');
      box.appendChild(champ);
      box.appendChild(UI.bouton('Enregistrer', { onClick:function(){
        var n = parseInt(champ.value, 10);
        if (!(n >= 1000 && n <= 10000000)) return toast('Le plafond doit être entre 1 000 et 10 000 000.');
        if (n === p.plafond) return;
        (window.rtConfirm ? window.rtConfirm('Passer le plafond de ' + F.nb(p.plafond) + ' à ' + F.nb(n)
            + ' caractères par jour et par compte Premium ? Le changement vaut immédiatement.',
            { title:'Changer le plafond', ok:'Changer' }) : Promise.resolve(true))
          .then(function(oui){
            if (!oui) return;
            RT.data.voixDefinirPlafond(n).then(function(){ toast('Plafond : ' + F.nb(n) + ' caractères par jour.'); redessiner(); },
              function(e){ toast('Refusé : ' + erreurDe(e)); });
          });
      } }));
      var note = el('span', 'adm-card__sub', esc('Actuel : ' + F.nb(p.plafond)
        + (p.majLe ? ' — changé le ' + F.dateHeure(p.majLe) : ' — valeur d\'origine')
        + '. Environ ' + F.nb(Math.round(p.plafond / 400)) + ' ATIS par jour.'));
      box.appendChild(note);
      return box;
    }, 'Lecture du plafond…');

    /* ---- Les comptes ---- */
    var cC = UI.carte('Comptes Premium', { sub:'Passer un compte en Premium, ou le repasser en gratuit, sans paiement. '
      + 'Cherchez par nom ou e-mail pour trouver un compte gratuit.' });
    zone.appendChild(cC);
    var barre = el('div');
    barre.style.cssText = 'display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap';
    var recherche = el('input', 'set-input');
    recherche.type = 'search'; recherche.placeholder = 'Nom ou e-mail…';
    recherche.setAttribute('aria-label', 'Chercher un compte');
    barre.appendChild(recherche);
    cC.body.appendChild(barre);
    var liste = el('div');
    cC.body.appendChild(liste);
    function charger(){
      UI.charger(liste, RT.data.comptesPlan({ q:recherche.value }), function(rows){
        var tab = UI.table({
          dense:true,
          columns:[
            { key:'name', label:'Compte', cell:function(u){
                return '<b>' + esc(u.name) + '</b>' + (u.role === 'admin' ? ' ' + UI.badge('admin', 'violet') : ''); } },
            { key:'email', label:'E-mail', hideSm:true, cell:function(u){ return esc(u.email || ''); } },
            { key:'plan', label:'Plan', cell:function(u){
                return u.plan === 'premium' ? UI.badge('Premium', 'violet') : UI.badge('Gratuit'); } },
            { key:'act', label:'', align:'right', cell:function(u){
                return '<span class="adm-plan-act" data-id="' + esc(u.id) + '"></span>'; } }
          ],
          rows:rows,
          empty:UI.etatVide(recherche.value ? 'Aucun compte trouvé' : 'Aucun compte Premium',
            recherche.value ? 'Essayez une autre recherche.' : 'Cherchez un compte pour le passer en Premium.', I.users)
        });
        rows.forEach(function(u){
          var hote = tab.querySelector('.adm-plan-act[data-id="' + u.id + '"]');
          if (!hote) return;
          var vers = u.plan === 'premium' ? 'free' : 'premium';
          hote.appendChild(UI.bouton(vers === 'premium' ? 'Passer en Premium' : 'Repasser en gratuit', { onClick:function(){
            (window.rtConfirm ? window.rtConfirm((vers === 'premium'
                ? u.name + ' obtiendra la voix Google, dans la limite du plafond journalier.'
                : u.name + ' reviendra à la voix du navigateur.') + ' Le changement est inscrit au journal.',
                { title:vers === 'premium' ? 'Passer en Premium' : 'Repasser en gratuit', ok:'Confirmer' })
              : Promise.resolve(true)).then(function(oui){
                if (!oui) return;
                RT.data.definirPlan(u.id, vers).then(function(){
                  toast(u.name + (vers === 'premium' ? ' est Premium.' : ' est repassé en gratuit.')); redessiner();
                }, function(e){ toast('Refusé : ' + erreurDe(e)); });
              });
          } }));
        });
        return tab;
      }, 'Lecture des comptes…');
    }
    var minuterie = null;
    recherche.addEventListener('input', function(){ clearTimeout(minuterie); minuterie = setTimeout(charger, 300); });
    charger();

    /* ---- Le journal ---- */
    var cJ = UI.carte('Journal des changements', { sub:'Les 20 dernières écritures de ces deux onglets, tirées du journal d\'audit.' });
    zone.appendChild(cJ);
    UI.charger(cJ.body, RT.data.voixJournal(), function(rows){
      function quoi(r){
        var m = r.meta || {};
        if (r.action === 'compte.plan') return r.cible + ' : ' + (m.avant || '?') + ' → ' + (m.apres || '?');
        if (r.action === 'voix.plafond') return 'Plafond : ' + F.nb(m.avant) + ' → ' + F.nb(m.apres);
        return libelleVoix({ nom:r.cible }, true) + ' : ' + (m.active ? 'active' : 'désactivée') + (m.par_defaut ? ', par défaut' : '');
      }
      return UI.table({
        dense:true,
        columns:[
          { key:'at', label:'Quand', cell:function(r){ return esc(F.dateHeure(r.at)); } },
          { key:'adminName', label:'Par', cell:function(r){ return esc(r.adminName); } },
          { key:'quoi', label:'Changement', cell:function(r){ return esc(quoi(r)); } }
        ],
        rows:rows,
        empty:UI.etatVide('Aucun changement', 'Rien n\'a encore été modifié ici.', I.info)
      });
    }, 'Lecture du journal…');
  }

  /* ======================= LA PAGE ===================================== */
  var ONGLETS = [
    { id:'conso',    libelle:'Consommation',      rendre:ongletConsommation },
    { id:'voix',     libelle:'Voix proposées',    rendre:ongletCatalogue },
    { id:'quotas',   libelle:'Quotas et comptes', rendre:ongletQuotas }
  ];
  var ongletCourant = 'conso';

  RT.page('admin/voix', {
    render:function(hote){
      var tete = el('div', 'adm-head');
      var g = el('div');
      g.appendChild(el('h1', 'adm-h1', 'Voix Google'));
      g.appendChild(el('p', 'adm-sub',
        'La voix Google Cloud Text-to-Speech des comptes Premium : consommation, voix proposées, quotas.'));
      tete.appendChild(g);
      hote.appendChild(tete);

      /* Les onglets reprennent le segmenté des Paramètres (.seg3) : même
         composant, mêmes contrastes vérifiés. */
      var barre = el('div', 'seg3');
      barre.setAttribute('role', 'tablist');
      /* max-content : dans la colonne de la page, un inline-flex s'étire
         sinon sur toute la largeur, et les trois boutons flottent à gauche
         d'une longue pilule vide. max-width : sur téléphone, il revient à la
         ligne plutôt que de déborder. */
      barre.style.cssText = 'margin-bottom:18px;width:max-content;max-width:100%;flex-wrap:wrap';
      var zone = el('div');
      zone.style.cssText = 'display:flex;flex-direction:column;gap:18px';
      function afficher(){
        [].forEach.call(barre.children, function(b){
          var actif = b.getAttribute('data-onglet') === ongletCourant;
          b.classList.toggle('active', actif); b.setAttribute('aria-selected', actif ? 'true' : 'false');
        });
        UI.vide(zone);
        ONGLETS.filter(function(o){ return o.id === ongletCourant; })[0].rendre(zone, afficher);
      }
      ONGLETS.forEach(function(o){
        var b = el('button', 'seg3-opt', esc(o.libelle));
        b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('data-onglet', o.id);
        b.addEventListener('click', function(){ ongletCourant = o.id; afficher(); });
        barre.appendChild(b);
      });
      hote.appendChild(barre);
      hote.appendChild(zone);
      afficher();
    }
  });
})();
