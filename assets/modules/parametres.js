/* =============================================================================
   Albatros VFR — LA PAGE PARAMETRES
   -----------------------------------------------------------------------------
   Principe tenu de bout en bout : un reglage ne duplique JAMAIS une logique metier.
   Il ecrit dans le controle d'origine (#voiceSelect, #call, #noiseToggle…) puis emet
   un 'change' — le code existant reagit exactement comme si l'utilisateur avait
   manipule le controle lui-meme. Aucune regle metier n'est reecrite ici.

   C'est ce qui evite qu'un reglage et l'ecran qu'il pilote finissent par dire deux
   choses differentes.

   Expose sur window : rtMajLienAdmin
   Emprunte          : rtSettings, rtSaveSettings, rtConfirm, LS_KEY, renderHistory, renderBadges, showToast ; window.Voix

   ┌─ L'ORDRE DE CHARGEMENT EST LE CONTRAT ─────────────────────────────────┐
   │ Ce fichier etait un bloc <script> ecrit dans index.html. Il est charge   │
   │ EXACTEMENT a la meme place, et c'est ce qui garantit que rien ne change :│
   │ un script classique externe a la meme portee et le meme moment           │
   │ d'execution qu'un bloc inline. Le deplacer d'un cran dans index.html     │
   │ peut le casser SANS produire la moindre erreur au chargement.            │
   └──────────────────────────────────────────────────────────────────────────┘

   Extrait d'index.html le 19/09/2026 (etape 2.1). Pas une ligne n'a ete
   modifiee : le bloc a ete deplace tel quel.
   ========================================================================== */
/* ============ PAGE PARAMÈTRES (module autonome) ============
   Principe : un réglage ne duplique JAMAIS une logique métier. Il écrit dans le
   contrôle d'origine (#voiceSelect, #call, #noiseToggle…) puis émet un 'change' :
   le code existant réagit exactement comme si l'utilisateur avait manipulé le
   contrôle lui-même. Aucune règle métier n'est réécrite ici. */
