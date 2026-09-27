/* =============================================================================
   Albatros VFR — Admin · LES TARIFS DE LA VOIX GOOGLE, ET LE COÛT ESTIMÉ
   -----------------------------------------------------------------------------
   LE SEUL ENDROIT où un prix est écrit. Si Google change ses tarifs, c'est ici
   et nulle part ailleurs (tests/contrat/tarifs-voix.test.mjs vérifie qu'aucun
   prix n'est recopié dans une page).

   Relevé le 27/09/2026 sur https://cloud.google.com/text-to-speech/pricing :
     Chirp 3 HD   30 $ / million de caractères, 1 million gratuit par mois
     Neural2      16 $ / million,                1 million gratuit
     Studio      160 $ / million,                1 million gratuit
     WaveNet       4 $ / million,                4 millions gratuits
     Chirp HD     ABSENT de la page des prix. Aucun tarif n'est inventé :
                  l'écran affiche « Tarif non publié », et ces caractères ne
                  sont comptés dans aucun total en dollars — ils sont DITS à
                  part, pour qu'un total ne paraisse pas complet s'il ne l'est
                  pas (décision du 27/09/2026).

   ┌─ UN COÛT ESTIMÉ N'EST PAS UNE FACTURE ────────────────────────────────────┐
   │ · La part gratuite vaut pour tout le COMPTE DE FACTURATION Google, par    │
   │   mois et par modèle — partagée avec les autres projets qui y seraient   │
   │   rattachés. On la déduit du total du mois ; on ne la répartit pas entre │
   │   les élèves : le coût PAR UTILISATEUR est donc BRUT, sans gratuité.     │
   │ · Google compte les caractères à sa façon ; on compte ceux que la        │
   │   fonction voix-atc lui envoie, après normalisation.                     │
   │ · Une requête acceptée par le quota puis ratée chez Google est comptée   │
   │   ici, et ne l'est probablement pas là-bas.                              │
   │ La facture réelle est dans la console Google Cloud › Facturation.        │
   └────────────────────────────────────────────────────────────────────────────┘

   Les CODES de modèle sont ceux des noms de voix Google (fr-FR-<code>-<nom>),
   ceux de Voix.FAMILLES_GOOGLE (assets/noyau/5-voix.js) et de la colonne
   `modele` de voix_historique (sql/006).
   ========================================================================== */
(function(racine){
  'use strict';
  var RT = racine.RTAdmin = racine.RTAdmin || {};

  var TARIFS = {
    devise   : 'USD',
    releveLe : '27/09/2026',
    source   : 'https://cloud.google.com/text-to-speech/pricing',
    modeles  : {
      'Chirp3-HD': { prixParMillion:30,  gratuitParMois:1000000 },
      'Chirp-HD' : null,                  // absent de la page des prix : non publié
      'Neural2'  : { prixParMillion:16,  gratuitParMois:1000000 },
      'Studio'   : { prixParMillion:160, gratuitParMois:1000000 },
      'Wavenet'  : { prixParMillion:4,   gratuitParMois:4000000 }
    }
  };

  function tarif(modele){
    return Object.prototype.hasOwnProperty.call(TARIFS.modeles, modele) ? TARIFS.modeles[modele] : null;
  }
  /* Le prix au million de caractères d'un modèle, pour l'afficher. null =
     non publié. Les pages passent par ici plutôt que de lire TARIFS. */
  function prixAuMillion(modele){ var t = tarif(modele); return t ? t.prixParMillion : null; }

  /* Arrondi au centième de cent : les petits montants restent lisibles sans
     que la somme de lignes arrondies diverge du total. */
  function arrondi(x){ return Math.round(x * 10000) / 10000; }

  /* Coût BRUT de `car` caractères d'un modèle, sans part gratuite.
     null = tarif non publié. */
  function brut(modele, car){
    var t = tarif(modele);
    if (!t) return null;
    return arrondi((car || 0) * t.prixParMillion / 1e6);
  }

  /* Coût d'un mois pour un modèle, part gratuite du mois déduite. */
  function apresGratuite(modele, carMois){
    var t = tarif(modele);
    if (!t) return null;
    return arrondi(Math.max(0, (carMois || 0) - t.gratuitParMois) * t.prixParMillion / 1e6);
  }

  /* Coût d'une journée : ce que ses caractères AJOUTENT au mois, une fois la
     part gratuite entamée par les jours précédents. Un jour sous la gratuité
     ne coûte rien ; le jour qui la franchit n'en paie que le dépassement. */
  function duJour(modele, carAvantCeJour, carCeJour){
    var t = tarif(modele);
    if (!t) return null;
    return arrondi(apresGratuite(modele, (carAvantCeJour || 0) + (carCeJour || 0))
                   - apresGratuite(modele, carAvantCeJour || 0));
  }

  /* Additionne des coûts dont certains sont inconnus (null) : le total ne
     compte que les connus, et `inconnu` dit s'il en manque. */
  function somme(valeurs){
    var total = 0, inconnu = false;
    valeurs.forEach(function(v){ if (v == null) inconnu = true; else total += v; });
    return { total:arrondi(total), inconnu:inconnu };
  }

  /* Le JOUR de Paris, comme la base (voix_consommer : now() at time zone
     'Europe/Paris') : sinon « aujourd'hui » ne désignerait pas les mêmes
     lignes ici et là-bas, entre minuit et deux heures du matin l'été. */
  function jourParis(d){
    try { return (d || new Date()).toLocaleDateString('fr-CA', { timeZone:'Europe/Paris' }); }
    catch(e){ return (d || new Date()).toISOString().slice(0, 10); }
  }
  function decaler(jour, n){
    var t = new Date(jour + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }
  /* Ce qu'il faut lire pour « ce mois » ET « 7 jours » : du plus ancien des
     deux débuts — le 3 du mois, les sept jours remontent au mois d'avant. */
  function debutFenetre(aujourdhui){
    var mois = aujourdhui.slice(0, 7) + '-01', sept = decaler(aujourdhui, -6);
    return sept < mois ? sept : mois;
  }

  RT.tarifsVoix = {
    TARIFS:TARIFS, tarif:tarif, prixAuMillion:prixAuMillion, brut:brut, apresGratuite:apresGratuite,
    duJour:duJour, somme:somme, jourParis:jourParis, decaler:decaler, debutFenetre:debutFenetre
  };
})(typeof window !== 'undefined' ? window : globalThis);
