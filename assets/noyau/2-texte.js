/* =============================================================================
   Albatros VFR — COMPARER CE QUI A ÉTÉ DIT À CE QUI ÉTAIT ATTENDU
   -----------------------------------------------------------------------------
   Normalisation, correction floue, formes voisines. C'est ce qui décide qu'un
   collationnement juste est compté juste — autrement dit la différence entre un
   exercice qui apprend quelque chose et un exercice qui décourage.

   Trois couches, dans cet ordre :
     · normalize()        minuscules, accents retirés, ponctuation en espaces ;
     · les tables SÛRES   recollage des mots coupés par la reconnaissance
                          (BIGRAMS) et corrections connues (MISHEARD), toutes
                          deux dans assets/donnees/reconnaissance.js ;
     · la correction floue distance d'édition contre un vocabulaire de
                          référence, plus la réduction au radical — parce que
                          « rappelez quittant la fréquence » ne doit pas être
                          compté faux quand la liste dit « quitte ».

   Lu par la Navigation, l'Épellation, l'inscription et la console d'admin :
   ces fonctions n'appartenaient déjà plus au moteur de scénarios.

   ┌─ CE FICHIER CHARGE AVANT LE MOTEUR ────────────────────────────────────┐
   │ Il déclare ses symboles au niveau racine d'un script classique : ils     │
   │ vivent donc dans la portée globale, visibles par tout ce qui suit — le   │
   │ moteur, la Navigation, l'Épellation, les Paramètres, l'inscription.      │
   │                                                                          │
   │ NE PAS l'envelopper dans une IIFE, et ne pas remplacer ses `function`    │
   │ par des `const` : au niveau racine, `function` et `var` deviennent des   │
   │ propriétés de window, `const` et `let` non. La console d'administration  │
   │ en dépend, et la rupture ne produirait aucune erreur.                    │
   └──────────────────────────────────────────────────────────────────────────┘

   Extrait d'index.html le 19/09/2026 (étape 2.2). Pas une ligne n'a été
   modifiée : les lignes ont été déplacées.

   Le « use strict » ci-dessous n'est pas un ajout : ce code tournait déjà en
   mode strict, sous celui du bloc du moteur. Sans lui, le sortir dans un
   fichier le ferait basculer en mode permissif — `this` changerait de valeur
   dans les appels simples, et une affectation à une variable non déclarée
   créerait un global au lieu de lever une erreur. Le remettre ici, c'est
   garder le comportement identique, pas le modifier.
   ========================================================================== */
"use strict";
/* =========================================================================
   3) NORMALISATION + CORRECTION FLOUE
   ========================================================================= */
function normalize(s){
  return (s||"").toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ').trim();
}

function joinBigrams(tokens){
  const out=[];
  for(let i=0;i<tokens.length;i++){
    const pair=tokens[i]+' '+(tokens[i+1]||'');
    if(tokens[i+1] && BIGRAMS[pair]){ out.push(BIGRAMS[pair]); i++; }
    else out.push(tokens[i]);
  }
  return out;
}
/* Canonise une phrase de RÉFÉRENCE exactement comme le texte reconnu (normalisation
   + recollage des groupes). Indispensable : sans cela « x ray » côté attendu ne
   correspondrait plus à « xray » côté transcription recollée. */
function canonPhrase(s){ return joinBigrams(normalize(s).split(' ').filter(Boolean)).join(' '); }

/* Vocabulaire de référence pour la correction floue (mots NATO + chiffres + aviation
   issus de la référence §3). Un token reconnu proche d'un de ces mots est corrigé. */
