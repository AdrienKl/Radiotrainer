/* =============================================================================
   RadioTrainer — Admin · COLLECTEUR D'ERREURS LOCAL
   -----------------------------------------------------------------------------
   Capte les erreurs JavaScript et les promesses rejetées, et les range dans
   localStorage sous `rt-admin-errors` (100 entrées au maximum, les plus
   récentes d'abord).

   Trois garde-fous :
     · RIEN N'EST ENVOYÉ SUR INTERNET. C'est un journal de bord local, cohérent
       avec la promesse du pied de page du site.
     · Le collecteur ne modifie aucun comportement : il écoute, il n'intercepte
       pas. `window.onerror` existant n'est pas écrasé (addEventListener).
     · Tout est enveloppé : un collecteur qui plante casserait la page qu'il
       observe, ce qui serait l'exact contraire du but.

   Le jour de Supabase, cette même fonction `RTAdmin.logError()` postera dans
   `app_errors` au lieu d'écrire dans localStorage — l'appelant ne change pas.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin = window.RTAdmin || {};
  var CLE = 'rt-admin-errors';
  var MAX = 100;

  function lire(){
    try { return JSON.parse(localStorage.getItem(CLE) || '[]'); } catch(e){ return []; }
  }
  function ecrire(liste){
    try { localStorage.setItem(CLE, JSON.stringify(liste.slice(0, MAX))); } catch(e){}
  }

  var compteur = 0;
  function journaliser(entree){
    try {
      var liste = lire();
      /* Regroupement par clé stable : les tuiles de carte manquantes arrivent par
         paquets et par adresses toutes différentes. Sans clé, elles chasseraient
         du journal les erreurs qui, elles, méritent d'être lues. */
      if (entree.key){
        for (var i = 0; i < liste.length; i++){
          if (liste[i].key === entree.key
              && Date.now() - new Date(liste[i].at).getTime() < 86400000){
            liste[i].count = (liste[i].count || 1) + 1;
            liste[i].at = new Date().toISOString();
            liste[i].detail = entree.detail || liste[i].detail;
            /* L'entrée regroupée remonte en tête : elle vient de se produire. */
            liste.unshift(liste.splice(i, 1)[0]);
            ecrire(liste);
            return liste[0];
          }
        }
      }
      /* Anti-avalanche : une erreur dans une boucle d'animation peut se répéter
         soixante fois par seconde. On regroupe les répétitions identiques. */
      var recent = liste[0];
      if (recent && recent.message === entree.message && recent.url === entree.url
          && Date.now() - new Date(recent.at).getTime() < 60000){
        recent.count = (recent.count || 1) + 1;
        recent.at = new Date().toISOString();
        ecrire(liste);
        return recent;
      }
      compteur++;
      entree.id = 'le_' + Date.now().toString(36) + '_' + compteur;
      entree.at = entree.at || new Date().toISOString();
      entree.count = 1;
      entree.userAgent = navigator.userAgent;
      entree.resolved = false;
      liste.unshift(entree);
      ecrire(liste);
      return entree;
    } catch(e){ return null; }
  }

  RT.logError = journaliser;
  RT.readErrors = lire;
  RT.clearErrors = function(){ try { localStorage.removeItem(CLE); } catch(e){} };

  function contexte(){
    var h = '';
    try { h = location.hash || '#accueil'; } catch(e){}
    return { url:h };
  }

  try {
    window.addEventListener('error', function(ev){
      /* Deux natures d'événement partagent ce nom : l'erreur de script (avec
         `message`) et l'échec de chargement d'une ressource (avec `target`). */
      if (ev && ev.target && ev.target !== window && ev.target.tagName){
        var t = ev.target;
        var src = t.currentSrc || t.src || t.href || t.tagName;
        /* Les tuiles absentes en bordure de couverture ne sont PAS un défaut :
           la pyramide OACI ne couvre pas la mer, et Leaflet pose déjà une tuile
           transparente à la place. On les compte, sans les faire défiler une par
           une devant les vraies erreurs. */
        if (/\/assets\/oaci2?\/|tile\.openstreetmap|\/tiles?\//i.test(String(src))){
          journaliser({
            level:'info', kind:'network', key:'tuiles-manquantes',
            message:'Tuiles de fond de carte non chargées (bordure de couverture)',
            detail:String(src), stack:null, url:contexte().url
          });
          return;
        }
        journaliser({
          level:'warn', kind:'network',
          message:'Ressource non chargée : ' + src,
          stack:null, url:contexte().url
        });
        return;
      }
      journaliser({
        level:'error', kind:'js',
        message:(ev && ev.message) || 'Erreur JavaScript',
        stack:(ev && ev.error && ev.error.stack) ||
              ((ev && ev.filename) ? ev.filename + ':' + ev.lineno + ':' + ev.colno : null),
        url:contexte().url
      });
    }, true);

    window.addEventListener('unhandledrejection', function(ev){
      var r = ev && ev.reason;
      journaliser({
        level:'error', kind:'js',
        message:'Promesse rejetée : ' + ((r && r.message) || String(r)),
        stack:(r && r.stack) || null,
        url:contexte().url
      });
    });
  } catch(e){}
})();
