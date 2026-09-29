-- =============================================================================
-- Albatros VFR — 008 : LE PREMIUM PAYANT (base seulement, Stripe pas encore branché)
-- -----------------------------------------------------------------------------
-- Offre : 17,99 €, paiement unique, 3 mois de Premium, aucun renouvellement.
-- Ce fichier prépare la base ; aucune Edge Function ne l'appelle encore.
--
--   1. profiles.premium_jusqua — la fin du Premium.
--   2. premium_actif(uid) — LA définition du Premium, lue par voix_consommer.
--   3. paiements — une ligne par session Stripe, jamais deux.
--   4. premium_fin_apres() + stripe_crediter() — le crédit, en une transaction.
--   5. profiles_garde() — plan, premium_jusqua et role au seul admin plein.
--   6. admin_definir_plan() — un Premium offert est un Premium SANS FIN.
--   7. admin_premium_actifs() — le compteur de la console, sans les expirés.
--
-- ┌─ EXPIRATION PAR DATE, PAS PAR BASCULE (décision du 29/09/2026) ──────────┐
-- │ `plan` ne repasse jamais tout seul à 'free'. Est Premium le compte dont   │
-- │ plan = 'premium' ET premium_jusqua est vide ou dans le futur. Aucune      │
-- │ tâche planifiée : une tâche qui ne tourne pas une nuit laisserait des     │
-- │ comptes Premium à tort, sans que rien ne le dise. Ici l'expiration est    │
-- │ exacte à la seconde, parce qu'elle est une comparaison.                   │
-- │ premium_jusqua VIDE = Premium SANS FIN : les comptes offerts à la main    │
-- │ par l'administration. Tous les Premium d'avant ce fichier le sont : la    │
-- │ colonne naît vide, ils ne perdent rien.                                   │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ LA FAILLE FERMÉE ICI (trouvée le 29/09/2026) ────────────────────────────┐
-- │ is_admin() vaut aussi pour les MODÉRATEURS (sql/000). profiles_garde()    │
-- │ (sql/001) laissait donc un modérateur, par la politique « profil : maj    │
-- │ admin », écrire plan ET role sur n'importe quel compte : se donner le     │
-- │ Premium, ou se nommer admin. Sans conséquence tant que le Premium était   │
-- │ gratuit et qu'aucun modérateur n'existait ; plus acceptable dès qu'il se  │
-- │ vend. plan, premium_jusqua et role passent au seul admin plein            │
-- │ (est_admin_plein, sql/007). Le modérateur garde ce qu'il avait d'autre :  │
-- │ status (suspendre un compte) et les jalons.                               │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- IDEMPOTENT : « if not exists », « create or replace », « drop … if exists ».
-- =============================================================================


-- 1. LA FIN DU PREMIUM ---------------------------------------------------------
alter table public.profiles add column if not exists premium_jusqua timestamptz;
comment on column public.profiles.premium_jusqua is
  'Fin du Premium. NULL avec plan = premium : Premium sans fin (offert). Voir premium_actif().';


-- 2. LA DÉFINITION DU PREMIUM ----------------------------------------------------
-- Une seule, ici. Quiconque doit savoir si un compte est Premium l'appelle —
-- voix_consommer aujourd'hui, la console et les Edge Functions demain. La
-- recopier (plan = 'premium' and …) ailleurs, c'est la garantie qu'un jour
-- deux endroits diront deux choses.
-- `security definer` : appelée depuis d'autres fonctions pour le compte d'un
-- élève. FERMÉE aux rôles anon et authenticated : elle dirait le statut de
-- n'importe quel compte dont on connaît l'identifiant. Un élève lit le sien
-- dans sa propre ligne de profiles (plan, premium_jusqua).
create or replace function public.premium_actif(uid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = uid
       and p.plan = 'premium'
       and (p.premium_jusqua is null or p.premium_jusqua > now())
  )
$$;
revoke all on function public.premium_actif(uuid) from public, anon, authenticated;
grant execute on function public.premium_actif(uuid) to service_role;


