/* =============================================================================
   RadioTrainer — coordonnées du projet Supabase
   -----------------------------------------------------------------------------
   UN SEUL endroit à modifier pour changer de projet. Deux fichiers lisent ces
   valeurs : assets/auth.js (la session) et assets/admin/data/source-supabase.js
   (les lectures de la console). Les dupliquer serait la garantie qu'un jour les
   deux ne pointeront plus au même endroit.

   Ces deux valeurs sont PUBLIQUES par conception. Elles voyagent dans chaque
   page servie au navigateur et n'ouvrent que ce que les politiques RLS
   autorisent : c'est la base qui décide, pas ce fichier.

   ┌─ CE QUI N'A RIEN À FAIRE ICI ───────────────────────────────────────────┐
   │ La clé `secret` (ex-`service_role`) contourne toutes les politiques RLS. │
   │ Elle n'appartient qu'à un serveur. Si elle se retrouve un jour dans ce   │
   │ fichier — ou dans n'importe quel fichier servi au navigateur — il faut   │
   │ la révoquer immédiatement depuis le tableau de bord Supabase.            │
   │ Idem pour le mot de passe de la base de données.                         │
   └─────────────────────────────────────────────────────────────────────────┘
   ========================================================================== */
window.RT_SUPABASE = {
  url:     'https://vbziwjeuzcbvrbrihhrg.supabase.co',
  anonKey: 'sb_publishable_MPZNvFqgjunE2-ol_1Ueaw_f2LasuXO'
};
