/* =============================================================================
   AVIERO — LA NAVIGATION — PREPARATION ET VOL EN DIRECT
   -----------------------------------------------------------------------------
   Le plus gros module de l'application apres le moteur : preparation du vol,
   carte, vol en direct, organismes de controle, aleas, radio, transpondeur,
   historique des vols.

   ┌─ C'EST LE MODULE LE PLUS COUPLE AU MOTEUR ─────────────────────────────┐
   │ Il lui emprunte VINGT-NEUF symboles — la voix du controleur, la         │
   │ reconnaissance vocale, la correction floue, l'etat, les reglages.       │
   │ Aucun ne passe par window : ce sont des liaisons de portee globale.     │
   │ Ce fichier doit donc charger APRES le bloc du moteur, et c'est la       │
   │ seule chose a ne jamais intervertir.                                    │
   │ tests/contrat/symboles.test.mjs surveille cet ordre.                    │
   └──────────────────────────────────────────────────────────────────────────┘

   Toute phraseologie de ce module vient du manuel DSNA et cite sa page
   (CLAUDE.md § 2). Ne jamais en inventer.

   Expose sur window : RT_TEST  RT_AIR
   Emprunte          : 29 symboles du moteur ; OaciTiles et oaciSonde ; NAV_AD_GEO, NAV_AVIONS, AERODROMES

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
/* ============ Préparation de vol (page Navigation) — module autonome, Phase 1 ============
   N'AFFECTE AUCUNEMENT la logique des scénarios : ce module ne fait que LIRE la constante
   AERODROMES (icao / nom / pistes) et la joindre à NAV_AD_GEO (lat, lon, fréquences) par
   code OACI. Rien n'est réassigné, aucun handler existant n'est remplacé.

   PHASE 2 (à construire ensuite) : déroulé dynamique du vol — mise en route, décollage,
   suivi en vol, ATC qui répond, déplacement de l'avion sur la carte, aléas. Toute la
   phraséologie devra provenir du manuel de référence du projet (Manuel_Phraseologie.pdf /
   PHRASEOLOGIE-MANUEL.md). Ne jamais inventer de phraséologie ni de collationnement. */
