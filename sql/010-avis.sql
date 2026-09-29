-- =============================================================================
-- Albatros VFR — sql/010 : LES AVIS (29/09/2026)
-- -----------------------------------------------------------------------------
-- Cahier des charges du développeur, 29/09/2026. Numéroté 010 et non 009 :
-- 009 est la phase de lancement, déjà posée, et un numéro de migration est un
-- ORDRE d'exécution (CLAUDE.md § 21.3).
--
-- CE QUE LA BASE GARANTIT, quoi qu'envoie le navigateur :
--   · un avis par compte (user_id UNIQUE), posté pour SOI (user_id = auth.uid()) ;
--   · un avis naît « en_attente », jamais en vedette : le déclencheur écrase
--     statut, mis_en_avant, ordre, motif et date, quoi qu'on lui envoie ;
--   · il faut au moins 2 séances TERMINÉES (vol ou scénario, sessions.status =
--     'completed') — c'est ce que la mention légale promet ;
--   · le pseudo affiché est FIGÉ à l'envoi, lu dans profiles.pseudo : le
--     public ne lit jamais profiles, et un auteur ne choisit pas le nom sous
--     lequel il apparaît ;
--   · personne, hors administrateur plein, ne modifie ni ne supprime un avis :
--     AUCUNE politique UPDATE ni DELETE, et les droits UPDATE / DELETE retirés
--     à anon et authenticated. L'administration passe par quatre fonctions,
--     qui écrivent le journal d'audit dans la même transaction (comme sql/007) ;
--   · le public ne lit que les avis « publie », et jamais user_id : les droits
--     de lecture sont donnés colonne par colonne ;
--   · une vedette est forcément publiée, et il n'y en a jamais plus de trois
--     (ordre 1 à 3, unique parmi les vedettes).
--
-- QUI MODÈRE : l'administrateur PLEIN (est_admin_plein, sql/007), comme le
-- demande le cahier des charges — pas les modérateurs. C'est le même mécanisme
-- que la voix et le Premium : pas de second système de rôles.
--
-- IDEMPOTENT : « if not exists », « create or replace », « drop … if exists ».
-- =============================================================================


-- 1. LA TABLE -----------------------------------------------------------------------
create table if not exists public.avis (
  id                  uuid primary key default gen_random_uuid(),
  -- default auth.uid() : le navigateur n'a pas le droit d'écrire cette colonne
  -- (droits par colonne, § 3) ; elle se remplit toute seule, et la politique
  -- vérifie qu'elle vaut bien l'auteur.
  user_id             uuid not null unique default auth.uid()
                      references public.profiles(id) on delete cascade,
  pseudo              text not null check (char_length(pseudo) between 1 and 40),
  note                integer not null check (note between 1 and 5),
  commentaire         text check (commentaire is null or char_length(commentaire) <= 1000),
  statut              text not null default 'en_attente'
                      check (statut in ('en_attente', 'publie', 'rejete')),
  motif_rejet         text check (motif_rejet is null or char_length(motif_rejet) <= 300),
  mis_en_avant        boolean not null default false,
  ordre_mise_en_avant integer check (ordre_mise_en_avant between 1 and 3),
  cree_le             timestamptz not null default now(),
  modere_le           timestamptz,
  constraint avis_vedette_publiee check (not mis_en_avant or statut = 'publie'),
  constraint avis_vedette_ordre   check (mis_en_avant = (ordre_mise_en_avant is not null))
);
comment on table public.avis is
  'Avis des élèves. Écriture élève : insertion de soi, une fois. Modération : fonctions admin_avis_* (sql/010).';
comment on column public.avis.pseudo is
  'Figé à l''envoi depuis profiles.pseudo : le public ne lit jamais profiles.';

-- Trois vedettes au plus : l'ordre va de 1 à 3, et un rang n'a qu'un titulaire.
create unique index if not exists avis_vedette_rang on public.avis (ordre_mise_en_avant) where mis_en_avant;
create index if not exists avis_publies on public.avis (cree_le desc) where statut = 'publie';