-- 2 bis. LE DÉCOMPTE DE LA VOIX : premium_actif() au lieu de plan ---------------
-- Identique à sql/007, sauf le bloc marqué NOUVEAU. Sans ce changement, un
-- Premium EXPIRÉ garderait la voix Google : plan vaut toujours 'premium'.
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
    if exists (select 1 from public.voix_catalogue c where c.voix = nom_voix and not c.active) then
      return jsonb_build_object('ok', false, 'raison', 'voix_desactivee');
    end if;
  end if;

  select status into profil from public.profiles where id = moi;
  -- NOUVEAU (sql/008) : la définition unique du Premium, date de fin comprise.
  if not found or not public.premium_actif(moi) then
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


-- 3. LES PAIEMENTS ---------------------------------------------------------------
-- Une ligne par session Stripe Checkout. stripe_session_id UNIQUE : c'est LA
-- garantie d'idempotence — Stripe renvoie ses webhooks, et deux événements
-- (completed, async_payment_succeeded) peuvent décrire le même paiement. La
-- base refuse la seconde ligne ; le code n'a pas à s'en souvenir.
--
-- user_id `on delete set null` et non `cascade` : un paiement est une pièce
-- comptable, elle survit à la suppression du compte (conservation légale).
-- montant en CENTIMES d'euro (1799) : jamais de flottant pour de l'argent.
-- premium_debut / premium_fin : la période ACCORDÉE par ce paiement. Vides
-- quand le compte était déjà Premium sans fin (rien n'a été prolongé).
create table if not exists public.paiements (
  id                 bigint generated always as identity primary key,
  user_id            uuid references public.profiles(id) on delete set null,
  stripe_session_id  text not null unique
                     check (stripe_session_id ~ '^cs_(test|live)_[A-Za-z0-9]{10,200}$'),
  montant            integer not null check (montant >= 0),
  statut             text not null check (statut in ('paye', 'sans_paiement', 'rembourse')),
  code_promo         text check (code_promo is null or length(code_promo) between 1 and 64),
  premium_debut      timestamptz,
  premium_fin        timestamptz,
  mode               text not null check (mode in ('test', 'live')),
  created_at         timestamptz not null default now(),
  -- Le préfixe de la session Stripe dit son mode : les deux doivent concorder.
  constraint paiements_mode_session check (stripe_session_id like 'cs_' || mode || '_%')
);
create index if not exists paiements_par_compte on public.paiements (user_id, created_at desc);

-- Lecture : ses propres paiements ; l'administration pleine, tous (support,
-- remboursements). AUCUNE politique d'écriture : on n'y écrit que par
-- stripe_crediter(), qui n'est ouverte qu'au rôle service_role.
alter table public.paiements enable row level security;
drop policy if exists "paiements : lecture de soi" on public.paiements;
create policy "paiements : lecture de soi" on public.paiements
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "paiements : lecture admin" on public.paiements;
create policy "paiements : lecture admin" on public.paiements
  for select to authenticated using (public.est_admin_plein());
-- Ceinture en plus de la RLS : Supabase accorde par défaut tous les droits
-- sur les tables de public aux rôles anon et authenticated.
revoke insert, update, delete, truncate on public.paiements from anon, authenticated;


-- 4. LE CRÉDIT -------------------------------------------------------------------

-- 4.1 La fin d'une période de 3 mois commencée à `depart`.
-- Trois mois CALENDAIRES, comptés sur le jour de PARIS, jusqu'à 23:59:59 heure
-- de Paris. Payé le 29/09 à 14 h → Premium jusqu'au 29/12 à 23:59:59.
-- PostgreSQL ramène au dernier jour du mois quand le jour n'existe pas :
-- 30/11 + 3 mois = 28/02 (29/02 une année bissextile). Isolée pour être
-- testée sans avancer l'horloge (tests/verifier-migrations.mjs, § 13).
create or replace function public.premium_fin_apres(depart timestamptz) returns timestamptz
  language sql stable set search_path = public as $$
  select ((((depart at time zone 'Europe/Paris')::date + interval '3 months')::date
           + time '23:59:59') at time zone 'Europe/Paris')
