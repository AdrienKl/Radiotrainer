/* =============================================================================
   AVIERO — LE MOTEUR DE SCÉNARIOS
   -----------------------------------------------------------------------------
   Ce qui fait tourner la page Exercices, de bout en bout : l'état d'une session,
   la résolution des gabarits de phraséologie, la météo et l'ATIS, la carte du
   DOM, l'enchaînement des échanges, la radio et le transpondeur, les
   explications d'erreur, le récapitulatif, l'historique et les badges.

   ┌─ LA BALISE NE SE DÉPLACE PAS ──────────────────────────────────────────┐
   │ Ce fichier travaille DÈS SON CHARGEMENT : il construit `el` par         │
   │ document.getElementById, pose une vingtaine d'écouteurs sur des         │
   │ éléments de la page, trie AERODROMES, puis son INIT lit `el.call.value` │
   │ et peint l'historique.                                                  │
   │                                                                          │
   │ Son <script src> doit donc rester APRÈS toutes les <section> de          │
   │ index.html, et SANS defer ni async. Le remonter dans le <head>, ou lui   │
   │ ajouter defer, donnerait un `el` rempli de null — et une page qui se     │
   │ peint normalement pendant qu'aucun bouton ne répond.                     │
   └──────────────────────────────────────────────────────────────────────────┘

   IL RESTE LE PLUS GROS FICHIER DU PROJET, et c'est assumé : l'étape 2.3
   avait pour objet de vider index.html, pas de réduire le moteur. Le découper
   demande des frontières de domaine (état / DOM / moteur / récap) et mérite
   son propre travail.

   CE QU'IL EXPOSE encore dans la portée globale : 145 symboles, dont 21 sont
   réellement empruntés — par la Navigation (12), le catalogue de phraséologie,
   le noyau, les Paramètres. Ils sont suivis par tests/contrat/symboles.test.mjs.

   Extrait d'index.html le 19/09/2026 (étape 2.3). Le bloc est déplacé tel
   quel, « use strict » compris : pas une ligne n'a été modifiée.
   ========================================================================== */
"use strict";

/* Comparateur de base, celui de la liste au repos : les connus d'abord dans
   LEUR ordre, le reste derrière par code OACI. */
function adComparer(a, b){
  var ra = AD_RANG[a.icao], rb = AD_RANG[b.icao];
  if(ra !== undefined && rb !== undefined) return ra - rb;
  if(ra !== undefined) return -1;
  if(rb !== undefined) return 1;
  return a.icao < b.icao ? -1 : (a.icao > b.icao ? 1 : 0);
}

/* QUALITÉ DE LA CORRESPONDANCE — ce qui prime sur tout le reste dès qu'on tape.
   La recherche cherche la saisie n'importe où dans le code ET dans le nom, et
   ça donne des surprises : « LFOR » se trouve aussi dans « Be-LFOR-t Chaux ».
   Chartres arrivait donc derrière Belfort alors qu'on avait tapé son code
   exact. On classe maintenant par ce qu'on a manifestement voulu dire :
     0  le code, exactement ;
     1  un code qui commence par la saisie ;
     2  un nom qui commence par la saisie ;
     3  le reste, où la saisie se trouve au milieu de quelque chose.
   À qualité égale seulement, les grands terrains passent devant. */
function adQualite(a, nq){
  var ic = normalize(a.icao), nm = normalize(a.nom);
  if(ic === nq) return 0;
  if(ic.indexOf(nq) === 0) return 1;
  if(nm.indexOf(nq) === 0) return 2;
  return 3;
}
function adTriPour(nq){
  if(!nq) return adComparer;
  return function(a, b){
    var qa = adQualite(a, nq), qb = adQualite(b, nq);
    return qa !== qb ? qa - qb : adComparer(a, b);
  };
}

/* Étape 4 — tri « du plus gros au plus petit » : ordre d'importance (trafic passagers approximatif)
   des principaux aéroports français. Les terrains hors de cette liste reçoivent un rang 0 et restent
   classés ensuite par ordre alphabétique OACI — ordre stable pour la longue traîne des petits terrains,
   qu'il ne serait ni faisable ni utile de hiérarchiser un à un. Ce tri s'applique une seule fois au
   chargement et vaut donc aussi pour l'autocomplétion du plan de vol (les gros aéroports remontent en
   premier quand on tape) et pour la sélection de terrain des scénarios. */
const RANK_ORDER = ["LFPG","LFPO","LFMN","LFLL","LFML","LFBO","LFSB","LFBD","LFRS","LFOB",
  "LFQQ","LFMT","LFKJ","LFKB","LFST","LFRB","LFBZ","LFMP","LFBP","LFTH","LFKF","LFRN","LFLC",
  "LFKC","LFBT","LFMK","LFLS","LFLB","LFBL","LFBH","LFTW","LFPB","LFRD","LFJL","LFRK","LFCR",
  "LFRG","LFBE","LFBI","LFOH","LFMV","LFGJ","LFLP"];
const AIRPORT_RANK = {}; RANK_ORDER.forEach((ic,i)=>{ AIRPORT_RANK[ic] = RANK_ORDER.length - i; });
AERODROMES.sort((a,b)=>{
  const ra = AIRPORT_RANK[a.icao]||0, rb = AIRPORT_RANK[b.icao]||0;
  return rb!==ra ? rb-ra : a.icao.localeCompare(b.icao);   // plus gros d'abord, sinon alphabétique
});

/* Classification contrôlé (CTR/TWR) vs non contrôlé (AFIS / auto-information), APPROXIMATIVE
   — à affiner avec un instructeur. Sert à filtrer les propositions d'aérodromes : quand un côté
   (départ/arrivée) est réglé sur AFIS, seuls les terrains non contrôlés sont proposés ; sur Contrôlé,
   seuls les terrains contrôlés. Liste des terrains contrôlés (gros aéroports + bases/terrains à
   tour de contrôle) ; tout le reste est considéré non contrôlé. */
/* Terrains CONTRÔLÉS = ceux dont une fréquence TWR est publiée (OurAirports).
   Les autres sont AFIS (agent d'information) ou en auto-information. */
const CONTROLLED_ICAO = new Set([
  "LFAC","LFAQ","LFAT","LFBA","LFBC","LFBD","LFBE","LFBF","LFBG","LFBH","LFBI","LFBL","LFBM","LFBO",
  "LFBP","LFBR","LFBT","LFBZ","LFCL","LFCR","LFCV","LFDN","LFGA","LFGB","LFGJ","LFJL","LFKB","LFKC",
  "LFKF","LFKJ","LFKS","LFLB","LFLC","LFLG","LFLL","LFLN","LFLP","LFLS","LFLU","LFLX","LFLY","LFMA",
  "LFMC","LFMD","LFMH","LFMI","LFMK","LFML","LFMN","LFMO","LFMP","LFMT","LFMU","LFMV","LFMY","LFOA",
  "LFOB","LFOC","LFOE","LFOH","LFOJ","LFOK","LFOP","LFOT","LFOX","LFPB","LFPC","LFPE","LFPG","LFPL",
  "LFPM","LFPN","LFPO","LFPT","LFPV","LFPZ","LFQE","LFQP","LFQQ","LFQT","LFRB","LFRC","LFRD","LFRG",
  "LFRH","LFRJ","LFRK","LFRL","LFRM","LFRN","LFRO","LFRQ","LFRS","LFRV","LFRZ","LFSB","LFSD","LFSI",
  "LFSL","LFSO","LFSP","LFST","LFSX","LFTF","LFTH","LFTW","LFXA","LFYG"
]);
AERODROMES.forEach(a=>{ a.ctrl = CONTROLLED_ICAO.has(a.icao); });

/* Variantes de reconnaissance pour un nombre (brut + chiffre-par-chiffre + cardinal) */
/* Un code SSR ne s'écrit qu'avec des chiffres 0 à 7 (quatre digits octaux).
   On écarte les codes réservés : 7000 (veille VFR), 7500/7600/7700 (urgences),
   2000 (entrée sans code assigné). */
const CODES_SSR_RESERVES={'7000':1,'7500':1,'7600':1,'7700':1,'2000':1};
function codeSSR(){
  let c;
  do{ c=''; for(let i=0;i<4;i++) c+=Math.floor(Math.random()*8); }
  while(CODES_SSR_RESERVES[c] || c[0]==='0');
  return c;
}
function numVariants(str){
  const s=String(str);
  const n=parseInt(s,10);
  const out=new Set();
  out.add(normalize(s));
  if(!isNaN(n)) out.add(normalize(String(n)));
  out.add(normalize(s.split('').map(d=>DIGIT_WORDS[d]||d).join(' ')));
  out.add(normalize(s.split('').join(' ')));
  if(!isNaN(n)) out.add(normalize(frenchCardinal(n)));
  return [...out].filter(Boolean);
}

/* Canonisation des nombres : convertit les mots-chiffres en chiffres et recolle les
   suites, pour comparer une valeur même si la transcription MÉLANGE mots et chiffres
   (ex : "unité 0 unité 5" ou "un zéro un cinq" → "1015"). Le texte est déjà normalisé. */
const WORD2DIGIT = { zero:'0', un:'1', une:'1', unite:'1', deux:'2', trois:'3', quatre:'4',
                     cinq:'5', six:'6', sept:'7', huit:'8', neuf:'9' };
function digitCanon(normText){
  let d = (normText||"").split(' ')
    .map(w => (WORD2DIGIT[w]!==undefined ? WORD2DIGIT[w] : w)).join(' ');
  /* « deux » ressort très souvent « de » de la reconnaissance : « unité deux quatre »
     devient « unité de 4 ». On ne le traite comme un chiffre que COINCÉ ENTRE deux
     chiffres — isolé, « de » reste la préposition et ne doit pas être touché. */
  d = d.replace(/(\d)\s+de\s+(?=\d)/g, '$1 2 ');
  // recolle les chiffres séparés par des espaces : "1 0 1 5" → "1015"
  return d.replace(/\d(?:\s+\d)+/g, m => m.replace(/\s+/g,''));
}
/* Forme abrégée de l'indicatif (manuel DSNA p. 18) : 1er caractère + 2 derniers.
   F-BGBX → F-BX, F-ABCD → F-CD. Elle ne s'emploie qu'APRÈS un premier contact
   complet, et à l'initiative du contrôleur. */
