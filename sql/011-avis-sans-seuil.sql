-- =============================================================================
-- Albatros VFR — sql/011 : UN AVIS DÈS LA CONNEXION (29/09/2026)
-- -----------------------------------------------------------------------------
-- Décision du développeur, 29/09/2026 : « n'importe quelle personne connectée
-- peut créer un avis ». sql/010 exigeait 2 séances terminées ; la règle tombe.
-- Le rappel après la 2e séance, lui, reste — c'est le site qui le montre, il
-- lit `seances` dans mon_avis().
--
-- Tout le reste de sql/010 est inchangé : un avis par compte, pour soi, en
-- attente, pseudo figé, aucune modification par l'auteur, modération par
-- l'admin plein. sql/010 n'est pas réécrit (il est posé) : ce fichier remplace
-- les deux fonctions concernées.
--
-- IDEMPOTENT : « create or replace ».
-- =============================================================================

create or replace function public.avis_avant_depot() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  moi uuid := auth.uid();
  p   record;
begin
  if moi is null then return new; end if;
  new.user_id := moi;
  select pseudo, status into p from public.profiles where id = moi;
  if not found or p.status is distinct from 'active' then
    raise exception 'avis_compte_inactif' using errcode = '42501';
  end if;
  new.pseudo              := coalesce(nullif(p.pseudo, ''), 'Élève pilote');
  new.statut              := 'en_attente';
  new.motif_rejet         := null;
  new.mis_en_avant        := false;
  new.ordre_mise_en_avant := null;
  new.cree_le             := now();
  new.modere_le           := null;
  new.commentaire         := nullif(btrim(new.commentaire), '');
  return new;
end $$;
revoke all on function public.avis_avant_depot() from public, anon, authenticated;

create or replace function public.mon_avis() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  moi uuid := auth.uid();
  a   public.avis;
  n   integer;
  actif boolean;
begin
  if moi is null then return jsonb_build_object('connecte', false); end if;
  select * into a from public.avis where user_id = moi;
  select count(*) into n from public.sessions
   where user_id = moi and status = 'completed' and kind in ('flight', 'scenario');
  select status = 'active' into actif from public.profiles where id = moi;
  return jsonb_build_object(
    'connecte', true,
    'seances', n,
    'avis', case when a.id is null then null else jsonb_build_object(
      'note', a.note, 'commentaire', a.commentaire, 'statut', a.statut,
      'motif_rejet', a.motif_rejet, 'cree_le', a.cree_le) end,
    'peut', a.id is null and coalesce(actif, false)
  );
end $$;
revoke all on function public.mon_avis() from public, anon;
grant execute on function public.mon_avis() to authenticated;
