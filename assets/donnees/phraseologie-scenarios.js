/* =============================================================================
   AVIERO — LE CATALOGUE DE PHRASÉOLOGIE
   -----------------------------------------------------------------------------
   Les treize scénarios : ce que le contrôleur dit, ce que le pilote doit
   répondre, et les mots-clés sur lesquels la réponse est notée.

   ┌─ CE FICHIER EST LE PLUS SENSIBLE DU PROJET ────────────────────────────┐
   │ AVIERO enseigne la radiotéléphonie à de vrais pilotes. Une formulation  │
   │ inventée ici est une erreur qui sera apprise, répétée en vol, et        │
   │ entendue par un contrôleur.                                             │
   │                                                                          │
   │ Donc, sans exception : toute phrase, tout collationnement, toute        │
   │ réponse du contrôleur vient du manuel officiel DSNA                     │
   │ (Manuel_Phraseologie.pdf, extraits dans PHRASEOLOGIE-MANUEL.md), et     │
   │ cite sa page en commentaire — « // Manuel DSNA p.39 ». Ce commentaire   │
   │ n'est pas de la décoration : c'est ce qui rend la phrase vérifiable.    │
   │                                                                          │
   │ Si le manuel ne couvre pas un cas : NE PAS COMBLER LE TROU. Le          │
   │ signaler, et demander.                                                  │
   │                                                                          │
   │ Cela vaut AUSSI pour les variantes acceptées à l'oral (`motsCles`,      │
   │ `variantes`) : accepter une formulation fausse revient à l'enseigner.   │
   └──────────────────────────────────────────────────────────────────────────┘

   LES IDENTIFIANTS NE SE RENOMMENT PAS
   Chaque `id` est la clé d'une ligne de la table `exercises` en base
   (sql/002-progression.sql). Le changer coupe le lien avec toutes les séances
   déjà enregistrées : la progression de l'élève ne se rattache plus à rien.
   tests/contrat/phraseologie.test.mjs vérifie que les deux listes concordent.

   LES GABARITS
   `{ADRM}`, `{STN}`, `{CALL}`, `{PISTE}`, `{QNH}`… sont résolus au lancement du
   scénario, avec le terrain et l'indicatif choisis. Ils ne sont pas du texte.

   POURQUOI LES FABRIQUES DE TOURS SONT ICI, ET PAS DANS LE MOTEUR
   `tourVentArriere()`, `tourBase()`, `tourFinale()`… ne sont pas de la logique :
   chacune rend un échange, avec sa phrase et sa page de manuel. Elles sont ici
   pour une raison de fond et une raison technique.
   La raison de fond : ce sont des phrases du manuel, elles vivent avec les
   autres phrases du manuel.
   La raison technique, apprise à la dure : `SCENARIOS` les APPELLE au moment où
   son tableau se construit, c'est-à-dire au chargement du fichier. Les laisser
   dans le moteur — chargé après — donnait « tourVentArriere is not defined »,
   puis « SCENARIOS is not defined », puis une page où plus aucun exercice ne
   démarrait. Les tests de contrat n'y ont rien vu (tous les symboles étaient
   là, dans le bon ordre de déclaration) ; ce sont les tests de navigateur qui
   l'ont dit, en trois secondes.

   ┌─ CE FICHIER DOIT CHARGER AVANT LE MOTEUR ──────────────────────────────┐
   │ Il déclare ses données en `const` au niveau racine d'un script          │
   │ classique : elles vivent donc dans la portée globale, visibles par tous  │
   │ les blocs qui suivent — et par aucun de ceux qui précèdent. Son          │
   │ <script src> est placé AVANT le bloc du moteur dans index.html, et       │
   │ tests/contrat/symboles.test.mjs surveille cet ordre.                     │
   └──────────────────────────────────────────────────────────────────────────┘

   Extrait d'index.html le 18/09/2026. Les lignes ont été DÉPLACÉES, pas
   réécrites : aucune donnée n'a changé.

   Le « use strict » ci-dessous n'est pas un ajout de comportement, c'est une
   réparation. Ce code vivait dans le bloc du moteur, sous SON « use strict ».
   Extrait en phase 1 sans la directive, il est passé en mode permissif : `this`
   change de valeur dans les appels simples, et une affectation à une variable
   non déclarée crée un global au lieu de lever une erreur. Le remettre, c'est
   retrouver le comportement d'avant l'extraction.

   L'écart n'a produit aucun symptôme — mais un mode permissif ne produit jamais
   de symptôme : c'est sa définition. Il avale l'erreur.
   ========================================================================== */
"use strict";
/* =========================================================================
   4) SCÉNARIOS (templatés — placeholders résolus au lancement)
   Contenu dérivé de la §3 du brief. Placeholders :
     {ADRM} {CALL} {PISTE} {QNH} {VENT} {CAPDEP} {NUM}
   motsCles : { label, variantes:[...] } | { label, ref:'callsign'|'terrain'|'piste'|'qnh'|'capdep'|'num' }
   role: 'pilote' = vous initiez (pas de synthèse) ; sinon l'ATC parle.
   ========================================================================= */