function abrevCall(call){
  const c=(call||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(c.length<3) return call||'';
  return c[0]+'-'+c.slice(-2);
}
/* Indicatif à employer à cet instant : complet au premier contact sur une fréquence,
   abrégé ensuite. state.callForm est posé par le rendu de chaque échange. */
function callNow(){
  return (typeof state!=='undefined' && state.callForm==='abbr') ? abrevCall(state.call) : state.call;
}

function callsignVariants(call){
  const compact=(call||"").toUpperCase().replace(/[^A-Z0-9]/g,'');
  const letters=compact.split('');
  const toPhon=arr=>canonPhrase(arr.map(l=>NATO[l]||l).join(' '));
  // Forme abrégée : 1er + 2 derniers caractères.
  const abr=[letters[0]].concat(letters.slice(-2));
  return [toPhon(letters), toPhon(letters.slice(1)), toPhon(letters.slice(-3)),
          toPhon(letters.slice(-2)), toPhon(abr),
          normalize(compact), normalize(abr.join('')),
          normalize(call),                 // forme écrite "f abcd"
          normalize(letters.join(' ')),    // lettres épelées "f a b c d"
          normalize(abr.join(' '))
         ].filter(v=>v.length>0);
}
function terrainVariants(ad){
  if(!ad) return [];
  const nom=normalize(ad.nom);
  const stop=new Set(['le','la','les','l','de','du','des','d','saint','sainte','st','sur','en','aux']);
  const toks=nom.split(' ').filter(w=>w.length>=4 && !stop.has(w));
  const main=toks[0] || nom.split(' ')[0];
  return [nom, normalize(ad.icao), main].filter(Boolean);
}


// --- Aléas en cours de scénario (C3, activables) ---
function aleaWind(){ return {
  onEnter(){ const nd=Math.floor(Math.random()*36)*10; state.meteo.windDir=nd;
             state.ventPhrase=nd+" degrés, "+state.meteo.windForce+" nœuds";
             state.rwy=runwayInService(state.activeAd, nd); },
  stn:'tour', station:"{ADRM} {STN}",
  atc:"{CALL}, le vent a tourné, piste en service désormais {PISTE}.",
  consigne:"Accusez réception de la nouvelle piste en service.",
  attendu:"Piste {PISTE} en service, {CALL}.",
  motsCles:[ {label:"Piste en service",variantes:["piste","en service","nouvelle piste"]},
             {label:"Numéro de piste",ref:'piste'}, {label:"Votre indicatif",ref:'callsign'} ]
};}
function aleaHold(){ return {
  // réf §3.5 "maintenez position, trafic en approche finale", adapté au circuit.
  // À VÉRIFIER avec le manuel DGAC / mon instructeur : formulation exacte de l'attente en vent arrière.
  stn:'tour', station:"{ADRM} {STN}",
  atc:"{CALL}, maintenez la vent arrière, trafic en approche.",
  consigne:"Collationnez l'instruction d'attente.",
  attendu:"Maintenons vent arrière, {CALL}.",
  motsCles:[ {label:"Maintien / attente",variantes:["maintenons","maintien","maintiens","on maintient","attente","je maintiens"]},
             {label:"Vent arrière",variantes:["vent arriere"]}, {label:"Votre indicatif",ref:'callsign'} ]
};}
function aleaGoAround(){ return {
  // réf §3.9 "remise de gaz, je vous rappelle".
  stn:'tour', station:"{ADRM} {STN}",
  atc:"{CALL}, remise de gaz, trafic sur la piste, je vous rappelle.",
  consigne:"Collationnez la remise de gaz.",
  attendu:"Remise de gaz, {CALL}.",
  motsCles:[ {label:"Remise de gaz",variantes:["remise de gaz","remise des gaz","go around","remise","remettons les gaz"]},
             {label:"Votre indicatif",ref:'callsign'} ]
};}

/* --- Aléas de mode Réel (aléas généraux, tirés au sort en cours de scénario) --- */
// Changement de cap demandé par le contrôleur (collationnement).
function aleaCap(){ const cap=Math.floor(Math.random()*36)*10; const c3=String(cap).padStart(3,'0');
  return { stn:'tour', station:"{ADRM} {STN}",
    atc:"{CALL}, pour espacement, tournez à droite cap "+c3+".",
    consigne:"Collationnez le nouveau cap.",
    attendu:"À droite cap "+c3+", {CALL}.",
    motsCles:[ {label:"À droite",variantes:["a droite","par la droite","droite"]},
               {label:"Cap",variantes:["cap","au cap"]}, {label:"Valeur de cap",variantes:numVariants(c3)},
               {label:"Votre indicatif",ref:'callsign'} ] };
}
// Information de trafic (accusé de réception).
/* Petit utilitaire conservé après le retrait du radar : il reste utilisé par les aléas. */
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function aleaTrafic(){ const pos=pick(["à midi","à trois heures","à neuf heures","convergent"]); const d=randInt(3,10);
  return { stn:'tour', station:"{ADRM} {STN}",
    atc:"{CALL}, trafic "+pos+", "+d+" nautiques, même altitude.",
    consigne:"Accusez réception de l'information de trafic.",
    attendu:"Trafic en vue, {CALL}.",
    motsCles:[ {label:"Accusé de réception",variantes:["trafic en vue","en vue","recu","bien recu","roger","je cherche","pas en vue","negatif"]},
               {label:"Votre indicatif",ref:'callsign'} ] };
}
// Panne radio (le pilote affiche 7600 et poursuit en aveugle).
function aleaRadio(){ return { role:'pilote', stn:'tour',
  situation:"Aléa — panne radio simulée : vous n'êtes plus en phonie normale.",
  consigne:"Annoncez la panne, l'affichage 7600 et la poursuite en aveugle.",
  attendu:"Panne radio, transpondeur 7600, je poursuis en aveugle, {CALL}.",
  motsCles:[ {label:"Panne radio / en aveugle",variantes:["panne radio","en aveugle","sans radio","transmission aveugle","aveugle"]},
             {label:"Transpondeur 7600",variantes:["7600","transpondeur 7600","sept six zero zero","squawk 7600","affiche 7600"]},
             {label:"Votre indicatif",ref:'callsign'} ] };
}
// Urgences (panne moteur / fumée / malaise) → déclaration MAYDAY ou PAN PAN + accusé ATC.
function aleaUrgence(kind){
  const M={ moteur:{g:'MAYDAY', cause:'panne moteur'}, fumee:{g:'MAYDAY', cause:'fumée en cabine'},
            malaise:{g:'PAN PAN', cause:'passager malade'} };
  const e=M[kind]||M.moteur, g=e.g, gl=normalize(g);
  const call = { role:'pilote', stn:'tour',
    situation:"Aléa — "+e.cause+". Transmettez votre message.",
    consigne:g+" ×3, indicatif, nature du problème, intentions.",
    attendu:(g==='MAYDAY'?g+' '+g+' '+g:g+' '+g+' '+g+' '+g+' '+g+' '+g)+", {ADRM} {STN}, {CALL}, "+e.cause+", je me pose.",
    motsCles:[ {label:"Appel ("+g+" ×3)",variantes:[gl+' '+gl+' '+gl, gl]},
               {label:"Votre indicatif",ref:'callsign'},
               {label:"Nature du problème",variantes:e.cause.split(' ').filter(w=>w.length>3)},
               {label:"Intention",variantes:["pose","je me pose","poser","atterr","retour","deroute","descend","descente","assistance","priorite"]} ] };
  const ack = { stn:'tour', station:"{ADRM} {STN}",
    xpdrAssign: g==='MAYDAY' ? '7700' : null,
    atc: g==='MAYDAY' ? "{CALL}, "+g+" reçu, transpondeur 7700, terrain dégagé, vous êtes prioritaire."
                      : "{CALL}, "+g+" reçu, maintenez l'écoute.",
    consigne: g==='MAYDAY' ? "Collationnez le transpondeur." : "Accusez réception (Roger).",
    attendu: g==='MAYDAY' ? "Transpondeur 7700, {CALL}." : "Roger, {CALL}.",
    motsCles: g==='MAYDAY'
      ? [ {label:"Transpondeur 7700",variantes:["7700","transpondeur 7700","sept sept zero zero","squawk 7700","affiche 7700"]},
          {label:"Votre indicatif",ref:'callsign'} ]
      : [ {label:"Accusé de réception",variantes:["roger","recu","bien recu","wilco"]},
          {label:"Votre indicatif",ref:'callsign'} ] };
  return [call, ack];
}

// Causes d'urgence tirées au sort. Elles ne remplissent que {CAUSE}, un texte
// libre affiché dans l'énoncé et jamais noté : la note porte sur la STRUCTURE du
// message (MAYDAY ×3, organisme, indicatif, intentions, position, altitude), pas
// sur la reprise mot pour mot de la panne. Allonger la liste ne change donc rien
// au barème et beaucoup à la lassitude.
const CAUSES = ["panne moteur", "fumée en cabine", "passager malade",
                "perte d'huile", "vibrations moteur importantes", "panne électrique totale",
                "porte mal verrouillée", "train non verrouillé", "verrière ouverte en vol",
                "réserve de carburant entamée", "pilote indisposé", "givrage carburateur",
                "surchauffe moteur", "instruments de bord en panne", "odeur de brûlé en cabine",
                "impact d'oiseau", "hélice en survitesse", "commande de profondeur dure"];

/* ===========================================================================
   BIBLIOTHÈQUE D'IMPRÉVUS — Scénarios
   ---------------------------------------------------------------------------
   Ce qui suit remplace la liste de neuf mots-clés qu'un enchaînement de `if`
   traduisait en étapes. Le défaut n'était pas le nombre : c'est qu'ajouter un
   imprévu demandait de toucher trois endroits — le vivier, la chaîne de `if`,
   et la table des libellés affichés dans le journal. On en oubliait un.

   Ici, une entrée se suffit à elle-même : son identifiant, l'endroit où elle a
   un sens, son libellé, sa page du manuel, et de quoi bâtir ses étapes.

   `ou` — où l'imprévu a un sens, et c'est une question de vraisemblance, pas de
   confort. On ne fait pas remonter une piste à quelqu'un qui est en croisière,
   ni signaler un SIGMET à quelqu'un qui roule au parking.
     'partout' · sol comme vol, n'importe quel scénario
     'vol'     · en l'air (décollage, intégration, tour de piste, navigation)
     'piste'   · dans le circuit ou aux abords (sc.isCircuit ou sc.alea)
     'sol'     · au roulage

   LES PAGES SONT CELLES DU MANUEL DSNA, et rien n'est formulé sans elles — même
   règle que pour les scénarios eux-mêmes. Plusieurs messages se retrouvent, avec
   la même page, dans ALEAS_VOL (module Navigation) : les deux blocs <script> ne
   partagent pas de portée, et la duplication est assumée comme celle de SIV_SCEN.
   Elles doivent rester d'accord, et c'est le manuel qui les départage.
   ======================================================================== */
function accuseRecu(){
  return [ {label:"Accusé de réception",variantes:["roger","recu","bien recu","copie","wilco"]},
           {label:"Votre indicatif",ref:'callsign'} ];
}
/* Fabrique l'entrée la plus courante : le contrôleur dit quelque chose, le pilote
   répond une fois. Les imprévus qui demandent davantage (les urgences, la remise
   de gaz qui relance un tour complet) gardent leur propre fonction. */
function unAlea(id, ou, label, src, atc, consigne, attendu, mots, stn){
  return { id:id, ou:ou, label:label, src:src, etapes:function(){
    return [{ stn:stn||'tour', station:"{ADRM} {STN}", atc:atc,
              consigne:consigne, attendu:attendu, motsCles:mots||accuseRecu() }];
  } };
}
var ALEA_BALISES=['CAN','BSN','PTV','LSE','DJL'], ALEA_ZONES=['R 45','R 138','R 162','R 205','R 46'];
function unDe(t){ return t[Math.floor(Math.random()*t.length)]; }

const ALEAS_SCEN = [
  /* ---- Partout : au sol comme en vol ---------------------------------- */
  { id:'trafic', ou:'partout', label:"information de trafic", src:'p. 211',
    etapes:function(){ return [aleaTrafic()]; } },
  unAlea('standby','partout',"standby",'p. 19-21',
    "{CALL}, standby.",
    "Accusez réception et attendez l'appel du contrôleur.",
    "Standby, {CALL}.",
    [ {label:"Standby",variantes:["standby","stand by","j attends","attends","roger"]},
      {label:"Votre indicatif",ref:'callsign'} ]),
  unAlea('ignorez','partout',"message annulé",'p. 19-21',
    "{CALL}, ignorez mon dernier message.",
    "Accusez réception de l'annulation.",
    "Roger, {CALL}."),
  { id:'xpdr', ou:'partout', label:"code transpondeur", src:'p. 186',
    etapes:function(){ var c=codeSSR();
      return [{ stn:'tour', station:"{ADRM} {STN}",
        atc:"{CALL}, transpondeur "+c+".",
        consigne:"Collationnez le code assigné.",
        attendu:"Transpondeur "+c+", {CALL}.",
        motsCles:[ {label:"Transpondeur",variantes:["transpondeur","squawk","affiche"]},
                   {label:"Code assigné",variantes:numVariants(c)},
                   {label:"Votre indicatif",ref:'callsign'} ] }]; } },
  unAlea('ident','partout',"transpondeur ident",'p. 186',
    "{CALL}, transpondeur ident.",
    "Collationnez.",
    "Transpondeur ident, {CALL}.",
    [ {label:"Transpondeur ident",variantes:["ident","transpondeur ident","affiche ident","squawk ident"]},
      {label:"Votre indicatif",ref:'callsign'} ]),
  unAlea('veille','partout',"fréquence à veiller",'p. 182',
    "{CALL}, veillez 121 décimale 5.",
    "Collationnez la fréquence à veiller.",
    "Je veille 121 décimale 5, {CALL}.",
    [ {label:"Veille",variantes:["veille","je veille","veillez"]},
      {label:"Fréquence",variantes:["121 5","121 decimale 5","cent vingt et un decimale cinq","121,5","121.5"]},
      {label:"Votre indicatif",ref:'callsign'} ]),
  unAlea('rappel5','partout',"rappel demandé",'p. 182',
    "{CALL}, rappelez dans cinq minutes.",
    "Accusez réception de la demande de rappel.",
    "Je rappelle dans cinq minutes, {CALL}.",
    [ {label:"Je rappelle",variantes:["rappelle","je rappelle","rappel"]},
      {label:"Votre indicatif",ref:'callsign'} ]),
  unAlea('delai','partout',"délai annoncé",'p. 127',
    "{CALL}, prévoyez 10 minutes de délai, cause trafic.",
    "Accusez réception du délai.",
    "Roger, 10 minutes de délai, {CALL}.",
    [ {label:"Accusé de réception",variantes:["roger","recu","bien recu","delai","dix minutes","10 minutes"]},
      {label:"Votre indicatif",ref:'callsign'} ]),
  unAlea('pasdelai','partout',"pas de délai",'p. 127',
    "{CALL}, pas de délai prévu.",
    "Accusez réception.",
    "Roger, {CALL}."),

  /* ---- En vol ---------------------------------------------------------- */
  { id:'cap', ou:'vol', label:"changement de cap", src:'p. 195',
    etapes:function(){ return [aleaCap()]; } },
  { id:'radio', ou:'vol', label:"panne radio", src:'p. 246-248',
    etapes:function(){ return [aleaRadio()]; } },
  { id:'moteur', ou:'vol', label:"panne moteur", src:'p. 238',
    etapes:function(){ return aleaUrgence('moteur'); } },
  { id:'fumee', ou:'vol', label:"fumée en cabine", src:'p. 238',
    etapes:function(){ return aleaUrgence('fumee'); } },
  { id:'malaise', ou:'vol', label:"malaise passager", src:'p. 238',
    etapes:function(){ return aleaUrgence('malaise'); } },
  unAlea('guidage','vol',"guidage radar",'p. 191',
    "{CALL}, pour séparation, guidage radar, tournez à gauche cap 270.",
    "Collationnez : le sens du virage, puis le cap.",
    "À gauche cap 270, {CALL}.",
    [ {label:"Sens du virage",variantes:["a gauche","gauche","par la gauche"]},
      {label:"Cap",variantes:["cap","au cap"]},
      {label:"Valeur de cap",variantes:["270","deux sept zero","deux cent soixante dix"]},
      {label:"Votre indicatif",ref:'callsign'} ]),
  unAlea('reprisenav','vol',"reprise de navigation",'p. 191',
    "{CALL}, guidage terminé, reprenez votre navigation propre.",
    "Collationnez la reprise de navigation.",
    "Je reprends ma navigation, {CALL}.",
    [ {label:"Reprise",variantes:["reprends","reprise","navigation propre","navigation"]},
      {label:"Votre indicatif",ref:'callsign'} ]),
  unAlea('maintiencap','vol',"maintien de cap",'p. 195',
    "{CALL}, maintenez le cap actuel.",
    "Collationnez.",
    "Je maintiens le cap, {CALL}.",
    [ {label:"Je maintiens",variantes:["maintiens","je maintiens","maintien","cap"]},
      {label:"Votre indicatif",ref:'callsign'} ]),
  unAlea('monte','vol',"montée demandée",'p. 178',
    "{CALL}, pour séparation, montez altitude 4500 pieds.",
    "Collationnez la nouvelle altitude.",
    "Je monte altitude 4500 pieds, {CALL}.",
    [ {label:"Je monte",variantes:["monte","je monte","montons"]},
      {label:"Altitude",variantes:["4500","quatre mille cinq cents","quarante cinq"]},
      {label:"Votre indicatif",ref:'callsign'} ]),
  unAlea('descend','vol',"descente demandée",'p. 178',
    "{CALL}, descendez altitude 2000 pieds, trafic en croisement.",
    "Collationnez la nouvelle altitude.",
    "Je descends altitude 2000 pieds, {CALL}.",
    [ {label:"Je descends",variantes:["descends","je descends","descente"]},
      {label:"Altitude",variantes:["2000","deux mille","vingt"]},
      {label:"Votre indicatif",ref:'callsign'} ]),
  unAlea('sigmet','vol',"renseignement SIGMET",'p. 205',
    "{CALL}, renseignement SIGMET, givrage modéré à fort entre niveau 90 et niveau 130 sur votre route.",
    "Accusez réception du SIGMET.",
    "Roger, {CALL}."),
  unAlea('turbulence','vol',"turbulence signalée",'p. 205',
    "{CALL}, un pilote signale de fortes turbulences sur votre route.",
    "Accusez réception.",
    "Roger, {CALL}."),
  { id:'balise', ou:'vol', label:"aide à la navigation en panne", src:'p. 207',
    etapes:function(){ var b=unDe(ALEA_BALISES);
      return [{ stn:'tour', station:"{ADRM} {STN}",
        atc:"{CALL}, V-O-R "+b+" en panne.",
        consigne:"Accusez réception de l'indisponibilité.",
        attendu:"Roger, {CALL}.", motsCles:accuseRecu() }]; } },
  unAlea('aviaire','vol',"activité aviaire",'p. 208',
    "{CALL}, activité aviaire signalée sur votre route.",
    "Accusez réception.",
    "Roger, {CALL}."),
  { id:'zone', ou:'vol', label:"zone réglementée active", src:'p. 208',
    etapes:function(){ var z=unDe(ALEA_ZONES);
      return [{ stn:'tour', station:"{ADRM} {STN}",
        atc:"{CALL}, "+z+" active.",
        consigne:"Accusez réception : vous devrez la contourner.",
        attendu:"Roger, {CALL}.",
        motsCles:[ {label:"Accusé de réception",variantes:["roger","recu","bien recu","copie","evite","contourne"]},
                   {label:"Votre indicatif",ref:'callsign'} ] }]; } },
  unAlea('meteo','vol',"météo en route",'p. 209',
    "{CALL}, stratus signalés dans la région de {ADRM}.",
    "Accusez réception de l'information météo.",
    "Roger, {CALL}."),
  unAlea('meteodefav','vol',"conditions défavorables signalées",'p. 209',
    "{CALL}, un pilote signale des conditions météorologiques défavorables au voisinage de {ADRM}.",
    "Accusez réception.",
    "Roger, {CALL}."),
  unAlea('suggestion','vol',"manœuvre suggérée",'p. 212',
    "{CALL}, trafic non identifié, 1 heure, 8 nautiques. Je vous suggère de tourner à droite 20 degrés.",
    "Collationnez la manœuvre suggérée.",
    "Je tourne à droite 20 degrés, {CALL}.",
    [ {label:"Virage",variantes:["tourne a droite","a droite","droite","20 degres","vingt degres"]},
      {label:"Votre indicatif",ref:'callsign'} ]),
  unAlea('separation','vol',"séparation à assurer",'p. 213',
    "{CALL}, trafic 2 heures, 12 nautiques, convergent, même niveau, assurez votre séparation.",
    "Répondez : vous avez le visuel, ou vous ne l'avez pas.",
    "Pas visuel sur le trafic, {CALL}.",
    [ {label:"Réponse trafic",variantes:["pas visuel","pas en vue","negatif","trafic en vue","en vue","roger"]},
      {label:"Votre indicatif",ref:'callsign'} ]),
  unAlea('degage','vol',"dégagé du trafic",'p. 213',
    "{CALL}, dégagé du trafic.",
    "Accusez réception.",
    "Roger, {CALL}."),
  unAlea('vfrspecial','vol',"VFR spécial à destination",'p. 174',
    "{CALL}, conditions VFR spécial à destination, prévoyez 10 minutes de délai.",
    "Accusez réception.",
    "Roger, {CALL}."),

  /* ---- Circuit et abords du terrain ----------------------------------- */
  { id:'wind', ou:'piste', label:"le vent a tourné", src:'p. 148',
    etapes:function(){ return [aleaWind()]; } },
  { id:'hold', ou:'piste', label:"attente en vent arrière", src:'p. 150',
    etapes:function(){ return [aleaHold()]; } },
  { id:'goaround', ou:'piste', label:"remise de gaz", src:'p. 159',
    etapes:function(){ return [aleaGoAround()]; } },
  { id:'numero', ou:'piste', label:"numéro dans le circuit", src:'p. 150',
    etapes:function(){ var n=randInt(2,4);
      return [{ stn:'tour', station:"{ADRM} {STN}",
        atc:"{CALL}, numéro "+n+", suivez le Cessna 172 en base.",
        consigne:"Collationnez votre numéro et annoncez si vous voyez le trafic.",
        attendu:"Numéro "+n+", trafic en vue, {CALL}.",
        motsCles:[ {label:"Numéro",variantes:numVariants(String(n)).concat(['numero'])},
                   {label:"Réponse trafic",variantes:["trafic en vue","en vue","negatif","pas en vue","je cherche"]},
                   {label:"Votre indicatif",ref:'callsign'} ] }]; } },
  unAlea('rappelfinale','piste',"rappel en finale demandé",'p. 151',
    "{CALL}, rappelez finale piste {PISTE}.",
    "Collationnez : je rappelle finale, la piste, votre indicatif.",
    "Je rappelle finale piste {PISTE}, {CALL}.",
    [ {label:"Je rappelle finale",variantes:["rappelle finale","je rappelle finale","finale"]},
      {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
      {label:"Votre indicatif",ref:'callsign'} ]),
  unAlea('ventarriere','piste',"vent arrière signalé en finale",'p. 235',
    "{CALL}, vent secteur arrière signalé 10 nœuds en finale.",
    "Accusez réception.",
    "Roger, {CALL}."),
  unAlea('inspection','piste',"piste non inspectée",'p. 208',
    "{CALL}, information : inspection de piste non effectuée.",
    "Accusez réception.",
    "Roger, {CALL}."),
  unAlea('eau','piste',"eau stagnante sur la piste",'p. 208',
    "{CALL}, information : eau stagnante sur la piste.",
    "Accusez réception.",
    "Roger, {CALL}."),

  /* ---- Au roulage ------------------------------------------------------
     Le manuel réserve le mot « piste » au décollage, à l'atterrissage et à la
     traversée (p. 46) : d'où « maintenez position » et « maintenez avant point
     d'attente », qui ne le prononcent pas. */
  unAlea('maintienpos','sol',"maintien de position",'p. 46',
    "{CALL}, maintenez position.",
    "Collationnez le maintien de position.",
    "Je maintiens position, {CALL}.",
    [ {label:"Je maintiens position",variantes:["maintiens position","je maintiens","maintien position","maintenons position"]},
      {label:"Votre indicatif",ref:'callsign'} ], 'sol'),
  unAlea('maintienavant','sol',"maintien avant point d'attente",'p. 46',
    "{CALL}, maintenez avant point d'attente.",
    "Collationnez.",
    "Je maintiens avant point d'attente, {CALL}.",
    [ {label:"Je maintiens",variantes:["maintiens","je maintiens","maintien","maintenons"]},
      {label:"Avant point d'attente",variantes:["avant point d attente","point d attente","avant le point d attente"]},
      {label:"Votre indicatif",ref:'callsign'} ], 'sol'),
  unAlea('traversee','sol',"traversée de piste",'p. 46',
    "{CALL}, traversez piste {PISTE}, rappelez piste traversée.",
    "Collationnez la traversée, puis la piste.",
    "Je traverse piste {PISTE}, {CALL}.",
    [ {label:"Je traverse",variantes:["je traverse","traverse","traversons","traversee"]},
      {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
      {label:"Votre indicatif",ref:'callsign'} ], 'sol'),
  unAlea('remontee','sol',"remontée de piste",'p. 44',
    "{CALL}, remontez piste {PISTE}.",
    "Collationnez la remontée de piste.",
    "Je remonte piste {PISTE}, {CALL}.",
    [ {label:"Je remonte",variantes:["je remonte","remonte","remontons","remontee"]},
      {label:"Piste",variantes:["piste"]}, {label:"Numéro de piste",ref:'piste'},
      {label:"Votre indicatif",ref:'callsign'} ], 'sol'),
  unAlea('roulagevia','sol',"itinéraire de roulage",'p. 44',
    "{CALL}, roulez via A3.",
    "Collationnez l'itinéraire.",
    "Je roule via A3, {CALL}.",
    [ {label:"Je roule",variantes:["je roule","roule","roulons","roulage"]},
      {label:"Itinéraire",variantes:["via a3","a3","a trois","via"]},
      {label:"Votre indicatif",ref:'callsign'} ], 'sol')
];

/* ---- Utilitaires partagés par le scénario « Navigation / croisière » ----
   Ils reposent sur RT_AIR, publié par le module Navigation, et sur NAV_AD_GEO. */
function orgVars(nom){
  var base=String(nom||'').replace(/\s+(Tour|Sol|Approche|Information|auto-information)$/,'');
  var v=[normalize(base)];
  base.split(/[\s'’\-]+/).forEach(function(w){ if(w.length>3) v.push(normalize(w)); });
  if(/Approche/.test(nom)) v.push('approche');
  if(/Information/.test(nom)) v.push('information','info');
  if(/Tour/.test(nom)) v.push('tour');
  return v.filter(Boolean);
}
function freqMots(f){
  var s=String(f), p=s.split('.');
  return [s, s.replace('.',','), s.replace('.',' '), p.join(' decimale '), p.join(' virgule '),
          p[0]+' '+(p[1]||'')].map(normalize);
}
/* SIV le plus proche d'un terrain — même table que le module Navigation, dupliquée ici
   volontairement : les deux blocs <script> ne partagent pas de portée, et exporter la
   table entière pour trois usages n'en vaut pas la peine. */
const SIV_SCEN=[
  {n:'Lille Information',f:'126.480',lat:50.45,lon:3.10},{n:'Cotentin Information',f:'120.350',lat:49.10,lon:-0.80},
  {n:'Beauvais Information',f:'119.800',lat:49.40,lon:2.55},{n:'Seine Information',f:'120.325',lat:48.90,lon:3.45},
  {n:'Strasbourg Information',f:'119.450',lat:48.70,lon:6.90},{n:'Nord Rennes Information',f:'126.950',lat:48.30,lon:-1.70},
  {n:'Iroise Information',f:'119.575',lat:48.30,lon:-4.30},{n:'Sud Rennes Information',f:'134.000',lat:47.85,lon:-1.20},
  {n:'Bâle Information',f:'135.850',lat:47.40,lon:5.60},{n:'Seine Information',f:'127.815',lat:47.35,lon:1.50},
  {n:'Nantes Information',f:'122.800',lat:47.20,lon:-1.60},{n:'Poitiers Information',f:'124.000',lat:46.60,lon:0.30},
  {n:'Limoges Information',f:'124.050',lat:45.90,lon:1.40},{n:'Lyon Information',f:'135.200',lat:45.85,lon:4.60},
  {n:'Clermont Information',f:'119.375',lat:45.50,lon:3.20},{n:'Aquitaine Information',f:'120.575',lat:44.60,lon:0.40},
  {n:'Marseille Information',f:'124.500',lat:44.00,lon:4.50},{n:'Toulouse Information',f:'121.250',lat:43.80,lon:1.30},
  {n:'Provence Information',f:'126.260',lat:43.70,lon:5.50},{n:'Nice Information',f:'120.850',lat:43.60,lon:7.00},
  {n:'Biarritz Information',f:'119.175',lat:43.35,lon:-1.40},{n:'Pyrénées Information',f:'126.525',lat:43.15,lon:-0.90}
];
function sivProche(ad){
  if(!ad||typeof ad.lat!=='number') return null;
  var best=null,bd=1e9;
  SIV_SCEN.forEach(function(s){
    var dx=(s.lon-ad.lon)*Math.cos(ad.lat*Math.PI/180), dy=s.lat-ad.lat, d=dx*dx+dy*dy;
    if(d<bd){ bd=d; best=s; }
  });
  return best;
}


/* La correspondance clé ↔ titre ↔ rang, exposée aux modules externes.
   assets/donnees.js en a besoin pour retraduire une séance lue en base : la
   base range sous `exercise_key`, l'écran affiche un titre et rejoue un
   scénario par son rang. Recopier la liste là-bas en ferait une seconde source
   à tenir à jour, et le jour où un scénario s'ajoute, l'historique afficherait
   sa clé brute sans que personne comprenne pourquoi. */
window.RT_SCENARIOS_MAP = (function(){
  var m = {};
  SCENARIOS.forEach(function(sc, i){ if (sc && sc.id) m[sc.id] = { idx:i, titre:sc.titre }; });
  return m;
})();

/* =========================================================================
   8) ÉTAT + RÉSOLUTION DES PLACEHOLDERS
   ========================================================================= */
const state = {
  call:"F-ABCD",
  depAd:null, arrAd:null, activeAd:null, activeSide:'dep',
  meteo:{windDir:0, windForce:0, qnh:0}, ventPhrase:"", rwy:{id:"", cap:0}, atis:null,
  capDep:0, numCircuit:1, voiceRate:1.0, voiceName:null, noiseEnabled:true,
  controlled:{dep:true, arr:true}, altCruise:3000, cause:"",  // contrôlé/AFIS PAR CÔTÉ (départ/arrivée)
  difficulty:'debutant', callForm:'full',                    // C1 / C2  (aléas = automatiques en mode Réel)
  scenarioIndex:-1, queue:[], stepIndex:0, results:[]
};
// contrôlé ? pour un côté donné ('dep'/'arr'), avec repli défensif.
/* Contrôlé ou AFIS n'est plus un réglage : c'est une propriété du terrain (a.ctrl,
   posé d'après les fréquences TWR publiées). Choisir Chavenay donnait auparavant
   un contrôleur si la case était restée sur « Contrôlé » — un organisme qui
   n'existe pas là-bas. Comme en Navigation, le terrain décide. Sans terrain
   choisi, on retombe sur « contrôlé » : c'est le cas des scénarios sans aérodrome. */
function ctrlOf(side){
  const ad = (side==='arr') ? state.arrAd : state.depAd;
  if(ad) return !!ad.ctrl;
  const c=state.controlled; return (side==='arr') ? !!c.arr : !!c.dep;
}

function fillDisplay(raw){
  if(raw==null) return "";
  return raw.replace(/\{CALL\}/g, callNow())
            .replace(/\{ADRM\}/g, state.activeAd ? state.activeAd.nom : "le terrain")
            .replace(/\{PISTE\}/g, state.rwy.id)
            .replace(/\{QNH\}/g, state.meteo.qnh)
            .replace(/\{VENT\}/g, state.ventPhrase)
            .replace(/\{CAPDEP\}/g, state.capDep)
            .replace(/\{NUM\}/g, state.numCircuit)
            .replace(/\{ALT\}/g, state.altCruise)
            .replace(/\{CAUSE\}/g, state.cause)
            .replace(/\{ATIS\}/g, state.atis ? state.atis.mot : '')
            .replace(/\{ATISPART\}/g, state.atis ? ', information '+state.atis.mot : '')
            .replace(/\{ATISCONS\}/g, state.atis ? ", puis la lettre d'information reçue à l'ATIS" : '')
            .replace(/\{DEPSTN\}/g, state.depStn||'');
}
function fillSpeech(raw){
  let t = (raw||"")
    .replace(/\{CALL\}/g, phoneticCallsign(callNow()))
    .replace(/\{ADRM\}/g, state.activeAd ? state.activeAd.nom : "le terrain")
    .replace(/\{PISTE\}/g, state.rwy.id)
    .replace(/\{QNH\}/g, String(state.meteo.qnh))
    .replace(/\{VENT\}/g, state.ventPhrase)
    .replace(/\{CAPDEP\}/g, String(state.capDep))
    .replace(/\{NUM\}/g, String(state.numCircuit))
    .replace(/\{ALT\}/g, String(state.altCruise))
    .replace(/\{CAUSE\}/g, state.cause)
    .replace(/\{ATIS\}/g, state.atis ? state.atis.mot : '')
    .replace(/\{ATISPART\}/g, state.atis ? ', information '+state.atis.mot : '')
    .replace(/\{ATISCONS\}/g, '')
    .replace(/\{DEPSTN\}/g, state.depStn||'');
  /* Prononciation d'abord (elle travaille sur des MOTS), nombres ensuite. */
  return spokenDigits(prononciationRadio(t));
}

function resolveVariants(mc){
  switch(mc.ref){
    case 'callsign': return callsignVariants(state.call);
    case 'terrain':  return terrainVariants(state.activeAd);
    case 'piste':    return numVariants(state.rwy.id);
    case 'qnh':      return numVariants(String(state.meteo.qnh));
    case 'capdep':   return numVariants(String(state.capDep));
    case 'num':      return numVariants(String(state.numCircuit));
    case 'alt':      return numVariants(String(state.altCruise));
    default:         return (mc.variantes||[]).map(canonPhrase).filter(Boolean);
  }
}

// Valeur numérique courante d'un mot-clé à référence chiffrée (pour la comparaison canonique).
const NUM_REF_VALUE = {
  piste:  ()=>state.rwy.id, qnh:()=>state.meteo.qnh, capdep:()=>state.capDep,
  num:    ()=>state.numCircuit, alt:()=>state.altCruise
};
/* Un mot-clé est "trouvé" si l'une de ses variantes est présente OU, pour une valeur
   numérique, si sa suite de chiffres apparaît dans la canonisation du texte reconnu
   (robuste au mélange mots/chiffres, ex : "unité 0 unité 5" pour un QNH 1015). */
/* Une expression est présente si elle apparaît sur des MOTS ENTIERS.
   En cherchant une simple sous-chaîne, « atterris » se trouvait à l'intérieur
   d'« atterrissage » : le collationnement « autorisé atterrissage » — qui est
   précisément la faute que le manuel reproche au pilote — validait le mot-clé
   « j'atterris ». Même piège pour « décolle » dans « décollage ».
   Ce que la sous-chaîne rattrapait de légitime (les formes fléchies : « dégagée »
   pour « dégagé ») est désormais couvert, et mieux, par la comparaison par
   radical en fin de fonction. */
function contientExpression(texte, expr){
  return (' '+texte+' ').indexOf(' '+expr+' ') >= 0;
}
function mcFound(mc, corrected){
  const vars = resolveVariants(mc);
  if(vars.some(v => v && contientExpression(corrected, v))) return true;
  /* Indicatif tapé au clavier plutôt qu'épelé : « F-CH », « F CH », « f.ch » donnent
     tous « f ch » après normalisation, alors que la variante canonique est « fch ».
     On compare donc aussi en retirant les espaces des deux côtés. Limité à
     l'indicatif : ailleurs, coller les mots créerait de fausses correspondances. */
  if(mc.ref==='callsign'){
    const colle = corrected.replace(/\s+/g,'');
    if(vars.some(v => v && colle.includes(v.replace(/\s+/g,'')))) return true;
  }
  if(mc.ref && NUM_REF_VALUE[mc.ref]){
    const target = String(NUM_REF_VALUE[mc.ref]()).replace(/\D/g,'');
    if(target && digitCanon(corrected).includes(target)) return true;
  }
  /* Suite de chiffres dictée un par un : la reconnaissance les regroupe au hasard
     (« 5 6 0 3 » ressort « 5 6 03 »), et le mot-clé tombait en échec alors que le
     collationnement était juste. On rejoue donc la comparaison après canonisation
     des chiffres DES DEUX CÔTÉS — le regroupement devient sans effet. Réservé aux
     variantes qui contiennent effectivement des chiffres. */
  const dc = digitCanon(corrected);
  if(vars.some(v => { if(!v) return false;
                      const n = digitCanon(v);
                      return /\d/.test(n) && dc.includes(n); })) return true;
  /* Dernier recours : comparaison par RADICAL. Elle rattrape la désinence
     (« quittant » pour « quitte », « maintenons » pour « maintiens ») sans
     rapprocher deux mots de sens différents — voir le commentaire de stemFR().
     Placée en dernier : tout ce qui précède est plus sûr et répond déjà. */
  const rad = stemTokens(corrected);
  if(vars.some(v => { if(!v) return false;
                      const r = stemTokens(v);
                      return r.length>0 && suiteDeJetons(rad, r); })) return true;
  return false;
}

/* Résout un tour "template" en tour concret (A : ATC tiré au sort ; B2 : override AFIS
   et placeholder {STN} → Sol/Tour/Info ; ref:'station' → variantes concrètes). */
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function finalizeStep(t){
  let s = {...t};
  if(s.type) return s;                                   // choice / quiz : pas de résolution
  const controlled = ctrlOf(state.activeSide);           // contrôlé/AFIS selon le côté actif
  if(s.afis && !controlled) s = {...s, ...s.afis};       // override AFIS complet
  const stn = s.stn || 'tour';
  const word = controlled ? (stn==='sol' ? 'Sol' : 'Tour') : 'Info';
  const sub = v => (typeof v==='string') ? v.replace(/\{STN\}/g, word) : v;
  if(Array.isArray(s.atc)) s.atc = pick(s.atc);          // A : varier la phrase ATC
  if(Array.isArray(s.situation)) s.situation = pick(s.situation);
  s.atc = sub(s.atc); s.attendu = sub(s.attendu); s.situation = sub(s.situation);
  s.consigne = sub(s.consigne); s.station = sub(s.station);
  if(s.motsCles) s.motsCles = s.motsCles.map(mc =>
    mc.ref==='station' ? { label:mc.label, variantes:[ word.toLowerCase() ] } : mc);
  /* Fréquence de l'organisme appelé. Sans elle, la pile avionique des Scénarios
     restait masquée : le poste ne servait que dans le scénario Navigation. En la
     renseignant, les Scénarios se comportent comme la page Navigation — il faut
     afficher la bonne fréquence pour être entendu du contrôleur. */
  if(s.freq==null) s.freq = freqScenario(stn, controlled);
  /* La lettre d'information ne devient un mot-clé noté que si le terrain a un ATIS. */
  if(s.atisMot && state.atis && s.motsCles)
    s.motsCles = s.motsCles.concat([{ label:"Lettre d'information", variantes:atisVars(state.atis) }]);
  return s;
}

/* Fréquence publiée du terrain actif pour la station visée. L'ordre de repli suit
   ce qu'on trouve réellement sur une carte VAC : au sol on appelle le Sol s'il
   existe, sinon la Tour ; sur un terrain non contrôlé, l'AFIS puis l'auto-info. */
function freqScenario(stn, controlled){
  const g=(state.activeAd && typeof NAV_AD_GEO!=='undefined') ? NAV_AD_GEO[state.activeAd.icao] : null;
  const f=g && g.freq ? g.freq : null;
  if(!f) return null;
  const ordre = controlled ? (stn==='sol' ? ['GND','TWR','APP'] : ['TWR','GND','APP'])
                           : ['AFIS','INFO','A/A','UNIC','CTAF'];
  for(const k of ordre){ if(f[k]) return Number(f[k]); }
  return null;
}

/* Échange d'écoute de l'ATIS, inséré au tout début des scénarios qui commencent au
   parking. Le message est « dit » par la synthèse comme le ferait le récepteur ;
   l'élève doit ensuite restituer la lettre d'information, qu'il annoncera au
   contrôleur à l'appel suivant (manuel DSNA p. 39 et p. 213). */
function tourAtis(){
  const a=state.atis;
  /* ÉCOUTE PURE. On n'émet RIEN sur une fréquence ATIS : c'est une diffusion en
     boucle, personne n'y répond. L'étape demandait auparavant d'annoncer la lettre
     sur cette fréquence — une faute de phraséologie enseignée par l'exercice — et,
     comme elle portait des mots-clés, elle comptait de surcroît comme un échange
     raté dans le débriefing puisqu'on ne peut pas y répondre. La lettre reçue se
     donne au PREMIER APPEL à l'organisme, où elle est bien notée (atisMot).
     Même correction que celle déjà faite dans le vol Navigation. */
  return { stn:'sol', station:a.nom+' ATIS', freq:a.freq, premierContact:true,
    atisStep:true,                      // diffusion en boucle, calée sur SA fréquence
    atc:[a.texte],
    situation:"Avant tout appel, vous écoutez l'ATIS de "+a.nom+".",
    consigne:"Affichez la fréquence ATIS ("+a.freq.toFixed(3)+") sur le poste et écoutez le "+
             "message. Retenez la lettre d'information : vous l'annoncerez à votre premier "+
             "appel au contrôle. N'émettez rien sur cette fréquence." };
}

/* Météo + piste en service (section B & G) */
function drawMeteo(){
  state.meteo.windDir   = Math.floor(Math.random()*36)*10;   // 0..350 par pas de 10
  state.meteo.windForce = 3 + Math.floor(Math.random()*13);  // 3..15 kt
  state.meteo.qnh       = 995 + Math.floor(Math.random()*36);// 995..1030 hPa
  state.capDep          = (1 + Math.floor(Math.random()*36))*10; // 10..360
  state.numCircuit      = 1 + Math.floor(Math.random()*3);    // 1..3
  state.altCruise       = (2000 + Math.floor(Math.random()*26)*100); // 2000..4500 par 100 (B1/B3)
  state.cause           = CAUSES[Math.floor(Math.random()*CAUSES.length)];           // B3
  // « vent 0 degré » n'existe pas : le nord se dit 360 (ici comme dans l'ATIS).
  state.ventPhrase      = capVent(state.meteo.windDir) + " degrés, " + state.meteo.windForce + " nœuds";
  state.rwy = runwayInService(state.activeAd, state.meteo.windDir);
  drawTemps();                       // visibilité, temps présent, nuages, température…
}

/* =========================================================================
   MÉTÉO DÉTAILLÉE — les paramètres que diffuse un ATIS
   drawMeteo() ne tirait que vent et QNH : suffisant pour « vent 240 degrés
   8 nœuds, QNH 1015 », pas pour un message ATIS, qui annonce aussi visibilité,
   temps présent, nuages, température et point de rosée.

   Les tirages ne sont pas indépendants : une visibilité de 2 km avec un ciel
   clair n'existe pas. On tire donc un TYPE DE TEMPS, qui contraint ensuite tous
   les paramètres. Le résultat reste fictif, mais cohérent.
   ========================================================================= */
const TEMPS_TYPES = [
  { id:'cavok',   p:34, vis:[9999,9999], neb:[],                 tp:null,
    tMin:12, tMax:30, spread:[6,14], piste:null },
  { id:'beau',    p:26, vis:[10,30],     neb:['few'],            tp:null,
    tMin:8,  tMax:26, spread:[4,10], piste:null },
  { id:'couvert', p:16, vis:[8,15],      neb:['sct','bkn'],      tp:null,
    tMin:4,  tMax:18, spread:[2,6],  piste:null },
  { id:'pluie',   p:12, vis:[4,9],       neb:['bkn','ovc'],      tp:'Pluie',
    tMin:3,  tMax:16, spread:[0,2],  piste:'Piste mouillée, freinage bon' },
  { id:'averses', p:6,  vis:[6,12],      neb:['sct','bkn'],      tp:'Averse de pluie',
    tMin:6,  tMax:20, spread:[1,4],  piste:'Flaques d’eau' },
  { id:'brume',   p:4,  vis:[2,5],       neb:['bkn'],            tp:'Brume',
    tMin:1,  tMax:12, spread:[0,1],  piste:'Piste humide' },
  { id:'brouil',  p:2,  vis:[0.6,1.4],   neb:['ovc'],            tp:'Brouillard',
    tMin:0,  tMax:9,  spread:[0,0],  piste:'Piste humide' }
];
/* Quantité de nuages : termes normalisés du manuel DSNA p. 217. */
const NEB_MOT = { few:'peu', sct:'épars', bkn:'fragmenté', ovc:'couvert' };

function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function entre(a,b){ return a + Math.floor(Math.random()*(b-a+1)); }

function tirerTemps(){
  const total=TEMPS_TYPES.reduce((s,t)=>s+t.p,0);
  let r=Math.random()*total;
  for(const t of TEMPS_TYPES){ r-=t.p; if(r<=0) return t; }
  return TEMPS_TYPES[0];
}

function drawTemps(){
  const T=tirerTemps(), m=state.meteo;
  m.type=T.id;
  // Visibilité : au-delà de 10 km on annonce CAVOK, sinon la valeur en kilomètres.
  m.cavok = (T.id==='cavok');
  m.vis   = m.cavok ? null : Math.round((T.vis[0] + Math.random()*(T.vis[1]-T.vis[0]))*10)/10;
  m.tempsPresent = T.tp;
  m.pisteEtat    = T.piste;
  // Couches nuageuses : bases croissantes, cohérentes avec le type de temps.
  m.nuages = [];
  let base = T.id==='brouil' ? entre(2,4)*100 : entre(8,26)*100;
  T.neb.forEach(function(q){
    m.nuages.push({ q:q, ft:base });
    base += entre(6,22)*100;
  });
  m.temp = entre(T.tMin, T.tMax);
  m.rosee = m.temp - entre(T.spread[0], T.spread[1]);
  /* Niveau de transition : dépend du QNH. Table française usuelle pour une
     altitude de transition de 5 000 ft (valeur la plus répandue en métropole ;
     elle vaut 4 000 ft en région parisienne — d'où le caractère indicatif). */
  m.transLevel = m.qnh>=1013 ? 60 : (m.qnh>=995 ? 65 : 70);
  // Tendance : l'ATIS la reprend du TAF. NOSIG dans la grande majorité des cas.
  m.tendance = Math.random()<0.8 ? 'NOSIG' : null;
}

/* =========================================================================
   ATIS — service automatique d'information de région terminale
   Structure et ordre des éléments : instruction SIA RCA 3 TA 011 (« formulaire
   type » : INFORMATION, HEURE, TYPE D'APPROCHE, PISTE, SURFACE DE LA PISTE, NT,
   DIVERS, VENT, VISIBILITÉ, TEMPS PRÉSENT, NUAGES, TEMPÉRATURE, POINT DE ROSÉE,
   QNH, PHÉNOMÈNES SIGNIFICATIFS, TENDANCE, INSTRUCTIONS PARTICULIÈRES) et
   manuel DSNA p. 213-217, dont l'exemple de Mérignac est le modèle suivi ici.

   Le TYPE D'APPROCHE est volontairement omis : la base ne dit pas quelles
   procédures aux instruments sont publiées, et annoncer « approche ILS » sur un
   terrain qui n'en a pas serait faux. Le point de rosée est conservé bien que le
   manuel note qu'il n'est plus obligatoire — il aide à comprendre le risque de
   brume. Les valeurs sont FICTIVES, comme tout le reste du simulateur.
   ========================================================================= */

/* Un ATIS n'existe que là où il est publié : 67 terrains dans la base. Ailleurs
   (AFIS, auto-information), le pilote obtient les paramètres en fréquence. */
function atisFreqOf(ad){
  if(!ad) return null;
  const g=(typeof NAV_AD_GEO!=='undefined') ? NAV_AD_GEO[ad.icao] : null;
  const f=g && g.freq ? g.freq.ATIS : null;
  return f ? Number(f) : null;
}

/* Piste fermée : le manuel l'annonce bien sur l'ATIS (« Piste 29 fermée cause
   travaux », p. 213). Cela n'a de sens que si le terrain a au moins DEUX pistes
   physiques — sinon il serait fermé. On ne ferme jamais celle en service. */
function pisteFermee(ad, enService){
  if(!ad || !ad.pistes || ad.pistes.length<2) return null;
  if(Math.random()>0.22) return null;
  const num = id => parseInt(String(id),10);
  const cote = id => /[LRC]$/.test(String(id));
  /* La base décrit parfois une même bande deux fois (« 08 » et « 08R » à Albert,
     « 18/36 » et « 36/18 » à Auch) : annoncer la fermeture de l'une pendant que
     l'autre est en service serait absurde. On n'accepte donc que deux cas :
       - des numéros DIFFÉRENTS (05 en service, 11 fermée — cas de Mérignac) ;
       - le même numéro mais deux pistes PARALLÈLES déclarées (14L / 14R). */
  const autres=ad.pistes.filter(function(p){
    if(p.ids.indexOf(enService)>=0) return false;
    const cand=p.ids[0];
    if(num(cand)!==num(enService)) return true;
    return cote(cand) && cote(enService);
  });
  if(!autres.length) return null;
  const p=pick(autres);
  return { id:p.ids[0], cause: pick(['travaux','travaux','inspection de piste']) };
}

/* Un cap de 0 degré n'existe pas en phraséologie : le nord se dit 360. */
function capVent(d){ return d===0 ? 360 : d; }
/* Une température négative s'annonce « moins 3 », jamais « -3 ». */
function tempMot(t){ return t<0 ? 'moins '+Math.abs(t) : String(t); }
/* Visibilité : en mètres sous 5 km (arrondie à la centaine), en kilomètres entiers
   au-delà — c'est la façon dont elle est diffusée. */
function visMot(v){
  /* Au-delà de 10 km, un ATIS n'annonce pas la valeur réelle : c'est plafonné
     (9999 en METAR, « 10 km ou plus »). Les types « beau » et « couvert » tirant
     jusqu'à 30 km, le message annonçait « visibilité 27 kilomètres », ce qui ne
     se dit pas en l'air. */
  if(v>=10) return '10 kilomètres';
  if(v>=5) return Math.round(v)+' kilomètres';
  return Math.round(v*1000/100)*100+' mètres';
}
function majuscule(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }

function heureUTC(){
  const d=new Date();
  return String(d.getUTCHours()).padStart(2,'0')+String(d.getUTCMinutes()).padStart(2,'0');
}

/* Construit le message ATIS du terrain, ou null s'il n'y a pas d'ATIS publié.
   Le résultat est mémorisé dans state.atis : la lettre doit rester la même
   pendant tout le vol, puisque le pilote l'annonce au premier contact. */
function buildAtis(ad){
  const freq=atisFreqOf(ad);
  if(!freq || !ad) return null;
  const m=state.meteo, rwy=state.rwy.id;
  const L=pick('ABCDEFGHJKLMNPRSTUVWXYZ'.split(''));   // I, O et Q écartées (confusion)
  const ferme=pisteFermee(ad, rwy);
  const lignes=[];

  lignes.push('Ici '+ad.nom+', information '+NATO[L]);
  lignes.push('Enregistrée à '+heureUTC()+' UTC');
  lignes.push('Piste en service '+rwy);
  lignes.push(majuscule((m.pisteEtat ? m.pisteEtat+' ; ' : '')+'niveau de transition '+m.transLevel));
  if(ferme) lignes.push('Piste '+ferme.id+' fermée cause '+ferme.cause);
  lignes.push('Vent '+capVent(m.windDir)+' degrés, '+m.windForce+' nœuds');
  if(m.cavok){
    lignes.push('CAVOK');
  }else{
    lignes.push('Visibilité '+visMot(m.vis));
    if(m.tempsPresent) lignes.push(m.tempsPresent);
    if(m.nuages.length) lignes.push('Nuages '+m.nuages.map(n=>NEB_MOT[n.q]+' '+n.ft+' pieds').join(', '));
  }
  lignes.push('Température '+tempMot(m.temp)+', point de rosée '+tempMot(m.rosee));
  lignes.push('QNH '+m.qnh);
  if(m.tendance) lignes.push('Tendance '+m.tendance);
  lignes.push('Informez '+ad.nom+' dès le premier contact que vous avez reçu l’information '+NATO[L]);

  return { ad:ad.icao, nom:ad.nom, freq:freq, lettre:L, mot:NATO[L],
           pisteFermee:ferme, lignes:lignes, texte:lignes.join('. ')+'.' };
}

/* Variantes acceptées à l'oral pour la lettre : le mot phonétique (« Bravo »),
   la lettre seule (« B »), et les deux précédés d'« information ». */
function atisVars(a){
  if(!a) return [];
  const l=a.lettre.toLowerCase(), w=a.mot.toLowerCase();
  return [w, l, 'information '+w, 'information '+l, 'info '+w,
          'avec information '+w, 'avec l information '+w, 'j ai '+w];
}
function runwayInService(ad, windDir){
  if(!ad) return {id:"", cap:0};
  let best={id:ad.pistes[0].ids[0], cap:ad.pistes[0].caps[0]}, bestDiff=999;
  ad.pistes.forEach(p=>{
    p.caps.forEach((cap,idx)=>{
      let diff=Math.abs(windDir-cap); diff=Math.min(diff, 360-diff);
      if(diff<bestDiff){ bestDiff=diff; best={id:p.ids[idx], cap}; }
    });
  });
  return best;
}

/* =========================================================================
   9) DOM
   ========================================================================= */
const $=id=>document.getElementById(id);
const el={
  depInput:$('depInput'), depList:$('depList'), arrInput:$('arrInput'), arrList:$('arrList'),
  call:$('call'), voiceRate:$('voiceRate'), voiceSelect:$('voiceSelect'), noiseToggle:$('noiseToggle'),
  depKind:$('depKind'), arrKind:$('arrKind'),
  difficultySelect:$('difficultySelect'), badgeGrid:$('badgeGrid'),
  scenarios:$('scenarios'), panel:$('panel'),
  stepLabel:$('stepLabel'), terrainToggle:$('terrainToggle'), meteo:$('meteo'),
  atcBox:$('atcBox'), atcStation:$('atcStation'), atcTxt:$('atcTxt'),
  situationBox:$('situationBox'), consigne:$('consigne'),
  pttBtn:$('pttBtn'), replayBtn:$('replayBtn'), hintBtn:$('hintBtn'), nextBtn:$('nextBtn'),
  skipBtn:$('skipBtn'), backBtn:$('backBtn'), quitBtn:$('scQuit'),
  transWrap:$('transWrap'), transText:$('transText'), validerBtn:$('validerBtn'), reRecordBtn:$('reRecordBtn'),
  feedback:$('feedback'), hint:$('hint'), hintTxt:$('hintTxt'),
  choiceBox:$('choiceBox'), choiceQ:$('choiceQ'), choiceOpts:$('choiceOpts'),
  recap:$('recap'), scoreNum:$('scoreNum'), recapList:$('recapList'), copyBtn:$('copyBtn'), restartBtn:$('restartBtn'),
  historyPanel:$('historyPanel'), historyBody:$('historyBody'), scCall:$('scCall'),
  log:$('log'), noreco:$('noreco'), toast:$('toast'),
  /* Bandeau d'accord + fiche terrain : les repères permanents du vol Navigation,
     désormais présents aussi en Scénarios. */
  scStation:$('scStation'), scFreq:$('scFreq'), scAtisChip:$('scAtisChip'), scBar:$('scBar'),
  scSrc:$('scSrc'), scNoreco:$('scNoreco'),
  scFicheNom:$('scFicheNom'), scFicheTag:$('scFicheTag'), scFicheNote:$('scFicheNote'),
  scAvion:$('scAvion'), scAvionImg:$('scAvionImg'), scAvionLeg:$('scAvionLeg')
};

/* --- Autocomplete aérodrome --- */
function setupAutocomplete(input, list, onPick, filterFn){
  let active=-1, items=[];
  function ligne(a){
    const div=document.createElement('div');
    div.className='ac-item'; div.setAttribute('role','option');
    div.innerHTML='<span class="code">'+a.icao+'</span> — '+escapeHtml(a.nom);
    div.addEventListener('mousedown', ev=>{ ev.preventDefault(); pick(a); });
    return div;
  }
  function entete(t){
    const d=document.createElement('div'); d.className='ac-fam'; d.textContent=t; return d;
  }
  function ouvrir(){ active=-1; list.classList.add('open'); input.setAttribute('aria-expanded','true'); }
  /* Champ vide : on déroule les grands terrains au lieu de ne rien montrer.
     C'était la seule façon d'arriver ici sans savoir quoi taper. */
  function proposer(){
    const dispo = AD_CONNUS.map(c=>AERODROMES.find(a=>a.icao===c))
                           .filter(a=> a && (!filterFn || filterFn(a)));
    if(!dispo.length){ list.classList.remove('open'); input.setAttribute('aria-expanded','false'); return; }
    items = dispo;
    list.innerHTML='';
    list.appendChild(entete('Les plus connus'));
    dispo.forEach(a=> list.appendChild(ligne(a)));
    const p=document.createElement('div'); p.className='ac-empty';
    p.textContent='Tapez un nom ou un code pour chercher parmi les '+AERODROMES.length+' terrains.';
    list.appendChild(p);
    ouvrir();
  }
  function render(q){
    const nq=normalize(q);
    if(!nq){ proposer(); return; }
    /* Le tri passe AVANT la coupe à 40 : trier après, c'est laisser un grand
       terrain hors de la fenêtre quand la saisie ramène beaucoup de monde. */
    items = AERODROMES.filter(a=> (!filterFn || filterFn(a)) &&
                (normalize(a.icao).includes(nq) || normalize(a.nom).includes(nq)))
                .sort(adTriPour(nq)).slice(0,40);
    list.innerHTML='';
    if(!items.length){ list.innerHTML='<div class="ac-empty">Aucun aérodrome trouvé</div>'; }
    items.forEach(a=> list.appendChild(ligne(a)));
    ouvrir();
  }
  function pick(a){
    input.value = a.icao+' — '+a.nom;
    list.classList.remove('open'); input.setAttribute('aria-expanded','false');
    onPick(a);
  }
  input.addEventListener('input', ()=>{ onPick(null); render(input.value); });
  input.addEventListener('focus', ()=> render(input.value));
  input.addEventListener('click', ()=>{ if(!list.classList.contains('open')) render(input.value); });
  input.addEventListener('blur', ()=> setTimeout(()=>list.classList.remove('open'), 120));
  input.addEventListener('keydown', e=>{
    const opts=[...list.querySelectorAll('.ac-item')];
    if(e.key==='ArrowDown'){ e.preventDefault(); active=Math.min(active+1,opts.length-1); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); active=Math.max(active-1,0); }
    else if(e.key==='Enter'){ if(active>=0 && items[active]){ e.preventDefault(); pick(items[active]); } return; }
    else return;
    opts.forEach((o,i)=>o.classList.toggle('active', i===active));
    if(opts[active]) opts[active].scrollIntoView({block:'nearest'});
  });
}
/* Plus aucun filtre : tous les terrains sont proposés. C'est le terrain retenu qui
   dit ensuite s'il est contrôlé ou AFIS — on n'a plus à le déclarer soi-même. */
setupAutocomplete(el.depInput, el.depList, a=>{ state.depAd=a; onTerrainPick('dep'); });
setupAutocomplete(el.arrInput, el.arrList, a=>{ state.arrAd=a; onTerrainPick('arr'); });

/* Pastille « Contrôlé » / « AFIS » sous le champ : le renseignement que portaient
   les deux sélecteurs supprimés, mais en lecture seule et toujours juste. */
function majPastilleTerrain(side){
  const box = (side==='arr') ? el.arrKind : el.depKind;
  if(!box) return;
  const ad = (side==='arr') ? state.arrAd : state.depAd;
  if(!ad){ box.classList.add('hidden'); box.textContent=''; return; }
  box.classList.remove('hidden');
  box.classList.toggle('afis', !ad.ctrl);
  box.textContent = ad.ctrl
    ? 'Terrain contrôlé — vous parlez à une tour de contrôle.'
    : "Terrain non contrôlé — AFIS ou auto-information, pas de contrôleur.";
}
function onTerrainPick(side){
  state.controlled = { dep: state.depAd ? !!state.depAd.ctrl : state.controlled.dep,
                       arr: state.arrAd ? !!state.arrAd.ctrl : state.controlled.arr };
  majPastilleTerrain(side);
  // Le terrain change : le scénario en cours doit être rejoué avec le bon organisme.
  if(state.scenarioIndex>=0 && ((side==='arr')?state.arrAd:state.depAd)) startWithTerrain();
}

el.call.addEventListener('input', ()=>{ state.call = el.call.value.trim() || "F-XXXX"; majIndicatif(); refreshTexts(); });
/* Rappel permanent de l'indicatif dans l'en-tête du panneau : c'est l'élément à
   prononcer dans presque chaque message, il ne doit pas être à rechercher. */
function majIndicatif(){ if(el.scCall) el.scCall.textContent = state.call; }
el.voiceRate.addEventListener('change', ()=>{ state.voiceRate = parseFloat(el.voiceRate.value); });
el.voiceSelect.addEventListener('change', ()=>{
  voicePref = el.voiceSelect.value || null;   // source de vérité lue par pickVoice()
  state.voiceName = voicePref;                // miroir dans l'état global (cohérence)
  pickVoice();                                // même règle de choix qu'au chargement
});
el.difficultySelect.addEventListener('change', ()=>{ state.difficulty = el.difficultySelect.value; });
el.noiseToggle.addEventListener('change', ()=>{
  state.noiseEnabled = el.noiseToggle.checked;
  if(!state.noiseEnabled) stopRadioNoise();   // couper immédiatement si décoché en pleine parole
});

/* --- Boutons scénario --- */
/* Ce que contient chaque scénario, en une ligne. La grille ne montrait qu'un
   numéro et un titre : on choisissait à l'aveugle, sans savoir quels échanges on
   allait devoir tenir ni ce que l'exercice demandait comme terrain. Les renvois
   sont ceux déjà cités dans les échanges eux-mêmes. */
const SC_DESC={
  roulage:     "Du parking au point d'attente : demande de mise en route, puis de roulage. Manuel p. 39-44.",
  decollage:   "Alignement, clairance de décollage et collationnement. Manuel p. 53-59.",
  integration: "Arrivée sur un terrain : verticale, circuit, finale et atterrissage. Manuel p. 150-160.",
  tourdepiste: "Un tour complet : vent arrière, base, finale, puis touch-and-go ou complet.",
  navigation:  "En croisière avec un organisme d'information : contact, position, transit.",
  urgence:     "Détresse et urgence : Mayday et Pan Pan, dans l'ordre imposé. Manuel p. 231.",
  panneradio:  "Quiz de procédure : que faire, et dans quel ordre, en panne de radio. Manuel p. 246.",
  pointattente:"Maintien de position et traversée de piste — le mot « piste » y est réservé. Manuel p. 44-46.",
  apresatt:    "Ce qui suit le toucher des roues : dégagement, roulage parking. Manuel p. 160-161.",
  transit:     "Traverser l'espace contrôlé d'un autre terrain : demande, itinéraire, rappel. Manuel p. 178.",
  remisegaz:   "Finale interrompue : remise de gaz commandée, puis tour complet. Manuel p. 159.",
  vocabulaire: "Quiz : Affirme, Wilco, Roger, Impossible — le vocabulaire imposé. Manuel p. 19-21.",
  nombres:     "Quiz : fréquences, caps, sigles et indicatif abrégé. Manuel p. 11-18."
};
/* Terrain nécessaire pour lancer l'exercice — un scénario d'arrivée se joue sur le
   terrain d'arrivée, deux d'entre eux n'en demandent aucun. */
function scBesoinTerrain(sc){
  if(sc.noTerrain) return 'Sans aérodrome';
  return sc.defaultTerrain==='arr' ? "Terrain d'arrivée" : 'Terrain de départ';
}
SCENARIOS.forEach((sc,i)=>{
  const b=document.createElement('button');
  b.className='sc-btn'; b.type='button';
  b.innerHTML='<span class="num">Scénario '+(i+1)+'</span>'
    +'<span class="sc-t">'+escapeHtml(sc.titre)+'</span>'
    +'<span class="sc-d">'+escapeHtml(SC_DESC[sc.id]||'')+'</span>'
    +'<span class="sc-tags"><i>'+escapeHtml(scBesoinTerrain(sc))+'</i>'
    +(sc.controllable?'<i>Contrôlé ou AFIS</i>':'')
    +(sc.emergency?'<i class="urg">Urgence</i>':'')
    +(sc.quiz?'<i>Quiz</i>':'')+'</span>';
  // Changer de scénario en pleine session efface l'échange en cours : on demande.
  b.addEventListener('click', ()=>{
    if(!scenarioEnCours() || i===state.scenarioIndex) return launchScenario(i);
    rtConfirm(MSG_ABANDON,{title:'Changer de scénario ?',ok:'Changer'})
      .then(ok=>{ if(ok) launchScenario(i); });
  });
  el.scenarios.appendChild(b);
});

/* =========================================================================
   10) MOTEUR DE SCÉNARIO
   ========================================================================= */
function scParId(id){ return SCENARIOS.filter(s => s.id===id)[0]; }
function buildQueue(sc){
  let raw;
  if(sc.isCircuit){
    // Point 4 : tour de piste COMPLET, départ = arrivée = même terrain (activeAd).
    // 1-2) Mise en route + roulage (§3.3/§3.4). 3-4) Alignement + décollage + montée (§3.5/§3.6),
    //      sans le changement de fréquence (hors sujet en circuit). 5-8) vent arrière → n° →
    //      base → finale → choix (touch-and-go boucle / atterrissage complet).
    // À VÉRIFIER avec le manuel DGAC / mon instructeur : en tour de piste la clairance de départ
    // diffère (on reste dans le circuit) ; la formulation §3.6 est reprise faute d'équivalent circuit.
    /* Par IDENTIFIANT, et non par position. Le tour de piste réemploie les
       échanges du roulage et du décollage ; SCENARIOS[0] et SCENARIOS[1] les
       désignaient tant que la liste commençait par eux — c'est-à-dire jusqu'au
       jour où l'on insère un scénario avant. Le tour de piste se serait alors
       construit sur les échanges d'un autre exercice, sans rien signaler. */
    raw = [ ...scParId('roulage').tours, ...scParId('decollage').tours.slice(0,4),
            tourVentArriere(), tourNumeroATC(), tourBase(), tourFinale(), circuitChoiceStep() ];
  } else if(typeof sc.buildTours==='function'){
    // Scénario dont les échanges dépendent de l'espace aérien réel du terrain choisi.
    raw = sc.buildTours() || sc.tours;
  } else {
    raw = sc.tours;
  }
  /* Écoute de l'ATIS avant le premier appel, sur les scénarios qui débutent au
     parking (mise en route, tour de piste). Rien n'est inséré si le terrain ne
     publie pas d'ATIS : c'est le cas de la grande majorité des terrains VFR. */
  if(state.atis && (sc.id==='roulage' || sc.isCircuit)) raw = [tourAtis()].concat(raw);
  return marquerPremierContact(raw.map(finalizeStep));   // A + B2 : résolution ATC aléatoire / AFIS / {STN}
}

/* Même règle que dans le vol Navigation : l'organisme ne se nomme qu'au PREMIER
   échange sur une fréquence — « Orléans Tour, F-BXYZ, demande mise en route »,
   puis « F-BXYZ, demande roulage ». Le répéter à chaque fois encombre la fréquence.
   finalizeStep vient de poser s.freq (freqScenario), on compare donc directement
   les fréquences : passer du Sol à la Tour rouvre un premier contact.
   Hors premier contact, la station sort des éléments EXIGÉS et disparaît de la
   phrase d'exemple. La dire quand même reste sans conséquence : c'est superflu,
   pas fautif. Les étapes sans fréquence (choix, quiz) ne sont pas touchées et ne
   coupent pas la continuité. */
function marquerPremierContact(steps){
  let fPrec=null;
  steps.forEach(s=>{
    /* Repli sur stn : freqScenario() peut ne rien renvoyer (terrain sans fréquence
       publiée), et la règle doit tenir quand même — Sol et Tour restent deux
       contacts distincts. */
    const cle = (s.freq!=null) ? s.freq : s.stn;
    if(cle==null){ s.premierContact=true; return; }
    const premier = (cle!==fPrec);
    fPrec = cle;
    s.premierContact = premier;
    if(premier || !s.attendu) return;
    s.motsCles = (s.motsCles||[]).filter(mc =>
      mc.label!=='Station appelée' && mc.label!=='Nom du terrain');
    s.attendu = String(s.attendu).replace(/^\s*\{ADRM\}\s+(?:Sol|Tour|Info)\s*,\s*/,'');
  });
  return steps;
}

/* Insère, avec une chance sur deux, UN imprévu avant la dernière étape à
   répondre. Mode Réel uniquement : c'est là sa raison d'être — en mode guidé on
   apprend un déroulé, en mode Réel on apprend à en sortir.

   Le vivier est ALEAS_SCEN, filtré sur ce qui a un sens ici et maintenant. Le
   nombre d'échanges n'étant plus affiché, allonger la file ne dérange rien. */
function maybeInsertAlea(sc){
  if(state.difficulty!=='reel') return;              // aléas = mode Réel seulement
  if(sc.emergency || sc.quiz) return;                // pas d'aléa sur Urgence / Panne radio (quiz)
  if(Math.random() >= 0.5) return;
  let lastAns=-1;
  for(let i=0;i<state.queue.length;i++){ const s=state.queue[i];
    if(s.motsCles || s.type==='choice' || s.type==='quiz') lastAns=i; }
  if(lastAns < 1) return;

  const enVol   = ['decollage','integration','tourdepiste','navigation','transit'].indexOf(sc.id)>=0;
  /* Le tour de piste PART du parking, mais l'imprévu s'insère avant la DERNIÈRE
     étape à répondre — celle-là est en l'air. « Maintenez position » y tomberait
     sur quelqu'un en vent arrière. Seuls les scénarios qui FINISSENT au sol
     acceptent donc les imprévus de roulage. */
  const auSol   = ['roulage','pointattente','apresatt'].indexOf(sc.id)>=0;
  const enPiste = !!(sc.isCircuit || sc.alea);
  const vivier = ALEAS_SCEN.filter(a => a.ou==='partout'
                                     || (a.ou==='vol'   && enVol)
                                     || (a.ou==='piste' && enPiste)
                                     || (a.ou==='sol'   && auSol));
  if(!vivier.length) return;
  const a = pick(vivier);

  /* La remise de gaz ne s'insère pas : elle REMPLACE la fin du scénario. On
     abandonne l'atterrissage et on repart pour un tour complet, ce qui est
     exactement ce qui se passe en vol. */
  if(a.id==='goaround'){
    const lap=[tourVentArriere(),tourNumeroATC(),tourBase(),tourFinale(),circuitChoiceStep()].map(finalizeStep);
    state.queue = state.queue.slice(0,lastAns).concat([finalizeStep(aleaGoAround())], lap);
    logRow('sys','Aléa : remise de gaz — vous repartez pour un tour de piste.');
    return;
  }
  const steps = a.etapes().map(finalizeStep);        // une étape, ou deux pour une urgence
  state.queue.splice(lastAns, 0, ...steps);
  logRow('sys','Aléa : '+a.label+' ('+a.src+').');
}


function launchScenario(i){
  const sc=SCENARIOS[i];
  // Navigation / panne radio ne nécessitent pas d'aérodrome ; les autres si.
  if(!sc.noTerrain && !state.depAd && !state.arrAd){ showToast("Choisissez d'abord un aérodrome de départ."); return; }
  state.scenarioIndex=i;
  state.activeSide = (sc.defaultTerrain==='arr' && state.arrAd) ? 'arr' : 'dep';
  startWithTerrain();
  document.querySelectorAll('.sc-btn').forEach((b,idx)=> b.setAttribute('aria-current', idx===i?'true':'false'));
}
function startWithTerrain(){
  const sc=SCENARIOS[state.scenarioIndex];
  state.activeAd = (state.activeSide==='arr') ? (state.arrAd||state.depAd) : (state.depAd||state.arrAd);
  if(state.activeSide==='arr' && !state.arrAd) state.activeSide='dep';
  if(state.activeSide==='dep' && !state.depAd) { state.activeAd=state.arrAd; }
  drawMeteo();
  /* ATIS du terrain : tiré une fois par exercice, avant la construction des
     échanges — la lettre doit rester la même du début à la fin. */
  state.atis = buildAtis(state.activeAd);
  state.queue = buildQueue(sc);
  state.stepIndex=0; state.results=[];
  /* La trace fine des scénarios n'existait pas : on gardait le score, jamais ce
     qui avait été attendu ni ce qui avait été dit. Les vols, eux, la gardaient
     depuis toujours (rt-vols[].lignes[]). Même structure ici, pour que les deux
     se lisent de la même façon — dans l'historique local comme en base. */
  state.dits=[]; state.attendus=[];
  state.debut = Date.now();
  /* Nouvel exercice : on repart d'une pile avionique neuve (7000 en veille VFR),
     sinon un code assigné au scénario précédent continuerait de clignoter. */
  scXpdr.code='7000'; scXpdr.saisie='7000'; scXpdr.mode=2; scXpdr.ident=false; scXpdr.attendu=null;
  /* Poste accordé sur l'organisme du terrain au démarrage — comme en Navigation, on
     ne commence pas un exercice avec une radio éteinte. L'étape ATIS, elle, porte une
     AUTRE fréquence : c'est elle qui oblige à manipuler le poste. */
  scRadio.act=null; scRadio.stby=null; scRadio.attendue=null;
  for(const st of state.queue){ if(st.freq!=null && !(state.atis && st.freq===state.atis.freq)){ scRadio.act=Number(st.freq); break; } }
  scEchecFreq=0; scEchecCode=0; scAttend7600=false;
  state.atisEcoute=false;
  if(listening) stopListening();
  /* stopListening() ne remet le bouton au repos que dans onend, qui est
     asynchrone : on le fait aussi tout de suite, sinon un exercice relancé
     pendant une écoute s'ouvre avec l'alternat encore allumé. Le bouton est
     touché directement, et non via pttUI(), qui redirige vers le module Vol
     quand un vol a laissé son relais en place. */
  if(el.pttBtn){
    el.pttBtn.classList.remove('listening');
    const _sp=el.pttBtn.querySelector('span');
    if(_sp) _sp.textContent='Maintenir pour parler';
  }
  el.recap.classList.add('hidden');
  el.panel.classList.remove('hidden');
  /* Session en cours : on ne montre que la session, comme en vol. Le configurateur
     et la grille de scénarios restaient auparavant sous le panneau, si bien qu'on
     répondait au contrôleur avec le formulaire de réglages sous les yeux. */
  document.body.classList.add('in-session');
  document.body.classList.remove('in-recap');
  scRadioSkin(); scChoisirPhoto();
  // C2 : en examen blanc, journal continu (on ne vide pas entre scénarios).
  clearLog();
  const adLabel = state.activeAd ? (state.activeAd.icao+' '+state.activeAd.nom) : 'sans aérodrome';
  logRow('sys','━━ '+sc.titre+' · '+adLabel+' ━━');
  if(state.activeAd && !sc.noTerrain)
    logRow('sys','Piste '+state.rwy.id+' en service · Vent '+state.meteo.windDir+'°/'+state.meteo.windForce+'kt · QNH '+state.meteo.qnh
      +(sc.controllable ? ' · '+(ctrlOf(state.activeSide)?'Contrôlé':'Non contrôlé (AFIS)') : ''));
  maybeInsertAlea(sc);          // C3
  renderTerrainToggle();
  renderStep();
  /* Déclarée en base dès maintenant, comme un vol : c'est ce qui permet de
     compter les scénarios commencés et jamais finis. */
  state.sync = (window.RTSync) ? RTSync.demarrer({
    kind:'scenario', level:state.difficulty, exercise_key:sc.id,
    dep_icao: state.activeAd ? state.activeAd.icao : null,
    runway: state.rwy ? String(state.rwy.id) : null
  }) : null;
}

/* Photo d'avion tirée au sort, comme au début d'un vol. Purement décorative : elle
   ne correspond pas à la machine choisie. Une image absente masque le bloc plutôt
   que d'afficher un cadre cassé. */
function scChoisirPhoto(){
  const fig=el.scAvion; if(!fig) return;
  const L=(typeof NAV_AVIONS!=='undefined') ? NAV_AVIONS : [];
  if(!L.length){ fig.style.display='none'; return; }
  const a=L[Math.floor(Math.random()*L.length)];
  el.scAvionImg.src='assets/avions/'+a.f; el.scAvionImg.alt=a.nom;
  el.scAvionLeg.innerHTML='<b>'+escapeHtml(a.nom)+'</b>';
  el.scAvionImg.onerror=function(){ fig.style.display='none'; };
  fig.style.display='';
}

function renderTerrainToggle(){
  el.terrainToggle.innerHTML='';
  const mk=(side,ad,label)=>{
    const b=document.createElement('button');
    b.className='tt-btn'; b.type='button';
    b.textContent = label+(ad?(' '+ad.icao):'');
    b.setAttribute('aria-pressed', state.activeSide===side ? 'true':'false');
    b.disabled = !ad;
    b.addEventListener('click', ()=>{ if(!ad || state.activeSide===side) return; state.activeSide=side; startWithTerrain(); });
    el.terrainToggle.appendChild(b);
  };
  mk('dep', state.depAd, 'Départ');
  mk('arr', state.arrAd, 'Arrivée');
}
/* FICHE DU TERRAIN — colonne de droite de la session.
   Ce sont les paramètres qu'il faut avoir sous les yeux pour parler juste : piste
   en service, vent, QNH, lettre d'information. Ils n'étaient jusqu'ici qu'une
   ligne de journal, aussitôt repoussée par les messages suivants. */
function ligneFiche(dt, dd){ return '<dt>'+escapeHtml(dt)+'</dt><dd>'+dd+'</dd>'; }
function renderMeteo(){
  if(!el.meteo) return;
  const sc=SCENARIOS[state.scenarioIndex];
  const ad=state.activeAd;
  if(el.scFicheNom) el.scFicheNom.textContent = ad ? ad.nom : 'Sans aérodrome';
  if(el.scFicheTag){
    el.scFicheTag.textContent = (ad && sc && sc.controllable)
      ? (ctrlOf(state.activeSide) ? 'Contrôlé' : 'AFIS')
      : (ad ? (ad.ctrl ? 'Contrôlé' : 'AFIS') : '');
  }
  let h='';
  if(ad) h+=ligneFiche('OACI','<b>'+escapeHtml(ad.icao)+'</b>');
  if(sc && sc.id==='navigation'){
    h+=ligneFiche('Altitude','<b>'+state.altCruise+' ft</b>');
    h+=ligneFiche('QNH','<b>'+state.meteo.qnh+'</b>');
  }else if(sc && sc.id==='panneradio'){
    h+=ligneFiche('Exercice','Quiz de procédure');
  }else if(ad){
    h+=ligneFiche('Piste','<b>'+escapeHtml(state.rwy.id)+'</b>');
    h+=ligneFiche('Vent','<b>'+state.meteo.windDir+'° / '+state.meteo.windForce+' kt</b>');
    h+=ligneFiche('QNH','<b>'+state.meteo.qnh+'</b>');
  }
  if(state.atis) h+=ligneFiche('ATIS','<b>'+state.atis.freq.toFixed(3)+'</b> · information <b>'+escapeHtml(state.atis.mot)+'</b>');
  el.meteo.innerHTML=h;
  if(el.scFicheNote){
    el.scFicheNote.textContent = state.atis
      ? "Ce terrain diffuse un ATIS : affichez sa fréquence pour l'écouter, puis annoncez la lettre reçue à votre premier appel."
      : (ad && !ctrlOf(state.activeSide) && sc && sc.controllable
          ? "Terrain non contrôlé : vous vous auto-informez, l'agent AFIS ne délivre pas de clairance."
          : '');
  }
}

/* BANDEAU D'ACCORD — indicatif, station appelée, fréquence active, ATIS.
   Repris du vol : on doit toujours savoir à qui l'on parle et sur quelle
   fréquence on émet, sans avoir à chercher dans le poste. */
/* Nom de l'organisme appelé. finalizeStep résout déjà {STN} sur les étapes qui
   portent un `station`, mais beaucoup n'en portent pas : on retombe alors sur le
   gabarit du scénario, où {STN} serait resté tel quel à l'écran. */
function stationLabel(s){
  if(!s) return '—';
  if(s.station) return fillDisplay(s.station);
  const sc=SCENARIOS[state.scenarioIndex];
  const mot = ctrlOf(state.activeSide) ? ((s.stn||'tour')==='sol' ? 'Sol' : 'Tour') : 'Info';
  return fillDisplay(String((sc && sc.station) || '{ADRM} {STN}').replace(/\{STN\}/g, mot));
}
function majEnTete(){
  const s=currentStep();
  if(el.scStation) el.scStation.textContent = stationLabel(s);
  /* La fréquence du bandeau est celle de l'organisme à joindre, pas celle réglée
     sur le poste : c'est la cible. L'état réel du poste, lui, est sous les yeux
     dans la boîte ACTIVE / STANDBY. Même convention qu'en vol. */
  if(el.scFreq){
    const f = s ? s.freq : null;
    el.scFreq.textContent = (f==null) ? '—' : Number(f).toFixed(3);
    el.scFreq.classList.toggle('hidden', f==null);
  }
  if(el.scAtisChip){
    const a=state.atis;
    if(!a) el.scAtisChip.classList.add('hidden');
    else {
      el.scAtisChip.classList.remove('hidden');
      /* La lettre n'apparaît qu'une fois l'ATIS écouté : la deviner n'a pas de sens,
         aller la chercher fait partie de l'exercice. */
      el.scAtisChip.innerHTML = state.atisEcoute
        ? 'ATIS '+escapeHtml(a.freq.toFixed(3))+' &middot; <b>information '+escapeHtml(a.mot)+'</b>'
        : 'ATIS '+escapeHtml(a.freq.toFixed(3));
    }
  }
  if(el.scBar){
    const n=state.queue.length||1;
    el.scBar.style.width = Math.round((state.stepIndex/n)*100)+'%';
  }
}

function currentStep(){ return state.queue[state.stepIndex]; }

function renderStep(){
  majIndicatif();
  scArreterAtis();          // nouvel échange : une diffusion ATIS en cours s'arrête ici
  scRadioPourEtape();
  const sc=SCENARIOS[state.scenarioIndex];
  const step=currentStep();
  if(step && step.onEnter && !step._entered){ step._entered=true; step.onEnter(); } // C3 (ex: vent qui tourne)
  renderMeteo();

  const reel = (state.difficulty==='reel');
  majEnTete();

  if(step.type==='choice'){ renderChoice(step); return; }
  if(step.type==='quiz'){ renderQuiz(step); return; }

  // Tour normal
  el.choiceBox.classList.add('hidden');
  /* Étape d'ÉCOUTE PURE (ATIS) : rien à transmettre, donc pas de micro ni de zone
     de réponse — mais « Suivant » reste accessible, sans quoi on reste bloqué. */
  const ecoute = !!step.atisStep;
  /* Sur une écoute pure il n'y a pas de phrase attendue : ni micro, ni « Réponse ». */
  scPanneau({ atc:!!step.atc, situation:!!step.situation, ptt:!ecoute, trans:!ecoute,
              replay: !!step.atc && !ecoute && !reel, hint: !reel && !ecoute, skip:true });
  el.stepLabel.textContent = sc.titre;
  /* Les échanges d'un scénario ne portent pas de renvoi au manuel comme les étapes
     d'un vol : on affiche à la place le rang de l'échange. Le TOTAL n'est pas
     annoncé — un aléa peut en ajouter en cours de route. Une écoute pure ne compte
     pas comme un échange : on n'y transmet rien. */
  el.scSrc.textContent = ecoute ? 'Écoute' : ('Échange '+rangEchange());
  /* Indicatif COMPLET au premier échange sur une fréquence, abrégé ensuite
     (manuel DSNA p. 18) — exactement comme dans le vol Navigation.
     Seul ce dernier posait state.callForm : la valeur laissée par un vol
     TRAÎNAIT ensuite dans les Scénarios, qui réclamaient donc « F-CD » dès le
     premier appel alors que la phraséologie exige « F-ABCD ». Le poser ici
     répare la fuite ET donne aux Scénarios le comportement attendu. */
  state.callForm = step.premierContact ? 'full' : 'abbr';
  /* Figée ICI, pas au récapitulatif : elle dépend de state.callForm, qui change
     d'un échange à l'autre. La calculer à la fin donnerait la mauvaise forme
     d'indicatif pour tous les échanges — même piège qu'en Navigation. */
  if(step.attendu) state.attendus[state.stepIndex] = fillDisplay(step.attendu);

  if(step.atc){
    el.atcStation.textContent = stationLabel(step)+' : ';
    /* L'ATIS n'est PAS un message qu'on nous adresse : il tourne en boucle sur sa
       propre fréquence. On ne le joue pas ici, et surtout on n'en ÉCRIT PAS le
       texte — l'afficher d'emblée revenait à lire l'ATIS sans l'avoir affiché sur
       le poste : la piste, le QNH et la lettre étaient donnés avant même d'avoir
       touché la radio. C'est le calage sur la fréquence qui dévoile et déclenche
       le message (scMajEcouteAtis), et s'en écarter le coupe. Même règle qu'en
       vol Navigation. Pas de bouton « Réécouter » non plus : la boucle repasse. */
    if(step.atisStep){ scMajEcouteAtis(); }
    else {
      // Mode Réel : le texte du contrôleur est masqué (voix seule) ; Débutant : texte affiché.
      el.atcTxt.textContent = reel ? 'Message radio — écoutez (voix seule).' : fillDisplay(step.atc);
      // En Réel, on ne consigne pas le texte du contrôleur dans le journal (sinon on pourrait le relire).
      logRow('atc', stationLabel(step)+(reel ? ' — (message vocal)' : ' — '+fillDisplay(step.atc)));
      speakATC(step.atc, !!sc.emergency);
    }
  }
  // Sur la fréquence ATIS on n'entend QUE l'ATIS : aucun appareil n'y émet.
  if(!step.atisStep) maybeSpeakTraffic(step);   // AFIS : on entend aussi les autres appareils
  el.situationBox.innerHTML = step.situation
    ? ICONS.warn+'<span>'+escapeHtml(fillDisplay(step.situation))+'</span>' : '';
  /* Mode Réel : plus de consigne détaillée — à vous de retrouver la formulation.
     Même exception qu'en Navigation : on la garde quand elle porte une information
     qu'on ne peut pas deviner, c'est-à-dire l'organisme à appeler au PREMIER
     contact sur une fréquence. Et toujours sur une écoute pure, où elle dit quoi
     régler sur le poste. */
  const consigneVisible = !reel || ecoute || step.premierContact;
  el.consigne.innerHTML = consigneVisible
    ? 'À vous : <b>'+escapeHtml(fillDisplay(step.consigne||''))+'</b>'
    : '';

  // reset zone réponse
  el.transText.value=''; el.validerBtn.disabled=true;
  el.feedback.innerHTML='';
  el.hint.classList.add('hidden'); el.hintTxt.textContent='';
  /* Sur une écoute pure il n'y a rien à valider : « Suivant » est ouvert d'emblée. */
  el.nextBtn.disabled = !ecoute;
  el.nextBtn.innerHTML = (isLastAnswerStep() ? 'Voir le récap' : 'Suivant') + ICONS.chevron;
  el.pttBtn.disabled = !RECO_OK;
  el.hintBtn.disabled = false;
  el.hintBtn.title = '';
}

/* Chaque type d'étape n'utilise qu'une partie du panneau : un tour de radio a le
   micro et la transcription, un quiz seulement les boutons, une décision rien du
   tout. On centralise l'affichage plutôt que de manipuler six styles à la main. */
function scPanneau(o){
  o=o||{};
  const mont=(e,v)=>{ if(e) e.classList.toggle('hidden', !v); };
  mont(el.atcBox, !!o.atc);
  mont(el.situationBox, !!o.situation);
  mont(el.pttBtn, !!o.ptt);
  mont(el.replayBtn, !!o.replay);
  mont(el.hintBtn, !!o.hint);
  mont(el.skipBtn, !!o.skip);
  if(el.transWrap){
    el.transWrap.classList.toggle('hidden', o.trans===false && o.suivant===false);
    el.transWrap.classList.toggle('ecoute', !o.trans);
  }
  if(el.scNoreco) el.scNoreco.classList.toggle('hidden', RECO_OK || !o.ptt);
}

/* Rang de l'échange courant parmi ceux qui appellent une réponse. */
function rangEchange(){
  let n=0;
  for(let i=0;i<=state.stepIndex && i<state.queue.length;i++){
    const s=state.queue[i];
    if(s && (s.motsCles || s.type==='choice' || s.type==='quiz')) n++;
  }
  return Math.max(1,n);
}
function isLastAnswerStep(){
  // vrai s'il ne reste plus aucune étape "à répondre" (tour, choix ou quiz) après l'index courant
  for(let i=state.stepIndex+1;i<state.queue.length;i++){
    const s=state.queue[i];
    if(s.type==='choice' || s.type==='quiz' || s.motsCles) return false;
  }
  return true;
}

/* Rendu d'une étape quiz (B4) : QCM à réponse unique, scoré 1 point. */
function renderQuiz(step){
  // Un quiz n'a ni micro ni transcription : seul « Suivant » reste utile.
  scPanneau({ atc:false, situation:false, ptt:false, trans:false, replay:false, hint:false, skip:false });
  el.consigne.innerHTML='';
  el.feedback.innerHTML='';
  el.hint.classList.add('hidden');
  el.scSrc.textContent='';
  el.stepLabel.textContent='Quiz '+(state.stepIndex+1)+' / '+state.queue.length;
  el.choiceBox.classList.remove('hidden');
  el.choiceQ.textContent = fillDisplay(step.question);
  el.choiceOpts.innerHTML='';
  el.nextBtn.disabled=true;
  el.nextBtn.innerHTML = (isLastAnswerStep() ? 'Voir le récap' : 'Question suivante') + ICONS.chevron;
  logRow('sys','Quiz : '+fillDisplay(step.question));
  let answered=false;
  const btns=[];
  step.options.forEach(opt=>{
    const b=document.createElement('button');
    b.className='opt'; b.type='button';
    b.textContent = opt.text;
    b.addEventListener('click', ()=>{
      if(answered) return; answered=true;
      btns.forEach(x=>x.disabled=true);
      // révèle : coche la bonne réponse, marque la sélection
      step.options.forEach((o,i)=>{ if(o.correct) btns[i].classList.add('good'); });
      if(!opt.correct) b.classList.add('bad');
      const good=!!opt.correct;
      state.results[state.stepIndex]=[{label:fillDisplay(step.question), found:good}];
      state.attendus[state.stepIndex] = fillDisplay(step.question||'');
      state.dits[state.stepIndex] = good ? '(bonne réponse)' : '(mauvaise réponse)';
      logRow('you','Réponse : '+opt.text+(good?' ✓':' ✗'));
      el.nextBtn.disabled=false;
    });
    btns.push(b); el.choiceOpts.appendChild(b);
  });
}

function renderChoice(step){
  /* Une décision se prend sur les seules options : ni micro, ni transcription, ni
     « Suivant » — c'est le choix lui-même qui fait avancer. */
  scPanneau({ atc:false, situation:false, ptt:false, trans:false, suivant:false,
              replay:false, hint:false, skip:false });
  el.consigne.innerHTML='';
  el.feedback.innerHTML='';
  el.hint.classList.add('hidden');
  el.scSrc.textContent='';
  el.stepLabel.textContent='Décision';
  el.choiceBox.classList.remove('hidden');
  el.choiceQ.textContent = step.question;
  el.choiceOpts.innerHTML='';
  step.options.forEach(opt=>{
    const b=document.createElement('button');
    b.className='opt'; b.type='button';
    b.innerHTML='<b>'+escapeHtml(opt.label)+'</b>'+escapeHtml(opt.desc);
    b.addEventListener('click', ()=> chooseBranch(step, opt));
    el.choiceOpts.appendChild(b);
  });
}
function chooseBranch(step, opt){
  logRow('sys','Décision : '+opt.label);
  // insérer les tours de la branche après le choix (finalisés : ATC aléatoire / AFIS / {STN})
  const rawInsert = opt.tours.slice();
  if(opt.loop){
    // touch-and-go : on repart pour un tour → on ré-enchaîne un circuit complet
    rawInsert.push(tourVentArriere(), tourNumeroATC(), tourBase(), tourFinale(), circuitChoiceStep());
  }
  const insert = rawInsert.map(finalizeStep);
  state.queue.splice(state.stepIndex+1, 0, ...insert);
  state.results.length = state.queue.length; // aligne (les nouveaux = undefined)
  state.stepIndex++;
  renderStep();
}


/* ================= RADIO COM (Scénarios) =================
   Même principe qu'en Navigation : on n'émet que sur la fréquence ACTIVE. Elle
   n'apparaît que sur les échanges qui portent une fréquence — aujourd'hui le
   scénario « Navigation / croisière ». Les autres n'ont pas de transfert. */
var scRadio={ act:null, stby:null, attendue:null };
// Escalade des réponses du contrôleur : elle repart à zéro à chaque échange.
var scEchecFreq=0, scEchecCode=0;
function scRadioManuelle(){ return rtSettings().radioManuelle!==false; }
function scFmt(f){ return f==null?'—':Number(f).toFixed(3); }
function scRadioSkin(){
  // Même poste que la Navigation : Becker, quel que soit l'avion.
  var d=['robin','BECKER'];
  ['scRadio','scXpdr'].forEach(function(id){
    var e=$(id); if(e) e.setAttribute('data-skin',d[0]);
  });
  var n=$('scRadioNom'); if(n) n.textContent=d[1];
}

/* ================= Transpondeur des Scénarios =================
   Même boîtier qu'en Navigation : quatre roues octales, mode, IDENT. Il n'apparaît
   que sur les exercices qui comportent un code (manuel DSNA p. 186-187). */
var scXpdr={ code:'7000', saisie:'7000', mode:2, ident:false, attendu:null };
var SC_XP_MODES=['STBY','ON','ALT'];
function scXpdrRoues(){
  var box=$('scXpdrRoues'); if(!box || box.dataset.pret) return;
  var h='';
  for(var i=0;i<4;i++)
    h+='<div class="xp-roue"><button type="button" data-scxp="'+i+'" data-d="1">&#9650;</button>'+
       '<span data-scxpv="'+i+'">0</span>'+
       '<button type="button" data-scxp="'+i+'" data-d="-1">&#9660;</button></div>';
  box.innerHTML=h; box.dataset.pret='1';
  box.querySelectorAll('[data-scxp]').forEach(function(b){
    b.addEventListener('click',function(){
      var c=scXpdr.saisie.split('');
      c[+b.dataset.scxp]=String((parseInt(c[+b.dataset.scxp],10)+(+b.dataset.d)+8)%8);
      scXpdr.saisie=c.join(''); scMajXpdr();
    });
  });
}
function scBonCode(){
  var s=currentStep();
  if(!s || !scRadioManuelle()) return true;
  if(s.xpdrReq && scXpdr.code!==s.xpdrReq) return false;
  if(s.identReq && !scXpdr.ident) return false;
  return true;
}
/* Pastille « à afficher » partagée par la radio et le transpondeur des Scénarios. */
function scCible(el, contenu){
  if(!el) return;
  if(!contenu){ el.classList.add('hidden'); el.textContent=''; return; }
  el.innerHTML='<span>'+escapeHtml(contenu[0])+'</span><b>'+escapeHtml(String(contenu[1]))+'</b>';
  el.classList.remove('hidden');
}
function scXpdrExecuter(){
  if(scXpdr.saisie===scXpdr.code){ scMajXpdr(); return; }
  var avant=scXpdr.code;
  scXpdr.code=scXpdr.saisie; scXpdr.ident=false;
  scMajXpdr();
  scReactionUrgence(scXpdr.code, avant);
}
/* Codes d'urgence composés pendant un exercice : mêmes procédures publiées qu'en
   Navigation (manuel p. 238 pour 7700, p. 246 pour 7600). */
function scReactionUrgence(code, avant){
  var s=currentStep(); if(!s) return;
  var stn=fillDisplay(s.station||'Le contrôle');
  var m=null;
  if(code==='7700')      m='{CALL}, '+stn+', Mayday Roger, transpondeur 7700.';
  else if(code==='7600'){ m='{CALL}, '+stn+', si vous me recevez, transpondeur ident.'; scAttend7600=true; }
  else if(avant==='7700'||avant==='7600'){
    logRow('sys','Code d\'urgence annulé — vous êtes revenu au code '+code+'.');
    scAttend7600=false; return;
  } else return;
  logRow('atc', fillDisplay(m)); speakATC(m, true);
}
var scAttend7600=false;
function scSuite7600(){
  if(!scAttend7600) return;
  scAttend7600=false;
  var s=currentStep(); if(!s) return;
  var m='{CALL}, '+fillDisplay(s.station||'Le contrôle')+', ident observé, vous êtes en panne '+
        'd\'émission, transpondeur 7600, accusez réception de tous mes messages par ident.';
  logRow('atc', fillDisplay(m)); speakATC(m, true);
}
function scMajXpdr(){
  var box=$('scXpdr'); if(!box) return;
  scXpdrRoues();
  var enAttente = scXpdr.saisie!==scXpdr.code;
  $('scXpdrCode').textContent=scXpdr.saisie;
  $('scXpdrCode').classList.toggle('brouillon', enAttente);
  for(var i=0;i<4;i++){
    var e=box.querySelector('[data-scxpv="'+i+'"]');
    if(e) e.textContent=scXpdr.saisie[i];
  }
  var et=$('scXpdrEtat');
  et.textContent = enAttente ? 'EXÉC ?' : (scXpdr.ident ? 'IDENT' : SC_XP_MODES[scXpdr.mode]);
  et.classList.toggle('on', !enAttente && (scXpdr.mode>0 || scXpdr.ident));
  $('scXpdrIdent').classList.toggle('actif', scXpdr.ident);
  $('scXpdrExec').classList.toggle('arme', enAttente);
  var s=currentStep(), a=$('scXpdrAide');
  var reste = scXpdr.attendu!=null && scXpdr.code!==scXpdr.attendu;
  $('scXpdrCode').classList.toggle('attendue', reste && !enAttente);
  $('scXpdrIdent').classList.toggle('attendu', !!(s&&s.identReq&&!scXpdr.ident));
  scCible($('scXpdrCible'), reste ? ['Code à afficher', scXpdr.attendu] : null);
  if(!a) return;
  if(enAttente){
    a.textContent='Code composé sur les roues — pressez EXÉC pour l\'activer.';
    a.classList.remove('alerte');
  } else if(s && s.xpdrReq && scXpdr.code!==s.xpdrReq){
    a.textContent='Le contrôleur ne vous voit pas au code assigné — affichez '+s.xpdrReq+' puis EXÉC.';
    a.classList.add('alerte');
  } else if(s && s.identReq && !scXpdr.ident){
    a.textContent='Pressez IDENT : c\'est la fonction d\'identification demandée.';
    a.classList.add('alerte');
  } else if(reste){
    a.textContent='Composez '+scXpdr.attendu+' sur les quatre roues, puis EXÉC.';
    a.classList.remove('alerte');
  } else { a.textContent=''; a.classList.remove('alerte'); }
}
function scMajRadio(){
  if(!$('scRadioAct')) return;
  $('scRadioAct').textContent=scFmt(scRadio.act);
  var st=$('scRadioStby'); st.textContent=scFmt(scRadio.stby);
  var pret = scRadio.attendue!=null && scRadio.stby!=null &&
             Math.abs(Number(scRadio.stby)-Number(scRadio.attendue))<0.0005;
  st.classList.toggle('attendue',pret);
  $('scRadioSwap').classList.toggle('pret',pret);
  var s=currentStep(), a=$('scRadioAide');
  var manque = s && s.freq && !scBonneFreq();
  scCible($('scRadioCible'), manque
    ? [fillDisplay(s.station||'Station')+' écoute sur', scFmt(s.freq)] : null);
  if(manque){
    a.textContent='Vous émettez sur '+scFmt(scRadio.act)+' — '+fillDisplay(s.station||'la station')+
      ' est sur '+scFmt(s.freq)+'. Affichez-la en standby puis permutez.';
    a.classList.add('alerte');
  } else { a.textContent=''; a.classList.remove('alerte'); }
  scMajEcouteAtis();          // se caler sur l'ATIS le lance, s'en écarter le coupe
  majEnTete();                // la fréquence affichée dans le bandeau suit le poste
}
function scBonneFreq(){
  var s=currentStep();
  if(!s || !s.freq || !scRadioManuelle()) return true;
  return scRadio.act!=null && Math.abs(Number(scRadio.act)-Number(s.freq))<0.0005;
}

/* ================= DIFFUSION ATIS EN BOUCLE (Scénarios) =================
   Un ATIS tourne sans interruption : on ne l'« appelle » pas, on se cale sur sa
   fréquence et on attend le passage qui nous intéresse. Il ne doit donc
   s'entendre QUE lorsque le poste affiche cette fréquence, et se taire dès qu'on
   se cale ailleurs — exactement comme dans le module Navigation. Le message
   partait auparavant dès l'affichage de l'étape, quelle que soit la fréquence
   réglée, et une seule fois. */
var scAtisBoucle=null;
function scArreterAtis(){
  if(!scAtisBoucle) return;
  scAtisBoucle.actif=false; clearTimeout(scAtisBoucle.t); scAtisBoucle=null;
  Voix.stop();
}
function scLancerAtis(texte){
  if(scAtisBoucle) return;                     // déjà en diffusion
  var b={actif:true,t:null}; scAtisBoucle=b;
  if(!window.speechSynthesis) return;
  function tour(){
    if(!b.actif || scAtisBoucle!==b) return;
    Voix.parler(fillSpeech(texte), {
      rate:state.voiceRate, pitch:1.0,
      onDebut:startRadioNoise,
      onFin:function(){
        stopRadioNoise();
        if(!b.actif || scAtisBoucle!==b) return;
        b.t=setTimeout(tour, 2600);            // pause entre deux diffusions
      }
    });
  }
  tour();
}
/* Appelée à chaque manipulation de la radio : c'est le calage sur la fréquence
   qui déclenche l'écoute, pas l'affichage de l'étape. */
VOIX_ARRETS.push(function(){ scArreterAtis(); });
function scMajEcouteAtis(){
  var s=currentStep();
  if(!s || !s.atisStep || !s.atc){ scArreterAtis(); return; }
  var reel = (state.difficulty==='reel');
  if(scBonneFreq()){
    if(!scAtisBoucle){
      /* Le texte n'apparaît qu'ICI, une fois le poste accordé : c'est le moment
         où l'on entend réellement la diffusion. En Réel, rien n'est écrit — on
         écoute, comme en vol. */
      if(el.atcStation) el.atcStation.textContent = stationLabel(s)+' : ';
      if(el.atcTxt) el.atcTxt.textContent = reel
        ? 'Diffusion en cours — elle repasse en boucle.'
        : fillDisplay(s.atc);
      logRow('atc', stationLabel(s)+(reel ? ' — (diffusion en boucle)' : ' — '+fillDisplay(s.atc)));
      scLancerAtis(s.atc);
      /* On a entendu l'ATIS : la lettre peut apparaître dans le bandeau. Avant
         l'écoute elle reste cachée — aller la chercher fait partie de l'exercice. */
      state.atisEcoute=true; majEnTete();
    }
  } else {
    scArreterAtis();
    /* Poste calé ailleurs : la fréquence ne porte rien. On le DIT, plutôt que de
       laisser le message précédent ou une zone vide. */
    if(el.atcStation) el.atcStation.textContent = '';
    if(el.atcTxt) el.atcTxt.textContent =
      "Rien sur cette fréquence — affichez "+(s.freq!=null?Number(s.freq).toFixed(3):"celle de l'ATIS")+
      " sur le poste pour écouter l'ATIS.";
  }
}
function scPoserStby(f){
  if(f==null) return;
  scRadio.stby=Math.min(136.975,Math.max(118,Math.round(Number(f)*1000)/1000));
  scMajRadio();
}
function scPermuter(){
  if(scRadio.stby==null) return;
  var t=scRadio.act; scRadio.act=scRadio.stby; scRadio.stby=t;
  if(scRadio.attendue!=null && Math.abs(Number(scRadio.act)-Number(scRadio.attendue))<0.0005)
    scRadio.attendue=null;
  scMajRadio();
}
/* Affiche la radio quand l'échange porte une fréquence, le transpondeur quand il
   porte un code — et la pile entière dès que l'un des deux est utile. */
function scRadioPourEtape(){
  var box=$('scRadio'), bx=$('scXpdr'), pile=$('scAvio');
  if(!box || !pile) return;
  scEchecFreq=0; scEchecCode=0;
  var s=currentStep();
  var com = !!(s && s.freq && scRadioManuelle());
  var xp  = !!(s && (s.xpdrAssign || s.xpdrReq || s.identReq) && scRadioManuelle());
  box.classList.toggle('hidden', !com);
  if(bx) bx.classList.toggle('hidden', !xp);
  pile.classList.toggle('hidden', !com && !xp);
  if(!com && !xp) return;
  scRadioSkin();
  if(com){
    if(scRadio.act==null) scRadio.act=Number(s.freq);     // première fréquence : déjà réglée
    scRadio.attendue = (Math.abs(Number(scRadio.act)-Number(s.freq))>=0.0005) ? Number(s.freq) : null;
    scMajRadio();
  }
  if(xp){
    if(s.xpdrAssign) scXpdr.attendu=s.xpdrAssign;
    if(scXpdr.attendu!=null && scXpdr.code===scXpdr.attendu) scXpdr.attendu=null;
    if(s.identReq) scXpdr.ident=false;
    scMajXpdr();
  }
}

/* Un scénario est « en cours » si le panneau d'échange est ouvert et qu'on n'est pas
   déjà sur le récapitulatif. Sur le récap, plus rien à perdre : pas de confirmation. */
function scenarioEnCours(){
  return state.scenarioIndex>=0
      && el.panel && !el.panel.classList.contains('hidden')
      && el.recap && el.recap.classList.contains('hidden');
}
const MSG_ABANDON='La progression de l’échange en cours sera perdue et le scénario repartira du début.';

/* --- PTT / transcription / validation --- */
// Étape 2 : PTT maintenu (souris + tactile) — maintenir enfoncé pour parler, relâcher pour arrêter.
/* Au relachement, on redonne l'ecoute : un ATIS diffuse en permanence, on le
   retrouve donc en repassant a la reception si le poste est reste sur sa frequence. */
bindPushToTalk(el.pttBtn,     ()=>{ if(RECO_OK && !listening) startListening(); },
                              ()=>{ if(listening) stopListening(); scMajEcouteAtis(); });
bindPushToTalk(el.reRecordBtn,()=>{ if(RECO_OK && !listening) startListening(); },
                              ()=>{ if(listening) stopListening(); scMajEcouteAtis(); });
el.replayBtn.addEventListener('click', ()=>{ const s=currentStep(); if(s && s.atc) speakATC(s.atc); });

/* --- Sortie de session, comme « Terminer le vol » en Navigation --- */
function scFermerSession(){
  scArreterAtis(); voixCouperTout();
  if(listening) stopListening();
  el.panel.classList.add('hidden');
  document.body.classList.remove('in-session','in-recap');
}
if(el.quitBtn) el.quitBtn.addEventListener('click', ()=>{
  if(!scenarioEnCours()) return scFermerSession();
  rtConfirm('La session en cours sera abandonnée et ses échanges ne seront pas comptés.',
            {title:'Terminer la session ?', ok:'Terminer'})
    .then(ok=>{ if(ok){ scFermerSession(); state.scenarioIndex=-1;
                        document.querySelectorAll('.sc-btn').forEach(b=>b.setAttribute('aria-current','false')); } });
});
/* « Passer » : on avance sans être noté, exactement comme en vol. L'échange
   compte alors comme non répondu dans le débriefing. */
if(el.skipBtn) el.skipBtn.addEventListener('click', ()=>{
  const s=currentStep(); if(!s) return;
  scArreterAtis();
  logRow('sys','Échange passé.');
  if(state.stepIndex < state.queue.length-1){ state.stepIndex++; renderStep(); }
  else showRecap();
});
/* Retour à la liste des scénarios depuis le débriefing. */
if(el.backBtn) el.backBtn.addEventListener('click', ()=>{
  el.recap.classList.add('hidden');
  document.body.classList.remove('in-session','in-recap');
  const g=$('scenarios'); if(g) g.scrollIntoView({behavior:'smooth',block:'nearest'});
});
/* Garde absente ici alors que son équivalent en Navigation l'a : hors session,
   currentStep() vaut undefined et le bouton levait une TypeError. */
el.hintBtn.addEventListener('click', ()=>{ const s=currentStep(); if(!s) return;
  el.hintTxt.textContent=fillDisplay(s.attendu||''); el.hint.classList.remove('hidden'); });
/* ---- Commandes de la radio (Scénarios) ---- */
if($('scRadioSwap')){
  $('scRadioSwap').addEventListener('click', scPermuter);
  document.querySelectorAll('[data-sctune]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const pas=parseFloat(b.dataset.sctune);
      const base=(scRadio.stby!=null)?Number(scRadio.stby):(scRadio.act!=null?Number(scRadio.act):118);
      scPoserStby(Math.round((base+pas)*1000)/1000);
      $('scRadioSaisie').value='';
    });
  });
  $('scRadioSaisie').addEventListener('input', ()=>{
    const n=parseFloat($('scRadioSaisie').value.replace(',','.').replace(/[^0-9.]/g,''));
    if(!isNaN(n) && n>=118 && n<=136.975) scPoserStby(n);
  });
  $('scRadioSaisie').addEventListener('keydown', e=>{
    if(e.key==='Enter'){ e.preventDefault(); scPermuter(); $('scRadioSaisie').value=''; }
  });
}
if($('scXpdrMode')){
  $('scXpdrExec').addEventListener('click', scXpdrExecuter);
  $('scXpdrMode').addEventListener('click', ()=>{ scXpdr.mode=(scXpdr.mode+1)%3; scXpdr.ident=false; scMajXpdr(); });
  $('scXpdrIdent').addEventListener('click', ()=>{ scXpdr.ident=true; scMajXpdr(); scSuite7600(); });
}
el.validerBtn.addEventListener('click', ()=>{
  // Émettre sur la mauvaise fréquence : personne ne répond, comme en vol.
  if(!scBonneFreq()){
    const s=currentStep();
    scEchecFreq++;
    if(scEchecFreq===1){
      logRow('sys','Aucune réponse — vous émettez sur '+scFmt(scRadio.act)+
                   ' alors que '+fillDisplay(s.station||'la station')+' écoute sur '+scFmt(s.freq)+'.');
    } else {
      /* Vous êtes encore sur la fréquence précédente : c'est donc le contrôleur que
         vous écoutez toujours qui vous rappelle — procédure d'interruption des
         communications (manuel p. 246) et renvoi en fréquence (p. 247). */
      const m='{CALL}, me recevez-vous ? Veillez '+fillDisplay(s.station||'la station')+' '+
              String(s.freq).replace('.',',')+', je répète '+String(s.freq).replace('.',',')+'.';
      logRow('atc', fillDisplay(m)); speakATC(m);
    }
    scMajRadio();
    return;
  }
  // Idem pour le transpondeur : sans le code assigné, le contrôleur ne vous identifie pas.
  if(!scBonCode()){
    const sx=currentStep();
    let m;
    if(sx.identReq) m='{CALL}, transpondeur ident.';                       // p. 187
    else {
      scEchecCode++;
      if(scEchecCode===1)      m='{CALL}, confirmez transpondeur '+sx.xpdrReq+'.';   // p. 187
      else if(scEchecCode===2) m='{CALL}, je ne reçois pas votre transpondeur.';     // p. 190
      else                     m='{CALL}, recyclez transpondeur, '+sx.xpdrReq+'.';   // p. 190
    }
    logRow('atc', fillDisplay(m)); speakATC(m);
    scMajXpdr();
    return;
  }
  evaluate(el.transText.value);
});
el.nextBtn.addEventListener('click', ()=>{
  if(state.stepIndex < state.queue.length-1){ state.stepIndex++; renderStep(); }
  else showRecap();
});
el.restartBtn.addEventListener('click', ()=>{
  const relance=()=> launchScenario(state.scenarioIndex);
  if(!scenarioEnCours()) return relance();          // déjà sur le récap : rien à perdre
  rtConfirm(MSG_ABANDON,{title:'Recommencer ce scénario ?',ok:'Recommencer'})
    .then(ok=>{ if(ok) relance(); });
});

// Permettre de taper directement (utile si pas de micro) : activer Valider dès qu'il y a du texte
el.transText.addEventListener('input', ()=>{ el.validerBtn.disabled = el.transText.value.trim().length===0; });

/* =========================================================================
   EXPLICATIONS D'ERREUR
   « manquant » ne dit ni quoi dire ni pourquoi. On produit ici, pour chaque
   élément non détecté, une phrase qui donne l'exemple concret attendu (avec
   les valeurs du scénario en cours : piste tirée au sort, QNH, indicatif…)
   et la raison de la règle. Les références de page renvoient au Manuel de
   phraséologie DSNA, 10ᵉ édition. Rien n'est inventé.
   ========================================================================= */
const AIDE_REF = {
  callsign:"Votre indicatif identifie votre appareil : sans lui, le contrôleur ne sait pas qui parle. Il se place en fin de message (p. 18).",
  station: "Nommez d'abord l'organisme appelé : il doit savoir que le message lui est destiné.",
  terrain: "Nommez le terrain concerné pour lever toute ambiguïté.",
  piste:   "Le numéro de piste se collationne mot pour mot : c'est un élément critique de sécurité.",
  qnh:     "Le QNH règle votre altimètre : il se collationne systématiquement.",
  alt:     "Annoncez l'altitude en pieds : elle situe votre appareil dans le plan vertical.",
  num:     "Le numéro dans le circuit vous situe par rapport aux autres appareils.",
  capdep:  "Le cap se transmet toujours sur trois chiffres (p. 17)."
};
/* Valeur réellement attendue à cet instant, pour donner un exemple utile
   plutôt qu'une formule générique. */
function exempleAttendu(mc){
  switch(mc.ref){
    case 'callsign': return state.call;
    case 'piste':    return 'piste '+state.rwy.id;
    case 'qnh':      return 'QNH '+state.meteo.qnh;
    case 'alt':      return state.altCruise+' pieds';
    case 'num':      return 'numéro '+state.numCircuit;
    case 'capdep':   return 'cap '+state.capDep;
    case 'terrain':  return state.activeAd ? state.activeAd.nom : '';
    default:         return (mc.variantes && mc.variantes[0]) || '';
  }
}
/* Certains mots-clés perdent leur `ref` en cours de route (finalizeStep résout
   ref:'station' en variantes concrètes). On retombe alors sur le libellé. */
const AIDE_LABEL = [
  [/station|organisme/i, AIDE_REF.station],
  [/indicatif/i,         AIDE_REF.callsign],
  [/piste/i,             AIDE_REF.piste],
  [/qnh/i,               AIDE_REF.qnh],
  [/altitude|pieds/i,    AIDE_REF.alt],
  [/terrain|a[ée]rodrome/i, AIDE_REF.terrain],
  [/vent arri[èe]re|base|finale|circuit/i,
   "Annoncez votre position dans le circuit : c'est ce qui permet au contrôleur de séquencer les appareils (p. 150-151)."],
  [/collationn|accus/i,
   "Un collationnement reprend les éléments de la clairance, il ne se résume pas à « reçu »."]
];
/* CE QUI A ÉTÉ ENTENDU À LA PLACE.
   Le retour disait seulement « Il fallait dire QNH 1015 » — sans jamais indiquer
   ce qu'on avait, soi, annoncé. Or c'est toute la différence entre une faute de
   phraséologie (on a oublié l'élément) et une valeur fausse ou mal transcrite
   (on l'a dit, mais autrement). Sans cette précision, l'élève relit sa phrase,
   y trouve le bon chiffre, et conclut que l'exercice se trompe.
   On ne montre le nombre entendu que s'il est PLAUSIBLE — même longueur que la
   valeur attendue : citer un « 26 » comme QNH manqué n'éclaire personne. */
function valeurEntendue(corrected, attendue){
  const cible=String(attendue||'').replace(/\D/g,'');
  if(!cible) return null;
  const vus=(digitCanon(corrected||'').match(/\d+/g)||[]);
  const proche=vus.find(v => v.length===cible.length && v!==cible);
  return proche || null;
}
function expliquerManque(mc, corrected){
  const ex=exempleAttendu(mc);
  let pourquoi=AIDE_REF[mc.ref]||'';
  if(!pourquoi){
    const m=AIDE_LABEL.find(p=>p[0].test(mc.label||''));
    if(m) pourquoi=m[1];
  }
  let t='';
  // Les variantes sont stockées normalisées (minuscules) : on remet la capitale
  // pour que l'exemple se lise comme une vraie phrase.
  if(ex) t+='Il fallait dire « '+ex.charAt(0).toUpperCase()+ex.slice(1)+' ». ';
  // Valeur chiffrée : on confronte à ce qui a réellement été compris.
  if(corrected && mc.ref && NUM_REF_VALUE[mc.ref]){
    const entendu=valeurEntendue(corrected, NUM_REF_VALUE[mc.ref]());
    if(entendu) t+='Le micro a compris « '+entendu+' » : soit la valeur annoncée '+
                   'n’était pas la bonne, soit elle a été mal transcrite — relisez la '+
                   'transcription avant de valider. ';
  }
  // Indicatif : la cause est presque toujours l'épellation, pas l'oubli.
  if(corrected && mc.ref==='callsign')
    t+='Rien dans la transcription ne ressemble à votre indicatif : épelez-le en '+
       'alphabet aéronautique (« '+phoneticCallsign(state.call)+' ») et vérifiez ce que '+
       'le micro a noté. ';
  return t+pourquoi;
}
/* Pièges explicitement corrigés par le manuel : ces formulations sont réservées
   au CONTRÔLEUR, un pilote qui les emploie commet une vraie faute — d'où une
   explication séparée, même si les mots-clés sont par ailleurs tous détectés. */
const PIEGES = [
  // `.{0,12}` absorbe les « au », « à l' », apostrophes et espaces que la
  // reconnaissance vocale intercale (« autorisé a l atterrissage »).
  { test:/autoris\w{0,3}.{0,12}d[ée]collage/,
    txt:"« Autorisé décollage » est une clairance : elle appartient au contrôleur. Le pilote collationne par « Piste {PISTE}, je décolle, {CALL} » (p. 59)." },
  { test:/autoris\w{0,3}.{0,12}atterrissage/,
    txt:"« Autorisé atterrissage » appartient au contrôleur. Le pilote collationne par « Piste {PISTE}, j'atterris, {CALL} » (p. 154)." }
];
function detecterPieges(corrected, results){
  const out=[];
  PIEGES.forEach(p=>{ if(p.test.test(corrected)) out.push(fillDisplay(p.txt)); });
  // ROGER ne remplace jamais un collationnement chiffré (p. 19-21).
  const chiffreManquant=(results||[]).some(r=>!r.found && /piste|qnh|altitude|cap|num/i.test(r.label));
  if(/\broger\b/.test(corrected) && chiffreManquant)
    out.push("« Roger » signifie seulement « message reçu ». Il ne remplace jamais un collationnement chiffré : reprenez la valeur elle-même (p. 19-21).");
  return out;
}
/* Rendu commun aux Exercices et à la Navigation. */
function rendreFeedback(box, step, results, corrected, cls){
  box.innerHTML='';
  results.forEach((r,i)=>{
    const mc=step.motsCles[i];
    const div=document.createElement('div');
    div.className=cls+' '+(r.found?'ok':'ko');
    let html='<span class="mk">'+(r.found?ICONS.check:ICONS.warn)+'</span><span>'+escapeHtml(r.label);
    if(!r.found){
      const why=expliquerManque(mc, corrected);
      html+=' — manquant';
      if(why) html+='<span class="fb-why">'+escapeHtml(why)+'</span>';
    }
    box.appendChild(div);
    div.innerHTML=html+'</span>';
  });
  const pieges=detecterPieges(corrected, results);
  pieges.forEach(t=>{
    const d=document.createElement('div');
    d.className='fb-piege';
    d.innerHTML='<span class="mk">'+ICONS.warn+'</span><span>'+escapeHtml(t)+'</span>';
    box.appendChild(d);
  });
  // Rien reconnu du tout : c'est le plus souvent le micro, pas la phraséologie.
  if(results.length && results.every(r=>!r.found)){
    const d=document.createElement('div');
    d.className='fb-piege';
    d.innerHTML='<span class="mk">'+ICONS.warn+'</span><span>'+
      escapeHtml('Aucun élément reconnu. Vérifiez que le micro vous capte bien, et parlez posément : la reconnaissance vocale peine sur les messages trop rapides.')+'</span>';
    box.appendChild(d);
  }
}

function evaluate(rawText){
  scArreterAtis();          // on transmet : on ne reste pas sur la fréquence ATIS
  const step=currentStep();
  if(!step || !step.motsCles) return;
  const corrected = fuzzyCorrect(rawText);      // normalisé + corrigé (section D2/D3)
  logRow('you', fillDisplay('{CALL}')+' — '+(rawText||'').trim());

  const results = step.motsCles.map(mc=>({ label:mc.label, found: mcFound(mc, corrected) }));
  state.results[state.stepIndex] = results;
  state.dits[state.stepIndex] = rawText || '';        // conservé pour la trace fine

  rendreFeedback(el.feedback, step, results, corrected, 'fb-item');
  const ok=results.filter(r=>r.found).length;
  logRow('sys','Éléments détectés : '+ok+' / '+results.length);
  el.nextBtn.disabled=false;
}

function refreshTexts(){
  if(state.scenarioIndex<0) return;
  const sc=SCENARIOS[state.scenarioIndex];
  const step=currentStep();
  if(!step || step.type==='choice' || step.type==='quiz') return;
  if(step.atc){
    el.atcStation.textContent=fillDisplay(step.station||sc.station);
    el.atcTxt.textContent=fillDisplay(step.atc);
  }
  if(step.situation) el.situationBox.textContent=fillDisplay(step.situation);
  if(!el.hint.classList.contains('hidden')) el.hintTxt.textContent=fillDisplay(step.attendu);
}

/* =========================================================================
   11) RÉCAP + HISTORIQUE (localStorage) + EXPORT
   ========================================================================= */
/* Taux de réussite formulé explicitement : « 69 % de réussite » plutôt qu'un
   pourcentage nu, qu'on peut confondre avec une autre grandeur. */
function tauxReussite(found,total){
  if(!total) return '';
  return Math.round(found/total*100)+' % de réussite';
}
function showRecap(){
  scArreterAtis();          // fin de session : plus rien ne doit parler
  if(listening) stopListening();
  const sc=SCENARIOS[state.scenarioIndex];
  // Score de CE scénario
  let totalFound=0, totalAll=0, num=0; const missed=[]; const lines=[];
  state.queue.forEach((step,idx)=>{
    const isQuiz = step.type==='quiz';
    if(!step.motsCles && !isQuiz) return;
    num++;
    const fallback = isQuiz ? [{label:(step.question||'Quiz'),found:false}]
                            : step.motsCles.map(mc=>({label:mc.label,found:false}));
    const res = state.results[idx] || fallback;
    const ok=res.filter(r=>r.found).length;
    totalFound+=ok; totalAll+=res.length;
    res.filter(r=>!r.found).forEach(r=>missed.push(r.label));
    lines.push((isQuiz?'Question ':'Échange ')+num+' : '+ok+' / '+res.length);
  });
  logRow('sys','━━ '+sc.titre+' : '+totalFound+' / '+totalAll+' ━━');



  // Récap normal
  el.panel.classList.add('hidden');
  el.recapList.innerHTML='';
  lines.forEach(t=>{ const li=document.createElement('li'); li.textContent=t; el.recapList.appendChild(li); });
  el.scoreNum.innerHTML = totalFound+' <small>/ '+totalAll+' éléments corrects — '
    +tauxReussite(totalFound,totalAll)+'</small>';
  /* Ce qui a manqué, en clair. Le récapitulatif ne donnait que des scores par
     échange : on savait qu'on avait raté, pas quoi réviser. */
  const rates=[...new Set(missed)];
  const bloc=$('scRecapManques');
  if(bloc){
    bloc.innerHTML = rates.length
      ? '<h4>À revoir</h4><p>'+rates.map(m=>escapeHtml(m)).join(' · ')+'</p>'
      : '<h4>Rien à revoir</h4><p>Tous les éléments attendus ont été dits.</p>';
  }
  el.recap.classList.remove('hidden');
  /* Le débriefing prend la place de la session : on quitte l'état « en session »
     sans pour autant réafficher le configurateur derrière lui. */
  document.body.classList.remove('in-session');
  document.body.classList.add('in-recap');
  window.scrollTo(0,0);
  /* La trace fine, au format des vols : un objet par échange, avec ce qui était
     attendu, ce qui a été dit, et les éléments manqués. C'est la seule chose qui
     permette de revoir une erreur précise plutôt qu'un score global. Les étapes
     sans phrase attendue (écoute pure de l'ATIS, choix) sont écartées : il n'y a
     rien à comparer. */
  const lignes = [];
  state.queue.forEach((step,idx)=>{
    if(step.atisStep) return;
    if(!step.motsCles && step.type!=='quiz') return;
    const r = state.results[idx];
    lignes.push({
      ph: step.type==='quiz' ? 'Question' : (step.ph || sc.titre),
      stn: step.stn || null, freq: step.freq != null ? step.freq : null,
      attendu: state.attendus[idx] || (step.attendu ? fillDisplay(step.attendu) : ''),
      dit: state.dits[idx] || '',
      manquants: (r||[]).filter(x=>!x.found).map(x=>x.label),
      repondu: !!r,
      ok: (r||[]).filter(x=>x.found).length, total: (r||[]).length
    });
  });
  const duree = state.debut ? Math.max(0, Math.round((Date.now()-state.debut)/1000)) : null;

  saveHistory({
    date:new Date().toISOString(), scenario:sc.titre, scIdx:state.scenarioIndex,
    terrain: state.activeAd ? state.activeAd.icao : '',
    piste: state.rwy.id, found:totalFound, total:totalAll,
    missed:[...new Set(missed)], mode:state.difficulty,
    duree: duree, lignes: lignes
  });

  if(window.RTSync && state.sync){
    RTSync.terminer(state.sync, {
      kind:'scenario', level:state.difficulty, exercise_key:sc.id,
      dep_icao: state.activeAd ? state.activeAd.icao : null,
      runway: state.rwy ? String(state.rwy.id) : null,
      score_ok: totalFound, score_total: totalAll
    }, lignes.map(l=>({
      phase:l.ph, station:l.stn, freq:l.freq,
      expected:l.attendu, said:l.dit, answered:l.repondu,
      missed:l.manquants, score_ok:l.ok, score_total:l.total
    })));
    state.sync = null;
  }
  state._lastRecapText = buildRecapText(sc, totalFound, totalAll, missed);
}

function buildRecapText(sc, found, total, missed){
  const d=new Date();
  return 'RadioTrainer — Récap\n'
    + 'Scénario : '+sc.titre+'\n'
    + 'Aérodrome : '+(state.activeAd?state.activeAd.icao+' '+state.activeAd.nom:'')+' · Piste '+state.rwy.id+'\n'
    + 'Date : '+d.toLocaleString('fr-FR')+'\n'
    + 'Score : '+found+' / '+total+' éléments corrects\n'
    + 'Éléments manqués : '+([...new Set(missed)].join(', ')||'aucun')+'\n'
    + '(Outil pédagogique — données fictives — à valider avec un instructeur)';
}
el.copyBtn.addEventListener('click', ()=>{
  const txt=state._lastRecapText||'';
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(()=>showToast('Récap copié dans le presse-papier'),
      ()=>showToast('Copie impossible'));
  }else showToast('Presse-papier indisponible');
});

