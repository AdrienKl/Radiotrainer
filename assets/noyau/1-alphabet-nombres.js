/* =============================================================================
   Albatros VFR — L'ALPHABET OACI ET LA FAÇON DE DIRE LES NOMBRES
   -----------------------------------------------------------------------------
   Comment une lettre et un nombre se PRONONCENT à la radio. Rien d'autre : ni
   interface, ni état, ni scénario.

   LE PIÈGE QUI A COÛTÉ TROIS FAUTES D'UN COUP
   La phraséologie ne lit pas tous les nombres de la même façon, et le moteur
   les épelait tous chiffre par chiffre. On entendait « unité cinq nœuds » pour
   15 kt, « trois cinq zéro zéro pieds » pour 3 500 ft et « numéro unité » pour
   un numéro d'ordre — trois fautes que personne ne commet en vol. D'où les
   tables d'unités et le choix cardinal / épelé selon le mot qui précède.

   `sansAccent` vit ici, et pas dans 2-texte.js : `motAvant`, trois lignes plus
   bas, l'appelle. Les séparer aurait créé une dépendance à rebours entre deux
   fichiers du noyau, pour rien.

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
   1) PHONÉTIQUE OACI + CHIFFRES (réf. brief §2 et §3.1)
   ========================================================================= */
const NATO = {
  A:"Alpha", B:"Bravo", C:"Charlie", D:"Delta", E:"Echo", F:"Foxtrot",
  G:"Golf", H:"Hotel", I:"India", J:"Juliett", K:"Kilo", L:"Lima",
  M:"Mike", N:"November", O:"Oscar", P:"Papa", Q:"Quebec", R:"Romeo",
  S:"Sierra", T:"Tango", U:"Uniform", V:"Victor", W:"Whiskey",
  X:"X-ray", Y:"Yankee", Z:"Zulu"
};
function phoneticCallsign(callsign){
  return (callsign||"").replace(/-/g,'').toUpperCase().split('')
    .map(l => NATO[l] || l).join(' ');
}
const DIGIT_WORDS = {'0':'zéro','1':'unité','2':'deux','3':'trois','4':'quatre',
                     '5':'cinq','6':'six','7':'sept','8':'huit','9':'neuf'};
function epelerChiffres(s){
  return String(s).split('').map(function(d){ return DIGIT_WORDS[d]!==undefined?DIGIT_WORDS[d]:d; }).join(' ');
}

/* =========================================================================
   COMMENT SE DIT UN NOMBRE
   -------------------------------------------------------------------------
   La phraséologie ne lit PAS tous les nombres de la même façon, et le moteur
   les épelait tous chiffre par chiffre. On entendait donc « unité cinq nœuds »
   pour 15 kt, « trois cinq zéro zéro pieds » pour 3 500 ft et « numéro unité »
   pour le numéro d'ordre à l'atterrissage — trois fautes que personne ne
   commet en vol.

   La règle réelle (manuel DSNA § nombres, et usage courant) :
     - CHIFFRE PAR CHIFFRE : ce qui est un CODE et non une quantité — fréquence,
       QNH, cap, numéro de piste, code transpondeur, niveau de vol, heure ;
     - NOMBRE ENTIER : ce qui est une QUANTITÉ mesurée — altitude en pieds,
       force du vent, visibilité, température, nombre de personnes, numéro
       d'ordre.
   On tranche sur le contexte immédiat : l'unité qui SUIT le nombre d'abord,
   le mot qui le PRÉCÈDE ensuite. Les deux tables ci-dessous sont la seule
   chose à compléter si une tournure manque.
   ========================================================================= */

/* Unités de quantité : le nombre qui les précède se dit en toutes lettres. */
const UNITES_CARDINALES = {
  pied:'m', pieds:'m', ft:'m',
  noeud:'m', noeuds:'m', kt:'m', kts:'m',
  metre:'m', metres:'m', kilometre:'m', kilometres:'m', km:'m',
  mille:'m', milles:'m', nautique:'m', nautiques:'m', nm:'m',
  litre:'m', litres:'m',
  /* PAS de « degré » ici : une direction de vent et un cap s'épellent chiffre par
     chiffre (« deux quatre zéro degrés »). La température, elle, passe par
     AVANT_CARDINAL (« température », « point de rosée », « moins »). */
  personne:'f', personnes:'f', passager:'m', passagers:'m', pax:'f',
  heure:'f', heures:'f', minute:'f', minutes:'f', seconde:'f', secondes:'f',
  tonne:'f', tonnes:'f'
};
/* Mots qui, PLACÉS AVANT, imposent le nombre entier. « numéro un », jamais
   « numéro unité » ; « température moins trois », jamais « moins trois ». */
const AVANT_CARDINAL = { numero:1, numeros:1, temperature:1, rosee:1,
                         moins:1, plus:1, visibilite:1, environ:1, estime:1,
  /* Type d'appareil : « Cessna cent soixante-douze », pas « Cessna unité sept deux ».
     « cap » est volontairement ABSENT de cette liste : c'est un cap, pas un CAP 10. */
                         cessna:1, robin:1, piper:1, socata:1, diamond:1, cirrus:1,
                         tecnam:1, mooney:1, beechcraft:1, grumman:1, aquila:1,
                         pitts:1, extra:1, jodel:1, sling:1, elixir:1, bristell:1,
                         dr:1, pa:1, tb:1, da:1 };
/* Mots qui, placés avant, imposent l'épellation — même si une unité suit. */
const AVANT_EPELE = { qnh:1, qfe:1, piste:1, cap:1, caps:1, transpondeur:1, squawk:1,
                      code:1, niveau:1, frequence:1, information:1, atis:1, rvr:1,
                      contactez:1, affichez:1, affiche:1 };

