/* =============================================================================
   Albatros VFR — L'ACCUEIL DE L'APPLICATION
   -----------------------------------------------------------------------------
   N'invente aucune donnee : il agrege ce qui existe deja — l'historique des vols
   (rt-vols, ecrit par la Navigation) et celui des scenarios
   (radiotrainer_history_v2). Une statistique sans historique affiche « — », jamais
   un zero, qui se lirait comme un fait.

   La serie de jours ne compte QUE les journees ou quelque chose a ete fait. Compter
   les simples ouvertures de page affichait « 1 jour d'affilee » a quelqu'un qui
   n'avait encore rien pratique — une fausse recompense.

   Expose sur window : rtJourActif  rtQuotaIncr  rtQuotaAtteint
   Emprunte          : window.rtBadges et window.rtRelancerScenario (acces gardes)

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
/* ============ ACCUEIL — TABLEAU DE BORD (module autonome) ============
   Agrège ce qui existe déjà : historique des vols (rt-vols, écrit par la Navigation)
   et historique des scénarios (radiotrainer_history_v2). N'invente aucune donnée :
   une statistique sans historique affiche « — ». */
(function(){
  var sec=document.getElementById('page-tableau');
  if(!sec) return;
  var $t=function(id){ return document.getElementById(id); };

  var QUOTA_MAX=4;                      // vols par jour
  var JOURS_KEY='rt-jours';             // dates de connexion, pour la série
  var QUOTA_KEY='rt-quota';

  function jourISO(d){ return (d||new Date()).toISOString().slice(0,10); }
  function lire(k,d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch(e){ return d; } }
  function ecrire(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }

  /* ---- Série de jours consécutifs ----
     On ne compte QUE les jours où quelque chose a été fait (vol ou scénario terminé).
     Compter les simples ouvertures de page affichait « 1 jour d'affilée » à quelqu'un
     qui n'avait encore rien pratiqué — une fausse récompense. */
  function marquerJour(){
    var j=lire(JOURS_KEY,[]), a=jourISO();
    if(j.indexOf(a)<0){ j.push(a); ecrire(JOURS_KEY, j.slice(-400)); }
  }
  window.rtJourActif=marquerJour;      // appelé en fin de vol et en fin de scénario
  function serieJours(){
    var j=lire(JOURS_KEY,[]);
    if(!j.length) return 0;
    var vus={}; j.forEach(function(d){ vus[d]=1; });
    var n=0, cur=new Date();
    if(!vus[jourISO(cur)]) return 0;
    while(vus[jourISO(cur)]){ n++; cur.setDate(cur.getDate()-1); }
    return n;
  }

  /* ---- Quota : compté et affiché, mais NON bloquant pour l'instant ----
     `quotaAtteint()` est prêt à servir de garde le jour où on l'activera. */
  function quotaDuJour(){
    var q=lire(QUOTA_KEY,{});
    return (q.date===jourISO()) ? (q.n||0) : 0;
  }
  window.rtQuotaIncr=function(){
    var a=jourISO(), q=lire(QUOTA_KEY,{});
    ecrire(QUOTA_KEY, {date:a, n:(q.date===a?(q.n||0):0)+1});
  };
  window.rtQuotaAtteint=function(){ return quotaDuJour()>=QUOTA_MAX; };

  function vols(){ try{ return JSON.parse(localStorage.getItem('rt-vols')||'[]'); }catch(e){ return []; } }
  function sessions(){ try{ return JSON.parse(localStorage.getItem('radiotrainer_history_v2')||'[]'); }catch(e){ return []; } }
  function cls(p){ return p>=80?'bon':(p>=50?'moy':'bas'); }
  function dateFr(iso){
    try{ var d=new Date(iso);
      return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})+' '+
             d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    }catch(e){ return ''; }
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  var IC={
    cible:'<svg class="ic-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"/></svg>',
    avion:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z"/></svg>',
    feu:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M12 3s5 4 5 8a5 5 0 0 1-10 0c0-2 1-3 1-3s1 1.5 2 1.5C11 7 12 3 12 3z"/></svg>',
    micro:'<svg class="ic-svg" viewBox="0 0 24 24"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3.5"/></svg>'
  };
  function stat(ic,val,lib){
    return '<div class="tb-stat"><span class="tb-ic">'+ic+'</span><b>'+val+'</b><span>'+lib+'</span></div>';
  }

  function rendre(){
    var V=vols(), S=sessions();
    // Taux moyen : sur les vols ET les sessions de scénarios, pondéré par les éléments.
    var ok=0, tot=0;
    V.forEach(function(v){ ok+=v.ok||0; tot+=v.total||0; });
    S.forEach(function(s){ ok+=s.found||0; tot+=s.total||0; });
    var moy = tot ? Math.round(ok/tot*100) : null;
    var serie=serieJours();
    var nbSeances = V.length + S.length;      // séances réellement terminées
    var rien = nbSeances===0;

    $t('tbTitre').textContent = V.length||S.length ? 'Bon retour' : 'Bienvenue';
    $t('tbSub').textContent = V.length||S.length
      ? 'Votre progression et vos derniers vols.'
      : 'Lancez un premier scénario ou un vol : vos statistiques apparaîtront ici.';

    /* Rien de fait = rien à annoncer. Et avec une seule séance, on ne parle pas de
       « moyenne » : on dit sur quoi le chiffre porte. */
    var libTaux = rien ? 'pas encore de résultat'
                : (nbSeances===1 ? 'de réussite sur 1 séance' : 'taux de réussite moyen');
    $t('tbStats').innerHTML =
      stat(IC.cible, (rien||moy===null)?'—':(moy+'&nbsp;%'), libTaux) +
      stat(IC.avion, V.length?V.length:'—', V.length>1?'vols réalisés':'vol réalisé') +
      stat(IC.micro, S.length?S.length:'—', S.length>1?'sessions de scénarios':'session de scénarios') +
      stat(IC.feu, serie?serie:'—', rien?'aucune pratique enregistrée'
            :('jour'+(serie>1?'s':'')+' d\'affilée'));

    // Quota
    var n=quotaDuJour(), pc=Math.min(100, Math.round(n/QUOTA_MAX*100));
    $t('tbQuota').innerHTML =
      '<span class="tb-qn">'+n+'<small> / '+QUOTA_MAX+'</small></span>'+
      '<span class="tb-jauge"><i class="'+(n>=QUOTA_MAX?'plein':'')+'" style="width:'+pc+'%"></i></span>';
    $t('tbQuotaNote').textContent = n>=QUOTA_MAX
      ? 'Quota du jour atteint — la limite n\'est pas encore appliquée, vous pouvez continuer.'
      : 'Vols décomptés aujourd\'hui. La limite est affichée mais pas encore appliquée.';

    // Reprendre : vol interrompu, ou dernier vol à refaire
    var enCours=null;
    try{ enCours=JSON.parse(localStorage.getItem('rt-vol-en-cours')||'null'); }catch(e){}
    var r=$t('tbReprendre'), html='<div class="tb-repr">';
    if(enCours && enCours.dep){
      html+='<div class="tb-l2">Vol interrompu : '+esc(enCours.dep)+(enCours.arr?' → '+esc(enCours.arr):'')+
            ' — échange '+((enCours.i||0)+1)+'.</div>'+
            '<button class="btn small cta" data-go="navigation">Reprendre le vol</button>';
    } else if(V.length){
      html+='<div class="tb-l2">Dernier vol : '+esc(V[0].titre)+' — '+V[0].pct+' %.</div>'+
            '<button class="btn small cta" data-go="navigation">Nouveau vol</button>';
    } else {
      html+='<div class="tb-l2">Aucun vol en cours.</div>'+
            '<button class="btn small cta" data-go="navigation">Préparer un vol</button>';
    }
    // Reprendre le dernier scénario travaillé, avec son terrain.
    if(S.length && typeof S[0].scIdx==='number'){
      html+='<div class="tb-l2" style="margin-top:6px">Dernier scénario : '+esc(S[0].scenario)+
            (S[0].terrain?' · '+esc(S[0].terrain):'')+'.</div>'+
            '<button class="btn small" id="tbReprScen" type="button">Reprendre ce scénario</button>';
    } else {
      html+='<button class="btn small" data-go="exercices">Lancer un scénario</button>';
    }
    html+='</div>';
    r.innerHTML=html;
    var rs=document.getElementById('tbReprScen');
    if(rs) rs.addEventListener('click',function(){
      var l=document.querySelector('.sidelink[data-page="exercices"]'); if(l) l.click();
      setTimeout(function(){
        if(window.rtRelancerScenario) window.rtRelancerScenario(S[0].scIdx, S[0].terrain);
      },120);
    });

    // Derniers vols
    $t('tbVols').innerHTML = V.length
      ? V.slice(0,5).map(function(v){
          return '<div class="tb-ligne"><span class="tb-l1">'+esc(v.titre)+'</span>'+
                 '<span class="tb-l2">'+dateFr(v.date)+' · '+esc(v.avion||'')+
                 (v.alea?' · '+esc(v.alea):'')+'</span>'+
                 '<span class="tb-l3 '+cls(v.pct)+'">'+v.pct+' %</span></div>';
        }).join('')
      : '<div class="tb-vide">Aucun vol enregistré pour l\'instant.</div>';

    // Dernières sessions de scénarios
    $t('tbSessions').innerHTML = S.length
      ? S.slice(0,5).map(function(s){
          var p=s.total?Math.round(s.found/s.total*100):0;
          return '<div class="tb-ligne"><span class="tb-l1">'+esc(s.terrain||'—')+'</span>'+
                 '<span class="tb-l2">'+dateFr(s.date)+' · '+esc(s.scenario||'')+'</span>'+
                 '<span class="tb-l3 '+cls(p)+'">'+p+' %</span></div>';
        }).join('')
      : '<div class="tb-vide">Aucune session enregistrée pour l\'instant.</div>';

    /* ---- Points faibles récurrents ----
       Agrège les éléments manqués : détail par échange pour les vols, liste `missed`
       pour les sessions de scénarios. */
    var freq={};
    V.forEach(function(v){ (v.lignes||[]).forEach(function(l){
      (l.manquants||[]).forEach(function(m){ freq[m]=(freq[m]||0)+1; }); }); });
    S.forEach(function(s){ (s.missed||[]).forEach(function(m){ freq[m]=(freq[m]||0)+1; }); });
    var top=Object.keys(freq).map(function(k){ return {k:k,n:freq[k]}; })
              .sort(function(a,b){ return b.n-a.n; }).slice(0,5);
    var maxn=top.length?top[0].n:1;
    $t('tbFaibles').innerHTML = top.length
      ? top.map(function(x){
          return '<div class="tb-faible"><span class="tb-fl">'+esc(x.k)+'</span>'+
                 '<span class="tb-fb"><i style="width:'+Math.round(x.n/maxn*100)+'%"></i></span>'+
                 '<span class="tb-fn">'+x.n+'×</span></div>';
        }).join('')
      : '<div class="tb-vide">'+(rien
          ? 'Terminez un scénario ou un vol : vos oublis les plus fréquents apparaîtront ici.'
          : 'Aucun oubli enregistré — rien à retravailler pour l\'instant.')+'</div>';

    /* ---- Courbe de progression : 15 derniers vols, du plus ancien au plus récent ---- */
    var serieP=V.slice(0,15).map(function(v){ return v.pct; }).reverse();
    if(serieP.length>=2){
      var W=300, H=90, pad=6;
      var pas=(W-2*pad)/(serieP.length-1);
      var pts=serieP.map(function(p,i){
        return [pad+i*pas, pad+(H-2*pad)*(1-p/100)];
      });
      var d=pts.map(function(p,i){ return (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1); }).join(' ');
      var aire=d+' L'+pts[pts.length-1][0].toFixed(1)+' '+(H-pad)+' L'+pad+' '+(H-pad)+' Z';
      $t('tbCourbe').innerHTML='<div class="tb-courbe">'+
        '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'+
        '<line class="axe" x1="'+pad+'" y1="'+(H-pad)+'" x2="'+(W-pad)+'" y2="'+(H-pad)+'"/>'+
        '<path class="aire" d="'+aire+'"/><path class="ligne" d="'+d+'"/>'+
        pts.map(function(p){ return '<circle class="pt" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.4"/>'; }).join('')+
        '</svg><div class="tb-courbe-lg"><span>il y a '+serieP.length+' vols</span>'+
        '<span>dernier : '+serieP[serieP.length-1]+' %</span></div></div>';
    } else {
      $t('tbCourbe').innerHTML='<div class="tb-vide">'+(V.length===0
        ? 'Aucun vol pour l\'instant — la courbe apparaîtra après deux vols.'
        : 'Un seul vol enregistré — il en faut deux pour tracer une progression.')+'</div>';
    }

    /* ---- Objectifs (badges calculés par la page Progression) ---- */
    var B=(window.rtBadges?window.rtBadges():[]);
    $t('tbBadges').innerHTML = rien
      ? '<div class="tb-vide">Les objectifs se débloquent au fil de vos vols et scénarios.</div>'
      : B.length
      ? '<div class="tb-badges">'+B.map(function(b){
          return '<div class="tb-badge'+(b.earned?' ok':'')+'"><span class="ic">'+
                 (b.earned?b.ic:'<svg class="ic-svg" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>')+
                 '</span><span><b>'+esc(b.t)+'</b><span>'+esc(b.d)+'</span></span></div>';
        }).join('')+'</div>'
      : '<div class="tb-vide">Les objectifs apparaîtront après votre première session.</div>';

    sec.querySelectorAll('[data-go]').forEach(function(b){
      b.addEventListener('click',function(){
        var lien=document.querySelector('.sidelink[data-page="'+b.dataset.go+'"]');
        if(lien) lien.click();
      });
    });
  }

  $t('tbVoirTout').addEventListener('click',function(){
    var l=document.querySelector('.sidelink[data-page="navigation"]'); if(l) l.click();
  });
  $t('tbVoirProg').addEventListener('click',function(){
    var l=document.querySelector('.sidelink[data-page="progression"]'); if(l) l.click();
  });
  window.addEventListener('rt:page',function(e){ if(e.detail.page==='tableau') rendre(); });
  /* La progression arrive de la base après la connexion, donc APRÈS que le
     tableau de bord s'est peint une première fois. Sans ce second passage, on
     atterrit sur un tableau à zéro et il faut recharger la page pour voir ses
     chiffres — exactement ce qu'on vient de corriger ailleurs. */
  window.addEventListener('rt:donnees', function(){ try{ rendre(); }catch(e){} });
})();