-- 2. LE DÉPÔT : ce qui ne se choisit pas ----------------------------------------------
create or replace function public.avis_avant_depot() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  moi uuid := auth.uid();
  p   record;
  n   integer;
begin
  -- Sans session (éditeur SQL, clé de service) : rien n'est imposé.
  if moi is null then return new; end if;
  new.user_id := moi;
  select pseudo, status into p from public.profiles where id = moi;
  if not found or p.status is distinct from 'active' then
    raise exception 'avis_compte_inactif' using errcode = '42501';
  end if;
  select count(*) into n from public.sessions
   where user_id = moi and status = 'completed' and kind in ('flight', 'scenario');
  if n < 2 then
    raise exception 'avis_trop_tot' using errcode = '42501',
      detail = 'Deux séances terminées sont nécessaires.';
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
drop trigger if exists avis_avant_depot on public.avis;
create trigger avis_avant_depot before insert on public.avis
  for each row execute function public.avis_avant_depot();


-- 3. LES DROITS ET LES POLITIQUES ------------------------------------------------------
alter table public.avis enable row level security;

revoke all on public.avis from public, anon, authenticated;
-- Lecture : colonne par colonne, SANS user_id ni motif_rejet.
grant select (id, pseudo, note, commentaire, statut, mis_en_avant, ordre_mise_en_avant, cree_le)
  on public.avis to anon, authenticated;
-- Dépôt : la note et le commentaire, rien d'autre.
grant insert (note, commentaire) on public.avis to authenticated;

drop policy if exists "avis : lecture des publiés" on public.avis;
create policy "avis : lecture des publiés" on public.avis
  for select to anon, authenticated using (statut = 'publie');

drop policy if exists "avis : dépôt de soi" on public.avis;
create policy "avis : dépôt de soi" on public.avis
  for insert to authenticated with check (user_id = auth.uid());
-- Aucune politique UPDATE ni DELETE : c'est voulu (voir l'en-tête).


-- 4. CE QUE L'AUTEUR PEUT SAVOIR DE SON AVIS ----------------------------------------------
-- Son avis n'est pas lisible par la table tant qu'il n'est pas publié, et
-- user_id ne l'est jamais : cette fonction lui rend le sien, motif compris.
-- `peut` : a-t-il le droit d'en déposer un (compte actif, 2 séances, aucun avis).
create or replace function public.mon_avis() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  moi uuid := auth.uid();
  a   public.avis;
  n   integer;
begin
  if moi is null then return jsonb_build_object('connecte', false); end if;
  select * into a from public.avis where user_id = moi;
  select count(*) into n from public.sessions
   where user_id = moi and status = 'completed' and kind in ('flight', 'scenario');
  return jsonb_build_object(
    'connecte', true,
    'seances', n,
    'avis', case when a.id is null then null else jsonb_build_object(
      'note', a.note, 'commentaire', a.commentaire, 'statut', a.statut,
      'motif_rejet', a.motif_rejet, 'cree_le', a.cree_le) end,
    'peut', a.id is null and n >= 2
  );
end $$;
revoke all on function public.mon_avis() from public, anon;
grant execute on function public.mon_avis() to authenticated;


-- 5. L'ADMINISTRATION : quatre fonctions, auditées -------------------------------------------
create or replace function public.admin_avis_liste() returns setof jsonb
  language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_admin_plein() then raise exception 'réservé aux administrateurs' using errcode = '42501'; end if;
  return query
    select jsonb_build_object('id', a.id, 'pseudo', a.pseudo, 'note', a.note, 'commentaire', a.commentaire,
             'statut', a.statut, 'motif_rejet', a.motif_rejet, 'mis_en_avant', a.mis_en_avant,
             'ordre_mise_en_avant', a.ordre_mise_en_avant, 'cree_le', a.cree_le, 'modere_le', a.modere_le,
             'email', p.email)
      from public.avis a left join public.profiles p on p.id = a.user_id
     order by a.cree_le desc;