function sansAccent(s){
  /* Les LIGATURES ne se décomposent pas en NFD : « nœuds » restait « nœuds »,
     et la lecture du mot s'arrêtait sur le œ — l'unité lue valait « n », absente
     de la table, si bien que la force du vent repartait chiffre par chiffre :
     « unité cinq nœuds ». Or c'est la graphie employée partout dans l'application.
     On les déplie donc explicitement, avant la normalisation. */
  return String(s).toLowerCase()
    .replace(/\u0153/g,'oe').replace(/\u00e6/g,'ae')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
/* Dernier mot avant le nombre, et premier mot après : c'est tout ce qui sert. */
function motAvant(gauche){
  var m = sansAccent(gauche).match(/([a-z]+)[^a-z0-9]*$/);
  return m ? m[1] : '';
}
function motApres(droite){
  var m = sansAccent(droite).match(/^[^a-z0-9]*([a-z]+)/);
  return m ? m[1] : '';
}
/* Unité de quantité qui suit immédiatement le nombre, ou null. */
function uniteApres(droite){
  var w = motApres(droite);
  return UNITES_CARDINALES[w] ? w : null;
}
function nombreCardinalIci(gauche, droite){
  var av = motAvant(gauche);
  if(AVANT_EPELE[av]) return false;          // « piste 26 », « cap 270 », « QNH 1015 »
  if(uniteApres(droite)) return true;        // « 3500 pieds », « 15 nœuds »
  if(AVANT_CARDINAL[av]) return true;        // « numéro 1 », « température 18 »
  return false;                              // par défaut : c'est un code, on épelle
}
/* Nombre en toutes lettres, accordé si l'unité qui suit est féminine
   (« une heure », « une personne » — mais « un pied »). */
function cardinalParle(num, unite){
  var n = parseInt(num,10);
  if(isNaN(n)) return epelerChiffres(num);
  if(n===0) return 'zéro';
  var mots = frenchCardinal(n);
  if(n===1 && unite && UNITES_CARDINALES[unite]==='f') mots = 'une';
  return mots;
}

function spokenDigits(text){
  /* Séparateur décimal d'une FRÉQUENCE : il se dit « décimale » (« 120 décimale 75 »).
     Le contrôleur le passait sous silence, ce qui donnait « cent vingt sept cinq ».
     On ne cible que les nombres à partie entière de 3 chiffres, seule forme décimale
     réellement énoncée ici (108,000 à 136,975) : une fréquence s'épelle toujours
     chiffre par chiffre, des deux côtés de la décimale. */
  var t = String(text==null?'':text);
  t = t.replace(/(\d{3})[.,](\d{1,3})/g, function(_,ent,dec){
        return epelerChiffres(ent)+' décimale '+epelerChiffres(dec); });
  // Toute autre virgule décimale : on sépare, chaque moitié est traitée seule.
  t = t.replace(/(\d)[.,](\d)/g, '$1 $2');
  // Chaque nombre restant : le CONTEXTE décide de la forme.
  t = t.replace(/\d+/g, function(num, pos, tout){
        var droite = tout.slice(pos+num.length);
        return nombreCardinalIci(tout.slice(0,pos), droite)
               ? cardinalParle(num, uniteApres(droite))
               : epelerChiffres(num); });
  return t.replace(/\s{2,}/g,' ').trim();
}

/* ---- Prononciation des mots de l'alphabet OACI par une voix FRANÇAISE ----
   La voix lit du français : « Echo » lui donne « écho » (é-ko) alors que le mot
   se prononce « ÈK-o ». On ne corrige QUE ce que la voix rate réellement — les
   autres mots (Bravo, Charlie, Quebec, Zulu…) sortent déjà juste. Cette table
   n'agit que sur la PAROLE : le texte affiché et la notation gardent « Echo ». */
const PRONONCIATION_RADIO = { 'echo':'èkko' };
const RE_PRONONCIATION = new RegExp('\\b('+Object.keys(PRONONCIATION_RADIO).join('|')+')\\b','gi');
function prononciationRadio(t){
  return String(t==null?'':t).replace(RE_PRONONCIATION, function(m){
    return PRONONCIATION_RADIO[sansAccent(m)] || m;
  });
}

/* Cardinal français approximatif (0..1099) — sert uniquement à générer des
   variantes de reconnaissance, jamais affiché. */
function frenchCardinal(n){
  n = parseInt(n,10); if(isNaN(n)) return "";
  if(n===0) return "zero";
  const u=['','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix',
           'onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
  const t=['','','vingt','trente','quarante','cinquante','soixante','soixante','quatre-vingt','quatre-vingt'];
  function below100(x){
    if(x<20) return u[x];
    const ten=Math.floor(x/10), one=x%10;
    if(ten===7||ten===9){ const base=ten===7?'soixante':'quatre-vingt'; return base+'-'+u[10+one]; }
    let s=t[ten];
    if(one===1 && ten!==8) s+='-et-un';
    else if(one>0) s+='-'+u[one];
    if(ten===8 && one===0) s+='s';
    return s;
  }
  function below1000(x){
    const h=Math.floor(x/100), r=x%100; let s='';
    if(h>0){ s += (h===1?'cent':u[h]+' cent'); if(r===0 && h>1) s+='s'; }
    if(r>0) s += (s?' ':'')+below100(r);
    return s;
  }
  const th=Math.floor(n/1000), r=n%1000; let s='';
  if(th>0) s += (th===1?'mille':below1000(th)+' mille');
  if(r>0) s += (s?' ':'')+below1000(r);
  return s;
}