const LS_KEY='radiotrainer_history_v2';
function loadHistory(){ try{ return JSON.parse(localStorage.getItem(LS_KEY))||[]; }catch(e){ return []; } }
function saveHistory(entry){
  if(window.rtJourActif) window.rtJourActif();   // journée de pratique effective
  const h=loadHistory(); h.unshift(entry);
  try{ localStorage.setItem(LS_KEY, JSON.stringify(h.slice(0,50))); }catch(e){}
  renderHistory();
}
/* Historique des sessions, au format de celui des vols : un pourcentage coloré par
   ligne, et le détail d'une session en tuiles avec ce qui a manqué — c'est la
   seule information qui fait progresser. */
function scPct(e){ return e.total ? Math.round(100*e.found/e.total) : 0; }
function scClassePct(p){ return p>=80 ? 'bon' : (p>=50 ? 'moy' : 'bas'); }
function scDateCourte(iso){
  const d=new Date(iso);
  return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})+' '
       + d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
function renderHistory(){
  renderBadges();
  const h=loadHistory(), box=el.historyPanel;
  if(!box) return;
  if(!h.length){ box.hidden=true; const d=$('scHistDetail'); if(d) d.classList.add('hidden'); return; }
  box.hidden=false;
  $('scHistCount').textContent=h.length;
  const p0=scPct(h[0]);
  $('scHistLast').textContent='Dernière : '+h[0].scenario+' · '+p0+' % · '+scDateCourte(h[0].date);
  el.historyBody.innerHTML = h.map((e,i)=>{
    const p=scPct(e);
    return '<button class="nh-row" type="button" data-sess="'+i+'">'
      + '<span class="nh-vol">'+escapeHtml(e.scenario)+'</span>'
      + '<span class="nh-meta">'+scDateCourte(e.date)+' · '+escapeHtml(e.terrain||'sans terrain')
      + (e.piste?(' / '+escapeHtml(e.piste)):'') + ' · '+(e.mode==='reel'?'Réel':'Débutant')+'</span>'
      + '<span class="nh-pct '+scClassePct(p)+'">'+p+' %</span></button>';
  }).join('');
  el.historyBody.querySelectorAll('[data-sess]').forEach(b=>{
    b.addEventListener('click', ()=> scOuvrirSession(parseInt(b.dataset.sess,10)));
  });
}
let scSessionVue=null;
function scOuvrirSession(i){
  const e=loadHistory()[i]; if(!e) return;
  scSessionVue=e;
  const p=scPct(e), g=scClassePct(p);
  $('scHistTitle').textContent=e.scenario;
  let h='<div class="nhd-stats">'
    + '<div class="nhd-tile g-'+g+'"><b>'+p+' <i>%</i></b><span>Éléments corrects</span></div>'
    + '<div class="nhd-tile"><b>'+e.found+' <i>/ '+e.total+'</i></b><span>Détail</span></div>'
    + '<div class="nhd-tile"><b>'+(e.mode==='reel'?'Réel':'Débutant')+'</b><span>Mode</span></div>'
    + '</div>'
    + '<div class="nhd-info"><span><b>Terrain</b>'+escapeHtml(e.terrain||'—')+'</span>'
    + '<span><b>Piste</b>'+escapeHtml(e.piste||'—')+'</span>'
    + '<span><b>Date</b>'+scDateCourte(e.date)+'</span></div>';
  if(e.missed && e.missed.length){
    h+='<div class="nav-hist-lignes"><div class="nhl ko"><div class="nhl-top">'
      +'<span class="nhl-ph">Éléments manqués</span></div><div class="nhl-dit">'
      + e.missed.map(m=>escapeHtml(m)).join(' · ')+'</div></div></div>';
  }
  $('scHistScore').innerHTML=h;
  el.historyPanel.hidden=true;
  $('scHistDetail').classList.remove('hidden');
  $('scHistDetail').scrollIntoView({behavior:'smooth',block:'nearest'});
}
if($('scHistHead')){
  $('scHistHead').addEventListener('click',function(){
    const b=el.historyBody, ouvert=!b.classList.contains('hidden');
    b.classList.toggle('hidden', ouvert);
    this.setAttribute('aria-expanded', ouvert?'false':'true');
  });
  $('scHistBack').addEventListener('click',function(){
    $('scHistDetail').classList.add('hidden'); renderHistory();
  });
  $('scHistRefaire').addEventListener('click',function(){
    if(!scSessionVue) return;
    const i=(typeof scSessionVue.scIdx==='number') ? scSessionVue.scIdx
          : SCENARIOS.findIndex(s=>s.titre===scSessionVue.scenario);
    if(i<0){ showToast('Ce scénario n\'existe plus.'); return; }
    /* On rétablit le décor de la session : sans son terrain, « Refaire » se contentait
       de renvoyer sur la page en réclamant un aérodrome. */
    if(scSessionVue.terrain){
      const a=AERODROMES.filter(x=>x.icao===scSessionVue.terrain)[0];
      if(a){ state.depAd=a; el.depInput.value=a.icao+' — '+a.nom;
             state.controlled={dep:!!a.ctrl, arr:state.controlled?state.controlled.arr:!!a.ctrl};
             majPastilleTerrain('dep'); }
    }
    if(scSessionVue.mode){ state.difficulty=scSessionVue.mode;
      if(el.difficultySelect) el.difficultySelect.value=scSessionVue.mode; }
    $('scHistDetail').classList.add('hidden');
    const lien=document.querySelector('.sidelink[data-page="exercices"]'); if(lien) lien.click();
    setTimeout(()=>launchScenario(i), 120);
  });
  $('scHistClear').addEventListener('click',function(){
    rtConfirm('Tout l\'historique des sessions sera effacé sur cet appareil.',
              {title:'Effacer l\'historique ?', ok:'Effacer'})
      .then(ok=>{ if(ok){ localStorage.removeItem(LS_KEY);
                          $('scHistDetail').classList.add('hidden'); renderHistory(); } });
  });
}

