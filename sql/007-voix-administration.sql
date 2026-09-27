-- =============================================================================
-- Albatros VFR — 007 : L'ADMINISTRATION DE LA VOIX GOOGLE
-- -----------------------------------------------------------------------------
-- Trois réglages que la console d'administration doit pouvoir changer sans
-- passer par l'éditeur SQL :
--   1. les voix PROPOSÉES aux élèves (une voix désactivée est refusée PAR LA
--      BASE, pas seulement cachée à l'écran), et la voix par défaut ;
--   2. le plafond journalier de caractères (100 000 depuis sql/005) ;
--   3. le plan d'un compte, free ⇄ premium.
--
-- ┌─ QUI PEUT ÉCRIRE ─────────────────────────────────────────────────────────┐
-- │ Le rôle « admin », et lui seul. is_admin() ouvre aussi la LECTURE aux     │
-- │ modérateurs (sql/000) ; ici, on touche à ce qui coûte de l'argent et à    │
-- │ ce qu'un élève obtient — un modérateur n'a pas à le faire. D'où           │
-- │ est_admin_plein(), plus étroite, qui ne sert qu'aux trois fonctions       │
-- │ d'écriture ci-dessous.                                                    │
-- │ Aucune politique d'écriture sur les tables : on n'y écrit QUE par ces     │
-- │ fonctions, et chacune laisse une ligne dans admin_audit_log — un          │
-- │ changement de plan ou de plafond qu'on ne peut pas retracer ne devrait    │
-- │ pas exister.                                                              │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- LE QUOTA N'EST PAS RÉÉCRIT. voix_plafond_jour() lit désormais le réglage
-- (100 000 à défaut) : c'est tout. voix_consommer(n, nom_voix) gagne UN
-- contrôle — la voix est-elle désactivée ? — placé avant tout décompte ; le
-- reste de son corps est celui de sql/006, à l'identique.
--
-- IDEMPOTENT : « if not exists », « create or replace », « drop … if exists ».
-- =============================================================================


-- 1. QUI EST ADMINISTRATEUR, AU SENS PLEIN ------------------------------------
create or replace function public.est_admin_plein() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;
revoke all on function public.est_admin_plein() from public, anon;
grant execute on function public.est_admin_plein() to authenticated;


-- 2. LES RÉGLAGES DE LA VOIX ---------------------------------------------------
-- Une ligne par réglage. Aujourd'hui un seul : le plafond.
create table if not exists public.voix_reglages (
  cle      text primary key check (cle in ('plafond_jour')),
  valeur   integer not null,
  maj_le   timestamptz not null default now(),
  maj_par  uuid references public.profiles(id) on delete set null
);
alter table public.voix_reglages enable row level security;
drop policy if exists "voix : réglages, lecture admin" on public.voix_reglages;
create policy "voix : réglages, lecture admin" on public.voix_reglages
  for select to authenticated using (public.is_admin());

-- `stable` et non plus `immutable` : la valeur vient maintenant d'une table.
-- `security definer` : voix_consommer l'appelle pour le compte de l'élève, qui
-- n'a pas le droit de lire voix_reglages.
create or replace function public.voix_plafond_jour() returns integer
  language sql stable security definer set search_path = public as $$
  select coalesce((select valeur from public.voix_reglages where cle = 'plafond_jour'), 100000)
$$;


-- 3. LES VOIX PROPOSÉES ---------------------------------------------------------
-- Seules les voix qu'on a RÉGLÉES y figurent : une voix absente est active.
-- Ainsi une voix que Google ajoute demain est proposée sans rien faire ici —
-- et il n'y a pas à recopier en base une liste qui vit chez Google.
create table if not exists public.voix_catalogue (
  voix        text primary key
              check (voix ~ '^fr-FR-(Chirp3-HD|Chirp-HD|Neural2|Wavenet|Studio)-[A-Za-z0-9]{1,30}$'),
  active      boolean not null default true,
  par_defaut  boolean not null default false,
  maj_le      timestamptz not null default now(),
  maj_par     uuid references public.profiles(id) on delete set null,
  -- Une voix désactivée ne peut pas être celle par défaut.
  constraint voix_catalogue_defaut_active check (not par_defaut or active)
);
-- Une seule voix par défaut, au plus.
create unique index if not exists voix_catalogue_un_defaut
  on public.voix_catalogue (par_defaut) where par_defaut;

-- Lecture : tout compte connecté. Les Paramètres en ont besoin pour ne
-- proposer que les voix actives et présélectionner celle par défaut. Rien là
-- de personnel : des noms de voix et deux booléens.
alter table public.voix_catalogue enable row level security;
drop policy if exists "voix : catalogue, lecture" on public.voix_catalogue;
create policy "voix : catalogue, lecture" on public.voix_catalogue
  for select to authenticated using (true);


-- 4. LE DÉCOMPTE : UN CONTRÔLE DE PLUS -------------------------------------------
-- Identique à sql/006, sauf le bloc marqué NOUVEAU.
create or replace function public.voix_consommer(n integer, nom_voix text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  moi      uuid := auth.uid();
  profil   record;
  aujourd  date := (now() at time zone 'Europe/Paris')::date;
  plafond  integer := public.voix_plafond_jour();
  total    integer;
  famille  text;
begin
  if moi is null then
    return jsonb_build_object('ok', false, 'raison', 'non_connecte');
  end if;
  if n is null or n < 1 or n > plafond then
    return jsonb_build_object('ok', false, 'raison', 'longueur');
  end if;
  if nom_voix is not null then
    if nom_voix !~ '^fr-FR-(Chirp3-HD|Chirp-HD|Neural2|Wavenet|Studio)-[A-Za-z0-9]{1,30}$' then
      return jsonb_build_object('ok', false, 'raison', 'voix');
    end if;
    famille := substring(nom_voix from '^fr-FR-(Chirp3-HD|Chirp-HD|Neural2|Wavenet|Studio)-');
    -- NOUVEAU (sql/007) : une voix désactivée par l'administration est refusée
    -- ici, AVANT tout décompte. La cacher dans les Paramètres ne suffirait
    -- pas : un réglage déjà enregistré, ou une requête écrite à la main, la
    -- demanderaient encore.
    if exists (select 1 from public.voix_catalogue c where c.voix = nom_voix and not c.active) then
      return jsonb_build_object('ok', false, 'raison', 'voix_desactivee');
    end if;
  end if;

  select plan, status into profil from public.profiles where id = moi;
  if not found or profil.plan is distinct from 'premium' then
    return jsonb_build_object('ok', false, 'raison', 'non_premium');
  end if;
  if profil.status is distinct from 'active' then
    return jsonb_build_object('ok', false, 'raison', 'compte_inactif');
  end if;

  insert into public.voix_consommation as c (user_id, jour, caracteres)
  values (moi, aujourd, n)
  on conflict (user_id, jour) do update
     set caracteres = c.caracteres + excluded.caracteres
   where c.caracteres + excluded.caracteres <= plafond
  returning caracteres into total;

  if total is null then
    select caracteres into total from public.voix_consommation
     where user_id = moi and jour = aujourd;
    return jsonb_build_object('ok', false, 'raison', 'quota',
                              'restant', greatest(plafond - coalesce(total, 0), 0));
  end if;

  if nom_voix is not null then
    insert into public.voix_historique as h (user_id, jour, voix, modele, caracteres, requetes)
    values (moi, aujourd, nom_voix, famille, n, 1)
    on conflict (user_id, jour, voix) do update
       set caracteres = h.caracteres + excluded.caracteres,
           requetes   = h.requetes + 1;
  end if;

  return jsonb_build_object('ok', true, 'restant', plafond - total);
end $$;
revoke all on function public.voix_consommer(integer, text) from public, anon;
grant execute on function public.voix_consommer(integer, text) to authenticated;


-- 5. LES TROIS ÉCRITURES DE L'ADMINISTRATION ---------------------------------------
-- Chacune : refus net sans le rôle « admin », valeurs bornées, une ligne
-- d'audit dans la MÊME transaction — si l'audit échoue, rien n'est changé.

-- 5.1 Une voix : activée ou non, par défaut ou non.
-- Paramètres `activer` / `defaut` et non `active` / `par_defaut` : ce sont aussi
-- des noms de colonnes, et PL/pgSQL refuserait l'instruction ambiguë (sql/006).
create or replace function public.admin_voix_regler(nom_voix text, activer boolean, defaut boolean)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare moi uuid := auth.uid();
begin
  if not public.est_admin_plein() then raise exception 'réservé aux administrateurs' using errcode = '42501'; end if;
  if nom_voix !~ '^fr-FR-(Chirp3-HD|Chirp-HD|Neural2|Wavenet|Studio)-[A-Za-z0-9]{1,30}$' then
    raise exception 'nom de voix invalide' using errcode = '22023';
  end if;
  if defaut and not activer then raise exception 'une voix désactivée ne peut pas être la voix par défaut' using errcode = '22023'; end if;
  -- Une seule voix par défaut : l'ancienne perd son titre.
  if defaut then
    update public.voix_catalogue c set par_defaut = false, maj_le = now(), maj_par = moi
     where c.par_defaut and c.voix <> nom_voix;
  end if;
  insert into public.voix_catalogue (voix, active, par_defaut, maj_le, maj_par)
  values (nom_voix, activer, defaut, now(), moi)
  on conflict (voix) do update
     set active = excluded.active, par_defaut = excluded.par_defaut, maj_le = now(), maj_par = moi;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (moi, 'voix.regler', 'voix', nom_voix, jsonb_build_object('active', activer, 'par_defaut', defaut));
  return jsonb_build_object('ok', true);
end $$;

-- 5.2 Le plafond journalier. Bornes : 1 000 (un ATIS et demi) à 10 millions.
create or replace function public.admin_voix_plafond(nouveau integer)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare moi uuid := auth.uid(); ancien integer := public.voix_plafond_jour();
begin
  if not public.est_admin_plein() then raise exception 'réservé aux administrateurs' using errcode = '42501'; end if;
  if nouveau is null or nouveau < 1000 or nouveau > 10000000 then
    raise exception 'plafond hors bornes (1 000 à 10 000 000)' using errcode = '22023';
  end if;
  insert into public.voix_reglages (cle, valeur, maj_le, maj_par) values ('plafond_jour', nouveau, now(), moi)
  on conflict (cle) do update set valeur = excluded.valeur, maj_le = now(), maj_par = moi;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (moi, 'voix.plafond', 'reglage', 'plafond_jour', jsonb_build_object('avant', ancien, 'apres', nouveau));
  return jsonb_build_object('ok', true, 'plafond', nouveau);
end $$;

-- 5.3 Le plan d'un compte. free ⇄ premium, rien d'autre : un plan inconnu
-- serait un compte gratuit sans le dire (sql/005 compare à 'premium').
create or replace function public.admin_definir_plan(cible uuid, nouveau_plan text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare moi uuid := auth.uid(); ancien text;
begin
  if not public.est_admin_plein() then raise exception 'réservé aux administrateurs' using errcode = '42501'; end if;
  if nouveau_plan is null or nouveau_plan not in ('free', 'premium') then
    raise exception 'plan inconnu (free ou premium)' using errcode = '22023';
  end if;
  select p.plan into ancien from public.profiles p where p.id = cible;
  if not found then raise exception 'compte introuvable' using errcode = 'P0002'; end if;
  -- profiles_garde() laisse passer : l'appelant est administrateur (sql/001 § 4).
  update public.profiles set plan = nouveau_plan where id = cible;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (moi, 'compte.plan', 'profile', cible::text, jsonb_build_object('avant', ancien, 'apres', nouveau_plan));
  return jsonb_build_object('ok', true, 'plan', nouveau_plan);
end $$;

revoke all on function public.admin_voix_regler(text, boolean, boolean) from public, anon;
revoke all on function public.admin_voix_plafond(integer) from public, anon;
revoke all on function public.admin_definir_plan(uuid, text) from public, anon;
grant execute on function public.admin_voix_regler(text, boolean, boolean) to authenticated;
grant execute on function public.admin_voix_plafond(integer) to authenticated;
grant execute on function public.admin_definir_plan(uuid, text) to authenticated;