const REF_WORDS = [
  ...Object.values(NATO).map(w=>canonPhrase(w)), 'xray',
  'zero','unite','un','une','deux','trois','quatre','cinq','six','sept','huit','neuf',
  'dix','onze','douze','treize','quatorze','quinze','seize','vingt','trente','quarante',
  'cinquante','soixante','cent','cents','mille',
  'bonjour','demande','mise','route','approuvee','qnh','roulage','roulez','roulons',
  'point','attente','piste','voie','alpha','bravo','pret','prete','depart','decollage',
  'autorise','autorisee','alignez','alignement','alignons','vent','arriere','apres',
  'cap','montez','montons','pieds','contactez','contactons','contact','information',
  'integrez','integrons','integration','numero','finale','base','etape','atterrissage',
  'degagez','degageons','bretelle','sol','tour','touch','and','go','milles','sud','nord',
  'est','ouest','sans','par','pour','au','position','parking',
  // Mots de phraséologie du Manuel DSNA ajoutés pour éviter que le correcteur flou ne les
  // transforme en mot NATO/chiffre proche (ex. « quitte »→« quatre », « pan »→« par »).
  'decolle','decollons','quitte','quittant','frequence','tourne','tournez','droite','gauche',
  'toucher','touche','pan','roger','wilco','recu','degage','degagee','degagees','liberee',
  'assistance','premiere','aviation','generale','rappelle','rappelez','attends','aligne',
  'verticale','service','vol','vfr','transpondeur','trafic','vue','convergent','terrain',
  'transitez','transite','maintiens','maintenez','maintenons','meme',
  /* Mots courants absents du lexique : sans eux, une faute d'une lettre n'était pas
     rattrapée (« air » restait « air » au lieu de « aire d'attente »). */
  'aire','aires','bord','personne','personnes','navigation','local','locale',
  'entre','entrons','sortie','circuit','quittons','estime','estimons','indicatif',
  'altitude','niveau','descends','descendons','monte','montons','virage','tour',
  'travers','mi','longue','courte','dernier','avant','apres','prets','stationnement',
  'club','avion','machine','bimoteur','monomoteur','ulm','planeur','remorquage',
  /* Mots outils absents du lexique : le correcteur les transformait en un voisin
     à une lettre (« roule »→« route », « dans »→« sans »), ce qui faisait échouer
     un collationnement pourtant exact. */
  'roule','roules','dans','sans','avec','sur','sous','vers','depuis','jusqu',
  'entre','entrez','entrons','puis','entendu','copie','affirme','negatif',
  /* Mots trouvés par le balayage des phrases de référence : sans eux le correcteur
     les transformait en un voisin à une lettre — « vous »→« sous », « ident »→« cent »,
     « pas »→« par », « déroute »→« route », « attendez »→« attente ». */
  'vous','nous','ident','pas','visuel','visuelle','deroute','deroutement','deroutons',
  'attendez','attendons','recois','recoit','recevez','clair','fort','stationne',
  /* Sans ces formes, le correcteur ramenait « traversée » sur « travers » (déjà
     présent plus haut pour « mi-travers ») : les trois mots-clés du scénario
     « Traversée de piste » étaient introuvables SUR LEUR PROPRE PHRASE ATTENDUE.
     Même chose pour « transit », rabattu sur « transite ». */
  'transit','traverse','traversee','traverser','traversons','traversez'
];
/* ---- Mots français ORDINAIRES à ne jamais « corriger » ----
   Le correcteur flou ne connaît que le lexique radio : tout mot absent lui
   paraît fautif et il le remplace par le voisin le plus proche à une lettre.
   Mesuré sur des phrases réelles : « je suis » devenait « je puis », « bas »
   devenait « base », « plan » devenait « pan » (le PAN PAN de détresse).
   Aucun de ces mots n'appartient à la phraséologie, mais tous se disent en
   vol autour d'elle — et les réécrire falsifiait la transcription montrée à
   l'élève autant que la notation. On les déclare simplement CONNUS : ils
   traversent le correcteur intacts. */
