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

  function peindreProfil(p, email){
    profilAffiche = p;
    if ($('cptNom'))        $('cptNom').value        = (p && p.display_name) || '';
    if ($('cptIndicatif'))  $('cptIndicatif').value  = (p && p.callsign) || '';
    if ($('cptMail'))       $('cptMail').value       = email || (p && p.email) || '';
    if ($('cptDepuis'))     $('cptDepuis').textContent = dateFr(p && p.created_at);
    if ($('cptRole'))       $('cptRole').textContent = LABEL_ROLE[p && p.role] || (p && p.role) || '—';
    if ($('cptPlan'))       $('cptPlan').textContent = LABEL_PLAN[p && p.plan] || (p && p.plan) || '—';
  }

  function peindrePratique(v, jours) {
    var vide = '—';
    if ($('cptStSeances'))  $('cptStSeances').textContent  = v ? String(v.sessions || 0) : vide;
    if ($('cptStVols'))     $('cptStVols').textContent     = v ? String(v.flights || 0) : vide;
    if ($('cptStTemps'))    $('cptStTemps').textContent    = v ? duree(v.training_s || 0) : vide;
    if ($('cptStScore'))    $('cptStScore').textContent    = (v && v.avg_pct != null) ? (v.avg_pct + ' %') : vide;
    if ($('cptStJours'))    $('cptStJours').textContent    = (jours == null) ? vide : String(jours);
    if ($('cptStDerniere')) $('cptStDerniere').textContent = v ? dateCourteFr(v.last_seen_at) : vide;
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
      c.from('v_daily_activity').select('day').eq('user_id', u.id)
    ]).then(function(r){
      var pr = r[0], pg = r[1], jr = r[2];
      var premiere = (pr.error || pg.error || jr.error);
      if (premiere){ horsLigne(traduire(premiere)); }
      else horsLigne('');
      peindreProfil(pr.error ? null : pr.data, u.email);
      peindrePratique(pg.error ? null : pg.data, jr.error ? null : (jr.data || []).length);
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

    var nom  = ($('cptNom').value || '').trim();
    var ind  = ($('cptIndicatif').value || '').trim().toUpperCase();
    var mail = ($('cptMail').value || '').trim();
    if (!nom) return msg('cptIdMsg', "Le nom affiché ne peut pas être vide.");

    var mailAvant = u.email || '';
    var changeMail = mail && mail.toLowerCase() !== mailAvant.toLowerCase();

    msg('cptIdMsg', '');
    var libre = occuper($('cptEnregistrer'), 'Enregistrement…');

    /* Le profil d'abord. S'il échoue, on ne touche pas à l'adresse : mieux vaut
       une page inchangée qu'un compte à moitié modifié. */
    c.from('profiles').update({ display_name:nom, callsign:ind || null })
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
        msg('cptIdMsg',''); msg('cptMdpMsg',''); msg('cptDonneesMsg','');
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
  window.RT_TEST_COMPTE = { charger:charger, profil:function(){ return profilAffiche; } };
})();
