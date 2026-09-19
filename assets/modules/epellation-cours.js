/* =============================================================================
   AVIERO — L'EPELLATION RADIO ET LE CATALOGUE DE COURS
   -----------------------------------------------------------------------------
   Deux ecrans dans un seul module autonome. L'instance micro de l'epellation est
   100 % independante de celle des Exercices : aucune variable, aucune fonction,
   aucune instance partagee.

   Pour AJOUTER un cours, il suffit d'ajouter une entree a COURSES :
   { id, icon, title, desc, render(container) } — render() recoit un element vide
   a remplir. C'est deja la forme qu'attend la vision long terme d'AVIERO.

   Expose sur window : RT_TEST_EPEL
   Emprunte          : NATO, lev, bindPushToTalk (moteur) ; MISHEARD, AERODROMES, ICONS (donnees)

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
/* ============ Épellation radio + Catalogue de cours (module autonome).
   Réutilise NATO / AERODROMES / normalize / correctToken / ICONS du script principal,
   sans toucher à sa logique. Instance micro 100% indépendante de la section
   « Exercices » (aucune variable/fonction/instance partagée). ============ */
(function(){
  var $=function(id){return document.getElementById(id);};
  var LETTERS="ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  var PHON=(typeof NATO!=='undefined')?NATO:{A:"Alpha",B:"Bravo",C:"Charlie",D:"Delta",E:"Echo",
    F:"Foxtrot",G:"Golf",H:"Hotel",I:"India",J:"Juliett",K:"Kilo",L:"Lima",M:"Mike",N:"November",
    O:"Oscar",P:"Papa",Q:"Quebec",R:"Romeo",S:"Sierra",T:"Tango",U:"Uniform",V:"Victor",
    W:"Whiskey",X:"X-ray",Y:"Yankee",Z:"Zulu"};
  var DIGITS=[
    {n:"0",fr:"Zéro",en:"Zero"},{n:"1",fr:"Unité",en:"Wun"},{n:"2",fr:"Deux",en:"Too"},
    {n:"3",fr:"Trois",en:"Tree"},{n:"4",fr:"Quatre",en:"Fower"},{n:"5",fr:"Cinq",en:"Fife"},
    {n:"6",fr:"Six",en:"Six"},{n:"7",fr:"Sept",en:"Seven"},{n:"8",fr:"Huit",en:"Eight"},
    {n:"9",fr:"Neuf",en:"Niner"}
  ];
  var DIGIT_FR={}; DIGITS.forEach(function(d){DIGIT_FR[d.n]=d.fr;});
  var IC=(typeof ICONS!=='undefined')?ICONS:{};
  function el(tag,cls,html){ var e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }

  /* ========================================================================
     PARTIE A — CATALOGUE DE COURS (modulaire, piloté par données)
     Pour AJOUTER un cours : ajouter une entrée à COURSES :
       { id, icon (SVG), title, desc, render(container) }
     La fonction render(container) reçoit un élément vide à remplir.
     ======================================================================== */
  function renderAlphabet(host){
    host.innerHTML='';
    host.appendChild(el('h3','cours-h','Lettres'));
    var ag=el('div','alpha-grid');
    LETTERS.forEach(function(L){ ag.appendChild(el('div','alpha-card',
      '<span class="ltr">'+L+'</span><span class="wrd">'+(PHON[L]||'')+'</span>')); });
    host.appendChild(ag);
    host.appendChild(el('h3','cours-h','Chiffres'));
    host.appendChild(el('p','cours-note','En français, les chiffres se prononcent comme dans la vie courante. En anglais radio, certains diffèrent (colonne « Anglais radio »).'));
    var dg=el('div','digit-grid');
    DIGITS.forEach(function(d){ dg.appendChild(el('div','digit-card',
      '<span class="num">'+d.n+'</span><span class="say"><span class="fr">'+d.fr+'</span><span class="en">Anglais radio : '+d.en+'</span></span>')); });
    host.appendChild(dg);
  }

  var ALPHA_ICON='<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18l3.4-9 3.4 9"/><path d="M4.3 14.6h5"/><path d="M13.5 18V10a2.5 2.5 0 0 1 5 0v8"/><path d="M13.5 14h5"/></svg>';
  var BOOK_ICON='<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7.5h6M9 11h6"/></svg>';

  /* ---- Manuel officiel, intégré tel quel ----
     C'est la source unique de toute la phraséologie du simulateur : les échanges
     y renvoient déjà par numéro de page (« Manuel p. 39-44 »). Le lire ailleurs
     que dans l'application obligeait à jongler entre deux fenêtres.
     Réutilisation : document produit par la DSNA, administration de l'État. Les
     informations publiques sont librement réutilisables (code des relations entre
     le public et l'administration, art. L321-1 et suivants), y compris à titre
     commercial, à condition de ne pas en altérer le sens et d'en mentionner la
     source et la date — ce que fait l'encart ci-dessous. Le document lui-même ne
     porte aucune mention de restriction de reproduction. */
  var MANUEL_PDF='Manuel_Phraseologie.pdf';
  function renderManuel(host){
    host.innerHTML=
      '<div class="pdf-bar">'+
        '<a class="btn small primary" href="'+MANUEL_PDF+'" target="_blank" rel="noopener">Ouvrir en plein écran</a>'+
        '<a class="btn small" href="'+MANUEL_PDF+'" download>Télécharger le PDF</a>'+
        '<span class="pdf-hint">281 pages · recherche par mots-clés avec Ctrl+F (Cmd+F sur Mac)</span>'+
      '</div>'+
      '<div class="pdf-frame">'+
        '<iframe src="'+MANUEL_PDF+'#view=FitH" title="Manuel de phraséologie DSNA" loading="lazy"></iframe>'+
        '<p class="pdf-fallback">Votre navigateur n\'affiche pas les PDF dans la page. '+
          '<a href="'+MANUEL_PDF+'" target="_blank" rel="noopener">Ouvrez le manuel dans un nouvel onglet</a>.</p>'+
      '</div>'+
      '<p class="pdf-src"><b>Source</b> — <i>Manuel de phraséologie à l\'usage de la circulation aérienne '+
        'générale</i>, DGAC — Direction des services de la navigation aérienne (DSNA), Direction des '+
        'Opérations, avec l\'ENAC, '+
        '10<sup>e</sup> édition, à jour au 15 avril 2023. Document reproduit intégralement et sans '+
        'modification. Les renvois de page cités dans les exercices sont les pages imprimées du manuel.</p>';
  }

  var COURSES=[
    { id:'alphabet',
      icon:ALPHA_ICON,
      title:'Alphabet phonétique',
      desc:"Les 26 lettres de l'alphabet OACI (Alpha…Zulu) et la prononciation des chiffres 0-9 en radiotéléphonie.",
      render:renderAlphabet },
    { id:'manuel',
      icon:BOOK_ICON,
      title:'Manuel de phraséologie (DSNA)',
      desc:"Le manuel officiel complet, 281 pages : c'est la source de tous les échanges du simulateur. Consultable ici, page par page.",
      render:renderManuel }
    // → pour un nouveau cours, ajouter ici : { id:'…', icon:'…', title:'…', desc:'…', render:function(host){…} }
  ];

  var catalog=$('coursCatalog'), detail=$('coursDetail'), grid=$('courseGrid'),
      cTitle=$('courseTitle'), cDesc=$('courseDesc'), cBody=$('courseBody'), backBtn=$('courseBack');

  function buildCatalog(){
    if(!grid) return; grid.innerHTML='';
    COURSES.forEach(function(c){
      var card=el('button','course-card',
        '<span class="cic">'+(c.icon||'')+'</span><span class="ctxt"><span class="ctitle">'+c.title+'</span><span class="cdesc">'+c.desc+'</span></span>');
      card.type='button';
      card.addEventListener('click', function(){ openCourse(c.id); });
      grid.appendChild(card);
    });
  }
  function openCourse(id){
    var c=COURSES.filter(function(x){return x.id===id;})[0]; if(!c) return;
    if(cTitle) cTitle.textContent=c.title;
    if(cDesc) cDesc.textContent=c.desc;
    if(cBody) c.render(cBody);
    if(catalog) catalog.classList.add('hidden');
    if(detail) detail.classList.remove('hidden');
    try{ window.scrollTo(0,0); }catch(e){}
  }
  function showCatalog(){
    if(detail) detail.classList.add('hidden');
    if(catalog) catalog.classList.remove('hidden');
  }
  if(backBtn) backBtn.addEventListener('click', showCatalog);
  // (Re)cliquer l'onglet « Cours » ramène toujours au catalogue.
  Array.prototype.slice.call(document.querySelectorAll('[data-page="cours"]')).forEach(function(b){ b.addEventListener('click', showCatalog); });
  buildCatalog(); showCatalog();

  /* ========================================================================
     PARTIE B — EXERCICE D'ÉPELLATION (micro indépendant + robuste)
     ======================================================================== */
  var codeEl=$('spellCode'), kindEl=$('spellKind'), userEl=$('spellUser'), expEl=$('spellExpected'),
      fbEl=$('spellFeedback'), pttBtn=$('spellPtt'), replayBtn=$('spellReplayBtn'), skipBtn=$('spellSkipBtn'),
      revealBtn=$('spellReveal'), hoverChk=$('spellHover'), noreco=$('spellNoreco'), statusEl=$('spellStatus');
  if(!codeEl) return; // page absente

  var REGS=["F-GKXA","F-BUCG","F-HBQL","F-GJKP","F-PMER","F-GLYD","F-HDBA","N250U","N737BA","N12345",
            "N90210","N88X","D-EABC","G-BXYZ","OO-STU","HB-PNL","EC-MNO","OE-LKR"];
  var IATA=["CDG","ORY","NCE","LYS","MRS","TLS","BOD","NTE","LIL","BSL","SXB","MPL","AJA","PUF","BIA","RNS"];
  var ICAO=[]; if(typeof AERODROMES!=='undefined'){ AERODROMES.forEach(function(a){ if(a && a.icao) ICAO.push(a.icao); }); }
  if(!ICAO.length) ICAO=["LFPG","LFPO","LFBO","LFML","LFMN","LFLL","LFRS","LFBD","LFST","LFRB"];

  function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
  function randL(n){ var s=""; for(var i=0;i<n;i++) s+=LETTERS[Math.floor(Math.random()*26)]; return s; }
  function genReg(){
    if(Math.random()<0.55) return "F-"+pick(["G","H","B","P","C","J"])+randL(3);
    var n=1+Math.floor(Math.random()*3), num="";
    for(var i=0;i<n;i++) num+=Math.floor(Math.random()*10);
    return "N"+num+(Math.random()<0.6?randL(1+Math.floor(Math.random()*2)):"");
  }
  function nextCode(){
    var r=Math.random();
    if(r<0.40) return {kind:"Immatriculation", code:(Math.random()<0.5?genReg():pick(REGS))};
    if(r<0.72) return {kind:"Code aéroport OACI", code:pick(ICAO)};
    return {kind:"Code aéroport IATA", code:pick(IATA)};
  }
  function spellWords(code){
    var out=[];
    for(var i=0;i<code.length;i++){
      var ch=code[i].toUpperCase();
      if(ch>='A'&&ch<='Z') out.push(PHON[ch]);
      else if(ch>='0'&&ch<='9') out.push(DIGIT_FR[ch]);
    }
    return out;
  }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function norm(s){ return (typeof normalize==='function') ? normalize(s) : (s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' '); }
  function tok(word){ return norm(word).replace(/\s+/g,''); }

  /* =====================================================================
     RECONNAISSANCE DES MOTS ÉPELÉS
     Le verdict tombait « raté » sur des épellations pourtant justes. Trois
     causes, toutes dues au fait que Chrome transcrit en FRANÇAIS COURANT :

     1) « X-ray » ressort en DEUX mots (« x » puis « ray »). L'ancien code
        recalait chaque mot isolément sur le vocabulaire le plus proche :
        « ray » devenait « xray », et la réponse valait « x » + « xray ».
     2) Les chiffres ressortent en CHIFFRES (« 250 », « 1 2 3 »), jamais en
        lettres. Comparés à « deux/cinq/zéro », ils ne tombaient jamais juste.
     3) Le moindre mot parasite (« euh », « alors », un « et » de liaison)
        décalait toute la comparaison, faite par simple collage de chaînes.

     On résout donc en trois temps : découpage, RECOLLAGE des fragments
     (x + ray → xray), expansion des nombres (250 → deux cinq zéro), puis
     alignement souple qui ignore les parasites.
     ===================================================================== */
  var PHON_VOCAB=null;
  function phonVocab(){
    if(PHON_VOCAB) return PHON_VOCAB;
    var set={};
    for(var k in PHON){ if(PHON.hasOwnProperty(k)){ var t=tok(PHON[k]); if(t) set[t]=1; } } // alpha…xray
    DIGITS.forEach(function(d){ var t=tok(d.fr); if(t) set[t]=1; });                        // zero…neuf
    PHON_VOCAB=Object.keys(set);
    return PHON_VOCAB;
  }
  function estVocab(w){ return phonVocab().indexOf(w)!==-1; }

  /* Formes françaises courantes rendues par Chrome pour un mot OACI ou un chiffre.
     La distance de Levenshtein ne peut pas rattraper « quel beq » → « quebec ». */
  var SPELL_ALIAS={
    alfa:'alpha', alpha:'alpha', halfa:'alpha', alpa:'alpha',
    bravo:'bravo', bravos:'bravo', brava:'bravo',
    charlie:'charlie', charly:'charlie', charli:'charlie', charlot:'charlie',
    delta:'delta', deltat:'delta',
    echo:'echo', eco:'echo', ekko:'echo', ecco:'echo',
    foxtrot:'foxtrot', fox:'foxtrot', foxtrott:'foxtrot', foxtrote:'foxtrot', foxstrot:'foxtrot',
    golf:'golf', golfe:'golf', gulf:'golf', gaulf:'golf',
    hotel:'hotel', otel:'hotel', hotell:'hotel',
    india:'india', indya:'india', indien:'india', indiana:'india',
    juliett:'juliett', juliet:'juliett', juliette:'juliett', julie:'juliett', julia:'juliett',
    kilo:'kilo', quilo:'kilo', kilos:'kilo',
    lima:'lima', limat:'lima', lyma:'lima',
    mike:'mike', maik:'mike', maike:'mike', mick:'mike', mic:'mike',
    november:'november', novembre:'november', novembers:'november',
    oscar:'oscar', oskar:'oscar', oscars:'oscar',
    papa:'papa', papat:'papa',
    quebec:'quebec', kebec:'quebec', quebeck:'quebec', quaibec:'quebec',
    romeo:'romeo', romeos:'romeo', romeau:'romeo',
    sierra:'sierra', siera:'sierra', cierra:'sierra',
    tango:'tango', tangot:'tango', tangos:'tango',
    uniform:'uniform', uniforme:'uniform', uniformes:'uniform',
    victor:'victor', victort:'victor', victorre:'victor',
    whiskey:'whiskey', whisky:'whiskey', wiski:'whiskey', wisky:'whiskey', ouisky:'whiskey',
    xray:'xray', exray:'xray', icsray:'xray', xrai:'xray',
    yankee:'yankee', yanki:'yankee', yankie:'yankee', yanke:'yankee',
    zulu:'zulu', zoulou:'zulu', zoulu:'zulu', zoulous:'zulu',
    // chiffres énoncés en toutes lettres
    zero:'zero', zeros:'zero', unite:'unite', un:'unite', une:'unite', unitee:'unite',
    deux:'deux', d:'deux',
    trois:'trois', quatre:'quatre', katre:'quatre', cinq:'cinq', sink:'cinq',
    six:'six', sept:'sept', set:'sept', huit:'huit', wit:'huit', neuf:'neuf', neuve:'neuf'
  };
  /* Fragments qui n'ont de sens que collés au mot suivant : « x » + « ray ». */
  var SPELL_COLLE={ x:1, ex:1, ics:1, iks:1, w:1, ou:1, juli:1, jul:1 };
  /* Bruits de bouche à ignorer purement et simplement. */
  var SPELL_BRUIT={ euh:1, heu:1, hum:1, et:1, e:1, alors:1, donc:1, voila:1, ok:1, oui:1, bon:1 };

  /* « 250 » → ['deux','cinq','zero'] ; « 2 » → ['deux']. */
  function chiffresEnMots(w){
    var out=[];
    for(var i=0;i<w.length;i++){ var d=DIGIT_FR[w[i]]; if(d) out.push(tok(d)); }
    return out;
  }
  /* Mot le plus proche du vocabulaire fermé, ou null si trop éloigné. */
  function plusProche(w){
    if(!w) return null;
    if(SPELL_ALIAS[w]) return SPELL_ALIAS[w];
    if(estVocab(w)) return w;
    if(typeof MISHEARD!=='undefined' && MISHEARD[w]){
      var mm=tok(MISHEARD[w]); if(estVocab(mm)) return mm;
    }
    if(w.length<3) return null;                    // trop court pour décider seul
    var vocab=phonVocab(), best=null, bd=99;
    for(var i=0;i<vocab.length;i++){
      var d=(typeof lev==='function')?lev(w,vocab[i]):(w===vocab[i]?0:99);
      if(d<bd){ bd=d; best=vocab[i]; }
    }
    // Seuil serré : à 1 faute près sur un mot court, 2 sur un mot long.
    return (bd <= (w.length<=5 ? 1 : 2)) ? best : null;
  }
  /* Transcription brute → suite de mots du vocabulaire (+ parasites conservés
     tels quels, ils seront ignorés à l'alignement). */
  function userTokens(text){
    var raw=norm(text).split(' ').filter(Boolean), out=[], i=0;
    while(i<raw.length){
      var w=raw[i];
      if(SPELL_BRUIT[w]){ i++; continue; }
      if(/^\d+$/.test(w)){ out=out.concat(chiffresEnMots(w)); i++; continue; }
      // recollage d'un fragment avec le mot suivant (« x » + « ray »)
      if(i+1<raw.length){
        var colle=plusProche(w+raw[i+1]);
        if(colle && (SPELL_COLLE[w] || !plusProche(w))){ out.push(colle); i+=2; continue; }
      }
      var m=plusProche(w);
      out.push(m || w);
      i++;
    }
    return out;
  }

  /* Alignement souple attendu ↔ entendu. Un mot entendu hors vocabulaire qui ne
     correspond à rien est traité comme un parasite : on le signale, mais il ne
     décale pas la suite de la comparaison. */
  function aligner(exp, usr){
    var marks=[], extras=[], i=0, j=0;
    while(i<exp.length){
      // on saute les parasites qui précèdent le bon mot
      while(j<usr.length && usr[j]!==exp[i] && !estVocab(usr[j])
            && (j+1<usr.length && usr[j+1]===exp[i])){ extras.push(usr[j]); j++; }
      if(j<usr.length && usr[j]===exp[i]){ marks.push({w:exp[i], ok:true}); i++; j++; continue; }
      // mot suivant correct → celui-ci est en trop
      if(j+1<usr.length && usr[j+1]===exp[i]){ extras.push(usr[j]); j++; continue; }
      // mot présent mais faux
      if(j<usr.length){ marks.push({w:exp[i], ok:false, dit:usr[j]}); i++; j++; continue; }
      marks.push({w:exp[i], ok:false, manque:true}); i++;      // plus rien d'entendu
    }
    while(j<usr.length){ extras.push(usr[j]); j++; }           // mots en trop à la fin
    return {marks:marks, extras:extras};
  }

  var current=null, expTok=[], expWords=[], dernierTemps=0;
  /* Compteurs de série, affichés dans la colonne de droite. */
  var stats={ok:0, tot:0, streak:0, best:0};
  function majStats(){
    var e;
    if((e=$('spellStatOk'))) e.textContent=stats.ok;
    if((e=$('spellStatTot'))) e.textContent=stats.tot;
    if((e=$('spellStatStreak'))) e.textContent=stats.streak;
    if((e=$('spellStatBest'))) e.textContent=stats.best?((stats.best/1000).toFixed(1)+' s'):'—';
  }

  /* Le code s'affiche en pastilles, une par caractère épelé (le tiret n'en est
     pas une : il ne se prononce pas). Chacune se colore après la réponse. */
  function renderCode(code){
    codeEl.innerHTML='';
    for(var i=0;i<code.length;i++){
      var ch=code[i].toUpperCase(), sp=document.createElement('span');
      var parle = (ch>='A'&&ch<='Z')||(ch>='0'&&ch<='9');
      sp.className = 'sp-char'+(parle?'':' sep');
      sp.textContent = ch;
      if(parle) sp.dataset.idx = String(codeEl.querySelectorAll('.sp-char:not(.sep)').length);
      codeEl.appendChild(sp);
    }
  }
  function pastilles(host, items, vide){
    host.innerHTML='';
    if(!items.length){ host.innerHTML='<span class="none">'+esc(vide||'—')+'</span>'; return; }
    items.forEach(function(it){
      var sp=document.createElement('span');
      sp.className='w'+(it.cls?' '+it.cls:'');
      sp.textContent=it.t;
      host.appendChild(sp);
    });
  }
  function newCode(){
    current=nextCode();
    kindEl.textContent=current.kind;
    renderCode(current.code);
    expWords=spellWords(current.code);
    expTok=expWords.map(tok);
    pastilles(expEl, expWords.map(function(w){ return {t:w}; }));
    expEl.classList.add('blurred');
    expEl.classList.toggle('hoverable', hoverChk && hoverChk.checked);
    if(revealBtn) revealBtn.textContent='Voir la réponse';
    setUser([]); fbEl.innerHTML=''; setStatus('');
    if(replayBtn) replayBtn.disabled=true; audioURL=null;
    /* L'alternat aussi repart au repos : passer au code suivant pendant une
       écoute laissait le bouton rouge et le libellé « relâchez » sur un
       exercice qui, lui, n'écoutait plus. */
    pttUI(false);
    resetTimer();
  }
  function setUser(items){
    pastilles(userEl, items||[], "rien pour l'instant");
  }
  /* Transcription brute de la dernière écoute : c'est ELLE qu'on évalue.
     L'ancienne version relisait le texte affiché dans le DOM — ce qui devenait
     impossible dès qu'on y met des pastilles, et fragile de toute façon. */
  var dernierBrut='';
  /* Série en cours : un passage sur la page d'épellation. Remise à zéro à
     chaque arrivée, pour qu'une visite ne se rattache pas à la précédente. */
  var serie = { jeton:null, n:0, ok:0, total:0 };
  /* La série se remet à zéro quand on ARRIVE sur la page — pas à chaque fois
     que la page est réaffichée.

     La nuance n'est pas cosmétique. « rt:page » est émis par showPage(), et
     showPage() est rappelé pour la page COURANTE à chaque événement de session
     (rafraîchissement de jeton, connexion dans un autre onglet). Sans la garde
     ci-dessous, un jeton renouvelé au milieu d'une épellation coupait la série
     en deux : la seconde moitié ouvrait une nouvelle séance, et la première
     restait « in_progress » jusqu'à être requalifiée en ABANDON. La console
     d'administration comptait donc des abandons que personne n'avait faits. */
  var pageCourante = null;
  window.addEventListener('rt:page', function(ev){
    var page = ev.detail && ev.detail.page;
    if (page === 'epellation' && pageCourante !== 'epellation')
      serie = { jeton:null, n:0, ok:0, total:0 };
    pageCourante = page;
  });

  function evaluate(){
    var ut = userTokens(dernierBrut);
    var C=(typeof ICONS!=='undefined')?ICONS:{check:'✓',warn:'✗'};
    var chips=codeEl.querySelectorAll('.sp-char:not(.sep)');

    // Rien capté : ce n'est pas une faute d'épellation, on le dit distinctement.
    if(!ut.length){
      setUser([]);
      for(var k=0;k<chips.length;k++) chips[k].className='sp-char';
      fbEl.innerHTML='<div class="spell-verdict">'+C.warn+
        '<span>Rien entendu.<small>Maintenez le bouton pendant toute l’épellation, et parlez près du micro.</small></span></div>';
      return;
    }

    var al=aligner(expTok, ut);
    var justes=0;
    al.marks.forEach(function(m,idx){
      if(m.ok) justes++;
      if(chips[idx]) chips[idx].className='sp-char '+(m.ok?'ok':'ko');
    });
    var correct = (justes===expTok.length) && !al.extras.length;

    // Attendu : chaque mot coloré selon qu'il a été dit ou non.
    pastilles(expEl, al.marks.map(function(m,idx){
      return {t:expWords[idx], cls:(m.ok?'ok':(m.manque?'miss':'ko'))};
    }));
    // Entendu : la suite réellement reconnue, mots en trop signalés en orange.
    var dits=[];
    al.marks.forEach(function(m){
      if(m.ok) dits.push({t:m.w, cls:'ok'});
      else if(m.manque) dits.push({t:'(rien)', cls:'miss'});
      else dits.push({t:m.dit, cls:'ko'});
    });
    al.extras.forEach(function(x){ dits.push({t:x, cls:'extra'}); });
    setUser(dits);

    /* ---- Enregistrement de la série ----
       L'épellation ne gardait RIEN : ni score, ni durée, ni trace. C'était la
       dernière des quatre mesures manquantes.
       Une « série » est un passage sur la page, pas un code isolé : une ligne
       par code noierait la table et ne dirait rien de plus. La séance est donc
       ouverte au premier code évalué, puis re-close après chacun — l'écriture
       étant un upsert sur un identifiant tiré côté client, la ligne reste la
       même et son statut vaut « terminée à cet instant ». Aucun évènement de
       fin à guetter, donc rien à rater quand l'onglet se ferme. */
    if (window.RTSync && !serie.jeton){
      serie.jeton = RTSync.demarrer({ kind:'spelling' });
      serie.n = 0;
    }
    if (serie.jeton){
      var attendu = expWords.join(' ');
      var entendu = ut.join(' ');
      var rates = al.marks.map(function(m,i){ return m.ok ? null : expWords[i]; })
                          .filter(Boolean).concat(al.extras.map(function(x){ return 'en trop : '+x; }));
      serie.ok += justes; serie.total += expTok.length;
      RTSync.terminer(serie.jeton,
        { kind:'spelling', score_ok:serie.ok, score_total:serie.total },
        [{ idx:serie.n++, phase:(current && current.kind) || 'Épellation',
           expected:attendu, said:entendu, answered:true,
           missed:rates, score_ok:justes, score_total:expTok.length }]);
    }

    // Compteurs de série.
    stats.tot++;
    if(correct){
      stats.ok++; stats.streak++;
      if(dernierTemps>0 && (!stats.best || dernierTemps<stats.best)) stats.best=dernierTemps;
    } else stats.streak=0;
    majStats();

    var detail='';
    if(!correct){
      var manques=al.marks.filter(function(m){return m.manque;}).length;
      var faux=al.marks.filter(function(m){return !m.ok && !m.manque;}).length;
      var bouts=[];
      if(faux)   bouts.push(faux+' mot'+(faux>1?'s':'')+' erroné'+(faux>1?'s':''));
      if(manques)bouts.push(manques+' non dit'+(manques>1?'s':''));
      if(al.extras.length) bouts.push(al.extras.length+' mot'+(al.extras.length>1?'s':'')+' en trop');
      detail='<small>'+esc(bouts.join(' · '))+' — comparez les deux lignes ci-dessous.</small>';
    } else if(dernierTemps>0){
      detail='<small>'+(dernierTemps/1000).toFixed(1)+' s'+
             (stats.streak>1?(' · '+stats.streak+' d’affilée'):'')+'</small>';
    }
    fbEl.innerHTML='<div class="spell-verdict '+(correct?'good':'bad')+'">'+
      (correct?C.check:C.warn)+'<span>'+(correct?'Correct — bien épelé !':'Raté.')+detail+'</span></div>';

    // La réponse attendue n'est dévoilée qu'en cas d'échec : sur un sans-faute,
    // l'afficher n'apprend rien et gâche l'exercice suivant.
    if(!correct){
      expEl.classList.remove('blurred');
      if(revealBtn) revealBtn.textContent='Masquer la réponse';
    }
  }

  /* --- Micro : reconnaissance vocale (prioritaire) + capture audio (secondaire) --- */
  function slog(){ try{ var a=[].slice.call(arguments); a.unshift('[Épellation]'); console.log.apply(console,a); }catch(e){} }
  function setStatus(text,isErr){
    if(!statusEl) return;
    if(!text){ statusEl.className='spell-status hidden'; statusEl.textContent=''; return; }
    statusEl.className='spell-status'+(isErr?' err':''); statusEl.textContent=text;
  }
  /* Même bouton que le PTT des Scénarios et du vol : une icône et un <span> de
     libellé qu'on réécrit, sans reconstruire le contenu (ce qui effaçait l'icône). */
  function pttUI(on){
    if(!pttBtn) return;
    pttBtn.classList.toggle('listening', on);
    var sp=pttBtn.querySelector('span:not(.rec-dot)');
    if(sp) sp.textContent = on ? 'Écoute… relâchez pour terminer' : 'Maintenir pour parler';
  }

  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  var reco=null, recognizing=false, audioEnabled=true;
  var mediaStream=null, mediaRec=null, chunks=[], audioURL=null;

  /* « Réécouter mon audio » ne marchait jamais. La cause est dans l'arrêt :
     stopRecorder() remettait mediaRec à null AVANT que l'évènement onstop du
     MediaRecorder n'arrive (il est asynchrone). Le gestionnaire lisait alors
     mediaRec.mimeType sur null, levait une TypeError silencieuse, et l'URL de
     lecture n'était jamais créée — le bouton restait donc grisé à vie. On
     capture désormais l'enregistreur et le flux dans des variables LOCALES, et
     c'est onstop qui libère le micro, une fois les données récupérées. */
  function startRecorder(){
    if(!audioEnabled){ slog('capture audio désactivée (conflit précédent)'); return; }
    if(!(navigator.mediaDevices && window.MediaRecorder)){ slog('MediaRecorder/getUserMedia non supporté'); return; }
    navigator.mediaDevices.getUserMedia({audio:true}).then(function(flux){
      if(!recognizing){ flux.getTracks().forEach(function(t){t.stop();}); return; }
      var rec;
      try{ rec=new MediaRecorder(flux); }
      catch(err){ slog('MediaRecorder KO:', err && err.message);
                  flux.getTracks().forEach(function(t){t.stop();}); return; }
      mediaStream=flux; mediaRec=rec; chunks=[];
      rec.ondataavailable=function(e){ if(e.data && e.data.size) chunks.push(e.data); };
      rec.onerror=function(e){ slog('MediaRecorder erreur:', e && e.error); };
      rec.onstop=function(){
        // Le micro n'est relâché qu'ICI : couper les pistes trop tôt tronquait la fin.
        try{ flux.getTracks().forEach(function(t){t.stop();}); }catch(_){}
        if(mediaStream===flux) mediaStream=null;
        if(!chunks.length){ slog('aucune donnée audio capturée'); return; }
        var blob=new Blob(chunks,{type:rec.mimeType||'audio/webm'});
        if(audioURL) URL.revokeObjectURL(audioURL);
        audioURL=URL.createObjectURL(blob);
        if(replayBtn) replayBtn.disabled=false;
        slog('audio prêt pour réécoute ('+blob.size+' octets)');
      };
      /* Tranches de 250 ms : sans argument, Chrome ne produit un blob qu'à
         l'arrêt, et une écoute écourtée pouvait ne rien livrer du tout. */
      rec.start(250); slog('capture audio démarrée');
    }).catch(function(err){ slog('getUserMedia (capture) refusé/indispo:', err && err.name); });
  }
  function stopRecorder(){
    var rec=mediaRec; mediaRec=null;
    if(rec && rec.state!=='inactive'){
      try{ rec.stop(); return; }catch(e){ slog('stop() KO', e); }   // onstop libèrera le flux
    }
    // Jamais démarré (ou déjà arrêté) : on relâche le micro nous-mêmes.
    try{ if(mediaStream){ mediaStream.getTracks().forEach(function(t){t.stop();}); mediaStream=null; } }catch(e){}
  }

  if(!SR){
    if(noreco) noreco.classList.remove('hidden');
    if(pttBtn) pttBtn.disabled=true;
    slog('SpeechRecognition NON supporté par ce navigateur (utilisez Chrome, Edge ou Safari).');
  } else {
    reco=new SR(); reco.lang='fr-FR'; reco.continuous=true; reco.interimResults=true;
    reco.onstart=function(){ slog('reconnaissance démarrée'); setStatus('🎙 Écoute en cours… épelez le code, puis relâchez le bouton.'); startRecorder(); };
    reco.onresult=function(ev){
      var t=''; for(var i=0;i<ev.results.length;i++) t+=ev.results[i][0].transcript+' ';
      dernierBrut=t;
      // Aperçu en direct : on voit les mots retenus au fur et à mesure.
      setUser(userTokens(t).map(function(w){ return {t:w}; }));
      slog('transcription:', JSON.stringify(t));
    };
    reco.onnomatch=function(){ slog('onnomatch (aucune correspondance)'); };
    reco.onerror=function(ev){
      var e=ev && ev.error; slog('ERREUR reconnaissance:', e);
      var hadRec=!!mediaRec; stopRecorder();
      var m='';
      if(e==='not-allowed'||e==='service-not-allowed') m="Micro refusé. Autorisez le microphone pour ce site (icône à gauche de la barre d'adresse), puis réessayez.";
      else if(e==='no-speech') m="Aucune parole détectée. Recliquez sur le micro et épelez le code.";
      else if(e==='audio-capture') m="Aucun microphone détecté sur cet appareil.";
      else if(e==='network') m="Erreur réseau : la reconnaissance vocale de Chrome nécessite une connexion Internet.";
      else if(e==='aborted') m='';
      else m="Erreur micro ("+e+"). Réessayez.";
      if(hadRec && (e==='aborted'||e==='audio-capture')){ audioEnabled=false; m="Réécoute audio désactivée pour fiabiliser la reconnaissance vocale. Recliquez sur le micro."; }
      if(m) setStatus(m,true);
      recognizing=false; pttUI(false); stopTimer();
    };
    reco.onend=function(){
      slog('reconnaissance terminée'); stopRecorder();
      if(recognizing){ recognizing=false; pttUI(false); stopTimer();
        if(!statusEl || statusEl.className.indexOf('err')<0) setStatus('');
        evaluate();
      }
    };
  }
  pttUI(false);

  /* Étape 3 — chronomètre : démarre à l'appui (startSpell), se fige au relâchement (stopSpell),
     remis à 0 à chaque nouveau code (newCode). Affichage mm:ss non nécessaire → secondes.dixième. */
  var timerEl=null, timerStart=0, timerRAF=null;
  function fmtElapsed(ms){ return (Math.max(0,ms)/1000).toFixed(1)+' s'; }
  function timerTick(){
    if(!timerEl) timerEl=$('spellTimer');
    if(timerEl) timerEl.textContent=fmtElapsed(Date.now()-timerStart);
    timerRAF=(typeof requestAnimationFrame==='function')?requestAnimationFrame(timerTick):setTimeout(timerTick,100);
  }
  function cancelTick(){ if(timerRAF){ (typeof cancelAnimationFrame==='function')?cancelAnimationFrame(timerRAF):clearTimeout(timerRAF); timerRAF=null; } }
  function startTimer(){ if(!timerEl) timerEl=$('spellTimer'); if(timerEl) timerEl.classList.add('running'); timerStart=Date.now(); cancelTick(); timerTick(); }
  function stopTimer(){ cancelTick(); if(!timerEl) timerEl=$('spellTimer');
    if(timerStart) dernierTemps=Date.now()-timerStart;      // durée retenue pour le meilleur temps
    if(timerEl){ timerEl.classList.remove('running'); if(timerStart) timerEl.textContent=fmtElapsed(dernierTemps); } }
  function resetTimer(){ cancelTick(); timerStart=0; if(!timerEl) timerEl=$('spellTimer'); if(timerEl){ timerEl.classList.remove('running'); timerEl.textContent='0.0 s'; } }

  function startSpell(){
    if(!reco) return;
    dernierBrut=''; dernierTemps=0; setUser([]); fbEl.innerHTML=''; setStatus('Démarrage du micro…');
    // Nouvelle tentative : les pastilles du code repartent neutres.
    var ch=codeEl.querySelectorAll('.sp-char:not(.sep)');
    for(var k=0;k<ch.length;k++) ch[k].className='sp-char';
    recognizing=true; pttUI(true); startTimer(); slog('appui → démarrage de la reconnaissance');
    try{ reco.start(); slog('reco.start() appelé'); }
    catch(err){
      slog('reco.start() a levé une exception:', err && err.name, err && err.message);
      try{ reco.stop(); }catch(_){}
      recognizing=false; pttUI(false); stopTimer();
      setStatus("Le micro n'a pas pu démarrer ("+((err&&err.name)||'erreur')+"). Réessayez.", true);
    }
  }
  function stopSpell(){
    slog('relâchement → arrêt par l\'utilisateur'); recognizing=false; pttUI(false); stopTimer(); setStatus('');
    if(reco){ try{ reco.stop(); }catch(e){} }
    stopRecorder();
    evaluate();
  }

  // Étape 2 : PTT maintenu (souris + tactile) via le helper global — maintenir pour parler, relâcher pour arrêter.
  if(typeof bindPushToTalk==='function'){
    bindPushToTalk(pttBtn, function(){ if(SR && !recognizing) startSpell(); }, function(){ if(recognizing) stopSpell(); });
  } else if(pttBtn){
    pttBtn.addEventListener('click', function(){ if(!SR) return; recognizing?stopSpell():startSpell(); });
  }
  if(replayBtn) replayBtn.addEventListener('click', function(){ if(audioURL){ try{ new Audio(audioURL).play(); }catch(e){ slog('lecture audio KO', e); } } });
  if(skipBtn) skipBtn.addEventListener('click', function(){ if(recognizing) stopSpell(); newCode(); });
  if(revealBtn) revealBtn.addEventListener('click', function(){
    var blurred=expEl.classList.toggle('blurred');
    revealBtn.textContent = blurred ? 'Voir la réponse' : 'Masquer la réponse';
  });
  if(hoverChk) hoverChk.addEventListener('change', function(){ expEl.classList.toggle('hoverable', hoverChk.checked); });

  /* Prise de test, sur le modèle de RT_TEST côté Navigation. Elle n'ajoute
     aucune logique : dire() dépose une transcription là où la reconnaissance
     vocale la dépose, puis appelle evaluate(). C'est le chemin exact d'un
     relâchement de PTT — il n'existe pas de second circuit d'évaluation. */
  window.RT_TEST_EPEL = {
    attendu: function(){ return expTok.join(' '); },
    dire:    function(txt){ dernierBrut = String(txt||''); evaluate(); },
    suivant: function(){ newCode(); }
  };

  majStats();
  newCode();
})();
