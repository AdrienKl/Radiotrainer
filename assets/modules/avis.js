/* =============================================================================
   Albatros VFR — LES AVIS (29/09/2026)
   -----------------------------------------------------------------------------
   Cahier des charges du développeur, 29/09/2026 :
     · « Laisser un avis » dans la modale de contact, pour un compte connecté
       qui n'en a pas encore laissé ;
     · un rappel discret après la 2e séance terminée (vol ou scénario) ;
     · les 3 avis mis en avant sur l'accueil, et la page #avis ;
     · tout avis part « en attente » : rien n'est publié sans l'administration.

   CE QUE CE FICHIER NE DÉCIDE PAS. Qui peut déposer, sous quel nom, avec quel
   statut, combien de fois, et qui voit quoi : tout est tranché par la base
   (sql/010 — droits par colonne, déclencheur, politiques). Ce fichier se
   contente de ne pas PROPOSER ce qui serait refusé. Un navigateur trafiqué
   n'obtient rien de plus que des refus.

   OÙ ON LIT « A-T-IL DÉJÀ UN AVIS ? » : mon_avis() (sql/010, puis sql/011),
   qui compte aussi les séances TERMINÉES en base. Déposer est ouvert dès la
   connexion (sql/011) ; le RAPPEL, lui, attend la 2e séance. Pas de compteur
   parallèle ici : le rappel suit ce que dit la base.

   OÙ VIT « PLUS TARD » : dans les réglages du compte (`avisRappel`, le nombre
   de séances au moment du refus) — pas une clé de stockage de plus
   (CLAUDE.md § 7.2). Le rappel revient trois séances plus tard.

   Expose sur window : RTAvis
   Emprunte          : window.RTAuth, window.RTContact, rtSettings /
                       rtSaveSettings, showToast (accès gardés)
   ========================================================================== */
