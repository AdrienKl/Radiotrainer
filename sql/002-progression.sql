-- =============================================================================
-- RadioTrainer — MIGRATION « LA PROGRESSION VIT EN BASE »
-- À exécuter UNE FOIS dans Supabase → SQL Editor, d'un seul bloc.
-- Prérequis : le schéma d'assets/admin/README.md § 4.2 et sql/001-inscription.sql.
-- -----------------------------------------------------------------------------
-- Le fichier est idempotent : « if not exists », « create or replace »,
-- « on conflict do update », « drop policy if exists ». Le relancer ne casse
-- rien et ne duplique rien.
--
-- ┌─ CE QUE CETTE MIGRATION CHANGE ─────────────────────────────────────────┐
-- │ 1. Elle RÉPARE une perte de données silencieuse : six scénarios sur     │
-- │    treize étaient refusés par la base depuis toujours (§ 1).            │
-- │ 2. Elle ajoute UNE colonne, `profiles.etat_vol`, pour qu'un vol         │
-- │    interrompu se reprenne depuis un autre navigateur (§ 2).             │
-- │ 3. Elle ajoute la vue v_daily_practice, s'assure que les trois autres   │
-- │    vues sont là, et réécrit les politiques RLS (§ 3 et § 4).            │
-- │    Sur une base déjà montée, § 4 ne fait que confirmer l'existant —     │
-- │    à deux corrections près, signalées sur place.                        │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ CE QUI EST DÉLIBÉRÉMENT ABSENT ────────────────────────────────────────┐
-- │ · Aucune table « progression », « badges », « statistiques » ni         │
-- │   « série ». Tout cela se DÉDUIT de `sessions` : une seconde source de  │
-- │   vérité à tenir synchronisée finirait par diverger de la première, et  │
-- │   c'est toujours la copie qu'on croit.                                  │
-- │ · Aucune table « jours de pratique ». Une vue donne la même chose sans  │
-- │   rien à écrire, à migrer ni à réparer.                                 │
-- │ · Aucun droit accordé à `anon`. Tout ce qui suit exige une session.     │
-- └─────────────────────────────────────────────────────────────────────────┘
-- =============================================================================


-- =============================================================================
-- 1. LE CATALOGUE COMPLET      ← LA RAISON PRINCIPALE DE CE FICHIER
-- -----------------------------------------------------------------------------
-- `sessions.exercise_key` porte une clé étrangère vers `exercises(key)`. Le
-- catalogue posé à l'origine ne contenait que SEPT clés, alors que le code en
-- compte TREIZE (constante SCENARIOS, index.html). Conséquence, jamais visible
-- à l'écran : toute séance de « Point d'attente », « Après atterrissage »,
-- « Transit VFR », « Remise de gaz », « Expressions conventionnelles » ou
-- « Nombres, sigles et indicatifs » était REFUSÉE par la base — code 23503,
-- violation de clé étrangère.
--
-- Et le refus était définitif : assets/sync.js classe à juste titre une erreur
-- PostgreSQL comme non rejouable (la même requête échouera pareil dans dix ans)
-- et jette la séance au lieu de la remettre en file. Six scénarios sur treize
-- n'ont donc JAMAIS rien enregistré. Personne ne pouvait s'en apercevoir :
-- l'historique local, lui, les gardait.
--
-- Les six clés manquantes sont ajoutées ici. Les sept autres sont rafraîchies
-- au passage, pour que le titre affiché par la console suive celui du code.
--
-- `manual_ref` reste NULL, pour la raison donnée dans le README § 4.5 : le
-- renvoi au manuel DSNA n'existe pas au niveau du scénario mais au niveau de
-- chaque échange. Mettre une page approximative ici reviendrait à inventer une
-- source.
-- =============================================================================
insert into public.exercises (key, title, category, level, station, is_active, sort_order) values
  ('roulage',      'Mise en route + roulage',                'sol',     'debutant', 'sol',         true,  10),
  ('decollage',    'Décollage',                              'depart',  'debutant', 'tour',        true,  20),
  ('pointattente', 'Point d''attente et traversée de piste',  'sol',     'debutant', 'tour',        true,  25),
  ('tourdepiste',  'Tour de piste',                          'circuit', 'debutant', 'tour',        true,  30),
  ('remisegaz',    'Remise de gaz',                          'circuit', 'debutant', 'tour',        true,  35),
  ('integration',  'Intégration + atterrissage',             'arrivee', 'debutant', 'tour',        true,  40),
  ('apresatt',     'Après atterrissage',                     'arrivee', 'debutant', 'sol',         true,  45),
  ('navigation',   'Navigation / croisière',                 'enroute', 'debutant', 'information', true,  50),
  ('transit',      'Transit VFR d''un espace contrôlé',       'enroute', 'debutant', 'tour',        true,  55),
  ('urgence',      'Urgence (Mayday / Pan Pan)',             'urgence', 'reel',     'tour',        true,  60),
  ('panneradio',   'Panne radio (procédure)',                'urgence', 'reel',     null,          true,  70),
  ('vocabulaire',  'Expressions conventionnelles',           'quiz',    'debutant', null,          true,  80),
  ('nombres',      'Nombres, sigles et indicatifs',          'quiz',    'debutant', null,          true,  90)