/* D1 : badges calculés à partir de l'historique localStorage. */
function computeBadges(h){
  const perfect = h.filter(e=>e.total>0 && e.found===e.total);
  const circuitPerfect = perfect.some(e=>/Tour de piste/i.test(e.scenario));
  const emergencyDone = h.some(e=>/Urgence/i.test(e.scenario));
  return [
    { ic:ICONS.takeoff, t:"Premier tour de piste réussi", d:"Un tour de piste sans faute.", earned:circuitPerfect },
    { ic:ICONS.target, t:"5 scénarios sans faute", d:"5 scénarios à 100 %.", earned:perfect.length>=5 },
    { ic:ICONS.bell, t:"Sang-froid", d:"Une urgence traitée.", earned:emergencyDone },
    { ic:ICONS.medal, t:"Vétéran", d:"20 sessions enregistrées.", earned:h.length>=20 }
  ].concat(badgesVol());
}
/* Objectifs liés à la Navigation. computeBadges ne regardait que l'historique des
   scénarios : quelqu'un qui ne fait que des vols n'aurait jamais rien débloqué. */
function badgesVol(){
  let V=[]; try{ V=JSON.parse(localStorage.getItem('rt-vols')||'[]'); }catch(e){}
  let jours=[]; try{ jours=JSON.parse(localStorage.getItem('rt-jours')||'[]'); }catch(e){}
  const parfait = V.some(e=>e.total>0 && e.ok===e.total);
  const longue  = V.some(e=>(e.lignes||[]).length>=25);
  const deroute = V.some(e=>/d[ée]routement|ferm/i.test(e.alea||''));
  const urgence = V.some(e=>/MAYDAY|PAN PAN/i.test(e.alea||''));
  // Série de jours consécutifs, même calcul que le tableau de bord.
  const vus={}; jours.forEach(d=>vus[d]=1);
  let serie=0, cur=new Date();
  const iso=d=>d.toISOString().slice(0,10);
  if(vus[iso(cur)]){ while(vus[iso(cur)]){ serie++; cur.setDate(cur.getDate()-1); } }
  return [
    { ic:ICONS.takeoff, t:"Premier vol", d:"Un vol mené jusqu'au bout.", earned:V.length>=1 },
    { ic:ICONS.cap,     t:"10 vols réalisés", d:"10 vols enregistrés ("+Math.min(V.length,10)+"/10).", earned:V.length>=10 },
    { ic:ICONS.target,  t:"Vol sans faute", d:"Un vol à 100 %.", earned:parfait },
    { ic:ICONS.chevron, t:"Longue navigation", d:"Un vol de 25 échanges ou plus.", earned:longue },
    { ic:ICONS.bell,    t:"Sang-froid en vol", d:"Une urgence gérée en navigation.", earned:urgence },
    { ic:ICONS.warn,    t:"Déroutement", d:"Un terrain fermé contourné.", earned:deroute },
    { ic:ICONS.medal,   t:"Régularité", d:"3 jours d'affilée ("+Math.min(serie,3)+"/3).", earned:serie>=3 }
  ];
}
/* Badges exposés au tableau de bord (autre bloc <script>, portée séparée). */
window.rtBadges=function(){ try{ return computeBadges(loadHistory()); }catch(e){ return []; } };
/* La progression vient d'arriver de la base (connexion, ou effacement) : on
   repeint l'historique des scénarios et les badges. Ni l'un ni l'autre ne sait
   d'où vient ce qu'il lit — c'est tout l'intérêt : le cache a changé, ils se
   contentent de le relire. */
