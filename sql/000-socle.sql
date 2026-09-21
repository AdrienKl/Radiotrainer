-- =============================================================================
-- Albatros VFR — 000 : LE SOCLE
--                les six tables, le profil créé à l'inscription, et la RLS
--                des deux tables qu'aucune migration ne décrivait
-- -----------------------------------------------------------------------------
-- Ce fichier ne change RIEN à la base de production. Tout y est déjà — à la
-- main, depuis assets/admin/README.md § 4.2. Il existe pour qu'un projet
-- Supabase NEUF puisse être monté à partir des seules migrations.
--
-- ┌─ POURQUOI 000 ET PAS 004 ───────────────────────────────────────────────┐
-- │ CLAUDE.md § 21.4 annonçait ce fichier sous le nom « sql/004 ». Le numéro  │
-- │ aurait menti, et un numéro de migration n'est pas une étiquette : c'est   │
-- │ un ORDRE D'EXÉCUTION.                                                     │
-- │                                                                           │
-- │   · sql/001-inscription.sql fait « alter table public.profiles »          │
-- │   · sql/002-progression.sql fait « insert into public.exercises »         │
-- │                             et « alter table public.profiles »            │
-- │   · sql/003 pose la RLS d'`exercises`                                     │
-- │                                                                           │
-- │ Les trois SUPPOSENT ces tables. Un fichier numéroté 004 qu'il faudrait    │
-- │ jouer en PREMIER est un piège : sur un projet neuf, jouer 001 avant lui   │
-- │ s'arrête sur « relation "public.profiles" does not exist », et le         │
-- │ nouveau venu passera un moment à comprendre pourquoi.                     │
-- │                                                                           │
-- │ D'où 000. L'ordre se lit, il ne se devine pas.                            │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- ORDRE SUR UN PROJET NEUF :
--     000-socle.sql  →  001-inscription.sql  →  002-progression.sql
--                    →  003-is-admin-et-exercices.sql
--
-- Les colonnes posées ici sont celles du README, et RIEN de plus : `profiles`
-- reçoit ses colonnes de questionnaire en 001, et `etat_vol` en 002. C'est
-- voulu — chaque migration garde ce qu'elle a apporté, et l'histoire reste
-- lisible.
--
-- SUR LA BASE ACTUELLE : ce fichier ne doit rien faire. Les six « create table
-- if not exists » passent leur tour, les « enable row level security » sont
-- sans effet sur une RLS déjà active, les politiques sont retirées puis
-- recréées à l'identique. Si le § 10 de contrôle affiche autre chose que ce
-- qu'il annonce, c'est que la base et ce fichier ne disaient pas la même
-- chose — comprendre laquelle des deux a raison AVANT de continuer.
--
-- IDEMPOTENT, et vérifié comme tel sur chaque objet :
--   · tables      → « create table if not exists »
--   · fonctions   → « create or replace »
--   · déclencheur → cherché dans pg_trigger avant d'être créé (« create
--                   trigger if not exists » n'existe pas en PostgreSQL, et
--                   un drop/create sur auth.users ouvrirait une fenêtre
--                   pendant laquelle une inscription ne créerait pas de profil)
--   · contrainte  → cherchée dans pg_constraint avant d'être posée
--   · index       → cherchés par DÉFINITION et non par nom, parce que ceux de
--                   la production portent le nom que PostgreSQL leur a donné
--                   tout seul ; « if not exists » ne regarde que le nom et en
--                   poserait un SECOND sur les mêmes colonnes
--   · politiques  → « drop policy if exists » avant chaque création
-- =============================================================================


-- =============================================================================
-- 0. À LIRE AVANT DE JOUER LE RESTE
-- -----------------------------------------------------------------------------
-- Ne modifie rien. Dit ce que la base a AUJOURD'HUI.
--
-- Sur la production, les six tables doivent sortir avec rls_active = true.
-- Sur un projet neuf, ce premier tableau est vide — c'est normal, et c'est
-- même la seule situation où la suite de ce fichier fait quelque chose.
-- =============================================================================

select c.relname as "table",
       c.relrowsecurity as rls_active,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as politiques
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and c.relname in ('profiles','sessions','session_steps','exercises',
                     'app_errors','admin_audit_log')
 order by c.relname;