// Fabriques de tours réutilisées (tour de piste, intégration, branches).
// stn:'sol'|'tour' → le placeholder {STN} devient "Sol"/"Tour" (contrôlé) ou "Info" (AFIS).
function tourVentArriere(){ return {
  role:'pilote', stn:'tour', situation:"Vous êtes établi en vent arrière, piste {PISTE}.",
  consigne:"Annoncez votre position en vent arrière.",
  attendu:"Vent arrière piste {PISTE}, {CALL}.",   // Manuel DSNA p.150-151 (« vent arrière [main droite/gauche] piste XX »)
  motsCles:[ {label:"Vent arrière",variantes:["vent arriere","en vent arriere","vent ariere","etape vent arriere","vent arriere main gauche","vent arriere main droite","main gauche","main droite"]},
             {label:"Piste",variantes:["piste"]},
             {label:"Numéro de piste",ref:'piste'}, {label:"Votre indicatif",ref:'callsign'} ]
};}
function tourNumeroATC(){ return {
  stn:'tour', station:"{ADRM} {STN}",
  // réf §3.9 : le contrôleur annonce le numéro dans le circuit.
  // À VÉRIFIER avec le manuel DGAC / mon instructeur : en AFIS, l'info de trafic n'est pas une clairance de séquence.
  atc:"{CALL}, numéro {NUM}.",                       // Manuel DSNA p.151 (« numéro 3, suivez… »)
  consigne:"Collationnez votre numéro dans le circuit.",
  attendu:"Numéro {NUM}, {CALL}.",
  motsCles:[ {label:"Numéro dans le circuit",ref:'num'}, {label:"Votre indicatif",ref:'callsign'} ]
};}
function tourBase(){ return {
  role:'pilote', stn:'tour', situation:"Vous passez en étape de base.",
  consigne:"Annoncez l'étape de base.",
  attendu:"Base piste {PISTE}, {CALL}.",   // Manuel DSNA p.150-151 (« base [main droite/gauche] piste XX »)
  motsCles:[ {label:"Base",variantes:["etape de base","base","en base","etape base","branche de base","base main gauche","base main droite","main gauche","main droite"]},
             {label:"Piste",variantes:["piste"]},
             {label:"Numéro de piste",ref:'piste'}, {label:"Votre indicatif",ref:'callsign'} ]
};}
function tourFinale(){ return {
  role:'pilote', stn:'tour', situation:"Vous virez en finale.",
  consigne:"Annoncez que vous êtes en finale.",
  attendu:"Finale piste {PISTE}, {CALL}.",          // Manuel DSNA p.150-151 (« finale piste XX »)
  motsCles:[ {label:"Finale",variantes:["finale","en finale","longue finale","courte finale","derniere"]},
             {label:"Piste",variantes:["piste"]},
             {label:"Numéro de piste",ref:'piste'}, {label:"Votre indicatif",ref:'callsign'} ]
};}
function tourAtterrissage(){ return {
  stn:'tour', station:"{ADRM} {STN}",
  atc:"{CALL}, piste {PISTE}, autorisé atterrissage, vent {VENT}.",   // Manuel DSNA p.154
  consigne:"Collationnez l'autorisation d'atterrissage (le pilote annonce « j'atterris »).",
  attendu:"Piste {PISTE}, j'atterris, {CALL}.",                       // Manuel DSNA p.154 « Piste 33 droite, j'atterris »
  motsCles:[ {label:"J'atterris",variantes:["j atterris","atterris","j atteris","je me pose","je pose"]},
             {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
             {label:"Votre indicatif",ref:'callsign'} ]
};}
function tourDegagement(){ return {
  stn:'tour', station:"{ADRM} {STN}",
  atc:"{CALL}, dégagez première à gauche, rappelez piste dégagée.",   // Manuel DSNA p.160-161
  consigne:"Collationnez : dégagement, rappel piste dégagée, puis indicatif.",
  attendu:"Je dégage première à gauche et rappelle piste dégagée, {CALL}.",
  motsCles:[ {label:"Dégagement (première à gauche)",variantes:["je degage","degage","premiere a gauche","premiere gauche","degageons"]},
             {label:"Rappel piste dégagée",variantes:["piste degagee","rappelle piste degagee","piste liberee"]},
             {label:"Votre indicatif",ref:'callsign'} ]
};}
function tourPisteDegagee(){ return {
  role:'pilote', stn:'tour', station:"{ADRM} {STN}",                  // Manuel DSNA p.160 « Piste dégagée »
  situation:"Vous avez dégagé la piste.",
  consigne:"Annoncez la piste dégagée.",
  attendu:"{ADRM} {STN}, {CALL}, piste dégagée.",
  motsCles:[ {label:"Station appelée",ref:'station'}, {label:"Votre indicatif",ref:'callsign'},
             {label:"Piste dégagée",variantes:["piste degagee","degagee","degage","piste libre","piste liberee"]} ]
};}
function tourParkingATC(){ return {
  stn:'tour', station:"{ADRM} {STN}",                                 // Manuel DSNA p.160 « Roulez parking aviation générale »
  atc:"{CALL}, roulez parking aviation générale.",
  consigne:"Collationnez le roulage au parking, puis votre indicatif.",
  attendu:"Je roule parking aviation générale, {CALL}.",
  motsCles:[ {label:"Roulage parking",variantes:["je roule","roule","roulons","parking","aviation generale","parking aviation generale"]},
             {label:"Votre indicatif",ref:'callsign'} ]
};}

// Le "choix" en fin de circuit (touch-and-go boucle un tour de plus / atterrissage complet termine)
function circuitChoiceStep(){ return {
  type:'choice',
  question:"En finale, que demandez-vous ?",
  options:[
    { key:'touchgo', label:"Toucher (touch-and-go)", desc:"Vous demandez un toucher et repartez pour un tour de piste.",
      // Manuel DSNA p.164 : pilote « Demande toucher » → ATC « Piste 28, autorisé toucher ».
      tours:[{
        stn:'tour', station:"{ADRM} {STN}",
        atc:"{CALL}, piste {PISTE}, autorisé toucher.",              // Manuel DSNA p.164
        consigne:"Collationnez l'autorisation de toucher.",
        attendu:"Piste {PISTE}, autorisé toucher, {CALL}.",
        motsCles:[ {label:"Autorisé toucher",variantes:["autorise toucher","toucher","je touche","touch and go","touchandgo","toucher decoller"]},
                   {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
                   {label:"Votre indicatif",ref:'callsign'} ]
      }],
      loop:true
    },
    { key:'complet', label:"Atterrissage complet", desc:"Vous vous posez, dégagez la piste et roulez au parking.",
      tours:[ tourAtterrissage(), tourDegagement(), tourPisteDegagee(), tourParkingATC() ], loop:false }
  ]
};}

const SCENARIOS = [
  {
    id:"roulage", titre:"Mise en route + roulage", station:"{ADRM} {STN}", defaultTerrain:'dep', controllable:true,
    tours:[
      { role:'pilote', stn:'sol',
        situation:"Vous êtes au parking, prêt à demander la mise en route.",
        consigne:"Contactez le contrôle : station, indicatif, position, demande de mise en route{ATISCONS}.",
        /* {ATISPART} devient « , information Bravo » quand le terrain diffuse un ATIS,
           et disparaît sinon : « Mérignac Prévol, Rapidair 3245, en D 8, demande mise
           en route pour Lyon, information L » (manuel DSNA p. 39). */
        attendu:"{ADRM} {STN}, {CALL}, bonjour, au parking, demande mise en route{ATISPART}.",  // Manuel DSNA p.39 « Demande mise en route »
        atisMot:true,
        // AFIS : l'agent d'information ne délivre pas de clairance ; le pilote annonce ses intentions.
        afis:{ consigne:"Contactez l'agent AFIS : station, indicatif, position, intentions (mise en route).",
               attendu:"{ADRM} {STN}, {CALL}, bonjour, au parking, demande mise en route." },
        motsCles:[ {label:"Nom du terrain",ref:'terrain'}, {label:"Station appelée",ref:'station'},
                   {label:"Votre indicatif",ref:'callsign'},
                   {label:"Demande de mise en route",variantes:["mise en route","demande mise en route","pour la mise en route","demarrage","je demande la mise en route"]} ] },
      { stn:'sol', station:"{ADRM} {STN}",                                            // Manuel DSNA p.39
        atc:["{CALL}, {ADRM} {STN}, bonjour, mise en route approuvée, QNH {QNH}.",
             "{CALL}, mise en route approuvée, QNH {QNH}."],
        consigne:"Collationnez : mise en route approuvée + QNH, puis votre indicatif.",
        attendu:"Mise en route approuvée, QNH {QNH}, {CALL}.",                        // Manuel DSNA p.39
        // AFIS : pas de clairance ; l'agent donne piste en service, vent, QNH (ordre Manuel DSNA p.148).
        afis:{ atc:["{CALL}, {ADRM} {STN}, piste {PISTE} en service, vent {VENT}, QNH {QNH}."],
               consigne:"Accusez réception de l'information (piste, QNH), puis votre indicatif.",
               attendu:"Piste {PISTE}, QNH {QNH}, {CALL}.",
               motsCles:[ {label:"Piste en service",variantes:["piste","en service"]}, {label:"Numéro de piste",ref:'piste'},
                          {label:"QNH",variantes:["qnh"]}, {label:"Valeur QNH",ref:'qnh'}, {label:"Votre indicatif",ref:'callsign'} ] },
        motsCles:[ {label:"Mise en route approuvée",variantes:["mise en route","approuve","approuvee","accordee","autorise","mise en route approuvee"]},
                   {label:"QNH",variantes:["qnh"]}, {label:"Valeur QNH",ref:'qnh'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { role:'pilote', stn:'sol',
        situation:"Mise en route effectuée. Vous demandez le roulage.",
        consigne:"Demandez le roulage : station, indicatif, demande roulage.",
        attendu:"{ADRM} {STN}, {CALL}, demande roulage.",                             // Manuel DSNA p.44 « Demande roulage »
        motsCles:[ {label:"Station appelée",ref:'station'}, {label:"Votre indicatif",ref:'callsign'},
                   {label:"Demande de roulage",variantes:["demande roulage","demande le roulage","pour le roulage","pour rouler","je demande le roulage","roulage"]} ] },
      { stn:'sol', station:"{ADRM} {STN}",                                            // Manuel DSNA p.44 « Roulez point d'attente piste 27 »
        atc:["{CALL}, roulez point d'attente piste {PISTE}.",
             "{CALL}, roulez et rappelez au point d'attente piste {PISTE}."],
        consigne:"Collationnez : roulez point d'attente, piste, puis votre indicatif.",
        attendu:"Je roule point d'attente piste {PISTE}, {CALL}.",                    // Manuel DSNA p.44 « Je roule point d'attente piste 27 »
        motsCles:[ {label:"Roulage / point d'attente",variantes:["je roule","roule","roulons","point d attente","point attente","au point d attente","roulage point d attente"]},
                   {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
                   {label:"Votre indicatif",ref:'callsign'} ] }
    ]
  },
  {
    id:"decollage", titre:"Décollage", station:"{ADRM} {STN}", defaultTerrain:'dep', controllable:true,
    tours:[
      { role:'pilote', stn:'tour', situation:"Vous arrivez au point d'attente de la piste {PISTE}.",
        consigne:"Contactez la tour et annoncez-vous prêt au départ.",
        attendu:"{ADRM} {STN}, {CALL}, point d'attente piste {PISTE}, prêt au départ.", // Manuel DSNA p.50 « Rappelez prêt au départ »
        motsCles:[ {label:"Nom du terrain",ref:'terrain'}, {label:"Station appelée",ref:'station'},
                   {label:"Votre indicatif",ref:'callsign'}, {label:"Prêt au départ",variantes:["pret au depart","pret depart","pret pour le depart","pret a decoller","je suis pret","nous sommes prets","pret","prets"]},
                   {label:"Numéro de piste",ref:'piste'} ] },
      { stn:'tour', station:"{ADRM} {STN}", atc:"{CALL}, alignez-vous et attendez piste {PISTE}.", // Manuel DSNA p.53
        consigne:"Collationnez l'instruction d'alignement.",
        attendu:"Je m'aligne et j'attends piste {PISTE}, {CALL}.",                     // Manuel DSNA p.53
        motsCles:[ {label:"Je m'aligne et j'attends",variantes:["je m aligne et j attends","je m aligne et attends","je m aligne","m aligne","aligne et attends","alignons et attendons","alignons"]},
                   {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'tour', station:"{ADRM} {STN}",                                           // Manuel DSNA p.59
        atc:["{CALL}, piste {PISTE}, autorisé décollage, vent {VENT}.",
             "{CALL}, alignez-vous piste {PISTE}, autorisé décollage, vent {VENT}."],
        consigne:"Collationnez l'autorisation de décollage (le pilote annonce « je décolle »).",
        attendu:"Piste {PISTE}, je décolle, {CALL}.",                                 // Manuel DSNA p.59 « Piste 27, je décolle »
        motsCles:[ {label:"Je décolle",variantes:["je decolle","decolle","decollons","je m aligne et je decolle","aligne et je decolle"]},
                   {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'tour', station:"{ADRM} {STN}",                                           // Manuel DSNA p.63 ; cap de départ tiré au sort.
        atc:"{CALL}, passant 1000 pieds dans l'axe de piste, tournez à droite cap {CAPDEP}.",
        consigne:"Collationnez les instructions de départ.",
        attendu:"Passant 1000 pieds dans l'axe, je tourne à droite cap {CAPDEP}, {CALL}.",
        motsCles:[ {label:"Dans l'axe de piste",variantes:["axe de piste","dans l axe","cap de la piste","axe"]},
                   {label:"Tourne à droite",variantes:["tourne a droite","je tourne a droite","a droite","tournons a droite","droite"]},
                   {label:"Cap",variantes:["cap","au cap"]}, {label:"Valeur de cap",ref:'capdep'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'tour', station:"{ADRM} {STN}",                                           // Manuel DSNA p.153 « Rappelez quittant la fréquence »
        atc:"{CALL}, rappelez quittant la fréquence.",
        consigne:"Annoncez que vous quittez la fréquence, puis votre indicatif.",
        attendu:"Je quitte la fréquence, {CALL}.",
        motsCles:[ {label:"Quitte la fréquence",variantes:["je quitte la frequence","quitte la frequence","quitte","sortie de circuit","je quitte"]},
                   {label:"Votre indicatif",ref:'callsign'} ] }
    ]
  },
  {
    id:"integration", titre:"Intégration + atterrissage", station:"{ADRM} {STN}", defaultTerrain:'arr', controllable:true, alea:true,
    tours:[
      { role:'pilote', stn:'tour', situation:"De retour vers le terrain, vous approchez pour l'atterrissage.",
        consigne:"Contactez la tour : indicatif, VFR, position, altitude, pour atterrissage.",
        // Manuel DSNA p.149 (exemple VFR : « F-BGBX, PA28, VFR d'Albi à Blagnac …, 1500 pieds, estimé E à 05, information I »).
        // Position « 5 milles au sud » = donnée d'illustration (pas de point de report réel par terrain) ; phraséologie du manuel.
        attendu:"{ADRM} {STN}, {CALL}, VFR, 5 milles au sud, {ALT} pieds, pour atterrissage.",
        afis:{ consigne:"Auto-information : station, indicatif, VFR, position, altitude, pour atterrissage.",
               attendu:"{ADRM} {STN}, {CALL}, VFR, 5 milles au sud, {ALT} pieds, pour atterrissage, piste {PISTE} en service.",
               motsCles:[ {label:"Nom du terrain",ref:'terrain'}, {label:"Station appelée",ref:'station'},
                          {label:"Votre indicatif",ref:'callsign'},
                          {label:"Position / distance",variantes:["mille","milles","sud","nord","est","ouest","verticale","travers"]},
                          {label:"Pour atterrissage",variantes:["atterrissage","atterrir","pour atterrir"]},
                          {label:"Piste en service",variantes:["piste","en service"]}, {label:"Numéro de piste",ref:'piste'} ] },
        motsCles:[ {label:"Nom du terrain",ref:'terrain'}, {label:"Station appelée",ref:'station'},
                   {label:"Votre indicatif",ref:'callsign'},
                   {label:"Position / distance",variantes:["mille","milles","sud","nord","est","ouest","verticale","travers","au sud","cinq milles"]},
                   {label:"Pour atterrissage",variantes:["atterrissage","atterrir","pour atterrir","pour l atterrissage"]} ] },
      { stn:'tour', station:"{ADRM} {STN}",                                           // Manuel DSNA p.149 « entrez vent arrière … rappelez vent arrière »
        atc:"{CALL}, entrez vent arrière piste {PISTE}, rappelez vent arrière.",
        consigne:"Collationnez l'instruction d'intégration, puis votre indicatif.",
        attendu:"Je rappelle vent arrière piste {PISTE}, {CALL}.",
        // AFIS : pas de clairance d'intégration ; l'agent donne l'information piste.
        afis:{ atc:["{CALL}, {ADRM} {STN}, piste {PISTE} en service."],
               consigne:"Accusez réception de l'information piste, puis votre indicatif.",
               attendu:"Piste {PISTE} en service, {CALL}.",
               motsCles:[ {label:"Piste en service",variantes:["piste","en service"]}, {label:"Numéro de piste",ref:'piste'},
                          {label:"Votre indicatif",ref:'callsign'} ] },
        motsCles:[ {label:"Vent arrière",variantes:["vent arriere","en vent arriere","entrons vent arriere","j entre vent arriere","rappelle vent arriere","je rappelle vent arriere","main gauche","main droite"]},
                   {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      tourVentArriere(),
      tourFinale(),
      tourAtterrissage(),
      tourDegagement()
    ]
  },
  {
    id:"tourdepiste", titre:"Tour de piste", station:"{ADRM} {STN}", defaultTerrain:'dep', isCircuit:true, controllable:true, alea:true,
    // tours construits dynamiquement (voir buildQueue) : mise en route → ... → vent arrière → base → finale → choix
    tours:[]
  },
  {
    id:"navigation", titre:"Navigation / croisière", station:"Information", defaultTerrain:'dep', noTerrain:true,
    /* Échanges construits sur l'espace aérien RÉEL au-dessus du terrain choisi :
       montée dans le TMA, clairance de transit, puis changement de fréquence vers le
       service d'information. Si aucun espace contrôlé n'existe au-dessus du terrain
       (ou si les données manquent), on retombe sur les tours génériques ci-dessous. */
    buildTours: function(){
      var A=window.RT_AIR, ad=state.activeAd;
      if(!A || !ad) return null;
      // AERODROMES ne porte pas les coordonnées : elles viennent de NAV_AD_GEO (par OACI).
      var g=(typeof NAV_AD_GEO!=='undefined')?NAV_AD_GEO[ad.icao]:null;
      if(!g) return null;
      var pos={icao:ad.icao, nom:ad.nom, lat:g.lat, lon:g.lon, freq:g.freq||{}};
      var pile=A.empilement(pos).filter(function(p){ return p.t!=='CTR'; });
      if(!pile.length) return null;
      var tma=pile[0];                                  // premier espace au-dessus du CTR
      var org=A.organismeDe(tma);
      if(!org) return null;
      var plaf=(typeof tma.up==='number')?tma.up:null;
      var alt=(typeof tma.lo==='number')?Math.max(tma.lo+500,1500):2000;
      state.altCruise=alt;
      var T=[];
      // 1 — Montée : demande de clairance pour pénétrer le TMA (manuel p. 178)
      T.push({ role:'pilote', stn:'tour', station:org.n, freq:org.f,
        situation:"En montée au-dessus de "+ad.nom+", vous allez pénétrer le "+tma.t+" "+tma.n+
                  " (classe "+(tma.c||'?')+", "+(tma.lo||0)+" à "+(plaf||'?')+" pieds).",
        consigne:"Demandez le transit : organisme, indicatif, altitude souhaitée.",
        attendu:org.n+", {CALL}, demande transit VFR, {ALT} pieds.",
        motsCles:[ {label:"Organisme appelé",variantes:orgVars(org.n)},
                   {label:"Votre indicatif",ref:'callsign'},
                   {label:"Demande de transit",variantes:["transit","demande transit","transit vfr","traversee","penetration"]},
                   {label:"Altitude",ref:'alt'} ] });
      // 2 — Collationnement de la clairance
      T.push({ stn:'tour', station:org.n, freq:org.f,
        atc:"{CALL}, transitez "+tma.n+", maintenez {ALT} pieds.",
        consigne:"Collationnez : vous transitez et vous maintenez {ALT} pieds.",
        attendu:"Je transite "+tma.n+", maintiens {ALT} pieds, {CALL}.",
        motsCles:[ {label:"Je transite",variantes:["transite","je transite","transit"]},
                   {label:"Je maintiens",variantes:["maintiens","je maintiens","maintien"]},
                   {label:"Altitude",ref:'alt'},
                   {label:"Votre indicatif",ref:'callsign'} ] });
      // 2 bis — Code transpondeur assigné par l'organisme (manuel p. 186)
      var codeTma=codeSSR();
      T.push({ stn:'tour', station:org.n, freq:org.f,
        atc:"{CALL}, transpondeur "+codeTma+".",
        consigne:"Collationnez le code, puis affichez-le sur les quatre roues du transpondeur.",
        attendu:"Transpondeur "+codeTma+", {CALL}.",
        motsCles:[ {label:"Transpondeur",variantes:["transpondeur","squawk","affiche","affiche transpondeur"]},
                   {label:"Code assigné",variantes:numVariants(codeTma)},
                   {label:"Votre indicatif",ref:'callsign'} ],
        xpdrAssign:codeTma });
      // 3 — Information de trafic (manuel p. 211)
      T.push({ stn:'tour', station:org.n, freq:org.f, xpdrReq:codeTma,
        atc:["{CALL}, trafic convergent, Cessna 172, même altitude.",
             "{CALL}, trafic à midi, 8 nautiques, altitude inconnue."],
        consigne:"Accusez réception de l'information de trafic.",
        attendu:"Trafic en vue, {CALL}.",
        motsCles:[ {label:"Accusé de réception",variantes:["trafic en vue","en vue","roger","recu","bien recu","je cherche","pas en vue","negatif"]},
                   {label:"Votre indicatif",ref:'callsign'} ] });
      // 4 — Sortie du TMA : transfert vers le service d'information (manuel p. 182)
      var siv=sivProche(pos);
      if(siv){
        T.push({ stn:'tour', station:org.n, freq:org.f, tuneTo:siv.f,
          atc:"{CALL}, vous quittez "+tma.n+", contactez "+siv.n+" "+String(siv.f).replace('.',',')+".",
          consigne:"Collationnez : le nom de l'organisme, la fréquence, puis votre indicatif.",
          attendu:siv.n+" "+String(siv.f).replace('.',',')+", {CALL}.",
          motsCles:[ {label:"Organisme",variantes:orgVars(siv.n)},
                     {label:"Nouvelle fréquence",variantes:freqMots(siv.f)},
                     {label:"Votre indicatif",ref:'callsign'} ] });
        T.push({ role:'pilote', stn:'tour', station:siv.n, freq:siv.f,
          situation:"Vous venez de passer sur "+siv.n+".",
          consigne:"Prise de contact : organisme, indicatif, VFR, altitude.",
          attendu:siv.n+", {CALL}, en VFR, {ALT} pieds.",
          motsCles:[ {label:"Organisme appelé",variantes:orgVars(siv.n)},
                     {label:"Votre indicatif",ref:'callsign'},
                     {label:"En VFR",variantes:["vfr","en vfr","v f r"]},
                     {label:"Altitude",ref:'alt'} ] });
      }
      // 4 bis — Fonction d'identification (manuel p. 187)
      T.push({ stn:'tour', station:siv?siv.n:org.n, freq:siv?siv.f:org.f,
        atc:"{CALL}, transpondeur ident.",
        consigne:"Collationnez, puis pressez IDENT au transpondeur.",
        attendu:"Transpondeur ident, {CALL}.",
        motsCles:[ {label:"Transpondeur ident",variantes:["transpondeur ident","ident","squawk ident","affiche ident"]},
                   {label:"Votre indicatif",ref:'callsign'} ],
        identReq:true });
      // 5 — Quitter la fréquence (manuel p. 153)
      T.push({ stn:'tour', station:siv?siv.n:org.n, freq:siv?siv.f:org.f,
        atc:"{CALL}, rappelez quittant la fréquence.",
        consigne:"Annoncez que vous quittez la fréquence, puis votre indicatif.",
        attendu:"Je quitte la fréquence, {CALL}.",
        motsCles:[ {label:"Quitte la fréquence",variantes:["je quitte la frequence","quitte la frequence","quitte","je quitte"]},
                   {label:"Votre indicatif",ref:'callsign'} ] });
      return T;
    },
    // Manuel DSNA : Service d'information de vol (p.204), Information de trafic (p.211), Transit VFR (p.178).
    // L'organisme « Information » est générique (les vrais organismes/fréquences dépendent de la région).
    tours:[
      { role:'pilote', stn:'tour', situation:"En croisière à {ALT} pieds, vous contactez le service d'information de vol.",
        consigne:"Prise de contact : organisme, indicatif, VFR, altitude, demande d'information de vol.",
        attendu:"Information, bonjour, {CALL}, en VFR, {ALT} pieds, demande service d'information de vol.",
        motsCles:[ {label:"Organisme (Information)",variantes:["information","info","centre"]},
                   {label:"Votre indicatif",ref:'callsign'},
                   {label:"En VFR",variantes:["vfr","en vfr","v f r"]},
                   {label:"Altitude",ref:'alt'}, {label:"Altitude (pieds)",variantes:["pieds","pied","niveau"]},
                   {label:"Service d'information de vol",variantes:["service d information","information de vol","service information","siv","service d info","service d information de vol"]} ] },
      { stn:'tour', station:"Information",                                            // Manuel DSNA p.211 (information de trafic)
        atc:["{CALL}, trafic convergent, Cessna 172, même altitude.",
             "{CALL}, trafic à midi, 8 nautiques, altitude inconnue."],
        consigne:"Accusez réception de l'information de trafic (« Roger » ou « trafic en vue »).",
        attendu:"Trafic en vue, {CALL}.",
        motsCles:[ {label:"Accusé de réception",variantes:["trafic en vue","en vue","roger","recu","bien recu","je cherche","pas en vue","negatif"]},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'tour', station:"Information",                                            // Manuel DSNA p.153 « Rappelez quittant la fréquence »
        atc:"{CALL}, rappelez quittant la fréquence.",
        consigne:"Annoncez que vous quittez la fréquence, puis votre indicatif.",
        attendu:"Je quitte la fréquence, {CALL}.",
        motsCles:[ {label:"Quitte la fréquence",variantes:["je quitte la frequence","quitte la frequence","quitte","je quitte"]},
                   {label:"Votre indicatif",ref:'callsign'} ] }
    ]
  },
  {
    id:"urgence", titre:"Urgence (Mayday / Pan Pan)", station:"{ADRM} {STN}", defaultTerrain:'dep', emergency:true,
    // réf §3.11. La cause est tirée au sort ({CAUSE}) et laissée en texte libre (non scorée).
    tours:[
      { type:'choice', question:"Gravité de la situation ?",
        options:[
          { key:'mayday', label:"Détresse — MAYDAY", desc:"Danger grave et imminent.",
            tours:[ { role:'pilote', stn:'tour',
              situation:"Situation : {CAUSE}. Vous êtes à {ALT} pieds. Transmettez votre message de détresse.",
              consigne:"MAYDAY ×3, organisme, indicatif, nature, intentions, position, altitude.",
              attendu:"MAYDAY MAYDAY MAYDAY, {ADRM} {STN}, {CALL}, {CAUSE}, je me pose, verticale terrain, {ALT} pieds.",  // Manuel DSNA p.238 (SERA.14095)
              motsCles:[ {label:"Appel de détresse (MAYDAY ×3)",variantes:["mayday mayday mayday","mayday"]},
                         {label:"Votre indicatif",ref:'callsign'},
                         {label:"Intention",variantes:["pose","poser","je me pose","retour","deroute","descend","descente","demi tour","atterr","atterir","evacue","evacuation"]},
                         {label:"Position",variantes:["verticale","milles","mille","sud","nord","est","ouest","travers","dessus","au dessus","romeo","terrain","du terrain"]},
                         {label:"Altitude",variantes:["pieds","pied","niveau"]} ] },
              { stn:'tour', station:"{ADRM} {STN}",                               // Manuel DSNA p.238 « Mayday Roger, transpondeur 7700 »
                atc:"{CALL}, Mayday Roger, transpondeur 7700.",
                consigne:"Collationnez le code transpondeur, puis affichez 7700.",
                xpdrAssign:'7700',
                attendu:"Transpondeur 7700, {CALL}.",
                motsCles:[ {label:"Transpondeur 7700",variantes:["7700","transpondeur 7700","sept sept zero zero","squawk 7700","affiche 7700"]},
                           {label:"Votre indicatif",ref:'callsign'} ] } ] },
          { key:'panpan', label:"Urgence — PAN PAN", desc:"Situation urgente, sans danger grave ni imminent.",
            tours:[ { role:'pilote', stn:'tour',
              situation:"Situation : {CAUSE}. Vous êtes à {ALT} pieds. Transmettez votre message d'urgence.",
              consigne:"PAN PAN ×3, organisme, indicatif, nature, intentions, position, altitude.",
              attendu:"PAN PAN PAN PAN PAN PAN, {ADRM} {STN}, {CALL}, {CAUSE}, demande assistance, verticale terrain, {ALT} pieds.",  // Manuel DSNA p.238 (SERA.14095)
              motsCles:[ {label:"Appel d'urgence (PAN PAN ×3)",variantes:["pan pan pan pan pan pan","pan pan"]},
                         {label:"Votre indicatif",ref:'callsign'},
                         {label:"Intention",variantes:["assistance","demande","deroute","retour","pose","poser","descend","descente","atterr","priorite"]},
                         {label:"Position",variantes:["verticale","milles","mille","sud","nord","est","ouest","travers","dessus","au dessus","romeo","terrain","du terrain"]},
                         {label:"Altitude",variantes:["pieds","pied","niveau"]} ] },
              { stn:'tour', station:"{ADRM} {STN}",                               // Manuel DSNA p.238 « Pan Pan Roger »
                atc:"{CALL}, Pan Pan Roger, maintenez l'écoute.",
                consigne:"Accusez réception (Roger), puis votre indicatif.",
                attendu:"Roger, {CALL}.",
                motsCles:[ {label:"Accusé de réception",variantes:["roger","recu","bien recu","wilco"]},
                           {label:"Votre indicatif",ref:'callsign'} ] } ] }
        ] }
    ]
  },
  {
    id:"panneradio", titre:"Panne radio (procédure)", quiz:true, defaultTerrain:'dep', noTerrain:true,
    // Manuel DSNA p.246-248 : transpondeur 7600, maintien de la procédure prévue, accusés visuels
    // de la tour (balancement d'ailes / appels de phares) et signaux lumineux.
    tours:[
      { type:'quiz', question:"Votre radio ne répond plus en approche de {ADRM}. Quel code affichez-vous au transpondeur ?",
        options:[ {text:"7600",correct:true}, {text:"7700",correct:false}, {text:"7500",correct:false}, {text:"7000",correct:false} ] },
      { type:'quiz', question:"Que faites-vous de votre trajectoire ?",
        options:[ {text:"Je poursuis la trajectoire / la procédure prévue",correct:true},
                  {text:"Je fais demi-tour immédiatement",correct:false},
                  {text:"Je descends au plus vite, n'importe où",correct:false} ] },
      { type:'quiz', question:"Comment la tour peut-elle vous transmettre des instructions ?",
        options:[ {text:"Par signaux lumineux",correct:true},
                  {text:"Par téléphone",correct:false},
                  {text:"Elle ne peut plus rien faire",correct:false} ] },
      { type:'quiz', question:"Faut-il afficher 7600 ET surveiller les signaux lumineux de la tour ?",
        options:[ {text:"Oui, les deux",correct:true}, {text:"Non, seulement le transpondeur",correct:false} ] }
    ]
  },

  /* =========================================================================
     SCÉNARIOS AJOUTÉS — les sept premiers couvraient le vol type ; ceux-ci
     couvrent ce qui l'entoure et qu'on n'apprend nulle part ailleurs.

     ON N'AJOUTE À LA FIN, JAMAIS AU MILIEU. L'historique d'un élève enregistre
     l'INDICE du scénario joué (voir rtRelancerScenario) : insérer une entrée
     avant les autres décalerait tout ce qui est déjà enregistré, et « relancer »
     depuis l'accueil rouvrirait un autre exercice que celui affiché.
     ====================================================================== */
  {
    id:"pointattente", titre:"Point d'attente et traversée de piste", station:"{ADRM} {STN}",
    defaultTerrain:'dep', controllable:true,
    // Manuel DSNA p. 44-46. Le mot « piste » est RÉSERVÉ au décollage, à
    // l'atterrissage et à la traversée : d'où « maintenez position » tout court.
    tours:[
      { role:'pilote', stn:'sol',
        situation:"Vous roulez vers la piste {PISTE}. Le cheminement vous fait traverser la piste.",
        consigne:"Demandez la traversée : station, indicatif, position, demande de traversée.",
        attendu:"{ADRM} {STN}, {CALL}, avant point d'attente, demande traversée piste {PISTE}.",
        afis:{ consigne:"Auto-information : annoncez votre intention de traverser la piste.",
               attendu:"{ADRM} {STN}, {CALL}, avant point d'attente, je traverse piste {PISTE}." },
        motsCles:[ {label:"Nom du terrain",ref:'terrain'}, {label:"Station appelée",ref:'station'},
                   {label:"Votre indicatif",ref:'callsign'},
                   {label:"Traversée",variantes:["traversee","traverser","demande traversee","je traverse","traverse"]},
                   {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'} ] },
      { stn:'sol', station:"{ADRM} {STN}",                                          // Manuel DSNA p.46
        atc:["{CALL}, maintenez position, trafic en courte finale.",
             "{CALL}, maintenez avant point d'attente, trafic à l'atterrissage."],
        consigne:"Collationnez le maintien. Attention : le mot « piste » ne s'emploie pas ici.",
        attendu:"Je maintiens position, {CALL}.",
        motsCles:[ {label:"Je maintiens",variantes:["je maintiens","maintiens","maintien","maintenons","je maintiens position","avant point d attente"]},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'sol', station:"{ADRM} {STN}",                                          // Manuel DSNA p.46
        atc:"{CALL}, traversez piste {PISTE}, rappelez piste traversée.",
        consigne:"Collationnez la traversée, puis la piste.",
        attendu:"Je traverse piste {PISTE}, {CALL}.",
        motsCles:[ {label:"Je traverse",variantes:["je traverse","traverse","traversons","traversee"]},
                   {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { role:'pilote', stn:'sol',
        situation:"Vous venez de dégager la piste de l'autre côté.",
        consigne:"Rappelez piste traversée, puis votre indicatif.",
        attendu:"Piste traversée, {CALL}.",
        motsCles:[ {label:"Piste traversée",variantes:["piste traversee","traversee","j ai traverse","piste degagee","traverse"]},
                   {label:"Votre indicatif",ref:'callsign'} ] }
    ]
  },
  {
    id:"apresatt", titre:"Après atterrissage", station:"{ADRM} {STN}",
    defaultTerrain:'arr', controllable:true,
    // Manuel DSNA p. 160-161. Ce qui suit le toucher des roues : c'est là qu'on
    // parle le plus mal, l'exercice étant réputé fini.
    tours:[
      { stn:'tour', station:"{ADRM} {STN}",                                         // Manuel DSNA p.160
        atc:["{CALL}, rappelez piste dégagée.",
             "{CALL}, dégagez première à gauche, rappelez piste dégagée."],
        consigne:"Collationnez, puis votre indicatif.",
        attendu:"Je rappelle piste dégagée, {CALL}.",
        motsCles:[ {label:"Piste dégagée",variantes:["piste degagee","degagee","je degage","rappelle piste degagee","je rappelle piste degagee"]},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { role:'pilote', stn:'tour',
        situation:"Vous venez de dégager la piste par la première à gauche.",
        consigne:"Annoncez la piste dégagée, puis votre indicatif.",
        attendu:"Piste dégagée, {CALL}.",
        motsCles:[ {label:"Piste dégagée",variantes:["piste degagee","degagee","degage","j ai degage"]},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'sol', station:"{ADRM} {STN}",                                          // Manuel DSNA p.161
        atc:["{CALL}, roulez parking aviation générale.",
             "{CALL}, roulez parking aviation générale, rappelez arrivé au parking."],
        consigne:"Collationnez l'instruction de roulage.",
        attendu:"Je roule parking aviation générale, {CALL}.",
        // AFIS : aucune clairance de roulage ; le pilote annonce ce qu'il fait.
        afis:{ atc:["{CALL}, {ADRM} {STN}, pas de trafic connu au roulage."],
               consigne:"Annoncez que vous roulez au parking, puis votre indicatif.",
               attendu:"Je roule au parking, {CALL}.",
               motsCles:[ {label:"Je roule",variantes:["je roule","roule","roulons","roulage"]},
                          {label:"Parking",variantes:["parking","aire de stationnement","aviation generale","club"]},
                          {label:"Votre indicatif",ref:'callsign'} ] },
        motsCles:[ {label:"Je roule",variantes:["je roule","roule","roulons","roulage"]},
                   {label:"Parking",variantes:["parking","aviation generale","aire de stationnement","club"]},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { role:'pilote', stn:'sol',
        situation:"Vous êtes arrivé au parking, moteur sur le point d'être coupé.",
        consigne:"Annoncez votre arrivée au parking et que vous quittez la fréquence.",
        attendu:"Arrivé au parking, je quitte la fréquence, {CALL}.",
        motsCles:[ {label:"Arrivé au parking",variantes:["arrive au parking","au parking","parking","arrive"]},
                   {label:"Quitte la fréquence",variantes:["je quitte la frequence","quitte la frequence","quitte","je quitte"]},
                   {label:"Votre indicatif",ref:'callsign'} ] }
    ]
  },
  {
    id:"transit", titre:"Transit VFR d'un espace contrôlé", station:"{ADRM} {STN}",
    defaultTerrain:'dep', controllable:true,
    // Manuel DSNA p. 178. Traverser la CTR de quelqu'un d'autre : la demande la
    // plus fréquente d'un vol de navigation, et celle qu'on formule le plus mal.
    tours:[
      { role:'pilote', stn:'tour',
        situation:"Vous approchez de l'espace contrôlé de {ADRM}, à {ALT} pieds. Vous souhaitez le traverser.",
        consigne:"Demandez le transit : station, indicatif, demande de transit VFR, altitude, point d'entrée et de sortie.",
        attendu:"{ADRM} {STN}, {CALL}, demande transit VFR, {ALT} pieds, du point Whisky au point November.",  // Manuel DSNA p.178
        motsCles:[ {label:"Nom du terrain",ref:'terrain'}, {label:"Station appelée",ref:'station'},
                   {label:"Votre indicatif",ref:'callsign'},
                   {label:"Demande de transit",variantes:["demande transit","transit","je demande le transit","transit vfr","traversee"]},
                   {label:"VFR",variantes:["vfr","v f r"]},
                   {label:"Altitude",ref:'alt'} ] },
      { stn:'tour', station:"{ADRM} {STN}",                                         // Manuel DSNA p.178
        atc:"{CALL}, transitez via Whisky puis November, maintenez {ALT} pieds, rappelez avant Whisky.",
        consigne:"Collationnez : l'itinéraire, l'altitude, le rappel demandé.",
        attendu:"Je transite via Whisky puis November, je maintiens {ALT} pieds, je rappelle avant Whisky, {CALL}.",
        motsCles:[ {label:"Je transite",variantes:["je transite","transite","transit","je traverse"]},
                   {label:"Itinéraire",variantes:["whisky","whiskey","november","via"]},
                   {label:"Je maintiens",variantes:["je maintiens","maintiens","maintien"]},
                   {label:"Altitude",ref:'alt'},
                   {label:"Rappel",variantes:["je rappelle","rappelle","rappel"]},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { role:'pilote', stn:'tour',
        situation:"Vous arrivez au point Whisky.",
        consigne:"Rappelez au point : station, indicatif, position, altitude.",
        attendu:"{ADRM} {STN}, {CALL}, avant Whisky, {ALT} pieds.",
        motsCles:[ {label:"Station appelée",ref:'station'}, {label:"Votre indicatif",ref:'callsign'},
                   /* Le correcteur ramène « whisky » sur le mot OACI « whiskey » :
                      les deux graphies doivent figurer, sinon le mot-clé est
                      introuvable sur sa propre phrase attendue. */
                   {label:"Position",variantes:["whisky","whiskey","avant whisky","avant whiskey",
                                                "au point whisky","au point whiskey","verticale whisky"]},
                   {label:"Altitude",ref:'alt'} ] },
      { stn:'tour', station:"{ADRM} {STN}",                                         // Manuel DSNA p.182
        atc:"{CALL}, quittez ma fréquence, contactez l'information, au revoir.",
        consigne:"Accusez réception et annoncez que vous quittez la fréquence.",
        attendu:"Je quitte la fréquence, au revoir, {CALL}.",
        motsCles:[ {label:"Quitte la fréquence",variantes:["je quitte la frequence","quitte la frequence","quitte","je quitte"]},
                   {label:"Votre indicatif",ref:'callsign'} ] }
    ]
  },
  {
    id:"remisegaz", titre:"Remise de gaz", station:"{ADRM} {STN}",
    defaultTerrain:'arr', controllable:true, alea:true,
    // Manuel DSNA p. 159. ⚠ L'instruction de remise de gaz NE MENTIONNE PAS le
    // vent — le manuel l'écarte expressément, pour éviter toute confusion avec
    // une autorisation d'atterrissage.
    tours:[
      { role:'pilote', stn:'tour',
        situation:"Vous êtes en finale piste {PISTE}, stabilisé.",
        consigne:"Annoncez la finale : station, indicatif, finale, piste.",
        attendu:"{ADRM} {STN}, {CALL}, finale piste {PISTE}.",
        motsCles:[ {label:"Station appelée",ref:'station'}, {label:"Votre indicatif",ref:'callsign'},
                   {label:"Finale",variantes:["finale","en finale","courte finale","longue finale"]},
                   {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'} ] },
      { stn:'tour', station:"{ADRM} {STN}",                                         // Manuel DSNA p.159
        atc:["{CALL}, remettez les gaz, rappelez vent arrière piste {PISTE}.",
             "{CALL}, remettez les gaz, trafic sur la piste, rappelez vent arrière piste {PISTE}."],
        consigne:"Collationnez : la remise de gaz, puis le rappel demandé.",
        attendu:"Je remets les gaz et rappelle vent arrière piste {PISTE}, {CALL}.",
        motsCles:[ {label:"Je remets les gaz",variantes:["je remets les gaz","remets les gaz","remise de gaz","remise des gaz","remettons les gaz","go around"]},
                   {label:"Rappel vent arrière",variantes:["rappelle vent arriere","vent arriere","je rappelle vent arriere"]},
                   {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      tourVentArriere(),
      tourBase(),
      tourFinale(),
      tourAtterrissage(),
      tourDegagement()
    ]
  },
  {
    id:"vocabulaire", titre:"Expressions conventionnelles", quiz:true,
    defaultTerrain:'dep', noTerrain:true,
    // Manuel DSNA p. 19-21. Le vocabulaire est IMPOSÉ : ces mots ont un sens
    // unique, et un synonyme de la vie courante n'en est pas un ici.
    tours:[
      { type:'quiz', question:"Le contrôleur vous demande : « Êtes-vous prêt pour un départ immédiat ? » Que répondez-vous ?",
        options:[ {text:"« Affirme »",correct:true},
                  {text:"« Roger »",correct:false},
                  {text:"« Oui »",correct:false},
                  {text:"« Wilco »",correct:false} ] },
      { type:'quiz', question:"Que signifie exactement « WILCO » ?",
        options:[ {text:"J'ai compris ET je vais exécuter",correct:true},
                  {text:"J'ai reçu votre message",correct:false},
                  {text:"Attendez, je rappelle",correct:false},
                  {text:"Je ne peux pas exécuter",correct:false} ] },
      { type:'quiz', question:"« ROGER » peut-il servir à répondre à une question appelant un collationnement ?",
        options:[ {text:"Non, jamais",correct:true},
                  {text:"Oui, c'est équivalent",correct:false},
                  {text:"Oui, si le contrôleur est occupé",correct:false} ] },
      { type:'quiz', question:"Le contrôleur vous donne une instruction que vous ne pouvez pas suivre. Quel mot employez-vous ?",
        options:[ {text:"« Impossible »",correct:true},
                  {text:"« Négatif »",correct:false},
                  {text:"« Standby »",correct:false},
                  {text:"« Ignorez »",correct:false} ] },
      { type:'quiz', question:"« VEILLEZ 121 décimale 5 » vous demande de :",
        options:[ {text:"Écouter cette fréquence sans y appeler",correct:true},
                  {text:"Appeler immédiatement sur cette fréquence",correct:false},
                  {text:"Quitter votre fréquence actuelle",correct:false} ] },
      { type:'quiz', question:"Le contrôleur dit « IGNOREZ mon dernier message ». Cela veut dire :",
        options:[ {text:"Le message précédent est annulé",correct:true},
                  {text:"Répétez le message précédent",correct:false},
                  {text:"Attendez avant de répondre",correct:false} ] },
      { type:'quiz', question:"Après « AUTORISÉ atterrissage piste 27 », que dites-vous ?",
        options:[ {text:"« Piste 27, j'atterris »",correct:true},
                  {text:"« Piste 27, autorisé atterrissage »",correct:false},
                  {text:"« Roger, piste 27 »",correct:false},
                  {text:"« Wilco »",correct:false} ] },
      { type:'quiz', question:"Différence entre « APPROUVÉ » et « AUTORISÉ » ?",
        options:[ {text:"« Approuvé » porte sur une demande, « autorisé » sur une clairance",correct:true},
                  {text:"Aucune, les deux sont interchangeables",correct:false},
                  {text:"« Autorisé » s'emploie au sol, « approuvé » en vol",correct:false} ] }
    ]
  },
  {
    id:"nombres", titre:"Nombres, sigles et indicatifs", quiz:true,
    defaultTerrain:'dep', noTerrain:true,
    // Manuel DSNA p. 11-18. Ce qui se dit chiffre par chiffre, ce qui se dit
    // comme dans la vie courante, et la règle de l'indicatif abrégé.
    tours:[
      { type:'quiz', question:"Comment transmet-on la fréquence 120,775 ?",
        options:[ {text:"« Cent vingt décimale sept cent soixante-quinze »",correct:true},
                  {text:"« Cent vingt virgule sept sept cinq »",correct:false},
                  {text:"« Cent vingt point sept sept cinq »",correct:false},
                  {text:"« Un deux zéro sept sept cinq »",correct:false} ] },
      { type:'quiz', question:"Un cap se transmet toujours avec :",
        options:[ {text:"Trois chiffres — « cap zéro six zéro »",correct:true},
                  {text:"Deux chiffres — « cap soixante »",correct:false},
                  {text:"Le nombre de degrés, sans règle particulière",correct:false} ] },
      { type:'quiz', question:"Comment énonce-t-on le sigle QNH ?",
        options:[ {text:"« Q-N-H », lettre par lettre",correct:true},
                  {text:"« Quénache »",correct:false},
                  {text:"« Québec November Hotel »",correct:false} ] },
      { type:'quiz', question:"Que signifie QFU ?",
        options:[ {text:"La piste en service",correct:true},
                  {text:"La pression au niveau de la mer",correct:false},
                  {text:"La visibilité horizontale",correct:false} ] },
      { type:'quiz', question:"Quand doit-on impérativement transmettre un nombre chiffre par chiffre ?",
        options:[ {text:"Quand la réception est mauvaise",correct:true},
                  {text:"Toujours, sans exception",correct:false},
                  {text:"Seulement pour les altitudes",correct:false} ] },
      { type:'quiz', question:"Votre indicatif est F-BGBX. À quel moment pouvez-vous l'abréger en F-BX ?",
        options:[ {text:"Seulement après que le contrôleur l'a abrégé lui-même",correct:true},
                  {text:"Dès le premier contact, pour gagner du temps",correct:false},
                  {text:"Jamais : l'indicatif est toujours complet",correct:false},
                  {text:"Quand la fréquence est peu chargée",correct:false} ] },
      { type:'quiz', question:"La forme abrégée d'un indicatif français reprend :",
        options:[ {text:"Le premier caractère et les deux derniers",correct:true},
                  {text:"Les trois derniers caractères",correct:false},
                  {text:"Les deux premiers et le dernier",correct:false} ] },
      { type:'quiz', question:"Peut-on faire précéder son indicatif du type d'avion ?",
        options:[ {text:"Oui — « Cessna F-ABCD »",correct:true},
                  {text:"Non, jamais",correct:false},
                  {text:"Seulement pour les avions de transport",correct:false} ] },
      { type:'quiz', question:"Comment dit-on CAVOK à la radio ?",
        options:[ {text:"« CAV-O-Kay »",correct:true},
                  {text:"« C-A-V-O-K », lettre par lettre",correct:false},
                  {text:"« Cavoque »",correct:false} ] }
    ]
  }
];
