/* =============================================================================
   RadioTrainer — L'ESPACE COMPTE
   -----------------------------------------------------------------------------
   Ce que cette page montre vient de la base, et de nulle part ailleurs :
     · le profil            → table `profiles`
     · la pratique          → vue  `v_user_progress` et vue `v_daily_activity`
     · l'adresse e-mail     → la session d'authentification elle-même

   Elle ne recopie rien depuis localStorage. C'est délibéré : l'historique local
   et la base peuvent diverger (une séance jouée hors ligne attend dans la file
   de synchronisation), et afficher l'un en prétendant montrer l'autre ferait
   mentir la page. Quand la base ne répond pas, on le DIT — un « 0 séance » se
   lirait comme un fait.

   ┌─ CE QU'ON N'ÉCRIT PAS ──────────────────────────────────────────────────┐
   │ · Aucun mot de passe n'est lu, comparé, conservé ni journalisé ici. Le   │
   │   nouveau mot de passe part chez Supabase et le champ est vidé aussitôt. │
   │ · Aucune décision d'autorisation n'est prise dans ce fichier. Le rôle,   │
   │   le statut et la formule sont affichés en lecture seule parce que le    │
   │   déclencheur `profiles_garde()` les remet d'office à leur valeur quand  │
   │   un client tente de les changer. Le champ grisé n'est pas la sécurité ; │
   │   il évite seulement de promettre une action qui sera refusée.           │
   │ · Aucune clé secrète. La suppression de compte exige la clé serveur :    │
   │   elle n'est donc pas proposée ici, et on explique pourquoi plutôt que   │
   │   d'afficher un bouton qui échouerait.                                   │
   └─────────────────────────────────────────────────────────────────────────┘
   ========================================================================== */
