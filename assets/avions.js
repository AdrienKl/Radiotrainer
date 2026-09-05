/* Photos d'avion detourees, affichees a cote de la pile avionique pendant le vol.

   Detourage : les fonds etant tous des ciels, un modele polynomial de degre 2
   ajuste sur le cadre de l'image (avec rejet iteratif des pixels aberrants)
   suffit a isoler l'appareil. On conserve ensuite la plus grande composante
   connexe qui ne touche PAS le bord, ce qui ecarte les arbres et le sol.

   Le TBM 700 « tbm-fourni » a ete fourni deja detoure ; il est seulement recadre.

   Photos : Unsplash (utilisation libre, y compris commerciale, sans obligation
   d'attribution — les auteurs sont neanmoins credites ci-dessous). */
var NAV_AVIONS = [
  { f:'tbm-fourni.webp',                nom:'TBM 700',        credit:null },
  { f:'arnaud-girault-aA0069Fm7ng.webp', nom:'TBM 700',        credit:'Arnaud Girault' },
  { f:'cody-f-OdHh60XP7EI.webp',         nom:'Cessna 152',     credit:'Cody F.' },
  { f:'alito-mcbean-3vKz4uvvX7E.webp',   nom:'Falcon 7X',      credit:'Alito McBean' },
  { f:'alito-mcbean-Xq6nzuvUpBE.webp',   nom:'Gulfstream G650',credit:'Alito McBean' },
  { f:'marcel-eberle-VwbBpXdvx9g.webp',  nom:'Boeing 777',     credit:'Marcel Eberle' }
];
