/* =============================================================================
   AVIERO — LES PRÉFÉRENCES
   -----------------------------------------------------------------------------
   Une seule clé de stockage local, `rt-settings`, lue par tout le monde — y
   compris par le script du <head> qui pose le thème avant le premier pixel.

   LE STOCKAGE LOCAL RESTE, ET IL LE FAUT : ces réglages sont lus de façon
   SYNCHRONE depuis des dizaines d'endroits. Une lecture réseau n'a pas sa place
   là. Ils ne sont pas pour autant cantonnés à un navigateur : chaque
   enregistrement prévient assets/donnees.js, qui les fait monter dans
   `profiles.settings` et les redescend à la connexion suivante. Le local est le
   cache ; la base tranche.

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
/* --- Préférences utilisateur (partagées par tous les modules) ---
   Une seule clé localStorage, lue aussi par le script de thème du <head>.

   LE STOCKAGE LOCAL RESTE, ET IL LE FAUT : ces réglages sont lus de façon
   SYNCHRONE depuis des dizaines d'endroits, jusque dans le <head> par le script
   qui pose le thème avant le premier pixel. Une lecture réseau n'a pas sa place
   là. Ils ne sont plus pour autant cantonnés à un navigateur : chaque
   enregistrement prévient assets/donnees.js, qui les fait monter dans
   `profiles.settings` et les redescend à la connexion suivante, où qu'elle ait
   lieu. Le local est le cache ; la base tranche. */
const RT_SET_KEY='rt-settings';
function rtSettings(){ try{ return JSON.parse(localStorage.getItem(RT_SET_KEY)||'{}'); }catch(e){ return {}; } }
function rtSaveSettings(s){
  try{ localStorage.setItem(RT_SET_KEY, JSON.stringify(s)); }catch(e){}
  /* Horodate et programme la montée. L'appel est temporisé côté module : faire
     glisser un curseur ne doit pas produire vingt écritures en base. */
  try{ if (window.RTDonnees) RTDonnees.reglagesModifies(); }catch(e){}
}
