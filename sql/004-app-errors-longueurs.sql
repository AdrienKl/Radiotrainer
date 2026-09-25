-- =============================================================================
-- Albatros VFR — 004 : LES ERREURS REMONTÉES ONT UNE TAILLE MAXIMALE
-- -----------------------------------------------------------------------------
-- `app_errors` accepte les dépôts ANONYMES (politique « erreur : dépôt »,
-- sql/000 § 9) : c'est voulu, une erreur qui survient avant la connexion
-- — pendant l'inscription, typiquement — est justement celle qu'on veut lire.
-- Mais aucune de ses colonnes de texte n'était bornée. N'importe qui, avec la
-- clé publiable (elle est dans le code source du site), pouvait déposer un
-- `message` ou un `context` de plusieurs mégaoctets, à répétition.
--
-- Les limites, et pourquoi celles-là — confortables pour une vraie erreur,
-- étroites pour un abus de volume :
--   · message      2 000 caractères — un message d'erreur de navigateur tient
--                  en quelques centaines ; au-delà, c'est qu'on colle autre chose ;
--   · stack       16 000 — une pile de cinquante appels à ~150 caractères fait
--                  7 500 : le double, pour les piles profondes de Leaflet ;
--   · url          2 048 — la limite pratique des navigateurs et des serveurs ;
--   · user_agent     512 — un user-agent réel fait 150 à 300 caractères ;
--   · app_version     64 — un numéro de version, pas un texte ;
--   · context     16 000 caractères une fois écrit en texte — c'est l'état
--                  autour de l'erreur (page, scénario, réglages), pas un dump.
--
-- Au 25/09/2026, l'application n'écrit PAS encore dans cette table : le
-- collecteur (assets/admin/data/error-log.js) garde les erreurs dans le
-- stockage local. Ces bornes ne peuvent donc refuser aucun envoi légitime
-- existant. Le jour où il postera ici, il devra TRONQUER à ces longueurs avant
-- l'envoi — une erreur refusée parce que trop longue est une erreur perdue.
--
-- ┌─ CE QUE CE FICHIER NE FAIT PAS ──────────────────────────────────────────┐
-- │ Il borne la taille d'UNE ligne. Il ne limite PAS le nombre de lignes :   │
-- │ un CHECK ne voit qu'une ligne à la fois, il ne sait pas compter les      │
-- │ dépôts d'une même source. Un volume total reste possible, par petites     │
-- │ lignes. Le fermer demande une autre décision (dépôt réservé aux comptes  │
-- │ connectés, ou fonction de dépôt limitée en débit) — c'est une question   │
-- │ de politique RLS, hors du périmètre de ce fichier.                        │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- `not valid` : la contrainte s'applique à toute ligne NOUVELLE, sans relire
-- les lignes existantes. La base de production a été bâtie à la main
-- (CLAUDE.md § 21.4) : si une ligne ancienne dépassait, un CHECK « valide »
-- ferait échouer le fichier entier. Le but est d'arrêter l'abus à venir.
--
-- `char_length` et non `octet_length` : on compte des caractères, comme le
-- ferait quiconque lit la limite. Quatre octets par caractère au pire, les
-- ordres de grandeur ne changent pas.
--
-- IDEMPOTENT : « drop constraint if exists » avant chaque « add constraint ».
-- Ne touche à aucune politique, ni à aucune autre table.
-- =============================================================================

alter table public.app_errors drop constraint if exists erreurs_message_longueur;
alter table public.app_errors add  constraint erreurs_message_longueur
  check (char_length(message) <= 2000) not valid;

alter table public.app_errors drop constraint if exists erreurs_stack_longueur;
alter table public.app_errors add  constraint erreurs_stack_longueur
  check (stack is null or char_length(stack) <= 16000) not valid;

alter table public.app_errors drop constraint if exists erreurs_url_longueur;
alter table public.app_errors add  constraint erreurs_url_longueur
  check (url is null or char_length(url) <= 2048) not valid;

alter table public.app_errors drop constraint if exists erreurs_user_agent_longueur;
alter table public.app_errors add  constraint erreurs_user_agent_longueur
  check (user_agent is null or char_length(user_agent) <= 512) not valid;

alter table public.app_errors drop constraint if exists erreurs_app_version_longueur;
alter table public.app_errors add  constraint erreurs_app_version_longueur
  check (app_version is null or char_length(app_version) <= 64) not valid;

-- context::text : la conversion jsonb → texte est immuable, donc admise dans
-- un CHECK. On mesure le JSON tel qu'il serait relu, pas sa taille compressée
-- sur disque (pg_column_size), qui dépendrait du contenu.
alter table public.app_errors drop constraint if exists erreurs_context_longueur;
alter table public.app_errors add  constraint erreurs_context_longueur
  check (char_length(context::text) <= 16000) not valid;