on conflict (key) do update
  set title      = excluded.title,
      category   = excluded.category,
      level      = excluded.level,
      station    = excluded.station,
      is_active  = excluded.is_active,
      sort_order = excluded.sort_order,
      updated_at = now();


-- =============================================================================
-- 2. LE VOL INTERROMPU
-- -----------------------------------------------------------------------------
-- Un vol qu'on abandonne au milieu se reprenait grâce à une clé du stockage
-- local (`rt-vol-en-cours`) : il ne se reprenait donc que sur le navigateur où
-- il avait été commencé. Une colonne jsonb sur le profil suffit à le rendre
-- portable — une seule ligne par personne, écrasée à chaque échange.
--
-- POURQUOI PAS DANS `settings` : `settings` est le sac des préférences, relu et
-- réécrit en entier à chaque réglage. Y loger un état qui change à chaque
-- échange d'un vol ferait réécrire les préférences des dizaines de fois par
-- séance, et une écriture malheureuse emporterait le thème avec le vol.
--
-- POURQUOI PAS `sessions.status='in_progress'` : cette ligne-là existe déjà et
-- sert à COMPTER les abandons. Elle ne porte pas de quoi REJOUER le vol — ni la
-- météo tirée au sort, ni la position dans le déroulé, ni les réponses déjà
-- données. Ce sont deux besoins différents, et les confondre obligerait à
-- gonfler `sessions` d'un état de travail qui n'intéresse aucune statistique.
--
-- Aucune politique RLS à écrire : c'est une colonne de `profiles`, déjà couverte
-- par « profil : lecture de soi » et « profil : mise à jour de soi ».
-- =============================================================================
alter table public.profiles
  add column if not exists etat_vol jsonb;

comment on column public.profiles.etat_vol is
  'Vol en cours, repris depuis n''importe quel navigateur. NULL = aucun vol interrompu. Écrit par le client, effacé à l''arrivée.';

-- Borne de taille. Un jsonb n'a pas de limite propre, et rien n'empêcherait un
-- client modifié d'y pousser des mégaoctets — la colonne est écrite à chaque
-- échange, elle est le meilleur endroit pour faire enfler une base sans qu'on
-- le voie. 40 ko laissent très largement la place à un vol complet.
alter table public.profiles drop constraint if exists profils_etat_vol_borne;
alter table public.profiles add  constraint profils_etat_vol_borne
  check (etat_vol is null or pg_column_size(etat_vol) <= 40960);