end $$;

create or replace function public.admin_avis_moderer(cible uuid, nouveau text, motif text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare moi uuid := auth.uid(); avant text;
begin
  if not public.est_admin_plein() then raise exception 'réservé aux administrateurs' using errcode = '42501'; end if;
  if nouveau not in ('en_attente', 'publie', 'rejete') then
    raise exception 'statut inconnu' using errcode = '22023';
  end if;
  select statut into avant from public.avis where id = cible for update;
  if not found then raise exception 'avis introuvable' using errcode = '22023'; end if;
  -- Un avis qui n'est plus publié quitte la vedette : la contrainte l'exige.
  update public.avis
     set statut = nouveau,
         motif_rejet = case when nouveau = 'rejete' then nullif(btrim(motif), '') end,
         mis_en_avant = mis_en_avant and nouveau = 'publie',
         ordre_mise_en_avant = case when nouveau = 'publie' then ordre_mise_en_avant end,
         modere_le = now()
   where id = cible;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (moi, 'avis.statut', 'avis', cible::text, jsonb_build_object('avant', avant, 'apres', nouveau, 'motif', motif));
  return jsonb_build_object('ok', true, 'statut', nouveau);
end $$;

-- rang NULL : retirer de la vedette. Un rang déjà occupé est libéré au profit
-- de celui-ci — on remplace une vedette, on n'en empile pas une quatrième.
create or replace function public.admin_avis_vedette(cible uuid, rang integer)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare moi uuid := auth.uid(); st text;
begin
  if not public.est_admin_plein() then raise exception 'réservé aux administrateurs' using errcode = '42501'; end if;
  if rang is not null and (rang < 1 or rang > 3) then raise exception 'rang de 1 à 3' using errcode = '22023'; end if;
  select statut into st from public.avis where id = cible for update;
  if not found then raise exception 'avis introuvable' using errcode = '22023'; end if;
  if rang is not null and st <> 'publie' then
    raise exception 'un avis non publié ne peut pas être mis en avant' using errcode = '22023';
  end if;
  update public.avis set mis_en_avant = false, ordre_mise_en_avant = null where id = cible;
  if rang is not null then
    update public.avis set mis_en_avant = false, ordre_mise_en_avant = null
     where mis_en_avant and ordre_mise_en_avant = rang;
    update public.avis set mis_en_avant = true, ordre_mise_en_avant = rang where id = cible;
  end if;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (moi, 'avis.vedette', 'avis', cible::text, jsonb_build_object('rang', rang));
  return jsonb_build_object('ok', true, 'rang', rang);
end $$;

create or replace function public.admin_avis_supprimer(cible uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare moi uuid := auth.uid(); a public.avis;
begin
  if not public.est_admin_plein() then raise exception 'réservé aux administrateurs' using errcode = '42501'; end if;
  delete from public.avis where id = cible returning * into a;
  if a.id is null then raise exception 'avis introuvable' using errcode = '22023'; end if;
  -- Le journal garde la trace de la suppression, pas le texte de l'avis.
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (moi, 'avis.supprime', 'avis', cible::text, jsonb_build_object('pseudo', a.pseudo, 'note', a.note, 'statut', a.statut));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_avis_liste() from public, anon;
revoke all on function public.admin_avis_moderer(uuid, text, text) from public, anon;
revoke all on function public.admin_avis_vedette(uuid, integer) from public, anon;
revoke all on function public.admin_avis_supprimer(uuid) from public, anon;
grant execute on function public.admin_avis_liste() to authenticated;
grant execute on function public.admin_avis_moderer(uuid, text, text) to authenticated;
grant execute on function public.admin_avis_vedette(uuid, integer) to authenticated;
grant execute on function public.admin_avis_supprimer(uuid) to authenticated;
