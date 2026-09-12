-- =============================================================================
-- RadioTrainer — MIGRATION « INSCRIPTION EN PLUSIEURS ÉTAPES »
-- À exécuter UNE FOIS dans Supabase → SQL Editor, d'un seul bloc.
-- Le schéma de départ est décrit dans assets/admin/README.md § 4.2.
-- -----------------------------------------------------------------------------
-- Le fichier est idempotent : « add column if not exists », « create or replace »,
-- « drop constraint if exists ». Le relancer ne casse rien et ne duplique rien.
--
-- ┌─ CE QUI EST DÉLIBÉRÉMENT ABSENT ────────────────────────────────────────┐
-- │ · Aucun mot de passe, nulle part. Les mots de passe vivent dans         │
-- │   auth.users, chiffrés par Supabase, et `profiles` n'en voit rien.      │
-- │ · Aucune vérification d'âge « forte ». On enregistre une DÉCLARATION    │
-- │   horodatée, ce que fait tout le monde et ce que la CNIL admet ; se     │
-- │   prétendre capable de vérifier l'âge réel serait un mensonge.         │
-- │ · Aucun droit accordé à `anon`. Tout ce qui suit exige une session.     │
-- └────────────────────────────────────────────────────────────────────────┘
-- =============================================================================

-- =============================================================================
-- 1. LES COLONNES DU QUESTIONNAIRE
-- -----------------------------------------------------------------------------
-- Des colonnes typées plutôt qu'un seul jsonb : la console d'administration doit
-- pouvoir segmenter (« combien d'élèves débutants ? »), et PostgREST ne sait pas
-- filtrer proprement à l'intérieur d'un jsonb. `settings` reste le fourre-tout
-- des préférences d'interface ; ceci est de la donnée de profil, pas un réglage.
-- =============================================================================
alter table public.profiles
  -- Identité choisie. `pseudo` est unique (index plus bas) ; `prenom` est
  -- obligatoire côté parcours parce que l'interface appelle les gens par leur
  -- prénom ; `nom` est facultatif, aucune fonction ne s'en sert aujourd'hui.
  add column if not exists pseudo        text,
  add column if not exists prenom        text,
  add column if not exists nom           text,
  add column if not exists aerodrome     text,   -- code OACI, ex. « LFOP »

  -- Questionnaire. `decouverte` est la seule question de nature commerciale :
  -- elle est FACULTATIVE par obligation légale (consentement, art. 7.4 RGPD),
  -- donc nullable, et elle doit le rester.
  add column if not exists decouverte    text,
  add column if not exists profil_pilote text,
  add column if not exists heures_vol    text,   -- une TRANCHE, jamais le chiffre exact
  add column if not exists objectifs     text[] not null default '{}',
  add column if not exists type_avion    text,
  add column if not exists niveau_radio  text,

  -- Jalons. Ces cinq colonnes sont des PREUVES, pas des préférences : elles ne
  -- sont écrites que par la fonction inscription_jalon() ci-dessous, avec
  -- l'horloge du serveur, et le déclencheur profiles_garde() interdit au client
  -- d'y toucher. Un consentement que l'utilisateur peut lui-même antidater ne
  -- vaut rien devant un contrôle.
  add column if not exists cgu_version   text,
  add column if not exists cgu_le        timestamptz,
  add column if not exists age_15_le     timestamptz,
  add column if not exists mdp_le        timestamptz,
  add column if not exists onboarding_le timestamptz;

comment on column public.profiles.heures_vol    is 'Tranche (« 10-50 »), jamais le nombre exact : minimisation RGPD art. 5.1.c.';
comment on column public.profiles.decouverte    is 'Question marketing. FACULTATIVE par obligation légale — ne jamais rendre NOT NULL.';
comment on column public.profiles.age_15_le     is 'Horodatage de la DÉCLARATION des 15 ans révolus (seuil français, art. 8 RGPD + LIL).';
comment on column public.profiles.onboarding_le is 'NULL = parcours d''inscription inachevé ; le client y renvoie l''utilisateur.';

-- =============================================================================
-- 2. LES GARDE-FOUS DE FORME
-- -----------------------------------------------------------------------------
-- Contraintes UNIQUEMENT sur les listes fermées. `decouverte`, `type_avion` et
-- `objectifs` acceptent du texte libre (il y a un choix « Autre ») : les
-- enfermer dans un CHECK obligerait à une migration à chaque ajout de choix, et
-- un CHECK désynchronisé du JavaScript se manifeste par un enregistrement qui
-- échoue avec un message incompréhensible. On borne donc la longueur, rien de plus.
-- =============================================================================
alter table public.profiles drop constraint if exists profils_pseudo_forme;
alter table public.profiles add  constraint profils_pseudo_forme
  check (pseudo is null or pseudo ~ '^[a-z0-9][a-z0-9_-]{1,18}[a-z0-9]$');

alter table public.profiles drop constraint if exists profils_profil_pilote;
alter table public.profiles add  constraint profils_profil_pilote
  check (profil_pilote is null or profil_pilote in
    ('eleve-debut','eleve-cours','brevete','simulateur','curieux','autre'));

alter table public.profiles drop constraint if exists profils_heures_vol;
alter table public.profiles add  constraint profils_heures_vol
  check (heures_vol is null or heures_vol in
    ('-10','10-50','50-200','200+','tait'));

alter table public.profiles drop constraint if exists profils_niveau_radio;
alter table public.profiles add  constraint profils_niveau_radio
  check (niveau_radio is null or niveau_radio in
    ('debutant','bases','terrain-connu','aise','tait'));

alter table public.profiles drop constraint if exists profils_textes_bornes;
alter table public.profiles add  constraint profils_textes_bornes
  check (  coalesce(length(prenom),0)     <= 60
       and coalesce(length(nom),0)        <= 60
       and coalesce(length(aerodrome),0)  <= 8
       and coalesce(length(decouverte),0) <= 40
       and coalesce(length(type_avion),0) <= 60
       and coalesce(array_length(objectifs,1),0) <= 12);

-- Un pseudo par personne. L'index porte sur lower(pseudo) : « Pilote28 » et
-- « pilote28 » ne doivent pas coexister, on se ferait passer l'un pour l'autre.
-- Un index UNIQUE laisse passer plusieurs NULL — indispensable, car tous les
-- comptes existants ont un pseudo vide.
create unique index if not exists profils_pseudo_unique
  on public.profiles (lower(pseudo));

-- =============================================================================
-- 3. « CE PSEUDO EST-IL LIBRE ? »
-- -----------------------------------------------------------------------------
-- Le navigateur NE PEUT PAS poser la question en lisant `profiles` : la
-- politique RLS ne laisse chacun voir que sa propre ligne, et l'ouvrir en
-- lecture pour permettre ce test livrerait la liste complète des utilisateurs,
-- e-mails compris. Cette fonction répond donc oui ou non, et rien d'autre.
--
-- Elle est un oracle d'existence sur les pseudos — assumé : c'est le cas de
-- tous les sites qui affichent « ce nom est pris », et un pseudo n'est pas un
-- secret. Ce qui serait grave, un oracle sur les ADRESSES E-MAIL, n'existe pas
-- ici : aucune fonction ne prend d'e-mail en argument.
--
-- Droits : révoqués de PUBLIC (PostgreSQL les accorde par défaut), puis rendus
-- au seul rôle `authenticated`. Un visiteur non connecté ne peut donc pas
-- balayer les pseudos, et l'étape 5 du parcours a bien une session en cours.
-- =============================================================================
create or replace function public.pseudo_libre(p text) returns boolean
  language sql stable security definer set search_path = public as $$
  select p is not null
     and lower(btrim(p)) ~ '^[a-z0-9][a-z0-9_-]{1,18}[a-z0-9]$'
     and lower(btrim(p)) not in (
       -- Réservés : se faire appeler « admin » ou « radiotrainer » permettrait
       -- de se faire passer pour nous auprès des autres utilisateurs.
       'admin','administrateur','administrator','root','superadmin','moderateur',
       'moderator','radiotrainer','radio-trainer','support','contact','aide','help',
       'equipe','team','staff','systeme','system','officiel','official',
       'anonyme','null','undefined','true','false','me','moi')
     and not exists (select 1 from public.profiles where lower(pseudo) = lower(btrim(p)))
$$;
revoke execute on function public.pseudo_libre(text) from public;
grant  execute on function public.pseudo_libre(text) to authenticated;

-- =============================================================================
-- 4. LE VERROU SUR LES JALONS  (extension du déclencheur existant)
-- -----------------------------------------------------------------------------
-- profiles_garde() remettait déjà `role`, `status` et `plan` à leur ancienne
-- valeur quand l'auteur n'est pas administrateur — c'est ce qui empêche de se
-- nommer soi-même admin. On y ajoute les cinq jalons, pour la même raison
-- transposée : personne ne doit pouvoir antidater son propre consentement ni se
-- déclarer « inscription terminée » sans avoir rempli le questionnaire. Un
-- consentement que l'utilisateur peut lui-même fabriquer ne vaut rien devant un
-- contrôle, et c'est tout l'intérêt de l'enregistrer.
--
-- La condition « auth.uid() is not null » est conservée telle quelle : elle
-- laisse passer l'éditeur SQL et les tâches serveur, qui ont de toute façon tous
-- les droits, et c'est elle qui rend possible la nomination du premier
-- administrateur (cf. le commentaire d'origine dans README.md § 4.4).
--
-- La seule ouverture est le paramètre de session `rt.jalon`, que seule
-- inscription_jalon() sait poser (§ 5) et seulement pour la durée de sa propre
-- transaction. current_setting(..., true) renvoie NULL quand le paramètre n'a
-- jamais été posé — d'où le coalesce, sans lequel le déclencheur lèverait une
-- erreur sur toute mise à jour ordinaire d'un profil.
-- =============================================================================
create or replace function public.profiles_garde() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role   := old.role;
    new.status := old.status;
    new.plan   := old.plan;

    if coalesce(current_setting('rt.jalon', true), '') <> 'ok' then
      new.cgu_version   := old.cgu_version;
      new.cgu_le        := old.cgu_le;
      new.age_15_le     := old.age_15_le;
      new.mdp_le        := old.mdp_le;
      new.onboarding_le := old.onboarding_le;
    end if;
  end if;
  return new;
end $$;

-- Le déclencheur lui-même existe déjà (README.md § 4.4) et porte toujours sur la
-- même fonction : « create or replace function » suffit, il n'y a rien à
-- recréer ici. On le rattache malgré tout si la base est neuve.
drop trigger if exists profiles_garde_avant_maj on public.profiles;
create trigger profiles_garde_avant_maj
  before update on public.profiles
  for each row execute function public.profiles_garde();

-- =============================================================================
-- 5. LA SEULE CLÉ  (consentement, mot de passe posé, parcours fini)
-- -----------------------------------------------------------------------------
-- Trois jalons, une seule fonction : un seul droit à accorder, un seul chemin à
-- relire. `now()` est ici l'horloge du SERVEUR, hors d'atteinte du navigateur,
-- et la version des CGU est lue dans l'argument mais horodatée par la base.
--
-- set_config(..., true) : le troisième argument limite l'effet à la transaction
-- en cours. Le drapeau ne survit donc pas à l'appel et ne peut pas être
-- réutilisé par une autre requête de la même connexion.
--
-- « security definer » : la fonction traverse RLS, donc elle est écrite pour ne
-- jamais pouvoir toucher une autre ligne que celle de l'appelant — d'où le
-- « where id = auth.uid() » sur chaque branche, et le refus net sans session.
-- =============================================================================
create or replace function public.inscription_jalon(p_jalon text, p_cgu_version text default null)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'aucune session';
  end if;
  perform set_config('rt.jalon', 'ok', true);

  if p_jalon = 'consentement' then
    -- Les CGU et la déclaration d'âge sont acceptées ENSEMBLE, à l'étape 1 : en
    -- faire deux appels laisserait une fenêtre où l'un est enregistré et pas
    -- l'autre, et donc un dossier de consentement bancal.
    update public.profiles
       set cgu_version = coalesce(p_cgu_version, 'inconnue'),
           cgu_le      = now(),
           age_15_le   = now()
     where id = auth.uid();

  elsif p_jalon = 'mot-de-passe' then
    update public.profiles set mdp_le = now() where id = auth.uid();

  elsif p_jalon = 'termine' then
    -- Refuser de clore un parcours incomplet. Sans ce garde-fou, un client
    -- modifié sauterait le questionnaire en appelant directement ce jalon, et
    -- l'application ne le renverrait plus jamais le remplir. Les cinq colonnes
    -- exigées sont exactement celles que le parcours déclare obligatoires.
    update public.profiles set onboarding_le = now()
     where id = auth.uid()
       and pseudo is not null and prenom is not null
       and profil_pilote is not null and niveau_radio is not null
       and cgu_le is not null;
    if not found then
      raise exception 'inscription incomplete';
    end if;

  else
    raise exception 'jalon inconnu: %', p_jalon;
  end if;
end $$;
revoke execute on function public.inscription_jalon(text, text) from public;
grant  execute on function public.inscription_jalon(text, text) to authenticated;

-- =============================================================================
-- 6. LES COMPTES EXISTANTS          ← NE PAS SAUTER CETTE ÉTAPE
-- -----------------------------------------------------------------------------
-- Sans ceci, TOUS les comptes déjà créés — le vôtre compris — auraient
-- onboarding_le à NULL, donc seraient considérés comme des inscriptions
-- inachevées et renvoyés de force dans le questionnaire à leur prochaine
-- connexion. C'est la ligne qui empêche la migration de casser le site.
--
-- On les déclare terminés à leur date de création : c'est la vérité (ils ont
-- bien été créés par l'ancien parcours, qui exigeait déjà un mot de passe).
-- En revanche on NE FABRIQUE PAS de consentement : cgu_le reste NULL pour eux,
-- parce qu'ils n'ont jamais rien accepté. C'est justement ce qui permettra de
-- leur demander leur accord le jour où les CGU existeront.
-- =============================================================================
update public.profiles
   set onboarding_le = coalesce(onboarding_le, created_at),
       mdp_le        = coalesce(mdp_le,        created_at)
 where onboarding_le is null or mdp_le is null;

-- =============================================================================
-- 7. VÉRIFICATION
-- -----------------------------------------------------------------------------
-- Résultat attendu : une ligne par compte, avec onboarding_le renseigné, et
-- cgu_le vide pour les comptes antérieurs à cette migration.
-- =============================================================================
select email, pseudo, prenom, profil_pilote, niveau_radio,
       cgu_le is not null as cgu_acceptees,
       onboarding_le is not null as parcours_fini
  from public.profiles
 order by created_at;
