/* =============================================================================
   AVIERO — Ce que la reconnaissance vocale entend de travers
   -----------------------------------------------------------------------------
   Deux tables, toutes deux relevées À L'USAGE et non déduites : ce ne sont pas
   des règles de français, ce sont des constats sur ce que Chrome renvoie quand
   quelqu'un parle dans un micro.

   BIGRAMS — les mots que la reconnaissance COUPE en deux. « X-ray » ressort en
   « x ray », « Foxtrot » en « fox trot », « Zulu » en « zou lou ». On les
   recolle avant toute comparaison, sinon aucun jeton isolé ne correspond.

   MISHEARD — les mots qu'elle REMPLACE par un mot français courant. Les clés
   sont déjà normalisées (minuscules, sans accents) parce que la comparaison se
   fait après normalize().

   Ces tables sont lues par le moteur de scénarios ET par l'épellation : elles
   n'appartenaient déjà à aucun des deux. Les corriger améliore les deux d'un
   coup — et se tromper ici fait compter fausse une réponse juste, ce qui est la
   pire chose qu'un exercice puisse faire.

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
/* Groupes de DEUX mots à recoller avant la correction par token.
   normalize() transforme « X-ray » en « x ray » : aucun token isolé ne peut alors
   correspondre. Et la reconnaissance découpe souvent les mots de l'alphabet OACI
   (« fox trot », « zou lou », « uni forme »). On les réunit d'abord. */
const BIGRAMS = {
  'x ray':'xray', 'ix ray':'xray', 'iks ray':'xray', 'x rai':'xray',
  'fox trot':'foxtrot', 'fox trotte':'foxtrot', 'foxe trot':'foxtrot',
  'zou lou':'zulu', 'zoo lou':'zulu',
  'uni forme':'uniform', 'uni form':'uniform',
  'no vembre':'november', 'no vember':'november',
  'si erra':'sierra', 'si era':'sierra',
  'yan kee':'yankee', 'yan ki':'yankee',
  'que bec':'quebec', 'ke bec':'quebec',
  'ju liette':'juliett', 'ju liet':'juliett',
  'in dia':'india',
  'char lie':'charlie',
  /* Cas relevés à l'usage : Chrome rend « charlie » par des mots français courants
     dès qu'il est prononcé vite entre deux autres lettres (« fox charlie delta »
     ressortait « fox je serai delta »).
     COMPROMIS ASSUMÉ : la table est sans contexte, donc « je serai en finale »
     devient « charlie en finale ». Sans conséquence sur la notation — le mot-clé
     « finale » reste trouvé — et le futur « je serai » n'appartient pas à la
     phraséologie (le manuel dit « en finale », « en vent arrière »). À revoir si
     un faux positif apparaît sur un indicatif contenant Charlie. */
  'je serai':'charlie', 'je serais':'charlie', 'j ai serai':'charlie',
  'char li':'charlie', 'shar lie':'charlie',
  'o scar':'oscar',
  'vent arriere':'vent arriere',
  /* ---- Relevés à l'usage, septembre 2026 ---- */
  /* Romeo ressort en deux mots français courants. */
  'rome au':'romeo', 'rome o':'romeo', 'rome eau':'romeo', 'romee o':'romeo',
  /* « vent arrière » est tantôt collé, tantôt mal coupé. */
  'vent ariere':'vent arriere', 'van arriere':'vent arriere', 'vent arier':'vent arriere',
  'vente arriere':'vent arriere',
  /* VFR épelé lettre par lettre : « V F R » arrive en trois jetons. */
  'v f':'vfr', 've f':'vfr',
  /* QNH épelé : « Q N H ». */
  'q n':'qnh', 'qu n':'qnh', 'cu n':'qnh', 'ku n':'qnh',
  /* Autres découpes de l'alphabet OACI observées. */
  'del ta':'delta', 'vic tor':'victor', 'yan ke':'yankee', 'no vembre':'november',
  'mi ke':'mike', 'ki lo':'kilo', 'li ma':'lima', 'pa pa':'papa',
  'tan go':'tango', 'gol f':'golf', 'ho tel':'hotel', 'al pha':'alpha',
  'bra vo':'bravo', 'si erra':'sierra', 'whis key':'whiskey', 'ou isky':'whiskey',
  /* Noms de terrains recollés avec l'organisme (« Nice Tour » → « nitou »). */
  'ni ce':'nice', 'mari gnane':'marignane', 'meri gnac':'merignac'
};