-- =============================================================================
-- 3. LES VUES
-- -----------------------------------------------------------------------------
-- Rappel, et ce n'est pas décoratif : `security_invoker = true` fait exécuter la
-- vue avec les droits de CELUI QUI L'INTERROGE. Sans cette option, une vue
-- s'exécute avec ceux de son propriétaire — ici l'administrateur — les
-- politiques RLS des tables du dessous ne s'appliquent plus, et n'importe quel
-- compte connecté lirait la progression de tout le monde. Ne la retirez d'aucune.
--
-- v_daily_activity est ce qui remplace la clé locale `rt-jours` : la série de
-- jours consécutifs se recalcule à partir d'elle, et il n'y a donc aucune liste
-- de dates à tenir, à réparer ni à migrer.
-- =============================================================================
create or replace view public.v_daily_activity with (security_invoker = true) as
  select user_id, started_at::date as day, count(*) as sessions
    from public.sessions where status <> 'in_progress'
   group by 1, 2;

-- v_daily_practice : les jours où quelque chose a été MENÉ AU BOUT.
-- Elle ne double pas v_daily_activity, elle répond à une autre question, et les
-- confondre donnerait de fausses récompenses :
--   · v_daily_activity  = fréquentation. Une séance ouverte puis fermée compte.
--     C'est ce qu'il faut à la console d'administration.
--   · v_daily_practice  = pratique. Seules les séances terminées comptent.
--     C'est ce qui nourrit la série de jours consécutifs affichée à l'élève —
--     et c'était déjà la règle du stockage local, où la journée n'était marquée
--     qu'au récapitulatif de fin.
-- Ouvrir l'application trois jours de suite sans rien finir ne doit pas
-- débloquer le badge « Régularité ».
create or replace view public.v_daily_practice with (security_invoker = true) as
  select user_id, started_at::date as day, count(*) as sessions
    from public.sessions where status = 'completed'
   group by 1, 2;

create or replace view public.v_missed_items with (security_invoker = true) as
  select s.user_id, s.id as session_id, s.kind, s.started_at, m.label
    from public.session_steps st
    join public.sessions s on s.id = st.session_id
   cross join lateral unnest(st.missed) as m(label);

create or replace view public.v_user_progress with (security_invoker = true) as
  select user_id,
         count(*) as sessions,
         count(*) filter (where kind = 'flight') as flights,
         sum(coalesce(duration_s, 0)) as training_s,
         case when sum(score_total) > 0
              then round(sum(score_ok)::numeric * 100 / sum(score_total))::int end as avg_pct,
         max(started_at) as last_seen_at
    from public.sessions
   group by user_id;


