/* =============================================================================
   Albatros VFR — LE CATALOGUE DE PHRASÉOLOGIE
   -----------------------------------------------------------------------------
   Les treize scénarios : ce que le contrôleur dit, ce que le pilote doit
   répondre, et les mots-clés sur lesquels la réponse est notée.

   ┌─ CE FICHIER EST LE PLUS SENSIBLE DU PROJET ────────────────────────────┐
   │ Albatros VFR enseigne la radiotéléphonie à de vrais pilotes. Une formulation  │
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
/* LE CIRCUIT DE LA P. 151, mot pour mot (03/10/2026) :
     « Blagnac Tour, F-BX, vent arrière main droite piste 33 droite. »
     « F-BX, numéro 3, suivez un Cessna 172, en base, rappelez base main droite piste 33 droite. »
     « Numéro 3, trafic en vue, je rappelle base main droite piste 33 droite, F-BX. »
     « Blagnac Tour, F-BX, base main droite piste 33 droite. »
     « F-BX, rappelez finale piste 33 droite. » / « Je rappelle finale piste 33 droite, F-BX. »
   Ce qui a changé : l'indicatif passe DEVANT la position dans les comptes rendus
   (« Vent arrière piste 27, F-ABCD » mettait l'indicatif à la fin, comme un
   collationnement) ; le numéro vient avec le trafic à suivre et « rappelez
   base », et se collationne avec « trafic en vue » ; « rappelez finale » et son
   collationnement existent enfin. « Main droite / main gauche » manque : les
   données du simulateur n'ont pas le sens du circuit de chaque terrain, et il ne
   s'invente pas — la p. 148 admet « Entrez vent arrière piste 04 » sans lui. */
function tourVentArriere(){ return {
  role:'pilote', stn:'tour', situation:"Vous êtes établi en vent arrière, piste {PISTE}.",
  consigne:"Annoncez votre position en vent arrière.",
  attendu:"{ADRM} {STN}, {CALL}, vent arrière piste {PISTE}.",   // Manuel DSNA p.151
  motsCles:[ {label:"Nom du terrain",ref:'terrain'}, {label:"Station appelée",ref:'station'},
             {label:"Votre indicatif",ref:'callsign'},
             {label:"Vent arrière",variantes:["vent arriere","vent arriere main gauche","vent arriere main droite"]},
             {label:"Numéro de piste",ref:'piste'} ]
};}
function tourNumeroATC(){ return {
  stn:'tour', station:"{ADRM} {STN}", twrSeul:true,
  atc:"{CALL}, numéro {NUM}{SUIVEZ}, rappelez base piste {PISTE}.",   // Manuel DSNA p.151
  consigne:"Collationnez : votre numéro, le trafic en vue, et vous rappellerez en base.",
  attendu:"Numéro {NUM}{TRAFICVU}, je rappelle base piste {PISTE}, {CALL}.", // Manuel DSNA p.151
  motsCles:[ {label:"Numéro dans le circuit",ref:'num'},
             {label:"Trafic en vue",variantes:["trafic en vue"]},
             {label:"Je rappelle base",variantes:["je rappelle base","rappelle base"]},
             {label:"Numéro de piste",ref:'piste'}, {label:"Votre indicatif",ref:'callsign'} ]
};}
/* AFIS, manuel AFIS p. 40 : en vent arrière, l'agent demande de rappeler en
   finale — « rappellerons finale piste 24 ». Pas de numéro, pas de « suivez ». */