window.addEventListener('rt:donnees', function(){
  try{ renderHistory(); }catch(e){}
});
/* Relance d'un scénario depuis l'accueil. */
window.rtRelancerScenario=function(idx, icao){
  if(typeof idx!=='number' || idx<0 || idx>=SCENARIOS.length) return false;
  var a=AERODROMES.filter(function(x){ return x.icao===icao; })[0];
  if(a){ state.depAd=a; el.depInput.value=a.icao+' — '+a.nom; }
  launchScenario(idx);
  return true;
};
/* =========================================================================
   Prise de test des scénarios, sur le modèle exact de RT_TEST (Navigation) et
   de RT_TEST_EPEL (Épellation).
   -------------------------------------------------------------------------
   Elle n'ajoute AUCUNE logique et ne crée AUCUN second chemin d'évaluation :
   `dire()` écrit dans le champ de transcription — celui que la reconnaissance
   vocale remplit déjà, et que l'on peut remplir au clavier quand il n'y a pas
   de micro (« Permettre de taper directement », plus bas) — puis clique le
   bouton « Valider ma réponse ». C'est le geste de l'élève, pas un raccourci.

   POURQUOI IL EN FALLAIT UNE
   Un test automatique ne parle pas dans un micro, et surtout il ne connaît pas
   la bonne réponse : le collationnement attendu est un gabarit (« {ADRM} {STN},
   {CALL}, … ») dont les valeurs ne sont tirées qu'au lancement du scénario.
   `attendu()` rend la phrase résolue, exactement telle que le moteur la
   comparera. Sans cela, on ne pouvait vérifier qu'une réponse FAUSSE — ce qui
   ne prouve rien sur la notation d'une réponse juste.
   ========================================================================= */