const MOTS_COURANTS = [
  'suis','es','est','sommes','etes','sont','etais','etait','ete',
  'ai','as','avons','avez','ont','avait','aurai',
  'vais','vas','va','allons','allez','vont',
  'fais','fait','faisons','faites','font','faire','dire','voir','aller','venir','avoir','etre',
  'bas','haut','haute','bien','mal','tout','toute','tous','toutes',
  'plan','plans','peu','beaucoup','encore','deja','toujours','jamais',
  'ici','la','ou','quand','comment','pourquoi','donc','mais','car','si',
  'mon','ma','mes','ton','ta','tes','son','sa','ses','notre','nos','votre',
  'ce','cet','cette','ces','celui','celle','quel','quelle',
  'un','une','des','du','au','aux','et','ou','en','y',
  'moi','toi','lui','elle','ils','elles','on',
  'merci','pardon','oui','non','bonsoir','salut',
  'peux','peut','pouvons','veux','veut','voulons','dois','doit','devons',
  'prends','prend','prenons','mets','met','mettons','vois','voit','voyons',
  'arrive','arrivons','pars','part','partons','reste','restons','passe','passons',
  'gauche','droite','devant','derriere','dessus','dessous','proche','loin',
  'minute','minutes','heure','heures','seconde','secondes',
  'nord','sud','est','ouest','environ','presque','juste','seulement'
];
const REF_SET = new Set(REF_WORDS);
/* Déclaré APRÈS REF_SET, forcément : l'ensemble n'existe pas avant sa ligne. */
MOTS_COURANTS.forEach(function(w){ REF_SET.add(w); });
/* Noms propres protégés. Sans cela le correcteur flou transforme un nom de terrain
   ou d'organisme en mot du lexique à une lettre près : « Lille » devenait « mille »,
   et le collationnement « Lille Approche 120,275 » était compté faux alors qu'il
   était exact. On les ajoute au vocabulaire de référence dès qu'AERODROMES est
   disponible (plus bas dans ce même script). */
function protegerNomsPropres(){
  if(typeof AERODROMES==='undefined') return;
  AERODROMES.forEach(function(a){
    normalize(a.nom).split(' ').forEach(function(w){ if(w.length>=3) REF_SET.add(w); });
    REF_SET.add(normalize(a.icao));
  });
}
protegerNomsPropres();   // appelé ICI : REF_SET vient d'être créé (zone morte sinon)


function lev(a,b){
  const m=a.length, n=b.length;
  if(!m) return n; if(!n) return m;
  const d=new Array(n+1); for(let j=0;j<=n;j++) d[j]=j;
  for(let i=1;i<=m;i++){
    let prev=d[0]; d[0]=i;
    for(let j=1;j<=n;j++){
      const tmp=d[j];
      const cost=a[i-1]===b[j-1]?0:1;
      d[j]=Math.min(d[j]+1, d[j-1]+1, prev+cost);
      prev=tmp;
    }
  }
  return d[n];
}
function correctToken(w){
  if(MISHEARD[w]) return MISHEARD[w];
  if(w.length<3 || REF_SET.has(w)) return w;
  let best=w, bd=99;
  for(const r of REF_WORDS){
    if(Math.abs(r.length-w.length)>2) continue;
    const d=lev(w,r);
    if(d<bd){ bd=d; best=r; }
  }
  // C1 : mode « Réel » = tolérance plus stricte (seuils réduits).
  const strict = (typeof state!=='undefined' && state.difficulty==='reel');
  const thresh = strict ? (w.length<=4 ? 0 : 1) : (w.length<=4 ? 1 : 2);
  return bd<=thresh ? best : w;
}
/* Renvoie du texte déjà normalisé + corrigé, prêt pour la vérification. */
function fuzzyCorrect(text){
  return joinBigrams(normalize(text).split(' ').filter(Boolean)).map(correctToken).join(' ');
}