-- =============================================================================
-- 4. ROW LEVEL SECURITY — CONFIRMATION
-- -----------------------------------------------------------------------------
-- Ces politiques existent déjà si le schéma du README § 4.4 a été posé. On les
-- réécrit ici pour deux raisons : une base neuve part complète d'un seul
-- fichier, et surtout, c'est ICI que se joue la promesse « personne ne voit les
-- données d'un autre ». Une promesse pareille se relit à un seul endroit.
--
-- `drop policy if exists` puis `create` : PostgreSQL ne connaît pas
-- « create policy if not exists », et rejouer le fichier ne doit pas échouer.
--
-- IMPORTANT : la suppression suivie de la création laisse, le temps de la
-- transaction, une table sans cette politique. Comme tout le bloc s'exécute
-- dans UNE transaction (l'éditeur SQL de Supabase enveloppe le script), aucune
-- requête concurrente ne peut se glisser dans l'intervalle.
-- =============================================================================
alter table public.profiles      enable row level security;
alter table public.sessions      enable row level security;
alter table public.session_steps enable row level security;

-- --- profiles : sa propre ligne, et rien d'autre ---
drop policy if exists "profil : lecture de soi"     on public.profiles;
create policy "profil : lecture de soi"     on public.profiles for select using (id = auth.uid());
drop policy if exists "profil : mise à jour de soi" on public.profiles;
create policy "profil : mise à jour de soi" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profil : lecture admin"      on public.profiles;
create policy "profil : lecture admin"      on public.profiles for select using (public.is_admin());
drop policy if exists "profil : maj admin"          on public.profiles;
create policy "profil : maj admin"          on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- --- sessions ---
-- La politique de MISE À JOUR mérite un mot : `using` dit quelles lignes on a le
-- droit de toucher, `with check` dit ce qu'elles ont le droit de devenir. Sans
-- le second, on pourrait prendre sa propre séance et la RÉATTRIBUER à quelqu'un
-- d'autre en changeant user_id — la ligne partirait dans le compte du voisin.
-- Le README d'origine ne posait que `using`. C'est corrigé ici.
drop policy if exists "séance : lecture de soi"  on public.sessions;
create policy "séance : lecture de soi"  on public.sessions for select using (user_id = auth.uid());
drop policy if exists "séance : écriture de soi" on public.sessions;
create policy "séance : écriture de soi" on public.sessions for insert with check (user_id = auth.uid());
drop policy if exists "séance : maj de soi"      on public.sessions;
create policy "séance : maj de soi"      on public.sessions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Effacer ses propres données est un droit (RGPD art. 17), et le bouton « Tout
-- effacer » des Paramètres en a besoin : sans politique DELETE, il n'effaçait
-- que le navigateur et tout revenait à la connexion suivante.
drop policy if exists "séance : effacement de soi" on public.sessions;
create policy "séance : effacement de soi" on public.sessions for delete using (user_id = auth.uid());
drop policy if exists "séance : lecture admin"   on public.sessions;
create policy "séance : lecture admin"   on public.sessions for select using (public.is_admin());

-- --- session_steps : on passe par la séance parente ---
-- Il n'y a pas de user_id ici, et c'est volontaire : le propriétaire d'un
-- échange est celui de sa séance, point. Le dupliquer ouvrirait la possibilité
-- que les deux se contredisent.
drop policy if exists "échange : lecture de soi"  on public.session_steps;
create policy "échange : lecture de soi"  on public.session_steps for select
  using (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()));
drop policy if exists "échange : écriture de soi" on public.session_steps;
create policy "échange : écriture de soi" on public.session_steps for insert
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()));
-- upsert = insert ... on conflict do UPDATE : sans politique UPDATE, réémettre
-- une séance après une coupure échouait sur ses échanges déjà présents.
drop policy if exists "échange : maj de soi"      on public.session_steps;
create policy "échange : maj de soi"      on public.session_steps for update
  using (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()));
drop policy if exists "échange : effacement de soi" on public.session_steps;
create policy "échange : effacement de soi" on public.session_steps for delete
  using (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()));
drop policy if exists "échange : lecture admin"   on public.session_steps;
create policy "échange : lecture admin"   on public.session_steps for select using (public.is_admin());


-- =============================================================================
-- 5. INDEX
-- -----------------------------------------------------------------------------
-- La requête que le client pose à CHAQUE connexion est « mes séances, les plus
-- récentes d'abord ». L'index existe déjà si le README a été suivi ; on le
-- confirme, parce que sans lui cette requête devient un balayage complet de la
-- table dès que la base grossit.
-- =============================================================================
create index if not exists sessions_user_started_idx
  on public.sessions (user_id, started_at desc);
create index if not exists session_steps_session_idx
  on public.session_steps (session_id, idx);


-- =============================================================================
-- 6. VÉRIFICATION
-- -----------------------------------------------------------------------------
-- Attendu :
--   · treize lignes dans `exercises` ;
--   · `etat_vol` présente sur `profiles` ;
--   · les quatre vues en security_invoker.
-- =============================================================================
select 'exercices' as quoi, count(*)::text as valeur from public.exercises
union all
select 'colonne etat_vol', case when exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='profiles' and column_name='etat_vol')
  then 'présente' else 'ABSENTE' end
union all
select 'vues security_invoker', count(*)::text from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname='public' and c.relkind='v'
   and c.relname in ('v_daily_activity','v_daily_practice','v_missed_items','v_user_progress')
   and c.reloptions::text like '%security_invoker=true%';