(function(){
  'use strict';

  function $(id){ return document.getElementById(id); }
  function cli(){ return window.RTAuth && window.RTAuth.client ? window.RTAuth.client() : null; }

  /* Un message sous une carte : vert si tout va bien, rouge sinon. Le même
     habillage que les formulaires de connexion, pour ne pas inventer un
     deuxième vocabulaire visuel. */
  function msg(id, texte, type){
    var e = $(id); if (!e) return;
    e.textContent = texte || '';
    e.className = 'set-note auth-msg' + (texte ? (' auth-msg--' + (type || 'err')) : ' hidden');
  }
  function occuper(btn, texte){
    if (!btn) return function(){};
    var avant = btn.textContent;
    btn.disabled = true; btn.textContent = texte;
    return function(){ btn.disabled = false; btn.textContent = avant; };
  }
  function traduire(e){
    return (window.RTAuth && window.RTAuth.message) ? window.RTAuth.message(e)
                                                    : String((e && e.message) || e);
  }

  var LABEL_ROLE = { user:'Élève', admin:'Administrateur', moderator:'Modérateur',
                     content_manager:'Contenu' };
  var LABEL_PLAN = { free:'Gratuit', pro:'Pro', ecole:'École' };

  function dateFr(v){
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
  }
  function dateCourteFr(v){
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' });
  }
  /* Une durée d'entraînement se lit en heures dès qu'elle en atteint une ;
     « 187 min » oblige le lecteur à diviser. */
  function duree(s){
    if (s == null) return '—';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
  }

  /* --------------------------------------------------------------------------
     LECTURE — le profil et la pratique.
     ----------------------------------------------------------------------- */
  var profilAffiche = null;      // ce que les champs montrent, pour « Annuler »

  function horsLigne(raison){
    var bloc = $('cptHorsLigne'), txt = $('cptHorsLigneTxt');
    if (!bloc) return;
    if (raison){ bloc.classList.remove('hidden'); if (txt) txt.textContent = raison; }
    else bloc.classList.add('hidden');
  }

  /* Les colonnes du questionnaire existent-elles ? On le lit dans la FORME du
     profil, pas dans sa valeur : une colonne absente donne `undefined`, une
     colonne vide donne `null`, et les deux sont fausses. Confondre les deux
     ferait afficher un formulaire vide qui échouerait à l'enregistrement — ou,
     pire, cacherait à quelqu'un ses propres réponses.
     Tant que sql/001-inscription.sql n'a pas été exécuté, la page se replie
     donc sur son ancien visage : « Nom affiché », et pas de questionnaire. */
  function aLesColonnes(p){ return !!(p && ('pseudo' in p)); }

  function peindreProfil(p, email){
    profilAffiche = p;
    var neuf = aLesColonnes(p);

    if ($('cptNom'))        $('cptNom').value        = (p && p.display_name) || '';
    if ($('cptIndicatif'))  $('cptIndicatif').value  = (p && p.callsign) || '';
    if ($('cptMail'))       $('cptMail').value       = email || (p && p.email) || '';
    if ($('cptDepuis'))     $('cptDepuis').textContent = dateFr(p && p.created_at);
    if ($('cptPlan'))       $('cptPlan').textContent = LABEL_PLAN[p && p.plan] || (p && p.plan) || '—';
    /* Le rôle ne se montre qu'à qui en a un autre que celui de tout le monde.
       Afficher « Rôle : Élève » à un élève, avec la mention qu'un administrateur
       seul peut le changer, c'était lui décrire une porte qui ne s'ouvre pas —
       et l'inviter à la pousser. On lit le rôle en base, comme la garde de la
       console : les deux ne peuvent pas se contredire. */
    var role = (p && p.role) || 'user';
    montrer('cptLigneRole', role !== 'user');
    if ($('cptRole'))       $('cptRole').textContent = LABEL_ROLE[role] || role;

    /* L'ancien champ et les nouveaux s'excluent : « Nom affiché » se calcule
       désormais à partir du prénom et du nom, et laisser les deux modifiables
       créerait deux sources de vérité pour la même chose. */
    montrer('cptLigneNomAffiche', !neuf);
    ['cptLignePseudo','cptLignePrenom','cptLigneNomFamille','cptLigneAero'].forEach(function(id){
      montrer(id, neuf);
    });
    montrer('cptCarteQcm', neuf);
    if (!neuf) return;

    if ($('cptPseudo'))     $('cptPseudo').textContent = (p && p.pseudo) || '—';
    if ($('cptPrenom'))     $('cptPrenom').value     = (p && p.prenom) || '';
    if ($('cptNomFamille')) $('cptNomFamille').value = (p && p.nom) || '';
    if ($('cptAero'))       $('cptAero').value       = (p && p.aerodrome) || '';
    remplirAerodromes();
    peindreQcm(p);
  }

  function montrer(id, oui){
    var e = $(id); if (e) e.classList.toggle('hidden', !oui);
  }

  function remplirAerodromes(){
    var dl = $('cptAeroListe');
    if (!dl || dl.childElementCount) return;
    if (typeof AERODROMES === 'undefined') return;
    AERODROMES.forEach(function(a){
      if (!a || !a.icao) return;
      var o = document.createElement('option');
      o.value = a.icao; if (a.nom) o.label = a.nom;
      dl.appendChild(o);
    });
  }

  /* --------------------------------------------------------------------------
     LE QUESTIONNAIRE, RECTIFIABLE
     --------------------------------------------------------------------------
     Les questions viennent de assets/inscription.js : c'est la MÊME définition
     qu'à la collecte. Proposer ici d'autres choix rendrait la rectification
     illusoire, et la copie oubliée finirait par écrire une valeur que la
     contrainte CHECK refuse.

     Des <select> et des cases à cocher, et non les gros boutons du parcours :
     la page Compte est faite de lignes `.set-row`, et six blocs de boutons y
     feraient une page trois fois plus longue que tout le reste réuni.
     ----------------------------------------------------------------------- */
  function questions(){
    return (window.RTInscription && RTInscription.questions) ? RTInscription.questions() : [];
  }

  function peindreQcm(p){
    var hote = $('cptQcm'); if (!hote) return;
    hote.textContent = '';
    var profilPilote = (p && p.profil_pilote) || '';
    if (profilPilote.indexOf('autre:') === 0) profilPilote = 'autre';

    questions().forEach(function(q){
      var valeur = p ? p[q.colonne] : null;

      var ligne = document.createElement('div');
      ligne.className = 'set-row';
      ligne.setAttribute('data-q', q.id);

      var lbl = document.createElement('div');
      lbl.className = 'set-lbl';
      var b = document.createElement('b');
      b.textContent = q.titre;
      lbl.appendChild(b);
      var sp = document.createElement('span');
      /* Sur la page Compte, la mention « facultatif » doit être encore plus
         nette qu'à l'inscription : c'est ici qu'on vient retirer une réponse. */
      sp.textContent = q.facultative
        ? "Facultatif — vous pouvez retirer votre réponse à tout moment."
        : (q.sous || '');
      lbl.appendChild(sp);
      ligne.appendChild(lbl);

      if (q.type === 'plusieurs'){
        var pris = Array.isArray(valeur) ? valeur.map(racine) : [];
        var groupe = document.createElement('div');
        groupe.className = 'cpt-coches';
        q.choix.forEach(function(c){
          var l = document.createElement('label');
          var i = document.createElement('input');
          i.type = 'checkbox'; i.value = c[0];
          i.checked = pris.indexOf(c[0]) >= 0;
          l.appendChild(i);
          l.appendChild(document.createTextNode(' ' + c[1]));
          groupe.appendChild(l);
        });
        ligne.appendChild(groupe);
      } else {
        var sel = document.createElement('select');
        sel.className = 'set-input';
        /* L'option vide EST le droit à l'effacement, mis là où on le cherche.
           Elle n'est offerte que sur les questions facultatives : vider
           `profil_pilote` laisserait l'application sans niveau de départ. */
        if (q.facultative){
          var vide = document.createElement('option');
          vide.value = ''; vide.textContent = '— aucune réponse —';
          sel.appendChild(vide);
        }
        q.choix.forEach(function(c){
          var o = document.createElement('option');
          o.value = c[0]; o.textContent = c[1];
          sel.appendChild(o);
        });
        sel.value = racine(valeur) || '';
        if (q.id === 'profil') sel.addEventListener('change', function(){ majVisibiliteQcm(); });
        ligne.appendChild(sel);
      }

      hote.appendChild(ligne);
    });
    majVisibiliteQcm();
  }

  /* « autre: hélico de montagne » → « autre ». La précision libre n'est pas
     rééditable ici : un champ de plus par question pour un détail facultatif
     alourdirait six lignes sur six. Elle est conservée telle quelle si le choix
     ne change pas (voir champsQcm). */
  function racine(v){
    var x = String(v == null ? '' : v);
    return x.indexOf('autre:') === 0 ? 'autre' : x;
  }

  function majVisibiliteQcm(){
    var sel = document.querySelector('#cptQcm .set-row[data-q="profil"] select');
    var courant = sel ? sel.value : '';
    questions().forEach(function(q){
      if (!q.siProfil) return;
      var ligne = document.querySelector('#cptQcm .set-row[data-q="'+q.id+'"]');
      if (ligne) ligne.classList.toggle('hidden', q.siProfil.indexOf(courant) < 0);
    });
  }

  function champsQcm(){
    var champs = {}, p = profilAffiche || {};
    questions().forEach(function(q){
      var ligne = document.querySelector('#cptQcm .set-row[data-q="'+q.id+'"]');
      if (!ligne) return;

      if (q.siProfil && ligne.classList.contains('hidden')){
        champs[q.colonne] = (q.type === 'plusieurs') ? [] : null;
        return;
      }
      if (q.type === 'plusieurs'){
        champs[q.colonne] = [].map.call(ligne.querySelectorAll('input:checked'), function(i){
          return conserverPrecision(q, i.value, p);
        });
        return;
      }
      var v = ligne.querySelector('select').value;
      champs[q.colonne] = v ? conserverPrecision(q, v, p) : null;
    });
    return champs;
  }

  /* Si le choix reste « autre » et qu'une précision avait été saisie à
     l'inscription, on la garde : la faire disparaître au premier enregistrement
     depuis cette page serait une perte silencieuse. */
  function conserverPrecision(q, v, p){
    if (v !== 'autre') return v;
    var avant = p[q.colonne];
    if (q.type === 'plusieurs'){
      var t = (Array.isArray(avant) ? avant : []).filter(function(x){ return String(x).indexOf('autre:') === 0; })[0];
      return t || 'autre';
    }
    return (String(avant == null ? '' : avant).indexOf('autre:') === 0) ? avant : 'autre';
  }

  function enregistrerQcm(){
    var c = cli(), u = window.RTAuth && window.RTAuth.utilisateur();
    if (!c || !u) return msg('cptQcmMsg', "Vous n'êtes pas connecté.");

    var champs = champsQcm();
    /* Les mêmes obligations qu'à l'inscription, pour la même raison : ces deux
       réponses règlent le choix des exercices, et l'application n'a pas de
       comportement défini sans elles. Les questions facultatives, elles,
       peuvent parfaitement repartir à vide — c'est le but. */
    if (!champs.profil_pilote) return msg('cptQcmMsg', "Indiquez où vous en êtes : c'est ce qui règle la difficulté.");
    if (!champs.niveau_radio)  return msg('cptQcmMsg', "Indiquez votre niveau à la radio.");
    if (!(champs.objectifs && champs.objectifs.length))
      return msg('cptQcmMsg', "Gardez au moins un objectif : c'est ce qui choisit vos exercices.");

    msg('cptQcmMsg', '');
    var libre = occuper($('cptQcmEnregistrer'), 'Enregistrement…');
    c.from('profiles').update(champs).eq('id', u.id)
      .then(function(r){
        if (r.error) throw r.error;
        libre(); msg('cptQcmMsg', 'Enregistré.', 'ok');
        return window.RTAuth.rechargerProfil().then(charger, charger);
      })
      .catch(function(e){ libre(); msg('cptQcmMsg', traduire(e)); });
  }

  /* L'objectif quotidien se règle dans les Paramètres (clé partagée
     `rt-settings`) et se COMPTE en base : `v_daily_activity` donne le nombre de
     séances par journée, et l'on cherche celle d'aujourd'hui. Le compter sur le
     stockage local aurait donné un chiffre différent d'un navigateur à l'autre
     pour la même personne, ce qui est précisément ce que la page Compte ne doit
     pas faire — tout ce qu'elle affiche vient de la base.

     Le jour est pris dans le fuseau de l'appareil, comme `v_daily_activity`
     l'expose, et non en UTC : quelqu'un qui s'entraîne à 23 h à Paris doit voir
     sa séance comptée le jour où il l'a faite. */
  function jourLocal(d){
    var x = d || new Date();
    return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0')
                           + '-' + String(x.getDate()).padStart(2,'0');
  }
  function objectifDuJour(){
    try { return parseInt((JSON.parse(localStorage.getItem('rt-settings')||'{}')).objectif||0,10) || 0; }
    catch(e){ return 0; }
  }

  function peindrePratique(v, journees) {
    var vide = '—';
    var jours = (journees == null) ? null : journees.length;
    if ($('cptStSeances'))  $('cptStSeances').textContent  = v ? String(v.sessions || 0) : vide;
    if ($('cptStVols'))     $('cptStVols').textContent     = v ? String(v.flights || 0) : vide;
    if ($('cptStTemps'))    $('cptStTemps').textContent    = v ? duree(v.training_s || 0) : vide;
    if ($('cptStScore'))    $('cptStScore').textContent    = (v && v.avg_pct != null) ? (v.avg_pct + ' %') : vide;
    if ($('cptStJours'))    $('cptStJours').textContent    = (jours == null) ? vide : String(jours);
    if ($('cptStDerniere')) $('cptStDerniere').textContent = v ? dateCourteFr(v.last_seen_at) : vide;

    var but = objectifDuJour();
    /* Pas d'objectif fixé, ou base injoignable : la tuile disparaît. Afficher
       « — / 3 » laisserait croire à zéro séance alors qu'on ne sait rien. */
    montrer('cptStObjectifCase', !!but && journees != null);
    if (but && journees != null && $('cptStObjectif')){
      var hui = jourLocal(), fait = 0;
      journees.forEach(function(l){
        if (String(l.day||'').slice(0,10) === hui) fait += (l.sessions || 0);
      });
      $('cptStObjectif').textContent = fait + ' / ' + but;
    }
  }

  function charger(){
    var c = cli();
    if (!c){
      horsLigne((window.RTAuth && window.RTAuth.raisonIndisponible && window.RTAuth.raisonIndisponible())
                || "Le client Supabase n'est pas chargé.");
      peindreProfil(null, ''); peindrePratique(null, null);
      return Promise.resolve();
    }
    var u = window.RTAuth.utilisateur();
    if (!u){
      horsLigne("Vous n'êtes pas connecté.");
      peindreProfil(null, ''); peindrePratique(null, null);
      return Promise.resolve();
    }

    /* Les trois lectures partent ensemble : elles ne dépendent pas les unes des
       autres, et les enchaîner tripleraient l'attente pour rien.
       `v_user_progress` et `v_daily_activity` sont en security_invoker : RLS
       s'y applique, chacun n'y voit donc que ses propres lignes — la requête
       n'a pas à filtrer sur user_id pour être sûre, elle le fait pour être
       explicite. */
    return Promise.all([
      c.from('profiles').select('*').eq('id', u.id).maybeSingle(),
      c.from('v_user_progress').select('*').eq('user_id', u.id).maybeSingle(),
      c.from('v_daily_activity').select('day,sessions').eq('user_id', u.id)
    ]).then(function(r){
      var pr = r[0], pg = r[1], jr = r[2];
      var premiere = (pr.error || pg.error || jr.error);
      if (premiere){ horsLigne(traduire(premiere)); }
      else horsLigne('');
      peindreProfil(pr.error ? null : pr.data, u.email);
      peindrePratique(pg.error ? null : pg.data, jr.error ? null : (jr.data || []));
    }, function(e){
      horsLigne(traduire(e));
      peindreProfil(null, ''); peindrePratique(null, null);
    });
  }

  /* --------------------------------------------------------------------------
     ÉCRITURE — identité.
     ----------------------------------------------------------------------- */
  function enregistrerIdentite(){
    var c = cli(), u = window.RTAuth && window.RTAuth.utilisateur();
    if (!c || !u) return msg('cptIdMsg', "Vous n'êtes pas connecté.");

    var neuf = aLesColonnes(profilAffiche);
    var ind  = ($('cptIndicatif').value || '').trim().toUpperCase();
    var mail = ($('cptMail').value || '').trim();
    var aEcrire = { callsign: ind || null };

    if (!neuf){
      /* Avant la migration : seul display_name existe. */
      var nom = ($('cptNom').value || '').trim();
      if (!nom) return msg('cptIdMsg', "Le nom affiché ne peut pas être vide.");
      aEcrire.display_name = nom;
    } else {
      var prenom = ($('cptPrenom').value || '').trim();
      var famille = ($('cptNomFamille').value || '').trim();
      if (!prenom) return msg('cptIdMsg', "Votre prénom est nécessaire : l'application s'en sert pour vous appeler par votre nom.");

      var aero = (window.RTInscription && RTInscription._aero)
               ? RTInscription._aero($('cptAero').value) : { vide:true };
      if (aero.inconnu)
        return msg('cptIdMsg', "Ce terrain n'est pas dans notre base. Choisissez-le dans la liste, "
                             + "ou laissez le champ vide — il est facultatif.");

      aEcrire.prenom = prenom;
      aEcrire.nom = famille || null;
      aEcrire.aerodrome = aero.vide ? null : aero.icao;
      /* display_name reste la colonne que lisent la barre latérale et la console
         d'administration : on la recalcule ici, pour qu'il n'y ait jamais deux
         réponses à « comment s'appelle cette personne ». */
      aEcrire.display_name = [prenom, famille].filter(Boolean).join(' ');
    }

    var mailAvant = u.email || '';
    var changeMail = mail && mail.toLowerCase() !== mailAvant.toLowerCase();

    msg('cptIdMsg', '');
    var libre = occuper($('cptEnregistrer'), 'Enregistrement…');

    /* Le profil d'abord. S'il échoue, on ne touche pas à l'adresse : mieux vaut
       une page inchangée qu'un compte à moitié modifié. */
    c.from('profiles').update(aEcrire)
      .eq('id', u.id)
      .then(function(r){
        if (r.error) throw r.error;
        if (!changeMail) return { mailEnvoye:false };
        return c.auth.updateUser({ email:mail }).then(function(r2){
          if (r2.error) throw r2.error;
          return { mailEnvoye:true };
        });
      })
      .then(function(etat){
        /* L'écriture est faite : on le dit TOUT DE SUITE. Attendre la relecture
           du profil et de la pratique — trois allers-retours de plus — pour
           afficher « Enregistré » laissait plusieurs secondes pendant
           lesquelles rien ne confirmait que le clic avait servi. La relecture
           suit, et repeint la page quand elle arrive. */
        libre();
        msg('cptIdMsg', etat.mailEnvoye
            ? "Enregistré. Le changement d'adresse attend que vous cliquiez le lien envoyé par e-mail — tant que ce n'est pas fait, connectez-vous avec l'ancienne."
            : 'Enregistré.', 'ok');
        return window.RTAuth.rechargerProfil().then(charger, charger);
      })
      .catch(function(e){ libre(); msg('cptIdMsg', traduire(e)); });
  }

  /* --------------------------------------------------------------------------
     ÉCRITURE — mot de passe.
     Rien de ce qui est tapé ici ne transite par notre code au-delà de l'appel :
     pas de journalisation, pas de conservation, et les deux champs sont vidés
     dans tous les cas — succès comme échec.
     ----------------------------------------------------------------------- */
  function changerMotDePasse(){
    var c = cli();
    if (!c) return msg('cptMdpMsg', "Vous n'êtes pas connecté.");
    var a = $('cptMdp1').value || '', b = $('cptMdp2').value || '';
    if (a.length < 8)  return msg('cptMdpMsg', 'Huit caractères au minimum.');
    if (a !== b)       return msg('cptMdpMsg', 'Les deux saisies diffèrent.');

    msg('cptMdpMsg', '');
    var libre = occuper($('cptChangerMdp'), 'Modification…');
    var vider = function(){ $('cptMdp1').value = ''; $('cptMdp2').value = ''; };

    c.auth.updateUser({ password:a }).then(function(r){
      libre(); vider();
      if (r.error) return msg('cptMdpMsg', traduire(r.error));
      msg('cptMdpMsg', 'Mot de passe modifié. Votre session reste ouverte.', 'ok');
    }, function(e){ libre(); vider(); msg('cptMdpMsg', traduire(e)); });
  }

  /* --------------------------------------------------------------------------
     EXPORT — tout ce que la base retient de vous.
     On exporte ce que la base répond à VOTRE jeton : c'est exactement ce que
     RLS vous autorise à lire, donc exactement vos données, ni plus ni moins.
     ----------------------------------------------------------------------- */
  function exporter(){
    var c = cli(), u = window.RTAuth && window.RTAuth.utilisateur();
    if (!c || !u) return msg('cptDonneesMsg', "Vous n'êtes pas connecté.");
    msg('cptDonneesMsg', '');
    var libre = occuper($('cptExport'), 'Préparation…');

    c.from('sessions').select('*').eq('user_id', u.id).order('started_at', { ascending:true })
      .then(function(rs){
        if (rs.error) throw rs.error;
        var seances = rs.data || [];
        var ids = seances.map(function(s){ return s.id; });
        if (!ids.length) return { seances:seances, echanges:[] };
        /* `in` sur une longue liste d'UUID finirait par dépasser la taille d'URL
           admise : on découpe par paquets de 100, ce qui suffit largement et
           reste une seule promesse pour l'appelant. */
        var paquets = [];
        for (var i = 0; i < ids.length; i += 100) paquets.push(ids.slice(i, i + 100));
        return Promise.all(paquets.map(function(lot){
          return c.from('session_steps').select('*').in('session_id', lot).order('idx');
        })).then(function(res){
          var pb = res.filter(function(r){ return r.error; })[0];
          if (pb) throw pb.error;
          return { seances:seances, echanges:res.reduce(function(acc,r){ return acc.concat(r.data||[]); }, []) };
        });
      })
      .then(function(d){
        var paquet = {
          exporte_le: new Date().toISOString(),
          source: 'RadioTrainer — export du compte',
          compte: { id:u.id, email:u.email, profil:profilAffiche },
          seances: d.seances,
          echanges: d.echanges
        };
        var blob = new Blob([JSON.stringify(paquet, null, 2)], { type:'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'radiotrainer-compte-' + new Date().toISOString().slice(0,10) + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
        libre();
        msg('cptDonneesMsg', d.seances.length + ' séance(s) et ' + d.echanges.length
            + ' échange(s) exportés.', 'ok');
      })
      .catch(function(e){ libre(); msg('cptDonneesMsg', traduire(e)); });
  }

  /* --------------------------------------------------------------------------
     Branchements.
     ----------------------------------------------------------------------- */
  function brancher(){
    var e;
    if ((e = $('cptEnregistrer')))  e.addEventListener('click', enregistrerIdentite);
    if ((e = $('cptAnnuler')))      e.addEventListener('click', function(){
      peindreProfil(profilAffiche, (window.RTAuth.utilisateur()||{}).email);
      msg('cptIdMsg', '');
    });
    if ((e = $('cptQcmEnregistrer'))) e.addEventListener('click', enregistrerQcm);
    if ((e = $('cptQcmAnnuler')))     e.addEventListener('click', function(){
      peindreQcm(profilAffiche); msg('cptQcmMsg', '');
    });
    if ((e = $('cptChangerMdp')))   e.addEventListener('click', changerMotDePasse);
    if ((e = $('cptExport')))       e.addEventListener('click', exporter);
    if ((e = $('cptDeconnexion')))  e.addEventListener('click', function(){
      if (window.RTAuth) window.RTAuth.deconnexion();
      else if (window.rtSortir) window.rtSortir();
    });
    /* L'indicatif se met en capitales à la frappe : une immatriculation
       s'écrit ainsi, et la corriger après coup surprendrait moins que de la
       laisser en minuscules jusqu'à l'enregistrement. */
    if ((e = $('cptIndicatif'))) e.addEventListener('input', function(){
      var pos = this.selectionStart;
      this.value = this.value.toUpperCase();
      try { this.setSelectionRange(pos, pos); } catch(x){}
    });

    /* La page se recharge à chaque arrivée : un vol terminé entre-temps doit
       apparaître dans « Votre pratique » sans avoir à rafraîchir l'onglet. */
    window.addEventListener('rt:page', function(ev){
      if (ev.detail && ev.detail.page === 'compte'){
        msg('cptIdMsg',''); msg('cptMdpMsg',''); msg('cptDonneesMsg',''); msg('cptQcmMsg','');
        charger();
      }
    });
    /* Et à chaque changement de session : se connecter depuis un autre onglet
       ne doit pas laisser ici le profil de personne. */
    window.addEventListener('rt:auth', function(){
      if (document.body.classList.contains('state-app')
          && location.hash.indexOf('#compte') === 0) charger();
    });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', brancher);
  else brancher();

  /* Prise de test : même chemin que l'interface, aucun circuit parallèle. */
  window.RT_TEST_COMPTE = { charger:charger, profil:function(){ return profilAffiche; },
    /* Peindre un profil donné, sans passer par la base. Necessaire pour
       verifier les lignes conditionnelles — celle du role, notamment — quand
       aucun compte d'essai ne porte le role en question. C'est la MEME
       fonction que celle appelee apres une lecture reelle : pas de circuit
       parallele, donc pas de test qui passerait sur du code mort. */
    peindre:peindreProfil };
})();
