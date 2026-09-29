/* =============================================================================
   Albatros VFR — LA PHASE DE LANCEMENT (29/09/2026)
   -----------------------------------------------------------------------------
   Décision du développeur : pendant le lancement, Albatros VFR est gratuit.
   Par jour et par compte :
     · les 3 premiers vols et les 5 premiers scénarios ont la voix Google ;
     · au-delà, le contrôleur parle avec la voix du navigateur — un message le
       dit une fois, au moment où ça bascule ;
     · à 10 vols / 15 scénarios, la journée est finie.
   Les QCM (scénarios `quiz` : Panne radio, Expressions conventionnelles,
   Nombres) ne comptent pas et ne sont jamais bloqués. L'administrateur (rôle
   « admin ») et un Premium actif ne sont soumis à rien.

   CE QUE CE FICHIER PROTÈGE, ET CE QU'IL NE PROTÈGE PAS. Les compteurs sont
   dans la page, et la page appartient à l'utilisateur : les contourner donne
   plus de pratique avec la voix du navigateur, ce qui ne coûte rien. Ce qui
   coûte — la voix Google — est borné EN BASE (sql/009 : plafond_gratuit,
   20 000 caractères par jour et par compte gratuit, et la phase se ferme d'un
   réglage). Ce fichier règle l'expérience ; la base règle la facture.

   OÙ VIVENT LES COMPTEURS. Dans `rt-quota`, la clé qui comptait déjà les vols
   du jour ({date, n}) : elle gagne `s` (scénarios) et deux drapeaux « message
   déjà montré ». PAS de clé de plus (CLAUDE.md § 7.2). À la connexion,
   assets/donnees.js les recompte depuis la base (séances COMMENCÉES
   aujourd'hui) : changer d'appareil ne remet pas les compteurs à zéro.

   OÙ ON COMPTE. Au LANCEMENT explicite d'une séance — navigation.js (bouton
   « Démarrer », « Refaire ce vol ») et moteur.js › launchScenario. Pas dans
   startWithTerrain : il rejoue le même scénario quand on change de terrain,
   ce qui aurait compté deux fois le même exercice. La reprise d'un vol
   interrompu ne compte pas : il l'a été à son départ.

   Expose sur window : RTLancement
   Emprunte          : window.RTAuth, rtSettings (accès gardés)
   Sa place dans la liste des <script> est libre : rien n'est lu au chargement.
   ========================================================================== */
