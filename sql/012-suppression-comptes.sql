-- =============================================================================
-- Albatros VFR — sql/012 : SUPPRIMER UN COMPTE, ET BLOQUER UNE ADRESSE (30/09/2026)
-- -----------------------------------------------------------------------------
-- Décision du développeur, 30/09/2026. Deux actions dans Admin › Utilisateurs :
--   · SUPPRIMER          — le compte disparaît de Supabase (auth.users, donc
--                          profil, séances, avis, quota de voix par cascade) ;
--                          la personne peut se réinscrire avec la même adresse ;
--   · SUPPRIMER ET BLOQUER — la même chose, et l'adresse ne peut plus créer de
--                          compte pendant 3 ans. Le site répond alors
--                          « Une erreur est survenue. Réessayez plus tard. » —
--                          sans dire qu'il y a un blocage, ni qui l'a posé.
--
-- ┌─ POURQUOI EN SQL, ET PAS DANS UNE EDGE FUNCTION ─────────────────────────┐
-- │ Supprimer un utilisateur par l'API d'Auth exige la clé service_role —    │
-- │ une clé qui passe outre TOUTE la RLS. Une fonction de la base en        │
-- │ `security definer` fait la même chose (delete from auth.users, que      │
-- │ Supabase documente) SANS qu'aucune clé secrète n'existe hors de la      │
-- │ base, et dans UNE transaction : blocage, archivage, journal et          │
-- │ suppression réussissent ensemble ou pas du tout.                        │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ L'ADRESSE BLOQUÉE N'EST PAS STOCKÉE ────────────────────────────────────┐
-- │ Seule son EMPREINTE (SHA-256 de l'adresse normalisée) l'est : on peut    │
-- │ vérifier qu'une adresse est bloquée, pas relire lesquelles le sont.     │
-- │ Normalisation : minuscules, espaces retirés, et le suffixe « +… » de la │
-- │ partie locale retiré (jean+2@x.fr = jean@x.fr) — sinon le blocage se    │
-- │ contournait en une touche. Les points de Gmail ne sont PAS retirés :    │
-- │ ailleurs, jean.dupont et jeandupont sont deux personnes.                │
-- │ Durée : 3 ans (RGPD, limitation de la conservation), puis la ligne est  │
-- │ effacée au passage suivant. Le pseudo du compte est gardé à côté, pour  │
-- │ que l'administrateur reconnaisse la ligne et puisse la débloquer.       │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ LE REFUS À L'INSCRIPTION : UN HOOK D'AUTH, PAS UN DÉCLENCHEUR ──────────┐
-- │ hook_avant_creation_compte() est un « Before User Created Hook » de      │
-- │ Supabase Auth : Auth l'appelle AVANT de créer le compte, quelle que soit │
-- │ la méthode (code par e-mail, mot de passe…), et renvoie son message au  │
-- │ site. Un déclencheur sur auth.users aurait marché aussi, mais Supabase   │
-- │ déconseille d'en poser de nouveaux sur son schéma, et son refus sortait │
-- │ en « Database error saving new user ».                                  │
-- │ CE FICHIER NE SUFFIT PAS : le hook s'ACTIVE dans la configuration Auth  │
-- │ du projet (hook_before_user_created_uri), voir assets/admin/README.md. │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- L'HISTORIQUE DE VOIX d'un compte supprimé est gardé SANS NOM
-- (voix_historique_anonyme) : il disparaissait avec le compte, et les coûts
-- de la console baissaient après coup. Même logique que les paiements
-- (sql/008) : une trace de dépense n'est pas une donnée de la personne.
--
-- Réservé à l'administrateur PLEIN (est_admin_plein, sql/007). Refusé sur son
-- propre compte, et sur un compte qui a un rôle (admin, modérateur…) : on lui
-- retire d'abord son rôle — le journal d'audit le référence peut-être.
--
-- IDEMPOTENT : « if not exists », « create or replace ».
-- =============================================================================


-- 1. L'EMPREINTE D'UNE ADRESSE ------------------------------------------------
-- sha256() est une fonction de PostgreSQL (≥ 11) : aucune extension.
create or replace function public.empreinte_email(adresse text) returns text
  language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(
           regexp_replace(lower(btrim(coalesce(adresse, ''))), '\+[^@]*@', '@'),
         'UTF8')), 'hex')
$$;
revoke all on function public.empreinte_email(text) from public, anon, authenticated;


-- 2. LES ADRESSES BLOQUÉES ----------------------------------------------------
create table if not exists public.comptes_bloques (
  id          bigserial primary key,
  empreinte   text not null unique check (empreinte ~ '^[0-9a-f]{64}$'),
  libelle     text check (char_length(libelle) <= 40),     -- le pseudo du compte supprimé
  bloque_le   timestamptz not null default now(),
  expire_le   timestamptz not null default now() + interval '3 years',
  bloque_par  uuid references public.profiles(id) on delete set null
);
-- Aucune politique : personne ne lit ni n'écrit la table directement.
-- Seules les fonctions ci-dessous, en security definer, y touchent.
alter table public.comptes_bloques enable row level security;
revoke all on public.comptes_bloques from anon, authenticated;


-- 3. L'HISTORIQUE DE VOIX SANS NOM --------------------------------------------
create table if not exists public.voix_historique_anonyme (
  jour        date    not null,
  voix        text    not null,
  modele      text    not null,
  caracteres  integer not null default 0 check (caracteres >= 0),
  requetes    integer not null default 0 check (requetes >= 0),
  primary key (jour, voix)
);
alter table public.voix_historique_anonyme enable row level security;
revoke all on public.voix_historique_anonyme from anon;
drop policy if exists "voix : historique anonyme, lecture admin" on public.voix_historique_anonyme;
create policy "voix : historique anonyme, lecture admin" on public.voix_historique_anonyme
  for select to authenticated
  using (public.is_admin());