(function(){
  var sec=document.getElementById('page-navigation');
  if(!sec) return;

  /* Diagnostic de déploiement. En local tout est présent ; sur un hébergeur (GitHub
     Pages…) un fichier peut manquer si le téléversement est incomplet. Sans ce test
     le module abandonnait en silence : la page s'affichait, mais rien ne fonctionnait
     et rien ne disait pourquoi. On nomme désormais le fichier fautif. */
  function panne(liste){
    var box=sec.querySelector('.nav-warn');
    if(box){
      box.innerHTML='<strong>La page Navigation ne peut pas démarrer.</strong> '+
        'Fichier(s) absent(s) ou non chargé(s) : <code>'+liste.join('</code>, <code>')+'</code>.'+
        '<br>Ces fichiers doivent être publiés en conservant l’arborescence <code>assets/</code>.';
      box.classList.add('nav-fatal');
    }
    var lay=sec.querySelector('.nav-layout'); if(lay) lay.classList.add('hidden');
    var md=sec.querySelector('.nav-mode'); if(md) md.classList.add('hidden');
  }
  var manque=[];
  if(typeof L==='undefined')           manque.push('assets/leaflet.js');
  if(typeof NAV_AD_GEO==='undefined')  manque.push('assets/aerodromes-geo.js');
  if(typeof AERODROMES==='undefined')  manque.push('base AERODROMES (index.html)');
  if(manque.length){ panne(manque); return; }

  // ---- Jointure base scénarios (AERODROMES) × géo/fréquences (NAV_AD_GEO) ----
  var GEO=(typeof NAV_AD_GEO!=='undefined')?NAV_AD_GEO:{};
  var ADS=AERODROMES.map(function(a){
    var g=GEO[a.icao]||{};
    return { icao:a.icao, nom:a.nom, pistes:a.pistes, lat:g.lat, lon:g.lon, alt:g.alt, freq:g.freq||{} };
  }).filter(function(a){ return typeof a.lat==='number'; });
  var BY={}; ADS.forEach(function(a){ BY[a.icao]=a; });

  /* Une liste native se déroule dans l'ordre du document : c'est donc l'ordre
     d'insertion, et rien d'autre, qui décide de ce qu'on voit en premier. Les
     grands terrains passent devant (voir AD_CONNUS), les autres suivent par
     code OACI. Filtrer à la frappe reste le travail du navigateur. */
  var dd=document.getElementById('navAdList');
  ADS.slice().sort(adComparer).forEach(function(a){
    var o=document.createElement('option'); o.value=a.icao; o.label=a.icao+' — '+a.nom;
    o.textContent=a.nom; dd.appendChild(o);
  });
  var dEl=document.getElementById('navDataDate');
  if(dEl) dEl.textContent=(typeof NAV_AIRSPACE_DATE!=='undefined')?NAV_AIRSPACE_DATE:'date inconnue';

  /* --- Types d'avion : {nom affiché, abrégé prononcé à la radio, famille} ---
     L'abrégé suit le manuel DSNA p. 18 : le type peut préfixer l'indicatif. */
  /* Vitesse de croisière indicative (kt vrai) par famille, pour l'estimation de
     durée de vol. Ordres de grandeur usuels — sert à afficher un temps réaliste,
     pas à préparer une navigation. */
  var VITESSE={Robin:115, Cessna:110, Piper:110, Socata:120, Aquila:110, Grumman:120,
               Diamond:130, Cirrus:155, Tecnam:110, ULM:95, Classique:95,
               Voltige:120, Planeur:60,
               /* Familles ajoutées. Mêmes ordres de grandeur usuels : la valeur
                  sert à afficher une durée de vol plausible, pas à préparer une
                  navigation — personne ne décolle sur ce chiffre. */
               Mooney:160, Beechcraft:145, 'Nouvelle génération':125, Kit:150,
               Brousse:95};
  /* L'ordre des lignes EST celui du menu déroulé : ouvrirTout() pose un titre de
     famille chaque fois que `fam` change, donc une famille éclatée en deux
     endroits apparaîtrait deux fois. Les entrées d'une même famille doivent
     rester contiguës — c'est la seule contrainte de cette table.

     ORDRE : celui sous lequel on cherche un avion, pas celui d'un catalogue. Les
     familles vont de la plus répandue en aéroclub français à la plus rare, et
     chaque famille s'ouvre sur ses modèles les plus connus — Cessna 172 en tête,
     puis DR400, PA-28, DA40. Viennent ensuite le kit, la brousse, l'ULM, le
     classique, la voltige et le planeur.

     QUATRIÈME COLONNE : le nombre de SIÈGES du modèle, pilote compris. Il borne
     le champ « personnes à bord » — on pouvait auparavant annoncer neuf personnes
     dans un Cessna 152. */
  var AIRCRAFT=[
   // --- Cessna ---
   ["Cessna 172 Skyhawk","CESSNA 172","Cessna",4], ["Cessna 152","CESSNA 152","Cessna",2],
   ["Cessna 150","CESSNA 150","Cessna",2], ["Cessna 182 Skylane","CESSNA 182","Cessna",4],
   ["Cessna 140","CESSNA 140","Cessna",2], ["Cessna 170","CESSNA 170","Cessna",4],
   ["Cessna 172RG Cutlass","CESSNA 172","Cessna",4], ["Cessna 175 Skylark","CESSNA 175","Cessna",4],
   ["Cessna 177 Cardinal","CESSNA 177","Cessna",4], ["Cessna 180 Skywagon","CESSNA 180","Cessna",4],
   ["Cessna 185 Skywagon","CESSNA 185","Cessna",6], ["Cessna 206 Stationair","CESSNA 206","Cessna",6],
   ["Cessna 210 Centurion","CESSNA 210","Cessna",6],
   // --- Robin ---
   ["Robin DR400-140B Major","DR400","Robin",4], ["Robin DR400-120 Petit Prince","DR400","Robin",4],
   ["Robin DR400-180 Régent","DR400","Robin",4], ["Robin DR400-108 Dauphin 2+2","DR400","Robin",4],
   ["Robin DR400-160 Chevalier","DR400","Robin",4], ["Robin DR400-180R Remorqueur","DR400","Robin",2],
   ["Robin DR400-500 Président","DR400","Robin",4], ["Robin DR400 Ecoflyer","DR400","Robin",4],
   ["Robin DR401-155 CDI","DR401","Robin",4], ["Robin DR401","DR401","Robin",4],
   ["Robin DR300 Petit Prince","DR300","Robin",4], ["Robin DR253 Régent","DR253","Robin",4],
   ["Robin DR221 Dauphin","DR221","Robin",2], ["Robin DR315 Petit Prince","DR315","Robin",4],
   ["Robin HR100","HR100","Robin",4], ["Robin HR200-120B","HR200","Robin",2],
   ["Robin R3000-160","R3000","Robin",4], ["Robin R2160 Acrobin","R2160","Robin",2],
   ["Robin ATL Club","ATL","Robin",2],
   // --- Piper ---
   ["Piper PA-28 161 Warrior","PIPER PA28","Piper",4], ["Piper PA-28 181 Archer","PIPER PA28","Piper",4],
   ["Piper PA-18 Super Cub","PIPER PA18","Piper",2], ["Piper PA-38 Tomahawk","PIPER PA38","Piper",2],
   ["Piper PA-11 Cub Special","PIPER PA11","Piper",2], ["Piper PA-20 Pacer","PIPER PA20","Piper",4],
   ["Piper PA-22 Tri-Pacer","PIPER PA22","Piper",4], ["Piper PA-24 Comanche","PIPER PA24","Piper",4],
   ["Piper PA-28 140 Cherokee","PIPER PA28","Piper",4], ["Piper PA-28 236 Dakota","PIPER PA28","Piper",4],
   ["Piper PA-28R Arrow","PIPER PA28R","Piper",4], ["Piper PA-32 Cherokee Six","PIPER PA32","Piper",6],
   ["Piper PA-46 Malibu","PIPER PA46","Piper",6], ["Piper PA-34 Seneca","PIPER PA34","Piper",6],
   // --- Diamond ---
   ["Diamond DA40 Star","DA40","Diamond",4], ["Diamond DA40 NG","DA40","Diamond",4],
   ["Diamond DA20 Katana","DA20","Diamond",2], ["Diamond DA50 RG","DA50","Diamond",5],
   ["Diamond DA42 Twin Star","DA42","Diamond",4],
   // --- Socata ---
   ["Socata TB10 Tobago","TB10","Socata",4], ["Socata TB9 Tampico","TB9","Socata",4],
   ["Socata TB20 Trinidad","TB20","Socata",4], ["Socata TB200 Tobago XL","TB200","Socata",4],
   ["Socata TB21 Trinidad TC","TB21","Socata",4], ["Socata ST10 Diplomate","ST10","Socata",4],
   ["Socata MS880 Rallye","RALLYE","Socata",2], ["Socata MS893 Rallye Commodore","RALLYE","Socata",4],
   ["Socata MS894 Minerva","RALLYE","Socata",4], ["Socata Rallye 235 Gabier","RALLYE","Socata",4],
   // --- Cirrus ---
   ["Cirrus SR20","CIRRUS SR20","Cirrus",4], ["Cirrus SR22","CIRRUS SR22","Cirrus",4],
   ["Cirrus SR22T","CIRRUS SR22","Cirrus",4],
   // --- Tecnam ---
   ["Tecnam P2008","TECNAM P2008","Tecnam",2], ["Tecnam P92 Echo","TECNAM P92","Tecnam",2],
   ["Tecnam P2010","TECNAM P2010","Tecnam",4], ["Tecnam P96 Golf","TECNAM P96","Tecnam",2],
   ["Tecnam P2002 Sierra","TECNAM P2002","Tecnam",2], ["Tecnam Astore","TECNAM ASTORE","Tecnam",2],
   // --- Beechcraft ---
   ["Beechcraft F33A Bonanza","BONANZA","Beechcraft",4], ["Beechcraft A36 Bonanza","BONANZA","Beechcraft",6],
   ["Beechcraft V35 Bonanza","BONANZA","Beechcraft",4], ["Beechcraft C23 Sundowner","SUNDOWNER","Beechcraft",4],
   ["Beechcraft C24R Sierra","SIERRA","Beechcraft",4], ["Beechcraft Musketeer","MUSKETEER","Beechcraft",4],
   // --- Mooney ---
   ["Mooney M20J 201","MOONEY M20","Mooney",4], ["Mooney M20K 231","MOONEY M20","Mooney",4],
   ["Mooney M20R Ovation","MOONEY M20","Mooney",4],
   // --- Aquila ---
   ["Aquila A210","AQUILA","Aquila",2], ["Aquila A211","AQUILA","Aquila",2],
   // --- Grumman ---
   ["Grumman AA-1 Yankee","AA1","Grumman",2], ["Grumman AA-1B Trainer","AA1","Grumman",2],
   ["Grumman AA-5 Traveler","AA5","Grumman",4], ["Grumman AA-5A Cheetah","AA5","Grumman",4],
   ["Grumman AA-5B Tiger","AA5","Grumman",4],
   // --- Nouvelle génération ---
   ["Elixir Aircraft Elixir","ELIXIR","Nouvelle génération",2], ["BRM Aero Bristell B23","BRISTELL","Nouvelle génération",2],
   ["Blackshape Prime","BLACKSHAPE","Nouvelle génération",2], ["Blackshape Gabriel","BLACKSHAPE","Nouvelle génération",2],
   ["Sling 2","SLING","Nouvelle génération",2], ["Sling 4","SLING","Nouvelle génération",4],
   ["JMB VL-3","VL3","Nouvelle génération",2], ["Shark Aero Shark","SHARK","Nouvelle génération",2],
   ["Risen Superveloce","RISEN","Nouvelle génération",2],
   // --- Kit ---
   ["Van's RV-4","RV4","Kit",2], ["Van's RV-6","RV6","Kit",2],
   ["Van's RV-7","RV7","Kit",2], ["Van's RV-8","RV8","Kit",2],
   ["Van's RV-9","RV9","Kit",2], ["Van's RV-10","RV10","Kit",4],
   ["Van's RV-14","RV14","Kit",2], ["Dyn'Aéro MCR-01","MCR01","Kit",2],
   ["Dyn'Aéro MCR-4S","MCR4S","Kit",4], ["Dyn'Aéro Banbi","BANBI","Kit",2],
   ["Zenair CH601 Zodiac","CH601","Kit",2], ["Zenair CH750 Cruzer","CH750","Kit",2],
   ["Europa XS","EUROPA","Kit",2], ["Glasair III","GLASAIR","Kit",2],
   // --- Brousse ---
   ["Aviat Husky A-1C","HUSKY","Brousse",2], ["Maule M-7","MAULE","Brousse",4],
   ["American Champion Scout","SCOUT","Brousse",2], ["CubCrafters Carbon Cub","CARBON CUB","Brousse",2],
   ["Zlin Savage Cub","SAVAGE","Brousse",2], ["Kitfox Series 7","KITFOX","Brousse",2],
   // --- ULM ---
   ["ULM (générique)","ULM","ULM",2], ["Atec Zephyr","ATEC","ULM",2],
   ["Aerospool Dynamic WT9","DYNAMIC","ULM",2], ["Evektor EuroStar SL","EUROSTAR","ULM",2],
   ["ICP Savannah","ICP SAVANNAH","ULM",2], ["Best Off SkyRanger","SKYRANGER","ULM",2],
   ["Pipistrel Virus SW","PIPISTREL","ULM",2], ["Pipistrel Alpha Trainer","PIPISTREL","ULM",2],
   ["Aeroprakt A22 Foxbat","AEROPRAKT","ULM",2], ["Fly Synthesis Texan","TEXAN","ULM",2],
   ["Alpi Pioneer 300","PIONEER","ULM",2], ["Flight Design CTLS","CTLS","ULM",2],
   ["TL-Ultralight Sting","STING","ULM",2], ["Rans S-6 Coyote","RANS","ULM",2],
   ["G1 Aviation G1 SPYL","G1","ULM",2], ["Humbert Tétras","TETRAS","ULM",2],
   ["Aeropilot Legend 540","LEGEND","ULM",2],
   // --- Classique ---
   ["Jodel D112","JODEL","Classique",2], ["Jodel D18","JODEL","Classique",2],
   ["Jodel D140 Mousquetaire","JODEL","Classique",4], ["Jodel DR1050 Ambassadeur","JODEL","Classique",4],
   ["Piel CP301 Emeraude","EMERAUDE","Classique",2], ["Gardan GY-80 Horizon","GY80","Classique",4],
   ["Wassmer WA-41 Baladou","WASSMER","Classique",4], ["Nord 1101 Noralpha","NORD","Classique",4],
   ["Nord 1002 Pingouin","NORD","Classique",4], ["Morane-Saulnier MS733 Alcyon","MORANE","Classique",2],
   ["Boisavia Mercurey","MERCUREY","Classique",4], ["Stampe SV4","STAMPE","Classique",2],
   ["Bücker Jungmann","JUNGMANN","Classique",2], ["De Havilland Tiger Moth","TIGER MOTH","Classique",2],
   // --- Voltige ---
   ["Mudry CAP 10B","CAP10","Voltige",2], ["Mudry CAP 20","CAP20","Voltige",1],
   ["Mudry CAP 21","CAP21","Voltige",1], ["CAP 231","CAP231","Voltige",1],
   ["CAP 232","CAP232","Voltige",1], ["Extra 300L","EXTRA 300","Voltige",2],
   ["Extra 330","EXTRA 330","Voltige",2], ["Pitts Special S-1","PITTS","Voltige",1],
   ["Pitts Special S-2","PITTS","Voltige",2], ["Christen Eagle II","EAGLE","Voltige",2],
   ["American Champion 8KCAB Decathlon","DECATHLON","Voltige",2], ["American Champion 7ECA Citabria","CITABRIA","Voltige",2],
   ["Zlin Z-142","ZLIN 142","Voltige",2], ["Zlin Z-50","ZLIN 50","Voltige",1],
   ["Sukhoi Su-26","SUKHOI","Voltige",1], ["Sukhoi Su-29","SUKHOI","Voltige",2],
   ["Yakovlev Yak-52","YAK 52","Voltige",2], ["Yakovlev Yak-18T","YAK 18","Voltige",4],
   // --- Planeur ---
   ["Planeur (générique)","PLANEUR","Planeur",1], ["Schleicher ASK 13","ASK13","Planeur",2],
   ["Schleicher ASK 21","ASK21","Planeur",2], ["Schleicher ASW 20","ASW20","Planeur",1],
   ["Schempp-Hirth Duo Discus","DUO DISCUS","Planeur",2], ["Schempp-Hirth Discus","DISCUS","Planeur",1],
   ["Schempp-Hirth Janus","JANUS","Planeur",2], ["Centrair Pégase","PEGASE","Planeur",1],
   ["Rolladen-Schneider LS4","LS4","Planeur",1], ["Motoplaneur","MOTOPLANEUR","Planeur",2],
   ["Diamond HK36 Super Dimona","DIMONA","Planeur",2], ["Scheibe SF25 Falke","FALKE","Planeur",2]
  ].map(function(a){ return {nom:a[0], abbr:a[1], fam:a[2], places:a[3]||4, kt:VITESSE[a[2]]||100}; });
  // Aucun avion présélectionné : le champ reste vide tant que l'élève n'a pas choisi.
  var acChoice=null;

  /* Autocomplétion générique, calquée sur setupAutocomplete() des aérodromes :
     même markup (.ac-list / .ac-item), même comportement clavier. */
  function autocomplete(input, list, data, label, code, onPick){
    var active=-1, items=[];
    function render(q){
      var nq=normalize(q);
      items=data.filter(function(d){ return normalize(label(d)).indexOf(nq)>=0 || normalize(code(d)).indexOf(nq)>=0; }).slice(0,40);
      list.innerHTML='';
      if(!nq){ list.classList.remove('open'); input.setAttribute('aria-expanded','false'); return; }
      if(!items.length) list.innerHTML='<div class="ac-empty">Aucun modèle trouvé</div>';
      items.forEach(function(d){
        var div=document.createElement('div');
        div.className='ac-item'; div.setAttribute('role','option');
        div.innerHTML='<span class="code">'+esc(code(d))+'</span> — '+esc(label(d));
        div.addEventListener('mousedown',function(ev){ ev.preventDefault(); pick(d); });
        list.appendChild(div);
      });
      active=-1; list.classList.add('open'); input.setAttribute('aria-expanded','true');
    }
    function pick(d){ input.value=label(d); list.classList.remove('open');
      input.setAttribute('aria-expanded','false'); onPick(d); }
    input.addEventListener('input',function(){ render(input.value); });
    input.addEventListener('focus',function(){ render(input.value||''); });
    input.addEventListener('blur',function(){ setTimeout(function(){ list.classList.remove('open'); },120); });
    input.addEventListener('keydown',function(e){
      var opts=[].slice.call(list.querySelectorAll('.ac-item'));
      if(e.key==='ArrowDown'){ e.preventDefault(); active=Math.min(active+1,opts.length-1); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); active=Math.max(active-1,0); }
      else if(e.key==='Enter'){ if(active>=0&&items[active]){ e.preventDefault(); pick(items[active]); } return; }
      else return;
      opts.forEach(function(o,i){ o.classList.toggle('active',i===active); });
      if(opts[active]) opts[active].scrollIntoView({block:'nearest'});
    });
    // Champ vide au clic : on déroule TOUTE la liste, groupée par constructeur,
    // pour pouvoir choisir à la souris sans rien taper.
    input.addEventListener('click',function(){ if(!input.value) ouvrirTout(); });
    function ouvrirTout(){
      items=data.slice();
      var html='', famPrec=null;
      items.forEach(function(d){
        if(d.fam && d.fam!==famPrec){ famPrec=d.fam; html+='<div class="ac-fam">'+esc(d.fam)+'</div>'; }
        html+='<div class="ac-item" role="option"><span class="code">'+esc(code(d))+'</span> — '+esc(label(d))+'</div>';
      });
      list.innerHTML=html;
      [].slice.call(list.querySelectorAll('.ac-item')).forEach(function(el,i){
        el.addEventListener('mousedown',function(ev){ ev.preventDefault(); pick(items[i]); });
      });
      active=-1; list.classList.add('open'); input.setAttribute('aria-expanded','true');
    }
    input.__ouvrirTout=ouvrirTout;
  }
  var acInput=document.getElementById('navAcft');
  acInput.value='';                       // aucun avion par défaut
  autocomplete(acInput, document.getElementById('navAcftList'), AIRCRAFT,
               function(d){return d.nom;}, function(d){return d.abbr;},
               function(d){ acChoice=d; acInput.classList.remove('champ-requis');
                            // mémorisée pour l'habillage de la radio des Scénarios
                            try{ var s=rtSettings(); s.derniereFamille=d.fam; rtSaveSettings(s); }catch(e){}
                            majPlaces();
                            try{ renderNavlog(); }catch(e){} });
  /* ---- Personnes à bord : le maximum est celui de l'appareil ----
     On pouvait embarquer neuf personnes dans un Cessna 152 — deux places. Le
     nombre de sièges est maintenant porté par chaque modèle (champ `places`),
     et c'est lui qui borne le champ. Sans avion choisi, on laisse 9 : c'est
     l'ancien comportement, et rien ne permet encore de trancher. */
  /* getElementById et non $v() : ce raccourci est déclaré plus bas, dans la
     section « Vol en direct ». À l'endroit où nous sommes, la variable existe
     (hoisting du var) mais vaut encore undefined — et le addEventListener
     ci-dessous s'exécute, lui, tout de suite. */
  function majPlaces(){
    var champ=document.getElementById('navPax'), note=document.getElementById('navPaxMax');
    if(!champ) return;
    var max = (acChoice && acChoice.places) ? acChoice.places : 9;
    champ.max = max;
    if(parseInt(champ.value,10) > max) champ.value = max;   // on ramène dans les clous
    if(parseInt(champ.value,10) < 1 || !champ.value) champ.value = 1;
    if(note) note.textContent = acChoice
      ? '(max. '+max+' — '+acChoice.nom+')'
      : '';
  }
  /* Saisie au clavier : on borne aussi à la sortie du champ, l'attribut max seul
     n'empêche pas de taper 9 dans un biplace. */
  document.getElementById('navPax').addEventListener('change', majPlaces);
  // Le champ est vidé à la main : on oublie la sélection précédente.
  acInput.addEventListener('input',function(){ if(!acInput.value.trim()){ acChoice=null; majPlaces(); } });
  // Petit bouton « dérouler » : rend le choix évident sans avoir à taper.
  var acOpen=document.getElementById('navAcftOpen');
  if(acOpen) acOpen.addEventListener('click',function(){
    if(acInput.value){ acInput.value=''; acChoice=null; }
    acInput.focus(); if(acInput.__ouvrirTout) acInput.__ouvrirTout();
  });

  // Niveau : 'debutant' (la consigne dit quoi transmettre) ou 'reel' (on indique
  // seulement qui appeler, comme dans les scénarios en mode Réel).
  var level='debutant';

  // ---- État ----
  var sel={dep:null,arr:null,alt:null}, mode='voyage', target='dep', map=null, markers={}, routeLine=null, zoneLayer=null, oaciLayer=null;
  // Pixel transparent 1×1 : évite les carrés « tuile manquante » là où la carte OACI
  // n'est pas encore couverte (seule la feuille Nord-Ouest est tuilée pour l'instant).
  var TRANSPARENT='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  var IN={dep:document.getElementById('navDep'),arr:document.getElementById('navArr'),alt:document.getElementById('navAlt')};

  // ---- Carte ----
  function initMap(){
    if(map) return;
    map=L.map('navMap',{zoomControl:true,attributionControl:true});
    // Cadrage sur la métropole : un setView([46.6,2.4],6) fixe recadrait mal la France
    // depuis que la carte est plus basse (340 px).
    map.fitBounds([[41.3,-5.4],[51.2,9.8]]);
    // Fond OpenStreetMap : SEULE partie du site qui sort sur Internet (cf. footer).
    var osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:17, attribution:'&copy; contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });
    // Carte OACI 1:500 000 du SIA (édition 2026) : mosaïque France des 4 feuilles
    // fournies, calées par points de contrôle et raccordées au milieu des recouvrements.
    // maxNativeZoom (et non maxZoom) : au-delà du zoom 11 Leaflet agrandit les tuiles
    // existantes au lieu de faire disparaître la couche.
    /* Tuiles de 2048 px, nommées à plat, réparties en DEUX dossiers.
       Une tuile de 2048 px couvre la même zone que 64 tuiles de 256 px, avec le même
       nombre de pixels au total : le détail est IDENTIQUE, seul le découpage change.
       On passe ainsi de plusieurs milliers de fichiers imbriqués à 142 fichiers à
       plat. L'interface web de GitHub n'acceptant que 100 fichiers par envoi, ils
       sont scindés en assets/oaci/ (grilles 2 à 7) et assets/oaci2/ (grille 8) :
       chacun s'envoie en une fois. Le routage est fait par OaciTiles.getTileUrl,
       défini juste après le chargement de Leaflet.
       tileSize 2048 + zoomOffset -3 : au zoom carte Z, Leaflet demande la grille Z-3,
       et le numéro de grille (2 à 8) donne le nom du fichier {grille}_{x}_{y}.
       minZoom 4 : sur un petit conteneur, fitBounds sur la France tombe au zoom 5 ;
       une couche démarrant plus haut resterait invisible. */
    oaciLayer=new OaciTiles('',{
      /* ATTENTION : min/maxNativeZoom s'expriment dans le zoom de la CARTE, pas dans
         celui de la grille. Les fichiers couvrent les grilles 2 à 8, soit les zooms
         carte 5 à 11 — d'où 5 et 11 ici. Hors de cette plage Leaflet demandait des
         tuiles inexistantes et la couche restait blanche.

         GEOREFERENCEMENT (refait le 04/09/2026). Le modele geometrique reste celui
         du 30/08 : les quatre planches sont ASSEMBLEES en une mosaique par
         transformation rigide dans le repere Lambert de la planche Nord-Ouest, puis
         cette mosaique est calee d'un bloc sur le QUADRILLAGE GEOGRAPHIQUE imprime
         (maille 1x1 degre) — Lambert conique conforme suivi d'une affine, sept
         parametres pour toute la France, 1,10 px RMS sur 94 intersections.

         CE QUI A CHANGE : les pixels ne viennent plus de la mosaique, qui n'avait
         ete assemblee qu'a 300 dpi, mais des QUATRE PLANCHES RENDUES A 600 dpi —
         la resolution a laquelle les PDF du SIA sont reellement graves (bandes
         JPEG de 13 065 px de large). C'est exactement le double, donc la grille 8
         (zoom carte 11) est desormais NATIVE au lieu d'etre un agrandissement.
         Chaque planche est calee sur la mosaique par une affine ajustee sur ~550
         vignettes recalees par correlation de phase (residu 0,15 px pour la
         planche Nord-Ouest, 0,17 Sud-Ouest, 0,53 Sud-Est, 1,40 Nord-Est) ; la
         methode retrouve le calage connu de la planche Nord-Ouest a 0,76 px pres.
         Le choix de la planche en chaque point est automatique : une planche n'est
         retenue que la ou elle CONCORDE avec la mosaique, ce qui ecarte d'un coup
         ses marges et les cartouches de legende imprimes par-dessus la carte. Les
         1,4 % de bandes de raccord restantes retombent sur la mosaique.
         Verification independante sur les symboles d'aerodrome (coordonnees AIP,
         370 terrains) : ecart median 0,94 px, soit 99 m — contre 136 m pour le jeu
         precedent mesure a l'identique.
         Deux zones absentes de la mosaique restent reprises directement des
         planches : la pointe du Finistere (Brest, Lanveoc, Ouessant) sur la planche
         Nord-Ouest, et le carton Corse sur la planche Sud-Est.
         Detail complet du modele et des mesures : assets/oaci/meta.json. */
      tileSize:2048, zoomOffset:-3,
      /* minZoom 5 : en dessous, une tuile de 2048 px réduite 16 fois n'est plus qu'un
         bruit gris — sur mobile la vue France entière tombe au zoom 4. On laisse
         alors le fond OpenStreetMap, net et lisible ; la carte OACI réapparaît dès
         qu'on zoome assez pour la déchiffrer. */
      minNativeZoom:5, maxNativeZoom:11,
      minZoom:5, maxZoom:17, errorTileUrl:TRANSPARENT,
      attribution:'Carte OACI 1:500 000 &mdash; SIA / DGAC, édition 2026'
    });
    /* Si les tuiles OACI ne sont pas publiées (téléversement incomplet), Leaflet
       n'affiche rien et l'utilisateur croit à un bug. On sonde UNE tuile de référence
       plutôt que d'écouter 'tileerror' : avec errorTileUrl, Leaflet émet aussi
       'tileload' pour l'image de remplacement, ce qui rendrait le comptage trompeur. */
    oaciSonde(oaciLayer, function(){
      if(map.hasLayer(oaciLayer)) map.removeLayer(oaciLayer);
      var b=document.getElementById('navBasemap');
      if(b){ b.classList.remove('on'); b.textContent='Fond OpenStreetMap'; b.disabled=true;
             b.title='Tuiles assets/oaci/ introuvables sur ce serveur'; }
      var h=$v('navZoomHint');
      if(h) h.textContent='Carte OACI indisponible ici : le dossier assets/oaci/ n’est pas publié. Fond OpenStreetMap utilisé.';
    });
    // OSM reste toujours dessous (repli hors couverture OACI) ; la carte OACI se
    // retire/remet via le bouton unique sous la carte, pas via un panneau de couches.
    osm.addTo(map); osm.setZIndex(1);
    // Fond par défaut choisi dans les Paramètres.
    if(rtSettings().basemap!=='osm'){ oaciLayer.addTo(map); oaciLayer.setZIndex(2); }
    else{
      var bb=document.getElementById('navBasemap');
      if(bb){ bb.classList.remove('on'); bb.textContent='Fond OpenStreetMap'; }
    }
    // Refléter l'état réel des calques sur les boutons de la barre d'outils.
    sec.querySelectorAll('[data-layer]').forEach(function(b){
      b.classList.toggle('on', !!layerOn[b.dataset.layer]);
    });
    zoneLayer=L.layerGroup().addTo(map);
    drawAirspace();
    map.on('zoomend',drawAirspace);   // densité des zones adaptée au niveau de zoom
    ADS.forEach(function(a){
      var m=L.marker([a.lat,a.lon],{icon:mkIcon(a.icao),title:a.icao+' — '+a.nom}).addTo(map);
      /* Contenu évalué à l'ouverture (et non figé à la création) : en vol, la bulle
         ne doit plus proposer de changer le départ ou l'arrivée. */
      m.bindPopup(function(){ return popupHtml(a); });
      markers[a.icao]=m;
    });
    // Délégation : les boutons des popups affectent le terrain au champ choisi.
    map.on('popupopen',function(e){
      var n=e.popup.getElement(); if(!n) return;
      n.querySelectorAll('[data-pick]').forEach(function(b){
        b.addEventListener('click',function(){ setSel(b.dataset.pick,b.dataset.icao); map.closePopup(); });
      });
    });
  }
  /* Marqueur : petite pastille VISIBLE au centre d'une zone cliquable BEAUCOUP plus
     large (28 px). Viser un point de 8 px à la souris — et plus encore au doigt —
     était pénible ; on garde donc le rendu discret mais on élargit la cible. */
  function mkIcon(icao){
    var role=(sel.dep===icao?' sel-dep':sel.arr===icao?' sel-arr':sel.alt===icao?' sel-alt':'');
    var s=role?14:9, Z=28;
    return L.divIcon({ className:'nav-adhit',
      html:'<span class="nav-admark'+role+'" style="width:'+s+'px;height:'+s+'px"></span>',
      iconSize:[Z,Z], iconAnchor:[Z/2,Z/2] });
  }
  function popupHtml(a){
    var f=Object.keys(a.freq).map(function(k){return k+' '+a.freq[k];}).join(' · ');
    var pistes=(a.pistes||[]).map(function(p){return p.ids.join('/');}).join(', ');
    var tete='<div class="nav-adpop"><b>'+a.icao+'</b> — '+esc(a.nom)+
      '<br><span class="pf">'+(f||'fréquences non publiées')+'</span>'+
      (pistes?'<br><span class="pf">Piste(s) '+pistes+'</span>':'');
    // Un vol est en cours : la carte n'est plus qu'un repère de situation.
    if(F.running) return tete+'</div>';
    return tete+
      '<br><button data-pick="dep" data-icao="'+a.icao+'">Départ</button> '+
      '<button data-pick="arr" data-icao="'+a.icao+'" class="nav-only-voyage">Arrivée</button> '+
      '<button data-pick="alt" data-icao="'+a.icao+'" class="nav-only-voyage">Dégagement</button></div>';
  }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  /* Symbologie inspirée des cartes aéronautiques VFR (nous ne pouvons pas reproduire la
     carte OACI officielle, cf. avertissement) : le CTR ressort en trait plein soutenu,
     les TMA/CTA en trait fin, les zones réglementées en hachuré rouge. */
  function styleFor(t){
    if(t==='CTR') return {color:'#3a2fa8',weight:1.8,opacity:.95,fillColor:'#5b4bce',fillOpacity:.10};
    if(t==='TMA'||t==='CTA') return {color:'#2f6fa8',weight:1.1,opacity:.75,dashArray:'6 3',
                                     fillColor:'#3884c4',fillOpacity:.045};
    return {color:'#b03a3a',weight:1.1,opacity:.8,dashArray:'3 3',fillColor:'#c74a4a',fillOpacity:.06};
  }
  /* Plancher/plafond lisibles : 0 est une valeur VALIDE (surface) — l'écrire « ? »
     à cause d'un test de véracité JavaScript était une erreur d'affichage. */
  function altTxt(v){
    if(v===0) return 'SFC';
    if(typeof v!=='number') return '?';
    return v>=1000 ? v.toLocaleString('fr-FR') : String(v);
  }
  function grpOf(t){ return (t==='CTR')?'ctr':((t==='TMA'||t==='CTA')?'tma':'rpd'); }

  // Couches visibles : les zones R/P/D sont masquées par défaut — les afficher toutes
  // en même temps que les TMA rendait la carte de France totalement illisible.
  // Défauts repris des Paramètres s'ils existent (clé partagée rt-settings).
  var layerOn=(function(){
    var L=(rtSettings().layers)||{};
    return {ctr: L.ctr!==false, tma: L.tma!==false, rpd: L.rpd===true};
  })();
  // Sous le zoom 7, seuls les CTR sont tracés : à l'échelle de la France, 1 189 polygones
  // superposés forment une bouillie. On densifie au fur et à mesure du zoom.
  function zoomAllows(g,z){
    if(z<7) return g==='ctr';
    if(z<9) return g!=='rpd';
    return true;
  }
  function drawAirspace(){
    if(!map) return;
    /* La carte OACI DESSINE DÉJÀ tous les espaces, avec leurs limites, classes et
       fréquences. Superposer nos polygones par-dessus rendait la région parisienne
       illisible (empilement des TMA en aplats colorés). On ne les trace donc que sur
       le fond OpenStreetMap, qui lui ne porte aucune information aéronautique. */
    if(oaciLayer && map.hasLayer(oaciLayer)){
      zoneLayer.clearLayers();
      var hh=$v('navZoomHint');
      if(hh) hh.textContent='Espaces aériens lus directement sur la carte OACI.';
      return;
    }
    // Espaces aériens absents : le reste de la page (terrains, route, vol) reste
    // parfaitement utilisable, on le signale simplement au lieu de rester muet.
    if(typeof NAV_AIRSPACE==='undefined'){
      var h0=$v('navZoomHint');
      if(h0) h0.textContent='Espaces aériens indisponibles (assets/airspace.js non chargé).';
      sec.querySelectorAll('[data-layer]').forEach(function(b){ b.disabled=true; b.classList.remove('on'); });
      return;
    }
    zoneLayer.clearLayers();
    var z=map.getZoom(), shown=0;
    L.geoJSON(NAV_AIRSPACE,{
      filter:function(f){
        // Une entrée du jeu SIA est un Point : L.geoJSON en ferait un marqueur bleu
        // par défaut (le « pin » parasite au milieu de la carte). On l'écarte.
        if(!f.geometry || f.geometry.type==='Point') return false;
        var g=grpOf(f.properties.t);
        if(!layerOn[g] || !zoomAllows(g,z)) return false;
        shown++; return true;
      },
      style:function(f){ return styleFor(f.properties.t); },
      onEachFeature:function(f,l){
        var p=f.properties;
        l.bindPopup('<b>'+esc(p.n)+'</b><br>'+p.t+(p.c?' — classe '+p.c:'')+
          '<br><span class="pf">'+altTxt(p.lo)+' → '+altTxt(p.up)+' ft</span>');
        // Étiquette façon carte aéronautique : nom + plancher/plafond, à partir du
        // zoom 9 seulement (au-delà, les libellés se chevauchent et brouillent la carte).
        if(z>=9 && l.getBounds){
          l.bindTooltip(esc(p.n)+(p.c?' ('+p.c+')':'')+'<br>'+altTxt(p.up)+' / '+altTxt(p.lo),
            {permanent:true, direction:'center', className:'nav-zlabel'});
        }
      }
    }).addTo(zoneLayer);
    var h=$v('navZoomHint');
    if(h){
      var t=shown+' zone'+(shown>1?'s':'')+' affichée'+(shown>1?'s':'');
      if(z<5 && map.hasLayer(oaciLayer)) t+=' · zoomez pour afficher la carte OACI';
      else if(z<9) t+=' · zoomez pour en voir davantage';
      h.textContent=t;
    }
  }

  // ---- Sélection ----
  function setSel(slot,icao){
    if(F.running) return;      // en vol, le plan est figé
    if(mode==='local' && slot!=='dep') return;
    var prev=sel[slot];
    // Un même terrain ne peut pas occuper deux rôles.
    ['dep','arr','alt'].forEach(function(s){ if(s!==slot && sel[s]===icao) { sel[s]=null; IN[s].value=''; refreshIcon(icao); } });
    sel[slot]=icao||null;
    IN[slot].value=icao||'';
    if(prev) refreshIcon(prev);
    if(icao) refreshIcon(icao);
    advanceTarget(slot);
    redraw();
  }
  function refreshIcon(icao){ if(markers[icao]) markers[icao].setIcon(mkIcon(icao)); }
  function advanceTarget(justFilled){
    var order=(mode==='local')?['dep']:['dep','arr','alt'];
    var i=order.indexOf(justFilled);
    var next=order.slice(i+1).find(function(s){return !sel[s];})||order.find(function(s){return !sel[s];});
    setTarget(next||justFilled);
  }
  function setTarget(slot){
    target=slot;
    sec.querySelectorAll('.nav-form .field[data-slot]').forEach(function(f){
      f.classList.toggle('targeting', f.dataset.slot===slot);
    });
  }

  // ---- Route + espaces traversés ----
  // Plan d'évitement courant (calculé à la configuration, réutilisé au démarrage).
  var planCourant=null;
  function majPlan(){
    planCourant=null;
    if(mode!=='voyage'||!sel.dep||!sel.arr||!BY[sel.dep]||!BY[sel.arr]) return;
    planCourant=eviterClasseA(BY[sel.dep],BY[sel.arr],ftOf($v('navFl').value)||3500);
  }
  function redraw(){
    if(!map) return;
    if(routeLine){ map.removeLayer(routeLine); routeLine=null; }
    majPlan();
    var pts=[];
    if(sel.dep&&BY[sel.dep]) pts.push([BY[sel.dep].lat,BY[sel.dep].lon]);
    if(mode==='voyage'&&sel.arr&&BY[sel.arr]) pts.push([BY[sel.arr].lat,BY[sel.arr].lon]);
    /* Contournement visible sur la carte, en configuration comme en vol : on trace la
       route RÉELLEMENT suivie, pas la ligne droite d'origine. */
    var via = (F.ctx && F.running) ? F.ctx.via : (planCourant?planCourant.via:null);
    if(pts.length===2 && via) pts=[pts[0],[via.lat,via.lon],pts[1]];
    if(pts.length>=2){
      routeLine=L.layerGroup().addTo(map);
      if(via){
        // Route directe rappelée en gris fin, pour montrer ce qui a été évité.
        L.polyline([pts[0],pts[pts.length-1]],
          {color:'#9aa2b8',weight:1.4,dashArray:'3 5',opacity:.75}).addTo(routeLine);
        L.circleMarker([via.lat,via.lon],{radius:5,color:'#d9534f',weight:2,
          fillColor:'#fff',fillOpacity:1}).addTo(routeLine)
          .bindTooltip('Point de contournement (classe A)',{direction:'top'});
      }
      /* Liseré blanc sous le trait : sur la carte OACI, très chargée, un trait fin
         rouge se confond avec les limites de zones déjà imprimées. */
      L.polyline(pts,{color:'#fff',weight:6,opacity:.9}).addTo(routeLine);
      var trace=L.polyline(pts,{color:'#d9534f',weight:3,dashArray:'8 5'}).addTo(routeLine);
      map.fitBounds(trace.getBounds(),{padding:[45,45]});
    } else if(pts.length===1){ map.setView(pts[0],10); }
    renderZones();
  }

  // Point-dans-polygone (ray casting), en degrés lon/lat.
  function inRing(lon,lat,ring){
    var c=false;
    for(var i=0,j=ring.length-1;i<ring.length;j=i++){
      var xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
      if(((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/(yj-yi)+xi)) c=!c;
    }
    return c;
  }
  function inPoly(lon,lat,geom){
    var polys=(geom.type==='Polygon')?[geom.coordinates]:geom.coordinates;
    for(var p=0;p<polys.length;p++){
      var rings=polys[p];
      if(!rings.length||!inRing(lon,lat,rings[0])) continue;
      var hole=false;
      for(var r=1;r<rings.length;r++){ if(inRing(lon,lat,rings[r])){hole=true;break;} }
      if(!hole) return true;
    }
    return false;
  }
  function ftOf(v){ var n=parseFloat(v); return isNaN(n)?null:n; }

  // Échantillonne la route et retourne les zones survolées, filtrées par la tranche
  // d'altitude choisie. APPROXIMATIF : segment droit en lat/lon, pas de grand cercle,
  // pas de gestion des références SFC/FL — purement informatif (cf. avertissement UI).
  /* ================= ÉVITEMENT DE LA CLASSE A =================
     Le VFR est interdit en classe A. Plutôt que de laisser voler dans un espace
     interdit, on cherche un contournement et on prévient l'élève.
     Stratégie, dans cet ordre :
       1) changer d'ALTITUDE (le plus simple : passer sous le plancher de la zone) ;
       2) à défaut, DÉCALER la route latéralement via un point intermédiaire.
     Si aucune des deux ne marche, on le dit franchement plutôt que d'inventer. */

  // Échantillons le long d'une route éventuellement brisée par un point intermédiaire.
  function echRoute(a,b,via,n){
    var pts=via?[a,via,b]:[a,b], out=[];
    for(var s=0;s<pts.length-1;s++){
      var p=pts[s], q=pts[s+1];
      for(var i=0;i<=n;i++){
        var t=i/n;
        out.push([p.lon+(q.lon-p.lon)*t, p.lat+(q.lat-p.lat)*t]);
      }
    }
    return out;
  }
  // Zones de classe A rencontrées à une altitude donnée.
  function classeASur(a,b,via,alt){
    if(typeof NAV_AIRSPACE==='undefined') return [];
    var ech=echRoute(a,b,via,60), hit=[];
    NAV_AIRSPACE.features.forEach(function(f){
      var p=f.properties;
      if(p.c!=='A') return;
      if(typeof p.lo==='number' && alt<p.lo) return;
      if(typeof p.up==='number' && alt>p.up) return;
      for(var s=0;s<ech.length;s++){
        if(inPoly(ech[s][0],ech[s][1],f.geometry)){ hit.push(p); return; }
      }
    });
    return hit;
  }
  /* Recherche d'une altitude libre, en s'éloignant progressivement de celle demandée
     (on privilégie une altitude proche, et plutôt plus basse : passer SOUS un TMA est
     la manœuvre habituelle en VFR). */
  function altitudeLibre(a,b,via,voulue,plancher){
    plancher = plancher || 1500;      // en dessous, une croisière n'est plus réaliste
    var cands=[];
    for(var d=500; d<=6000; d+=500){
      if(voulue-d>=plancher) cands.push(voulue-d);
      if(voulue+d<=9500) cands.push(voulue+d);
    }
    for(var i=0;i<cands.length;i++){
      if(classeASur(a,b,via,cands[i]).length===0) return cands[i];
    }
    return null;
  }
  /* Décalage latéral : on déporte un point de la route perpendiculairement,
     d'abord à gauche puis à droite, par pas de 5 NM.
     Le point déplacé n'est plus seulement le MILIEU : déporter le milieu ne
     courbe la route qu'en son centre, et ne sert à rien quand la zone mord près
     d'une extrémité. On essaie donc trois points d'appui (au tiers, au milieu,
     aux deux tiers) et on va jusqu'à 120 NM — l'ordre de grandeur d'un vrai
     contournement de la TMA parisienne. */
  function decalageLibre(a,b,alt){
    var appuis=[0.34, 0.5, 0.66];
    for(var nm=5; nm<=120; nm+=5){
      for(var ai=0; ai<appuis.length; ai++){
        var t=appuis[ai];
        var plat=a.lat+(b.lat-a.lat)*t, plon=a.lon+(b.lon-a.lon)*t;
        var mlat=(a.lat+b.lat)/2;
        var dy=b.lat-a.lat, dx=(b.lon-a.lon)*Math.cos(mlat*Math.PI/180);
        var L=Math.sqrt(dx*dx+dy*dy) || 1;
        var px=-dy/L, py=dx/L;                   // vecteur perpendiculaire unitaire
        var ddeg=nm/60;                          // 1 NM ≈ 1/60 degré de latitude
        var essais=[
          {lat:plat+py*ddeg, lon:plon+px*ddeg/Math.cos(mlat*Math.PI/180), cote:'gauche'},
          {lat:plat-py*ddeg, lon:plon-px*ddeg/Math.cos(mlat*Math.PI/180), cote:'droite'}
        ];
        for(var k=0;k<essais.length;k++){
          if(classeASur(a,b,essais[k],alt).length===0)
            return {via:essais[k], nm:nm, cote:essais[k].cote};
        }
      }
    }
    return null;
  }
  /* Un terrain est-il LUI-MÊME sous une classe A à cette altitude ? C'est le cas
     décisif : si le départ ou l'arrivée est dans la zone, aucun contournement
     latéral n'existe — la route ne peut pas éviter ses propres extrémités. On
     doit alors le DIRE, et non bricoler une altitude. */
  function terrainSousClasseA(ad, alt){
    if(typeof NAV_AIRSPACE==='undefined'||!ad) return false;
    var dedans=false;
    NAV_AIRSPACE.features.forEach(function(f){
      if(dedans) return;
      var p=f.properties;
      if(p.c!=='A') return;
      if(typeof p.lo==='number' && alt<p.lo) return;
      if(typeof p.up==='number' && alt>p.up) return;
      if(inPoly(ad.lon,ad.lat,f.geometry)) dedans=true;
    });
    return dedans;
  }
  /* Plan d'évitement : renvoie l'altitude et le point intermédiaire à retenir,
     plus un message expliquant la modification.

     CE QUI A CHANGÉ, ET POURQUOI. L'ancienne version finissait, faute de mieux,
     par ramener la croisière à 1 000 pieds. Sur un Paris-Orly ↔ Roissy elle
     produisait donc un vol « légal » à 1 000 ft au-dessus de Paris : sous la TMA
     classe A, certes, mais bien au-dessous de la hauteur de survol d'une
     agglomération — c'est-à-dire illégal autrement. Une solution qui n'en est pas
     une vaut moins que l'aveu qu'il n'y en a pas.

     L'ordre est désormais :
       1. une altitude praticable (≥ 1 500 ft) sans toucher à la route ;
       2. un CONTOURNEMENT à l'altitude demandée ;
       3. un contournement à une autre altitude praticable ;
       4. sinon on explique, sans rien inventer — et l'on distingue le cas où les
          terrains eux-mêmes sont sous la zone, où aucun contournement n'existe.
     Le repli à 1 000 pieds a été retiré : ne pas le remettre. */
  function eviterClasseA(a,b,alt){
    var zones=classeASur(a,b,null,alt);
    if(!zones.length) return {alt:alt, via:null, msg:null};
    var noms=[].concat(zones).map(function(z){return z.n;}).filter(function(v,i,t){return t.indexOf(v)===i;});
    var liste=noms.slice(0,3).join(', ')+(noms.length>3?'…':'');
    var estSont=(noms.length>1?' sont':' est');
    var entete='Trajet modifié : '+liste+estSont+' en classe A, interdite au VFR. ';

    // 1) Passer dessous (ou dessus) sans dévier : la manœuvre VFR ordinaire.
    var alt2=altitudeLibre(a,b,null,alt,1500);
    if(alt2!==null){
      return {alt:alt2, via:null,
        msg:entete+'Altitude de croisière ramenée de '+alt+' à '+alt2+' pieds pour passer '+
            (alt2<alt?'dessous':'au-dessus')+'.'};
    }
    // 2) Contourner, à l'altitude demandée.
    var d=decalageLibre(a,b,alt);
    if(d){
      return {alt:alt, via:d.via,
        msg:entete+'Aucune altitude praticable ne permettait de l\'éviter : la route '+
            'contourne la zone par la '+d.cote+', avec un écart d\'environ '+d.nm+' NM.'};
    }
    // 3) Contourner à une autre altitude praticable.
    for(var essai=2000; essai<=9500; essai+=500){
      if(essai===alt) continue;
      var d2=decalageLibre(a,b,essai);
      if(d2) return {alt:essai, via:d2.via,
        msg:entete+'Ni l\'altitude ni la route seules ne suffisaient : la croisière passe '+
            'à '+essai+' pieds ET la route contourne la zone par la '+d2.cote+
            ' (écart d\'environ '+d2.nm+' NM).'};
    }
    // 4) Aucun contournement n'existe. On le dit — surtout si ce sont les
    //    terrains eux-mêmes qui sont sous la zone.
    var depDedans=terrainSousClasseA(a,alt), arrDedans=terrainSousClasseA(b,alt);
    if(depDedans || arrDedans){
      var lequel = (depDedans&&arrDedans) ? 'Le départ et l\'arrivée sont'
                 : (depDedans ? 'Le terrain de départ est' : 'Le terrain d\'arrivée est');
      return {alt:alt, via:null,
        msg:'Attention : '+liste+estSont+' en classe A, interdite au VFR, et '+
            lequel.charAt(0).toLowerCase()+lequel.slice(1)+' dessous. Aucun contournement '+
            'n\'est possible : on ne contourne pas une zone dans laquelle on décolle ou '+
            'se pose. En vol réel, ce trajet se fait par les itinéraires VFR publiés ou '+
            'sur clairance spéciale de l\'organisme. L\'exercice se déroulera quand même, '+
            'à l\'altitude demandée — mais sachez qu\'il ne serait pas autorisé tel quel.'};
    }
    return {alt:alt, via:null,
      msg:'Attention : '+liste+estSont+' en classe A, interdite au VFR, et aucune altitude '+
          'ni aucun contournement ne permet de l\'éviter ici. En vol réel, ce trajet passe '+
          'par une route VFR publiée ou une clairance spéciale. Choisissez d\'autres terrains.'};
  }

  function zonesOnRoute(){
    if(typeof NAV_AIRSPACE==='undefined'||!sel.dep||!BY[sel.dep]) return [];
    var a=BY[sel.dep], b=(mode==='voyage'&&sel.arr&&BY[sel.arr])?BY[sel.arr]:null;
    var N=b?160:1, samples=[];
    for(var i=0;i<=N;i++){
      var t=b?i/N:0;
      samples.push([a.lon+(b?(b.lon-a.lon)*t:0), a.lat+(b?(b.lat-a.lat)*t:0)]);
    }
    var cruise=ftOf(document.getElementById('navFl').value)||3500;
    var hit=[];
    NAV_AIRSPACE.features.forEach(function(f){
      var lo=ftOf(f.properties.lo), up=ftOf(f.properties.up);
      // On garde la zone si la croisière tombe dans sa tranche, ou si la tranche est inconnue.
      if(lo!==null&&up!==null&&(cruise<lo||cruise>up)) return;
      for(var s=0;s<samples.length;s++){
        if(inPoly(samples[s][0],samples[s][1],f.geometry)){ hit.push(f.properties); return; }
      }
    });
    var rank={CTR:0,TMA:1,CTA:2,R:3,P:4,D:5};
    return hit.sort(function(x,y){ return (rank[x.t]-rank[y.t])||(x.n<y.n?-1:1); });
  }

  // Fréquence pertinente : celle du terrain de départ/arrivée si la zone porte son nom.
  function freqForZone(z){
    var n=(z.n||'').toUpperCase();
    var cand=[sel.dep,sel.arr,sel.alt].filter(Boolean).map(function(i){return BY[i];}).filter(Boolean);
    for(var i=0;i<cand.length;i++){
      var base=cand[i].nom.toUpperCase().split(/[\s\-–]/)[0];
      if(base.length>3 && n.indexOf(base)>=0){
        var f=cand[i].freq;
        var k=(z.t==='CTR')?(f.TWR||f.AFIS||f.APP):(f.APP||f.TWR);
        if(k) return {icao:cand[i].icao,mhz:k};
      }
    }
    return null;
  }

  /* Distance orthodromique, route vraie et durée estimée à la vitesse de croisière
     du modèle choisi. Purement indicatif : pas de vent, pas de déclinaison. */
  function distNM(a,b){
    var R=3440.065, r=function(x){return x*Math.PI/180;};
    var dl=r(b.lat-a.lat), dg=r(b.lon-a.lon);
    var x=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dg/2)*Math.sin(dg/2);
    return 2*R*Math.asin(Math.sqrt(x));
  }
  function routeVraie(a,b){
    var r=function(x){return x*Math.PI/180;}, d=function(x){return x*180/Math.PI;};
    var dg=r(b.lon-a.lon);
    var y=Math.sin(dg)*Math.cos(r(b.lat));
    var x=Math.cos(r(a.lat))*Math.sin(r(b.lat))-Math.sin(r(a.lat))*Math.cos(r(b.lat))*Math.cos(dg);
    return (d(Math.atan2(y,x))+360)%360;
  }
  function renderNavlog(){
    var box=$v('navNavlog');
    if(mode!=='voyage'||!sel.dep||!sel.arr||!BY[sel.dep]||!BY[sel.arr]){ box.hidden=true; return; }
    var a=BY[sel.dep], b=BY[sel.arr];
    var nm=distNM(a,b), cap=Math.round(routeVraie(a,b));
    var kt=acChoice?acChoice.kt:110;
    var min=Math.round(nm/kt*60);
    var hh=Math.floor(min/60), mm=min%60;
    box.hidden=false;
    box.innerHTML=
      '<div><dt>Distance</dt><dd>'+Math.round(nm)+' <small>NM</small></dd></div>'+
      '<div><dt>Route vraie</dt><dd>'+String(cap).padStart(3,'0')+'°</dd></div>'+
      '<div><dt>Durée estimée</dt><dd>'+(hh?hh+' h ':'')+mm+' <small>min'+
        (acChoice?' à '+kt+' kt':' (choisissez un avion)')+'</small></dd></div>';
  }

  function renderZones(){
    renderNavlog();
    var box=document.getElementById('navZones');
    if(!sel.dep){ box.innerHTML='<p class="nav-empty">Choisissez un aérodrome de départ.</p>'; return; }
    if(mode==='voyage'&&!sel.arr){ box.innerHTML='<p class="nav-empty">Choisissez un aérodrome d\'arrivée.</p>'; return; }
    var z=zonesOnRoute();
    if(!z.length){ box.innerHTML='<p class="nav-empty">Aucun espace contrôlé recensé à '+
      (ftOf(document.getElementById('navFl').value)||3500)+' ft sur cette route.</p>'; return; }
    /* Classe A : le VFR y est interdit (seul l'IFR y est admis). Si la route traverse
       une telle zone à l'altitude choisie, on le signale — c'est une impossibilité
       réglementaire, pas un simple détail de fréquence. */
    /* Classe A : le VFR y est interdit. On annonce dès la configuration la correction
       qui sera appliquée au démarrage, pour que l'élève sache à quoi s'attendre. */
    var clA=z.filter(function(p){ return p.c==='A'; });
    var avert='';
    if(clA.length && sel.arr && BY[sel.arr]){
      var plan=eviterClasseA(BY[sel.dep], BY[sel.arr], ftOf($v('navFl').value)||3500);
      avert='<div class="nav-zonewarn"><b>Classe A sur la route — interdite au VFR.</b> '+
            esc(plan.msg? plan.msg.replace(/^Trajet légèrement modifié : /,'') :
                'Le trajet sera ajusté au démarrage.')+'</div>';
    }
    box.innerHTML=avert+z.map(function(p){
      var cls=(p.t==='CTR')?'':(p.t==='TMA'||p.t==='CTA')?'z-tma':'z-rpd';
      var f=freqForZone(p);
      return '<div class="nav-zone '+cls+'"><b>'+esc(p.n)+'</b>'+
        '<span class="zmeta">'+p.t+(p.c?' · classe '+p.c:'')+' · '+altTxt(p.lo)+'→'+altTxt(p.up)+' ft'+
        (f?' · <span class="zfreq">'+f.mhz+'</span> ('+f.icao+')':'')+'</span></div>';
    }).join('');
  }

  // ---- Saisie texte ----
  Object.keys(IN).forEach(function(slot){
    IN[slot].addEventListener('focus',function(){ setTarget(slot); });
    IN[slot].addEventListener('change',function(){
      var v=IN[slot].value.trim().toUpperCase();
      if(!v){ sel[slot]=null; redraw(); return; }
      var a=BY[v]||ADS.find(function(x){ return x.nom.toUpperCase().indexOf(v)>=0; });
      if(a) setSel(slot,a.icao); else { IN[slot].value=''; sel[slot]=null; redraw(); }
    });
  });
  document.getElementById('navFl').addEventListener('change',renderZones);

  // Bascule du fond de carte : un seul bouton qui alterne OACI ↔ OpenStreetMap.
  var basemapBtn=document.getElementById('navBasemap');
  if(basemapBtn) basemapBtn.addEventListener('click',function(){
    if(!map||!oaciLayer) return;
    var on=map.hasLayer(oaciLayer);
    if(on) map.removeLayer(oaciLayer); else { oaciLayer.addTo(map); oaciLayer.setZIndex(2); }
    basemapBtn.classList.toggle('on',!on);
    basemapBtn.textContent = on ? 'Fond OpenStreetMap' : 'Carte OACI';
    // En vol, repasser sur la carte OACI au zoom 11 la rendrait floue : on recale.
    if(F.running && map.getZoom()>zoomVol()) map.setZoom(zoomVol());
    drawAirspace();   // l'un dessine les espaces, l'autre non
  });

  // Niveau Débutant / Réel.
  sec.querySelectorAll('[data-diff]').forEach(function(b){
    b.addEventListener('click',function(){
      level=b.dataset.diff;
      sec.querySelectorAll('[data-diff]').forEach(function(x){ x.classList.toggle('active',x===b); });
      $v('navDiffNote').textContent = (level==='reel')
        ? "Le contrôleur n'est plus écrit : vous l'écoutez, et vous pouvez le réécouter. "+
          "La consigne ne subsiste qu'au premier contact avec un organisme."
        : "Le contrôleur est écrit, et la consigne détaille ce que vous devez dire.";
      if(F.running) renderStep();
    });
  });

  // Bascules d'affichage des familles de zones sur la carte.
  sec.querySelectorAll('[data-layer]').forEach(function(b){
    b.addEventListener('click',function(){
      var k=b.dataset.layer;
      layerOn[k]=!layerOn[k];
      b.classList.toggle('on',layerOn[k]);
      drawAirspace();
    });
  });

  // Clic sur la carte hors marqueur : rien (évite les sélections accidentelles).
  sec.querySelectorAll('[data-volmode]').forEach(function(b){
    b.addEventListener('click',function(){
      mode=b.dataset.volmode;
      sec.querySelectorAll('[data-volmode]').forEach(function(x){ x.classList.toggle('active',x===b); });
      document.body.classList.toggle('volmode-local',mode==='local');
      if(mode==='local'){
        ['arr','alt'].forEach(function(s){ var p=sel[s]; sel[s]=null; IN[s].value=''; if(p) refreshIcon(p); });
        setTarget('dep');
      }
      redraw();
    });
  });

  /* ================= VOL EN DIRECT (Phase 2) =================
     TOUTE la phraséologie ci-dessous est reprise du Manuel de phraséologie DSNA
     (10ᵉ éd., 15 avril 2023) — le champ `src` donne la page IMPRIMÉE de chaque échange.
     Rien n'est inventé. Les exemples du manuel qui utilisent un indicatif de compagnie
     (« Rapidair 3245 ») sont transposés à l'indicatif du joueur : c'est une substitution
     d'indicatif, pas une réécriture de la phraséologie.

     Le moteur des Exercices est réutilisé tel quel : fuzzyCorrect() pour la correction
     des erreurs de reconnaissance, mcFound() pour la détection des mots-clés,
     speakATC() pour la voix du contrôleur, bindPushToTalk() pour le PTT. */
  var recap=document.getElementById('navRecap'), body=document.getElementById('navRecapBody');
  var F={ steps:[], i:0, results:[], dits:[], attendus:[], ctx:null, running:false, planeMk:null, animT:null };
  var $v=function(id){ return document.getElementById(id); };

  /* ---- Services d'information de vol (SIV) ----
     FRÉQUENCES : relevées sur la carte OACI 1:500 000 du SIA (édition 2026), boîtes
     vertes « SIV … ». Ce sont des valeurs officielles, lues une par une.
     POSITIONS : centres approximatifs du secteur desservi. La carte ne fournit pas les
     contours des SIV sous forme exploitable (le jeu SIA converti n'en contient aucun),
     on retient donc le SIV dont le centre est le plus proche du point survolé.
     La découpe réelle est plus fine — c'est une approximation assumée, qui reste
     infiniment plus juste que de garder l'approche du terrain de départ sur 700 km. */
  var SIV=[
    {n:'Lille Information',       f:'126.480', lat:50.45, lon:3.10},
    {n:'Cotentin Information',    f:'120.350', lat:49.10, lon:-0.80},
    {n:'Beauvais Information',    f:'119.800', lat:49.40, lon:2.55},
    {n:'Seine Information',       f:'120.325', lat:48.90, lon:3.45},
    {n:'Seine Information',       f:'120.325', lat:48.85, lon:4.40},
    {n:'Strasbourg Information',  f:'119.450', lat:48.70, lon:6.90},
    {n:'Nord Rennes Information', f:'126.950', lat:48.30, lon:-1.70},
    {n:'Iroise Information',      f:'119.575', lat:48.30, lon:-4.30},
    {n:'Sud Rennes Information',  f:'134.000', lat:47.85, lon:-1.20},
    {n:'Bâle Information',        f:'135.850', lat:47.40, lon:5.60},
    {n:'Seine Information',       f:'127.815', lat:47.35, lon:1.50},
    {n:'Nantes Information',      f:'122.800', lat:47.20, lon:-1.60},
    {n:'Poitiers Information',    f:'124.000', lat:46.60, lon:0.30},
    {n:'Limoges Information',     f:'124.050', lat:45.90, lon:1.40},
    {n:'Lyon Information',        f:'135.200', lat:45.85, lon:4.60},
    {n:'Lyon Information',        f:'135.530', lat:45.85, lon:5.40},
    {n:'Clermont Information',    f:'119.375', lat:45.50, lon:3.20},
    {n:'Aquitaine Information',   f:'120.575', lat:44.60, lon:0.40},
    {n:'Marseille Information',   f:'124.500', lat:44.00, lon:4.50},
    {n:'Toulouse Information',    f:'121.250', lat:43.80, lon:1.30},
    {n:'Provence Information',    f:'126.260', lat:43.70, lon:5.50},
    {n:'Nice Information',        f:'120.850', lat:43.60, lon:7.00},
    {n:'Nice Information',        f:'124.425', lat:43.50, lon:6.30},
    {n:'Biarritz Information',    f:'119.175', lat:43.35, lon:-1.40},
    {n:'Pyrénées Information',    f:'126.525', lat:43.15, lon:-0.90}
  ];
  /* ---- Aléas en croisière (manuel DSNA, chapitre Information de vol p. 205-213) ----
     Messages repris du manuel ; seuls les noms de lieux sont adaptés à la route.
     {LIEU} est remplacé par une localité proche du point survolé. */
  var ALEAS=[
    { ph:'Météo en route', src:'p. 209',
      atc:"{CALL}, stratus signalés dans la région de {LIEU}.",
      consigne:"Accusez réception de l'information météo.",
      reel:"Accusez réception.",
      attendu:"Roger, {CALL}.",
      mots:[{label:'Accusé de réception',variantes:['roger','recu','bien recu','copie']},
            {label:'Votre indicatif',ref:'callsign'}] },
    { ph:'Zone réglementée', src:'p. 208',
      atc:"{CALL}, {ZONE} active.",
      consigne:"Accusez réception : la zone est active, vous devrez la contourner.",
      reel:"Accusez réception.",
      attendu:"Roger, {CALL}.",
      mots:[{label:'Accusé de réception',variantes:['roger','recu','bien recu','copie','evite','contourne']},
            {label:'Votre indicatif',ref:'callsign'}] },
    { ph:'Trafic inconnu', src:'p. 211',
      atc:"{CALL}, trafic, {TRAFIC}.",
      consigne:"Répondez : « trafic en vue » si vous le voyez, sinon « négatif » ou « pas en vue ».",
      reel:"Répondez à l'information de trafic.",
      attendu:"Trafic en vue, {CALL}.",
      mots:[{label:'Réponse trafic',variantes:['trafic en vue','en vue','negatif','pas en vue','je cherche','roger']},
            {label:'Votre indicatif',ref:'callsign'}] },
    { ph:'Aide à la navigation', src:'p. 207',
      atc:"{CALL}, V-O-R {BAL} en panne.",
      consigne:"Accusez réception de l'indisponibilité.",
      reel:"Accusez réception.",
      attendu:"Roger, {CALL}.",
      mots:[{label:'Accusé de réception',variantes:['roger','recu','bien recu','copie']},
            {label:'Votre indicatif',ref:'callsign'}] },
    { ph:'Renseignement SIGMET', src:'p. 205',
      atc:"{CALL}, renseignement SIGMET, givrage modéré à fort entre niveau 90 et niveau 130 sur votre route.",
      consigne:"Accusez réception du SIGMET.",
      reel:"Accusez réception.",
      attendu:"Roger, {CALL}.",
      mots:[{label:'Accusé de réception',variantes:['roger','recu','bien recu','copie']},
            {label:'Votre indicatif',ref:'callsign'}] }
  ];
  var ZONES_R=['R 45','R 138','R 162','R 205','R 46'];
  var BALISES=['CAN','BSN','PTV','LSE','DJL'];

  /* ================= INFORMATION DE TRAFIC =================
     Le message était figé : « trafic convergent, route 180, Cessna 172, meme
     altitude », à chaque vol et sur chaque secteur. On finissait par repondre
     sans écouter, ce qui est exactement le contraire du but.

     La forme suit le manuel DSNA p. 211 : position horaire, distance, route,
     type si connu, niveau relatif. Chaque élément est tiré séparément, et la
     position horaire peut manquer — un service d'information ne voit pas tout.
     Les chiffres traversent ensuite spokenDigits() : « 2 heures » se dira
     « deux heures », « route 090 » s'épellera « zéro neuf zéro ». */
  var TRAFIC_TYPES=['Cessna 172','Cessna 152','DR400','PA-28','DA40','TB10',
                    'ULM','planeur','hélicoptère','avion de tourisme',
                    'bimoteur léger','remorqueur de planeur','autogire',
                    'type inconnu','trafic militaire'];
  var TRAFIC_HEURES=[10,11,12,1,2,3];
  var TRAFIC_NIVEAUX=['même altitude','même altitude',
                      '500 pieds au-dessus','500 pieds en dessous',
                      '1000 pieds au-dessus','1000 pieds en dessous',
                      'altitude inconnue'];
  var TRAFIC_ROUTES=['route opposée','route convergente','même route',
                     'route divergente','route {CAPTRAF}','route {CAPTRAF}'];
  function unTrafic(){
    var cap = String(Math.floor(Math.random()*36)*10 || 360);
    while(cap.length<3) cap = '0'+cap;
    var route = TRAFIC_ROUTES[Math.floor(Math.random()*TRAFIC_ROUTES.length)]
                  .replace('{CAPTRAF}', cap);
    var type  = TRAFIC_TYPES[Math.floor(Math.random()*TRAFIC_TYPES.length)];
    var niv   = TRAFIC_NIVEAUX[Math.floor(Math.random()*TRAFIC_NIVEAUX.length)];
    var dist  = 3 + Math.floor(Math.random()*9);          // 3 à 11 nautiques
    var bouts = [];
    // La position horaire n'est donnée que si l'organisme a le trafic au radar.
    if(Math.random()<0.7) bouts.push(TRAFIC_HEURES[Math.floor(Math.random()*TRAFIC_HEURES.length)]+' heures');
    bouts.push(dist+' nautiques');
    bouts.push(route);
    if(type!=='type inconnu') bouts.push(type);
    bouts.push(niv);
    return bouts.join(', ');
  }
  // Localité connue la plus proche d'un point : on réutilise la base d'aérodromes,
  // dont le nom porte celui de la ville — aucune donnée inventée.
  function lieuProche(lat,lon){
    var best=null,bd=1e9;
    ADS.forEach(function(a){
      var dx=(a.lon-lon)*Math.cos(lat*Math.PI/180), dy=a.lat-lat, d=dx*dx+dy*dy;
      if(d<bd){ bd=d; best=a; }
    });
    return best? best.nom.split(/[\-–(]/)[0].trim() : 'la région';
  }

  function sivLePlusProche(lat,lon){
    var best=null,bd=1e9;
    SIV.forEach(function(s){
      var dx=(s.lon-lon)*Math.cos(lat*Math.PI/180), dy=s.lat-lat;
      var d=dx*dx+dy*dy;
      if(d<bd){ bd=d; best=s; }
    });
    return best;
  }
  /* Suite ordonnée des SIV traversés, sans doublon consécutif : c'est elle qui
     produit les changements de fréquence en route. */
  /* ---- Organisme responsable en un point donné ----
     En espace CONTRÔLÉ (CTR, TMA, CTA de classe A à E), l'interlocuteur n'est pas le
     SIV mais l'organisme dont dépend l'espace : la tour pour un CTR, l'approche pour
     un TMA/CTA. Le SIV ne rend le service d'information qu'en espace non contrôlé.
     C'est ce qui manquait : on annonçait « Beauvais Information » alors qu'on volait
     dans le TMA de Paris, où il faut être avec l'approche et détenir une clairance. */
  function espaceControle(lat,lon,altFt){
    if(typeof NAV_AIRSPACE==='undefined') return null;
    var best=null;
    NAV_AIRSPACE.features.forEach(function(f){
      var p=f.properties;
      if(p.t!=='CTR' && p.t!=='TMA' && p.t!=='CTA') return;
      if(!p.c) return;                                  // sans classe : on ignore
      if(typeof p.lo==='number' && altFt<p.lo) return;
      if(typeof p.up==='number' && altFt>p.up) return;
      if(!inPoly(lon,lat,f.geometry)) return;
      // Le plus contraignant l'emporte : CTR avant TMA, puis le plancher le plus haut
      // (l'espace le plus « intérieur » à cette altitude).
      var rang=(p.t==='CTR')?0:1;
      if(!best || rang<best.rang || (rang===best.rang && (p.lo||0)>(best.p.lo||0)))
        best={p:p, rang:rang};
    });
    return best?best.p:null;
  }
  /* Certains CTA régionaux ne portent pas de code terrain dans les données SIA : ils
     sont nommés d'après la région ou la grande approche qui les gère. On les rattache
     par leur nom. Les espaces étrangers débordant sur la France (Genève, Luxembourg,
     Karlsruhe, Koksijde, Sarrebruck, Anglo-Normandes) n'ont pas d'équivalent dans une
     base d'aérodromes français : ils retombent sur le SIV, faute de fréquence. */
  var CTA_PAR_NOM=[
    [/^TOULOUSE/, 'LFBO'], [/^BORDEAUX/, 'LFBD'], [/^MARSEILLE/, 'LFML'],
    [/^TOULON/,   'LFTH'], [/^COGNAC/,   'LFBG'], [/^SALON/,     'LFMY'],
    [/^RHONE/,    'LFLL']
  ];
  function adDeZone(p){
    if(p.ad) return p.ad;
    var n=(p.n||'').toUpperCase();
    for(var i=0;i<CTA_PAR_NOM.length;i++) if(CTA_PAR_NOM[i][0].test(n)) return CTA_PAR_NOM[i][1];
    return null;
  }
  /* Organisme (nom + fréquence) correspondant à un espace contrôlé. */
  function organismeDe(p){
    var code=adDeZone(p);
    var a=code?BY[code]:null;
    if(!a || !a.freq) return null;
    /* Même filtre de bande que freqOf() : certains terrains militaires portant un
       espace contrôlé publient des fréquences hors bande VHF civile (36,23 ; 142,45…).
       Sans ce filtre, la clairance de transit exigeait une fréquence qu'aucune radio
       VFR — et donc aucun élève — ne peut afficher : le vol s'arrêtait là. */
    var ordre = (p.t==='CTR') ? ['TWR','AFIS','APP'] : ['APP','TWR'];
    var choix = freqOf(a, ordre);
    if(!choix) return null;
    return {n:stnName(a, choix.k), f:choix.f, zone:p};
  }
  /* Interlocuteur à un point : espace contrôlé s'il y en a un, sinon SIV. */
  function organismeEnRoute(lat,lon,altFt){
    var z=espaceControle(lat,lon,altFt);
    if(z){
      var o=organismeDe(z);
      if(o) return o;
    }
    var s=sivLePlusProche(lat,lon);
    return {n:s.n, f:s.f, zone:null};
  }

  /* Suite ordonnée des interlocuteurs le long de la route, À L'ALTITUDE DE CROISIÈRE.
     Chaque changement d'organisme donne un changement de fréquence ; l'entrée dans un
     espace contrôlé donne en plus une demande de clairance. */
  function sivSurRoute(a,b,altFt,via){
    altFt = altFt || 3500;
    var ech=echRoute(a,b,via,via?12:24), brut=[];
    for(var i=0;i<ech.length;i++){
      brut.push(organismeEnRoute(ech[i][1], ech[i][0], altFt));
    }
    // Lissage : un organisme effleuré sur un seul échantillon est un artefact.
    var out=[];
    for(var j=0;j<brut.length;j++){
      var s=brut[j];
      if(out.length && out[out.length-1].f===s.f) continue;
      var suiv=brut[j+1];
      if(suiv && suiv.f!==s.f && out.length) continue;
      out.push(s);
    }
    return out.length?out:[brut[0]];
  }

  /* ================= ON NE SE TRANSFÈRE PAS À SOI-MÊME =================
     Au décollage, on est encore DANS le CTR du terrain de départ : l'organisme
     responsable au point survolé est donc… la tour qu'on vient de quitter. La
     chaîne commençait par elle, et le vol demandait « quittez Paris Tour,
     contactez Paris Tour » — sur la même fréquence. Symétrique à l'arrivée.

     On retire donc de la chaîne en route tout organisme partageant la fréquence
     du départ ou celle de l'arrivée : ces deux contacts-là ont déjà leurs étapes
     dédiées. Comparer les FRÉQUENCES et non les noms est le bon critère — c'est
     la fréquence qui décide si l'on change réellement d'interlocuteur.
     Si la chaîne se vide (vol court restant dans le même espace), le segment
     « information de vol » est simplement omis : buildFlight() sait déjà le faire
     quand aucune fréquence en route n'existe. */
  function memeFreq(a,b){
    if(a==null||b==null) return false;
    return Math.abs(Number(a)-Number(b)) < 0.0005;
  }
  function chaineSansDoublons(chaine, fDep, fArr){
    return (chaine||[]).filter(function(s){
      return !memeFreq(s.f, fDep) && !memeFreq(s.f, fArr);
    });
  }

  /* Bande VHF aéronautique civile : 118,000 à 136,975 MHz. Quelques terrains
     militaires de la base portent des fréquences UHF (142,45 ; 37,925…) qu'aucune
     radio VFR ne peut afficher : on les écarte plutôt que de demander l'impossible. */
  function bandeVHF(f){ var n=Number(f); return n>=118 && n<=136.975; }
  function freqOf(a,kinds){
    for(var i=0;i<kinds.length;i++){
      var f=a.freq&&a.freq[kinds[i]];
      if(f && bandeVHF(f)) return {k:kinds[i],f:f};
    }
    return null;
  }
  // Nom d'organisme déduit du TYPE de fréquence réellement publié pour ce terrain.
  /* Nature du terrain — elle change la phraséologie du tout au tout :
       TWR  : organisme de contrôle → il délivre des CLAIRANCES (« autorisé »)
       AFIS : agent d'information   → il informe, il n'autorise jamais
       A/A  : auto-information      → personne au sol, le pilote annonce ses intentions
     Le manuel DSNA couvre le contrôle et l'AFIS, mais PAS l'auto-information : les
     formulations A/A reprennent la structure AFIS du manuel en retirant toute notion
     d'autorisation, puisqu'aucun organisme n'est là pour en délivrer. */
  function natureTerrain(a){
    if(!a || !a.freq) return 'aa';
    if(a.freq.TWR) return 'twr';
    if(a.freq.AFIS || a.freq.INFO) return 'afis';
    return 'aa';
  }
  function stnName(a,kind){
    var base=a.nom.split(/[\-–(]/)[0].trim();
    if(kind==='TWR') return base+' Tour';
    if(kind==='GND') return base+' Sol';
    if(kind==='APP') return base+' Approche';
    if(kind==='AFIS'||kind==='INFO') return base+' Information';
    // A/A, UNIC, ou aucune fréquence : on s'adresse au terrain lui-même.
    return base+' auto-information';
  }

  function buildFlight(){
    var dep=BY[sel.dep], arr=(mode==='voyage')?BY[sel.arr]:null;
    var cruise=ftOf($v('navFl').value)||3500;
    var acLabel=acChoice.nom, acShort=acChoice.abbr;

    // --- Contexte radio : uniquement des fréquences RÉELLES issues d'OurAirports. ---
    var depF=freqOf(dep,['TWR','AFIS','GND','APP','A/A','UNIC','CTAF'])||{k:'A/A',f:null};
    var arrF=arr?(freqOf(arr,['TWR','AFIS','APP','A/A','UNIC','CTAF'])||{k:'A/A',f:null}):null;
    // Organisme en route : on n'invente AUCUNE fréquence FIS. On n'utilise le segment
    // « information de vol » que si une fréquence d'approche réelle existe au départ
    // ou à l'arrivée ; sinon ce segment est simplement omis du vol.
    /* Service d'information en route : suite des SIV réellement survolés, et non
       plus l'approche du terrain de départ (qui restait affichée sur tout le trajet,
       même sur 700 km — cf. Valenciennes → Agen). */
    /* Évitement de la classe A avant toute chose : l'altitude et la route retenues
       ci-dessous sont celles du plan CORRIGÉ, pas celles demandées. */
    var evit = arr ? (planCourant || eviterClasseA(dep,arr,cruise)) : {alt:cruise, via:null, msg:null};
    if(arr){ cruise = evit.alt; state.altCruise = cruise; }
    var chaineSiv = arr ? chaineSansDoublons(sivSurRoute(dep,arr,cruise,evit.via),
                                             depF.f, arrF?arrF.f:null) : [];
    var infoSrc=chaineSiv.length?chaineSiv[0]:null;
    var infoF=infoSrc?{k:'FIS',f:infoSrc.f}:null;

    // --- État moteur : on réutilise `state` (comme le fait launchScenario). ---
    state.activeAd=dep; state.activeSide='dep'; state.depStn=stnName(dep,depF.k);
    drawMeteo();                       // vent, QNH, piste en service au départ
    state.altCruise=cruise;            // …mais on garde l'altitude choisie par l'élève
    var depRwy=state.rwy;

    F.ctx={ dep:dep, arr:arr, cruise:cruise, ac:acLabel, acShort:acShort,
            depF:depF, arrF:arrF, infoF:infoF, infoSrc:infoSrc,
            /* Borné par les sièges de l'appareil : une configuration restaurée d'un
               vol précédent peut porter plus de personnes que le nouvel avion n'en
               a. Le champ est déjà borné à la saisie ; ceci couvre les reprises. */
            pax:Math.min(Math.max(1,parseInt($v('navPax').value,10)||1),
                         (acChoice&&acChoice.places)?acChoice.places:9),
            depNat:natureTerrain(dep), arrNat:arr?natureTerrain(arr):null,
            via:evit.via, evitMsg:evit.msg, altDemandee:ftOf($v('navFl').value)||3500,
            depStn:stnName(dep,depF.k), arrStn:arr?stnName(arr,arrF.k):null,
            infoStn:infoSrc?infoSrc.n:null, chaineSiv:chaineSiv, depRwy:depRwy };

    /* ATIS du terrain de départ. Il n'existe que sur les terrains où il est publié
       (67 dans la base) ; ailleurs state.atis reste nul et aucune étape n'est
       insérée — le pilote obtient alors les paramètres en fréquence. La lettre est
       tirée une seule fois par vol : c'est elle que le pilote annonce ensuite. */
    state.atis = buildAtis(dep);
    F.ctx.atis = state.atis;

    var S=[], C=F.ctx;
    function push(o){ S.push(o); }

    /* 0 — Écoute de l'ATIS (manuel DSNA p. 213-217).
       Avant tout appel, on écoute l'ATIS : il donne la piste en service, le QNH et
       la lettre d'information à annoncer. L'étape porte la FRÉQUENCE ATIS, donc le
       poste doit être accordé dessus : c'est exactement le geste réel. */
    if(C.atis){
      push({ ph:'Écoute ATIS', src:'p. 213', stn:C.dep.nom+' ATIS', freq:C.atis.freq, leg:0,
        atcBefore:C.atis.texte,
        reel:'Affichez '+C.atis.freq.toFixed(3)+' et écoutez l\'ATIS.',
        /* On n'ÉMET RIEN sur la fréquence ATIS : c'est une diffusion en boucle,
           personne n'écoute en face. Annoncer la lettre ici n'a aucun sens — elle
           se donne au contrôleur, plus tard, au premier appel. L'étape n'a donc ni
           phrase attendue ni mots-clés : on écoute, on note, on passe à la suite. */
        consigne:'Affichez la fréquence ATIS ('+C.atis.freq.toFixed(3)+') et écoutez le message. '+
                 'Notez la piste en service, le QNH et la lettre d\'information — '+
                 'c\'est elle que vous donnerez au contrôleur à votre premier appel. '+
                 'Passez à la suite quand vous avez tout noté.',
        atisStep:true });
    }

    // 1 — Mise en route (p. 39)
    push({ ph:'Mise en route', src:'p. 39', stn:C.depStn, freq:C.depF.f, leg:0,
      reel:'Appelez '+C.depStn+'.',
      consigne: (C.depNat==='aa')
        ? 'Terrain sans organisme : en auto-information, annoncez-vous à '+C.depStn+' — indicatif et intention de mise en route.'
        : 'Appelez '+C.depStn+' : votre indicatif, puis demandez la mise en route'+
          (C.atis?', en terminant par la lettre d\'information reçue à l\'ATIS.':'.'),
      /* La lettre d'information se donne dès la demande de mise en route :
         « Mérignac Prévol, Rapidair 3245, en D 8, demande mise en route pour Lyon,
         information L » (manuel DSNA p. 39). */
      /* « au parking » : la POSITION fait partie de la demande (manuel DSNA p. 39,
         « Mérignac Prévol, Rapidair 3245, en D 8, demande mise en route… »). Elle
         manquait ici alors que le scénario « Mise en route + roulage » la
         demandait — deux exercices, deux phrases attendues pour le même échange. */
      attendu: C.depNat==='aa'
        ? C.depStn+', {CALL}, bonjour, '+C.acShort+' au parking, je mets en route.'
        : C.depStn+', {CALL}, bonjour, au parking, demande mise en route'+(C.atis?', information {ATIS}.':'.'),
      motsCles:[ {label:'Organisme appelé',variantes:stnVars(C.depStn,C.depF.k)},
                 {label:'Votre indicatif',ref:'callsign'},
                 {label:'Mise en route',variantes:['mise en route','demande mise en route','demande la mise en route','je mets en route']} ]
              .concat(C.atis?[{label:'Lettre d\'information',variantes:atisVars(C.atis)}]:[]),
      /* Le QNH accompagne l'approbation (manuel DSNA p. 39). Sans lui, il n'y
         avait rien à collationner — d'où l'étape suivante, absente jusqu'ici. */
      atcAfter: (C.depNat==='twr') ? '{CALL}, mise en route approuvée, QNH {QNH}.'
              : (C.depNat==='afis') ? '{CALL}, {DEPSTN}, roger, piste {PISTE} en service, QNH {QNH}.'
              : null });

    /* 1 bis — COLLATIONNEMENT DE LA MISE EN ROUTE (p. 39).
       « Mise en route approuvée » est une CLAIRANCE : elle se collationne, comme
       toute clairance. L'exercice enchainait directement sur la demande de roulage,
       ce que le scénario « Mise en route + roulage », lui, faisait déjà correctement.
       En auto-information il n'y a personne pour approuver : pas d'étape. */
    if(C.depNat==='twr' || C.depNat==='afis')
    push({ ph:'Collationnement mise en route', src:'p. 39', stn:C.depStn, freq:C.depF.f, leg:0,
      reel:'Collationnez.',
      consigne: (C.depNat==='twr')
        ? 'Collationnez : la mise en route est approuvée, et reprenez le QNH.'
        : 'Accusez réception : la piste en service et le QNH.',
      attendu: (C.depNat==='twr')
        ? 'Mise en route approuvée, QNH {QNH}, {CALL}.'
        : 'Piste {PISTE}, QNH {QNH}, {CALL}.',
      motsCles: (C.depNat==='twr')
        ? [ {label:'Mise en route approuvée',variantes:['mise en route','approuve','approuvee','mise en route approuvee']},
            {label:'QNH',variantes:['qnh']},
            {label:'Valeur QNH',ref:'qnh'},
            {label:'Votre indicatif',ref:'callsign'} ]
        : [ {label:'Numéro de piste',ref:'piste'},
            {label:'QNH',variantes:['qnh']},
            {label:'Valeur QNH',ref:'qnh'},
            {label:'Votre indicatif',ref:'callsign'} ] });

    // 2 — Demande de roulage (p. 45, exemple VFR Chavenay)
    push({ ph:'Roulage', src:'p. 44-45', stn:C.depStn, freq:C.depF.f, leg:0,
      reel:'Demandez le roulage à '+C.depStn+'.',
      consigne:'Annonce complète : indicatif, type d\'avion, nombre de personnes à bord, position, puis '+
               (C.depNat==='aa'?'votre intention de rouler (personne ne vous autorise ici)':'votre demande de roulage')+
               (C.arr?' pour une navigation vers '+C.arr.nom:'')+'.',
      attendu:'{CALL}, '+C.acShort+', '+C.pax+' personne'+(C.pax>1?'s':'')+' à bord, au parking, '+
              (C.depNat==='aa'?'je roule piste {PISTE}':'demande le roulage')+
              (C.arr?' pour une navigation vers '+C.arr.nom:' pour un vol local')+'.',
      motsCles:[ {label:'Votre indicatif',ref:'callsign'},
                 {label:'Type d\'avion',variantes:acVars(C.acShort)},
                 {label:'Personnes à bord',variantes:paxVars(C.pax)},
                 {label:'Position (parking)',variantes:['parking','au parking','parking club','aire de stationnement']},
                 {label:'Roulage',variantes:['roulage','consignes de roulage','demande roulage','demande le roulage','demande consignes','je roule']} ]
              .concat(C.arr?[{label:'Destination',variantes:destVars(C.arr)}]:[]),
      atcAfter: C.depNat==='aa' ? null : '{CALL}, roulez et entrez aire d\'attente {PISTE}, rappelez prêt.' });

    // 3 — Collationnement du roulage (p. 45)
    push({ ph:'Collationnement roulage', src:'p. 45', stn:C.depStn, freq:C.depF.f, leg:0,
      reel:'Collationnez.',
      consigne: C.depNat==='aa'
        ? 'Personne ne vous a donné d\'instruction : annoncez simplement que vous entrez au point d\'attente de la piste {PISTE}.'
        : 'Collationnez : vous roulez et entrez dans l\'aire d\'attente {PISTE}, et vous rappellerez prêt.',
      attendu: C.depNat==='aa'
        ? 'J\'entre au point d\'attente piste {PISTE}, {CALL}.'
        : 'Je roule et entre dans l\'aire d\'attente {PISTE} et rappelle prêt, {CALL}.',
      /* En auto-information la phrase attendue est « j'entre au point d'attente » :
         exiger « je roule » rendait l'exercice impossible à réussir sur ces terrains. */
      motsCles:[ (C.depNat==='aa')
                   ? {label:'J\'entre au point d\'attente',variantes:["j entre","entre","je rentre","au point d attente"]}
                   : {label:'Je roule',variantes:['je roule','roule']},
                 {label:'Aire d\'attente',variantes:["aire d attente","point d attente","aire dattente"]},
                 {label:'Numéro de piste',ref:'piste'},
                 {label:'Votre indicatif',ref:'callsign'} ] });

    /* 3 bis — Code transpondeur (p. 186). Sur un terrain contrôlé, le code SSR est
       assigné au sol, avant le départ. Le pilote le collationne PUIS l'affiche :
       les deux gestes comptent, comme en vol réel. */
    if(C.depNat==='twr'){
      C.codeDep=unCode();
      push({ ph:'Code transpondeur', src:'p. 186', stn:C.depStn, freq:C.depF.f, leg:0,
        atcBefore:'{CALL}, transpondeur '+C.codeDep+'.',
        reel:'Collationnez le code assigné.',
        consigne:'Collationnez le code transpondeur, puis affichez-le sur les quatre roues du boîtier.',
        attendu:'Transpondeur '+C.codeDep+', {CALL}.',
        motsCles:[ {label:'Transpondeur',variantes:['transpondeur','squawk','affiche','affiche transpondeur']},
                   {label:'Code assigné',variantes:numVariants(C.codeDep)},
                   {label:'Votre indicatif',ref:'callsign'} ],
        xpdrAssign:C.codeDep });
    }

    // 4 — Prêt au départ (p. 50)
    push({ ph:'Prêt au départ', src:'p. 50', stn:C.depStn, freq:C.depF.f, leg:0,
      atcBefore: C.depNat==='aa' ? null : '{CALL}, rappelez prêt au départ.',
      reel:'Répondez à '+C.depStn+'.',
      consigne: C.depNat==='aa'
        ? 'Annoncez que vous vous alignez et décollez piste {PISTE} — aucune autorisation n\'existe ici.'
        : 'Annoncez que vous êtes prêt au départ.',
      attendu: C.depNat==='aa'
        ? 'Je m\'aligne et je décolle piste {PISTE}, {CALL}.'
        : 'Prêt au départ, {CALL}.',
      /* Idem : sans contrôleur, on annonce l'alignement et le décollage, pas « prêt au départ ». */
      motsCles:[ (C.depNat==='aa')
                   ? {label:'Je m\'aligne et je décolle',variantes:["je m aligne","aligne","je decolle","decolle"]}
                   : {label:'Prêt au départ',variantes:['pret au depart','pret','paré','affirme']},
                 {label:'Votre indicatif',ref:'callsign'} ],
      atcAfter: C.depNat==='aa' ? null : '{CALL}, alignez-vous et attendez piste {PISTE}.' });

    /* 5 — Alignement (p. 53) : « alignez-vous et attendez » sont indissociables… mais
       cette instruction n'existe que si un contrôleur la délivre. Sans TWR, l'étape
       « Prêt au départ » a déjà couvert l'alignement et le décollage. */
    if(C.depNat==='twr')
    push({ ph:'Alignement', src:'p. 53', stn:C.depStn, freq:C.depF.f, leg:0,
      reel:'Collationnez.',
      consigne:'Collationnez l\'alignement : vous vous alignez ET vous attendez.',
      attendu:'Je m\'aligne et j\'attends piste {PISTE}, {CALL}.',
      motsCles:[ {label:'Je m\'aligne',variantes:["je m aligne","aligne","m aligne"]},
                 {label:'J\'attends',variantes:["j attends","attends","et j attends"]},
                 {label:'Numéro de piste',ref:'piste'},
                 {label:'Votre indicatif',ref:'callsign'} ],
      atcAfter: (C.depNat==='twr')
        ? '{CALL}, piste {PISTE}, autorisé décollage, vent {VENT}.'
        : '{CALL}, piste {PISTE} en service, vent {VENT}, QNH {QNH}, pas de trafic connu.' });

    // 6 — Décollage (p. 59) — le pilote dit « je décolle », JAMAIS « autorisé décollage »
    push({ ph:'Décollage', src:'p. 59', stn:C.depStn, freq:C.depF.f, leg:0.03,
      reel:'Collationnez l\'autorisation de décollage.',
      consigne: (C.depNat==='twr')
        ? 'Collationnez l\'autorisation. Le pilote dit « je décolle » — « autorisé décollage » est réservé au contrôleur.'
        : 'Sans organisme de contrôle, personne ne vous autorise : annoncez que vous décollez de la piste en service.',
      attendu:'Piste {PISTE}, je décolle, {CALL}.',
      motsCles:[ {label:'Numéro de piste',ref:'piste'},
                 {label:'Je décolle',variantes:['je decolle','decolle']},
                 {label:'Votre indicatif',ref:'callsign'} ] });

    // 7 — Montée initiale (p. 63)
    push({ ph:'Montée initiale', src:'p. 63', stn:C.depStn, freq:C.depF.f, leg:0.07,
      atcBefore:'{CALL}, continuez au cap de la piste.',
      reel:'Collationnez.',
      consigne:'Collationnez.',
      attendu:'Je continue au cap de la piste, {CALL}.',
      motsCles:[ {label:'Cap de la piste',variantes:['cap de la piste','dans l axe','axe de piste','je continue au cap']},
                 {label:'Votre indicatif',ref:'callsign'} ] });

    if(C.arr){
      /* Vers QUI part-on en quittant le circuit ? Normalement le premier secteur
         en route. Mais la chaîne en route peut être VIDE — vol court qui ne sort
         pas de l'espace du terrain de départ, ou secteurs écartés parce qu'ils
         partageaient la fréquence du départ. Dans ce cas on passe directement à
         l'organisme d'ARRIVÉE : sans cela le contrôleur ne disait plus rien et
         l'élève se retrouvait, à l'échange suivant, sur une fréquence dont personne
         ne lui avait parlé. */
      var suivant = C.infoF ? {stn:C.infoStn, f:C.infoF.f, k:'AFIS'}
                  : (C.arrF && C.arrF.f && !memeFreq(C.arrF.f, C.depF.f)
                       ? {stn:C.arrStn, f:C.arrF.f, k:C.arrF.k} : null);

      // 8 — Sortie de circuit (p. 153)
      push({ ph:'Sortie de circuit', src:'p. 153', stn:C.depStn, freq:C.depF.f, leg:0.12,
        atcBefore:'{CALL}, rappelez quittant la fréquence.',
        reel:'Quittez la fréquence de '+C.depStn+'.',
      consigne:'Annoncez votre sortie de circuit et que vous quittez la fréquence.',
        attendu:'Sortie de circuit, je quitte la fréquence, {CALL}.',
        motsCles:[ {label:'Sortie de circuit',variantes:['sortie de circuit','sortie','je quitte le circuit']},
                   {label:'Je quitte la fréquence',variantes:['quitte la frequence','je quitte','quitte']},
                   {label:'Votre indicatif',ref:'callsign'} ],
        atcAfter: suivant ? ('{CALL}, contactez '+suivant.stn+' '+fq(suivant.f)+'.') : null });

      /* Pas de segment en route : le transfert se fait d'un bloc vers l'arrivée. */
      if(!C.infoF && suivant){
        push({ ph:'Changement de fréquence', src:'p. 182', stn:C.depStn, freq:C.depF.f, leg:0.2,
          reel:'Collationnez la fréquence.',
          consigne:'Collationnez : le nom de l\'organisme, la fréquence, puis votre indicatif.',
          attendu:suivant.stn+' '+fq(suivant.f)+', {CALL}.',
          motsCles:[ {label:'Organisme',variantes:stnVars(suivant.stn, suivant.k)},
                     {label:'Nouvelle fréquence',variantes:freqVars(suivant.f)},
                     {label:'Votre indicatif',ref:'callsign'} ],
          tuneTo:{stn:suivant.stn, freq:suivant.f} });
      }

      if(C.infoF){
        // 9 — Changement de fréquence (p. 182)
        push({ ph:'Changement de fréquence', src:'p. 182', stn:C.depStn, freq:C.depF.f, leg:0.16,
          reel:'Collationnez la fréquence.',
      consigne:'Collationnez : le nom de l\'organisme, la fréquence, puis votre indicatif.',
          attendu:C.infoStn+' '+fq(C.infoF.f)+', {CALL}.',
          motsCles:[ {label:'Organisme',variantes:stnVars(C.infoStn,'AFIS')},
                     {label:'Nouvelle fréquence',variantes:freqVars(C.infoF.f)},
                     {label:'Votre indicatif',ref:'callsign'} ],
          tuneTo:{stn:C.infoStn, freq:C.infoF.f} });

        // 10 — Transit VFR (p. 178)
        push({ ph:'Transit VFR', src:'p. 178', stn:C.infoStn, freq:C.infoF.f, leg:0.3,
          reel:'Appelez '+C.infoStn+'.',
      consigne:'Contactez '+C.infoStn+' : indicatif, demande de transit VFR, votre altitude, et votre route.',
          attendu:C.infoStn+', {CALL}, demande transit VFR, {ALT} pieds, de '+C.dep.nom+' à '+C.arr.nom+'.',
          motsCles:[ {label:'Organisme appelé',variantes:stnVars(C.infoStn,'AFIS')},
                     {label:'Votre indicatif',ref:'callsign'},
                     {label:'Demande de transit VFR',variantes:['transit','demande transit','transit vfr']},
                     {label:'Altitude',ref:'alt'},
                     {label:'Altitude (pieds)',variantes:['pieds','pied']} ],
          atcAfter:'{CALL}, transitez, maintenez {ALT} pieds, et rappelez avant '+C.arr.nom+'.' });

        // 11 — Collationnement du transit (p. 178)
        push({ ph:'Collationnement transit', src:'p. 178', stn:C.infoStn, freq:C.infoF.f, leg:0.42,
          reel:'Collationnez.',
      consigne:'Collationnez : vous transitez, vous maintenez {ALT} pieds, et vous rappellerez.',
          attendu:'Je transite, maintiens {ALT} pieds, et rappelle avant '+C.arr.nom+', {CALL}.',
          motsCles:[ {label:'Je maintiens',variantes:['maintiens','je maintiens','maintien']},
                     {label:'Altitude',ref:'alt'},
                     {label:'Votre indicatif',ref:'callsign'} ] });

        /* 11 bis — Code transpondeur en route (p. 186 ; exemple d'un transfert VFR
           avec assignation de code, p. 104-105). Le SIV donne son propre code. */
        (function(){
          var code=unCode(); C.codeRoute=code;
          push({ ph:'Code transpondeur', src:'p. 186', stn:C.infoStn, freq:C.infoF.f, leg:0.5,
            atcBefore:'{CALL}, transpondeur '+code+'.',
            reel:'Collationnez le code assigné.',
            consigne:'Collationnez le code, puis affichez-le au transpondeur.',
            attendu:'Transpondeur '+code+', {CALL}.',
            motsCles:[ {label:'Transpondeur',variantes:['transpondeur','squawk','affiche','affiche transpondeur']},
                       {label:'Code assigné',variantes:numVariants(code)},
                       {label:'Votre indicatif',ref:'callsign'} ],
            xpdrAssign:code });

          /* Un vol sur trois : demande d'identification (p. 187). Court, et cela
             donne un sens au bouton IDENT. */
          if(Math.random()<0.34)
            push({ ph:'Identification', src:'p. 187', stn:C.infoStn, freq:C.infoF.f, leg:0.53,
              atcBefore:'{CALL}, transpondeur ident.',
              reel:'Collationnez, puis pressez IDENT.',
              consigne:'Collationnez la demande d\'identification, puis pressez IDENT au transpondeur.',
              attendu:'Transpondeur ident, {CALL}.',
              motsCles:[ {label:'Transpondeur ident',variantes:['transpondeur ident','ident','squawk ident','affiche ident']},
                         {label:'Votre indicatif',ref:'callsign'} ],
              identReq:true });
          /* Sinon, un vol sur trois : vérification du code affiché (p. 187). */
          else if(Math.random()<0.5)
            push({ ph:'Vérification du code', src:'p. 187', stn:C.infoStn, freq:C.infoF.f, leg:0.53,
              atcBefore:'{CALL}, confirmez transpondeur '+code+'.',
              reel:'Confirmez le code affiché.',
              consigne:'Confirmez le code que vous affichez.',
              attendu:'Transpondeur '+code+', {CALL}.',
              motsCles:[ {label:'Transpondeur',variantes:['transpondeur','squawk','affiche']},
                         {label:'Code affiché',variantes:numVariants(code)},
                         {label:'Votre indicatif',ref:'callsign'} ],
              xpdrReq:code });
        })();

        // 12 — Information de trafic (p. 211)
        push({ ph:'Information de trafic', src:'p. 211', stn:C.infoStn, freq:C.infoF.f, leg:0.56,
          atcBefore:'{CALL}, trafic, '+unTrafic()+'.',
          reel:'Accusez réception.',
      consigne:'Accusez réception — « Roger » si vous ne le voyez pas, « trafic en vue » si vous l\'avez.',
          attendu:'Roger, {CALL}.',
          motsCles:[ {label:'Accusé de réception',variantes:['roger','trafic en vue','en vue','recu','bien recu','negatif','pas en vue']},
                     {label:'Votre indicatif',ref:'callsign'} ] });

        /* 12 bis — Traversée des SIV suivants : un passage de frequence par secteur
           réellement survolé (manuel DSNA p. 182). C'est ce qui manquait : sur un long
           trajet on restait sur le premier organisme du départ à l'autre bout du pays. */
        var precSiv=C.infoStn, precF=C.infoF.f;
        for(var si=1; si<C.chaineSiv.length; si++){
          (function(s,idx){
            var part=0.56+(0.14*idx/Math.max(1,C.chaineSiv.length-1));
            push({ ph:'Changement de fréquence', src:'p. 182', stn:precSiv, freq:precF, leg:part,
              atcBefore:'{CALL}, contactez '+s.n+' '+fq(s.f)+'.',
              reel:'Collationnez la fréquence.',
              consigne:'Collationnez : le nom de l\'organisme, la fréquence, puis votre indicatif.',
              attendu:s.n+' '+fq(s.f)+', {CALL}.',
              motsCles:[ {label:'Organisme',variantes:stnVars(s.n,'AFIS')},
                         {label:'Nouvelle fréquence',variantes:freqVars(s.f)},
                         {label:'Votre indicatif',ref:'callsign'} ],
              tuneTo:{stn:s.n, freq:s.f} });
            precSiv=s.n; precF=s.f;

            /* Entrée dans un espace CONTRÔLÉ : une clairance est nécessaire.
               Le manuel donne la formulation du transit VFR (p. 178). */
            if(s.zone){
              var cls=s.zone.c||'?';
              push({ ph:'Clairance '+s.zone.t, src:'p. 178', stn:s.n, freq:s.f, leg:part+0.01,
                reel:'Demandez la clairance de transit à '+s.n+'.',
                consigne:'Vous entrez dans le '+s.zone.t+' '+s.zone.n+', classe '+cls+
                         ' : demandez le transit — indicatif, altitude, votre route.',
                attendu:s.n+', {CALL}, demande transit VFR, {ALT} pieds, de '+C.dep.nom+' à '+C.arr.nom+'.',
                motsCles:[ {label:'Organisme appelé',variantes:stnVars(s.n,'APP')},
                           {label:'Votre indicatif',ref:'callsign'},
                           {label:'Demande de transit',variantes:['transit','demande transit','transit vfr','traversee']},
                           {label:'Altitude',ref:'alt'} ],
                atcAfter:'{CALL}, transitez '+s.zone.n+', maintenez {ALT} pieds.' });

              push({ ph:'Collationnement clairance', src:'p. 178', stn:s.n, freq:s.f, leg:part+0.02,
                reel:'Collationnez.',
                consigne:'Collationnez la clairance : vous transitez et vous maintenez {ALT} pieds.',
                attendu:'Je transite '+s.zone.n+', maintiens {ALT} pieds, {CALL}.',
                motsCles:[ {label:'Je transite',variantes:['transite','je transite','transit']},
                           {label:'Je maintiens',variantes:['maintiens','je maintiens','maintien']},
                           {label:'Altitude',ref:'alt'},
                           {label:'Votre indicatif',ref:'callsign'} ] });
            }
          })(C.chaineSiv[si], si);

          /* Un aléa après chaque changement de secteur : c'est le rôle même du
             service d'information de vol (manuel DSNA p. 205-213), et cela évite
             qu'une longue croisière se réduise à une suite de collationnements. */
          (function(s,idx){
            var al=ALEAS[(idx-1)%ALEAS.length];
            var t=(idx)/Math.max(1,C.chaineSiv.length);
            var lat=C.dep.lat+(C.arr.lat-C.dep.lat)*t, lon=C.dep.lon+(C.arr.lon-C.dep.lon)*t;
            var txt=al.atc.replace('{LIEU}',lieuProche(lat,lon))
                          .replace('{ZONE}',ZONES_R[idx%ZONES_R.length])
                          .replace('{BAL}',BALISES[idx%BALISES.length])
                          .replace('{TRAFIC}',unTrafic());
            push({ ph:al.ph, src:al.src, stn:s.n, freq:s.f, leg:0.56+(0.14*idx/Math.max(1,C.chaineSiv.length-1)),
              atcBefore:txt, reel:al.reel, consigne:al.consigne, attendu:al.attendu,
              motsCles:al.mots });
          })(C.chaineSiv[si], si);
        }
        C.dernierSiv=precSiv; C.dernierSivF=precF;

        // 13 — Changement de fréquence vers l'arrivée (p. 182) — seulement si l'arrivée
        // publie une fréquence réelle ; sinon on passe directement à l'intégration.
        /* …et seulement si elle DIFFÈRE de celle qu'on écoute déjà : sur un vol
           court, le dernier secteur en route peut partager la fréquence du terrain
           d'arrivée, et l'on s'entendait dire « contactez X » alors qu'on y était. */
        if(C.arrF && C.arrF.f && !memeFreq(C.arrF.f, C.dernierSivF||C.infoF.f))
        push({ ph:'Changement de fréquence', src:'p. 182', stn:C.dernierSiv||C.infoStn, freq:C.dernierSivF||C.infoF.f, leg:0.72,
          atcBefore:'{CALL}, contactez '+C.arrStn+' '+fq(C.arrF.f)+'.',
          reel:'Collationnez la fréquence.',
      consigne:'Collationnez le changement de fréquence.',
          attendu:C.arrStn+' '+fq(C.arrF.f)+', {CALL}.',
          motsCles:[ {label:'Organisme',variantes:stnVars(C.arrStn,C.arrF.k)},
                     {label:'Nouvelle fréquence',variantes:freqVars(C.arrF.f)},
                     {label:'Votre indicatif',ref:'callsign'} ],
          tuneTo:{stn:C.arrStn, freq:C.arrF.f} });
      }

      // 14 — Intégration : appel initial complet (p. 149)
      push({ ph:'Intégration', src:'p. 149', stn:C.arrStn, freq:C.arrF.f, leg:0.82,
        /* Météo propre à l'arrivée : sur plusieurs centaines de kilomètres, garder le
           vent et le QNH du départ n'a aucun sens. On retire un vent à destination
           et on en déduit la piste en service et le QNH annoncés à l'intégration. */
        onEnter:function(){
          state.activeAd=C.arr; state.activeSide='arr';
          state.meteo.windDir  = Math.floor(Math.random()*36)*10;
          state.meteo.windForce= 3 + Math.floor(Math.random()*13);
          state.meteo.qnh      = 995 + Math.floor(Math.random()*36);
          state.ventPhrase     = state.meteo.windDir+' degrés, '+state.meteo.windForce+' nœuds';
          state.rwy = runwayInService(C.arr, state.meteo.windDir);
        },
        reel:'Appelez '+C.arrStn+'.',
      consigne:'Appel initial à '+C.arrStn+' : indicatif complet, type d\'avion, VFR de '+C.dep.nom+' à '+C.arr.nom+', votre altitude.',
        attendu:C.arrStn+', {CALL}, '+C.acShort+', VFR de '+C.dep.nom+' à '+C.arr.nom+', {ALT} pieds.',
        motsCles:[ {label:'Organisme appelé',variantes:stnVars(C.arrStn,C.arrF.k)},
                   {label:'Votre indicatif',ref:'callsign'},
                   {label:'En VFR',variantes:['vfr','en vfr','v f r']},
                   {label:'Altitude',ref:'alt'} ],
        atcAfter:'{CALL}, entrez vent arrière piste {PISTE}, QNH {QNH}, rappelez vent arrière.' });

      // 15 — Collationnement intégration (p. 149)
      push({ ph:'Collationnement intégration', src:'p. 149', stn:C.arrStn, freq:C.arrF.f, leg:0.88,
        reel:'Collationnez.',
      consigne:'Collationnez : vent arrière piste {PISTE}, le QNH, et vous rappellerez vent arrière.',
        attendu:'J\'entre vent arrière piste {PISTE}, QNH {QNH}, je rappelle vent arrière, {CALL}.',
        motsCles:[ {label:'Vent arrière',variantes:['vent arriere','vent arrière']},
                   {label:'Numéro de piste',ref:'piste'},
                   {label:'QNH',ref:'qnh'},
                   {label:'Votre indicatif',ref:'callsign'} ] });
    }

    // --- Circuit + atterrissage (commun voyage & vol local) ---
    if(!C.arr){
      // Vol local : on reste sur le terrain de départ, en tours de piste.
      push({ ph:'Vent arrière', src:'p. 150', stn:C.depStn, freq:C.depF.f, leg:0.4,
        reel:'Annoncez votre position.',
      consigne:'Annoncez votre position en vent arrière pour la piste {PISTE}.',
        attendu:'{CALL}, vent arrière piste {PISTE}.',
        motsCles:[ {label:'Votre indicatif',ref:'callsign'},
                   {label:'Vent arrière',variantes:['vent arriere','vent arrière']},
                   {label:'Numéro de piste',ref:'piste'} ],
        atcAfter:'{CALL}, numéro {NUM}, rappelez base piste {PISTE}.' });
    } else {
      push({ ph:'Vent arrière', src:'p. 150', stn:C.arrStn, freq:C.arrF.f, leg:0.92,
        reel:'Annoncez votre position.',
      consigne:'Annoncez votre position en vent arrière pour la piste {PISTE}.',
        attendu:'{CALL}, vent arrière piste {PISTE}.',
        motsCles:[ {label:'Votre indicatif',ref:'callsign'},
                   {label:'Vent arrière',variantes:['vent arriere','vent arrière']},
                   {label:'Numéro de piste',ref:'piste'} ],
        atcAfter:'{CALL}, numéro {NUM}, rappelez base piste {PISTE}.' });
    }
    var lastStn=C.arr?C.arrStn:C.depStn, lastF=C.arr?C.arrF.f:C.depF.f;

    // 16 — Base (p. 151)
    push({ ph:'Base', src:'p. 151', stn:lastStn, freq:lastF, leg:0.95,
      reel:'Annoncez votre position.',
      consigne:'Annoncez que vous êtes en base pour la piste {PISTE}.',
      attendu:'{CALL}, base piste {PISTE}.',
      motsCles:[ {label:'Votre indicatif',ref:'callsign'},
                 {label:'En base',variantes:['base','en base']},
                 {label:'Numéro de piste',ref:'piste'} ],
      atcAfter:'{CALL}, rappelez finale piste {PISTE}.' });

    // 17 — Finale (p. 151-154)
    push({ ph:'Finale', src:'p. 151', stn:lastStn, freq:lastF, leg:0.97,
      reel:'Annoncez votre position.',
      consigne:'Annoncez que vous êtes en finale pour la piste {PISTE}.',
      attendu:'{CALL}, finale piste {PISTE}.',
      motsCles:[ {label:'Votre indicatif',ref:'callsign'},
                 {label:'En finale',variantes:['finale','en finale','final']},
                 {label:'Numéro de piste',ref:'piste'} ],
      atcAfter: (C.arrNat==='twr') ? '{CALL}, piste {PISTE}, autorisé atterrissage, vent {VENT}.'
              : '{CALL}, piste {PISTE} en service, vent {VENT}, pas de trafic connu.' });

    // 18 — Atterrissage (p. 154) — le pilote dit « j'atterris »
    push({ ph:'Atterrissage', src:'p. 154', stn:lastStn, freq:lastF, leg:0.99,
      reel:'Collationnez l\'autorisation d\'atterrissage.',
      consigne: (C.arrNat==='twr')
        ? 'Collationnez. Le pilote dit « j\'atterris » — « autorisé atterrissage » est réservé au contrôleur.'
        : 'Sans organisme de contrôle, annoncez simplement que vous atterrissez sur la piste en service.',
      attendu:'Piste {PISTE}, j\'atterris, {CALL}.',
      motsCles:[ {label:'Numéro de piste',ref:'piste'},
                 {label:'J\'atterris',variantes:["j atterris","atterris","jatterris"]},
                 {label:'Votre indicatif',ref:'callsign'} ],
      atcAfter:'{CALL}, rappelez piste dégagée.' });

    // 19 — Piste dégagée (p. 160-161)
    push({ ph:'Piste dégagée', src:'p. 160-161', stn:lastStn, freq:lastF, leg:1,
      reel:'Annoncez la piste dégagée.',
      consigne:'Annoncez que la piste est dégagée.',
      attendu:'Piste dégagée, {CALL}.',
      motsCles:[ {label:'Piste dégagée',variantes:['piste degagee','degagee','degage']},
                 {label:'Votre indicatif',ref:'callsign'} ],
      atcAfter:'{CALL}, roulez parking aviation générale.' });

    /* 20 — COLLATIONNEMENT DU ROULAGE AU PARKING (p. 45).
       Le vol s'arrêtait sur « roulez parking aviation générale » : le contrôleur
       donnait une dernière instruction, et le débriefing s'ouvrait par-dessus sans
       qu'on ait pu répondre. C'est pourtant une instruction de roulage comme une
       autre, et elle se collationne. Le vol se termine donc après NOTRE mot, pas
       après celui du contrôleur. */
    push({ ph:'Roulage au parking', src:'p. 45', stn:lastStn, freq:lastF, leg:1,
      reel:'Collationnez.',
      consigne: (C.arrNat==='twr')
        ? 'Collationnez la dernière instruction : vous roulez au parking aviation générale.'
        : 'Annoncez que vous roulez au parking.',
      attendu:'Je roule au parking aviation générale, {CALL}.',
      motsCles:[ {label:'Je roule',variantes:['je roule','roule','roulons','je rejoins']},
                 {label:'Parking',variantes:['parking','aviation generale','parking aviation generale',
                                             'aire de stationnement','stationnement']},
                 {label:'Votre indicatif',ref:'callsign'} ] });

    insererAleaMajeur(S, C);

    /* Premier échange sur une fréquence = indicatif COMPLET ; ensuite forme abrégée
       (manuel DSNA p. 18). On marque les étapes après coup : le changement de
       fréquence lui-même est un collationnement, donc encore en forme abrégée —
       c'est l'appel initial sur la NOUVELLE fréquence qui repasse en complet. */
    /* L'ORGANISME ne se nomme lui aussi qu'au premier contact : « Bordeaux Tour »
       à l'appel initial, puis plus rien — on n'annonce que son indicatif. Le
       répéter à chaque échange encombre la fréquence.
       On l'enlève donc des éléments EXIGÉS hors premier contact, et de la phrase
       d'exemple, qui doit montrer ce qu'on attend réellement. Le dire quand même
       ne coûte rien : ce n'est pas une faute, juste superflu, et aucun contrôleur
       ne vous reprendrait là-dessus.
       Un retour sur une fréquence déjà quittée redevient un premier contact :
       la comparaison ne porte que sur l'étape PRÉCÉDENTE, ce qui donne
       exactement ce comportement. */
    function sansOrganisme(txt, stn){
      if(!txt || !stn) return txt;
      var t=String(txt).replace(/^\s+/,'');
      return (t.toLowerCase().indexOf(stn.toLowerCase()+',')===0)
             ? t.slice(stn.length+1).replace(/^\s+/,'') : txt;
    }
    var freqPrec=null;
    S.forEach(function(st){
      st.premierContact = (st.freq!==freqPrec);
      freqPrec = st.freq;
      if(!st.premierContact){
        st.motsCles = (st.motsCles||[]).filter(function(mc){ return mc.label!=='Organisme appelé'; });
        st.attendu  = sansOrganisme(st.attendu, st.stn);
      }
    });
    /* Une assignation de code n'a de valeur que si le code est ensuite AFFICHÉ.
       On l'exige donc sur l'échange suivant : au-delà, on ne bloque plus, pour ne
       pas transformer un oubli en impasse. */
    for(var ci=0; ci<S.length-1; ci++)
      if(S[ci].xpdrAssign && !S[ci+1].xpdrReq && !S[ci+1].identReq)
        S[ci+1].xpdrReq=S[ci].xpdrAssign;
    F.steps=S; F.i=0; F.results=[]; F.dits=[]; F.attendus=[];
  }

  /* ================= ALÉAS MAJEURS EN VOL =================
     Événements qui CHANGENT le déroulé, contrairement aux aléas d'information :
     urgences, guidage imposé, terrain d'arrivée fermé (déroutement).

     Sources : structure MAYDAY / PAN PAN du manuel DSNA (p. 238 — organisme,
     identification, nature, intentions, position), guidage et modification de cap
     (p. 191 et 195), information sur l'état des aérodromes (p. 208).
     Le manuel ne donne AUCUNE formulation de déroutement : celle-ci est construite
     sur la rubrique « intentions du commandant de bord », qui est bien du manuel,
     mais la phrase exacte n'y figure pas. */
  function aleaUrgenceVol(kind, stn, freq, leg){
    var M={ moteur:{g:'MAYDAY', cause:'panne moteur'},
            fumee:{g:'MAYDAY', cause:'fumée en cabine'},
            malaise:{g:'PAN PAN', cause:'passager malade'} };
    var e=M[kind], g=e.g, gl=g.toLowerCase();
    var rep=(g==='MAYDAY') ? g+' '+g+' '+g : g+' '+g+' '+g;
    return [
      { ph:g==='MAYDAY'?'Détresse':'Urgence', src:'p. 238', stn:stn, freq:freq, leg:leg, majeur:true,
        situation:'Aléa en vol : '+e.cause+'.',
        reel:'Transmettez votre message de détresse.',
        consigne:g+' répété trois fois, organisme, votre indicatif, nature du problème, vos intentions.',
        attendu:rep+', '+stn+', {CALL}, '+e.cause+', demande assistance, je me déroute.',
        motsCles:[ {label:'Appel ('+g+' ×3)',variantes:[gl+' '+gl+' '+gl, gl]},
                   {label:'Votre indicatif',ref:'callsign'},
                   {label:'Nature du problème',variantes:e.cause.split(' ').filter(function(w){return w.length>3;})},
                   {label:'Vos intentions',variantes:['assistance','je me pose','pose','deroute','deroutement','atterrissage','descends','priorite']} ],
        atcAfter: g==='MAYDAY'
          ? '{CALL}, '+g+' reçu, transpondeur 7700, vous êtes prioritaire.'
          : '{CALL}, '+g+' reçu, maintenez l\'écoute.' },
      { ph:'Collationnement '+(g==='MAYDAY'?'détresse':'urgence'), src:'p. 238', stn:stn, freq:freq, leg:leg, majeur:true,
        reel:'Collationnez.',
        consigne: g==='MAYDAY' ? 'Collationnez le transpondeur.' : 'Accusez réception.',
        attendu: g==='MAYDAY' ? 'Transpondeur 7700, {CALL}.' : 'Roger, {CALL}.',
        motsCles: g==='MAYDAY'
          ? [ {label:'Transpondeur 7700',variantes:['7700','transpondeur 7700','sept sept zero zero','squawk 7700','affiche 7700']},
              {label:'Votre indicatif',ref:'callsign'} ]
          : [ {label:'Accusé de réception',variantes:['roger','recu','bien recu','wilco']},
              {label:'Votre indicatif',ref:'callsign'} ],
        /* Le code se collationne ET s'affiche : sans cela on pouvait dire « 7700 »
           sans jamais toucher au boîtier, et la détresse restait un mot. */
        xpdrAssign: g==='MAYDAY' ? '7700' : undefined }
    ];
  }
  /* Un guidage n'est pas un événement isolé : on est sorti de sa route, et le
     contrôleur doit vous y remettre. L'exercice s'arrêtait au collationnement du
     cap, et l'échange suivant reprenait comme si de rien n'était — on restait
     théoriquement en train de voler au cap imposé jusqu'à l'arrivée. */
  function aleaCapVol(stn, freq, leg, C){
    var cap=Math.floor(Math.random()*36)*10, c3=String(cap).padStart(3,'0');
    var cote=Math.random()<0.5?'droite':'gauche';
    var dest=(C&&C.arr)?C.arr.nom:'votre destination';
    return [{ ph:'Changement de cap', src:'p. 195', stn:stn, freq:freq, leg:leg, majeur:true,
      atcBefore:'{CALL}, pour espacement, tournez à '+cote+' cap '+c3+'.',
      reel:'Collationnez le nouveau cap.',
      consigne:'Collationnez : le sens du virage, puis le cap.',
      attendu:'À '+cote+' cap '+c3+', {CALL}.',
      motsCles:[ {label:'Sens du virage',variantes:['a '+cote, 'par la '+cote, cote]},
                 {label:'Cap',variantes:['cap','au cap']},
                 {label:'Valeur de cap',variantes:numVariants(c3)},
                 {label:'Votre indicatif',ref:'callsign'} ] },
      { ph:'Reprise de navigation', src:'p. 195', stn:stn, freq:freq, leg:leg, majeur:true,
        atcBefore:'{CALL}, espacement assuré, reprenez votre navigation vers '+dest+', cap à votre convenance.',
        reel:'Collationnez.',
        consigne:'Le guidage est terminé : collationnez la reprise de votre navigation.',
        attendu:'Je reprends ma navigation vers '+dest+', {CALL}.',
        motsCles:[ {label:'Reprise de navigation',variantes:['je reprends','reprends','reprise','navigation','route directe','directe']},
                   {label:'Destination',variantes:(C&&C.arr)?destVars(C.arr):['destination']},
                   {label:'Votre indicatif',ref:'callsign'} ] }];
  }
  function aleaRadioVol(stn, freq, leg){
    return [{ ph:'Panne radio', src:'p. 246-248', stn:stn, freq:freq, leg:leg, majeur:true,
      atcBefore:'{CALL}, '+stn+', me recevez-vous ? Si vous me recevez, transpondeur ident.',
      reel:'Répondez si vous entendez.',
      consigne:'Vous entendez le contrôleur : répondez et confirmez que vous affichez ident.',
      attendu:'{CALL}, je vous reçois, transpondeur ident.',
      motsCles:[ {label:'Votre indicatif',ref:'callsign'},
                 {label:'Réception',variantes:['je vous recois','recois','recu','fort et clair','cinq sur cinq']},
                 {label:'Transpondeur ident',variantes:['ident','transpondeur ident','affiche ident','squawk ident']} ],
      identReq:true },
      /* Une panne radio se termine — ou pas. Ici la liaison revient, et le
         contrôleur le dit : sans cet échange, l'élève restait avec un doute sur
         l'état de sa radio pour tout le reste du vol. */
      { ph:'Liaison rétablie', src:'p. 246-248', stn:stn, freq:freq, leg:leg, majeur:true,
        atcBefore:'{CALL}, '+stn+', je vous reçois de nouveau fort et clair, liaison rétablie.',
        reel:'Accusez réception.',
        consigne:'Accusez réception du rétablissement de la liaison.',
        attendu:'Reçu fort et clair, {CALL}.',
        motsCles:[ {label:'Accusé de réception',variantes:['recu','roger','fort et clair','cinq sur cinq','bien recu']},
                   {label:'Votre indicatif',ref:'callsign'} ] }];
  }
  function aleaTerrainFerme(stn, freq, leg, arr, deroute){
    return [{ ph:'Terrain fermé', src:'p. 208', stn:stn, freq:freq, leg:leg, majeur:true, deroute:deroute,
      atcBefore:'{CALL}, information : '+arr.nom+' est fermé, piste inutilisable.',
      reel:'Annoncez votre déroutement.',
      consigne:'Le terrain d\'arrivée est fermé : annoncez que vous vous déroutez vers '+deroute.nom+'.',
      attendu:'Roger, je me déroute vers '+deroute.nom+', {CALL}.',
      motsCles:[ {label:'Accusé de réception',variantes:['roger','recu','bien recu','copie']},
                 {label:'Déroutement',variantes:['deroute','deroutement','je me deroute','divert','detourne']},
                 {label:'Nouveau terrain',variantes:destVars(deroute)},
                 {label:'Votre indicatif',ref:'callsign'} ] }];
  }

  /* ---- Bibliothèque d'aléas (un seul échange chacun) ----
     Chaque entrée porte sa page du manuel DSNA. Les accusés de réception simples
     reprennent « Roger » (p. 19-21) ; les collationnements reprennent la valeur.
     `mk` construit un aléa à partir d'un message ATC et de mots-clés. */
  function accuseSimple(){
    return [ {label:'Accusé de réception',variantes:['roger','recu','bien recu','copie','wilco']},
             {label:'Votre indicatif',ref:'callsign'} ];
  }
  function mk(ph,src,atc,consigne,attendu,mots,reel){
    return function(stn,freq,leg,C){
      return [{ ph:ph, src:src, stn:stn, freq:freq, leg:leg, majeur:true,
        atcBefore:atc, reel:reel||'Répondez au contrôleur.', consigne:consigne,
        attendu:attendu, motsCles:mots||accuseSimple() }];
    };
  }
  var LIEUX=['Montauban','Chartres','Auxerre','Vierzon','Cognac','Épernay','Vichy','Bergerac'];
  function unLieu(){ return LIEUX[Math.floor(Math.random()*LIEUX.length)]; }
  function unCode(){ return codeSSR(); }   // code SSR octal, cf. helper global

  var ALEAS_VOL = [
    // ---- Information de vol (manuel p. 205-213) ----
    mk('Renseignement SIGMET','p. 205','{CALL}, renseignement SIGMET, givrage modéré à fort entre niveau 90 et niveau 130 sur votre route.',
       'Accusez réception du SIGMET.','Roger, {CALL}.'),
    mk('Turbulence signalée','p. 205','{CALL}, un pilote signale de fortes turbulences sur votre route.',
       'Accusez réception.','Roger, {CALL}.'),
    mk('Cendres volcaniques','p. 206','{CALL}, renseignement SIGMET, nuage de cendres volcaniques entre niveau 200 et niveau 350 sur votre route, pas de restriction particulière.',
       'Accusez réception.','Roger, {CALL}.'),
    mk('Balise en panne','p. 207','{CALL}, V-O-R "{BAL}" en panne.',
       'Accusez réception de l\'indisponibilité.','Roger, {CALL}.'),
    mk('Activité aviaire','p. 208','{CALL}, activité aviaire signalée sur votre route.',
       'Accusez réception.','Roger, {CALL}.'),
    mk('Zone réglementée','p. 208','{CALL}, {ZONE} active.',
       'Accusez réception : vous devrez la contourner.','Roger, {CALL}.',
       [ {label:'Accusé de réception',variantes:['roger','recu','bien recu','copie','evite','contourne']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    mk('Météo en route','p. 209','{CALL}, stratus signalés dans la région de {LIEU}.',
       'Accusez réception de l\'information météo.','Roger, {CALL}.'),
    mk('Météo défavorable','p. 209','{CALL}, un pilote signale des conditions météorologiques défavorables au voisinage de {LIEU}.',
       'Accusez réception.','Roger, {CALL}.'),
    mk('Trafic convergent','p. 211','{CALL}, trafic convergent, route 180, estimant {LIEU} à 52, Cessna 172, même altitude.',
       'Accusez réception, ou annoncez le trafic en vue.','Roger, {CALL}.',
       [ {label:'Réponse trafic',variantes:['roger','trafic en vue','en vue','recu','negatif','pas en vue']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    mk('Trafic inconnu','p. 211','{CALL}, trafic lent, inconnu, 1 heure, 8 nautiques, route nord-est, altitude inconnue.',
       'Répondez : « trafic en vue », sinon « négatif ».','Trafic en vue, {CALL}.',
       [ {label:'Réponse trafic',variantes:['trafic en vue','en vue','negatif','pas en vue','je cherche','roger']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    mk('Suggestion de manœuvre','p. 212','{CALL}, trafic non identifié, 1 heure, 8 nautiques. Je vous suggère de tourner à droite 20 degrés.',
       'Collationnez la manœuvre suggérée.','Je tourne à droite 20 degrés, {CALL}.',
       [ {label:'Virage',variantes:['tourne a droite','a droite','droite','20 degres','vingt degres']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    mk('Assurez votre séparation','p. 213','{CALL}, trafic 2 heures, 12 nautiques, convergent, même niveau, assurez votre séparation.',
       'Répondez : vous n\'avez pas le visuel, ou vous l\'avez.','Pas visuel sur le trafic, {CALL}.',
       [ {label:'Réponse trafic',variantes:['pas visuel','pas en vue','negatif','trafic en vue','en vue','roger']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    mk('Dégagé du trafic','p. 213','{CALL}, dégagé du trafic.',
       'Accusez réception.','Roger, {CALL}.'),
    // ---- Transpondeur (p. 186) ----
    mk('Code transpondeur','p. 186','{CALL}, transpondeur {CODE}.',
       'Collationnez le code assigné.','Transpondeur {CODE}, {CALL}.',
       [ {label:'Transpondeur',variantes:['transpondeur','squawk','affiche']},
         {label:'Code assigné',variantes:['__CODE__']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    // ---- Attentes (p. 127) ----
    mk('Attente','p. 127','{CALL}, attendez à vue verticale {LIEU}, cause trafic.',
       'Collationnez l\'attente.','J\'attends verticale {LIEU}, {CALL}.',
       [ {label:'J\'attends',variantes:['j attends','attends','attente','verticale']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    mk('Délai','p. 127','{CALL}, prévoyez 10 minutes de délai, cause trafic.',
       'Accusez réception du délai.','Roger, 10 minutes de délai, {CALL}.',
       [ {label:'Accusé de réception',variantes:['roger','recu','bien recu','delai','dix minutes','10 minutes']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    mk('Pas de délai','p. 127','{CALL}, pas de délai prévu.',
       'Accusez réception.','Roger, {CALL}.'),
    // ---- Guidage et cap (p. 191, 195) ----
    mk('Guidage','p. 191','{CALL}, pour séparation, guidage radar, tournez à gauche cap 270.',
       'Collationnez le cap.','À gauche cap 270, {CALL}.',
       [ {label:'Sens du virage',variantes:['a gauche','gauche','par la gauche']},
         {label:'Cap',variantes:['cap','au cap']},
         {label:'Valeur de cap',variantes:['270','deux sept zero','deux cent soixante dix']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    mk('Reprise de navigation','p. 191','{CALL}, guidage terminé, reprenez votre navigation propre.',
       'Collationnez.','Je reprends ma navigation, {CALL}.',
       [ {label:'Reprise',variantes:['reprends','reprise','navigation propre','navigation']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    mk('Maintien de cap','p. 195','{CALL}, maintenez le cap actuel.',
       'Collationnez.','Je maintiens le cap, {CALL}.',
       [ {label:'Je maintiens',variantes:['maintiens','je maintiens','maintien','cap']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    // ---- Altitude (p. 17, 178) ----
    mk('Changement d\'altitude','p. 178','{CALL}, pour séparation, montez altitude 4500 pieds.',
       'Collationnez la nouvelle altitude.','Je monte altitude 4500 pieds, {CALL}.',
       [ {label:'Je monte',variantes:['monte','je monte','montons']},
         {label:'Altitude',variantes:['4500','quatre mille cinq cents','quarante cinq']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    mk('Descente demandée','p. 178','{CALL}, descendez altitude 2000 pieds, trafic en croisement.',
       'Collationnez la nouvelle altitude.','Je descends altitude 2000 pieds, {CALL}.',
       [ {label:'Je descends',variantes:['descends','je descends','descente']},
         {label:'Altitude',variantes:['2000','deux mille','vingt']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    // ---- État des aérodromes (p. 208) ----
    mk('Piste non inspectée','p. 208','{CALL}, information : inspection de piste non effectuée à destination.',
       'Accusez réception.','Roger, {CALL}.'),
    mk('Piste contaminée','p. 208','{CALL}, information : eau stagnante sur la piste à destination.',
       'Accusez réception.','Roger, {CALL}.'),
    mk('Vent arrière signalé','p. 235','{CALL}, vent secteur arrière signalé 10 nœuds en finale à destination.',
       'Accusez réception.','Roger, {CALL}.'),
    // ---- VFR spécial (p. 174) ----
    mk('VFR spécial','p. 174','{CALL}, conditions VFR spécial à destination, prévoyez 10 minutes de délai.',
       'Accusez réception.','Roger, {CALL}.'),
    // ---- Fréquence (p. 182) ----
    mk('Veille demandée','p. 182','{CALL}, veillez {FREQ}.',
       'Collationnez la fréquence à veiller.','Je veille {FREQ}, {CALL}.',
       [ {label:'Veille',variantes:['veille','je veille','veillez']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    mk('Rappel demandé','p. 182','{CALL}, rappelez dans cinq minutes.',
       'Accusez réception.','Je rappelle dans cinq minutes, {CALL}.',
       [ {label:'Je rappelle',variantes:['rappelle','je rappelle','rappel']},
         {label:'Votre indicatif',ref:'callsign'} ]),
    mk('Standby','p. 19-21','{CALL}, standby.',
       'Accusez réception et attendez.','Standby, {CALL}.',
       [ {label:'Standby',variantes:['standby','stand by','j attends','attends','roger']},
         {label:'Votre indicatif',ref:'callsign'} ])
  ];

  /* Imprévu imposé depuis la console d'administration (#admin/test) : au lieu
     d'attendre le tirage au sort, on demande CET imprévu-là pour le prochain vol.
     Usage unique — la valeur est consommée dès la construction du vol suivant,
     de sorte que la logique aléatoire normale reprend aussitôt la main. */
  var aleaImpose=null;

  /* Insère AU PLUS un aléa majeur par vol, avant la phase d'arrivée.
     Probabilité plus forte en mode Réel, comme dans les scénarios. */
  /* ================= CE QU'UN IMPRÉVU CHANGE POUR LA SUITE =================
     Un aléa majeur ne durait qu'un échange : on déclarait une panne moteur, on
     collationnait 7700, et deux messages plus loin le contrôleur donnait un
     nouveau code transpondeur et un numéro 3 dans le circuit, comme si rien ne
     s'était passé. Une urgence déclarée ne se referme pas : elle vous suit
     jusqu'au parking, et c'est cela qu'on apprend.

     On réécrit donc les étapes SUIVANTES. Trois conséquences, toutes réelles :
       - le code transpondeur ne change plus (on garde 7700 / 7000) ;
       - la priorité à l'atterrissage, donc numéro 1 dans le circuit ;
       - les secours annoncés à l'arrivée pour une détresse (MAYDAY), pas pour une
         simple urgence (PAN PAN), où l'on ne déclenche pas le plan.
     Le déroutement (terrain fermé) avait déjà sa propre suite, plus bas. */
  function consequencesUrgence(S, C, kind, apres){
    var detresse = (kind==='moteur' || kind==='fumee');   // MAYDAY ; malaise = PAN PAN
    C.urgenceEnCours = kind;
    for(var i=apres; i<S.length; i++){
      var st=S[i];
      /* Plus aucun code assigné après une urgence : on ne demande pas à un pilote
         en détresse d'aller tourner ses roues de transpondeur. */
      if(st.xpdrAssign) st.xpdrAssign=null;
      if(st.xpdrReq)    st.xpdrReq=null;
      if(st.ph==='Intégration'){
        st.atcAfter='{CALL}, reçu, vous êtes prioritaire. Entrez vent arrière piste {PISTE}, '+
                    'QNH {QNH}, numéro 1, rappelez vent arrière'+
                    (detresse?'. Les services de secours sont en place.':'.');
        // Prioritaire veut dire numéro 1 : on force le tirage du circuit.
        st.onEnter=(function(precedent){
          return function(){ if(precedent) precedent(); state.numCircuit=1; };
        })(st.onEnter);
      }
      else if(st.ph==='Finale' && detresse){
        st.atcAfter='{CALL}, piste {PISTE}, autorisé atterrissage, vent {VENT}. '+
                    'Secours en bord de piste.';
      }
      else if(st.ph==='Piste dégagée'){
        st.atcAfter= detresse
          ? '{CALL}, roulez parking aviation générale, les secours vous rejoignent.'
          : '{CALL}, roulez parking aviation générale, une assistance vous attend.';
      }
    }
  }

  function insererAleaMajeur(S, C){
    var impose=aleaImpose; aleaImpose=null;             // consommé, quoi qu'il arrive
    if(impose==='aucun') return;                        // « aucun imprévu », à la demande
    if(!C.arr) return;                                  // vol local : pas de déroutement
    if(!impose && Math.random() >= 0.5) return;         // environ un vol sur deux
    // Point d'insertion : juste avant l'intégration.
    var idx=-1;
    for(var i=0;i<S.length;i++) if(S[i].ph==='Intégration'){ idx=i; break; }
    if(idx<1) return;
    var ref=S[idx-1], stn=ref.stn, freq=ref.freq, leg=Math.min(0.75,(ref.leg||0.6)+0.01);
    /* Tirage parmi TOUS les aléas : les 5 « lourds » (urgences, guidage, panne radio,
       terrain fermé) et la bibliothèque de messages du service d'information. */
    var alt = sel.alt && BY[sel.alt] ? BY[sel.alt] : null;
    var choix=['moteur','fumee','malaise','cap','radio'];
    if(alt) choix.push('ferme');
    for(var q=0;q<ALEAS_VOL.length;q++) choix.push('lib:'+q);
    var kind=choix[Math.floor(Math.random()*choix.length)];
    /* Le terrain fermé n'a de sens qu'avec un dégagement : sans lui, l'imprévu
       imposé retomberait sur un déroutement sans destination. */
    if(impose && (impose!=='ferme' || alt)) kind=impose;
    var bloc;
    if(kind.indexOf('lib:')===0){
      bloc=ALEAS_VOL[parseInt(kind.slice(4),10)](stn,freq,leg,C);
      // Substitution des éléments variables du message.
      var lieu=unLieu(), code=unCode(), bal=BALISES[Math.floor(Math.random()*BALISES.length)];
      var zone=ZONES_R[Math.floor(Math.random()*ZONES_R.length)];
      bloc.forEach(function(st){
        ['atcBefore','consigne','attendu'].forEach(function(k){
          if(typeof st[k]==='string') st[k]=st[k]
            .replace(/\{LIEU\}/g,lieu).replace(/\{CODE\}/g,code)
            .replace(/\{BAL\}/g,bal).replace(/\{ZONE\}/g,zone)
            .replace(/\{FREQ\}/g,fq(freq));
        });
        if(st.motsCles) st.motsCles=st.motsCles.map(function(mc){
          if(mc.variantes && mc.variantes[0]==='__CODE__')
            return {label:mc.label, variantes:numVariants(code)};
          return mc;
        });
      });
      C.aleaNom=bloc[0].ph;
    }
    else if(kind==='cap')   bloc=aleaCapVol(stn,freq,leg,C);
    else if(kind==='radio') bloc=aleaRadioVol(stn,freq,leg);
    else if(kind==='ferme') bloc=aleaTerrainFerme(stn,freq,leg,C.arr,alt);
    else                    bloc=aleaUrgenceVol(kind,stn,freq,leg);
    S.splice.apply(S,[idx,0].concat(bloc));
    C.alea=kind;
    /* L'imprévu se répercute sur tout ce qui suit. */
    if(kind==='moteur'||kind==='fumee'||kind==='malaise')
      consequencesUrgence(S, C, kind, idx+bloc.length);
    /* Terrain fermé : les échanges d'arrivée doivent viser le terrain de déroutement,
       sinon on continuerait à parler au terrain qu'on vient de renoncer à rejoindre. */
    if(kind==='ferme' && alt){
      var nf=freqOf(alt,['TWR','AFIS','APP','A/A','UNIC','CTAF']);
      var nstn=nf?stnName(alt,nf.k):alt.nom+' auto-information';
      for(var j=idx+bloc.length;j<S.length;j++){
        S[j].stn=nstn; S[j].freq=nf?nf.f:null;
      }
      C.arrReelle=alt;
    }
  }

  // Variantes de reconnaissance pour un nom d'organisme / une fréquence / une destination.
  function stnVars(stn,kind){
    var base=stn.replace(/\s+(Tour|Sol|Approche|Information)$/,'');
    var v=[base.toLowerCase()];
    base.split(/[\s'’\-]+/).forEach(function(w){ if(w.length>3) v.push(w.toLowerCase()); });
    if(kind==='TWR') v.push('tour'); if(kind==='GND') v.push('sol');
    if(kind==='APP') v.push('approche'); if(kind==='AFIS') v.push('information','info');
    return v;
  }
  // Variantes pour le type d'avion et le nombre de personnes à bord.
  function acVars(ab){
    var v=[ab.toLowerCase()];
    ab.toLowerCase().split(/[\s-]+/).forEach(function(w){ if(w.length>2) v.push(w); });
    return v;
  }
  var NOMBRES=['zero','une','deux','trois','quatre','cinq','six','sept','huit','neuf'];
  function paxVars(n){
    var v=[String(n),'a bord','personne','personnes'];
    if(NOMBRES[n]) v.push(NOMBRES[n]+' personne', NOMBRES[n]+' personnes', NOMBRES[n]);
    return v;
  }
  function destVars(a){
    var v=[a.nom.toLowerCase()];
    a.nom.split(/[\s'’\-–()]+/).forEach(function(w){ if(w.length>3) v.push(w.toLowerCase()); });
    return v;
  }
  // Certains terrains (ex. Amiens-Glisy) n'ont AUCUNE fréquence publiée dans OurAirports.
  // On n'en invente pas : les étapes qui exigent une fréquence sont alors omises.
  function fq(f){ return f==null?'':String(f).replace('.',','); }
  // Une fréquence peut être dite « 120 décimale 75 », « 120 75 », « cent vingt virgule… »
  function freqVars(f){
    var s=String(f), p=s.split('.');
    return [s, s.replace('.',','), s.replace('.',' '), p.join(' decimale '), p.join(' virgule '), p[0]+' '+(p[1]||'')];
  }

  // ---- Rendu d'une étape ----
  function vfLog(who,txt){
    var d=document.createElement('div'); d.className='r '+who;
    var w=(who==='atc')?'ATC':(who==='you'?'Vous':'—');
    d.innerHTML='<span class="who">'+w+'</span>'+esc(txt);
    $v('vfLog').appendChild(d); $v('vfLog').scrollTop=1e6;
    return d;
  }

  /* ================= AFFICHAGE DES MESSAGES DU CONTRÔLEUR =================
     Débutant : le message est écrit, on peut le relire.
     Réel     : il n'est PAS écrit. On entend la transmission, on peut la réécouter,
                et le texte n'apparaît dans le journal qu'APRÈS avoir répondu — pour
                que le débriefing reste consultable sans donner la réponse d'avance. */
  /* ================= DIFFUSION ATIS EN BOUCLE =================
     Un ATIS tourne sans interruption : on ne l'« appelle » pas, on se cale sur sa
     fréquence et on attend le passage qui nous intéresse. Le message est donc
     rejoué tant qu'on reste sur l'étape et sur la bonne fréquence, avec la courte
     pause qui sépare deux diffusions. Se caler ailleurs coupe l'écoute. */
  var atisBoucle=null;
  function arreterAtis(){
    if(!atisBoucle) return;
    atisBoucle.actif=false; clearTimeout(atisBoucle.t); atisBoucle=null;
    Voix.stop();          // arret franc : aucune reprise en attente ne survit
  }
  VOIX_ARRETS.push(function(){ arreterAtis(); });
  /* Le decoupage en courtes phrases et la resistance aux blocages de Chrome sont
     desormais assures par le moteur de parole (voir Voix, section 5). Ici on ne
     s'occupe plus que de la BOUCLE : on redit le message apres une courte pause,
     tant qu'on reste cale sur la frequence. */
  function lancerAtis(texte){
    if(atisBoucle) return;                       // deja en diffusion
    var b={actif:true,t:null}; atisBoucle=b;
    if(!window.speechSynthesis) return;
    function tour(){
      if(!b.actif || !F.running || atisBoucle!==b) return;
      Voix.parler(fillSpeech(texte), {
        rate:state.voiceRate, pitch:1.0,
        onDebut:startRadioNoise,
        onFin:function(){
          stopRadioNoise();
          if(!b.actif || atisBoucle!==b) return;
          b.t=setTimeout(tour, 2600);            // pause entre deux diffusions
        }
      });
    }
    tour();
  }
  /* Appelee a chaque manipulation de la radio : c'est le calage sur la frequence
     qui declenche l'ecoute, pas l'affichage de l'etape. */
  function majEcouteAtis(){
    var s=F.steps[F.i];
    if(!F.running || !s || !s.atisStep){ arreterAtis(); return; }
    if(surBonneFreq()){
      if(!atisBoucle){
        /* Affichage propre à l'ATIS. On n'emprunte PAS messageATC() : en mode Réel
           celui-ci pose un bouton « Réécouter » qui, en relançant une parole,
           coupait la diffusion en cours et tuait la boucle pour de bon — alors
           qu'un ATIS repasse tout seul. Il consigne aussi une ligne de journal à
           dévoiler « après la réponse », or on ne répond pas sur cette fréquence :
           la ligne serait restée masquée jusqu'à la fin du vol. */
        if(level!=='reel'){
          $v('vfAtc').innerHTML='<b>'+esc(s.stn||'ATIS')+' :</b> '+esc(fillDisplay(s.atcBefore));
          vfLog('atc', fillDisplay(s.atcBefore));
        } else {
          $v('vfAtc').innerHTML='<div class="vf-ecoute"><span class="qui">'+ICONS.son+
            esc(s.stn||'ATIS')+' — diffusion en cours, elle repasse en boucle.</span></div>';
          vfLog('sys','Écoute de l\'ATIS sur '+fmtF(s.freq)+'.');
        }
        lancerAtis(s.atcBefore);
      }
    } else {
      arreterAtis();
      $v('vfAtc').innerHTML='<div class="vf-ecoute"><span class="qui">'+ICONS.son+
        'Rien sur cette fréquence — affichez celle de l\'ATIS pour l\'écouter.</span></div>';
    }
  }

  /* Message d'ACCUEIL d'une nouvelle station (atcBefore). En radio manuelle il ne
     doit pas tomber tant que le pilote n'a pas affiché la fréquence : on entendait
     le contrôleur du secteur suivant AVANT d'avoir quitté le précédent, ce qui
     n'arrive évidemment jamais en vol. Même porte que l'ATIS juste au-dessus.
     Hors radio manuelle, surBonneFreq() renvoie true : le message part aussitôt,
     comportement inchangé. */
  function majAccueilStation(){
    var s=F.steps[F.i];
    if(!F.running || !s || s.atisStep || !s.atcBefore || F.accueilDit) return;
    if(!surBonneFreq()){
      $v('vfAtc').innerHTML='<div class="vf-ecoute"><span class="qui">'+ICONS.son+
        'Rien sur cette fréquence — affichez '+fmtF(s.freq)+' pour contacter '+
        esc(s.stn||'la station')+'.</span></div>';
      return;
    }
    F.accueilDit=true;
    messageATC(s.stn, s.atcBefore);
  }

  var aRevELer=[];                 // lignes de journal masquées, à dévoiler après la réponse
  /* Dernier message reçu, conservé sous sa forme BRUTE (avec ses {PLACEHOLDERS}) :
     c'est lui que rejoue le bouton « Répétez ». On garde le brut et non le texte
     résolu pour que la répétition passe par le même chemin que l'original — même
     voix, même bruit de fond, même affichage selon le niveau. */
  function messageATC(stn, brut, urgent, muet){
    F.dernierATC={stn:stn, brut:brut, urgent:urgent};
    var texte=fillDisplay(brut), atc=$v('vfAtc');
    if(level!=='reel'){
      atc.innerHTML='<b>'+esc(stn||'ATC')+' :</b> '+esc(texte);
      vfLog('atc',texte);
    } else {
      atc.innerHTML='<div class="vf-ecoute"><span class="qui">'+ICONS.son+
        esc(stn||'Le contrôle')+' vous transmet</span>'+
        '<button class="vf-rejouer" type="button" data-rejouer>'+ICONS.rejouer+'Réécouter</button></div>';
      var b=atc.querySelector('[data-rejouer]');
      if(b) b.addEventListener('click',function(){ speakATC(brut, urgent); });
      var ligne=vfLog('atc','(transmission — répondez, le texte s\'affichera ensuite)');
      ligne.classList.add('attente');
      aRevELer.push({el:ligne, texte:texte});
    }
    if(!muet) speakATC(brut, urgent);
  }
  function devoilerATC(){
    aRevELer.forEach(function(o){
      o.el.classList.remove('attente');
      o.el.innerHTML='<span class="who">ATC</span>'+esc(o.texte);
    });
    aRevELer=[];
  }
  /* ================= RADIO COM =================
     Fonctionnement réel : on n'émet que sur la fréquence ACTIVE. Quand le contrôleur
     transfère (« contactez X 119,800 »), il faut afficher 119,800 en STANDBY puis
     permuter. Tant que ce n'est pas fait, le nouvel organisme ne répond pas. */
  var radio={ act:null, stby:null, attendue:null };

  /* Habillage selon la machine. Les postes cités sont ceux qu'on rencontre
     couramment dans ces avions ; le rendu s'en inspire sans prétendre les copier.
     Seules les trois familles les plus répandues ont leur façade ; tout le reste
     reçoit un rack générique. */
  var RADIO_SKINS={
    Cessna:{skin:'cessna', nom:'GARMIN'},
    Piper: {skin:'piper',  nom:'BENDIX KING'},
    Robin: {skin:'robin',  nom:'BECKER'}
  };
  /* Un seul habillage pour toutes les machines : celui du DR400 (poste Becker,
     afficheur ambre). RADIO_SKINS est conserve — il suffirait de rendre cette
     fonction dependante de acChoice.fam pour revenir a un poste par famille. */
  function skinCourant(){ return {skin:'robin', nom:'BECKER'}; }
  /* ================= PHOTO D'AVION =================
     Une photo differente a chaque vol. Elle est DECORATIVE : elle ne represente
     pas la machine choisie dans le formulaire (les photos disponibles ne couvrent
     pas les types d'ecole). On evite seulement de repeter celle du vol precedent. */
  function choisirAvionPhoto(){
    var fig=$v('vfAvion'); if(!fig) return;
    var L=(typeof NAV_AVIONS!=='undefined') ? NAV_AVIONS : [];
    if(!L.length){ fig.style.display='none'; return; }
    var S=rtSettings();
    var prec=(typeof S.photoAvion==='number') ? S.photoAvion : -1;
    var choix=[]; for(var k=0;k<L.length;k++) if(k!==prec) choix.push(k);
    if(!choix.length) choix=[0];
    var i=choix[Math.floor(Math.random()*choix.length)];
    try{ S.photoAvion=i; rtSaveSettings(S); }catch(e){}
    var a=L[i], img=$v('vfAvionImg');
    img.src='assets/avions/'+a.f; img.alt=a.nom;
    $v('vfAvionLeg').innerHTML='<b>'+esc(a.nom)+'</b>';
    /* Une image manquante (dossier non televerse) laisserait un cadre vide
       avec l'icone « image cassee » : on masque plutot le bloc. */
    img.onerror=function(){ fig.style.display='none'; };
    fig.style.display='';
  }

  function radioSkin(){
    var d=skinCourant();
    ['vfRadio','vfXpdr'].forEach(function(id){
      var e=$v(id); if(e) e.setAttribute('data-skin', d.skin);
    });
    var n=$v('radioNom'); if(n) n.textContent=d.nom;
  }
  function fmtF(f){ return f==null?'—':Number(f).toFixed(3); }
  function majRadio(){
    $v('radioAct').textContent = fmtF(radio.act);
    var st=$v('radioStby');
    st.textContent = fmtF(radio.stby);
    // La standby clignote quand elle correspond à la fréquence attendue : prêt à permuter.
    var pret = radio.attendue!=null && radio.stby!=null &&
               Math.abs(Number(radio.stby)-Number(radio.attendue))<0.0005;
    st.classList.toggle('attendue', pret);
    $v('radioSwap').classList.toggle('pret', pret);
    majAideRadio();
    if(typeof majEcouteAtis==='function') majEcouteAtis();
    if(typeof majAccueilStation==='function') majAccueilStation();
  }
  function surBonneFreq(){
    var s=F.steps[F.i];
    if(!s || !s.freq) return true;                  // étape sans fréquence : rien à vérifier
    if(!radioManuelle()) return true;               // mode manuel désactivé
    return radio.act!=null && Math.abs(Number(radio.act)-Number(s.freq))<0.0005;
  }
  function majAideRadio(){
    var a=$v('radioAide'); if(!a) return;
    var s=F.steps[F.i];
    if(!radioManuelle()){
      a.textContent=''; a.classList.remove('alerte'); cible($v('radioCible'),null); return;
    }
    /* Pastille : la fréquence à afficher, en clair. Elle sert de filet quand le
       contrôleur ne l'a pas annoncée (transfert automatique, début de vol) — sans
       elle, l'élève n'a aucun moyen de la deviner. Elle s'efface une fois réglée. */
    var manque = s && s.freq!=null && !surBonneFreq();
    /* Même format que l'afficheur du poste (3 décimales) pour éviter toute ambiguïté.
       Exception : sur l'écoute ATIS on ne souffle pas la fréquence — aller la
       chercher fait partie de l'exercice, et la consigne la donne déjà. */
    cible($v('radioCible'),
      (manque && !(s && s.atisStep)) ? [(s.stn||'Station')+' écoute sur', fmtF(s.freq)] : null);
    if(manque){
      a.textContent='Vous émettez sur '+fmtF(radio.act)+' — '+(s.stn||'la station')+
        ' est sur '+fmtF(s.freq)+'. Affichez-la en standby puis permutez.';
      a.classList.add('alerte');
    } else if(s && s.freq==null && radio.act==null){
      // 186 terrains ne publient aucune fréquence : il n'y a rien à afficher.
      a.textContent='Aucune fréquence n\'est publiée pour ce terrain : émettez sans rien régler.';
      a.classList.remove('alerte');
    } else if(radio.attendue!=null){
      a.textContent='Nouvelle fréquence à afficher en standby, puis permutez.';
      a.classList.remove('alerte');
    } else { a.textContent=''; a.classList.remove('alerte'); }
  }

  /* ================= RÉPONSES RÉELLES DU CONTRÔLEUR =================
     Toutes les formulations ci-dessous sont celles du manuel DSNA : on ne devine
     pas ce que dirait un contrôleur, on cite ce qu'il dit. */

  // Station de la fréquence sur laquelle on émet réellement (souvent la précédente).
  function stationSur(f){
    if(f==null) return null;
    for(var i=0;i<F.steps.length;i++){
      var st=F.steps[i];
      if(st.freq!=null && Math.abs(Number(st.freq)-Number(f))<0.0005) return st.stn;
    }
    return null;
  }

  /* Émission sur une mauvaise fréquence. Premier essai : silence, comme en vrai.
     Ensuite l'organisme QUE VOUS ÉCOUTEZ ENCORE vous rappelle — c'est exactement la
     procédure d'interruption des communications (manuel p. 246), suivie du renvoi en
     fréquence « veillez … je répète … » (p. 247). */
  function reponseMauvaiseFreq(s){
    F.echecFreq=(F.echecFreq||0)+1;
    /* En débutant, l'explication doit être SOUS LES YEUX : le journal défile et
       l'élève croyait que sa phrase était mauvaise, alors que seule la fréquence
       ne collait pas. En mode Réel, on ne souffle rien — le silence radio EST
       l'information, comme en vol. */
    if(level==='debutant'){
      $v('vfFb').innerHTML='<div class="fb ko">'+ICONS.warn+
        '<span><b>Votre message n\'est pas parti : mauvaise fréquence.</b> '+
        'Vous émettez sur '+fmtF(radio.act)+', or '+esc(s.stn||'la station')+
        ' écoute sur '+fmtF(s.freq)+'. Réglez le poste, puis reprenez votre message — '+
        'votre phraséologie n\'est pas en cause.</span></div>';
    }
    var prec0=stationSur(radio.act);
    if(F.echecFreq===1 || !prec0){
      vfLog('sys','Aucune réponse — vous émettez sur '+fmtF(radio.act)+
                  ' alors que '+(s.stn||'la station')+' écoute sur '+fmtF(s.freq)+'.');
      /* Fréquence que personne n'occupe : aucun contrôleur ne peut vous rappeler,
         c'est le silence radio. On renvoie donc vers la pastille — c'est une aide
         de l'application, pas une phrase de contrôleur. */
      if(!prec0 && F.echecFreq>1)
        vfLog('sys','Personne n\'écoute sur '+fmtF(radio.act)+
                    '. La fréquence à afficher est rappelée sous la radio.');
      return;
    }
    var prec=stationSur(radio.act);
    var m='{CALL}, '+prec+', me recevez-vous ? Veillez '+(s.stn||'la station')+' '+
          fq(s.freq)+', je répète '+fq(s.freq)+'.';
    messageATC(prec, m);
  }

  /* Code transpondeur erroné. Le manuel prévoit trois formulations, dans cet ordre :
     « confirmez transpondeur X » (p. 187), puis « je ne reçois pas votre
     transpondeur » et « recyclez transpondeur » (p. 190). */
  function reponseMauvaisCode(s){
    F.echecCode=(F.echecCode||0)+1;
    var m;
    if(F.echecCode===1)      m='{CALL}, confirmez transpondeur '+s.xpdrReq+'.';
    else if(F.echecCode===2) m='{CALL}, je ne reçois pas votre transpondeur.';
    else                     m='{CALL}, recyclez transpondeur, '+s.xpdrReq+'.';
    messageATC(s.stn, m);
  }

  /* Identification non faite : le contrôleur redemande le SPI (manuel p. 187). */
  function reponsePasIdent(){
    var m='{CALL}, transpondeur ident.';
    var st=F.steps[F.i];
    messageATC(st&&st.stn, m);
  }

  /* Codes d'urgence composés par l'élève : le contrôleur les voit et applique la
     procédure publiée. 7700 → accusé Mayday (p. 238) ; 7600 → procédure
     d'interruption des communications (p. 246). */
  function reactionCodeUrgence(code, avant){
    if(!F.running) return;
    var s=F.steps[F.i], stn=(s&&s.stn)||'Le contrôle';
    var m=null, urgent=false;
    if(code==='7700'){
      m='{CALL}, '+stn+', Mayday Roger, transpondeur 7700.'; urgent=true;
    } else if(code==='7600'){
      m='{CALL}, '+stn+', si vous me recevez, transpondeur ident.'; urgent=true;
      F.attend7600=true;
    } else if(avant==='7700' || avant==='7600'){
      vfLog('sys','Code d\'urgence annulé — vous êtes revenu au code '+code+'.');
      F.attend7600=false; return;
    } else return;
    messageATC(stn, m, urgent);
  }

  /* Suite de la procédure 7600 : le pilote presse IDENT, le contrôleur confirme
     (manuel p. 246, texte intégral). */
  function suite7600(){
    if(!F.attend7600) return;
    F.attend7600=false;
    var s=F.steps[F.i], stn=(s&&s.stn)||'Le contrôle';
    var m='{CALL}, '+stn+', ident observé, vous êtes en panne d\'émission, transpondeur 7600, '+
          'accusez réception de tous mes messages par ident.';
    messageATC(stn, m, true);
  }
  function radioManuelle(){ return rtSettings().radioManuelle!==false; }
  function poserStby(f){
    if(f==null) return;
    var n=Math.round(Number(f)*1000)/1000;
    radio.stby=Math.min(136.975, Math.max(118, n));
    majRadio();
  }
  function permuter(){
    if(radio.stby==null) return;
    var t=radio.act; radio.act=radio.stby; radio.stby=t;
    if(radio.attendue!=null && Math.abs(Number(radio.act)-Number(radio.attendue))<0.0005)
      radio.attendue=null;                          // transfert accompli
    majRadio();
    var e=$v('radioAct'); e.classList.remove('tuning'); void e.offsetWidth; e.classList.add('tuning');
  }

  /* ================= TRANSPONDEUR =================
     Quatre roues octales : un code SSR ne comporte que des chiffres 0 à 7.
     7000 est le code de veille VFR affiché au départ (règlement SERA / AIP France ;
     le manuel de phraséologie, lui, ne donne que la formulation des échanges).
     Le contrôleur assigne un code (manuel DSNA p. 186), peut demander de le
     confirmer ou de presser IDENT (p. 187) : tant que le code n'est pas affiché,
     il ne vous voit pas sous ce code et le dit. */
  var XP_MODES=['STBY','ON','ALT'];
  /* `saisie` = ce que composent les roues ; `code` = ce que le transpondeur émet
     réellement. Comme sur un vrai boîtier, composer ne suffit pas : il faut valider
     (bouton EXÉC) pour que le contrôleur voie le nouveau code. */
  var xpdr={ code:'7000', saisie:'7000', mode:2, ident:false, attendu:null };

  function xpdrRendreRoues(){
    var box=$v('xpdrRoues'); if(!box || box.dataset.pret) return;
    var h='';
    for(var i=0;i<4;i++)
      h+='<div class="xp-roue"><button type="button" data-xp="'+i+'" data-d="1">&#9650;</button>'+
         '<span data-xpv="'+i+'">0</span>'+
         '<button type="button" data-xp="'+i+'" data-d="-1">&#9660;</button></div>';
    box.innerHTML=h; box.dataset.pret='1';
    box.querySelectorAll('[data-xp]').forEach(function(b){
      b.addEventListener('click',function(){
        xpdrTourner(parseInt(b.dataset.xp,10), parseInt(b.dataset.d,10));
      });
    });
  }
  function xpdrTourner(i,d){
    var c=xpdr.saisie.split('');
    c[i]=String((parseInt(c[i],10)+d+8)%8);        // octal : on boucle sur 0-7
    xpdr.saisie=c.join('');
    majXpdr();
  }
  /* Activation du code composé. C'est ici que le contrôleur « voit » le changement,
     et donc ici qu'on réagit aux codes d'urgence. */
  function xpdrExecuter(){
    if(xpdr.saisie===xpdr.code){ majXpdr(); return; }
    var avant=xpdr.code;
    xpdr.code=xpdr.saisie;
    xpdr.ident=false;                              // nouveau code : le SPI est annulé
    majXpdr();
    reactionCodeUrgence(xpdr.code, avant);
  }
  function xpdrManuel(){ return radioManuelle(); }
  function surBonCode(){
    var s=F.steps[F.i];
    if(!s || !xpdrManuel()) return true;
    if(s.xpdrReq && xpdr.code!==s.xpdrReq) return false;
    if(s.identReq && !xpdr.ident) return false;
    return true;
  }
  function majXpdr(){
    var box=$v('vfXpdr'); if(!box) return;
    xpdrRendreRoues();
    var enAttente = xpdr.saisie!==xpdr.code;        // composé mais pas encore activé
    $v('xpdrCode').textContent=xpdr.saisie;
    $v('xpdrCode').classList.toggle('brouillon', enAttente);
    for(var i=0;i<4;i++){
      var e=box.querySelector('[data-xpv="'+i+'"]');
      if(e) e.textContent=xpdr.saisie[i];
    }
    var et=$v('xpdrEtat');
    et.textContent = enAttente ? 'EXÉC ?' : (xpdr.ident ? 'IDENT' : XP_MODES[xpdr.mode]);
    et.classList.toggle('on', !enAttente && (xpdr.mode>0 || xpdr.ident));
    $v('xpdrIdent').classList.toggle('actif', xpdr.ident);
    $v('xpdrExec').classList.toggle('arme', enAttente);
    var s=F.steps[F.i], a=$v('xpdrAide');
    // Le code clignote tant que le code assigné n'est pas RÉELLEMENT émis.
    var reste = xpdr.attendu!=null && xpdr.code!==xpdr.attendu;
    $v('xpdrCode').classList.toggle('attendue', reste && !enAttente);
    $v('xpdrIdent').classList.toggle('attendu', !!(s&&s.identReq&&!xpdr.ident));
    // Pastille : le code à afficher, en clair, tant qu'il ne l'est pas.
    cible($v('xpdrCible'), reste ? ['Code à afficher', xpdr.attendu] : null);
    if(!a) return;
    if(!xpdrManuel()){ a.textContent=''; a.classList.remove('alerte'); return; }
    if(enAttente){
      a.textContent='Code composé sur les roues — pressez EXÉC pour l\'activer.';
      a.classList.remove('alerte');
    } else if(s && s.xpdrReq && xpdr.code!==s.xpdrReq){
      a.textContent=(s.stn||'Le contrôleur')+' ne vous voit pas au code assigné — affichez '+
                    s.xpdrReq+' puis pressez EXÉC.';
      a.classList.add('alerte');
    } else if(s && s.identReq && !xpdr.ident){
      a.textContent='Pressez IDENT : c\'est la fonction d\'identification demandée.';
      a.classList.add('alerte');
    } else if(reste){
      a.textContent='Composez '+xpdr.attendu+' sur les quatre roues, puis EXÉC.';
      a.classList.remove('alerte');
    } else { a.textContent=''; a.classList.remove('alerte'); }
  }

  /* Pastille commune radio / transpondeur. */
  function cible(el, contenu){
    if(!el) return;
    if(!contenu){ el.classList.add('hidden'); el.textContent=''; return; }
    el.innerHTML='<span>'+esc(contenu[0])+'</span><b>'+esc(String(contenu[1]))+'</b>';
    el.classList.remove('hidden');
  }

  /* Pastille ATIS de l'en-tête : la fréquence est donnée d'emblée (elle figure sur
     la carte VAC, on ne la devine pas), la lettre n'apparaît qu'une fois l'ATIS
     réellement écouté — sinon l'exercice se résoudrait sans écouter le message. */
  /* Altitude affichée : celle du vol tel qu'il se déroule, c'est-à-dire après
     évitement de la classe A — pas celle tapée dans le formulaire. Quand les deux
     diffèrent, on montre les deux : c'est la seule façon de comprendre pourquoi
     le contrôleur parle d'une altitude qu'on n'a pas demandée. */
  function majAltitude(){
    var el=$v('vfAlt'); if(!el||!F.ctx) return;
    var retenue=F.ctx.cruise, demandee=F.ctx.altDemandee;
    el.innerHTML = (demandee && demandee!==retenue)
      ? '<b>'+retenue+' ft</b> <span style="opacity:.7">(au lieu de '+demandee+')</span>'
      : '<b>'+retenue+' ft</b>';
  }
  function majAtisChip(){
    var e=$v('vfAtis'); if(!e) return;
    var a=F.ctx && F.ctx.atis;
    if(!a){ e.classList.add('hidden'); e.textContent=''; return; }
    var idx=-1;
    for(var k=0;k<F.steps.length;k++){ if(F.steps[k].atisStep){ idx=k; break; } }
    /* Avant l'écoute, la pastille signale seulement qu'un ATIS est diffusé : la
       fréquence se lit sur la carte VAC, elle n'est pas servie d'emblée. Elle
       apparaît ensuite avec la lettre, comme aide-mémoire pour la suite du vol. */
    var ecoute = idx>=0 && F.i>idx;
    e.innerHTML = ecoute
      ? 'ATIS '+esc(fq(a.freq))+' &middot; <b>information '+esc(a.mot)+'</b>'
      : 'ATIS diffusé';
    e.classList.remove('hidden');
  }

  function tune(stn,freq,animate){
    $v('vfStation').textContent=stn||'—';
    $v('vfFreq').textContent=freq?fq(freq):'—';
    if(animate){ var e=$v('vfFreq'); e.classList.remove('tuning'); void e.offsetWidth; e.classList.add('tuning'); }
    /* En mode manuel, la radio N'EST PAS accordée automatiquement : c'est au pilote
       de le faire. On mémorise seulement la fréquence attendue. */
    if(freq!=null && !radioManuelle()) radio.act=Number(freq);
    majRadio();
  }
  /* En mode Réel, la consigne ne subsiste que là où elle apporte une information
     qu'on ne peut pas déduire de la situation :
       - premier contact sur une fréquence : il faut savoir QUI appeler ;
       - événement majeur déclenché à bord (panne, malaise) : aucun contrôleur ne
         vous a rien dit, c'est à vous d'ouvrir le dialogue.
     Partout ailleurs — collationnements, accusés de réception, points du circuit —
     la phase affichée suffit, et c'est justement l'exercice. */
  function consigneUtile(s){
    return !!(s.premierContact || (s.majeur && s.situation));
  }
  function renderStep(){
    var s=F.steps[F.i]; if(!s) return endFlight();
    /* VERROU. tune() ci-dessous passe par majRadio(), qui appelle majAccueilStation() :
       sans ce verrou, l'accueil de la NOUVELLE étape partait dès cet instant (F.i est
       déjà incrémenté) avec la valeur laissée par l'étape précédente. Il était alors
       dit et journalisé DEUX fois, le second envoi annulant le premier en pleine
       phrase. On bloque pendant toute la mise en place, on ouvre juste avant l'appel
       explicite, plus bas. */
    F.accueilDit=true;
    if(s.onEnter) s.onEnter();
    state.callForm = s.premierContact ? 'full' : 'abbr';
    /* Fréquence à afficher : celle de l'étape en cours si on n'y est pas encore. */
    radio.attendue = (radioManuelle() && s.freq!=null &&
                      (radio.act==null || Math.abs(Number(radio.act)-Number(s.freq))>=0.0005))
                     ? Number(s.freq) : null;
    tune(s.stn,s.freq,false);
    majAtisChip();
    /* Code assigné par le contrôleur à cette étape : il reste « attendu » tant que
       les quatre roues ne l'affichent pas. */
    if(s.xpdrAssign) xpdr.attendu=s.xpdrAssign;
    if(xpdr.attendu!=null && xpdr.code===xpdr.attendu) xpdr.attendu=null;
    if(s.identReq) xpdr.ident=false;      // la demande d'identification est à refaire
    F.echecFreq=0; F.echecCode=0;         // l'escalade du contrôleur repart à zéro
    /* Nouvelle étape : le message à répéter n'est plus celui de l'étape précédente
       SAUF s'il portait l'instruction à collationner ici. On garde donc celui de
       l'étape précédente tant que la nouvelle n'a rien émis : c'est exactement le
       cas où l'élève a besoin d'une répétition — on lui demande de collationner
       une clairance dont il a manqué un élément. */
    majXpdr();
    $v('vfPhase').textContent=s.ph;
    $v('vfSrc').textContent='Manuel DSNA '+s.src;
    $v('vfBar').style.width=Math.round((F.i/F.steps.length)*100)+'%';
    $v('vfTrans').textContent=''; $v('vfFb').innerHTML='';
    /* Étape d'écoute pure (ATIS) : rien à transmettre, donc pas de micro ni de zone
       de réponse — et « Suivant » disponible tout de suite. Sans ça on restait
       bloqué, le bouton n'étant débloqué que par une réponse validée. */
    var ecoute = !!s.atisStep;
    /* On ne masque plus tout le bloc : « Suivant » s'y trouve aussi. */
    $v('vfTransWrap').classList.remove('hidden');
    $v('vfTransWrap').classList.toggle('ecoute', ecoute);
    $v('vfPtt').classList.toggle('hidden', ecoute);
    $v('vfHint').classList.toggle('hidden', ecoute);
    $v('vfNext').disabled = !ecoute;
    $v('vfTransText').value=''; $v('vfValider').disabled=true;
    movePlane(s.leg);
    var atc=$v('vfAtc');
    aRevELer=[];                                  // nouvelle étape : rien en attente
    arreterAtis();                                // une diffusion en cours s'arrête ici
    F.accueilDit=false;                           // nouvelle étape : accueil pas encore donné
    if(s.atisStep) majEcouteAtis();               // l'ATIS ne se déclenche qu'une fois accordé
    else if(s.atcBefore) majAccueilStation();     // idem : seulement une fois accordé
    else atc.innerHTML='';
    /* Débutant : la consigne détaille ce qu'il faut transmettre.
       Réel : plus de consigne du tout — SAUF quand elle porte une information qu'on
       ne peut pas deviner, c'est-à-dire l'organisme à appeler au premier contact sur
       une fréquence. Ailleurs, la phase affichée au-dessus (« Base », « Finale »…)
       suffit à situer l'échange : à vous de retrouver la formulation. */
    var sit=$v('vfSituation');
    if(s.situation){ sit.innerHTML=ICONS.warn+'<span>'+esc(fillDisplay(s.situation))+'</span>';
                     sit.classList.remove('hidden'); }
    else sit.classList.add('hidden');
    $v('vfConsigne').textContent = (level==='reel')
      ? (consigneUtile(s) ? fillDisplay(s.reel||'') : '')
      : fillDisplay(s.consigne||'');
    /* On fige ici la phrase attendue : elle dépend de state.callForm, qui change
       d'un échange à l'autre. La calculer en fin de vol donnerait la mauvaise
       forme d'indicatif pour tous les échanges. */
    F.attendus[F.i]=fillDisplay(s.attendu||'');
  }
  function answer(raw){
    var s=F.steps[F.i]; if(!s) return;
    var corrected=fuzzyCorrect(raw||'');
    // Le texte validé reste visible dans le champ éditable : pas de second affichage.
    vfLog('you',raw||'(rien entendu)');
    var res=s.motsCles.map(function(mc){ return {label:mc.label, found:mcFound(mc,corrected)}; });
    F.results[F.i]=res;
    F.dits[F.i]=raw||'';        // conservé pour le détail de l'historique
    // Même moteur d'explications que les Scénarios (défini dans le bloc principal).
    rendreFeedback($v('vfFb'), s, res, corrected, 'fb');
    var ok=res.filter(function(r){return r.found;}).length;
    vfLog('sys','Éléments détectés : '+ok+' / '+res.length);
    arreterAtis();      // on transmet : on ne reste pas sur la fréquence ATIS
    /* La réponse est donnée : on peut dévoiler ce que le contrôleur avait dit. */
    devoilerATC();
    if(s.atcAfter) messageATC(s.stn, s.atcAfter);
    $v('vfNext').disabled=false;
    /* Échange réussi : on le SIGNALE, mais on n'enchaîne pas tout seul.
       Un enchaînement automatique a été essayé puis retiré : il était armé juste
       après messageATC(), or la synthèse vocale met un instant à démarrer. Au
       premier sondage, speaking et pending valaient encore false, on passait donc
       à l'étape suivante — dont le speakATC() annule la parole en cours. Résultat :
       le contrôleur restait muet par intermittence.
       C'est l'appui sur « Suivant » qui déclenche le message radio suivant, et lui
       seul : le rythme reste au pilote, et la parole n'est jamais coupée. */
    if(ok===res.length && res.length) vfLog('sys','Échange réussi.');
  }
  function nextStep(){
    sauverVol();
    var s=F.steps[F.i];
    if(s && s.tuneTo) tune(s.tuneTo.stn,s.tuneTo.freq,true);   // changement de fréquence effectif
    F.i++;
    if(F.i>=F.steps.length) endFlight(); else renderStep();
  }

  // ---- Avion animé sur la carte ----
  /* Silhouettes vues de dessus, nez en haut, centrees sur la voilure (24x24).
     Vu du dessus, ce qui distingue un Cessna d'un DR400 n'est pas la position de
     l'aile — invisible sous cet angle — mais son PLAN : aile rectangulaire et
     longue envergure pour le Cessna, aile trapezoidale plus courte pour le DR400. */
  var PLANE_CESSNA = '<svg viewBox="0 0 24 24" fill="currentColor">'+
    '<path d="M11.3 3.4c0-.55.3-.95.7-.95s.7.4.7.95l.22 6.9h9.3c.3 0 .55.25.55.55v1.1c0 .3-.25.55-.55.55h-9.28l.28 5.4 2.9 1.5c.2.1.33.31.33.54v.86c0 .27-.25.47-.51.41L12 20.4l-3.94.81c-.26.06-.51-.14-.51-.41v-.86c0-.23.13-.44.33-.54l2.9-1.5.28-5.4H1.78c-.3 0-.55-.25-.55-.55v-1.1c0-.3.25-.55.55-.55h9.3z"/>'+
    '<rect x="8.6" y="2.5" width="6.8" height=".85" rx=".42"/></svg>';
  var PLANE_DR400 = '<svg viewBox="0 0 24 24" fill="currentColor">'+
    '<path d="M11.3 3.2c0-.55.3-.95.7-.95s.7.4.7.95l.24 7.2 8.2 1.35c.35.06.6.36.6.71v.5c0 .33-.29.58-.62.53l-8.15-1.2.3 5.15 2.75 1.45c.2.11.32.32.32.55v.82c0 .27-.24.46-.5.4L12 20.5l-3.84.79c-.26.06-.5-.13-.5-.4v-.82c0-.23.12-.44.32-.55l2.75-1.45.3-5.15-8.15 1.2c-.33.05-.62-.2-.62-.53v-.5c0-.35.25-.65.6-.71l8.2-1.35z"/>'+
    '<rect x="8.9" y="2.35" width="6.2" height=".8" rx=".4"/></svg>';
  function silhouetteAvion(){
    return (acChoice && acChoice.fam==='Cessna') ? PLANE_CESSNA : PLANE_DR400;
  }
  /* Cap suivi par le symbole : il doit pointer le long du trait de route. */
  function capRoute(a,b){
    var dl=(b[1]-a[1])*Math.cos((a[0]+b[0])/2*Math.PI/180);
    return Math.atan2(dl, b[0]-a[0])*180/Math.PI;
  }
  function legPoint(t){
    var a=F.ctx.dep, b=F.ctx.arr;
    if(!b) return [a.lat,a.lon];
    var via=F.ctx.via;
    if(!via) return [a.lat+(b.lat-a.lat)*t, a.lon+(b.lon-a.lon)*t];
    // Route brisée : première moitié dep→via, seconde moitié via→arr.
    if(t<0.5){ var u=t/0.5; return [a.lat+(via.lat-a.lat)*u, a.lon+(via.lon-a.lon)*u]; }
    var v=(t-0.5)/0.5;
    return [via.lat+(b.lat-via.lat)*v, via.lon+(b.lon-via.lon)*v];
  }
  /* Zoom de suivi en vol. On reste au zoom NATIF du fond affiché : au-delà,
     Leaflet agrandit l'image et la carte devient floue — exactement au moment où
     l'on parle, écran de vol à l'appui. Les tuiles OACI étant désormais gravées
     jusqu'au zoom carte 11 (planches reprises à 600 dpi, cf. commentaire de la
     couche), le suivi en vol gagne un cran et se cale sur OpenStreetMap. */
  /* Zoom de suivi en vol. 10 et non 11 : au zoom 11 on a le nez sur la carte et on
     perd la situation générale, alors qu'en vol on veut voir venir. Les tuiles OACI
     sont natives jusqu'au zoom 11, la netteté n'entre donc plus en ligne de compte
     — c'est un choix de cadrage, pas de piqué. Valeur fixe : le cadrage de départ
     est le même à chaque vol. */
  function zoomVol(){ return 10; }
  function movePlane(t){
    if(!map||t==null) return;
    var p=legPoint(t);
    if(!F.planeMk){
      F.planeMk=L.marker(p,{icon:L.divIcon({className:'vf-plane',html:silhouetteAvion(),
                            iconSize:[28,28],iconAnchor:[14,14]}), zIndexOffset:1000}).addTo(map);
    } else F.planeMk.setLatLng(p);
    // Orientation : on vise un point legerement en avant sur la meme branche.
    var av=legPoint(Math.min(1,(t||0)+0.03));
    if(av[0]!==p[0] || av[1]!==p[1]) F.capAvion=capRoute(p,av);
    var sv=F.planeMk.getElement() && F.planeMk.getElement().querySelector('svg');
    if(sv && F.capAvion!=null) sv.style.transform='rotate('+F.capAvion.toFixed(1)+'deg)';
    // En vol, la carte suit l'avion de près : elle sert de repère de situation,
    // pas de vue d'ensemble (le trajet complet est visible à la configuration).
    if(F.running) map.setView(p, Math.max(map.getZoom(),zoomVol()), {animate:true, duration:.7});
    else if(!map.getBounds().pad(-0.15).contains(L.latLng(p))) map.panTo(p,{animate:true,duration:.6});
  }

  // ---- Démarrage / fin ----
  /* ---- Remise à l'état de repos du panneau de vol ----
     renderStep() nettoie déjà tout ce qui dépend de l'échange en cours :
     transcription, verdict, consigne, situation, barre de progression. Mais
     trois choses vivent EN DEHORS du cycle des étapes, et survivaient donc d'un
     vol au suivant :
       · le bandeau d'erreur micro (« Écoute interrompue. »), qui n'est effacé
         qu'au prochain appui sur l'alternat ;
       · l'état visuel de l'alternat lui-même, si le vol a été quitté pendant
         une écoute ;
       · la fréquence tapée au clavier de la radio, qui n'appartient à aucune
         étape.
     On ouvrait donc un vol neuf avec l'erreur du vol précédent sous le bouton.
     Plutôt que de rattraper ces trois-là un par un à chaque fois qu'on en
     découvrira un quatrième, le panneau a désormais UN état de repos, et tout
     vol commence par lui. */
  var NORECO_DEFAUT = null;      // le bandeau est écrasé par les erreurs : on en garde l'original
  function pttVolAuRepos(){
    var b=$v('vfPtt'); if(!b) return;
    b.classList.remove('listening');
    var sp=b.querySelector('span'); if(sp) sp.textContent='Maintenir pour parler';
  }
  function panneauAuRepos(){
    var n=$v('vfNoreco');
    if(n){
      if(NORECO_DEFAUT===null) NORECO_DEFAUT=n.textContent;   // capturé avant toute erreur
      n.textContent=NORECO_DEFAUT; n.classList.add('hidden');
    }
    pttVolAuRepos();
    var b=$v('vfPtt'); if(b) b.disabled=false;                // réarmé ; RECO_OK tranchera après
    $v('radioSaisie').value='';
    $v('vfTransText').value=''; $v('vfValider').disabled=true;
    $v('vfTrans').textContent=''; $v('vfFb').innerHTML='';
    $v('vfLog').innerHTML='';
    $v('vfSituation').classList.add('hidden');
    $v('vfAtc').innerHTML='';
  }

  function startFlight(){
    panneauAuRepos();
    buildFlight();
    sec.querySelector('.nav-layout').classList.add('hidden');
    sec.querySelector('.nav-mode').classList.add('hidden');
    sec.querySelector('.nav-warn').classList.add('hidden');
    recap.classList.add('hidden');
    $v('navFlight').classList.remove('hidden');
    $v('vfMapSlot').appendChild(sec.querySelector('.nav-mapwrap'));   // la carte suit le vol
    // Décompte du quota du jour (affiché sur l'accueil ; non bloquant pour l'instant).
    if(window.rtQuotaIncr) window.rtQuotaIncr();
    document.body.classList.add('in-flight');   // carte réduite + libellés de config masqués
    var br=$v('navResume'); if(br) br.classList.add('hidden');   // un vol tourne : plus de proposition de reprise
    // Au départ, la radio est déjà réglée sur le terrain : on ne commence pas un vol
    // avec un poste éteint.
    radio.act = (F.ctx.depF && F.ctx.depF.f) ? Number(F.ctx.depF.f) : null;
    radio.stby=null; radio.attendue=null;
    /* Transpondeur au départ : 7000, le code de veille VFR, mode altitude. */
    xpdr.code='7000'; xpdr.saisie='7000'; xpdr.mode=2; xpdr.ident=false; xpdr.attendu=null;
    F.echecFreq=0; F.echecCode=0; F.attend7600=false; aRevELer=[]; F.accueilDit=false;
    radioSkin(); majRadio(); majXpdr(); choisirAvionPhoto();
    $v('vfCall').textContent=state.call;        // indicatif rappelé en permanence
    majAltitude();                              // altitude de croisière RETENUE (évitement compris)
    majAtisChip();                              // fréquence ATIS à côté de celle du terrain
    var ev=$v('vfEvit');
    /* Deux natures de message, deux titres. « Trajet ajusté » quand on a
       effectivement trouvé une solution ; « Espace interdit au VFR » quand il
       n'y en a pas et qu'on le dit — coiffer un avertissement du mot « ajusté »
       laissait croire que le problème était réglé. */
    if(F.ctx.evitMsg){
      var brut=F.ctx.evitMsg, alerte=/^Attention\s*:/.test(brut);
      var corps=brut.replace(/^Trajet modifié\s*:\s*/,'').replace(/^Attention\s*:\s*/,'');
      ev.innerHTML='<span>'+ICONS.warn+'</span><span><b>'+
        (alerte?'Espace interdit au VFR.':'Trajet ajusté.')+'</b> '+esc(corps)+'</span>';
      ev.classList.remove('hidden'); }
    else ev.classList.add('hidden');
    F.running=true;
    setRecoSink(F.sink = { // Aperçu pendant qu'on parle, dans le champ éditable.
                  /* Début d'écoute : la prise précédente disparaît immédiatement,
                     ainsi que le retour de correction qui s'y rapportait. */
                  debut:function(){
                    $v('vfTransText').value='';
                    $v('vfValider').disabled=true;
                    $v('vfNoreco').classList.add('hidden');
                    $v('vfFb').innerHTML='';
                    $v('vfTrans').textContent='';
                  },
                  interim:function(t){ $v('vfTransText').value=t; $v('vfValider').disabled=!t.trim(); },
                  /* Fin d'écoute : on REMPLIT le champ, on ne note pas encore.
                     L'élève relit, corrige une éventuelle erreur de transcription,
                     puis valide lui-même. */
                  final:function(t){
                    // Affichage lissé : l'élève lit la forme retenue, pas le brut.
                    var lisse=lissageTranscription(t);
                    $v('vfTransText').value=lisse;
                    $v('vfValider').disabled=!lisse.trim();
                    if(lisse.trim()) $v('vfTransText').focus();
                  },
                  // Erreurs micro affichées DANS la page de vol (avant, elles partaient
                  // dans le journal des Exercices et restaient donc invisibles ici).
                  error:function(msg){
                    var n=$v('vfNoreco');
                    n.textContent=msg; n.classList.remove('hidden');
                    $v('vfTrans').textContent='';
                  },
                  ui:function(on){ var b=$v('vfPtt');
                    b.classList.toggle('listening',on);
                    if(on) $v('vfNoreco').classList.add('hidden');   // on retente : on efface l'erreur
                    b.querySelector('span').textContent=on?'Écoute… relâchez pour terminer':'Maintenir pour parler'; } });
    if(!RECO_OK){ $v('vfNoreco').classList.remove('hidden'); $v('vfPtt').disabled=true; }
    if(map) setTimeout(function(){
      map.invalidateSize();
      // On démarre zoomé sur le terrain de départ ; movePlane() suit ensuite l'avion.
      if(F.ctx&&F.ctx.dep) map.setView([F.ctx.dep.lat,F.ctx.dep.lon],zoomVol(),{animate:false});
    },40);
    renderStep();
    sauverVol();
    /* La séance est déclarée EN BASE dès maintenant, pas à l'arrivée. C'est ce
       qui permet de compter les abandons : un vol commencé et jamais terminé
       laisse une ligne « in_progress », requalifiée au lancement suivant. Et
       l'heure de début est prise ici, pas déduite après coup — d'où une durée
       enfin mesurée. L'envoi part en arrière-plan : rien n'attend le réseau. */
    /* Heure de départ gardée à part : l'historique LOCAL en a besoin lui aussi,
       et il doit continuer de fonctionner quand RTSync est absent (hors-ligne,
       ouverture en file://). */
    F.syncDebut = Date.now();
    F.sync = (window.RTSync && F.ctx) ? RTSync.demarrer({
      kind:'flight', level:level, mode:mode,
      dep_icao:F.ctx.dep?F.ctx.dep.icao:null,
      arr_icao:F.ctx.arr?F.ctx.arr.icao:null,
      alt_icao:sel.alt||null,
      runway:(F.ctx.depRwy&&F.ctx.depRwy.id)?String(F.ctx.depRwy.id):null,
      aircraft:F.ctx.ac||null, cruise_alt_ft:F.ctx.cruise||null, pax:F.ctx.pax||null
    }) : null;
    window.scrollTo(0,0);
  }
  /* ---- Reprise d'un vol interrompu ----
     On ne sauvegarde que ce qui est reproductible (terrains, réglages, position dans
     le déroulé, résultats) : le tableau d'étapes est reconstruit par buildFlight(),
     jamais sérialisé. */
  var VOL_KEY='rt-vol-en-cours';
  function sauverVol(){
    if(!F.running||!F.ctx) return;
    try{
      localStorage.setItem(VOL_KEY, JSON.stringify({
        dep:sel.dep, arr:sel.arr, alt:sel.alt, mode:mode, level:level,
        acft:acChoice?acChoice.nom:null, fl:$v('navFl').value, pax:$v('navPax').value,
        i:F.i, results:F.results, call:state.call,
        meteo:state.meteo, rwy:state.rwy, ventPhrase:state.ventPhrase, altCruise:state.altCruise,
        date:new Date().toISOString()
      }));
    }catch(e){}
    /* Et en base, pour que le vol se reprenne depuis un autre navigateur. La
       montée est temporisée côté module : cette fonction est appelée à chaque
       échange, on ne va pas écrire en base à chaque phrase prononcée. */
    try{ if (window.RTDonnees) RTDonnees.volModifie(); }catch(e){}
  }
  function oublierVol(){
    try{ localStorage.removeItem(VOL_KEY); }catch(e){}
    try{ if (window.RTDonnees) RTDonnees.volModifie(); }catch(e){}
  }
  function volSauvegarde(){
    try{ var v=JSON.parse(localStorage.getItem(VOL_KEY)||'null');
         return (v && v.dep && typeof v.i==='number') ? v : null; }catch(e){ return null; }
  }
  function reprendreVol(v){
    IN.dep.value=v.dep; sel.dep=v.dep;
    if(v.arr){ IN.arr.value=v.arr; sel.arr=v.arr; }
    if(v.alt){ IN.alt.value=v.alt; sel.alt=v.alt; }
    mode=v.mode||'voyage';
    sec.querySelectorAll('[data-volmode]').forEach(function(b){ b.classList.toggle('active',b.dataset.volmode===mode); });
    document.body.classList.toggle('volmode-local',mode==='local');
    level=v.level||'debutant';
    sec.querySelectorAll('[data-diff]').forEach(function(b){ b.classList.toggle('active',b.dataset.diff===level); });
    if(v.acft){ var m=AIRCRAFT.filter(function(a){return a.nom===v.acft;})[0];
                if(m){ acChoice=m; acInput.value=m.nom; majPlaces(); } }
    if(v.fl)  $v('navFl').value=v.fl;
    if(v.pax) $v('navPax').value=v.pax;
    if(v.call) state.call=v.call;
    startFlight();
    // Restaurer la météo tirée au sort et la position dans le déroulé.
    if(v.meteo) state.meteo=v.meteo;
    if(v.rwy) state.rwy=v.rwy;
    if(v.ventPhrase) state.ventPhrase=v.ventPhrase;
    if(v.altCruise) state.altCruise=v.altCruise;
    F.results=v.results||[];
    F.i=Math.min(v.i, F.steps.length-1);
    renderStep();
  }

  /* ---- Historique des vols ----
     Stocké séparément de l'historique des scénarios (clé distincte) : la structure
     diffère (route, aléa, détail des échanges). On garde les 40 derniers vols et,
     pour chacun, le texte attendu et ce qui a été dit — c'est ce qui permet de
     revoir ses erreurs après coup. */
  var VOLS_KEY='rt-vols';
  function chargerVols(){ try{ return JSON.parse(localStorage.getItem(VOLS_KEY)||'[]'); }catch(e){ return []; } }
  /* Même chose ici : quand assets/donnees.js a rempli le cache depuis la base,
     l'historique des vols et la proposition de reprise se repeignent. Sans ça,
     quelqu'un qui vient de se connecter sur un nouveau navigateur voit une
     Navigation vide jusqu'au prochain rechargement de page. */
  window.addEventListener('rt:donnees', function(){
    try{ majHistorique(); }catch(e){}
    try{ majReprise(); }catch(e){}
  });
  function enregistrerVol(entree){
    var v=chargerVols(); v.unshift(entree);
    try{ localStorage.setItem(VOLS_KEY, JSON.stringify(v.slice(0,40))); }catch(e){}
    majHistorique();
  }
  function pctClasse(p){ return p>=80?'bon':(p>=50?'moy':'bas'); }
  function dateCourte(iso){
    try{ var d=new Date(iso);
      return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})+' '+
             d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    }catch(e){ return ''; }
  }
  function majHistorique(){
    var v=chargerVols(), box=$v('navHist');
    if(!box) return;
    if(!v.length){ box.hidden=true; return; }
    box.hidden=false;
    $v('navHistCount').textContent=v.length;
    var d=v[0];
    $v('navHistLast').textContent='Dernier : '+d.titre+' · '+d.pct+' % · '+dateCourte(d.date);
    $v('navHistBody').innerHTML=v.map(function(e,i){
      return '<button class="nh-row" type="button" data-vol="'+i+'">'+
        '<span class="nh-vol">'+esc(e.titre)+'</span>'+
        '<span class="nh-meta">'+dateCourte(e.date)+' · '+esc(e.avion||'')+
          (e.alea?' · '+esc(e.alea):'')+'</span>'+
        '<span class="nh-pct '+pctClasse(e.pct)+'">'+e.pct+' %</span></button>';
    }).join('');
    $v('navHistBody').querySelectorAll('[data-vol]').forEach(function(b){
      b.addEventListener('click',function(){ ouvrirVol(parseInt(b.dataset.vol,10)); });
    });
  }
  var volAffiche=null;
  function ouvrirVol(i){
    var v=chargerVols()[i]; if(!v) return;
    volAffiche=v;
    $v('navHistTitle').textContent=v.titre+' — '+dateCourte(v.date);
    var manques=v.lignes.filter(function(l){ return l.manquants && l.manquants.length; }).length;
    var repondus=v.lignes.filter(function(l){ return l.repondu; }).length;
    /* Score en tuiles : le chiffre qui compte d'abord, le détail en dessous. */
    function tuile(val,lib,cls){
      return '<div class="nhd-tile'+(cls?' '+cls:'')+'"><b>'+val+'</b><span>'+lib+'</span></div>';
    }
    $v('navHistScore').innerHTML=
      '<div class="nhd-stats">'+
        tuile(v.pct+'&nbsp;%','de réussite','g-'+pctClasse(v.pct))+
        tuile(v.ok+'<i>/'+v.total+'</i>','éléments corrects')+
        tuile(repondus+'<i>/'+v.lignes.length+'</i>','échanges répondus')+
        (manques?tuile(manques,'avec des oublis','g-bas'):tuile('0','avec des oublis','g-bon'))+
      '</div>'+
      '<div class="nhd-info">'+
        '<span><b>Avion</b> '+esc(v.avion||'—')+'</span>'+
        '<span><b>Altitude</b> '+(v.alt||'—')+' ft</span>'+
        (v.pax?'<span><b>Passagers</b> '+v.pax+'</span>':'')+
        (v.alea?'<span class="nhd-alea"><b>Imprévu</b> '+esc(v.alea)+'</span>':'')+
      '</div>';
    $v('navHistLignes').classList.add('hidden');
    $v('navHistErreurs').textContent='Voir les erreurs';
    sec.querySelector('.nav-layout').classList.add('hidden');
    sec.querySelector('.nav-mode').classList.add('hidden');
    sec.querySelector('.nav-warn').classList.add('hidden');
    $v('navHist').hidden=true;
    $v('navHistDetail').classList.remove('hidden');
    window.scrollTo(0,0);
  }
  function fermerVol(){
    $v('navHistDetail').classList.add('hidden');
    sec.querySelector('.nav-layout').classList.remove('hidden');
    sec.querySelector('.nav-mode').classList.remove('hidden');
    sec.querySelector('.nav-warn').classList.remove('hidden');
    majHistorique();
    if(map) setTimeout(function(){ map.invalidateSize(); },30);
  }

  function endFlight(){
    /* Le micro d'abord. setRecoSink(null) ne fait que débrancher l'affichage :
       il ne coupe pas la capture. Quitter un vol en pleine écoute laissait donc
       la reconnaissance tourner, et le bouton figé sur « Écoute… ». */
    try{ if(listening) stopListening(); }catch(e){}
    pttVolAuRepos();
    F.running=false; setRecoSink(null); oublierVol(); arreterAtis();
    devoilerATC();   // vol terminé : le journal redevient entièrement lisible
    var tot=0, ok=0;
    F.results.forEach(function(r){ if(r) r.forEach(function(x){ tot++; if(x.found) ok++; }); });
    var pct=tot?Math.round(ok/tot*100):0;
    var manques={};
    F.results.forEach(function(r){ if(r) r.forEach(function(x){ if(!x.found) manques[x.label]=(manques[x.label]||0)+1; }); });
    var mk=Object.keys(manques).sort(function(a,b){return manques[b]-manques[a];}).slice(0,6);
    var C=F.ctx;
    var rows=[['Vol', C.arr?(C.dep.icao+' → '+(C.arrReelle?C.arrReelle.icao:C.arr.icao)):(C.dep.icao+' — vol local')],
              ['Échanges', F.results.filter(Boolean).length+' / '+F.steps.length],
              ['Score', tot?(ok+' / '+tot+' éléments — <b>'+pct+' % de réussite</b>'):'—'],
              ['Altitude', C.cruise+' ft'+(C.altDemandee&&C.altDemandee!==C.cruise
                  ? ' <span class="rz">(demandé '+C.altDemandee+' ft — ajusté pour éviter la classe A)</span>':'')],
              ['Avion', esc(C.ac)]];
    if(C.via) rows.push(['Route','<span class="rz">décalée pour contourner un espace de classe A</span>']);
    // Trace de l'imprévu rencontré : c'est souvent ce qu'on retient d'un vol.
    var LIB={moteur:'panne moteur (MAYDAY)', fumee:'fumée en cabine (MAYDAY)',
             malaise:'passager malade (PAN PAN)', cap:'changement de cap imposé',
             radio:'panne radio', ferme:'terrain d\'arrivée fermé'};
    if(C.alea) rows.push(['Imprévu','<span class="rz">'+esc(LIB[C.alea]||C.aleaNom||C.alea)+'</span>']);
    if(C.arrReelle) rows.push(['Déroutement','<span class="rz">arrivée reportée sur '+
        esc(C.arrReelle.icao+' — '+C.arrReelle.nom)+'</span>']);
    if(mk.length) rows.push(['À retravailler','<span class="rz">'+mk.map(function(k){return esc(k)+' ('+manques[k]+')';}).join(' · ')+'</span>']);
    $v('navRecapTitle').textContent='Débriefing du vol';
    body.innerHTML='<dl>'+rows.map(function(r){return '<dt>'+r[0]+'</dt><dd>'+r[1]+'</dd>';}).join('')+'</dl>';
    /* Trace du vol : on garde, pour chaque échange, la phrase attendue, ce qui a été
       dit et les éléments manqués — de quoi revoir ses erreurs plus tard. */
    var lignes=F.steps.map(function(st,i){
      var r=F.results[i];
      return { ph:st.ph, stn:st.stn, freq:st.freq,
               attendu:F.attendus[i]||fillDisplay(st.attendu||''),
               dit:F.dits[i]||'',
               manquants:(r||[]).filter(function(x){return !x.found;}).map(function(x){return x.label;}),
               repondu:!!r,
               /* Le score de CHAQUE échange, et non plus seulement le total du
                  vol : sans lui, impossible de dire quel échange fait chuter la
                  moyenne. Écrit aussi dans l'historique local, où il ne coûte
                  que deux entiers par ligne. */
               ok:(r||[]).filter(function(x){return x.found;}).length,
               total:(r||[]).length };
    });
    var LIBH={moteur:'panne moteur (MAYDAY)', fumee:'fumée en cabine (MAYDAY)',
              malaise:'passager malade (PAN PAN)', cap:'changement de cap imposé',
              radio:'panne radio', ferme:'terrain d\'arrivée fermé'};
    if(window.rtJourActif) window.rtJourActif();   // journée de pratique effective
    enregistrerVol({
      date:new Date().toISOString(),
      titre: C.arr ? (C.dep.icao+' → '+(C.arrReelle?C.arrReelle.icao:C.arr.icao)) : (C.dep.icao+' — vol local'),
      dep:C.dep.icao, arr:C.arr?C.arr.icao:null, deg:sel.alt||null,
      mode:mode, level:level, avion:C.ac, acftNom:C.ac,
      alt:C.cruise, pax:C.pax,
      ok:ok, total:tot, pct:pct,
      /* Durée du vol, en secondes. Elle manquait : l'historique local ne
         gardait que l'heure de fin, donc aucun temps d'entraînement n'était
         calculable. F.sync porte l'heure de départ réelle. */
      duree: (F.syncDebut ? Math.max(0, Math.round((Date.now()-F.syncDebut)/1000)) : null),
      alea: C.alea ? (LIBH[C.alea]||C.aleaNom||C.alea) : null,
      lignes:lignes
    });
    /* Clôture en base. La MÊME ligne passe de « in_progress » à « completed » —
       l'identifiant ayant été tiré côté client au démarrage, il n'y a pas de
       seconde ligne. La trace échange par échange part avec. */
    if (window.RTSync && F.sync){
      RTSync.terminer(F.sync, {
        kind:'flight', level:level, mode:mode,
        dep_icao:C.dep?C.dep.icao:null,
        arr_icao:C.arr?C.arr.icao:null,
        alt_icao:sel.alt||null,
        diverted_icao:C.arrReelle?C.arrReelle.icao:null,
        runway:(C.depRwy&&C.depRwy.id)?String(C.depRwy.id):null,
        aircraft:C.ac||null, cruise_alt_ft:C.cruise||null, pax:C.pax||null,
        alea:C.alea||null, score_ok:ok, score_total:tot
      }, lignes.map(function(l){
        return { phase:l.ph, station:l.stn, freq:l.freq,
                 expected:l.attendu, said:l.dit, answered:l.repondu,
                 missed:l.manquants, score_ok:l.ok, score_total:l.total };
      }));
      F.sync = null;
    }
    $v('navFlight').classList.add('hidden');
    recap.classList.remove('hidden');
    restoreMap();
    window.scrollTo(0,0);
  }
  function restoreMap(){
    var wrap=sec.querySelector('.nav-mapwrap');
    // La carte retourne EN TETE de la colonne de gauche (.nav-col), au-dessus de
    // l'historique — et non plus devant .nav-form, qui est l'autre colonne.
    var col=sec.querySelector('.nav-col');
    if(wrap && col) col.insertBefore(wrap, col.firstChild);
    document.body.classList.remove('in-flight');
    if(F.planeMk && map){ map.removeLayer(F.planeMk); F.planeMk=null; }
    if(map) setTimeout(function(){ map.invalidateSize(); },30);
  }

  $v('navStart').addEventListener('click',function(){
    if(!sel.dep){ setTarget('dep'); IN.dep.focus(); return; }
    if(mode==='voyage'&&!sel.arr){ setTarget('arr'); IN.arr.focus(); return; }
    // Le type d'avion n'est plus présélectionné : il fait partie de l'appel initial
    // (manuel DSNA p. 18 et p. 149), on ne peut donc pas démarrer sans lui.
    if(!acChoice){
      acInput.classList.add('champ-requis');
      acInput.focus(); if(acInput.__ouvrirTout) acInput.__ouvrirTout();
      showToast('Choisissez d’abord un type d’avion.');
      return;
    }
    startFlight();
  });

  /* ==========================================================================
     API de test, consommée par la console d'administration (#admin/test).
     ---------------------------------------------------------------------------
     Elle ne crée AUCUNE logique de vol : elle réinjecte une configuration dans
     les mêmes variables que le formulaire, puis appelle startFlight() — c'est
     exactement le chemin que suit déjà « Refaire ce vol » dans l'historique.
     Rien n'est dupliqué, rien n'est contourné.
     ========================================================================== */
  window.RT_TEST = {
    avions:      function(){ return AIRCRAFT.map(function(a){ return a.nom; }); },
    /* cfg = {dep, arr, alt, mode, level, avion, fl, pax, alea} — tout est optionnel
       sauf dep, et arr en mode « voyage ». Renvoie une chaîne d'erreur, ou null. */
    lancerVol:   function(cfg){
      cfg = cfg || {};
      if(!cfg.dep) return 'Aérodrome de départ manquant.';
      var m = AIRCRAFT.filter(function(a){ return a.nom===cfg.avion; })[0];
      if(!m) return 'Type d\u2019avion inconnu : ' + (cfg.avion||'(vide)');
      /* Un vol déjà en cours doit être clos par le chemin normal — endFlight()
         débriefe et l'enregistre. fermerVol(), lui, ne referme que le panneau de
         détail de l'historique : il ne stoppe rien. */
      if(F.running) endFlight();
      IN.dep.value=cfg.dep; sel.dep=cfg.dep;
      if(cfg.arr){ IN.arr.value=cfg.arr; sel.arr=cfg.arr; } else { IN.arr.value=''; sel.arr=null; }
      if(cfg.alt){ IN.alt.value=cfg.alt; sel.alt=cfg.alt; } else { IN.alt.value=''; sel.alt=null; }
      mode = cfg.mode==='local' ? 'local' : 'voyage';
      if(mode==='voyage' && !sel.arr) return 'Aérodrome d\u2019arrivée manquant en mode Voyage.';
      sec.querySelectorAll('[data-volmode]').forEach(function(b){ b.classList.toggle('active',b.dataset.volmode===mode); });
      document.body.classList.toggle('volmode-local',mode==='local');
      level = cfg.level==='reel' ? 'reel' : 'debutant';
      sec.querySelectorAll('[data-diff]').forEach(function(b){ b.classList.toggle('active',b.dataset.diff===level); });
      acChoice=m; acInput.value=m.nom; acInput.classList.remove('champ-requis'); majPlaces();
      if(cfg.fl)  $v('navFl').value=cfg.fl;
      if(cfg.pax!=null) $v('navPax').value=cfg.pax;
      majPlaces();          // APRÈS la valeur : sinon le maximum ne borne rien
      aleaImpose = cfg.alea || null;
      redraw();
      startFlight();
      return null;
    },
    /* Imprévu imposé au PROCHAIN vol, sans le lancer tout de suite. */
    forcerAlea:  function(kind){ aleaImpose = kind || null; },
    aleaImpose:  function(){ return aleaImpose; },
    /* Remise à zéro : on clôt le vol en cours EXACTEMENT comme le bouton
       « Terminer le vol » (endFlight → débriefing + enregistrement), puis on
       oublie la sauvegarde de reprise. Pas de second chemin de sortie : un vol
       clos depuis la console est un vol clos comme un autre. */
    reinitialiser:function(){
      aleaImpose=null;
      if(F.running) endFlight();
      oublierVol();
      try{ $v('navResume').classList.add('hidden'); }catch(e){}
    },
    enVol:       function(){ return !!F.running; }
  };

  /* ---- Commandes de la radio ---- */
  $v('radioSwap').addEventListener('click',permuter);
  /* Molettes : un cran par clic, mais l'appui MAINTENU fait défiler, de plus en
     plus vite. Sans cela, passer de 121,200 à 118,800 en pas de 5 kHz demandait
     des centaines de clics. */
  sec.querySelectorAll('[data-tune]').forEach(function(b){
    var pas=parseFloat(b.dataset.tune), t=null, n=0;
    function cran(){
      var base=(radio.stby!=null)?Number(radio.stby):(radio.act!=null?Number(radio.act):118);
      poserStby(Math.round((base+pas)*1000)/1000);
      $v('radioSaisie').value='';
    }
    function suite(){
      cran(); n++;
      t=setTimeout(suite, n<8 ? 110 : (n<25 ? 55 : 22));   // accélération progressive
    }
    function debut(e){
      e.preventDefault(); arret();
      cran(); n=0;
      t=setTimeout(suite, 420);                            // délai avant le défilement
    }
    function arret(){ if(t){ clearTimeout(t); t=null; } }
    b.addEventListener('pointerdown', debut);
    ['pointerup','pointerleave','pointercancel'].forEach(function(ev){
      b.addEventListener(ev, arret);
    });
    // Clavier : le clic synthétique n'est pas précédé d'un pointerdown.
    b.addEventListener('click',function(e){ if(e.detail===0) cran(); });
  });
  $v('radioSaisie').addEventListener('input',function(){
    var v=$v('radioSaisie').value.replace(',','.').replace(/[^0-9.]/g,'');
    var n=parseFloat(v);
    if(!isNaN(n) && n>=118 && n<=136.975) poserStby(n);
  });
  $v('radioSaisie').addEventListener('keydown',function(e){
    if(e.key==='Enter'){ e.preventDefault(); permuter(); $v('radioSaisie').value=''; }
  });

  /* ---- Commandes du transpondeur ---- */
  $v('xpdrExec').addEventListener('click', xpdrExecuter);
  $v('xpdrMode').addEventListener('click',function(){
    xpdr.mode=(xpdr.mode+1)%3; xpdr.ident=false; majXpdr();
  });
  $v('xpdrIdent').addEventListener('click',function(){
    xpdr.ident=true; majXpdr();
    // Le SPI dure quelques secondes sur un vrai poste ; ici on le garde le temps
    // de l'échange en cours pour que l'élève voie l'effet de son appui.
    suite7600();          // « ident observé, vous êtes en panne d'émission… » (p. 246)
  });

  bindPushToTalk($v('vfPtt'), function(){ if(F.running) startListening(); },
                 function(){ stopListening(); majEcouteAtis(); });
  bindPushToTalk($v('vfRerec'), function(){ if(F.running) startListening(); },
                 function(){ stopListening(); majEcouteAtis(); });
  // La notation n'a lieu qu'à la validation explicite.
  $v('vfValider').addEventListener('click',function(){
    var t=$v('vfTransText').value.trim();
    if(!t) return;
    /* Émettre sur la mauvaise fréquence : personne ne répond, comme en vrai.
       On ne note pas l'échange, on renvoie vers la radio. */
    if(!surBonneFreq()){
      reponseMauvaiseFreq(F.steps[F.i]);
      majAideRadio();
      $v('vfRadio').scrollIntoView({behavior:'smooth',block:'nearest'});
      return;
    }
    /* Même logique pour le transpondeur : sans le code assigné, le contrôleur ne
       vous identifie pas sur son écran et vous le fait savoir (manuel p. 186-187). */
    if(!surBonCode()){
      var sx=F.steps[F.i];
      if(sx.identReq) reponsePasIdent(); else reponseMauvaisCode(sx);
      majXpdr();
      $v('vfXpdr').scrollIntoView({behavior:'smooth',block:'nearest'});
      return;
    }
    $v('vfValider').disabled=true;
    answer(t);
  });
  // Saisie au clavier possible sans micro (utile si la reconnaissance est indisponible).
  $v('vfTransText').addEventListener('input',function(){
    $v('vfValider').disabled = !$v('vfTransText').value.trim();
  });
  // Entrée valide, Maj+Entrée passe à la ligne.
  $v('vfTransText').addEventListener('keydown',function(e){
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); if(!$v('vfValider').disabled) $v('vfValider').click(); }
  });
  /* ---- « Répétez » : refaire émettre le dernier message du contrôleur ----
     Sans cela, un code transpondeur, un cap ou une fréquence manqués bloquaient
     l'échange : la seule issue était « Passer », qui compte l'échange perdu. En
     vol, on demande simplement « répétez » — c'est de la phraséologie, pas un
     aveu d'échec, et le manuel la prévoit (p. 19).
     Deux cas : ou bien la station a déjà parlé et on rejoue son message, ou bien
     l'accueil de l'étape n'est pas encore tombé (mauvaise fréquence) et c'est
     majAccueilStation() qui doit s'en charger, avec sa propre explication. */
  $v('vfRepeat').addEventListener('click',function(){
    if(!F.running) return;
    var s=F.steps[F.i];
    if(s && s.atisStep){ majEcouteAtis(); return; }   // l'ATIS tourne en boucle : on s'y recale
    if(s && s.atcBefore && !F.accueilDit){ majAccueilStation(); return; }
    if(!surBonneFreq()){
      reponseMauvaiseFreq(s); majAideRadio();
      $v('vfRadio').scrollIntoView({behavior:'smooth',block:'nearest'});
      return;
    }
    var d=F.dernierATC;
    if(!d){ vfLog('sys','Rien à répéter : aucune transmission reçue sur cette fréquence.'); return; }
    vfLog('you', fillDisplay('{CALL}')+' — répétez.');
    messageATC(d.stn, d.brut, d.urgent);
  });
  $v('vfNext').addEventListener('click',nextStep);
  $v('vfSkip').addEventListener('click',function(){ vfLog('sys','Échange passé.'); F.results[F.i]=null; nextStep(); });
  $v('vfHint').addEventListener('click',function(){
    var s=F.steps[F.i]; if(!s) return;
    $v('vfAtc').innerHTML='<b>Exemple attendu :</b> '+esc(fillDisplay(s.attendu))+
      ' <span class="vf-src">('+esc(s.src)+')</span>';
  });
  // Terminer le vol : confirmation seulement si un vol est réellement en cours
  // (sur l'écran de débriefing, F.running est déjà false → rien à confirmer).
  $v('vfQuit').addEventListener('click',function(){
    if(!F.running) return;
    var reste=F.steps.length-F.i;
    rtConfirm('La progression de l’échange en cours sera perdue. Il reste '+reste+
              ' échange'+(reste>1?'s':'')+' sur '+F.steps.length+'. Le vol sera clos et débriefé en l’état.',
              {title:'Terminer le vol ?',ok:'Terminer le vol'})
      .then(function(ok){ if(ok && F.running) endFlight(); });
  });
  $v('navBack').addEventListener('click',function(){
    recap.classList.add('hidden');
    sec.querySelector('.nav-layout').classList.remove('hidden');
    sec.querySelector('.nav-mode').classList.remove('hidden');
    sec.querySelector('.nav-warn').classList.remove('hidden');
    if(map) setTimeout(function(){ map.invalidateSize(); },0);
  });

  // ---- Init différé : la carte n'est construite qu'à la 1re visite de la page.
  // Un conteneur en display:none a une taille nulle → Leaflet doit être recalculé.
  /* Espaces aériens exposés aux Scénarios : ils vivent dans un autre bloc <script>
     et n'ont pas accès à la portée de ce module. On publie le strict nécessaire.
     Disponible au lancement d'un scénario, puisque tous les scripts sont déjà exécutés. */
  window.RT_AIR = {
    espaceControle: espaceControle,
    organismeDe:    organismeDe,
    natureTerrain:  natureTerrain,
    stnName:        stnName,
    /* Empilement des espaces contrôlés au-dessus d'un terrain, du plus bas au plus haut. */
    empilement: function(a){
      if(typeof NAV_AIRSPACE==='undefined'||!a||typeof a.lat!=='number') return [];
      var out=[];
      NAV_AIRSPACE.features.forEach(function(f){
        var p=f.properties;
        if(p.t!=='CTR'&&p.t!=='TMA'&&p.t!=='CTA') return;
        if(!p.c) return;
        if(inPoly(a.lon,a.lat,f.geometry)) out.push(p);
      });
      out.sort(function(x,y){ return (x.lo||0)-(y.lo||0); });
      return out;
    }
  };

  // Bandeau de reprise : proposé à l'entrée sur la page si un vol a été interrompu.
  function majReprise(){
    var v=volSauvegarde(), box=$v('navResume');
    if(!box) return;
    if(!v || F.running){ box.classList.add('hidden'); return; }
    var d=BY[v.dep], a=v.arr?BY[v.arr]:null;
    $v('navResumeTxt').textContent='Vol interrompu : '+(d?d.icao:v.dep)+
      (a?' → '+a.icao:' (vol local)')+' — repris à l’échange '+(v.i+1)+'.';
    box.classList.remove('hidden');
  }
  /* ---- Interactions de l'historique ---- */
  $v('navHistHead').addEventListener('click',function(){
    var b=$v('navHistBody'), ouvert=!b.classList.contains('hidden');
    b.classList.toggle('hidden', ouvert);
    $v('navHistHead').setAttribute('aria-expanded', ouvert?'false':'true');
  });
  $v('navHistBack').addEventListener('click',fermerVol);
  $v('navHistErreurs').addEventListener('click',function(){
    var box=$v('navHistLignes'), cache=box.classList.contains('hidden');
    if(cache && volAffiche){
      var C2=(typeof ICONS!=='undefined')?ICONS:{check:'✓',warn:'✗'};
      box.innerHTML=volAffiche.lignes.map(function(l,i){
        var ko=l.manquants && l.manquants.length;
        var etat=!l.repondu?'passe':(ko?'ko':'ok');
        var puce=!l.repondu?'—':(ko?C2.warn:C2.check);
        return '<div class="nhl '+etat+'">'+
          '<div class="nhl-top"><span class="nhl-num">'+(i+1)+'</span>'+
            '<span class="nhl-ph">'+esc(l.ph)+'</span>'+
            '<span class="nhl-stn">'+esc(l.stn||'')+(l.freq?' · '+fq(l.freq):'')+'</span>'+
            '<span class="nhl-etat">'+puce+'</span></div>'+
          '<div class="nhl-bloc"><span class="nhl-lab">Attendu</span>'+
            '<span class="nhl-txt">'+esc(l.attendu||'—')+'</span></div>'+
          (l.repondu
            ? '<div class="nhl-bloc"><span class="nhl-lab">Vous avez dit</span>'+
                '<span class="nhl-txt'+(ko?' ko':'')+'">'+esc(l.dit||'(rien entendu)')+'</span></div>'+
              (ko?'<div class="nhl-man">Oublié : '+esc(l.manquants.join(' · '))+'</div>':'')
            : '<div class="nhl-bloc"><span class="nhl-txt nhl-passe">Échange passé</span></div>')+
          '</div>';
      }).join('');
    }
    box.classList.toggle('hidden', !cache);
    $v('navHistErreurs').textContent = cache ? 'Masquer le détail' : 'Voir les erreurs';
  });
  /* Refaire un vol : on réinjecte sa configuration puis on démarre. Les tirages au sort
     (météo, aléa) sont refaits — c'est le même vol, pas la même partie. */
  $v('navHistRefaire').addEventListener('click',function(){
    var v=volAffiche; if(!v) return;
    fermerVol();
    IN.dep.value=v.dep; sel.dep=v.dep;
    if(v.arr){ IN.arr.value=v.arr; sel.arr=v.arr; } else { IN.arr.value=''; sel.arr=null; }
    if(v.deg){ IN.alt.value=v.deg; sel.alt=v.deg; } else { IN.alt.value=''; sel.alt=null; }
    mode=v.mode||'voyage';
    sec.querySelectorAll('[data-volmode]').forEach(function(b){ b.classList.toggle('active',b.dataset.volmode===mode); });
    document.body.classList.toggle('volmode-local',mode==='local');
    level=v.level||'debutant';
    sec.querySelectorAll('[data-diff]').forEach(function(b){ b.classList.toggle('active',b.dataset.diff===level); });
    var m=AIRCRAFT.filter(function(a){ return a.nom===v.acftNom; })[0];
    if(m){ acChoice=m; acInput.value=m.nom; acInput.classList.remove('champ-requis'); majPlaces(); }
    if(v.alt) $v('navFl').value=v.alt;
    if(v.pax) $v('navPax').value=v.pax;
    redraw();
    startFlight();
  });

  $v('navResumeGo').addEventListener('click',function(){
    var v=volSauvegarde(); if(v){ $v('navResume').classList.add('hidden'); reprendreVol(v); }
  });
  $v('navResumeDrop').addEventListener('click',function(){
    oublierVol(); $v('navResume').classList.add('hidden');
  });

  /* Le micro est UNIQUE et partagé : le module Vol l'« emprunte » en posant un sink.
     Il n'était rendu qu'à la fin du vol — quitter la page Navigation en plein vol
     (barre latérale) laissait donc le sink en place, et le micro des Scénarios
     déversait sa transcription dans le champ caché du vol : le bouton « Parler »
     semblait mort. On rend le micro en sortant, on le reprend en revenant. */
  window.addEventListener('rt:page',function(e){
    if(e.detail.page!=='navigation'){
      if(typeof listening!=='undefined' && listening) stopListening();
      setRecoSink(null);
      return;
    }
    if(F.running && F.sink) setRecoSink(F.sink);
    majReprise();
    majHistorique();
    initMap();
    setTimeout(function(){ map.invalidateSize(); if(!sel.dep) setTarget('dep'); },30);
  });
})();
