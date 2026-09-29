-- =============================================================================
-- Albatros VFR — sql/009 : LA PHASE DE LANCEMENT (29/09/2026)
-- -----------------------------------------------------------------------------
-- Décision du développeur : pendant le lancement, Albatros VFR est GRATUIT, et
-- la voix Google est offerte à tous les comptes pour les 3 premiers vols et
-- les 5 premiers scénarios du jour (les QCM ne comptent pas). Au-delà, voix du
-- navigateur ; à 10 vols / 15 scénarios, la journée est finie.
--
-- CE QUE LA BASE DÉCIDE, ET CE QU'ELLE NE DÉCIDE PAS.
--   · Les compteurs « 3 vols / 5 scénarios » et le blocage à 10 / 15 vivent
--     dans le site (assets/modules/lancement.js). Les contourner ne coûte
--     rien à personne : c'est de la pratique avec la voix du navigateur.
--   · Ce qui COÛTE, c'est la voix Google. Un compte gratuit qui forcerait le
--     site pourrait en demander autant qu'il veut : la base lui oppose donc un
--     plafond à elle, `plafond_gratuit` caractères par jour (20 000 à défaut,
--     largement de quoi faire 3 vols et 5 scénarios, et au pire ~0,60 $ par
--     compte et par jour au tarif Chirp 3 HD). Le Premium garde `plafond_jour`.
--   · La phase se ferme en base, sans redéployer le site :
--       update voix_reglages set valeur = 0 where cle = 'lancement_gratuit';
--     (1 = ouverte). Les comptes gratuits retrouvent alors « non_premium ».
--
-- voix_consommer() est celle de sql/008, à un bloc près, marqué NOUVEAU.
--
-- IDEMPOTENT : « create or replace », « on conflict do nothing », contrainte
-- remplacée par « drop … if exists » puis « add ».
-- =============================================================================


-- 1. DEUX RÉGLAGES DE PLUS --------------------------------------------------------
-- La clé était bornée à 'plafond_jour' (sql/007) : une clé inconnue serait une
-- faute de frappe qu'on ne verrait jamais.
alter table public.voix_reglages drop constraint if exists voix_reglages_cle_check;
alter table public.voix_reglages add constraint voix_reglages_cle_check
  check (cle in ('plafond_jour', 'plafond_gratuit', 'lancement_gratuit'));

insert into public.voix_reglages (cle, valeur) values
  ('plafond_gratuit', 20000),
  ('lancement_gratuit', 1)
on conflict (cle) do nothing;


-- 2. LA PHASE EST-ELLE OUVERTE ? ---------------------------------------------------
-- `security definer` : lue pour le compte de l'élève, qui ne lit pas
-- voix_reglages. Elle ne dit rien de secret — le site l'annonce en toutes
-- lettres —, mais le reste des réglages n'a pas à sortir avec elle.
create or replace function public.lancement_gratuit() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select valeur from public.voix_reglages where cle = 'lancement_gratuit'), 0) = 1
$$;
revoke all on function public.lancement_gratuit() from public, anon;
grant execute on function public.lancement_gratuit() to authenticated;

create or replace function public.voix_plafond_gratuit() returns integer
  language sql stable security definer set search_path = public as $$
  select coalesce((select valeur from public.voix_reglages where cle = 'plafond_gratuit'), 20000)
$$;
revoke all on function public.voix_plafond_gratuit() from public, anon, authenticated;


-- 3. LE DÉCOMPTE DE LA VOIX -------------------------------------------------------
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
  if nom_voix is not null then
    if nom_voix !~ '^fr-FR-(Chirp3-HD|Chirp-HD|Neural2|Wavenet|Studio)-[A-Za-z0-9]{1,30}$' then
      return jsonb_build_object('ok', false, 'raison', 'voix');
    end if;
    famille := substring(nom_voix from '^fr-FR-(Chirp3-HD|Chirp-HD|Neural2|Wavenet|Studio)-');
    if exists (select 1 from public.voix_catalogue c where c.voix = nom_voix and not c.active) then
      return jsonb_build_object('ok', false, 'raison', 'voix_desactivee');
    end if;
  end if;

  select status, role into profil from public.profiles where id = moi;
  if not found then
    return jsonb_build_object('ok', false, 'raison', 'non_premium');
  end if;
  -- NOUVEAU (sql/009) : Premium ou administrateur plein → plafond du Premium ;
  -- sinon, phase de lancement ouverte → plafond des comptes gratuits ;
  -- sinon, refus comme avant. Le plafond est choisi AVANT le contrôle de
  -- longueur : un message plus long que le plafond gratuit est refusé.
  if not (public.premium_actif(moi) or coalesce(profil.role, '') = 'admin') then
    if not public.lancement_gratuit() then
      return jsonb_build_object('ok', false, 'raison', 'non_premium');
    end if;
    plafond := least(plafond, public.voix_plafond_gratuit());
  end if;
  if n is null or n < 1 or n > plafond then
    return jsonb_build_object('ok', false, 'raison', 'longueur');
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


-- 4. LA DETTE DE sql/008 : anon lisait encore `paiements` -------------------------
-- Le privilège SELECT par défaut était resté à anon. La RLS ne lui rendait
-- aucune ligne (aucune politique ne le vise), mais un privilège sans usage
-- est une porte qu'on n'a pas à laisser entrouverte.
revoke select on public.paiements from anon;