-- =============================================================================
-- 1. PROFILS — le miroir public de auth.users
-- -----------------------------------------------------------------------------
-- NE PAS créer de table `users` : `auth.users` appartient à Supabase Auth et
-- n'est pas interrogeable depuis le client. `profiles` en est le reflet, avec
-- la même clé primaire, et c'est cette clé que toutes les autres tables
-- référencent.
--
-- `on delete cascade` sur la référence à auth.users : un compte supprimé
-- emporte son profil, qui emporte ses séances. C'est l'effacement RGPD, obtenu
-- par le schéma plutôt que par du code qu'il faudrait penser à écrire.
--
-- `settings jsonb` reprend `rt-settings` tel quel — voir CLAUDE.md § 21.5 : la
-- fusion entre appareils porte aujourd'hui sur l'objet ENTIER, ce qui perd un
-- réglage changé sur un autre appareil. Décision en attente ; ne pas y toucher
-- ici, c'est une question de code, pas de schéma.
-- =============================================================================

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  callsign      text default 'F-ABCD',
  role          text not null default 'user'
                check (role in ('user','admin','moderator','content_manager')),
  status        text not null default 'active'
                check (status in ('active','suspended','pending')),
  plan          text not null default 'free',
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

-- Sans ce déclencheur, la toute première requête d'un compte neuf tombe sur une
-- ligne absente : pas une erreur bruyante, une page vide.
--
-- `security definer` parce qu'il écrit dans `profiles`, qui est sous RLS, et
-- qu'à cet instant il n'y a pas encore de session — auth.uid() est nul, aucune
-- politique ne passerait. `set search_path = public` ferme le détournement
-- classique d'une fonction `security definer`.
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;   -- rejouable : un profil déjà là n'est pas une erreur
  return new;
end $$;

-- Cherché avant d'être créé, et JAMAIS drop/create : entre le drop et le
-- create, une inscription qui passerait créerait un compte sans profil.
-- La fenêtre est courte, mais elle laisserait un compte cassé dont rien ne
-- signalerait l'existence.
do $trg$
begin
  if not exists (
    select 1 from pg_trigger t
      join pg_class c     on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'auth' and c.relname = 'users'
       and t.tgname = 'on_auth_user_created')
  then
    execute 'create trigger on_auth_user_created
               after insert on auth.users
               for each row execute function public.handle_new_user()';
    raise notice 'Déclencheur on_auth_user_created créé.';
  else
    raise notice 'Déclencheur on_auth_user_created déjà présent — rien à faire.';
  end if;
end $trg$;


-- -----------------------------------------------------------------------------
-- is_admin() — ICI, ET PAS EN 003 : c'est la première qui en a besoin
-- -----------------------------------------------------------------------------
-- ┌─ CE QUE LE BANC D'ESSAI A TROUVÉ, ET QUI N'ÉTAIT PAS QU'UN DÉFAUT DE CE ─┐
-- │  FICHIER                                                                  │
-- │ Les migrations jouées dans l'ordre sur un PostgreSQL vierge s'arrêtent     │
-- │ sur « function public.is_admin() does not exist ». Deux fois :             │
-- │   · au § 9 de CE fichier, qui pose les politiques d'`app_errors` ;         │
-- │   · au § 4 de sql/002-progression.sql, qui l'appelle QUATRE fois.          │
-- │                                                                           │
-- │ sql/003 la définit — mais 003 passe APRÈS 002. Son propre en-tête          │
-- │ annonçait la panne (« les quatre politiques admin de sql/002 échouent,     │
-- │ la migration s'arrête ») sans que son numéro permette de l'éviter.         │
-- │                                                                           │
-- │ Elle appartient donc au socle, juste après `profiles` — la table qu'elle   │
-- │ lit. sql/003 garde son « create or replace » : sans effet une fois         │
-- │ celui-ci joué, et c'est le dossier de la fois où le manque a été trouvé.   │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- Le rôle est lu EN BASE, jamais dans un champ du jeton : le client peut
-- influencer son jeton, il ne peut pas influencer une ligne de `profiles`.
--
-- `security definer` : appelée depuis une politique portant sur `profiles`,
-- elle doit lire `profiles` SANS repasser par RLS — sinon PostgreSQL s'arrête
-- sur « infinite recursion detected in policy for relation profiles ».
--
-- `set search_path = public` : ferme le détournement classique d'une fonction
-- `security definer` — sans lui, qui peut créer un schéma devant `public` dans
-- le chemin de recherche fait résoudre `profiles` vers SA table.
--
-- Copie conforme d'assets/admin/README.md § 4.4 et de sql/003. Les trois
-- doivent rester identiques mot pour mot. Ne pas la « simplifier ».
-- =============================================================================

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and role in ('admin','moderator'))
$$;


