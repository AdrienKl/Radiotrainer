-- =============================================================================
-- Albatros VFR — 003 : is_admin() ET LA PROTECTION DU CATALOGUE
-- -----------------------------------------------------------------------------
-- Ce fichier ne change RIEN à la base de production. Il y est déjà — à la main.
-- Il existe pour que les migrations DÉCRIVENT enfin ce qui tourne.
--
-- ┌─ POURQUOI CE FICHIER EXISTE ────────────────────────────────────────────┐
-- │ `public.is_admin()` est appelée par QUATRE politiques de                │
-- │ sql/002-progression.sql — et n'est définie dans AUCUNE migration. Elle   │
-- │ ne vit que dans assets/admin/README.md, c'est-à-dire dans de la          │
-- │ documentation. Sur la base actuelle elle existe, parce qu'elle y a été   │
-- │ créée à la main.                                                         │
-- │                                                                          │
-- │ De même, `public.exercises` est protégée en production, mais aucune      │
-- │ migration n'active sa RLS ni ne pose ses politiques.                     │
-- │                                                                          │
-- │ CE QUE ÇA COÛTE LE JOUR OÙ ON REJOUE LES MIGRATIONS AILLEURS — et c'est  │
-- │ précisément ce qu'on veut faire pour avoir un projet de TEST :           │
-- │   · les quatre politiques admin de sql/002 échouent, la migration        │
-- │     s'arrête ;                                                           │
-- │   · si on les retire pour passer outre, `exercises` se retrouve SANS RLS │
-- │     — donc modifiable par quiconque a la clé publiable, qui est dans le  │
-- │     code source du site.                                                 │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- IDEMPOTENT : « create or replace », « enable row level security » (sans effet
-- si déjà activée), « drop policy if exists » avant chaque création. Le jouer
-- sur la base actuelle ne doit rien changer — c'est même le contrôle : si
-- quelque chose bouge, c'est que la base et ce fichier ne disaient pas la même
-- chose, et il faut comprendre laquelle des deux a raison avant de continuer.
--
-- Prérequis : sql/001-inscription.sql, et les tables décrites par
-- assets/admin/README.md § 4.2.
-- =============================================================================


-- =============================================================================
-- 0. À LIRE AVANT DE JOUER LE RESTE
-- -----------------------------------------------------------------------------
-- Ces deux requêtes ne modifient rien. Elles disent ce que la base a
-- AUJOURD'HUI, pour qu'on sache ce que la suite va changer — ou pas.
--
-- Le point à regarder : les NOMS des politiques. Ce fichier retire puis recrée
-- « exercice : lecture » et « exercice : écriture admin ». Si la base porte les
-- mêmes règles sous d'autres noms, les siennes resteront EN PLUS des nôtres.
-- Les politiques se cumulent par OU : rien ne devient plus permissif que la
-- plus permissive des deux, mais on se retrouve avec des doublons. Dans ce cas,
-- retirer les anciennes à la main après contrôle.
-- =============================================================================

select p.proname as fonction,
       pg_get_function_result(p.oid) as retour,
       p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('is_admin','profiles_garde');

select c.relname as "table",
       c.relrowsecurity as rls_active,
       pol.policyname as politique,
       pol.cmd as commande,
       pol.qual as qualification,
       pol.with_check as verification
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policies pol on pol.schemaname = n.nspname and pol.tablename = c.relname
 where n.nspname = 'public' and c.relname = 'exercises'
 order by pol.cmd, pol.policyname;


-- =============================================================================
-- 1. is_admin()
-- -----------------------------------------------------------------------------
-- Le rôle est lu EN BASE, jamais dans un champ du jeton : le client peut
-- influencer son jeton, il ne peut pas influencer une ligne de `profiles`.
--
-- `security definer` : appelée depuis une politique portant sur `profiles`,
-- elle doit lire `profiles` SANS repasser par RLS — sinon PostgreSQL s'arrête
-- sur « infinite recursion detected in policy for relation profiles ».
--
-- `set search_path = public` : sans lui, quelqu'un qui peut créer un schéma
-- devant `public` dans le chemin de recherche pourrait faire résoudre
-- `profiles` vers SA table. C'est le détournement classique d'une fonction
-- `security definer`, et il se referme par cette seule ligne.
--
-- Copie conforme de assets/admin/README.md. Ne pas la « simplifier ».
-- =============================================================================

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and role in ('admin','moderator'))
$$;


-- =============================================================================
-- 2. LE CATALOGUE D'EXERCICES
-- -----------------------------------------------------------------------------
-- `public.exercises` porte les métadonnées de pilotage : la clé, le titre, la
-- catégorie, l'ordre, et le drapeau `is_active`. Le déroulé des scénarios, lui,
-- reste dans le code (assets/donnees/phraseologie-scenarios.js) — la base ne
-- contient AUCUNE phraséologie.
--
-- LECTURE PAR TOUS : le catalogue n'a rien de confidentiel, et la console
-- d'administration comme l'application doivent pouvoir le lire. `using (true)`.
--
-- ÉCRITURE PAR LES SEULS ADMINISTRATEURS : une table sans politique d'écriture
-- reste protégée tant que RLS est active, mais on l'écrit explicitement — pour
-- que l'intention se lise, et pour que la console d'admin puisse y toucher.
--
-- CE QUI EST EN JEU SI CETTE PROTECTION TOMBE : `sessions.exercise_key` porte
-- une clé étrangère vers `exercises(key)`. Quelqu'un qui pourrait écrire ici
-- ne volerait aucune donnée — il empêcherait l'enregistrement des séances, ou
-- réécrirait les titres que les élèves voient dans leur historique.
-- =============================================================================

alter table public.exercises enable row level security;

drop policy if exists "exercice : lecture" on public.exercises;
create policy "exercice : lecture" on public.exercises
  for select using (true);

drop policy if exists "exercice : écriture admin" on public.exercises;
create policy "exercice : écriture admin" on public.exercises
  for all using (public.is_admin()) with check (public.is_admin());


-- =============================================================================
-- 3. CE QUE LA BASE RÉPOND UNE FOIS LE FICHIER JOUÉ
-- -----------------------------------------------------------------------------
-- Attendu :
--   is_admin           | boolean | security_definer = true
--   exercises          | rls_active = true
--   « exercice : lecture »        SELECT  qual = true
--   « exercice : écriture admin » ALL     qual = is_admin()  check = is_admin()
--
-- Et le compte d'exercices doit valoir TREIZE. S'il en affiche sept, c'est que
-- sql/002-progression.sql n'a jamais été joué — six scénarios enregistrent
-- alors leurs séances sans rattachement au catalogue, l'historique les affiche
-- « Scénario » au lieu de leur nom, et « Refaire ce scénario » ne marche pas
-- dessus. Jouer sql/002-progression.sql, puis revérifier.
-- =============================================================================

select p.proname as fonction, p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'is_admin';

select c.relname as "table", c.relrowsecurity as rls_active
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'exercises';

select policyname as politique, cmd as commande, qual as qualification, with_check as verification
  from pg_policies
 where schemaname = 'public' and tablename = 'exercises'
 order by cmd, policyname;

select count(*) as exercices_au_catalogue,
       case when count(*) = 13 then 'complet'
            else 'INCOMPLET — jouer sql/002-progression.sql' end as verdict
  from public.exercises;
