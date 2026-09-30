-- =============================================================================
-- Albatros VFR — sql/013 : LA PRONONCIATION, RÉGLÉE DEPUIS L'ADMINISTRATION (30/09/2026)
-- -----------------------------------------------------------------------------
-- Demande du développeur, 30/09/2026 : plusieurs mots sonnaient faux (Juliett,
-- Mike, November, Quebec, X-ray, « Pan Pan » dit comme des coups de feu,
-- ident…), « à ajouter dans la partie admin si nécessaire ». Une graphie
-- « pour l'oreille » ne se règle qu'en écoutant — ce que ni le code ni la
-- personne qui l'écrit ne peuvent faire à la place de l'administrateur.
--
-- La table de 1-alphabet-nombres.js (PRONONCIATION_RADIO) reste la base ; ce
-- qui est ici la COMPLÈTE ou la REMPLACE, mot par mot, pour tout le monde, dès
-- le chargement suivant de la page. Aucune donnée personnelle.
--
-- Lecture publique (la voix du navigateur parle aussi avant la connexion).
-- Écriture par deux fonctions, admin plein seul, journalisées — aucune
-- politique d'écriture sur la table.
--
-- IDEMPOTENT : « if not exists », « create or replace ».
-- =============================================================================

create table if not exists public.prononciations (
  -- Le mot tel qu'il est écrit dans les phrases, en minuscules : accents et
  -- apostrophe gardés (« étape de base », « point d'attente »).
  mot      text primary key check (mot ~ '^[a-z0-9àâäçéèêëîïôöùûüÿœæ][a-z0-9àâäçéèêëîïôöùûüÿœæ '' -]{0,39}$'),
  -- Ce que la voix doit lire à la place.
  dit      text not null check (char_length(btrim(dit)) between 1 and 80),
  maj_le   timestamptz not null default now(),
  maj_par  uuid references public.profiles(id) on delete set null
);
alter table public.prononciations enable row level security;
drop policy if exists "prononciation : lecture" on public.prononciations;
create policy "prononciation : lecture" on public.prononciations for select using (true);
revoke insert, update, delete on public.prononciations from anon, authenticated;
grant select (mot, dit) on public.prononciations to anon, authenticated;

create or replace function public.admin_prononciation_definir(cle text, graphie text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m text := lower(btrim(coalesce(cle, ''))); g text := btrim(coalesce(graphie, ''));
begin
  if not public.est_admin_plein() then raise exception 'réservé aux administrateurs' using errcode = '42501'; end if;
  if m !~ '^[a-z0-9àâäçéèêëîïôöùûüÿœæ][a-z0-9àâäçéèêëîïôöùûüÿœæ '' -]{0,39}$' then raise exception 'mot invalide (lettres, chiffres, espace, tiret ou apostrophe ; 40 caractères au plus)' using errcode = '22023'; end if;
  if char_length(g) not between 1 and 80 then raise exception 'graphie vide ou trop longue (80 caractères au plus)' using errcode = '22023'; end if;
  -- Le moteur peut repasser sur un texte déjà réécrit : une graphie qui
  -- contient le mot se réécrirait une seconde fois.
  if position(m in lower(g)) > 0 then raise exception 'la graphie ne doit pas contenir le mot lui-même' using errcode = '22023'; end if;
  insert into public.prononciations (mot, dit, maj_le, maj_par) values (m, g, now(), auth.uid())
  on conflict (mot) do update set dit = excluded.dit, maj_le = now(), maj_par = excluded.maj_par;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'prononciation.definir', 'prononciation', m, jsonb_build_object('dit', g));
  return jsonb_build_object('ok', true, 'mot', m, 'dit', g);
end $$;
revoke all on function public.admin_prononciation_definir(text, text) from public, anon;
grant execute on function public.admin_prononciation_definir(text, text) to authenticated;

create or replace function public.admin_prononciation_retirer(cle text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m text := lower(btrim(coalesce(cle, '')));
begin
  if not public.est_admin_plein() then raise exception 'réservé aux administrateurs' using errcode = '42501'; end if;
  delete from public.prononciations where mot = m;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'prononciation.retirer', 'prononciation', m, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_prononciation_retirer(text) from public, anon;
grant execute on function public.admin_prononciation_retirer(text) to authenticated;
