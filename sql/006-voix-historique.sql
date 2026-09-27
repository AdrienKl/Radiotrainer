-- =============================================================================
-- Albatros VFR — 006 : L'HISTORIQUE DE CONSOMMATION DE LA VOIX GOOGLE
-- -----------------------------------------------------------------------------
-- `voix_consommation` (sql/005) sert au QUOTA : un total par compte et par
-- jour, rien de plus. Il ne dit ni quelle voix, ni combien de requêtes — et il
-- n'a pas à le dire. Ce fichier ajoute, À CÔTÉ, un historique pour la console
-- d'administration : qui consomme quoi, avec quelle voix, donc à quel coût.
--
-- ┌─ CE QUI N'EST PAS STOCKÉ ────────────────────────────────────────────────┐
-- │ Le texte prononcé. Jamais. Il contient l'indicatif de l'élève et le      │
-- │ déroulé de sa séance ; l'administration n'a besoin que de métriques.     │
-- │ tests/verifier-migrations.mjs vérifie qu'aucune colonne de la table ne   │
-- │ peut le recevoir.                                                        │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- OÙ L'HISTORIQUE S'ÉCRIT : dans la MÊME transaction que le quota.
-- `voix_consommer(n, nom_voix)` fait exactement ce que faisait `voix_consommer(n)`
-- — mêmes vérifications, même décompte, mêmes réponses — et ajoute une ligne
-- d'historique SEULEMENT si le quota a accepté. L'ancienne signature reste en
-- place et appelle la nouvelle sans voix : la fonction Edge déployée avant ce
-- fichier continue de marcher, et revenir en arrière ne casse rien.
-- La voix vient de la fonction Edge voix-atc, pas du navigateur : c'est elle
-- qui l'envoie à Google. Une statistique fournie par le client se falsifie.
--
-- ORDRE DE DÉPLOIEMENT : CE FICHIER D'ABORD, la fonction voix-atc ENSUITE.
-- Dans l'autre ordre, voix-atc appellerait une signature que la base ne
-- connaît pas encore : chaque requête tomberait en « base » (502), et tout le
-- monde repasserait sur la voix du navigateur jusqu'à la pose de ce fichier.
--
-- CE QUI EST COMPTÉ : chaque requête ACCEPTÉE par le quota. Un message rejoué
-- depuis le cache du navigateur n'arrive pas ici — Google ne le facture pas.
-- Une requête acceptée puis ratée chez Google (rare) est comptée, exactement
-- comme elle l'est pour le quota.
--
-- IDEMPOTENT : « if not exists », « create or replace », « drop policy if
-- exists ». Ne touche ni à `voix_consommation`, ni à ses règles.
-- =============================================================================


-- 1. L'HISTORIQUE -------------------------------------------------------------
create table if not exists public.voix_historique (
  user_id     uuid    not null references auth.users(id) on delete cascade,
  jour        date    not null,                  -- jour de Paris, comme le quota
  voix        text    not null,                  -- ex. fr-FR-Chirp3-HD-Charon
  modele      text    not null,                  -- ex. Chirp3-HD, déduit de la voix
  caracteres  integer not null default 0 check (caracteres >= 0),
  requetes    integer not null default 0 check (requetes >= 0),
  primary key (user_id, jour, voix),
  -- Un nom de voix, pas une phrase : la colonne ne peut pas servir à ranger
  -- du texte prononcé, même par erreur.
  constraint voix_historique_voix_forme check (voix ~ '^fr-FR-[A-Za-z0-9-]{1,40}$'),
  constraint voix_historique_modele_forme check (modele ~ '^[A-Za-z0-9-]{1,20}$')
);
create index if not exists voix_historique_jour on public.voix_historique (jour);

-- Lecture : l'administration SEULE. Un élève n'a pas à voir la consommation
-- des autres — ni, pour l'instant, la sienne sous cette forme (son reste du
-- jour est dans voix_consommation, qu'il lit déjà).
-- Aucune politique d'écriture : sous RLS, ce qui n'est pas autorisé est
-- refusé. Seule voix_consommer(), en security definer, y écrit.
alter table public.voix_historique enable row level security;

drop policy if exists "voix : historique, lecture admin" on public.voix_historique;
create policy "voix : historique, lecture admin" on public.voix_historique
  for select to authenticated
  using (public.is_admin());


-- 2. LE DÉCOMPTE, AVEC LA VOIX ------------------------------------------------
-- Le corps est celui de sql/005, à l'identique, plus deux ajouts : le contrôle
-- de la forme de la voix (AVANT tout décompte), et la ligne d'historique
-- (APRÈS un décompte accepté).
-- Le paramètre s'appelle `nom_voix` et non `voix` : `voix` est aussi une
-- colonne de voix_historique, et PL/pgSQL refuse l'instruction ambiguë
-- (« column reference "voix" is ambiguous »). C'est ce nom que voix-atc envoie.
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
  -- Même liste de familles que voix-atc (logique.ts, FAMILLES). Une voix
  -- absente (null) est l'appel de l'ancienne signature : pas d'historique.
  if nom_voix is not null then
    if nom_voix !~ '^fr-FR-(Chirp3-HD|Chirp-HD|Neural2|Wavenet|Studio)-[A-Za-z0-9]{1,30}$' then
      return jsonb_build_object('ok', false, 'raison', 'voix');
    end if;
    famille := substring(nom_voix from '^fr-FR-(Chirp3-HD|Chirp-HD|Neural2|Wavenet|Studio)-');
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

  -- Accepté : l'historique, dans la même transaction. Si cette écriture
  -- échouait, le décompte serait annulé avec elle — jamais l'un sans l'autre.
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


-- 3. L'ANCIENNE SIGNATURE, CONSERVÉE ------------------------------------------
-- Celle qu'appelle la fonction voix-atc déployée AVANT ce fichier. Elle ne
-- fait plus que déléguer : une seule logique de quota, à un seul endroit.
create or replace function public.voix_consommer(n integer) returns jsonb
  language sql security definer set search_path = public as $$
  select public.voix_consommer(n, null::text)
$$;

revoke all on function public.voix_consommer(integer) from public, anon;
grant execute on function public.voix_consommer(integer) to authenticated;
