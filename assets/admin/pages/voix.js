/* =============================================================================
   Albatros VFR — Admin · /admin/voix — LA VOIX GOOGLE : CONSOMMATION ET COÛT
   -----------------------------------------------------------------------------
   Ajoutée le 27/09/2026. Quatre onglets :
     · Consommation      — combien, qui, avec quelles voix, et à quel coût ;
     · Voix proposées    — quelles voix les élèves peuvent choisir, laquelle
                           par défaut ; les écouter ;
     · Quotas et comptes — le plafond journalier, qui est Premium, et le
                           journal de ces changements ;
     · Prononciation     — (30/09/2026) écouter, voix par voix, chaque lettre
                           de l'alphabet aéro, les chiffres et les mots de
                           l'aviation, tels que l'élève les entend.
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
          onClick:function(e){ ecouter(v, e.currentTarget); } }));
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
  function ecouter(v, bouton){
    direTexte('Fox-trot Alpha Bravo Charlie Delta, autorisé atterrissage piste deux sept, vent deux cinq zéro degrés, dix nœuds.',
              v.nom, bouton, false, null);
  }
  /* Une écoute par Google avec une voix IMPOSÉE (opts.voixGoogle), le même
     moteur que les exercices — donc la même table de prononciation, sauf
     `brut`. `etat` (facultatif) : un élément où écrire le résultat EN CLAIR et
     qui RESTE à l'écran — un toast passe, et « la voix ne marche plus » sans
     la cause ne se répare pas. */
  function direTexte(texte, nomVoix, bouton, brut, etat){
    if (!window.Voix) return toast('Le moteur de voix n\'est pas chargé.');
    if (window.Voix.relancerGoogle) window.Voix.relancerGoogle();
    // Pendant le clic, sinon Safari garde la sortie audio suspendue (5-voix.js › preparerAudio).
    if (window.Voix.preparerAudio) window.Voix.preparerAudio();
    var span = bouton && bouton.querySelector('span');
    var libelle = span ? span.textContent : '';
    function rendre(){ if (bouton){ bouton.disabled = false; if (span) span.textContent = libelle; } }
    function ecrire(msg, ok){
      if (!etat) return;
      etat.textContent = msg;
      etat.style.color = ok ? 'var(--adm-ok,#1f8a4c)' : 'var(--adm-bad,#c0392b)';
    }
    if (bouton){ bouton.disabled = true; if (span) span.textContent = 'Écoute…'; }
    ecrire('Envoi à Google…', true);
    window.Voix.parler(texte, {
      voixGoogle:nomVoix,
      brut:!!brut,
      /* Un aperçu qu'on attend, bouton en main : 12 s plutôt que le délai des
         exercices. Chirp 3 HD, fonction à froid, dépassait parfois 4,5 s, et
         l'écoute retombait sur la voix du navigateur. */
      delaiGoogle:12000,
      onDebut:function(){
        var e = window.Voix.etatGoogle ? window.Voix.etatGoogle() : {};
        if (e.dernier === 'google') ecrire('Dit par Google (' + nomVoix + ').', true);
        else {
          var msg = 'Voix du navigateur : ' + raisonEchec(e.erreur) + '.';
          ecrire(msg, false);
          if (!etat) toast(msg);
        }
      },
      onFin:rendre
    });
    // Filet : si rien ne parle du tout, le bouton ne reste pas bloqué.
    setTimeout(function(){
      rendre();
      if (etat && /Envoi/.test(etat.textContent)) ecrire('Rien n\'a parlé en 20 s. ' + raisonEchec((window.Voix.etatGoogle ? window.Voix.etatGoogle() : {}).erreur) + '.', false);
    }, 20000);
  }
  /* Pourquoi Google n'a pas parlé, en clair — c'est un écran d'administration :
     on dit la cause, pas « indisponible ». */
  function raisonEchec(err){
    if (!err) return 'Google n\'a pas répondu';
    if (err.cause === 'http'){
      if (err.statut === 403 && err.code === 'voix_desactivee') return 'cette voix est désactivée';
      if (err.statut === 403) return 'l\'écoute des voix Google demande un compte Premium';
      if (err.statut === 429) return 'le quota du jour de ce compte est atteint';
      if (err.statut === 401) return 'session expirée, reconnectez-vous';
      return 'voix-atc a répondu ' + err.statut + (err.code ? ' (' + err.code + ')' : '');
    }
    if (err.cause === 'delai') return 'Google a mis plus de 12 s à répondre';
    if (err.cause === 'audio') return 'la sortie audio du navigateur est bloquée';
    if (err.cause === 'decodage') return 'le son reçu est illisible';
    if (err.cause === 'session') return 'aucune session ouverte';
    return 'Google indisponible (' + err.cause + ')';
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
  /* ---- Prononciation (30/09/2026) ---------------------------------------
     Demande du développeur : « écouter toutes les lettres de l'alphabet aéro
     et tous les mots spécifiques à l'aviation pour voir s'ils sont bien
     prononcés ». Chaque bouton passe par le moteur des exercices, avec la
     voix choisie ici : on entend exactement ce qu'entend l'élève — table de
     prononciation (1-alphabet-nombres.js › PRONONCIATION_RADIO) et lecture
     des nombres (spokenDigits) comprises. Sous chaque mot réécrit, la graphie
     réellement envoyée : c'est elle qu'on corrige si le son est faux.
     Chaque écoute compte sur le quota de l'administrateur ; le moteur garde
     les 30 derniers sons, un mot réécouté ne recoûte rien.
     Ces listes sont des MOTS à écouter, pas de la phraséologie : aucune
     phrase n'est enseignée d'ici (CLAUDE.md § 2). */
  var GROUPES = [
    { titre:'Alphabet aéro', mots:['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel','India',
        'Juliett','Kilo','Lima','Mike','November','Oscar','Papa','Quebec','Romeo','Sierra','Tango',
        'Uniform','Victor','Whiskey','X-ray','Yankee','Zulu'] },
    { titre:'Chiffres', mots:['zéro','unité','deux','trois','quatre','cinq','six','sept','huit','neuf','décimale'] },
    { titre:'Sigles', mots:['VFR','IFR','QNH','QFE','QFU','ATIS','AFIS','ATC','CTR','CTA','TMA','SIV','ULM',
        'VOR','NDB','DME','ILS','GPS','SIGMET','METAR','TAF','NOTAM','CAVOK'] },
    { titre:'Mots de l\'aviation', mots:['Mayday','Pan Pan','transpondeur','affichez','ident','trafic','collationnez',
        'vent arrière','étape de base','finale','point d\'attente','remise de gaz','hectopascals','nœuds',
        'pieds','niveau de vol','Tour','Sol','Info','Approche'] },
    { titre:'Avions', mots:['Cessna','Piper','Robin','Jodel','Tecnam','Rallye','DR400','PA-28','TB10','DA40'] },
    { titre:'Nombres lus comme à la radio', nombres:true, mots:['QNH 1013','piste 22','piste 07','3500 pieds',
        'vent 250 degrés 15 nœuds','fréquence 135.530','fréquence 118.5','transpondeur 7000','niveau de vol 65','zone R 162'] }
  ];
  var voixPron = null;          // la voix choisie ici survit au redessin de l'onglet
  // Ce que le moteur enverra pour ce mot : prononciation, puis nombres — l'ordre de moteur.js › fillSpeech.
  function texteParle(t){
    try{ if (typeof prononciationRadio === 'function') t = prononciationRadio(t); }catch(e){}
    try{ if (typeof spokenDigits === 'function') t = spokenDigits(t); }catch(e){}
    return t;
  }
  // La clé d'un mot, comme sql/013 l'accepte : minuscules, accents et apostrophe gardés.
  function cleDe(m){ return String(m).toLowerCase().trim(); }
  var RE_CLE = /^[a-z0-9àâäçéèêëîïôöùûüÿœæ][a-z0-9àâäçéèêëîïôöùûüÿœæ' -]{0,39}$/;

  function ongletPrononciation(zone, redessiner){
    var c = UI.carte('Prononciation', { wide:true, sub:'Cliquez un mot : il est dit par Google avec la voix choisie, '
      + 'exactement comme pendant un exercice, et s\'ouvre dans l\'atelier. Là, changez sa graphie, réécoutez, et '
      + 'enregistrez : elle vaut pour tout le monde, toutes voix confondues, dès le prochain chargement. '
      + 'Chaque écoute compte sur votre quota ; un mot réécouté ne recoûte rien tant que la page reste ouverte.' });
    zone.appendChild(c);
    var lecture = Promise.all([RT.data.voixCatalogue(),
      RT.data.prononciations().then(null, function(){ return null; })]);
    UI.charger(c.body, lecture, function(t){
      var liste = t[0], reglees = t[1];
      /* Les graphies de la base, appliquées AVANT de dessiner : sous chaque mot,
         on montre ce que l'élève entend aujourd'hui. */
      if (reglees && typeof definirPrononciations === 'function') definirPrononciations(reglees);
      var parCle = {};
      (reglees || []).forEach(function(r){ parCle[r.mot] = r.dit; });
      var z = el('div');
      if (reglees === null)
        z.appendChild(UI.notice('Les graphies réglées ici ne sont pas encore disponibles : la migration sql/013 '
          + 'n\'est pas posée. L\'écoute marche ; l\'enregistrement attendra.', 'warn'));
      var actives = liste.filter(function(v){ return v.active; });
      if (!actives.length) return UI.etatVide('Aucune voix active', 'Activez une voix dans « Voix proposées ».', I.mic);
      var ordre = familles().map(function(f){ return f.code; });
      actives.sort(function(a, b){
        var ia = ordre.indexOf(modeleDe(a.nom)), ib = ordre.indexOf(modeleDe(b.nom));
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.nom.localeCompare(b.nom);
      });
      var barre = el('div');
      barre.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px';
      var sel = el('select');
      sel.setAttribute('aria-label', 'Voix à écouter');
      sel.className = 'adm-pron-voix';
      sel.style.cssText = 'padding:8px 10px;border-radius:10px;border:1px solid var(--adm-border,#ccc);font:inherit;max-width:100%';
      actives.forEach(function(v){
        var o = el('option', null, esc(libelleVoix(v, true) + (v.parDefaut ? ' — par défaut' : '')));
        o.value = v.nom;
        if (voixPron ? v.nom === voixPron : v.parDefaut) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function(){ voixPron = sel.value; });
      barre.appendChild(sel);
      var etat = el('span', 'adm-pron-etat');
      etat.setAttribute('role', 'status');
      etat.style.cssText = 'font-size:13px;font-weight:600';
      barre.appendChild(etat);
      z.appendChild(barre);

      /* ---- L'atelier : un mot, sa graphie, écouter, enregistrer ---- */
      var at = el('div', 'adm-pron-atelier hidden');
      at.style.cssText = 'border:1px solid var(--adm-border,#ccc);border-radius:12px;padding:12px;margin-bottom:16px';
      var atTitre = el('p', 'adm-pron-atelier-titre'); atTitre.style.margin = '0 0 8px';
      var atChamp = el('input'); atChamp.type = 'text'; atChamp.maxLength = 80; atChamp.className = 'adm-pron-graphie';
      atChamp.setAttribute('aria-label', 'Graphie envoyée à la voix');
      atChamp.style.cssText = 'flex:1 1 220px;min-width:0;padding:9px 11px;border-radius:10px;border:1px solid var(--adm-border,#ccc);font:inherit';
      var atMsg = el('p', 'adm-sub adm-pron-atelier-msg'); atMsg.setAttribute('role', 'alert'); atMsg.style.margin = '8px 0 0';
      var atLigne = el('div'); atLigne.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';
      atLigne.appendChild(atChamp);
      var motCourant = null;
      atLigne.appendChild(UI.bouton('Écouter cette graphie', { onClick:function(e){
        var g = atChamp.value.trim(); if (!g) return atChamp.focus();
        direTexte(g, sel.value, e.currentTarget, true, etat);
      } }));
      var bEnreg = UI.bouton('Enregistrer pour tout le monde', { cls:'cta', onClick:function(){
        var g = atChamp.value.trim(), k = cleDe(motCourant);
        if (!g) return (atMsg.textContent = 'La graphie est vide.');
        if (g.toLowerCase().indexOf(k) >= 0) return (atMsg.textContent = 'La graphie ne doit pas contenir le mot lui-même.');
        atMsg.textContent = 'Enregistrement…';
        RT.data.prononciationDefinir(k, g).then(function(){
          toast('Prononciation enregistrée : ' + motCourant + ' → ' + g);
          if (window.Voix && Voix.rechargerPrononciations) Voix.rechargerPrononciations();
          redessiner();
        }, function(e){ atMsg.textContent = 'Refusé : ' + erreurDe(e); });
      } });
      bEnreg.classList.add('adm-pron-enreg');
      atLigne.appendChild(bEnreg);
      var bRetirer = UI.bouton('Revenir à la graphie d\'origine', { onClick:function(){
        RT.data.prononciationRetirer(cleDe(motCourant)).then(function(){
          toast('Graphie d\'origine rétablie : ' + motCourant);
          if (window.Voix && Voix.rechargerPrononciations) Voix.rechargerPrononciations();
          redessiner();
        }, function(e){ atMsg.textContent = 'Refusé : ' + erreurDe(e); });
      } });
      bRetirer.classList.add('adm-pron-retirer');
      atLigne.appendChild(bRetirer);
      at.appendChild(atTitre); at.appendChild(atLigne); at.appendChild(atMsg);
      function ouvrirAtelier(m){
        var k = cleDe(m);
        motCourant = m; atMsg.textContent = '';
        if (!RE_CLE.test(k)){
          at.classList.remove('hidden');
          atTitre.innerHTML = '<b>' + esc(m) + '</b>';
          atChamp.value = texteParle(m);
          atMsg.textContent = 'Ce mot ne peut pas être réglé ici (caractères non admis).';
          bEnreg.disabled = true; bRetirer.classList.add('hidden');
          return;
        }
        bEnreg.disabled = (reglees === null);
        at.classList.remove('hidden');
        var propre = Object.prototype.hasOwnProperty.call(parCle, k);
        atTitre.innerHTML = '<b>' + esc(m) + '</b> — ' + (propre ? 'graphie réglée ici' : 'graphie du code');
        atChamp.value = texteParle(m);
        bRetirer.classList.toggle('hidden', !propre);
      }
      z.appendChild(at);

      // Une phrase libre, avec ou sans la table.
      var libre = el('div');
      libre.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px';
      var champ = el('input');
      champ.type = 'text'; champ.maxLength = 300; champ.className = 'adm-pron-libre';
      champ.placeholder = 'Un mot ou une phrase à écouter…';
      champ.setAttribute('aria-label', 'Texte libre à écouter');
      champ.style.cssText = 'flex:1 1 260px;min-width:0;padding:9px 11px;border-radius:10px;border:1px solid var(--adm-border,#ccc);font:inherit';
      libre.appendChild(champ);
      var brutLbl = el('label', null, '<input type="checkbox" class="adm-pron-brut"> sans la table');
      brutLbl.style.cssText = 'font-size:13px;display:inline-flex;gap:6px;align-items:center';
      libre.appendChild(brutLbl);
      libre.appendChild(UI.bouton('Écouter', { cls:'cta', onClick:function(e){
        var t = champ.value.trim(); if (!t) return champ.focus();
        var brut = brutLbl.querySelector('input').checked;
        direTexte(brut ? t : texteParle(t), sel.value, e.currentTarget, true, etat);
      } }));
      z.appendChild(libre);

      GROUPES.forEach(function(g){
        var tete = el('div');
        tete.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:space-between;margin:14px 0 8px';
        tete.appendChild(el('h3', null, esc(g.titre)));
        tete.firstChild.style.cssText = 'margin:0;font-size:14px';
        tete.appendChild(UI.bouton('Tout écouter', { title:'Le groupe en un seul message', onClick:function(e){
          direTexte(g.mots.map(texteParle).join(', '), sel.value, e.currentTarget, true, etat);
        } }));
        z.appendChild(tete);
        var grille = el('div', 'adm-pron-grille');
        grille.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px';
        g.mots.forEach(function(m){
          var dit = texteParle(m);
          var b = el('button', 'adm-pron-mot');
          b.type = 'button';
          b.setAttribute('data-mot', m);
          b.style.cssText = 'text-align:left;padding:8px 10px;border-radius:10px;border:1px solid var(--adm-border,#ccc);'
            + 'background:var(--adm-surface,transparent);color:inherit;font:inherit;cursor:pointer;min-height:44px';
          b.innerHTML = '<span>' + esc(m) + '</span>'
            + (dit !== m ? '<small style="display:block;color:var(--violet,#1f242b);font-size:11.5px">' + esc(dit) + '</small>' : '');
          b.addEventListener('click', function(){
            direTexte(dit, sel.value, b, true, etat);
            // Les nombres se lisent par règle (spokenDigits), pas par la table : pas d'atelier.
            if (!g.nombres) ouvrirAtelier(m);
          });
          grille.appendChild(b);
        });
        z.appendChild(grille);
      });
      return z;
    }, 'Lecture des voix…');
  }

  var ONGLETS = [
    { id:'conso',    libelle:'Consommation',      rendre:ongletConsommation },
    { id:'voix',     libelle:'Voix proposées',    rendre:ongletCatalogue },
    { id:'quotas',   libelle:'Quotas et comptes', rendre:ongletQuotas },
    { id:'prononciation', libelle:'Prononciation', rendre:ongletPrononciation }
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