$$;
revoke all on function public.premium_fin_apres(timestamptz) from public, anon, authenticated;
grant execute on function public.premium_fin_apres(timestamptz) to service_role;

-- 4.2 Créditer un paiement confirmé. Appelée par le webhook Stripe (étape
-- suivante), avec la clé secrète : auth.uid() y est NULL, profiles_garde()
-- laisse donc passer l'écriture de plan et premium_jusqua.
--
-- Paramètres préfixés (session_stripe, compte…) et non stripe_session_id,
-- user_id… : ce sont des noms de colonnes, et PL/pgSQL refuse l'instruction
-- ambiguë (piège déjà tombé en sql/006).
--
-- Réponses — le webhook répond 200 à Stripe dans TOUS ces cas, erreurs de
-- données comprises : une erreur de données ne se corrige pas en rejouant, et
-- Stripe réessaierait trois jours durant.
--   {ok:true,  credite:true,  premium_jusqua}     crédité
--   {ok:true,  credite:false, raison:'deja_traite'} webhook rejoué
--   {ok:true,  credite:false, raison:'sans_fin'}   déjà Premium sans fin : paiement noté, rien à prolonger
--   {ok:false, raison:'compte_inconnu' | 'test_non_admin'}
create or replace function public.stripe_crediter(
    session_stripe  text,
    compte          uuid,
    montant_centimes integer,
    statut_paiement text,
    code            text,
    mode_paiement   text
  ) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  profil   record;
  ligne    bigint;
  base     timestamptz;
  fin      timestamptz;
begin
  -- Les données : refus net, rien n'est écrit.
  if session_stripe is null or compte is null or montant_centimes is null
     or statut_paiement not in ('paye', 'sans_paiement') or mode_paiement not in ('test', 'live') then
    raise exception 'paiement incomplet ou invalide' using errcode = '22023';
  end if;

  -- Le compte, VERROUILLÉ jusqu'à la fin de la transaction : deux achats du
  -- même compte au même instant se suivent, ils ne lisent pas la même fin.
  select id, plan, premium_jusqua, role into profil
    from public.profiles where id = compte for update;
  if not found then
    return jsonb_build_object('ok', false, 'raison', 'compte_inconnu');
  end if;

  -- Un paiement de TEST ne crédite qu'un administrateur : il n'y a pas de
  -- projet Supabase de test, et une carte de test ne doit pas offrir 3 mois
  -- à un vrai compte.
  if mode_paiement = 'test' and profil.role is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'raison', 'test_non_admin');
  end if;

  -- D'ABORD la ligne de paiement. Si elle existait, c'est un webhook rejoué :
  -- on sort sans rien toucher.
  insert into public.paiements (user_id, stripe_session_id, montant, statut, code_promo, mode)
  values (compte, session_stripe, montant_centimes, statut_paiement, nullif(code, ''), mode_paiement)
  on conflict (stripe_session_id) do nothing
  returning id into ligne;
  if ligne is null then
    return jsonb_build_object('ok', true, 'credite', false, 'raison', 'deja_traite');
  end if;

  -- Déjà Premium SANS FIN (offert) : on ne raccourcit pas. Le paiement reste
  -- noté — l'argent est arrivé, l'administration doit le voir.
  if profil.plan = 'premium' and profil.premium_jusqua is null then
    return jsonb_build_object('ok', true, 'credite', false, 'raison', 'sans_fin');
  end if;

  -- La nouvelle période part de la fin actuelle si elle est encore à venir,
  -- sinon de maintenant : jamais de jours payés perdus, jamais de remise à
  -- zéro. Un compte repassé en gratuit par l'admin repart de maintenant.
  base := case when profil.plan = 'premium' and profil.premium_jusqua > now()
               then profil.premium_jusqua else now() end;
  fin  := public.premium_fin_apres(base);

  update public.profiles set plan = 'premium', premium_jusqua = fin where id = compte;
  update public.paiements set premium_debut = base, premium_fin = fin where id = ligne;

  return jsonb_build_object('ok', true, 'credite', true, 'premium_jusqua', fin);