-- 4. LE HOOK D'INSCRIPTION ----------------------------------------------------
-- Rend {} pour laisser passer, {error:{http_code,message}} pour refuser.
-- Le message est VOLONTAIREMENT celui d'une panne passagère (décision du
-- développeur) : rien n'y dit qu'un blocage existe.
create or replace function public.hook_avant_creation_compte(event jsonb) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  adresse text := event -> 'user' ->> 'email';
begin
  delete from public.comptes_bloques where expire_le < now();   -- la durée de 3 ans, tenue ici
  if coalesce(btrim(adresse), '') <> ''
     and exists (select 1 from public.comptes_bloques where empreinte = public.empreinte_email(adresse)) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 500,
      'message', 'Une erreur est survenue. Réessayez plus tard.'));
  end if;
  return '{}'::jsonb;
end $$;
revoke all on function public.hook_avant_creation_compte(jsonb) from public, anon, authenticated;
-- Le rôle d'Auth n'existe que sur Supabase (pas sur le banc d'essai PGlite).
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.hook_avant_creation_compte(jsonb) to supabase_auth_admin;
  end if;
end $$;


-- 5. SUPPRIMER UN COMPTE ------------------------------------------------------
-- `confirmation` : l'adresse du compte, retapée par l'administrateur. Vérifiée
-- ICI, pas seulement dans la page : un clic égaré ne supprime rien.
create or replace function public.admin_compte_supprimer(cible uuid, bloquer boolean, confirmation text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  moi uuid := auth.uid();
  adresse text;
  p record;
begin
  if not public.est_admin_plein() then raise exception 'réservé aux administrateurs' using errcode = '42501'; end if;
  if cible is null or cible = moi then raise exception 'impossible de supprimer son propre compte' using errcode = '42501'; end if;
  select u.email into adresse from auth.users u where u.id = cible;
  if not found then raise exception 'compte introuvable' using errcode = 'P0002'; end if;
  select pr.pseudo, pr.role into p from public.profiles pr where pr.id = cible;
  if coalesce(p.role, 'user') <> 'user' then
    raise exception 'ce compte a un rôle (%) : retirez-le d''abord', p.role using errcode = '42501';
  end if;
  if adresse is null or lower(btrim(coalesce(confirmation, ''))) <> lower(btrim(adresse)) then
    raise exception 'la confirmation ne correspond pas à l''adresse du compte' using errcode = '22023';
  end if;

  -- L'historique de voix, sans nom, AVANT la cascade qui l'emporterait.
  insert into public.voix_historique_anonyme (jour, voix, modele, caracteres, requetes)
    select jour, voix, max(modele), sum(caracteres), sum(requetes)
      from public.voix_historique where user_id = cible group by jour, voix
  on conflict (jour, voix) do update
    set caracteres = voix_historique_anonyme.caracteres + excluded.caracteres,
        requetes   = voix_historique_anonyme.requetes   + excluded.requetes;

  if bloquer then
    insert into public.comptes_bloques (empreinte, libelle, bloque_par)
      values (public.empreinte_email(adresse), left(p.pseudo, 40), moi)
    on conflict (empreinte) do update
      set libelle = excluded.libelle, bloque_par = excluded.bloque_par,
          bloque_le = now(), expire_le = now() + interval '3 years';
  end if;

  -- Le journal ne garde NI l'adresse NI le pseudo : le compte est effacé,
  -- sa trace ne doit pas le faire revivre. L'identifiant suffit à relier.
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
    values (moi, case when bloquer then 'compte.supprime_bloque' else 'compte.supprime' end,
            'profile', cible::text, jsonb_build_object('bloque', bloquer));

  -- La cascade fait le reste : profil, séances et leurs échanges, avis, quota
  -- et historique de voix ; paiements et erreurs gardés, user_id vidé.
  delete from auth.users where id = cible;
  return jsonb_build_object('ok', true, 'bloque', bloquer);
end $$;
revoke all on function public.admin_compte_supprimer(uuid, boolean, text) from public, anon;
grant execute on function public.admin_compte_supprimer(uuid, boolean, text) to authenticated;


-- 6. LA LISTE DES ADRESSES BLOQUÉES, ET LE DÉBLOCAGE --------------------------
create or replace function public.admin_comptes_bloques()
  returns table (id bigint, libelle text, bloque_le timestamptz, expire_le timestamptz, bloque_par text)
  language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin_plein() then raise exception 'réservé aux administrateurs' using errcode = '42501'; end if;
  delete from public.comptes_bloques b where b.expire_le < now();
  return query
    select b.id, b.libelle, b.bloque_le, b.expire_le, pr.pseudo
      from public.comptes_bloques b left join public.profiles pr on pr.id = b.bloque_par
     order by b.bloque_le desc;
end $$;
revoke all on function public.admin_comptes_bloques() from public, anon;
grant execute on function public.admin_comptes_bloques() to authenticated;

create or replace function public.admin_compte_debloquer(ligne bigint)
  returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin_plein() then raise exception 'réservé aux administrateurs' using errcode = '42501'; end if;
  delete from public.comptes_bloques where id = ligne;
  if not found then raise exception 'blocage introuvable' using errcode = 'P0002'; end if;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'compte.debloque', 'blocage', ligne::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_compte_debloquer(bigint) from public, anon;
grant execute on function public.admin_compte_debloquer(bigint) to authenticated;