window.RT_TEST_SCN = {
  /* Le collationnement attendu à cette étape, placeholders résolus. */
  attendu:  function(){ var s=currentStep(); return s ? fillDisplay(s.attendu||'') : ''; },
  /* Déposer une réponse et la valider, par le chemin de l'élève. */
  dire:     function(txt){
              el.transText.value = String(txt||'');
              el.validerBtn.disabled = !el.transText.value.trim();
              el.validerBtn.click();
            },
  suivant:  function(){ if(!el.nextBtn.disabled) el.nextBtn.click(); },
  etape:    function(){ return state.stepIndex; },
  total:    function(){ return state.queue.length; },
  enCours:  function(){ return scenarioEnCours(); },
  /* Le tour courant est-il un tour où l'élève doit parler ? Les tours du
     contrôleur s'enchaînent avec « Suivant », sans rien à dire. */
  aRepondre:function(){ var s=currentStep(); return !!(s && s.attendu); }
};

function renderBadges(){
  const badges=computeBadges(loadHistory());
  el.badgeGrid.innerHTML='';
  badges.forEach(b=>{
    const div=document.createElement('div');
    div.className='badge '+(b.earned?'earned':'locked');
    div.innerHTML='<span class="ic">'+(b.earned?b.ic:ICONS.lock)+'</span><span><span class="t">'+escapeHtml(b.t)+'</span><br><span class="d">'+escapeHtml(b.d)+'</span></span>';
    el.badgeGrid.appendChild(div);
  });
}


/* =========================================================================
   13) INIT
   ========================================================================= */
state.call = el.call.value.trim();
renderHistory();
if(!RECO_OK){
  el.noreco.classList.remove('hidden');
  el.pttBtn.disabled=true;
  el.pttBtn.title="Reconnaissance vocale non supportée sur ce navigateur";
}