-- =============================================================================
-- 2. SÉANCES — scénarios ET vols ET épellation, une seule table
-- -----------------------------------------------------------------------------
-- Le raisonnement (et ce qui a été écarté : trois tables séparées) est dans
-- ADMIN.md § 10. En deux mots : les trois répondent aux mêmes questions
-- — combien, quand, quel score — et les séparer obligerait à faire trois
-- requêtes et une union pour tout ce que la console affiche.
--
-- `exercise_key` n'est PAS contrainte ici. Sa clé étrangère vers `exercises`
-- est posée au § 7, parce que `exercises` n'existe pas encore à cette ligne.
--
-- `score_pct` est une colonne GÉNÉRÉE, pas calculée par le client : deux
-- clients qui arrondiraient différemment donneraient deux pourcentages pour la
-- même séance. `case when score_total > 0` évite la division par zéro d'une
-- séance abandonnée avant le premier échange.
-- =============================================================================

create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  kind          text not null check (kind in ('scenario','flight','spelling')),
  status        text not null default 'in_progress'
                check (status in ('completed','abandoned','in_progress')),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  duration_s    int,
  level         text check (level in ('debutant','reel')),
  mode          text check (mode in ('voyage','local')),
  exercise_key  text,
  dep_icao      text, arr_icao text, alt_icao text, diverted_icao text,
  runway        text,
  aircraft      text,
  cruise_alt_ft int,
  pax           int,
  alea          text,
  score_ok      int not null default 0,
  score_total   int not null default 0,
  score_pct     int generated always as
                (case when score_total > 0
                      then round(score_ok::numeric * 100 / score_total)::int
                      else null end) stored,
  app_version   text,
  user_agent    text
);


-- =============================================================================
-- 3. ÉCHANGES — la trace fine
-- -----------------------------------------------------------------------------
-- `rt-vols[].lignes[]` a déjà exactement cette forme : la table a été dessinée
-- d'après le stockage local, pour que la migration des données existantes soit
-- une transposition et non une traduction.
--
-- `unique (session_id, idx)` n'est pas cosmétique : assets/sync.js rejoue la
-- file d'attente hors-ligne, et sans cette contrainte un rejeu doublerait
-- chaque échange d'une séance déjà partie. C'est elle qui rend le rejeu sûr.
-- =============================================================================

create table if not exists public.session_steps (
  id           bigserial primary key,
  session_id   uuid not null references public.sessions(id) on delete cascade,
  idx          int not null,
  phase        text, station text, freq text,
  expected     text, said text,
  answered     boolean not null default false,
  missed       text[] not null default '{}',
  score_ok     int not null default 0,
  score_total  int not null default 0,
  at           timestamptz not null default now(),
  unique (session_id, idx)
);


-- =============================================================================
-- 4. CATALOGUE — des métadonnées de pilotage, RIEN d'autre
-- -----------------------------------------------------------------------------
-- LA BASE NE CONTIENT AUCUNE PHRASÉOLOGIE, et ne doit jamais en contenir. Le
-- déroulé des échanges reste dans le code (assets/donnees/), où il porte ses
-- variantes de reconnaissance, ses références calculées à l'exécution, et ses
-- renvois au manuel DSNA page par page. C'est du comportement, pas du contenu.
--
-- `manual_ref` reste donc vide dans les faits : le renvoi au manuel n'existe
-- pas au niveau du scénario mais au niveau de chaque échange. Y mettre une page
-- approximative reviendrait à inventer une source — ce que CLAUDE.md § 2
-- interdit avant toute autre considération.
--
-- Les treize lignes sont versées par sql/002-progression.sql § 1.
-- =============================================================================

create table if not exists public.exercises (
  key         text primary key,
  title       text not null,
  category    text, level text, station text,
  manual_ref  text,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  notes       text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);