(function(){
  'use strict';

  var ACTIF = true;   // la phase de lancement ; la fermer, c'est AUSSI sql/009 (lancement_gratuit)
  var LIMITES = {
    vol:      { google:3, max:10 },
    scenario: { google:5, max:15 }
  };
  var CLE = 'rt-quota';

  /* Le jour LOCAL, comme donnees.js : toISOString() bascule en UTC, et un vol
     fait à 00 h 30 à Paris serait compté la veille. */
  function jour(d){
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function lire(){
    var q = null;
    try{ q = JSON.parse(localStorage.getItem(CLE) || 'null'); }catch(e){}
    if(!q || q.date !== jour()) q = { date:jour(), n:0, s:0 };
    q.n = q.n || 0; q.s = q.s || 0;
    return q;
  }
  function ecrire(q){
    try{ localStorage.setItem(CLE, JSON.stringify(q)); }catch(e){}
    try{ window.dispatchEvent(new CustomEvent('rt:lancement')); }catch(e){}
  }
  function champ(kind){ return kind === 'vol' ? 'n' : 's'; }

  function profil(){
    try{ return (window.RTAuth && RTAuth.profil && RTAuth.profil()) || null; }catch(e){ return null; }
  }
  function premiumActif(p){
    return !!(p && p.plan === 'premium' && (!p.premium_jusqua || new Date(p.premium_jusqua) > new Date()));
  }
  /* Ni compteur ni limite : l'administrateur et le Premium. Le rôle lu ici ne
     sert qu'à l'affichage et aux compteurs ; la voix, elle, est redécidée par
     la base à chaque message. */
  function exempt(){
    var p = profil();
    return !!(p && (p.role === 'admin' || premiumActif(p)));
  }

  function compteurs(){ var q = lire(); return { vols:q.n, scenarios:q.s }; }

  /* 'libre' | 'google' | 'navigateur' | 'bloque' : ce que vaudrait la PROCHAINE
     séance de ce type. */
  function etat(kind){
    if(kind === 'qcm') return 'libre';
    if(!ACTIF || exempt()) return 'libre';
    var n = lire()[champ(kind)], L = LIMITES[kind];
    if(n >= L.max) return 'bloque';
    return n < L.google ? 'google' : 'navigateur';
  }

  /* La séance en cours : c'est elle qui dit si la voix Google est offerte.
     Décidé au lancement, et tenu jusqu'au bout — le contrôleur ne change pas
     de voix au milieu d'un vol parce qu'on vient de lancer un scénario dans
     un autre onglet. */
  var contexte = null;
  function debut(kind, e){ contexte = { kind:kind, google: e !== 'navigateur' }; }

  function veutGoogle(){
    try{ var r = (typeof rtSettings === 'function') ? rtSettings() : null; return !r || r.voixMoteur !== 'navigateur'; }
    catch(e){ return true; }
  }

  /* ---------------------------------------------------------------------
     LES MESSAGES. Une modale à un seul bouton, construite ici pour ne rien
     emprunter : rtConfirm a deux boutons et dit « Abandonner ». Mêmes
     classes que #confirmModal, donc même allure dans les deux thèmes.
     --------------------------------------------------------------------- */
  var TEXTES = {
    bascule: {
      vol: {
        titre: 'Voix réaliste du contrôleur terminée pour aujourd\'hui',
        texte: 'Vous avez fait vos 3 vols du jour avec la voix réaliste du contrôleur, offerte pendant la phase de lancement. ' +
               'Pour ce vol et les suivants, le contrôleur parlera avec la voix par défaut de votre navigateur. ' +
               'La voix réaliste revient demain.',
        bouton: 'Compris, on décolle'
      },
      scenario: {
        titre: 'Voix réaliste du contrôleur terminée pour aujourd\'hui',
        texte: 'Vous avez fait vos 5 scénarios du jour avec la voix réaliste du contrôleur, offerte pendant la phase de lancement. ' +
               'Pour ce scénario et les suivants, le contrôleur parlera avec la voix par défaut de votre navigateur. ' +
               'La voix réaliste revient demain. Les QCM ne sont pas comptés.',
        bouton: 'Compris, on continue'
      }
    },
    bloque: {
      vol: {
        titre: 'Limite du jour atteinte',
        texte: 'Pendant la phase de lancement, Albatros VFR est gratuit dans la limite de 10 vols par jour. ' +
               'Vous les avez faits : rendez-vous demain pour le prochain. Les QCM restent disponibles.',
        bouton: 'D\'accord'
      },
      scenario: {
        titre: 'Limite du jour atteinte',
        texte: 'Pendant la phase de lancement, Albatros VFR est gratuit dans la limite de 15 scénarios par jour. ' +
               'Vous les avez faits : rendez-vous demain pour la suite. Les QCM, eux, restent illimités.',
        bouton: 'D\'accord'
      }
    }
  };
  var modale = null;
  function montrer(t, suite){
    if(!modale){
      modale = document.createElement('div');
      modale.className = 'modal'; modale.id = 'lancementModal';
      modale.setAttribute('role', 'dialog'); modale.setAttribute('aria-modal', 'true');
      modale.setAttribute('aria-labelledby', 'lancementTitre');
      modale.innerHTML = '<div class="modal-card">' +
        '<h3 class="modal-title" id="lancementTitre"></h3>' +
        '<p class="modal-text" id="lancementTexte"></p>' +
        '<div class="modal-actions"><button class="btn cta" id="lancementOk" type="button"></button></div></div>';
      document.body.appendChild(modale);
    }
    modale.querySelector('#lancementTitre').textContent = t.titre;
    modale.querySelector('#lancementTexte').textContent = t.texte;
    var ok = modale.querySelector('#lancementOk');
    ok.textContent = t.bouton;
    var avant = document.activeElement;
    modale.hidden = false; ok.focus();
    function fermer(){
      modale.hidden = true; ok.onclick = null; document.removeEventListener('keydown', echap, true);
      try{ if(avant && avant.focus) avant.focus(); }catch(e){}
      /* La suite part du clic : un nouveau geste de l'utilisateur, dont Safari
         a besoin pour ouvrir la sortie audio du contrôleur. */
      if(suite) suite();
    }
    function echap(e){ if(e.key === 'Escape'){ e.preventDefault(); fermer(); } }
    ok.onclick = fermer;
    document.addEventListener('keydown', echap, true);
  }

  /* Le garde des lancements. Vrai : la séance part tout de suite (et elle est
     comptée). Faux : un message est montré ; s'il s'agit de la bascule de
     voix, `relancer` est rappelé au clic, et la séance part alors. */
  var passe = {};
  function autoriser(kind, relancer){
    if(passe[kind]){ passe[kind] = false; return true; }   // relancée après le message : déjà comptée
    var e = etat(kind);
    if(kind === 'qcm' || e === 'libre'){ contexte = null; return true; }
    if(e === 'bloque'){ montrer(TEXTES.bloque[kind]); return false; }
    var q = lire();
    q[champ(kind)]++;
    var drapeau = kind === 'vol' ? 'averti_n' : 'averti_s';
    if(e === 'navigateur' && !q[drapeau] && veutGoogle() && typeof relancer === 'function'){
      q[drapeau] = true; ecrire(q); debut(kind, e);
      montrer(TEXTES.bascule[kind], function(){ passe[kind] = true; relancer(); });
      return false;
    }
    ecrire(q); debut(kind, e);
    return true;
  }

  /* Reprise d'un vol interrompu : pas de nouveau décompte, mais la voix suit
     le rang qu'il avait au compteur. */
  function reprise(kind){
    if(etat(kind) === 'libre'){ contexte = null; return; }
    var n = lire()[champ(kind)];
    contexte = { kind:kind, google: n <= LIMITES[kind].google };
  }

  /* Lu par assets/noyau/5-voix.js à chaque message : la voix Google est-elle
     offerte MAINTENANT ? Hors séance (essai des Paramètres), oui tant qu'il
     reste une séance Google dans la journée. */
  function googleOffert(){
    if(!ACTIF) return false;
    if(contexte) return !!contexte.google;
    var q = lire();
    return q.n < LIMITES.vol.google || q.s < LIMITES.scenario.google;
  }

  // Une séance quittée n'impose plus sa voix au reste de l'application.
  window.addEventListener('rt:page', function(e){
    var p = e && e.detail && e.detail.page;
    if(p !== 'navigation' && p !== 'exercices') contexte = null;
  });

  window.RTLancement = {
    actif: function(){ return ACTIF; },
    LIMITES: LIMITES,
    compteurs: compteurs,
    exempt: exempt,
    etat: etat,
    autoriser: autoriser,
    reprise: reprise,
    googleOffert: googleOffert,
    premiumActif: premiumActif,
    TEXTES: TEXTES
  };
})();