end $$;
-- Supabase accorde EXECUTE aux rôles anon et authenticated par défaut : la
-- révocation doit les nommer, PUBLIC ne suffit pas.
revoke all on function public.stripe_crediter(text, uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.stripe_crediter(text, uuid, integer, text, text, text) to service_role;


-- 5. LA GARDE DU PROFIL ------------------------------------------------------------
-- Même fonction que sql/001 § 4, un seul changement : plan, premium_jusqua et
-- role passent sous est_admin_plein() (voir l'encadré en tête). Le reste —
-- status et jalons sous is_admin(), le paramètre rt.jalon, la condition
-- « auth.uid() is not null » qui laisse passer l'éditeur SQL et les fonctions
-- serveur (stripe_crediter) — est inchangé.
create or replace function public.profiles_garde() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    -- NOUVEAU (sql/008) : ce qui vaut de l'argent ou des droits — l'admin plein seul.
    if not public.est_admin_plein() then
      new.role           := old.role;
      new.plan           := old.plan;
      new.premium_jusqua := old.premium_jusqua;
    end if;

    if not public.is_admin() then
      new.status := old.status;

      if coalesce(current_setting('rt.jalon', true), '') <> 'ok' then
        new.cgu_version   := old.cgu_version;
        new.cgu_le        := old.cgu_le;
        new.age_15_le     := old.age_15_le;
        new.mdp_le        := old.mdp_le;
        new.onboarding_le := old.onboarding_le;
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_garde_avant_maj on public.profiles;
create trigger profiles_garde_avant_maj
  before update on public.profiles
  for each row execute function public.profiles_garde();


-- 6. LE PLAN POSÉ PAR L'ADMINISTRATION -----------------------------------------------
-- Identique à sql/007 § 5.3, sauf : passer un compte en Premium = Premium
-- SANS FIN (premium_jusqua vidé). Sans cela, redonner le Premium à un compte
-- dont l'achat a expiré ne ferait RIEN — plan vaut déjà 'premium', la date
-- est passée, premium_actif() resterait faux. Repasser en gratuit ne touche
-- pas à la date : elle ne compte plus (plan = 'free'), et elle reste lisible.
-- L'audit garde la date d'avant.
create or replace function public.admin_definir_plan(cible uuid, nouveau_plan text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare moi uuid := auth.uid(); ancien text; ancienne_fin timestamptz;
begin
  if not public.est_admin_plein() then raise exception 'réservé aux administrateurs' using errcode = '42501'; end if;
  if nouveau_plan is null or nouveau_plan not in ('free', 'premium') then
    raise exception 'plan inconnu (free ou premium)' using errcode = '22023';
  end if;
  select p.plan, p.premium_jusqua into ancien, ancienne_fin from public.profiles p where p.id = cible;
  if not found then raise exception 'compte introuvable' using errcode = 'P0002'; end if;
  if nouveau_plan = 'premium' then
    update public.profiles set plan = 'premium', premium_jusqua = null where id = cible;
  else
    update public.profiles set plan = 'free' where id = cible;
  end if;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (moi, 'compte.plan', 'profile', cible::text,
          jsonb_build_object('avant', ancien, 'apres', nouveau_plan, 'premium_jusqua_avant', ancienne_fin));
  return jsonb_build_object('ok', true, 'plan', nouveau_plan);
end $$;
revoke all on function public.admin_definir_plan(uuid, text) from public, anon;
grant execute on function public.admin_definir_plan(uuid, text) to authenticated;


-- 7. LE COMPTEUR DE LA CONSOLE ---------------------------------------------------------
-- « Comptes Premium » dans Admin › Voix Google : les Premium ACTIFS, par
-- premium_actif() — compter plan = 'premium' compterait les expirés.
-- Lecture : is_admin() (modérateurs compris), comme les autres lectures de
-- la console.
create or replace function public.admin_premium_actifs() returns integer
  language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''administration' using errcode = '42501'; end if;
  return (select count(*)::integer from public.profiles p where public.premium_actif(p.id));
end $$;
revoke all on function public.admin_premium_actifs() from public, anon;
grant execute on function public.admin_premium_actifs() to authenticated;
