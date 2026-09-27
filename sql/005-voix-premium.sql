-- =============================================================================
-- Albatros VFR — 005 : LA VOIX GOOGLE (PREMIUM) ET SON QUOTA JOURNALIER
-- -----------------------------------------------------------------------------
-- La voix du contrôleur peut désormais venir de Google Cloud Text-to-Speech,
-- par la fonction Edge `voix-atc` (supabase/functions/voix-atc/). Google
-- facture AU CARACTÈRE : sans plafond, un seul compte premium — ou un script
-- qui aurait récupéré son jeton — pourrait faire exploser la facture.
--
-- Ce fichier pose le plafond, et il le pose EN BASE :
--   · une table `voix_consommation` : un compteur par compte et par jour ;
--   · une fonction `voix_consommer(n)` qui, en UNE instruction, vérifie que le
--     compte est premium et actif, et ajoute n caractères au compteur du jour
--     SEULEMENT si le total reste sous le plafond.
--
-- ┌─ POURQUOI LA VÉRIFICATION DU PLAN VIT ICI, ET PAS DANS LA FONCTION EDGE ─┐
-- │ La fonction Edge appelle `voix_consommer` AVEC LE JETON DE L'UTILISATEUR │
-- │ — jamais avec la clé secrète. Elle n'a donc besoin d'aucun secret        │
-- │ Supabase : le seul secret de toute la chaîne est la clé Google. Et le    │
-- │ plan, le statut et le quota se décident en une seule transaction, là où  │
-- │ personne ne peut les contourner (CLAUDE.md § 8).                          │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- LE PLAN « premium ». La colonne `profiles.plan` existe depuis le socle
-- (défaut 'free', sans liste fermée). Seul un administrateur la change :
-- profiles_garde() (sql/001 § 4) remet l'ancienne valeur quand un utilisateur
-- tente de modifier la sienne. Passer un compte en premium, depuis l'éditeur
-- SQL :
--     update public.profiles set plan = 'premium' where email = '…';
-- (La console d'administration de démonstration affiche 'pro' : c'est une
-- donnée FICTIVE de source-mock.js, aucun compte réel ne la porte.)
--
-- LE PLAFOND : 100 000 caractères par jour et par compte (décision du
-- 27/09/2026, « pour les premiers tests »). Un ATIS fait ~400 caractères, un
-- message du contrôleur ~80 : c'est plusieurs heures d'entraînement. Il est
-- écrit à UN seul endroit, `voix_plafond_jour()`, pour être changé d'une ligne.
--
-- LE JOUR est celui de Paris, pas l'UTC : un élève qui vole à 1 h du matin
-- l'été ne doit pas voir son compteur remis à zéro au milieu de sa séance.
--
-- ┌─ CE QUI N'EST PAS REMBOURSÉ, ET POURQUOI ────────────────────────────────┐
-- │ Les caractères sont décomptés AVANT l'appel à Google : deux requêtes      │
-- │ lancées en parallèle ne peuvent donc pas passer toutes deux sous le       │
-- │ plafond. Si Google échoue ensuite, ils restent décomptés. Une fonction de │
-- │ remboursement serait appelable par l'utilisateur lui-même — elle         │
-- │ servirait à remettre son compteur à zéro. La perte est minime et         │
-- │ plafonnée ; le trou ne le serait pas.                                     │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- IDEMPOTENT : « if not exists », « create or replace », « drop policy if
-- exists ». Ne touche à aucune autre table ni politique.
-- =============================================================================


-- 1. LE COMPTEUR ---------------------------------------------------------------
create table if not exists public.voix_consommation (
  user_id     uuid    not null references auth.users(id) on delete cascade,
  jour        date    not null,
  caracteres  integer not null default 0 check (caracteres >= 0),
  primary key (user_id, jour)
);

-- Sous RLS dès sa naissance. Une seule politique : chacun LIT sa propre
-- consommation (l'interface pourra afficher ce qui reste). Aucune politique
-- d'écriture, et c'est la protection : sous RLS, ce qui n'est pas autorisé est
-- refusé. Seule voix_consommer(), en security definer, y écrit.
alter table public.voix_consommation enable row level security;

drop policy if exists "voix : lecture de sa consommation" on public.voix_consommation;
create policy "voix : lecture de sa consommation" on public.voix_consommation
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());


-- 2. LE PLAFOND ----------------------------------------------------------------
create or replace function public.voix_plafond_jour() returns integer
  language sql immutable as $$ select 100000 $$;


-- 3. LE DÉCOMPTE ---------------------------------------------------------------
-- Rend un objet JSON, jamais une exception : la fonction Edge doit pouvoir
-- dire à l'interface POURQUOI la voix Google est refusée (pas premium, compte
-- suspendu, quota atteint), pour qu'elle retombe sur la voix du navigateur en
-- le disant, au lieu d'échouer en silence.
--
-- `security definer` parce qu'elle écrit dans une table sans politique
-- d'écriture ; `set search_path = public` ferme le détournement classique.
create or replace function public.voix_consommer(n integer) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  moi      uuid := auth.uid();
  profil   record;
  aujourd  date := (now() at time zone 'Europe/Paris')::date;
  plafond  integer := public.voix_plafond_jour();
  total    integer;
begin
  if moi is null then
    return jsonb_build_object('ok', false, 'raison', 'non_connecte');
  end if;
  -- Un nombre nul ou négatif ferait BAISSER le compteur : refusé. Au-delà du
  -- plafond d'un coup, inutile d'aller plus loin.
  if n is null or n < 1 or n > plafond then
    return jsonb_build_object('ok', false, 'raison', 'longueur');
  end if;

  select plan, status into profil from public.profiles where id = moi;
  if not found or profil.plan is distinct from 'premium' then
    return jsonb_build_object('ok', false, 'raison', 'non_premium');
  end if;
  if profil.status is distinct from 'active' then
    return jsonb_build_object('ok', false, 'raison', 'compte_inactif');
  end if;

  -- UNE instruction : l'ajout ne se fait que si le total reste sous le plafond.
  -- Deux appels simultanés se sérialisent sur la ligne ; aucun des deux ne peut
  -- lire un « reste » périmé et passer par-dessus.
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
  return jsonb_build_object('ok', true, 'restant', plafond - total);
end $$;

-- Appelable par un compte connecté, et par lui seul. Par défaut PostgreSQL
-- donne `execute` à PUBLIC : sans ce revoke, la clé publiable suffirait à
-- l'appeler (sans effet, auth.uid() serait nul — mais on ferme quand même).
revoke all on function public.voix_consommer(integer) from public, anon;
grant execute on function public.voix_consommer(integer) to authenticated;