/* =========================================================================
   FORMES VOISINES — pourquoi « quittant » doit valoir « quitte »
   -------------------------------------------------------------------------
   Les listes de variantes sont écrites à une forme : « quitte la fréquence ».
   Or le contrôleur venait de dire « rappelez QUITTANT la fréquence », et le
   collationnement juste — « je rappelle quittant la fréquence » — était compté
   FAUX, faute d'avoir prévu le participe présent. Le cas se répète partout :
   « je maintiens » / « maintenons », « dégagée » / « dégagé », « rappelez » /
   « rappelle », « transite » / « transitons ».

   Écrire toutes les formes à la main est sans fin et sans garantie. On ramène
   donc chaque mot à son radical, DES DEUX CÔTÉS, avant de comparer : la
   terminaison cesse d'être discriminante. C'est volontairement grossier — il
   ne s'agit pas d'analyser le français, mais d'éviter qu'une désinence fasse
   échouer un collationnement exact.

   Ce que ça NE fait pas : rapprocher deux mots de sens différents. « roule »
   et « route », « base » et « bas », « décolle » et « décollage » gardent des
   radicaux distincts — c'est ce qui rend la mesure sûre.
   ========================================================================= */
const DESINENCES = /(ations|ation|ement|erons|eront|aient|antes|ante|ants|ant|ions|iez|ons|ez|es|er|e|s)$/;
/* Verbes irréguliers du vocabulaire radio : leur radical CHANGE selon la
   personne, et aucune règle de terminaison ne les rapproche. « maintenons » se
   réduit à « mainten », « maintiens » à « maintien » : sans cette table, un
   collationnement à la première personne du pluriel restait faux. */
const RADICAUX_IRREGULIERS = {
  mainten:'maintien', maintenon:'maintien', maintenir:'maintien',
  tenon:'tien', reten:'retien',
  venon:'vien', proven:'provien',
  pren:'prend', prenon:'prend',
  recevon:'recoi', recev:'recoi', recu:'recoi', recoiv:'recoi',
  sorton:'sort', parton:'part', descendon:'descend', montan:'mont'
};
function stemFR(w){
  if(!w || w.length<=4) return w;              // mots courts : on n'y touche pas
  var r = w.replace(DESINENCES,'');
  if(r.length<3) return w;                     // une coupe qui ne laisse rien ne vaut rien
  r = r.replace(/(.)\1$/,'$1');               // « rappell » et « rappel » doivent coïncider
  return RADICAUX_IRREGULIERS[r] || r;
}
/* Renvoie les JETONS, pas une chaîne : la comparaison doit se faire mot à mot.
   En comparant des sous-chaînes, le radical « decol » (de « je décolle ») se
   retrouvait à l'intérieur de « decollage » — et « après le décollage » validait
   le mot-clé « je décolle », qui est pourtant une tout autre phrase. */
function stemTokens(t){
  return String(t||'').split(' ').filter(Boolean).map(stemFR);
}
/* La suite `sous` apparaît-elle telle quelle dans `tout` ? (jetons contigus) */
function suiteDeJetons(tout, sous){
  if(!sous.length || sous.length>tout.length) return false;
  for(var i=0; i+sous.length<=tout.length; i++){
    var ok=true;
    for(var k=0;k<sous.length;k++) if(tout[i+k]!==sous[k]){ ok=false; break; }
    if(ok) return true;
  }
  return false;
}

/* Transcription AFFICHÉE. On montrait le brut de la reconnaissance : l'élève lisait
   « uniforme » ou « rogers » alors que la correction évaluait « uniform »/« roger »,
   et croyait à une faute de sa part. On applique donc les tables SÛRES (recollage
   des groupes + corrections connues), mais PAS la correction floue par distance :
   afficher une substitution approximative comme si elle avait été prononcée
   induirait en erreur. Un mot inchangé garde sa casse et ses accents d'origine. */
function lissageTranscription(txt){
  const bruts = (txt||'').trim().split(/\s+/).filter(Boolean);
  if(!bruts.length) return txt||'';
  const norm = bruts.map(w => normalize(w));
  const out = [];
  for(let i=0;i<bruts.length;i++){
    const paire = norm[i]+' '+(norm[i+1]||'');
    if(norm[i+1] && BIGRAMS[paire]){ out.push(BIGRAMS[paire]); i++; continue; }
    out.push(MISHEARD[norm[i]] || bruts[i]);
  }
  return out.join(' ');
}