/* Erreurs de transcription fréquentes (section D3) : correspondances connues du moteur
   de reconnaissance vocale FR, corrigées en priorité (clés déjà normalisées, sans accents). */
const MISHEARD = {
  alfa:'alpha', alfat:'alpha', alpa:'alpha',
  bravot:'bravo', bravos:'bravo',
  charly:'charlie', charli:'charlie', charlee:'charlie',
  delt:'delta', deltat:'delta',
  ekko:'echo', echos:'echo',
  foxtrott:'foxtrot', fox:'foxtrot', foxtrote:'foxtrot',
  golfe:'golf',
  hotelle:'hotel', hotele:'hotel',
  juliet:'juliett', juliette:'juliett',
  kilos:'kilo',
  limat:'lima',
  maik:'mike', maike:'mike',
  novembre:'november',
  oskar:'oscar', oscars:'oscar',
  papat:'papa',
  kebec:'quebec', quebeck:'quebec',
  romeos:'romeo',
  siera:'sierra', sierat:'sierra',
  tangot:'tango', tangos:'tango',
  uniforme:'uniform',
  victort:'victor',
  whisky:'whiskey', wiski:'whiskey', wisky:'whiskey',
  yankie:'yankee', yanki:'yankee',
  zoulou:'zulu', zoulu:'zulu',
  // aviation / chiffres
  roulaje:'roulage', decolaje:'decollage', aterrissage:'atterrissage',
  kunh:'qnh', quenn:'qnh', cunh:'qnh', kelnh:'qnh',
  numeros:'numero', pistes:'piste',
  /* « unité » N'EST PAS une erreur : c'est la prononciation officielle du chiffre 1.
     On la ramenait ici sur « un », si bien que la transcription affichait « un »
     à quelqu'un qui avait dit « unité » — on lui reprochait une faute qu'il
     n'avait pas commise. La correspondance chiffrée est déjà assurée ailleurs,
     par WORD2DIGIT (unite → 1) et par numVariants(), qui produit les deux formes.
     unite:'un',  ← retiré volontairement, ne pas remettre. */

  /* ---- Alphabet aéronautique : mots français produits par la reconnaissance ----
     Chrome transcrit en français courant ; il rend donc l'alphabet OACI par des mots
     ordinaires parfois très éloignés (« matelas » pour Sierra). La distance de
     Levenshtein ne peut pas rattraper ces cas : il faut une table explicite. */
  alfa:'alpha', alpah:'alpha', alfaa:'alpha', alphat:'alpha',
  bravos:'bravo', brava:'bravo', bravau:'bravo',
  charlie:'charlie', charlot:'charlie', charlies:'charlie', chali:'charlie',
  deltas:'delta', delt:'delta',
  ekot:'echo', ekos:'echo', ecot:'echo', ecco:'echo', eko:'echo',
  fokstrot:'foxtrot', foxtro:'foxtrot', foxtrotte:'foxtrot', fokstro:'foxtrot',
  gaulf:'golf', gulf:'golf', golfes:'golf',
  hotels:'hotel', otel:'hotel', hottel:'hotel',
  indias:'india', indya:'india', indien:'india', indiat:'india', indiana:'india',
  julliet:'juliett', juliete:'juliett', juliets:'juliett', julia:'juliett',
  quilo:'kilo', kilot:'kilo',
  limas:'lima', lyma:'lima', limaa:'lima',
  maique:'mike', mick:'mike', micke:'mike', maick:'mike', mik:'mike',
  novembres:'november', novanbre:'november', novembe:'november',
  oskart:'oscar', oscart:'oscar', oskars:'oscar',
  papas:'papa', papate:'papa',
  quebecq:'quebec', kebek:'quebec', quebecs:'quebec',
  romeot:'romeo', romeos:'romeo', romeau:'romeo',
  // Sierra : cas signalé par l'usage — Chrome rend souvent des mots sans rapport.
  matelas:'sierra', ciera:'sierra', cierra:'sierra', sierras:'sierra',
  sierrat:'sierra', siarra:'sierra', sierra:'sierra',
  tangau:'tango', tangoo:'tango',
  uniformes:'uniform', unifor:'uniform', uniformt:'uniform',
  victeur:'victor', victors:'victor', victo:'victor',
  ouisky:'whiskey', ouiski:'whiskey', whiskeys:'whiskey', whiskys:'whiskey',
  ixray:'xray', iksray:'xray', xrai:'xray', exray:'xray',
  yankees:'yankee', yankey:'yankee', yanke:'yankee', yankis:'yankee',
  zoulous:'zulu', zulou:'zulu', zoulo:'zulu',
  // « roger » s'écrit sans S ; la reconnaissance ajoute volontiers le pluriel.
  rogers:'roger', rogeur:'roger', rogez:'roger',
  wilcox:'wilco', wilcau:'wilco',

  /* ================= RELEVÉS À L'USAGE — septembre 2026 =================
     Chacune de ces entrées vient d'un vol réel où la reconnaissance a rendu un
     mot français ordinaire à la place du terme aéronautique. Aucune n'est
     devinée : ce sont des transcriptions observées. */

  // VFR — rendu « VF » neuf fois sur dix, la dernière lettre tombe.
  vf:'vfr', vfer:'vfr', vefer:'vfr', vefaire:'vfr', veffe:'vfr', vff:'vfr',
  'vefr':'vfr', veff:'vfr',

  // QNH — la suite Q-N-H n'a aucun équivalent français, d'où des sorties très libres.
  canache:'qnh', kanache:'qnh', khanh:'qnh', canh:'qnh', quenach:'qnh',
  quenache:'qnh', qn:'qnh', cane:'qnh', kane:'qnh', queneche:'qnh', kunach:'qnh',

  // Romeo — « Rome au », « Rome », « Roméo » avec accent perdu.
  rome:'romeo', romeaux:'romeo', romo:'romeo', romio:'romeo',

  // X-ray — « extrait » revient constamment ; « Extra » est écarté (c'est un avion).
  extrait:'xray', extraits:'xray', exrait:'xray', ekstrait:'xray', extret:'xray',
  ixerai:'xray', ixere:'xray',

  // Vent arrière collé en un seul mot — la valeur porte l'espace, elle se recolle
  // dans la chaîne comparée sans rien casser.
  ventariere:'vent arriere', ventarriere:'vent arriere', ventarier:'vent arriere',
  ventarrier:'vent arriere', vantarriere:'vent arriere',

  // Noms de terrains fondus avec l'organisme appelé.
  nitou:'nice tour', nitour:'nice tour', nistou:'nice tour', nisstour:'nice tour',
  nicetour:'nice tour', parisstour:'paris tour', paritour:'paris tour',
  lyontour:'lyon tour', toulousetour:'toulouse tour',

  /* ---- Alphabet OACI : complément du balayage lettre par lettre ---- */
  alpaga:'alpha',
  bravau:'bravo',
  charlene:'charlie', charlize:'charlie',
  eco:'echo', ecko:'echo', ekho:'echo', aiko:'echo', ecau:'echo',
  fausstrot:'foxtrot', focstrot:'foxtrot', foxtrat:'foxtrot',
  gol:'golf', golph:'golf',
  otelle:'hotel', hotell:'hotel',
  indyat:'india', undia:'india',
  julietta:'juliett', julliette:'juliett',
  quilot:'kilo', kilau:'kilo',
  limace:'lima', limard:'lima',
  mique:'mike', mic:'mike',
  novembra:'november', novembeur:'november', novenbre:'november',
  oscarre:'oscar', oskare:'oscar',
  papah:'papa',
  kebecq:'quebec', quebeque:'quebec',
  ciara:'sierra', cierat:'sierra', sierrah:'sierra',
  tangaut:'tango', tangho:'tango',
  uniformte:'uniform', unifome:'uniform',
  victeure:'victor', vicktor:'victor',
  ouiskey:'whiskey', ouiske:'whiskey', wisqui:'whiskey',
  yankeu:'yankee', yanqui:'yankee', yankais:'yankee',
  zoulout:'zulu', zoulouh:'zulu'
};
