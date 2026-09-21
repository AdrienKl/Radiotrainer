/* =============================================================================
   Albatros VFR — LA PAGE CARTE — CONSULTATION PLEIN ECRAN
   -----------------------------------------------------------------------------
   Lecture de la carte OACI, independante de la Navigation. Celle-ci DEPLACE son
   conteneur (.nav-mapwrap) dans la vue de vol : on ne peut donc pas reutiliser son
   instance Leaflet. Deux instances coexistent sans se gener — Leaflet ne partage
   aucun etat global entre cartes.

   Ce module ne lit AUCUN etat de la Navigation et n'en ecrit aucun. Selection de
   terrain, route et zones restent l'affaire de l'autre page ; ici on regarde, avec
   deux interrupteurs : le fond et les pastilles d'aerodrome.

   Expose sur window : rien sur window
   Emprunte          : OaciTiles, oaciSonde ; AERODROMES, NAV_AD_GEO

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
/* ============ CARTE — CONSULTATION PLEIN ÉCRAN (module autonome) ============
   Page de lecture de la carte OACI, indépendante de la Navigation : celle-ci déplace
   son conteneur (.nav-mapwrap) dans la vue de vol, donc on ne peut pas réutiliser son
   instance Leaflet. Deux instances coexistent sans se gêner — Leaflet ne partage
   aucun état global entre cartes.

   Ce module ne lit AUCUN état de la Navigation et n'en écrit aucun : sélection de
   terrain, route et zones restent l'affaire de la page Navigation. Ici on ne fait que
   regarder la carte, avec deux interrupteurs : le fond (OACI ou OpenStreetMap) et
   l'affichage des pastilles d'aérodrome. */
(function(){
  var TRANSPARENT='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  var map=null, oaci=null, osm=null, adLayer=null, showAd=true, oaciOk=true;

  // Terrains : même jointure que la Navigation (AERODROMES pour le nom, NAV_AD_GEO
  // pour les coordonnées), mais recalculée ici pour ne dépendre d'aucune variable
  // interne à l'autre module.
  function terrains(){
    if(typeof AERODROMES==='undefined') return [];
    var G=(typeof NAV_AD_GEO!=='undefined')?NAV_AD_GEO:{};
    return AERODROMES.map(function(a){
      var g=G[a.icao]||{};
      return { icao:a.icao, nom:a.nom, lat:g.lat, lon:g.lon, alt:g.alt, freq:g.freq||{} };
    }).filter(function(a){ return typeof a.lat==='number' && typeof a.lon==='number'; });
  }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function popup(a){
    var f=Object.keys(a.freq).map(function(k){ return k+' '+a.freq[k]; }).join(' · ');
    return '<div class="nav-adpop"><b>'+esc(a.icao)+'</b> — '+esc(a.nom)+
           (typeof a.alt==='number' ? '<br><span class="pf">'+a.alt+' ft</span>' : '')+
           '<br><span class="pf">'+(f||'fréquences non publiées')+'</span></div>';
  }

  function build(){
    if(map) return;
    /* minZoom 5 : c'est le zoom le plus large où les tuiles OACI existent. Cette page
       n'existant que pour lire cette carte, on interdit de dézoomer au-delà plutôt que
       de laisser l'utilisateur devant un fond OpenStreetMap nu. La France entière tient
       au zoom 5 même sur un écran de 360 px, donc le cadrage initial reste possible.
       maxBounds : garde-fou souple autour de la couverture, on ne part pas en Pologne. */
    map=L.map('carteMap',{
      zoomControl:true, attributionControl:true,
      minZoom:5, maxZoom:17,
      maxBounds:[[39.5,-8.5],[53.0,13.0]], maxBoundsViscosity:0.6
    });
    map.fitBounds([[41.3,-5.4],[51.2,9.8]]);

    osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:17, attribution:'&copy; contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    osm.setZIndex(1);

    /* Mêmes réglages que la couche de la page Navigation — voir le commentaire détaillé
       là-bas (tuiles 2048 px, zoomOffset -3, grilles 2 à 8 = zooms carte 5 à 11). */
    oaci=new OaciTiles('',{
      tileSize:2048, zoomOffset:-3,
      minNativeZoom:5, maxNativeZoom:11,
      minZoom:5, maxZoom:17, errorTileUrl:TRANSPARENT,
      attribution:'Carte OACI 1:500 000 &mdash; SIA / DGAC, édition 2026'
    }).addTo(map);
    oaci.setZIndex(2);

    adLayer=L.layerGroup().addTo(map);
    terrains().forEach(function(a){
      L.marker([a.lat,a.lon],{
        title:a.icao+' — '+a.nom,
        icon:L.divIcon({ className:'nav-adhit',
          html:'<span class="carte-admark"></span>', iconSize:[26,26], iconAnchor:[13,13] })
      }).bindPopup(popup(a)).addTo(adLayer);
    });

    /* Tuiles non publiées (téléversement incomplet) : même sonde que la Navigation.
       Sans elle, la couche resterait blanche sans explication. */
    oaciSonde(oaci, function(){
      oaciOk=false;
      if(map.hasLayer(oaci)) map.removeLayer(oaci);
      var b=document.getElementById('carteBasemap');
      if(b){ b.classList.remove('on'); b.textContent='Fond OpenStreetMap'; b.disabled=true;
             b.title='Tuiles assets/oaci/ introuvables sur ce serveur'; }
      var h=document.getElementById('carteHint');
      if(h) h.textContent='Carte OACI indisponible ici : le dossier assets/oaci/ n’est pas publié. Fond OpenStreetMap utilisé.';
    });

    var bm=document.getElementById('carteBasemap');
    if(bm) bm.addEventListener('click',function(){
      if(!oaciOk) return;
      var on=map.hasLayer(oaci);
      if(on){ map.removeLayer(oaci); }
      else { oaci.addTo(map); oaci.setZIndex(2); }
      bm.classList.toggle('on',!on);
      bm.textContent=on?'Fond OpenStreetMap':'Carte OACI';
    });

    var ab=document.getElementById('carteAd');
    if(ab) ab.addEventListener('click',function(){
      showAd=!showAd;
      if(showAd) adLayer.addTo(map); else map.removeLayer(adLayer);
      ab.classList.toggle('on',showAd);
      ab.setAttribute('aria-pressed',showAd?'true':'false');
    });
  }

  window.addEventListener('rt:page',function(e){
    if(e.detail.page!=='carte') return;
    build();
    // Un conteneur créé en display:none a une taille nulle : Leaflet doit recalculer
    // ses dimensions une fois la page visible, sinon la carte reste grise.
    setTimeout(function(){ map.invalidateSize(); },30);
  });
  // La hauteur dépend de la fenêtre (calc(100vh - 210px)) : à la rotation d'un
  // téléphone, Leaflet ne se réajuste pas tout seul.
  window.addEventListener('resize',function(){
    if(map && document.getElementById('page-carte').classList.contains('active')) map.invalidateSize();
  });
})();