(function(){
  'use strict';
  var $ = function(id){ return document.getElementById(id); };

  var RAPPEL_ECART = 3;      // séances entre deux rappels, après un « Plus tard »
  var SEUIL = 2;             // séances terminées avant le RAPPEL (déposer, lui, est libre : sql/011)

  function client(){ try{ return window.RTAuth && RTAuth.client && RTAuth.client(); }catch(e){ return null; } }
  function connecte(){ try{ return !!(window.RTAuth && RTAuth.utilisateur && RTAuth.utilisateur()); }catch(e){ return false; } }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function etoiles(n){
    n = Math.max(0, Math.min(5, parseInt(n, 10) || 0));
    var h = '<span class="av-note" role="img" aria-label="' + n + ' étoile' + (n>1?'s':'') + ' sur 5">';
    for(var i=1;i<=5;i++) h += '<span class="av-etoile' + (i<=n?' on':'') + '"></span>';
    return h + '</span>';
  }
  function dateFr(iso){
    try{ return new Date(iso).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' }); }
    catch(e){ return ''; }
  }
  function carte(a, avecDate){
    return '<article class="av-carte">' +
      '<div class="av-carte__tete"><span class="av-carte__qui">' + esc(a.pseudo) + '</span>' + etoiles(a.note) + '</div>' +
      (a.commentaire ? '<p class="av-carte__txt">' + esc(a.commentaire) + '</p>' : '') +
      (avecDate ? '<div class="av-carte__date">Déposé le ' + esc(dateFr(a.cree_le)) + '</div>' : '') +
      '</article>';
  }

  /* L'état de l'élève, demandé à la base. null = inconnu (hors ligne, pas de
     compte) : on ne propose rien plutôt que de proposer à tort. */
  var etat = null;
  function lireEtat(){
    var c = client();
    if(!c || !c.rpc || !connecte()){ etat = null; return Promise.resolve(null); }
    return Promise.resolve(c.rpc('mon_avis')).then(function(r){
      etat = (r && !r.error && r.data) || null;
      return etat;
    }, function(){ etat = null; return null; });
  }

  /* =====================================================================
     1. LE WIDGET — « Laisser un avis » dans la modale de contact
     ===================================================================== */
  var opt = $('ctOptAvis'), optTxt = $('ctOptAvisTxt'), vue = $('ctAvisVue');
  var champ = $('avCommentaire'), msg = $('avMsg'), btn = $('avEnvoyer');
  var envoiEnCours = false;

  function direMsg(t, type){
    if(!msg) return;
    msg.textContent = t || '';
    msg.className = 'auth-msg' + (t ? '' : ' hidden') + (type ? ' ' + type : '');
  }
  function peindreOption(){
    if(!opt) return;
    /* Montrée à tout compte connecté qui n'a pas encore d'avis — dès la
       connexion (décision du 29/09/2026, sql/011 : plus de nombre de séances). */
    var e = etat;
    opt.hidden = !(e && e.connecte && !e.avis && e.peut !== false);
    if(optTxt) optTxt.textContent = 'Votre note et quelques mots sur Albatros VFR.';
  }
  function noteChoisie(){
    var r = vue && vue.querySelector('input[name="note"]:checked');
    return r ? parseInt(r.value, 10) : 0;
  }
  function peindreEtoiles(n){
    if(!vue) return;
    vue.querySelectorAll('.av-etoiles__rang label').forEach(function(l, i){
      var e = l.querySelector('.av-etoile'); if(e) e.classList.toggle('on', i < n);
    });
  }
  function ouvrirVue(){
    if(!window.RTContact || !RTContact.vue) return;
    var t = $('ctTitre'), st = $('ctSub');
    if(t) t.textContent = 'Laisser un avis';
    if(st){ st.textContent = 'Il sera publié après vérification, sous 3 jours au plus.'; st.hidden = false; }
    direMsg('');
    RTContact.vue('avis');
    var premiere = vue && vue.querySelector('input[name="note"]');
    if(premiere) premiere.focus();
  }
  function raison(err){
    var m = String((err && (err.message || err.details)) || '');
    if(err && err.code === '23505' || /duplicate|unique/i.test(m)) return 'Vous avez déjà laissé un avis — merci !';
    if(/avis_compte_inactif/.test(m)) return 'Votre compte n\'est pas actif.';
    return 'L\'envoi n\'a pas abouti. Réessayez dans un instant.';
  }
  function envoyer(e){
    if(e) e.preventDefault();
    if(envoiEnCours) return;                       // Entrée ne passe pas par le bouton
    var note = noteChoisie();
    if(!note){ direMsg('Choisissez une note, de 1 à 5 étoiles.', 'error'); return; }
    var c = client();
    if(!c || !connecte()){ direMsg('Connectez-vous pour laisser un avis.', 'error'); return; }
    var texte = champ ? champ.value.trim() : '';
    envoiEnCours = true; if(btn) btn.disabled = true;
    direMsg('');
    /* Deux colonnes, et rien d'autre : la base refuserait tout le reste
       (droits par colonne). Pas de .select() : l'avis, en attente, n'est pas
       lisible par son auteur par la table — le relire ferait échouer l'envoi. */
    Promise.resolve(c.from('avis').insert({ note:note, commentaire: texte || null })).then(function(r){
      envoiEnCours = false; if(btn) btn.disabled = false;
      if(r && r.error){ direMsg(raison(r.error), 'error'); return; }
      etat = etat || {}; etat.avis = { note:note, statut:'en_attente' }; etat.peut = false;
      peindreOption(); cacherRappel();
      if(champ) champ.value = '';
      vue.querySelectorAll('input[name="note"]').forEach(function(i){ i.checked = false; });
      peindreEtoiles(0);
      var fin = $('ctFinTxt');
      if(fin) fin.textContent = 'Merci ! Votre avis sera publié après vérification, sous 3 jours au plus.';
      var h = $('ctFin') && $('ctFin').querySelector('h4'); if(h) h.textContent = 'Avis envoyé';
      if(window.RTContact && RTContact.vue) RTContact.vue('fin');
    }, function(err){
      envoiEnCours = false; if(btn) btn.disabled = false;
      direMsg(raison(err), 'error');
    });
  }
  if(opt) opt.addEventListener('click', ouvrirVue);
  if(vue){
    vue.addEventListener('submit', envoyer);
    vue.addEventListener('change', function(){ peindreEtoiles(noteChoisie()); });
    var retour = $('avRetour');
    if(retour) retour.addEventListener('click', function(){
      var t = $('ctTitre'); if(t) t.textContent = 'Contact / Feedback';
      if(window.RTContact && RTContact.vue) RTContact.vue('choix');
    });
  }
  /* La confirmation est partagée avec le formulaire de contact : on lui rend
     son texte quand la modale se rouvre. */
  window.addEventListener('rt:contact-ouvert', function(ev){
    var h = $('ctFin') && $('ctFin').querySelector('h4'); if(h) h.textContent = 'Message envoyé';
    var f = $('ctFinTxt'); if(f) f.textContent = 'Merci — c\'est bien parti. Nous vous répondrons à l\'adresse indiquée.';
    peindreOption();                               // l'état connu, tout de suite
    lireEtat().then(peindreOption);                // puis celui de la base
    if(ev.detail && ev.detail.nature === 'avis') ouvrirVue();
  });

  /* =====================================================================
     2. LE RAPPEL — après la 2e séance terminée, discret, jamais une modale
     ===================================================================== */
  var rappel = null;
  function reglages(){ try{ return (typeof rtSettings === 'function') ? rtSettings() : {}; }catch(e){ return {}; } }
  function cacherRappel(){ if(rappel) rappel.hidden = true; }
  function montrerRappel(){
    if(!rappel){
      rappel = document.createElement('div');
      rappel.className = 'av-rappel'; rappel.id = 'avRappel';
      rappel.setAttribute('role', 'status');
      rappel.innerHTML = '<b>Deux séances au compteur</b>' +
        'Qu\'en pensez-vous ? Votre avis aide d\'autres élèves pilotes à nous trouver.' +
        '<div class="av-rappel__act">' +
        '<button class="btn small cta" type="button" id="avRappelOui">Laisser un avis</button>' +
        '<button class="btn small ghost" type="button" id="avRappelNon">Plus tard</button></div>';
      document.body.appendChild(rappel);
      rappel.querySelector('#avRappelOui').addEventListener('click', function(){
        cacherRappel();
        if(window.rtContactOuvrir) window.rtContactOuvrir('avis');
      });
      rappel.querySelector('#avRappelNon').addEventListener('click', function(){
        cacherRappel();
        try{ var s = reglages(); s.avisRappel = (etat && etat.seances) || SEUIL; rtSaveSettings(s); }catch(e){}
      });
    }
    rappel.hidden = false;
  }
  /* Le rappel, lui, attend la 2e séance terminée : avant, on n'a pas grand-chose
     à dire de l'application. */
  function peutRappeler(e){
    if(!e || !e.connecte || e.avis || !e.peut || (e.seances || 0) < SEUIL) return false;
    var plusTard = parseInt(reglages().avisRappel, 10);
    return !(plusTard && (e.seances || 0) < plusTard + RAPPEL_ECART);
  }
  // Après chaque séance terminée (assets/sync.js, une fois la séance écrite).
  window.addEventListener('rt:seance-terminee', function(){
    lireEtat().then(function(e){ if(peutRappeler(e)) montrerRappel(); });
  });

  /* =====================================================================
     3. L'ACCUEIL — les trois avis mis en avant
     ===================================================================== */
  function chargerAccueil(){
    var boite = $('avAccueil'), liste = $('avAccueilListe'), c = client();
    if(!boite || !liste || !c || !c.from) return;
    Promise.resolve(c.from('avis').select('id,pseudo,note,commentaire,cree_le,ordre_mise_en_avant')
      .eq('statut', 'publie').eq('mis_en_avant', true).order('ordre_mise_en_avant', { ascending:true }).limit(3))
      .then(function(r){
        var l = (r && !r.error && r.data) || [];
        /* Aucune vedette : la section reste cachée. Une section vide, ou
           remplie d'avis inventés, serait pire que rien. */
        boite.hidden = !l.length;
        liste.innerHTML = l.map(function(a){ return carte(a, false); }).join('');
      }, function(){ boite.hidden = true; });
  }

  /* =====================================================================
     4. LA PAGE #avis — tous les avis publiés
     ===================================================================== */
  var tous = null;
  function peindrePage(){
    var liste = $('avListe'), res = $('avResume'), tri = $('avTri');
    if(!liste) return;
    if(tous === null){ liste.innerHTML = '<p class="av-vide">Chargement des avis…</p>'; return; }
    if(!tous.length){
      liste.innerHTML = '<p class="av-vide">Aucun avis publié pour l\'instant.</p>';
      if(res) res.textContent = '';
      return;
    }
    var l = tous.slice();
    if(tri && tri.value === 'notes') l.sort(function(a, b){ return (b.note - a.note) || (new Date(b.cree_le) - new Date(a.cree_le)); });
    else l.sort(function(a, b){ return new Date(b.cree_le) - new Date(a.cree_le); });
    var moy = l.reduce(function(s, a){ return s + a.note; }, 0) / l.length;
    if(res) res.innerHTML = '<b>' + moy.toFixed(1).replace('.', ',') + ' / 5</b> — ' + l.length + ' avis publié' + (l.length > 1 ? 's' : '');
    liste.innerHTML = l.map(function(a){ return carte(a, true); }).join('');
  }
  function chargerPage(){
    var c = client();
    if(!c || !c.from){ tous = []; peindrePage(); return; }
    tous = null; peindrePage();
    Promise.resolve(c.from('avis').select('id,pseudo,note,commentaire,cree_le')
      .eq('statut', 'publie').order('cree_le', { ascending:false }).limit(500))
      .then(function(r){ tous = (r && !r.error && r.data) || []; peindrePage(); },
            function(){ tous = []; peindrePage(); });
  }
  var tri = $('avTri');
  if(tri) tri.addEventListener('change', peindrePage);

  window.addEventListener('rt:page', function(e){
    var p = e && e.detail && e.detail.page;
    if(p === 'avis') chargerPage();
    if(p === 'accueil') chargerAccueil();
  });
  window.addEventListener('rt:auth', function(){ etat = null; cacherRappel(); });

  /* La première page est peinte par le routeur AVANT le chargement de ce
     fichier, et le client Supabase (auth.js) arrive après lui : on attend la
     fin de l'analyse du document pour charger ce que la page affichée demande. */
  document.addEventListener('DOMContentLoaded', function(){
    var p = (location.hash || '#accueil').slice(1).split('/')[0] || 'accueil';
    if(p === 'avis') chargerPage();
    if(p === 'accueil') chargerAccueil();
  });

  window.RTAvis = { etat: function(){ return etat; }, lireEtat: lireEtat,
                    chargerAccueil: chargerAccueil, chargerPage: chargerPage };
})();