function tourRappelFinaleAfis(){ return {
  stn:'tour', station:"{ADRM} {STN}", afisSeul:true,
  atc:"{CALL}, rappelez finale piste {PISTE}.",                                     // Manuel AFIS (UAF & FA / DGAC) p.40
  consigne:"Dites que vous rappellerez en finale.",
  attendu:"Rappellerons finale piste {PISTE}, {CALL}.",                             // Manuel AFIS p.40
  motsCles:[ {label:"Rappellerons finale",variantes:["rappellerons finale","rappellerons"]},
             {label:"Numéro de piste",ref:'piste'}, {label:"Votre indicatif",ref:'callsign'} ]
};}
function tourBase(){ return {
  role:'pilote', stn:'tour', situation:"Vous passez en étape de base.",
  consigne:"Annoncez l'étape de base.",
  attendu:"{ADRM} {STN}, {CALL}, base piste {PISTE}.",   // Manuel DSNA p.151
  motsCles:[ {label:"Nom du terrain",ref:'terrain'}, {label:"Station appelée",ref:'station'},
             {label:"Votre indicatif",ref:'callsign'},
             {label:"Base",variantes:["base","base main gauche","base main droite"]},
             {label:"Numéro de piste",ref:'piste'} ]
};}
function tourRappelFinale(){ return {
  stn:'tour', station:"{ADRM} {STN}", twrSeul:true,
  atc:"{CALL}, rappelez finale piste {PISTE}.",                       // Manuel DSNA p.151
  consigne:"Collationnez : vous rappellerez en finale.",
  attendu:"Je rappelle finale piste {PISTE}, {CALL}.",                 // Manuel DSNA p.151
  motsCles:[ {label:"Je rappelle finale",variantes:["je rappelle finale","rappelle finale"]},
             {label:"Numéro de piste",ref:'piste'}, {label:"Votre indicatif",ref:'callsign'} ]
};}
function tourFinale(){ return {
  role:'pilote', stn:'tour', situation:"Vous virez en finale.",
  consigne:"Annoncez que vous êtes en finale.",
  attendu:"{ADRM} {STN}, {CALL}, finale piste {PISTE}.",          // Manuel DSNA p.150-151 (« finale piste XX »)
  motsCles:[ {label:"Nom du terrain",ref:'terrain'}, {label:"Station appelée",ref:'station'},
             {label:"Votre indicatif",ref:'callsign'},
             {label:"Finale",variantes:["finale"]},
             {label:"Numéro de piste",ref:'piste'} ]
};}
function tourAtterrissage(){ return {
  stn:'tour', station:"{ADRM} {STN}",
  /* AFIS : PAS d'autorisation d'atterrissage — l'agent donnait « autorisé
     atterrissage », qu'un agent AFIS ne délivre jamais. Manuel AFIS p. 41. */
  afis:{ atc:"{CALL}, vent {VENT}, rappelez piste dégagée.",          // Manuel AFIS (UAF & FA / DGAC) p.41
         consigne:"Accusez réception, puis votre indicatif.",
         attendu:"Roger, {CALL}.",                                    // Manuel AFIS p.41
         motsCles:[ {label:"Roger",variantes:["roger"]}, {label:"Votre indicatif",ref:'callsign'} ] },
  atc:"{CALL}, piste {PISTE}, autorisé atterrissage, vent {VENT}.",   // Manuel DSNA p.154
  consigne:"Collationnez l'autorisation d'atterrissage (le pilote annonce « j'atterris »).",
  attendu:"Piste {PISTE}, j'atterris, {CALL}.",                       // Manuel DSNA p.154 « Piste 33 droite, j'atterris »
  motsCles:[ {label:"J'atterris",variantes:["j atterris","atterris","j atteris","je me pose","je pose"]},
             {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
             {label:"Votre indicatif",ref:'callsign'} ]
};}
function tourDegagement(){ return {
  stn:'tour', station:"{ADRM} {STN}", twrSeul:true,
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
  stn:'tour', station:"{ADRM} {STN}", twrSeul:true,                                 // Manuel DSNA p.160 « Roulez parking aviation générale »
  atc:"{CALL}, roulez parking aviation générale.",
  consigne:"Collationnez le roulage au parking, puis votre indicatif.",
  attendu:"Je roule parking aviation générale, {CALL}.",
  motsCles:[ {label:"Roulage parking",variantes:["je roule","roule","roulons","parking","aviation generale","parking aviation generale"]},
             {label:"Votre indicatif",ref:'callsign'} ]
};}

/* Un tour de piste, de la vent arrière à la décision en finale. Sert au tour de
   piste, à l'intégration et à chaque reprise après un toucher, une remise de gaz
   ou un passage bas. Les échanges de tour seulement / AFIS seulement sont triés
   à la construction (buildQueue, chooseBranch). La boucle des Scénarios oubliait
   « rappelez finale » (03/10/2026) : une seule liste désormais. */
function toursCircuit(o){
  o = o || {};
  const t = [ tourVentArriere(), tourNumeroATC(), tourRappelFinaleAfis(), tourBase(),
              tourRappelFinale(), tourFinale() ];
  if(o.choix!==false) t.push(circuitChoiceStep());
  return t;
}
/* L'atterrissage complet, du collationnement au parking. AFIS (manuel AFIS
   p. 41) : « Roger » à l'information, « piste dégagée », puis « au parking,
   quittons la fréquence » — l'agent ne fait rouler personne. */
function toursAtterrissageComplet(){
  return [ tourAtterrissage(), tourDegagement(), tourPisteDegagee(),
    { stn:'tour', station:"{ADRM} {STN}", afisSeul:true,
      atc:"{CALL}, rappelez parking.",                                             // Manuel AFIS p.41
      consigne:"Au parking : annoncez-le et quittez la fréquence.",
      attendu:"{ADRM} {STN}, {CALL}, au parking, quittons la fréquence.",          // Manuel AFIS p.41
      motsCles:[ {label:"Au parking",variantes:["au parking","parking"]},
                 {label:"Quittons la fréquence",variantes:["quittons la frequence","quittons"]},
                 {label:"Votre indicatif",ref:'callsign'} ] },
    tourParkingATC() ];
}

/* LE CHOIX EN FINALE (03/10/2026, demande du développeur : « laisser beaucoup
   plus de choix au pilote »). Chaque option est une phrase du manuel DSNA :
   - toucher : « Demande toucher » / « Piste 28, autorisé toucher » (p. 164) ;
   - remise de gaz : « Je remets les gaz » (p. 159) / « Roger » (p. 147) ;
   - passage bas : « Demande passage bas » / « Passage bas approuvé » (p. 164) ;
   - atterrissage complet : la finale ordinaire (p. 151, 154).
   Les trois premières n'existent que face à une TOUR : le manuel AFIS n'a ni
   toucher, ni remise de gaz annoncée d'elle-même, ni passage bas. En AFIS il ne
   reste qu'une option — le choix s'efface alors (renderChoice).
   Le collationnement du toucher, « Piste X, autorisé toucher », répète la
   clairance : la p. 164 ne donne pas la réponse du pilote, et la p. 34 range le
   « toucher/option » parmi les éléments de piste QUI SE COLLATIONNENT — répéter
   la clairance est alors la règle générale du collationnement (p. 34). */
function circuitChoiceStep(){ return {
  type:'choice',
  question:"En finale, que faites-vous ?",
  options:[
    { key:'complet', label:"Atterrissage complet", desc:"Vous vous posez, dégagez la piste et rejoignez le parking.",
      tours: toursAtterrissageComplet(), loop:false },
    { key:'touchgo', label:"Toucher (touch-and-go)", desc:"Vous demandez un toucher et repartez pour un tour de piste.", twrSeul:true,
      tours:[{
        role:'pilote', stn:'tour',
        situation:"Vous voulez faire un toucher.",
        consigne:"Demandez un toucher.",
        attendu:"{CALL}, demande toucher.",                           // Manuel DSNA p.164 « Demande toucher »
        motsCles:[ {label:"Demande toucher",variantes:["demande toucher","demande un toucher"]},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      {
        stn:'tour', station:"{ADRM} {STN}",
        atc:"{CALL}, piste {PISTE}, autorisé toucher.",              // Manuel DSNA p.164
        consigne:"Collationnez l'autorisation de toucher.",
        attendu:"Piste {PISTE}, autorisé toucher, {CALL}.",           // Manuel DSNA p.34 (collationnement) et p.164
        motsCles:[ {label:"Autorisé toucher",variantes:["autorise toucher"]},
                   {label:"Numéro de piste",ref:'piste'},
                   {label:"Votre indicatif",ref:'callsign'} ]
      }],
      loop:true },
    { key:'remise', label:"Remise de gaz", desc:"Vous interrompez l'approche et repartez pour un tour de piste.", twrSeul:true,
      tours:[{
        role:'pilote', stn:'tour',
        situation:"L'approche ne vous convient pas : vous remettez les gaz.",
        consigne:"Annoncez votre remise de gaz.",
        attendu:"{CALL}, je remets les gaz.",                          // Manuel DSNA p.159 « Je remets les gaz »
        motsCles:[ {label:"Je remets les gaz",variantes:["je remets les gaz","remets les gaz"]},
                   {label:"Votre indicatif",ref:'callsign'} ] }],
      loop:true },
    { key:'passagebas', label:"Passage bas", desc:"Vous demandez un passage bas au-dessus de la piste, puis un nouveau tour.", twrSeul:true,
      tours:[{
        role:'pilote', stn:'tour',
        situation:"Vous voulez faire un passage bas au-dessus de la piste.",
        consigne:"Demandez un passage bas.",
        attendu:"{CALL}, demande passage bas.",                        // Manuel DSNA p.164 « Demande passage bas »
        motsCles:[ {label:"Demande passage bas",variantes:["demande passage bas","demande un passage bas"]},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      {
        stn:'tour', station:"{ADRM} {STN}",
        atc:"{CALL}, passage bas approuvé.",                           // Manuel DSNA p.164
        consigne:"Rien à collationner : un passage bas approuvé n'est pas une clairance de piste. Passez à la suite.",
        attendu:null }],
      loop:true }
  ]
};}

/* Le départ IMMÉDIAT de la p. 60, mot pour mot : la tour pose la question, le
   pilote répond « Affirme », puis l'alignement et l'autorisation tiennent en un
   seul message, et le collationnement aussi (« Je m'aligne piste 05 gauche et je
   décolle, Rapidair 3245 »). Pas de « alignez-vous et attendez » dans ce cas.
   Appelée au lancement du scénario Décollage (buildTours), donc APRÈS que
   SCENARIOS existe : la suite du départ (cap, sortie de fréquence) est reprise du
   départ ordinaire, pour qu'il n'y ait qu'un seul endroit où l'écrire. */
function departImmediat(){
  const ordinaire = SCENARIOS.filter(s => s.id==='decollage')[0].tours;
  return [
    { stn:'tour', station:"{ADRM} {STN}",
      atc:"{CALL}, êtes-vous prêt pour un départ immédiat ?",                        // Manuel DSNA p.50 et p.60
      situation:"Vous êtes au point d'attente de la piste {PISTE}, prêt à partir, à l'écoute de la tour.",
      consigne:"Répondez à la question du contrôleur, puis votre indicatif.",
      attendu:"Affirme, {CALL}.",                                                     // Manuel DSNA p.60 « Affirme, Rapidair 3245 »
      motsCles:[ {label:"Affirme",variantes:["affirme"]}, {label:"Votre indicatif",ref:'callsign'} ] },
    { stn:'tour', station:"{ADRM} {STN}",
      atc:"{CALL}, alignez-vous piste {PISTE}, autorisé décollage immédiat, vent {VENT}.", // Manuel DSNA p.60
      consigne:"Collationnez : le pilote dit « je m'aligne … et je décolle » — « autorisé décollage » est réservé au contrôleur.",
      attendu:"Je m'aligne piste {PISTE} et je décolle, {CALL}.",                     // Manuel DSNA p.60
      motsCles:[ {label:"Je m'aligne",variantes:["je m aligne","m aligne"]},
                 {label:"Je décolle",variantes:["je decolle","decolle"]},
                 {label:"Numéro de piste",ref:'piste'},
                 {label:"Votre indicatif",ref:'callsign'} ] }
  ].concat(ordinaire.filter(t => t.suiteDepart));   // cap de départ, puis sortie de fréquence
}

const SCENARIOS = [
  {
    id:"roulage", titre:"Contact et roulage", station:"{ADRM} {STN}", defaultTerrain:'dep', controllable:true,
    /* LE DÉPART VFR DE LA P. 45, MOT POUR MOT (03/10/2026, décision du développeur).
       Le manuel étiquette lui-même cet exemple « Cas d'un vol VFR » : contact et
       « bonjour », puis directement la demande de roulage — AUCUNE demande de mise
       en route. La mise en route (p. 39-40) est rangée sous « Mise en route –
       clairance initiale – SID », et ses deux exemples sont des vols IFR (Rapidair,
       C-TOT, SID, niveau). Le scénario s'appelait « Mise en route + roulage » et
       faisait demander puis collationner une mise en route : c'était l'IFR enseigné
       à des pilotes VFR. La lettre d'information revient donc dans la demande de
       roulage, là où la p. 45 la place (« …pour vol à destination de Guéret,
       information B »). Même déroulé que le départ de la Navigation. */
    tours:[
      { role:'pilote', stn:'sol',
        situation:"Vous êtes au parking, prêt à rouler. Premier appel à l'organisme.",
        consigne:"Premier contact : organisme, votre indicatif, bonjour.",
        attendu:"{ADRM} {STN}, {CALL}, bonjour.",                                       // Manuel DSNA p.45 « Chavenay tour, F-BX, bonjour »
        afis:{ attendu:"{ADRM} {STN}, bonjour, {CALL}." },                              // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.32 « Bourges Information bonjour, F B X »
        motsCles:[ {label:"Nom du terrain",ref:'terrain'}, {label:"Station appelée",ref:'station'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'sol', station:"{ADRM} {STN}",
        atc:["{CALL}, {ADRM} {STN}, bonjour."],                                          // Manuel DSNA p.45 « F-BX, Chavenay tour, bonjour »
        /* AFIS (03/10/2026) : le départ VFR de Bourges, manuel AFIS p. 32. L'agent ne
           délivre aucune consigne de roulage : on lui demande les PARAMÈTRES, et il
           répond « rappeler pour rouler ». La phrase « demande consignes de roulage »
           adressée à un agent AFIS était fausse. « Destination » : forme du manuel. */
        afis:{ atc:["{CALL}, bonjour, {ADRM} {STN}, j'écoute."],                        // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.32
               consigne:"Annonce : indicatif, type d'avion, position, VFR sans plan de vol, destination {DEST}, et demandez les paramètres pour le départ.",
               attendu:"{CALL}, {TYPE}, au parking, VFR sans plan de vol, destination {DEST}, demandons paramètres pour le départ.", // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.32
               atisMot:false,
               motsCles:[ {label:"Votre indicatif",ref:'callsign'}, {label:"Type d'avion",ref:'type'},
                          {label:"VFR",variantes:["vfr","v f r"]}, {label:"Destination",ref:'dest'},
                          {label:"Demandons paramètres pour le départ",variantes:["parametres pour le depart","demandons parametres","parametres"]} ] },
        situation:"{TYPE} au parking. Vous demandez le roulage pour un vol à destination de {DEST}.",
        /* L'ANNONCE COMPLÈTE de la p. 45 : « F-BGBX, TB10, parking club, demande
           consignes de roulage pour vol à destination de Guéret, information B ».
           Pas de « personnes à bord » : le manuel ne le donne nulle part. */
        consigne:"Annonce complète : indicatif, type d'avion, position, puis votre demande de consignes de roulage pour un vol à destination de {DEST}{ATISCONS}.",
        attendu:"{CALL}, {TYPE}, au parking, demande consignes de roulage pour vol à destination de {DEST}{ATISPART}.", // Manuel DSNA p.45
        atisMot:true,
        motsCles:[ {label:"Votre indicatif",ref:'callsign'},
                   {label:"Type d'avion",ref:'type'},
                   {label:"Position (parking)",variantes:["parking","au parking","parking club","aire de stationnement"]},
                   {label:"Demande de roulage",variantes:["consignes de roulage","demande roulage","demande consignes","roulage"]},
                   {label:"Destination",ref:'dest'} ] },
      { stn:'sol', station:"{ADRM} {STN}",                                            // Manuel DSNA p.45
        atc:["{CALL}, roulez et entrez aire d'attente {PISTE} et rappelez prêt."],
        consigne:"Collationnez : vous roulez et entrez dans l'aire d'attente {PISTE}, et vous rappellerez prêt.",
        attendu:"Je roule et entre dans l'aire d'attente {PISTE} et rappelle prêt, {CALL}.", // Manuel DSNA p.45
        afis:{ atc:["{CALL}, piste {PISTE}, vent {VENT}, QNH {QNH}, rappeler pour rouler."], // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.32
               consigne:"Accusez réception : la piste et le QNH, puis votre indicatif.",
               attendu:"Roger, piste {PISTE}, QNH {QNH}, {CALL}.",                       // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.32
               motsCles:[ {label:"Numéro de piste",ref:'piste'}, {label:"QNH",variantes:["qnh"]},
                          {label:"Valeur QNH",ref:'qnh'}, {label:"Votre indicatif",ref:'callsign'} ] },
        motsCles:[ {label:"Je roule",variantes:["je roule","roule"]},
                   {label:"Aire d'attente",variantes:["aire d attente","point d attente","aire dattente"]},
                   {label:"Numéro de piste",ref:'piste'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      // AFIS seulement : on annonce qu'on roule, l'agent demande de rappeler au point d'attente.
      { role:'pilote', stn:'sol', afisSeul:true,
        situation:"Paramètres notés, vous êtes prêt à rouler.",
        consigne:"Annoncez que vous roulez vers le point d'attente de la piste {PISTE}.",
        attendu:"{ADRM} {STN}, {CALL}, roulons point d'attente piste {PISTE}.",          // Manuel AFIS (UAF & FA / DGAC, éd. 2022) éd. 2019 p.32 (l'éd. 2022 a perdu « roulons » ; sa colonne anglaise dit « taxiing »)
        motsCles:[ {label:"Roulons",variantes:["roulons"]}, {label:"Point d'attente",variantes:["point d attente"]},
                   {label:"Numéro de piste",ref:'piste'}, {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'sol', station:"{ADRM} {STN}", afisSeul:true,
        atc:"{CALL}, rappelez point d'attente piste {PISTE}.",                             // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.33
        consigne:"Accusez réception, puis votre indicatif.",
        attendu:"Roger, {CALL}.",                                                          // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.33
        motsCles:[ {label:"Roger",variantes:["roger"]}, {label:"Votre indicatif",ref:'callsign'} ] }
    ]
  },
  {
    id:"decollage", titre:"Décollage", station:"{ADRM} {STN}", defaultTerrain:'dep', controllable:true,
    /* Une fois sur trois, la tour prend l'initiative : « êtes-vous prêt pour un
       départ immédiat ? » (p. 60). Tiré au LANCEMENT, par buildQueue. Le tour de
       piste, lui, réemploie toujours `tours` (le départ ordinaire). */
    buildTours: function(){
      return (ctrlOf(state.activeSide) && Math.random() < 1/3) ? departImmediat() : this.tours;
    },
    tours:[
      { role:'pilote', stn:'tour', situation:"Vous êtes au point d'attente de la piste {PISTE}, prêt à partir.",
        consigne:"Annoncez-vous prêt au départ.",
        /* « Prêt au départ » N'EST PAS MOT POUR MOT DANS LE MANUEL — c'est une
           déduction, assumée et validée par le développeur (03/10/2026), qui la
           dit en vol. Le manuel ne donne que la demande du contrôleur (« rappelez
           prêt », p. 45 ; « Rappelez prêt au départ », p. 50) et jamais la réponse
           du pilote au point d'attente. Mais à chaque « rappelez prêt à … », il
           fait répondre « Prêt à …, indicatif » : « Prêt à copier, Rapidair 3245 »
           (p. 83), « Transpondeur 7047, prêt à évoluer, F-BX » (p. 222), « Prêt à
           reprendre RVSM » (p. 77). Et « prêt au départ » est bien dans la bouche
           d'un pilote p. 42 (« CDG Prévol, Rapidair 3245, en X 2, prêt au départ,
           information L »), avec l'organisme devant quand c'est un premier contact.
           Retiré le même jour : « point d'attente piste {PISTE} », qu'aucune page
           ne place dans cette annonce. Les variantes acceptées (« prêt à décoller »,
           « je suis prêt », « prêt » seul…) l'ont été aussi : accepter une
           formulation, c'est l'enseigner (CLAUDE.md § 2). */
        attendu:"{ADRM} {STN}, {CALL}, prêt au départ.",
        /* AFIS : là, le point d'attente est bien dans l'annonce (manuel AFIS p. 33). */
        afis:{ attendu:"{ADRM} {STN}, {CALL}, point d'attente piste {PISTE}, prêt au départ." }, // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.33
        motsCles:[ {label:"Nom du terrain",ref:'terrain'}, {label:"Station appelée",ref:'station'},
                   {label:"Votre indicatif",ref:'callsign'}, {label:"Prêt au départ",variantes:["pret au depart"]} ] },
      /* AFIS (03/10/2026), manuel AFIS p. 33 : l'agent signale un trafic en finale et
         demande les intentions ; on attend, on s'annonce aligné, on décolle. Aucune
         clairance : « nous alignons », « décollons », à la première personne du
         pluriel, comme dans le manuel. La 2e ligne est celle de l'édition 2019 :
         l'édition 2022 y recopie par erreur la phrase de l'agent (« F B X, DR 400 en
         finale, vos intentions » dans la bouche du pilote) — sa colonne anglaise,
         elle, dit bien « Roger, DR 400 in sight, holding short of runway 24 ». */
      { stn:'tour', station:"{ADRM} {STN}", afisSeul:true,
        atc:"{CALL}, {TRAFICTYPE} en finale, vos intentions.",                            // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.33
        consigne:"Répondez : le trafic en vue, et vous maintenez avant la piste.",
        attendu:"Roger, {TRAFICTYPE} en vue, maintenons avant piste {PISTE}, {CALL}.",      // Manuel AFIS (UAF & FA / DGAC, éd. 2022) éd. 2019 p.33
        motsCles:[ {label:"Trafic en vue",variantes:["en vue"]}, {label:"Maintenons avant piste",variantes:["maintenons avant piste","maintenons avant","maintenons"]},
                   {label:"Numéro de piste",ref:'piste'}, {label:"Votre indicatif",ref:'callsign'} ] },
      { role:'pilote', stn:'tour', afisSeul:true,
        situation:"Le trafic a atterri et dégagé la piste.",
        consigne:"Annoncez que vous vous alignez.",
        attendu:"{ADRM} {STN}, {CALL}, nous alignons piste {PISTE}.",                       // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.33
        motsCles:[ {label:"Nous alignons",variantes:["nous alignons","alignons"]},
                   {label:"Numéro de piste",ref:'piste'}, {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'tour', station:"{ADRM} {STN}", afisSeul:true,
        atc:"{CALL}, rappelez aligné prêt piste {PISTE}.",                                  // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.33
        consigne:"Aligné et prêt : annoncez que vous décollez.",
        attendu:"Décollons piste {PISTE}, {CALL}.",                                         // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.33
        motsCles:[ {label:"Décollons",variantes:["decollons"]},
                   {label:"Numéro de piste",ref:'piste'}, {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'tour', station:"{ADRM} {STN}", afisSeul:true, quitteFrequence:true,
        atc:"{CALL}, vent {VENT}, rappelez quittant la fréquence.",                          // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.33
        consigne:"Plus tard, en quittant le circuit : annoncez la sortie de circuit et que vous quittez la fréquence.",
        attendu:"{ADRM} {STN}, {CALL}, sortie de circuit, quittons la fréquence.",           // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.33
        motsCles:[ {label:"Sortie de circuit",variantes:["sortie de circuit"]}, {label:"Quittons la fréquence",variantes:["quittons la frequence","quittons"]},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'tour', station:"{ADRM} {STN}", twrSeul:true, atc:"{CALL}, alignez-vous et attendez piste {PISTE}.", // Manuel DSNA p.53
        consigne:"Collationnez l'instruction d'alignement.",
        attendu:"Je m'aligne et j'attends piste {PISTE}, {CALL}.",                     // Manuel DSNA p.53
        motsCles:[ {label:"Je m'aligne et j'attends",variantes:["je m aligne et j attends","je m aligne et attends","je m aligne","m aligne","aligne et attends","alignons et attendons","alignons"]},
                   {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'tour', station:"{ADRM} {STN}", twrSeul:true,                             // Manuel DSNA p.59
        atc:["{CALL}, piste {PISTE}, autorisé décollage, vent {VENT}.",
             "{CALL}, alignez-vous piste {PISTE}, autorisé décollage, vent {VENT}."],
        consigne:"Collationnez l'autorisation de décollage (le pilote annonce « je décolle »).",
        attendu:"Piste {PISTE}, je décolle, {CALL}.",                                 // Manuel DSNA p.59 « Piste 27, je décolle »
        motsCles:[ {label:"Je décolle",variantes:["je decolle","decolle","decollons","je m aligne et je decolle","aligne et je decolle"]},
                   {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'tour', station:"{ADRM} {STN}", twrSeul:true, suiteDepart:true,           // Manuel DSNA p.63 ; cap de départ tiré au sort.
        atc:"{CALL}, passant 1000 pieds dans l'axe de piste, tournez à droite cap {CAPDEP}.",
        consigne:"Collationnez les instructions de départ.",
        attendu:"Passant 1000 pieds dans l'axe de piste, je tourne à droite cap {CAPDEP}, {CALL}.", // p.63 « …dans l'axe de piste, je tourne à droite... »
        motsCles:[ {label:"Dans l'axe de piste",variantes:["axe de piste","dans l axe","cap de la piste","axe"]},
                   {label:"Tourne à droite",variantes:["tourne a droite","je tourne a droite","a droite","tournons a droite","droite"]},
                   {label:"Cap",variantes:["cap","au cap"]}, {label:"Valeur de cap",ref:'capdep'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'tour', station:"{ADRM} {STN}", twrSeul:true, suiteDepart:true, quitteFrequence:true, // Manuel DSNA p.153 « Rappelez quittant la fréquence »
        atc:"{CALL}, rappelez quittant la fréquence.",
        consigne:"Annoncez votre sortie de circuit et que vous quittez la fréquence, puis votre indicatif.",
        attendu:"Sortie de circuit, je quitte la fréquence, {CALL}.",                    // Manuel DSNA p.153 (« je quitte la fréquence » seul n'y est pas)
        motsCles:[ {label:"Quitte la fréquence",variantes:["je quitte la frequence","quitte la frequence","quitte","sortie de circuit","je quitte"]},
                   {label:"Votre indicatif",ref:'callsign'} ] }
    ]
  },
  {
    id:"integration", titre:"Intégration + atterrissage", station:"{ADRM} {STN}", defaultTerrain:'arr', controllable:true, alea:true,
    tours:[
      /* L'ARRIVÉE VFR DE LA P. 149 (Blagnac, PA28), mot pour mot (03/10/2026) :
           « Blagnac Tour, bonjour, F-BX. » / « F-BX, bonjour, j'écoute. »
           « F-BGBX, PA28, VFR d'Albi à Blagnac pour un toucher (atterrissage/remise
             de gaz), 1500 pieds, estimé E à 05, information I. »
         Retirés : « 5 milles au sud », position qu'aucune page ne donne. Le manuel
         passe par un POINT D'ENTRÉE et son heure estimée (« estimé E à 05 » puis
         « roger, rappelez E ») ; nos données n'ont pas les points des cartes VAC,
         donc ni point ni estimée plutôt qu'un point inventé.
         Sans ATIS, le contrôleur donne d'abord piste, vent et QNH, DANS CET ORDRE,
         puis l'entrée dans le circuit (p. 148). */
      { role:'pilote', stn:'tour', situation:"De retour vers le terrain, vous approchez pour l'atterrissage.",
        consigne:"Premier contact : organisme, bonjour, votre indicatif.",
        attendu:"{ADRM} {STN}, bonjour, {CALL}.",                                       // Manuel DSNA p.149 « Blagnac Tour, bonjour, F-BX »
        motsCles:[ {label:"Nom du terrain",ref:'terrain'}, {label:"Station appelée",ref:'station'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'tour', station:"{ADRM} {STN}",
        atc:"{CALL}, bonjour, j'écoute.",                                               // Manuel DSNA p.149
        consigne:"Annonce complète : indicatif, type d'avion, VFR de {PROV} à {ADRM} pour un atterrissage, votre altitude{ATISCONS}.",
        attendu:"{CALL}, {TYPE}, VFR de {PROV} à {ADRM} pour un atterrissage, {ALT} pieds{ATISPART}.", // Manuel DSNA p.149
        atisMot:true,
        /* AFIS : l'arrivée VFR de Bourges (manuel AFIS p. 40) — « F-BGBX, PA28, VFR
           avec plan de vol, de Limoges à Bourges estimé à 12 ». Sans plan de vol ni
           estimée dans le simulateur : « VFR, de … à … ». */
        afis:{ atc:"{CALL}, bonjour, {ADRM} {STN}, j'écoute.",                          // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.40
               consigne:"Annonce : indicatif, type d'avion, VFR, de {PROV} à {ADRM}.",
               attendu:"{CALL}, {TYPE}, VFR, de {PROV} à {ADRM}.",                       // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.40
               atisMot:false,
               motsCles:[ {label:"Votre indicatif",ref:'callsign'}, {label:"Type d'avion",ref:'type'},
                          {label:"VFR",variantes:["vfr","v f r"]}, {label:"Provenance",ref:'prov'},
                          {label:"Terrain d'arrivée",ref:'terrain'} ] },
        motsCles:[ {label:"Votre indicatif",ref:'callsign'}, {label:"Type d'avion",ref:'type'},
                   {label:"VFR",variantes:["vfr","v f r"]},
                   {label:"Provenance",ref:'prov'},
                   {label:"Pour un atterrissage",variantes:["pour un atterrissage","pour atterrissage"]},
                   {label:"Altitude",ref:'alt'} ] },
      { stn:'tour', station:"{ADRM} {STN}",
        /* Avec ATIS : l'instruction seule (p. 149). Sans ATIS : piste, vent, QNH
           d'abord (p. 148), collationnés comme à la p. 38 (« Piste 36 droite,
           QNH 1020, Rapidair 3245 »). Choisi par atisSeul / sansAtis. */
        atc:"{CALL}, entrez vent arrière piste {PISTE}, rappelez vent arrière.",          // Manuel DSNA p.149
        consigne:"Collationnez l'instruction d'intégration, puis votre indicatif.",
        attendu:"Je rappelle vent arrière piste {PISTE}, {CALL}.",                       // Manuel DSNA p.149
        sansAtis:{ atc:"{CALL}, piste {PISTE}, vent {VENT}, QNH {QNH}, entrez vent arrière piste {PISTE}, rappelez vent arrière.", // p.148 + p.149
                   consigne:"Collationnez la piste, le QNH, puis l'instruction d'intégration et votre indicatif.",
                   attendu:"Piste {PISTE}, QNH {QNH}, je rappelle vent arrière piste {PISTE}, {CALL}.",
                   motsCles:[ {label:"Numéro de piste",ref:'piste'}, {label:"QNH",variantes:["qnh"]}, {label:"Valeur QNH",ref:'qnh'},
                              {label:"Je rappelle vent arrière",variantes:["je rappelle vent arriere","rappelle vent arriere"]},
                              {label:"Votre indicatif",ref:'callsign'} ] },
        // AFIS : aucune clairance d'intégration ; l'agent informe et demande de rappeler (p. 40).
        afis:{ atc:["{CALL}, piste {PISTE} en service, vent {VENT}, QNH {QNH}, rappelez en vue de l'aérodrome."], // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.40
               consigne:"Collationnez le QNH et dites que vous rappellerez en vue de l'aérodrome.",
               attendu:"QNH {QNH}, rappellerons en vue de l'aérodrome, {CALL}.",           // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.40
               sansAtis:null,
               motsCles:[ {label:"QNH",variantes:["qnh"]}, {label:"Valeur QNH",ref:'qnh'},
                          {label:"Rappellerons en vue de l'aérodrome",variantes:["rappellerons en vue","en vue de l aerodrome","rappellerons"]},
                          {label:"Votre indicatif",ref:'callsign'} ] },
        motsCles:[ {label:"Je rappelle vent arrière",variantes:["je rappelle vent arriere","rappelle vent arriere"]},
                   {label:"Numéro de piste",ref:'piste'},
                   {label:"Votre indicatif",ref:'callsign'} ] },
      { role:'pilote', stn:'tour', afisSeul:true,
        situation:"Vous avez le terrain en vue.",
        consigne:"Annoncez que vous êtes en vue de l'aérodrome.",
        attendu:"{ADRM} {STN}, {CALL}, en vue de l'aérodrome.",                              // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.40
        motsCles:[ {label:"En vue de l'aérodrome",variantes:["en vue de l aerodrome","en vue"]}, {label:"Votre indicatif",ref:'callsign'} ] },
      { stn:'tour', station:"{ADRM} {STN}", afisSeul:true,
        atc:"{CALL}, rappelez vent arrière piste {PISTE}.",                                  // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.40
        consigne:"Dites que vous rappellerez en vent arrière.",
        attendu:"Rappellerons vent arrière piste {PISTE}, {CALL}.",                          // Manuel AFIS (UAF & FA / DGAC, éd. 2022) p.40
        motsCles:[ {label:"Rappellerons vent arrière",variantes:["rappellerons vent arriere","rappellerons"]},
                   {label:"Numéro de piste",ref:'piste'}, {label:"Votre indicatif",ref:'callsign'} ] },
      ...toursCircuit()          // finale : complet, toucher, remise de gaz, passage bas
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
                // « maintenez l'écoute » retiré le 01/10/2026 : absent de la p. 238.
                atc:"{CALL}, Pan Pan Roger.",
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
                  {text:"Par l'ATIS",correct:false},
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
                  {text:"« Roger »",correct:false},
                  {text:"« Standby »",correct:false},
                  {text:"« Ignorez »",correct:false} ] },
      { type:'quiz', question:"« VEILLEZ 121 décimale 5 » vous demande de :",
        options:[ {text:"Écouter cette fréquence",correct:true},
                  {text:"Appeler immédiatement sur cette fréquence",correct:false},
                  {text:"Collationner cette fréquence et attendre",correct:false} ] },
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
      // QFU = orientation MAGNÉTIQUE de la piste en service, en degrés (code Q,
      // OACI Doc 8400 : « magnetic bearing of the runway in use »). Le numéro de
      // piste en est le dixième arrondi : QFU 268° → piste 27. La réponse
      // précédente, « la piste en service », confondait le SENS du sigle avec sa
      // façon de le DIRE : le manuel DSNA p. 12 est une table d'énonciation, qui
      // autorise à prononcer QFU « piste en service » — pas une définition.
      { type:'quiz', question:"Que signifie QFU ?",
        options:[ {text:"L'orientation magnétique de la piste en service",correct:true},
                  {text:"La pression au niveau de la mer",correct:false},
                  {text:"La visibilité horizontale",correct:false} ] },
      { type:'quiz', question:"En français, quand est-il utile de transmettre un nombre chiffre par chiffre ?",
        options:[ {text:"Quand la réception est mauvaise",correct:true},
                  {text:"Toujours, c'est obligatoire",correct:false},
                  {text:"Seulement pour les altitudes",correct:false} ] },
      { type:'quiz', question:"Votre indicatif est F-BGBX. À quel moment pouvez-vous l'abréger en F-BX ?",
        options:[ {text:"Seulement après que le contrôleur l'a abrégé lui-même",correct:true},
                  {text:"Dès le premier contact, pour gagner du temps",correct:false},
                  {text:"Jamais : l'indicatif est toujours complet",correct:false},
                  {text:"Quand la fréquence est peu chargée",correct:false} ] },
      { type:'quiz', question:"La forme abrégée d'un indicatif français reprend :",
        options:[ {text:"Le premier caractère et au moins les deux derniers",correct:true},
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