-- =============================================================================
-- 5. ERREURS — le journal technique
-- -----------------------------------------------------------------------------
-- Lu par assets/admin/data/source-supabase.js et par la page Erreurs de la
-- console. `user_id` est en `on delete set null` et non `cascade` : un compte
-- supprimé ne doit pas emporter la trace d'un bug, qui n'a plus rien de
-- personnel une fois l'identifiant détaché.
-- =============================================================================

create table if not exists public.app_errors (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  level        text not null default 'error' check (level in ('error','warn','info')),
  kind         text not null default 'js'
               check (kind in ('js','speech','audio','network','simulation','user_report')),
  message      text not null,
  stack        text, url text, user_agent text, app_version text,
  user_id      uuid references public.profiles(id) on delete set null,
  session_id   uuid references public.sessions(id) on delete set null,
  context      jsonb not null default '{}'::jsonb,
  resolved_at  timestamptz
);


-- =============================================================================
-- 6. AUDIT — indispensable dès qu'un administrateur regarde les données d'autrui
-- -----------------------------------------------------------------------------
-- `on delete restrict` sur `admin_id`, et c'est le seul de tout le schéma :
-- supprimer le compte d'un administrateur ne doit PAS effacer la trace de ce
-- qu'il a consulté. La suppression est bloquée tant que ses entrées d'audit
-- existent — c'est le comportement voulu d'un journal.
-- =============================================================================

create table if not exists public.admin_audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  admin_id    uuid not null references public.profiles(id) on delete restrict,
  action      text not null,
  target_type text, target_id text,
  meta        jsonb not null default '{}'::jsonb
);


-- =============================================================================
-- 7. LA CLÉ ÉTRANGÈRE DIFFÉRÉE
-- -----------------------------------------------------------------------------
-- `exercises` est créée après `sessions` ; le lien se rattache donc ici.
--
-- `on delete set null` et non `cascade` : retirer un exercice du catalogue ne
-- doit JAMAIS effacer les séances que des élèves ont faites dessus. Elles
-- perdent leur nom dans l'historique, elles ne perdent pas leur existence.
--
-- Rappel de ce que cette contrainte coûte quand le catalogue est incomplet :
-- PostgreSQL refuse la ligne ENTIÈRE (23503). assets/sync.js réessaie une fois
-- sans la clé — la séance est sauvée, mais détachée. C'est arrivé à six
-- scénarios sur treize, et rien ne l'a montré à l'écran.
-- =============================================================================

do $fk$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'sessions_exercise_key_fkey'
                    and conrelid = 'public.sessions'::regclass)
  then
    alter table public.sessions
      add constraint sessions_exercise_key_fkey
      foreign key (exercise_key) references public.exercises(key) on delete set null;
    raise notice 'Clé étrangère sessions.exercise_key → exercises.key posée.';
  else
    raise notice 'Clé étrangère sessions.exercise_key déjà présente — rien à faire.';
  end if;
end $fk$;


-- =============================================================================
-- 8. INDEX
-- -----------------------------------------------------------------------------
-- Cherchés par DÉFINITION, jamais par nom : en production ils portent le nom
-- que PostgreSQL leur a donné tout seul (`sessions_user_id_started_at_idx`…),
-- et « create index if not exists » ne regarde QUE le nom. Il en poserait un
-- second sur les mêmes colonnes : pas une erreur, un doublon qui ralentit
-- chaque écriture et occupe de la place pour rien.
--
-- Même précaution, même raison qu'au § 5 de sql/002-progression.sql. Les deux
-- index de `sessions` et celui de `session_steps` y sont déjà traités ; on ne
-- les redouble pas ici. Restent ceux que ce fichier apporte.
-- =============================================================================

do $idx$
declare
  manquants int := 0;
