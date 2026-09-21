/* =============================================================================
   Albatros VFR — Les icônes SVG
   -----------------------------------------------------------------------------
   Icônes monochromes réutilisées partout où du HTML est écrit en JavaScript :
   retours d'évaluation, badges, boutons dont le libellé est réécrit. Le trait
   suit la couleur du texte (currentColor), l'habillage vient de la classe
   .ic-svg — définie dans assets/css/03-exercices.css.

   Elles remplacent les emojis d'origine, qui ne se teintaient pas et ne
   s'alignaient pas pareil d'un système à l'autre.

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
/* Icônes SVG monochromes réutilisées par le rendu dynamique (feedback, badges, boutons
   dont le libellé est réécrit en JS). Trait hérité via currentColor + classe .ic-svg. */
const ICONS = {
  mic:      '<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3.5"/></svg>',
  son:      '<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  rejouer:  '<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.3"/><path d="M21 3v5h-5"/></svg>',
  chevron:  '<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  check:    '<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  warn:     '<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4.5"/><path d="M12 17.5h.01"/></svg>',
  takeoff:  '<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18"/><path d="M5 15l14-3.4a2 2 0 0 0-1-3.7l-2.6.6-4.4-4-1.8.5 2.6 4.4L8 10.9 6 9.3l-1.6.5L6 15z"/></svg>',
  target:   '<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/></svg>',
  bell:     '<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  cap:      '<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 8l10-4 10 4-10 4L2 8z"/><path d="M6 10v4.2c0 1.2 2.7 2.3 6 2.3s6-1.1 6-2.3V10"/><path d="M22 8v5"/></svg>',
  medal:    '<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2l2.5 5M16 2l-2.5 5"/><circle cx="12" cy="15" r="6"/><path d="M12 12l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L9.8 15.3 12 15z" fill="currentColor" stroke="none"/></svg>',
  lock:     '<svg class="ic-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
};
