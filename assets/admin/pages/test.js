/* =============================================================================
   RadioTrainer — Admin · /admin/test — MODE TEST / CONTROLLER
   -----------------------------------------------------------------------------
   La seule page de la console qui AGIT sur l'application. Et elle agit en
   passant par les mêmes portes que l'interface élève :
     · window.rtRelancerScenario(index, icao)  — déjà exposé par le bloc principal ;
     · window.RT_TEST.lancerVol(cfg)           — réinjecte une configuration dans
       les variables du formulaire de Navigation puis appelle startFlight(),
       exactement comme le fait « Refaire ce vol » dans l'historique.
   Aucune logique de simulation n'est réécrite ici. Si un vol se comporte
   autrement depuis cette page que depuis la page Navigation, c'est un bug —
   pas une différence assumée.

   La page est séparée de l'expérience élève : elle vit sous #admin, l'entrée du
   menu n'apparaît qu'avec le drapeau de développement, et elle sera couverte par
   le futur système de permissions (rôle en base + RLS).
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin, UI = RT.ui;
  var el = UI.el, esc = UI.esc, I = UI.I, F = UI.F;

  function terrains(){
    if (typeof AERODROMES === 'undefined') return [];
    return AERODROMES;
  }
  function scenarios(){
    if (typeof SCENARIOS === 'undefined') return [];
    return SCENARIOS;
  }
  function avions(){
    return (window.RT_TEST && window.RT_TEST.avions) ? window.RT_TEST.avions() : [];
  }
  function toast(m){ if (window.showToast) window.showToast(m); }

  /* Un terrain au hasard, mais pas n'importe lequel : on reste sur les codes
     LF?? à quatre lettres, comme le fait le jeu de démonstration. */
  function terrainAuHasard(){
    var a = terrains().filter(function(x){ return /^LF[A-Z]{2}$/.test(x.icao); });
    if (!a.length) a = terrains();
    return a.length ? a[Math.floor(Math.random() * a.length)] : null;
  }

  function champ(label, noeud, aide){
    var f = el('div', 'adm-field');
    var l = el('label', null, esc(label));
    f.appendChild(l);
    f.appendChild(noeud);
    if (aide) f.appendChild(el('span', 'adm-gauge__sub', esc(aide)));
    return f;
  }
  function saisieTerrain(id, placeholder){
    var i = el('input');
    i.type = 'text'; i.id = id; i.placeholder = placeholder;
    i.setAttribute('list', 'admTerrains');
    i.autocomplete = 'off'; i.spellcheck = false;
    return i;
  }
  function liste(id, options, valeur){
    var s = el('select'); s.id = id;
    options.forEach(function(o){
      var op = el('option', null, esc(o.l)); op.value = o.v;
      if (o.v === valeur) op.selected = true;
      s.appendChild(op);
    });
    return s;
  }
  function icaoDe(v){
    var t = String(v || '').trim().toUpperCase();
    var m = t.match(/^[A-Z0-9]{4}/);
    return m ? m[0] : '';
  }

  RT.page('admin/test', {
    render:function(hote, ctx){
      var tete = el('div', 'adm-head');
      var g = el('div');
      g.appendChild(el('h1', 'adm-h1', 'Mode test / Controller'));
      g.appendChild(el('p', 'adm-sub',
        'Environnement de test personnel : lancer n\'importe quel scénario ou vol, sur '
      + 'n\'importe quel terrain, avec n\'importe quel appareil, et déclencher un imprévu '
      + 'précis au lieu d\'attendre le tirage au sort.'));
      tete.appendChild(g);
      hote.appendChild(tete);

      hote.appendChild(UI.notice(
        "Cette page agit vraiment sur l'application : lancer un vol ici ouvre la page "
      + "Navigation et démarre la simulation, exactement comme si vous aviez rempli le "
      + "formulaire. Les séances lancées d'ici sont enregistrées dans l'historique local "
      + "comme les autres — elles ne sont pas marquées « test ».",
        'warn', 'Actions réelles sur l\'application'));

      /* Liste partagée par les trois champs de terrain. 387 entrées : un datalist
         natif s'en sort mieux qu'une liste maison, et il est accessible. */
      var dl = el('datalist'); dl.id = 'admTerrains';
      terrains().forEach(function(a){
        var o = el('option'); o.value = a.icao + ' — ' + a.nom; dl.appendChild(o);
      });
      hote.appendChild(dl);

      var grille = el('div', 'adm-test-grid');
      hote.appendChild(grille);

      /* ================= Scénarios ================= */
      var cSc = UI.carte('Lancer un scénario',
        { sub:'Tous les scénarios du catalogue, sur le terrain de votre choix.' });
      var selSc = liste('admSc', scenarios().map(function(s, i){
        return { v:String(i), l:(i + 1) + '. ' + s.titre }; }), '0');
      cSc.body.appendChild(champ('Scénario', selSc));
      var inScAd = saisieTerrain('admScAd', 'ex : LFPT — Pontoise');
      cSc.body.appendChild(champ('Aérodrome', inScAd,
        'Laissez vide pour garder celui déjà sélectionné dans la page Scénarios.'));
      var rowSc = el('div', 'adm-btnrow');
      rowSc.appendChild(UI.bouton('Lancer le scénario', { cls:'cta', icon:I.play, onClick:function(){
        var idx = parseInt(selSc.value, 10);
        var icao = icaoDe(inScAd.value);
        if (typeof window.rtRelancerScenario !== 'function'){
          toast('Le module Scénarios n\'est pas disponible.'); return;
        }
        /* L'ORDRE compte : le module Scénarios écoute 'rt:page' et referme toute
           session en cours à chaque changement de page. Lancer puis naviguer
           refermait donc la session à peine ouverte. On navigue d'abord — c'est
           aussi ce que fait « Reprendre ce scénario » sur le tableau de bord. */
        if (window.rtNaviguer) window.rtNaviguer('exercices');
        var ok = window.rtRelancerScenario(idx, icao);
        if (!ok) toast('Scénario introuvable.');
      } }));
      rowSc.appendChild(UI.bouton('Terrain au hasard', { onClick:function(){
        var a = terrainAuHasard();
        if (a) inScAd.value = a.icao + ' — ' + a.nom;
      } }));
      cSc.body.appendChild(rowSc);
      cSc.body.appendChild(UI.notice(
        'Passe par window.rtRelancerScenario(index, icao), déjà utilisé par le bouton '
      + '« Reprendre ce scénario » du tableau de bord élève.', 'info'));
      grille.appendChild(cSc);

      /* ================= Vols ================= */
      var cVol = UI.carte('Lancer un vol',
        { sub:'Départ, arrivée, dégagement, appareil, niveau — et l\'imprévu imposé.' });
      var inDep = saisieTerrain('admDep', 'ex : LFPT — Pontoise');
      var inArr = saisieTerrain('admArr', 'ex : LFOB — Beauvais');
      var inAlt = saisieTerrain('admAlt', 'optionnel — terrain de dégagement');
      cVol.body.appendChild(champ('Départ', inDep));
      cVol.body.appendChild(champ('Arrivée', inArr, 'Requis en mode Voyage.'));
      cVol.body.appendChild(champ('Dégagement', inAlt,
        'Nécessaire pour tester l\'imprévu « terrain d\'arrivée fermé ».'));

      var lstAv = avions();
      var selAv = liste('admAv', lstAv.length
        ? lstAv.map(function(n){ return { v:n, l:n }; })
        : [{ v:'', l:'(module Navigation indisponible)' }],
        lstAv.indexOf('Cessna 152') >= 0 ? 'Cessna 152' : (lstAv[0] || ''));
      cVol.body.appendChild(champ('Appareil', selAv, lstAv.length + ' types disponibles.'));

      var selMode = liste('admMode', [{ v:'voyage', l:'Voyage' }, { v:'local', l:'Vol local' }], 'voyage');
      var selNiv  = liste('admNiv', [{ v:'debutant', l:'Débutant' }, { v:'reel', l:'Réel' }], 'debutant');
      cVol.body.appendChild(champ('Type de vol', selMode));
      cVol.body.appendChild(champ('Niveau', selNiv,
        'En mode Réel, le texte du contrôleur est masqué et les aléas sont plus fréquents.'));

      var inFl = el('input'); inFl.type = 'number'; inFl.id = 'admFl';
      inFl.min = '1000'; inFl.max = '10000'; inFl.step = '500'; inFl.value = '3500';
      var inPax = el('input'); inPax.type = 'number'; inPax.id = 'admPax';
      inPax.min = '0'; inPax.max = '5'; inPax.value = '1';
      cVol.body.appendChild(champ('Altitude demandée (ft)', inFl));
      cVol.body.appendChild(champ('Personnes à bord', inPax));

      var optsAlea = [{ v:'', l:'Tirage au sort (comportement normal)' },
                      { v:'aucun', l:'Aucun imprévu' }];
      Object.keys(RT.labels.alea).forEach(function(k){
        optsAlea.push({ v:k, l:RT.labels.alea[k] });
      });
      var selAlea = liste('admAlea', optsAlea, '');
      cVol.body.appendChild(champ('Imprévu imposé', selAlea,
        'Un seul imprévu majeur par vol, inséré avant l\'intégration — comme en usage normal.'));

      var rowVol = el('div', 'adm-btnrow');
      rowVol.appendChild(UI.bouton('Lancer le vol', { cls:'cta', icon:I.play, onClick:function(){
        if (!window.RT_TEST || !window.RT_TEST.lancerVol){
          toast('Le module Navigation n\'est pas disponible.'); return;
        }
        var err = window.RT_TEST.lancerVol({
          dep:icaoDe(inDep.value), arr:icaoDe(inArr.value), alt:icaoDe(inAlt.value),
          avion:selAv.value, mode:selMode.value, level:selNiv.value,
          fl:inFl.value, pax:inPax.value, alea:selAlea.value || null
        });
        if (err){ toast(err); return; }
        if (window.rtNaviguer) window.rtNaviguer('navigation');
      } }));
      rowVol.appendChild(UI.bouton('Tirer un vol au hasard', { onClick:function(){
        var a = terrainAuHasard(), b = terrainAuHasard();
        var n = 0;
        while (b && a && b.icao === a.icao && n++ < 10) b = terrainAuHasard();
        if (a) inDep.value = a.icao + ' — ' + a.nom;
        if (b) inArr.value = b.icao + ' — ' + b.nom;
        var c = terrainAuHasard();
        if (c) inAlt.value = c.icao + ' — ' + c.nom;
        if (lstAv.length) selAv.value = lstAv[Math.floor(Math.random() * lstAv.length)];
      } }));
      cVol.body.appendChild(rowVol);
      grille.appendChild(cVol);

      /* ================= Imprévus et urgences ================= */
      var cAlea = UI.carte('Imprévus et urgences',
        { sub:'Imposer l\'imprévu du prochain vol, sans le lancer tout de suite.' });
      var chips = el('div', 'adm-chips');
      var courant = (window.RT_TEST && window.RT_TEST.aleaImpose) ? window.RT_TEST.aleaImpose() : null;
      function majChips(){
        chips.querySelectorAll('.adm-chip').forEach(function(b){
          b.classList.toggle('on', b.dataset.alea === (courant || ''));
        });
      }
      [{ v:'', l:'Tirage au sort' }, { v:'aucun', l:'Aucun' }]
        .concat(Object.keys(RT.labels.alea).map(function(k){
          return { v:k, l:RT.labels.alea[k] }; }))
        .forEach(function(o){
          var b = el('button', 'adm-chip', esc(o.l));
          b.type = 'button'; b.dataset.alea = o.v;
          b.addEventListener('click', function(){
            courant = o.v || null;
            if (window.RT_TEST && window.RT_TEST.forcerAlea) window.RT_TEST.forcerAlea(courant);
            selAlea.value = o.v;
            majChips();
            toast(o.v ? 'Prochain vol : ' + o.l.toLowerCase() + '.' : 'Imprévu remis au tirage au sort.');
          });
          chips.appendChild(b);
        });
      majChips();
      cAlea.body.appendChild(chips);
      cAlea.body.appendChild(UI.notice(
        "Le forçage est à usage unique : il est consommé par la construction du vol suivant, "
      + "puis le tirage au sort reprend la main. « Terrain d'arrivée fermé » exige un terrain "
      + "de dégagement — sans lui, le tirage normal s'applique.", 'info'));
      grille.appendChild(cAlea);

      /* ================= Remise à zéro ================= */
      var cRaz = UI.carte('Réinitialiser',
        { sub:'Abandonner la simulation en cours et repartir propre.' });
      var rowRaz = el('div', 'adm-btnrow');
      rowRaz.appendChild(UI.bouton('Clore le vol en cours', { onClick:function(){
        if (!window.RT_TEST){ toast('Module Navigation indisponible.'); return; }
        if (!window.RT_TEST.enVol()){ toast('Aucun vol en cours.'); peindreEtat(); return; }
        window.RT_TEST.reinitialiser();
        toast('Vol clos et débriefé — il est enregistré dans l\u2019historique local.');
        peindreEtat();
      } }));
      rowRaz.appendChild(UI.bouton('Effacer la sauvegarde de reprise', { onClick:function(){
        try { localStorage.removeItem('rt-vol-en-cours'); } catch(e){}
        toast('Sauvegarde de reprise effacée.');
        peindreEtat();
      } }));
      rowRaz.appendChild(UI.bouton('Vider tout l\'historique local', { cls:'ghost', onClick:function(){
        var suite = window.rtConfirm
          ? window.rtConfirm('Vos vols, vos sessions de scénarios, vos journées de pratique et '
            + 'le quota du jour seront effacés de cet appareil. Les réglages ne sont pas touchés.',
            { title:'Vider l\'historique local ?', ok:'Vider', cancel:'Annuler' })
          : Promise.resolve(window.confirm('Vider tout l\'historique local ?'));
        suite.then(function(ok){
          if (!ok) return;
          ['rt-vols','rt-jours','rt-quota','rt-vol-en-cours','radiotrainer_history_v2']
            .forEach(function(k){ try { localStorage.removeItem(k); } catch(e){} });
          toast('Historique local vidé.');
          peindreEtat();
        });
      } }));
      cRaz.body.appendChild(rowRaz);
      cRaz.body.appendChild(UI.notice(
        "« Clore le vol » emprunte le même chemin que le bouton « Terminer le vol » de la page "
      + "Navigation : le vol est débriefé et enregistré. Il n'existe pas de sortie silencieuse — "
      + "un second chemin de clôture serait un second endroit où les bugs se cachent.", 'info'));
      cRaz.body.appendChild(UI.notice(
        "« Vider tout l'historique » agit sur les VRAIES données de cet appareil, pas sur le jeu "
      + "de démonstration. C'est irréversible.", 'danger'));
      grille.appendChild(cRaz);

      /* ================= État de l'environnement ================= */
      var cEnv = UI.carte('État de l\'environnement',
        { sub:'Ce que le navigateur sait faire, et ce que l\'application a en mémoire.' });
      var envBox = el('div');
      cEnv.body.appendChild(envBox);
      var rowEnv = el('div', 'adm-btnrow');
      rowEnv.style.marginTop = '13px';
      rowEnv.appendChild(UI.bouton('Rafraîchir', { icon:I.refresh, onClick:function(){ peindreEtat(); } }));
      rowEnv.appendChild(UI.bouton('Tester la voix du contrôleur', { icon:I.mic, onClick:function(){
        try {
          if (!window.speechSynthesis){ toast('Synthèse vocale indisponible.'); return; }
          var u = new SpeechSynthesisUtterance(
            'Fox Alpha Bravo Charlie Delta, Pontoise Tour, bonjour, piste 05 en service, QNH 1013.');
          u.lang = 'fr-FR';
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
          toast('Message de test envoyé à la synthèse vocale.');
        } catch(e){ toast('Échec : ' + e.message); }
      } }));
      cEnv.body.appendChild(rowEnv);
      grille.appendChild(cEnv);

      function ligneKV(k, v){
        var d = el('div', 'adm-kv');
        d.innerHTML = '<b>' + esc(k) + '</b><span>' + esc(v) + '</span>';
        return d;
      }
      function tailleCle(k){
        try {
          var v = localStorage.getItem(k);
          if (v == null) return null;
          return Math.round(v.length / 1024 * 10) / 10;
        } catch(e){ return null; }
      }
      function peindreEtat(){
        UI.vide(envBox);
        var reco = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
        var voix = 0;
        try { voix = (window.speechSynthesis.getVoices() || []).filter(function(v){
          return /^fr/i.test(v.lang); }).length; } catch(e){}
        envBox.appendChild(ligneKV('Reconnaissance vocale', reco ? 'disponible' : 'INDISPONIBLE'));
        envBox.appendChild(ligneKV('Synthèse vocale', window.speechSynthesis ? 'disponible' : 'INDISPONIBLE'));
        envBox.appendChild(ligneKV('Voix françaises', String(voix)));
        envBox.appendChild(ligneKV('Module Navigation', window.RT_TEST ? 'chargé' : 'absent'));
        envBox.appendChild(ligneKV('Module Scénarios',
          (typeof window.rtRelancerScenario === 'function') ? 'chargé' : 'absent'));
        envBox.appendChild(ligneKV('Vol en cours',
          (window.RT_TEST && window.RT_TEST.enVol()) ? 'oui' : 'non'));
        envBox.appendChild(ligneKV('Imprévu imposé',
          (window.RT_TEST && window.RT_TEST.aleaImpose())
            ? (RT.labels.alea[window.RT_TEST.aleaImpose()] || window.RT_TEST.aleaImpose())
            : 'aucun (tirage au sort)'));
        envBox.appendChild(ligneKV('Aérodromes chargés', String(terrains().length)));
        envBox.appendChild(ligneKV('Scénarios chargés', String(scenarios().length)));
        envBox.appendChild(ligneKV('Types d\'appareil', String(avions().length)));
        envBox.appendChild(ligneKV('Espaces aériens', window.RT_AIR ? 'chargés' : 'absents'));
        ['rt-vols','radiotrainer_history_v2','rt-vol-en-cours','rt-jours','rt-quota',
         'rt-settings','rt-admin-errors'].forEach(function(k){
          var t = tailleCle(k);
          envBox.appendChild(ligneKV(k, t == null ? 'vide' : t + ' Ko'));
        });
      }
      peindreEtat();
      /* Les voix arrivent en asynchrone dans Chrome : sans ce rappel, le compteur
         afficherait 0 au premier affichage puis mentirait jusqu'au rafraîchissement. */
      try {
        if (window.speechSynthesis && 'onvoiceschanged' in window.speechSynthesis)
          window.speechSynthesis.addEventListener('voiceschanged', peindreEtat, { once:true });
      } catch(e){}

      /* ================= Cas limites ================= */
      var cLim = UI.carte('Cas inhabituels',
        { sub:'Les configurations qui cassent les hypothèses, préremplies en un clic.' });
      var CAS = [
        { l:'Terrain non contrôlé (AFIS / auto-information)',
          d:'Vérifie la variante AFIS : pas de clairance, annonce d\'intentions.',
          f:function(){ remplirParFiltre(function(a){ return !/^LF(P|B|L|M|R|S)/.test(a.icao); }); } },
        { l:'Grand terrain contrôlé au départ',
          d:'Vérifie l\'ATIS, la clairance et le transpondeur.',
          f:function(){ inDep.value = 'LFPG — Paris Charles de Gaulle'; } },
        { l:'Départ = arrivée',
          d:'Doit être refusé ou basculer en vol local.',
          f:function(){ inArr.value = inDep.value; } },
        { l:'Vol local (sans arrivée)',
          d:'Aucun déroutement possible, tour de piste attendu.',
          f:function(){ selMode.value = 'local'; inArr.value = ''; } },
        { l:'Altitude en classe A',
          d:'La route doit être décalée ou l\'altitude ajustée.',
          f:function(){ inFl.value = '10000'; } },
        { l:'Planeur en mode Réel',
          d:'Appareil lent, phraséologie inhabituelle, texte ATC masqué.',
          f:function(){
            var p = avions().filter(function(n){ return /planeur/i.test(n); })[0];
            if (p) selAv.value = p;
            selNiv.value = 'reel'; } },
        { l:'Urgence dès le premier vol',
          d:'MAYDAY imposé sur un élève sans historique.',
          f:function(){ selAlea.value = 'moteur';
                        if (window.RT_TEST) window.RT_TEST.forcerAlea('moteur');
                        courant = 'moteur'; majChips(); } },
        { l:'Terrain d\'arrivée fermé',
          d:'Déroutement vers le dégagement — exige un terrain de dégagement.',
          f:function(){
            if (!icaoDe(inAlt.value)){ var a = terrainAuHasard(); if (a) inAlt.value = a.icao + ' — ' + a.nom; }
            selAlea.value = 'ferme';
            if (window.RT_TEST) window.RT_TEST.forcerAlea('ferme');
            courant = 'ferme'; majChips(); } }
      ];
      function remplirParFiltre(f){
        var a = terrains().filter(f);
        if (!a.length) return;
        var x = a[Math.floor(Math.random() * a.length)];
        inDep.value = x.icao + ' — ' + x.nom;
      }
      var listeCas = el('div', 'adm-bars');
      CAS.forEach(function(c){
        var b = el('button', 'adm-alert');
        b.type = 'button';
        b.innerHTML = '<span class="adm-alert__ic">' + I.flask + '</span>'
          + '<span><b>' + esc(c.l) + '</b><span>' + esc(c.d) + '</span></span>';
        b.addEventListener('click', function(){
          c.f();
          toast('Configuration préremplie — vérifiez puis lancez le vol.');
          try { cVol.scrollIntoView({ behavior:'smooth', block:'start' }); } catch(e){}
        });
        listeCas.appendChild(b);
      });
      cLim.body.appendChild(listeCas);
      grille.appendChild(cLim);
    }
  });
})();