begin
  -- sessions (kind, started_at desc) : « les derniers vols », « les derniers
  -- scénarios » — les deux listes de la console d'administration.
  if not exists (
    select 1 from pg_index i
      join pg_class t     on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'sessions'
       and pg_get_indexdef(i.indexrelid) like '%(kind, started_at DESC)%')
  then
    execute 'create index sessions_kind_started_idx on public.sessions (kind, started_at desc)';
    manquants := manquants + 1;
    raise notice 'Index créé sur sessions (kind, started_at desc).';
  end if;

  -- sessions (exercise_key) : sans lui, PostgreSQL balaie `sessions` en entier
  -- à chaque vérification de la clé étrangère du § 7.
  if not exists (
    select 1 from pg_index i
      join pg_class t     on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'sessions'
       and pg_get_indexdef(i.indexrelid) like '%(exercise_key)%')
  then
    execute 'create index sessions_exercise_key_idx on public.sessions (exercise_key)';
    manquants := manquants + 1;
    raise notice 'Index créé sur sessions (exercise_key).';
  end if;

  -- app_errors (occurred_at desc) : la page Erreurs n'affiche jamais autre
  -- chose que « les plus récentes d'abord ».
  if not exists (
    select 1 from pg_index i
      join pg_class t     on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'app_errors'
       and pg_get_indexdef(i.indexrelid) like '%(occurred_at DESC)%')
  then
    execute 'create index app_errors_occurred_idx on public.app_errors (occurred_at desc)';
    manquants := manquants + 1;
    raise notice 'Index créé sur app_errors (occurred_at desc).';
  end if;

  -- app_errors : index PARTIEL sur ce qui n'est pas traité. C'est la requête
  -- par défaut de la page Erreurs, et l'index ne porte que les lignes ouvertes
  -- — il reste petit même quand la table grossit.
  if not exists (
    select 1 from pg_index i
      join pg_class t     on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'app_errors'
       and pg_get_indexdef(i.indexrelid) like '%resolved_at%'
       and pg_get_indexdef(i.indexrelid) like '%WHERE%')
  then
    execute 'create index app_errors_ouvertes_idx on public.app_errors (resolved_at) where resolved_at is null';
    manquants := manquants + 1;
    raise notice 'Index créé sur app_errors (resolved_at) where resolved_at is null.';
  end if;

  -- admin_audit_log (at desc) : un journal se lit par la fin.
  if not exists (
    select 1 from pg_index i
      join pg_class t     on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'admin_audit_log'
       and pg_get_indexdef(i.indexrelid) like '%(at DESC)%')
  then
    execute 'create index admin_audit_log_at_idx on public.admin_audit_log (at desc)';
    manquants := manquants + 1;
    raise notice 'Index créé sur admin_audit_log (at desc).';
  end if;

  if manquants = 0 then
    raise notice 'Les cinq index de ce fichier étaient déjà là — rien à faire.';
  end if;
end $idx$;


-- =============================================================================
-- 9. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
-- ┌─ POURQUOI LA RLS EST ACTIVÉE ICI, ET PAS SEULEMENT EN 002 ET 003 ───────┐
-- │ Une table PostgreSQL naît SANS RLS. Sur un projet neuf, entre le moment  │
-- │ où ce fichier crée `sessions` et celui où sql/002 l'active, la table est │
-- │ lisible et modifiable par quiconque détient la clé publiable — laquelle  │
-- │ est dans le code source du site, par conception.                         │
-- │                                                                          │
-- │ La fenêtre dure le temps de jouer deux fichiers. Elle est courte ; elle  │
-- │ n'est pas nulle, et elle ne coûte rien à fermer. Les six tables partent  │
-- │ donc sous RLS DÈS LEUR CRÉATION.                                         │
-- │                                                                          │
-- │ Une table sous RLS et sans aucune politique n'est accessible à personne  │
-- │ — c'est le bon défaut : fermé, puis ouvert exprès.                       │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- CE QUE CE FICHIER POSE COMME POLITIQUES : celles d'`app_errors` et
-- d'`admin_audit_log`, les deux tables qu'AUCUNE migration ne décrivait.
-- Celles de `profiles`, `sessions` et `session_steps` sont en 002, celles
-- d'`exercises` en 003. On ne les redouble pas — deux jeux de politiques sous
-- des noms différents se cumulent par OU, et on ne saurait plus lequel décide.
-- =============================================================================

alter table public.profiles        enable row level security;
alter table public.sessions        enable row level security;
alter table public.session_steps   enable row level security;
alter table public.exercises       enable row level security;
alter table public.app_errors      enable row level security;
alter table public.admin_audit_log enable row level security;

