/* Photos d'avion detourees, affichees a cote de la pile avionique pendant le vol
   et sur la page d'accueil.

   DETOURAGE. Les fonds sont tous des ciels : un polynome de degre 2 ajuste par
   rejet iteratif les decrit a quelques niveaux pres, et ce qui s'en ecarte
   franchement est l'appareil. On ne garde ensuite que le plus gros bloc, celui
   qui ne touche pas le bord, ce qui ecarte les arbres, le sol et les oiseaux.

   Le point delicat n'est pas la silhouette, c'est son BORD. Un pixel de contour
   n'est ni avion ni ciel : sa couleur est un melange des deux, C = a.F + (1-a).B.
   Se contenter d'y poser un alpha partiel y laisse (1-a) de ciel — invisible sur
   le fond clair d'ou vient la photo, mais qui devient une frange lumineuse des
   qu'on pose l'image sur du sombre. C'etait le halo blanc du Cessna 152. Comme
   on connait a et qu'on a modelise B, on retrouve la vraie couleur de l'appareil,
   F = (C - (1-a).B) / a, et c'est celle-la qui est enregistree : elle est juste
   sur n'importe quel fond.

   Le TBM « fourni » n'a plus sa photo d'origine : son bord a ete repare autrement,
   en reculant la silhouette de deux pixels et en reconstruisant la couleur depuis
   l'interieur — une bande de 760 px de large y perd deux pixels d'envergure, ce
   qui ne se voit pas, et la frange, elle, disparait.

   MANQUENT ICI un Cessna 152 et un Boeing 777. Leurs decoupes ont ete retirees le
   13 septembre 2026 : le contour ne tenait pas. Le Cessna avait perdu sa photo
   d'origine — il ne restait que la vignette deja detouree, dont on ne peut plus
   retirer proprement le ciel faute de savoir ce qu'il valait. De nouvelles photos
   sont attendues.

   PHOTOS. Unsplash, Pixabay et Pexels : les trois licences autorisent l'usage
   libre, y compris commercial, sans obligation d'attribution. Les auteurs sont
   cites quand meme, ci-dessous et sous les images.

   ORDRE. Les machines d'ecole d'abord : c'est a elles que parle l'application.
   Le champ « credit » vaut null quand la photo a ete fournie sans auteur connu. */
var NAV_AVIONS = [
  { f:'dr400-f-guxq.webp',               nom:'Robin DR400',     credit:'Dylan Agbagni' },
  { f:'piper-cub-d-elyh.webp',           nom:'Piper Cub',       credit:'winterseitler' },
  { f:'tbm-fourni.webp',                 nom:'TBM 700',         credit:null },
  { f:'arnaud-girault-aA0069Fm7ng.webp', nom:'TBM 700',         credit:'Arnaud Girault' },
  { f:'a320-air-france.webp',            nom:'Airbus A320',     credit:'Dylan Agbagni' },
  { f:'alito-mcbean-3vKz4uvvX7E.webp',   nom:'Falcon 7X',       credit:'Alito McBean' },
  { f:'alito-mcbean-Xq6nzuvUpBE.webp',   nom:'Gulfstream G650', credit:'Alito McBean' },
];
