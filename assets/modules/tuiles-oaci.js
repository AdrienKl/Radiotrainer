/* =============================================================================
   Albatros VFR — LES TUILES DE LA CARTE OACI
   -----------------------------------------------------------------------------
   Les 142 tuiles vivent dans DEUX dossiers, et ce n'est pas un caprice : l'interface
   web de GitHub n'accepte que 100 fichiers par envoi.

       assets/oaci/    grilles 2 a 7  (zooms carte 5 a 10)   49 fichiers
       assets/oaci2/   grille  8      (zoom  carte 11)       93 fichiers

   Le numero de grille suffit a savoir ou chercher : aucune requete perdue, pas de
   tentative-puis-repli. Ce module porte aussi la sonde de publication, qui bascule
   sur OpenStreetMap plutot que d'afficher une carte vide quand le televersement
   est incomplet.

   Expose sur window : rien sur window
   Emprunte          : L (Leaflet), charge juste avant

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
/* ============ TUILES OACI : DEUX DOSSIERS ============
   L'interface web de GitHub n'accepte que 100 fichiers par envoi, et le jeu
   complet en compte 142. Les tuiles sont donc reparties en deux dossiers :

       assets/oaci/    grilles 2 a 7  (zooms carte 5 a 10)   49 fichiers,  42 Mo
       assets/oaci2/   grille  8      (zoom  carte 11)       93 fichiers,  74 Mo

   Le numero de grille suffit a savoir ou chercher : aucune requete perdue, pas
   de tentative-puis-repli. Pour ajouter un troisieme dossier, il n'y a que la
   fonction ci-dessous a etendre.
   ATTENTION : c'est bien _getZoomForUrl() qu'il faut lire, pas coords.z — le
   premier applique zoomOffset (-3) et vaut donc le numero de GRILLE, le second
   est le zoom de la CARTE. */
function oaciDossier(grille){ return grille >= 8 ? 'assets/oaci2/' : 'assets/oaci/'; }
var OaciTiles = L.TileLayer.extend({
  getTileUrl: function(coords){
    var g = this._getZoomForUrl();
    return oaciDossier(g) + g + '_' + coords.x + '_' + coords.y + '.webp';
  }
});
/* Sonde de publication. Deux cas bien distincts :
   - le dossier principal manque  -> pas de carte OACI du tout, on bascule sur OSM ;
   - seul le second manque        -> la carte reste parfaitement utilisable jusqu'au
                                     zoom 10, on se contente de rabaisser le plafond
                                     natif au lieu de tout desactiver. */
function oaciSonde(couche, surAbsenceTotale){
  var a=new Image(); a.onerror=surAbsenceTotale; a.src='assets/oaci/4_7_5.webp';
  var b=new Image();
  b.onerror=function(){
    couche.options.maxNativeZoom=10;
    if(couche._map) couche.redraw();
  };
  b.src='assets/oaci2/8_129_88.webp';
}