-- --- ERREURS : chacun peut signaler, seuls les administrateurs lisent --------
-- `user_id is null or user_id = auth.uid()` : un visiteur non connecté doit
-- pouvoir déposer une erreur anonyme — c'est souvent SUR la page de connexion
-- que ça casse. Ce qu'il ne peut pas faire, c'est signer son dépôt du nom de
-- quelqu'un d'autre.
--
-- Aucune politique SELECT pour l'auteur, et c'est délibéré : `stack` et
-- `context` contiennent de l'état interne, pas quelque chose à montrer.
drop policy if exists "erreur : dépôt" on public.app_errors;
create policy "erreur : dépôt" on public.app_errors for insert
  with check (user_id is null or user_id = auth.uid());

drop policy if exists "erreur : lecture admin" on public.app_errors;
create policy "erreur : lecture admin" on public.app_errors for select
  using (public.is_admin());

-- Marquer une erreur « traitée » (`resolved_at`) est la seule écriture que la
-- page Erreurs demande.
drop policy if exists "erreur : maj admin" on public.app_errors;
create policy "erreur : maj admin" on public.app_errors for update
  using (public.is_admin());

-- --- AUDIT : on écrit et on lit, on n'efface JAMAIS --------------------------
-- `admin_id = auth.uid()` en plus de `is_admin()` : un administrateur ne peut
-- pas écrire une entrée au nom d'un autre. Sans cette moitié, le journal
-- resterait vrai sur QUOI a été consulté et faux sur PAR QUI — ce qui est
-- exactement ce qu'un journal d'audit sert à établir.
drop policy if exists "audit : dépôt admin" on public.admin_audit_log;
create policy "audit : dépôt admin" on public.admin_audit_log for insert
  with check (public.is_admin() and admin_id = auth.uid());

drop policy if exists "audit : lecture admin" on public.admin_audit_log;
create policy "audit : lecture admin" on public.admin_audit_log for select
  using (public.is_admin());

-- AUCUNE politique DELETE ni UPDATE sur admin_audit_log, ici ni ailleurs. Un
-- journal d'audit qu'on peut réécrire ne prouve rien. L'absence de politique
-- n'est pas un oubli : sous RLS, ce qui n'est pas autorisé est refusé, y
-- compris aux administrateurs.


-- =============================================================================
-- 10. CE QUE LA BASE RÉPOND UNE FOIS LE FICHIER JOUÉ
-- -----------------------------------------------------------------------------
-- ATTENDU, sur la production comme sur un projet neuf :
--
--   les six tables               rls_active = true
--   handle_new_user              security_definer = true
--   on_auth_user_created         présent sur auth.users
--   sessions_exercise_key_fkey   présente
--   app_errors                   3 politiques : dépôt / lecture admin / maj admin
--   admin_audit_log              2 politiques : dépôt admin / lecture admin
--                                ET AUCUNE en DELETE ou UPDATE
--
-- Sur un projet NEUF, le compte d'exercices vaut 0 à ce stade : c'est sql/002
-- qui verse les treize. Enchaîner 001, 002 puis 003, puis relancer
-- `sh tests/lancer_tout.sh base` en ayant pointé assets/supabase-config.js sur
-- le nouveau projet.
-- =============================================================================

select c.relname as "table",
       c.relrowsecurity as rls_active,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as politiques
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and c.relname in ('profiles','sessions','session_steps','exercises',
                     'app_errors','admin_audit_log')
 order by c.relname;

select p.proname as fonction, p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('handle_new_user','is_admin','profiles_garde')
 order by p.proname;

select t.tgname as declencheur, c.relname as sur_table
  from pg_trigger t
  join pg_class c     on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where t.tgname in ('on_auth_user_created','profiles_garde_avant_maj')
 order by t.tgname;

select conname as contrainte,
       pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conname = 'sessions_exercise_key_fkey';

select tablename as "table", policyname as politique,
       cmd as commande, qual as qualification, with_check as verification
  from pg_policies
 where schemaname = 'public' and tablename in ('app_errors','admin_audit_log')
 order by tablename, cmd, policyname;

-- Le contrôle qui compte le plus sur ce fichier : le journal d'audit ne doit
-- offrir AUCUNE porte d'effacement ni de réécriture.
select case when count(*) = 0
            then 'conforme — le journal d''audit est en ajout seul'
            else 'ANOMALIE — ' || count(*) || ' politique(s) DELETE/UPDATE sur admin_audit_log'
       end as verdict_audit
  from pg_policies
 where schemaname = 'public' and tablename = 'admin_audit_log'
   and cmd in ('DELETE','UPDATE');