(function(){
  var sec=document.getElementById('page-parametres');
  if(!sec) return;
  var $s=function(id){ return document.getElementById(id); };
  var S=rtSettings();
  function save(){ rtSaveSettings(S); }

  // Applique une valeur à un contrôle existant + notifie la logique métier.
  function drive(el,val){
    if(!el) return;
    if(el.type==='checkbox'){ if(el.checked!==!!val){ el.checked=!!val; el.dispatchEvent(new Event('change',{bubbles:true})); } return; }
    if(el.value!==String(val)){ el.value=String(val); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('input',{bubbles:true})); }
  }
  function segSet(group,val,attr){
    sec.querySelectorAll('['+attr+']').forEach(function(b){
      b.classList.toggle('active', b.getAttribute(attr)===String(val));
    });
  }
  function sw(el,on){ el.setAttribute('aria-checked', on?'true':'false'); }

  /* ---------- Thème ---------- */
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme(){
    var t=S.theme||'system';
    var dark=(t==='dark')||(t==='system'&&mq&&mq.matches);
    document.documentElement.setAttribute('data-theme', dark?'dark':'light');
    segSet(null,t,'data-theme-opt');
  }
  sec.querySelectorAll('[data-theme-opt]').forEach(function(b){
    b.addEventListener('click',function(){ S.theme=b.getAttribute('data-theme-opt'); save(); applyTheme(); });
  });
  // En mode « Système », suivre les changements de préférence à chaud.
  if(mq && mq.addEventListener) mq.addEventListener('change',function(){ if((S.theme||'system')==='system') applyTheme(); });

  /* ---------- Animations ---------- */
  function applyAnim(){
    var off = S.anim===false;
    document.documentElement.classList.toggle('no-anim', off);
    sw($s('setAnim'), !off);
  }
  $s('setAnim').addEventListener('click',function(){ S.anim = (S.anim===false); save(); applyAnim(); });

  /* ---------- Voix ---------- */
  var srcVoice=document.getElementById('voiceSelect'), setVoice=$s('setVoice');
  function syncVoices(){
    if(!srcVoice) return;
    setVoice.innerHTML=srcVoice.innerHTML;
    if(S.voice) drive(srcVoice,S.voice);
    setVoice.value=srcVoice.value;
  }
  setVoice.addEventListener('change',function(){ S.voice=setVoice.value; save(); drive(srcVoice,S.voice); });

  /* ---------- Débit ---------- */
  sec.querySelectorAll('[data-rate]').forEach(function(b){
    b.addEventListener('click',function(){
      S.rate=b.getAttribute('data-rate'); save();
      drive(document.getElementById('voiceRate'),S.rate); segSet(null,S.rate,'data-rate');
    });
  });

  /* ---------- Bruit radio ---------- */
  var srcNoise=document.getElementById('noiseToggle');
  $s('setNoise').addEventListener('click',function(){
    /* Absent du stockage = ACTIVÉ (même convention que radioManuelle) : on
       bascule donc depuis la valeur EFFECTIVE, sinon le premier appui ne
       faisait rien — il écrivait `true` sur un réglage déjà vrai. */
    S.noise=(S.noise===false); save(); drive(srcNoise,S.noise); sw($s('setNoise'),S.noise);
  });

  /* ---------- Indicatif ---------- */
  $s('setCall').addEventListener('change',function(){
    S.call=$s('setCall').value.trim().toUpperCase()||'F-ABCD';
    $s('setCall').value=S.call; save(); drive(document.getElementById('call'),S.call);
  });

  /* ---------- Difficulté ---------- */
  sec.querySelectorAll('[data-diffset]').forEach(function(b){
    b.addEventListener('click',function(){
      S.diff=b.getAttribute('data-diffset'); save();
      drive(document.getElementById('difficultySelect'),S.diff); segSet(null,S.diff,'data-diffset');
    });
  });

  /* ---------- Silence avant fin d'écoute (lu par armSilence()) ---------- */
  sec.querySelectorAll('[data-sil]').forEach(function(b){
    b.addEventListener('click',function(){ S.silence=b.getAttribute('data-sil'); save(); segSet(null,S.silence,'data-sil'); });
  });

  /* ---------- Objectif quotidien ----------
     Stocke un nombre de seances par jour. Il n'impose rien et ne bloque rien :
     c'est la page Compte qui compare ce nombre aux seances reellement
     enregistrees en base pour la journee. Zero = aucun objectif. */
  function majObjNote(){
    var n = parseInt(S.objectif || 0, 10) || 0;
    var e = $s('setObjNote'); if (!e) return;
    e.textContent = n
      ? ('Objectif : ' + n + ' séance' + (n > 1 ? 's' : '') + ' par jour. Il est compté sur '
         + 'les séances enregistrées en base, pas sur cet appareil — vous le retrouverez '
         + 'donc sur un autre navigateur.')
      : "Aucun objectif. Rien ne sera compté ni affiché ; votre série de jours de pratique, elle, continue d'être tenue.";
  }
  sec.querySelectorAll('[data-obj]').forEach(function(b){
    b.addEventListener('click',function(){
      S.objectif=b.getAttribute('data-obj'); save();
      segSet(null,S.objectif,'data-obj'); majObjNote();
    });
  });

  /* ---------- Essai de la voix ----------
     La synthese vocale echoue sans rien dire : une voix distante qui ne demarre
     jamais, un moteur qui attend une interaction, aucune voix francaise
     installee. On ne se contente donc pas de lancer la parole — on attend la
     PREUVE qu'elle a commence (onDebut), et faute de preuve au bout de quatre
     secondes on le dit. Mieux vaut l'apprendre ici qu'au milieu d'un exercice. */
  var essaiJeton = 0;
  function essayerVoix(){
    var btn = $s('setVoiceTest'), msg = $s('setVoiceMsg');
    function dire(txt, ok){
      if (!msg) return;
      msg.textContent = txt;
      msg.classList.remove('hidden','ok');
      if (ok) msg.classList.add('ok');
    }
    if (!window.speechSynthesis || !window.Voix)
      return dire("Ce navigateur n'a pas de synthèse vocale. Les exercices resteront muets : essayez Chrome, Edge ou Safari à jour.", false);

    var voix = window.speechSynthesis.getVoices() || [];
    var fr = voix.filter(function(v){ return /^fr/i.test(v.lang); });
    var mien = ++essaiJeton, parti = false;

    if (btn){ btn.disabled = true; btn.textContent = 'Écoute…'; }
    dire('Envoi…', true);

    /* Une phrase reelle du manuel plutot qu'un « test, test » : ce qu'on veut
       juger, c'est l'intelligibilite des lettres et des chiffres epeles, et
       c'est precisement la que les voix se distinguent. */
    window.Voix.parler(
      "Fox-trot Golf Kilo Lima Mike, autorisé décollage piste zéro cinq, vent deux cinq zéro degrés, un zéro nœuds.",
      { rate: parseFloat(S.rate || 1) || 1,
        onDebut: function(){ parti = true; if (mien === essaiJeton) dire('La voix fonctionne.', true); },
        onFin: function(){ if (mien === essaiJeton) fini(); } }
    );

    function fini(){
      if (btn){ btn.disabled = false; btn.textContent = 'Écouter un exemple'; }
    }
    setTimeout(function(){
      if (mien !== essaiJeton || parti) return;
      fini();
      dire(fr.length
        ? "Aucun son n'est sorti. Sur Chrome, les voix « Google » passent par le réseau et "
          + "restent parfois muettes : choisissez une voix locale ci-dessus (Thomas, Amélie…), puis réessayez."
        : "Aucune voix française n'est installée sur cet appareil. Les exercices parleront avec "
          + "un accent étranger, ou pas du tout. Sur Windows : Paramètres → Heure et langue → Voix.",
        false);
    }, 4000);
  }
  if ($s('setVoiceTest')) $s('setVoiceTest').addEventListener('click', essayerVoix);

  /* ---------- Carte : fond + calques par défaut (lus par le module Navigation) ---------- */
  sec.querySelectorAll('[data-base]').forEach(function(b){
    b.addEventListener('click',function(){ S.basemap=b.getAttribute('data-base'); save(); segSet(null,S.basemap,'data-base'); });
  });
  sec.querySelectorAll('[data-lay]').forEach(function(b){
    b.addEventListener('click',function(){
      var k=b.getAttribute('data-lay');
      S.layers=S.layers||{ctr:true,tma:true,rpd:false};
      S.layers[k]=!S.layers[k]; save(); b.classList.toggle('on',S.layers[k]);
    });
  });

  /* ---------- Radio manuelle (Navigation et Scénarios) ---------- */
  $s('setRadio').addEventListener('click',function(){
    S.radioManuelle = (S.radioManuelle===false);   // clé absente = activée par défaut
    save(); sw($s('setRadio'), S.radioManuelle!==false);
  });

  /* ---------- Administration ----------
     L'entree « Administration » du menu suit le role lu en base, et rien d'autre.
     L'interrupteur de developpement qui vivait ici a disparu avec sa carte de
     Parametres ; on efface au passage la cle qu'il avait pu laisser, sinon les
     navigateurs qui l'avaient cochee garderaient un drapeau devenu muet mais
     toujours visible dans leurs outils — de quoi croire a un acces qui n'existe
     plus. Une seule suppression suffit, la cle ne revient jamais. */
  try{ localStorage.removeItem('rt-admin-dev'); }catch(e){}
  function majLienAdmin(){
    var lien=document.getElementById('sideAdmin');
    if(lien) lien.hidden = !(window.rtEstAdmin && window.rtEstAdmin());
  }
  window.rtMajLienAdmin = majLienAdmin;
  /* Le profil arrive apres coup (une requete sur `profiles`), et il peut aussi
     changer en cours de route — rechargerProfil() apres une ecriture, une
     deconnexion, un role retire depuis Supabase. A chaque annonce on remet donc
     l'entree du menu d'accord avec le role, et si quelqu'un se trouve sur la
     console sans plus y avoir droit, la garde le reconduit. */
  window.addEventListener('rt:auth', function(){
    majLienAdmin();
    /* Seulement si la session tient toujours : sur une deconnexion, auth.js
       annonce l'etat AVANT d'appeler rtSortir(), et devancer ce dernier
       n'ajouterait qu'un passage inutile par le tableau de bord — et une entree
       d'historique — avant d'arriver sur la vitrine de toute facon. */
    if(window.rtConnecte && window.rtConnecte()
       && document.body.classList.contains('state-admin')
       && !(window.rtEstAdmin && window.rtEstAdmin()))
      if(window.rtNaviguer) window.rtNaviguer('tableau');
  });

  /* ---------- Données locales ---------- */
  function histCount(){ try{ return (JSON.parse(localStorage.getItem(LS_KEY))||[]).length; }catch(e){ return 0; } }
  function volCount(){ try{ return (JSON.parse(localStorage.getItem('rt-vols')||'[]')).length; }catch(e){ return 0; } }
  function refreshData(){
    var n=histCount(), v=volCount();
    if(!n && !v){ $s('setDataInfo').textContent='Aucune donnée enregistrée pour l’instant.'; return; }
    var p=[];
    if(v) p.push(v+' vol'+(v>1?'s':''));
    if(n) p.push(n+' session'+(n>1?'s':'')+' de scénarios');
    $s('setDataInfo').textContent = p.join(' et ')+' sur cet appareil.';
  }
  /* ┌─ CE BOUTON A CHANGÉ DEUX FOIS DE PORTÉE ────────────────────────────┐
     │ 1. Il ne vidait que le navigateur. Depuis que la progression vit en   │
     │    base, ça ne suffisait plus : tout revenait à la connexion suivante.│
     │    Il est donc passé par la base (RTDonnees.effacerTout).             │
     │ 2. Le 26/09/2026, il en ressort. Un bouton « Effacer mes vols et mon  │
     │    historique », rangé sous « Données locales », qui supprimait en    │
     │    réalité tout l'historique DU COMPTE sur un simple OK : l'intitulé  │
     │    disait ménage d'appareil, l'effet était irréversible partout.      │
     │    L'effacement du compte a désormais sa propre action, dans la carte │
     │    « Vos données », confirmée par la ressaisie du nom d'utilisateur   │
     │    (compte.js › supprimerHistorique).                                 │
     │                                                                       │
     │ Ce bouton-ci ne touche donc PLUS JAMAIS la base, et ne s'affiche que  │
     │ hors connexion : connecté, vider le cache ne ferait rien de durable.  │
     │ Le test est refait au CLIC, pas seulement à l'affichage — la session  │
     │ peut revenir entre les deux.                                          │
     └───────────────────────────────────────────────────────────────────────┘ */
  function connecte(){ return !!(window.RTAuth && RTAuth.utilisateur && RTAuth.utilisateur()); }
  function majEffacementLocal(){
    var b=$s('setClearHist'); if(b) b.hidden = connecte();
  }
  $s('setClearHist').addEventListener('click',function(){
    if(connecte()){ majEffacementLocal(); return; }
    if(!histCount() && !volCount()){ showToast('Aucune donnée à effacer.'); return; }
    rtConfirm('Vos vols, vos sessions de scénarios, vos badges, votre série de jours et le quota '+
          'du jour seront effacés de cet appareil. Vous n\'êtes pas connecté : ce qui est '+
          'enregistré dans votre compte, lui, ne sera pas touché.',
      {title:'Effacer cet appareil ?',ok:'Effacer'}).then(function(ok){
        if(!ok || connecte()) return;
        ['rt-vols','rt-jours','rt-quota','rt-vol-en-cours'].forEach(function(k){
          try{ localStorage.removeItem(k); }catch(e){}
        });
        try{ localStorage.removeItem(LS_KEY); }catch(e){}
        try{ renderHistory(); renderBadges(); }catch(e){}
        refreshData(); showToast('Données effacées de cet appareil.');
      });
  });
  window.addEventListener('rt:auth', majEffacementLocal);
  $s('setReset').addEventListener('click',function(){
    rtConfirm('Tous vos réglages (thème, voix, indicatif, carte…) reviendront à leurs valeurs par défaut. Votre historique de scores n’est pas touché.',
      {title:'Réinitialiser les paramètres ?',ok:'Réinitialiser'}).then(function(ok){
        if(!ok) return;
        S={}; save(); paint(); applyTheme(); applyAnim(); showToast('Paramètres réinitialisés.');
      });
  });
  $s('setExport').addEventListener('click',function(){
    function lu(k){ try{ return JSON.parse(localStorage.getItem(k))||[]; }catch(e){ return []; } }
    var data={ exporte_le:new Date().toISOString(), parametres:S,
               historique_scenarios:lu(LS_KEY), vols:lu('rt-vols'), jours_pratique:lu('rt-jours') };
    var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='albatros-donnees-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); },2000);
  });

  /* ---------- Peinture initiale ---------- */
  function paint(){
    applyTheme(); applyAnim();
    segSet(null,S.rate||'1','data-rate');
    segSet(null,S.diff||'debutant','data-diffset');
    segSet(null,S.silence||'2500','data-sil');
    segSet(null,String(parseInt(S.objectif||0,10)||0),'data-obj');
    majObjNote();
    segSet(null,S.basemap||'oaci','data-base');
    var L=S.layers||{ctr:true,tma:true,rpd:false};
    sec.querySelectorAll('[data-lay]').forEach(function(b){ b.classList.toggle('on',!!L[b.getAttribute('data-lay')]); });
    sw($s('setNoise'),S.noise!==false);   // absent = bruit radio actif
    sw($s('setRadio'), S.radioManuelle!==false);   // absent = radio manuelle active
    $s('setCall').value=S.call||'F-ABCD';
    majLienAdmin();
    refreshData();
  }
  paint();

  /* Les réglages du compte arrivent de la base après la connexion. On relit
     alors le cache — que assets/donnees.js vient de remplacer — et on repeint,
     contrôles métier compris : sans ce dernier point, le thème changerait mais
     la voix, le débit et l'indicatif resteraient ceux de l'appareil.
     `S` est rechargé plutôt que muté : l'objet en mémoire est celui d'avant la
     connexion, et le garder ferait réécrire les anciens réglages au premier
     clic. */
  window.addEventListener('rt:donnees', function(){
    try{
      S = rtSettings();
      paint(); applyTheme(); applyAnim(); syncVoices();
      if(S.rate)  drive(document.getElementById('voiceRate'),S.rate);
      if(S.diff)  drive(document.getElementById('difficultySelect'),S.diff);
      if(S.call)  drive(document.getElementById('call'),S.call);
      drive(srcNoise, S.noise!==false);
    }catch(e){}
  });

  // Réappliquer aux contrôles métier au démarrage (les voix arrivent en asynchrone).
  window.addEventListener('rt:page',function(e){ if(e.detail.page==='parametres'){ syncVoices(); refreshData(); majEffacementLocal(); } });
  setTimeout(function(){
    syncVoices();
    if(S.rate)  drive(document.getElementById('voiceRate'),S.rate);
    if(S.diff)  drive(document.getElementById('difficultySelect'),S.diff);
    if(S.call)  drive(document.getElementById('call'),S.call);
    drive(srcNoise, S.noise!==false);     // absent = bruit radio actif
  },600);
})();
