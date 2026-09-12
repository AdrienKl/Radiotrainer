# Console d'administration — notice technique

Documentation d'implémentation. Pour l'analyse et les décisions d'architecture,
voir `ADMIN.md` à la racine.

---

## 1. Ce qui vit ici

```
assets/admin/
├── admin.css                 styles (préfixe .adm-, portés par #page-admin)
├── admin.js                  coquille : rail, barre du haut, routeur interne, garde
├── data/
│   ├── contract.js           LE contrat + la façade RTAdmin.data + la taxonomie
│   ├── source-mock.js        jeu FICTIF déterministe
│   ├── source-local.js       vraies données de cet appareil (localStorage)
│   ├── source-supabase.js    adaptateur, non connecté
│   └── error-log.js          collecteur d'erreurs local
├── ui/kit.js                 primitives : tableau, tuiles, graphes SVG, états
└── pages/                    une page par route
    ├── dashboard.js  users.js  flights.js  analytics.js
    └── exercises.js  errors.js  test.js
```

## 2. Les trois règles

1. **Une page n'appelle jamais `localStorage` ni une source.** Elle appelle
   `RTAdmin.data.*`, qui renvoie toujours une `Promise`.
2. **Le kit ne connaît aucune donnée.** Il reçoit ce qu'il affiche.
3. **Scripts classiques, pas de modules ES.** L'application doit rester ouvrable
   par un double-clic (`file://`), où `import`/`export` échoue sur CORS. D'où le
   namespace global `window.RTAdmin` et l'ordre imposé des `<script>` dans
   `index.html`.

## 3. Ajouter une page

```js
// assets/admin/pages/ma-page.js
(function(){
  'use strict';
  var RT = window.RTAdmin, UI = RT.ui;

  RT.page('admin/ma-page', {                    // 'admin/xxx' ou 'admin/xxx/:id'
    render:function(hote, ctx){
      // ctx.params.id   segment d'URL, pour les routes /:id
      // ctx.go(route)   navigation interne
      // ctx.setCrumb(t) dernier segment du fil d'Ariane
      var carte = UI.carte('Mon titre', { sub:'Une phrase qui dit à quoi ça sert.' });
      hote.appendChild(carte);
      UI.charger(carte.body, RT.data.overview({ days:RT.state.days }), function(o){
        return UI.tuile({ value:o.users.total, label:'utilisateurs' });
      });
    }
  });
})();
```

Puis : ajouter l'entrée dans `NAV` (`admin.js`) et la balise `<script>` dans
`index.html`, **après** `admin.js`.

## 4. Brancher Supabase

### 4.1 Les cinq étapes — **faites**

Le branchement est en place depuis le 12/09/2026. Les cinq étapes sont
conservées parce qu'elles disent comment c'est monté, pas comme une liste de
courses :

1. Client vendu en local (comme `leaflet.js`), pour garder `file://` et le
   hors-ligne : `assets/vendor/supabase.js`, chargé **avant**
   `source-supabase.js`. ✔
2. Coordonnées dans `assets/supabase-config.js` — **URL du projet et clé `anon`
   uniquement**, un seul endroit pour tout le site. Ces deux valeurs sont
   publiques par conception. La clé `service_role` n'a **jamais** sa place dans
   un client : elle contourne RLS. ✔
3. SQL du § 4.2 exécuté. ✔
4. Les quatorze méthodes sont écrites. Les agrégats sont calculés **en
   JavaScript** plutôt qu'en SQL : PostgREST ne sait pas faire `group by`, et
   compter ici garde la logique au même endroit que sur les deux autres
   sources — donc les mêmes chiffres pour la même question. La constante
   `PLAFOND` borne le rapatriement ; quand elle est atteinte, la console
   **l'affiche** au lieu de tronquer en silence. C'est le signal qu'il faudra
   passer en fonctions SQL (`rpc`). ✔
5. `DEFAUT_SOURCE = 'supabase'` dans `admin.js`. La clé de mémorisation du choix
   de source porte un numéro de version (`rt-admin-source-v2`) : sans cela, tout
   choix enregistré avant l'existence de la base aurait rouvert la console sur
   des données de démonstration. ✔

Aucune page n'a été réécrite. La source « Cet appareil » reste disponible : elle
sert de banc d'essai permanent — si une nouvelle méthode passe sur `local`, elle
passera sur `supabase`. « Démonstration » reste elle aussi, marquée « fictif »
dans le sélecteur, pour montrer la console pleine quand la base est vide.

**Ce que la console montre dépend de qui la regarde, et c'est voulu.** Aucune
méthode ne teste le rôle : ce sont les politiques RLS qui décident. Un élève qui
ouvrirait `/admin` y verrait une console honnête sur ses propres données, jamais
celles des autres — et la bannière le lui dit.

### 4.2 Le schéma

Six tables. Le raisonnement (et ce qui a été écarté) est dans `ADMIN.md` § 10.

```sql
-- =====================================================================
-- 1. PROFILS  (miroir public de auth.users — ne PAS créer de table `users`)
-- =====================================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  callsign      text default 'F-ABCD',
  role          text not null default 'user'
                check (role in ('user','admin','moderator','content_manager')),
  status        text not null default 'active'
                check (status in ('active','suspended','pending')),
  plan          text not null default 'free',
  settings      jsonb not null default '{}'::jsonb,   -- reprend rt-settings tel quel
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

-- Un profil est créé automatiquement à l'inscription : sans cela, la première
-- requête d'un nouveau compte tomberait sur une ligne absente.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 2. SÉANCES  (scénarios ET vols ET épellation — une seule table, cf. ADMIN.md)
-- =====================================================================
create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  kind          text not null check (kind in ('scenario','flight','spelling')),
  status        text not null default 'in_progress'
                check (status in ('completed','abandoned','in_progress')),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  duration_s    int,
  level         text check (level in ('debutant','reel')),
  mode          text check (mode in ('voyage','local')),
  exercise_key  text,          -- clé étrangère ajoutée en fin de script (§ 7 ci-dessous)
  dep_icao      text, arr_icao text, alt_icao text, diverted_icao text,
  runway        text,
  aircraft      text,
  cruise_alt_ft int,
  pax           int,
  alea          text,          -- moteur | fumee | malaise | cap | radio | ferme | …
  score_ok      int not null default 0,
  score_total   int not null default 0,
  score_pct     int generated always as
                (case when score_total > 0
                      then round(score_ok::numeric * 100 / score_total)::int
                      else null end) stored,
  app_version   text,
  user_agent    text
);
create index on public.sessions (user_id, started_at desc);
create index on public.sessions (kind, started_at desc);
create index on public.sessions (exercise_key);

-- =====================================================================
-- 3. ÉCHANGES  (la trace fine — rt-vols[].lignes[] a déjà cette forme)
-- =====================================================================
create table public.session_steps (
  id           bigserial primary key,
  session_id   uuid not null references public.sessions(id) on delete cascade,
  idx          int not null,
  phase        text, station text, freq text,
  expected     text, said text,
  answered     boolean not null default false,
  missed       text[] not null default '{}',
  score_ok     int not null default 0,
  score_total  int not null default 0,
  at           timestamptz not null default now(),
  unique (session_id, idx)
);
create index on public.session_steps (session_id, idx);

-- =====================================================================
-- 4. CATALOGUE  (métadonnées de pilotage SEULEMENT — le déroulé reste en code)
-- =====================================================================
create table public.exercises (
  key         text primary key,          -- 'roulage', 'decollage', 'integration'…
  title       text not null,
  category    text, level text, station text,
  manual_ref  text,                      -- « p. 44 » du manuel DSNA
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  notes       text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

-- =====================================================================
-- 5. ERREURS
-- =====================================================================
create table public.app_errors (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  level        text not null default 'error' check (level in ('error','warn','info')),
  kind         text not null default 'js'
               check (kind in ('js','speech','audio','network','simulation','user_report')),
  message      text not null,
  stack        text, url text, user_agent text, app_version text,
  user_id      uuid references public.profiles(id) on delete set null,
  session_id   uuid references public.sessions(id) on delete set null,
  context      jsonb not null default '{}'::jsonb,
  resolved_at  timestamptz
);
create index on public.app_errors (occurred_at desc);
create index on public.app_errors (resolved_at) where resolved_at is null;

-- =====================================================================
-- 6. AUDIT  (indispensable dès qu'un admin regarde les données d'autrui)
-- =====================================================================
create table public.admin_audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  admin_id    uuid not null references public.profiles(id) on delete restrict,
  action      text not null,
  target_type text, target_id text,
  meta        jsonb not null default '{}'::jsonb
);

-- =====================================================================
-- 7. Clé étrangère différée : `exercises` est créée après `sessions`, on
--    rattache donc le lien ici plutôt que de réordonner tout le script.
-- =====================================================================
alter table public.sessions
  add constraint sessions_exercise_key_fkey
  foreign key (exercise_key) references public.exercises(key) on delete set null;
```

> À exécuter dans l'ordre : le script ci-dessus se colle tel quel dans l'éditeur
> SQL de Supabase, de haut en bas.

### 4.3 Les vues (à ne pas transformer en tables)

> **`security_invoker = true` n'est pas décoratif.** Une vue PostgreSQL
> s'exécute par défaut avec les droits de son PROPRIÉTAIRE, pas de celui qui
> l'interroge. Comme elle est créée ici par le rôle administrateur, les
> politiques RLS des tables sous-jacentes ne s'appliqueraient pas : n'importe
> quel compte connecté pourrait lire `v_user_progress` et y voir la progression
> de tout le monde. L'option renverse la règle — la vue s'exécute avec les
> droits de l'appelant, et RLS reprend la main. Ne la retirez d'aucune des trois.

```sql
-- Journées de pratique (remplace rt-jours). Une table serait une seconde
-- source de vérité à tenir synchronisée pour rien.
create view public.v_daily_activity with (security_invoker = true) as
  select user_id, started_at::date as day, count(*) as sessions
    from public.sessions where status <> 'in_progress'
   group by 1, 2;

-- Éléments manqués, un par ligne. Alimente « erreurs les plus fréquentes » et
-- les axes de compétence. L'axe est calculé côté client par RTAdmin.taxonomy,
-- pour rester la MÊME règle que sur les sources mock et locale.
create view public.v_missed_items with (security_invoker = true) as
  select s.user_id, s.id as session_id, s.kind, s.started_at, m.label
    from public.session_steps st
    join public.sessions s on s.id = st.session_id
   cross join lateral unnest(st.missed) as m(label);

-- Progression par utilisateur.
create view public.v_user_progress with (security_invoker = true) as
  select user_id,
         count(*) as sessions,
         count(*) filter (where kind = 'flight') as flights,
         sum(coalesce(duration_s, 0)) as training_s,
         case when sum(score_total) > 0
              then round(sum(score_ok)::numeric * 100 / sum(score_total))::int end as avg_pct,
         max(started_at) as last_seen_at
    from public.sessions
   group by user_id;
```

Le **quota du jour** (`rt-quota`) est une requête, pas une table :
`select count(*) from sessions where user_id = auth.uid() and started_at::date = current_date;`

### 4.4 Row Level Security

**C'est ici que se joue la sécurité — nulle part dans le navigateur.**

```sql
alter table public.profiles        enable row level security;
alter table public.sessions        enable row level security;
alter table public.session_steps   enable row level security;
alter table public.app_errors      enable row level security;
alter table public.exercises       enable row level security;
alter table public.admin_audit_log enable row level security;

-- Le rôle est lu EN BASE. Jamais dans un champ du JWT, que le client pourrait
-- influencer. security definer + search_path figé pour éviter le détournement.
create function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and role in ('admin','moderator'))
$$;

-- --- profiles ---
create policy "profil : lecture de soi"      on public.profiles for select using (id = auth.uid());
create policy "profil : mise à jour de soi"  on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profil : lecture admin"       on public.profiles for select using (public.is_admin());
create policy "profil : maj admin"           on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

/* Empêcher quelqu'un de se promettre administrateur ne peut PAS se faire dans la
   politique elle-même : une sous-requête sur `profiles` à l'intérieur d'une
   politique portant sur `profiles` est elle-même soumise à RLS, et PostgreSQL
   s'arrête sur « infinite recursion detected in policy for relation profiles ».
   On passe donc par un déclencheur, qui remet d'office les trois colonnes
   sensibles à leur ancienne valeur quand l'auteur n'est pas administrateur.
   is_admin() est `security definer` : appelée d'ici, elle lit `profiles` SANS
   repasser par RLS, donc sans récursion. */
create function public.profiles_garde() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  /* auth.uid() est NULL quand la requête ne vient PAS d'une session client :
     éditeur SQL, tâche serveur, clé secrète. Ces contextes-là ont déjà tous les
     droits — les brider ici n'ajoute aucune sécurité, et sans cette condition
     il devient impossible de nommer le premier administrateur : l'UPDATE passe,
     le déclencheur le défait aussitôt, et le rôle retombe à « user ».
     Le garde ne concerne donc que les clients. Un client anonyme, lui, ne peut
     de toute façon modifier aucune ligne : les deux politiques UPDATE exigent
     id = auth.uid() ou is_admin(), toutes deux fausses sans session. */
  if auth.uid() is not null and not public.is_admin() then
    new.role   := old.role;
    new.status := old.status;
    new.plan   := old.plan;
  end if;
  return new;
end $$;

create trigger profiles_garde_avant_maj
  before update on public.profiles
  for each row execute function public.profiles_garde();

-- --- sessions et échanges ---
create policy "séance : lecture de soi"  on public.sessions for select using (user_id = auth.uid());
create policy "séance : écriture de soi" on public.sessions for insert with check (user_id = auth.uid());
create policy "séance : maj de soi"      on public.sessions for update using (user_id = auth.uid());
create policy "séance : lecture admin"   on public.sessions for select using (public.is_admin());

create policy "échange : lecture de soi" on public.session_steps for select
  using (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "échange : écriture de soi" on public.session_steps for insert
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "échange : lecture admin"  on public.session_steps for select using (public.is_admin());

-- --- erreurs : chacun peut signaler, seuls les admins lisent tout ---
create policy "erreur : dépôt"           on public.app_errors for insert
  with check (user_id is null or user_id = auth.uid());
create policy "erreur : lecture admin"   on public.app_errors for select using (public.is_admin());
create policy "erreur : maj admin"       on public.app_errors for update using (public.is_admin());

-- --- catalogue : lisible par tous, modifiable par les admins ---
create policy "exercice : lecture"       on public.exercises for select using (true);
create policy "exercice : écriture admin" on public.exercises for all
  using (public.is_admin()) with check (public.is_admin());

-- --- audit : on écrit et on lit, on n'efface JAMAIS ---
create policy "audit : dépôt admin"      on public.admin_audit_log for insert
  with check (public.is_admin() and admin_id = auth.uid());
create policy "audit : lecture admin"    on public.admin_audit_log for select using (public.is_admin());
-- Aucune politique DELETE ni UPDATE : un journal d'audit modifiable ne vaut rien.
```

**Point capital :** avec ces politiques, la « vue élève » (ADMIN.md § 11, niveau 2)
est sûre *par construction* — l'admin lit grâce à `admin read all`, et toute
écriture échoue sur `user_id = auth.uid()`. Aucun `if` côté navigateur n'est en jeu.

### 4.5 Remplir le catalogue des exercices

```sql
-- Le catalogue. Il ne contient QUE des métadonnées de pilotage : le déroulé des
-- échanges reste dans le code (SCENARIOS, index.html), parce qu'il porte des
-- variantes de reconnaissance et des références calculées à l'exécution — du
-- comportement, pas du contenu.
--
-- `manual_ref` est volontairement NULL : le renvoi au manuel DSNA n'existe pas
-- au niveau du scénario mais au niveau de chaque échange (« Manuel DSNA p. 53 »,
-- affiché en cours de vol). Mettre une page approximative ici reviendrait à
-- inventer une source.
insert into public.exercises (key, title, category, level, station, is_active, sort_order) values
  ('roulage',    'Mise en route + roulage',      'sol',      'debutant', 'sol',         true, 10),
  ('decollage',  'Décollage',                    'depart',   'debutant', 'tour',        true, 20),
  ('tourdepiste','Tour de piste',                'circuit',  'debutant', 'tour',        true, 30),
  ('integration','Intégration + atterrissage',   'arrivee',  'debutant', 'tour',        true, 40),
  ('navigation', 'Navigation / croisière',       'enroute',  'debutant', 'information', true, 50),
  ('urgence',    'Urgence (Mayday / Pan Pan)',   'urgence',  'reel',     'tour',        true, 60),
  ('panneradio', 'Panne radio (procédure)',      'urgence',  'reel',     null,          true, 70)
on conflict (key) do update
  set title = excluded.title, category = excluded.category,
      level = excluded.level, station = excluded.station,
      sort_order = excluded.sort_order, updated_at = now();
```

`on conflict do update` : le script se rejoue sans rien casser, et sert aussi à
mettre le catalogue à jour quand un titre change dans le code.

**À exécuter avant le premier scénario.** `sessions.exercise_key` référence
`exercises(key)` : tant que la table est vide, la base refuse d'enregistrer une
séance de scénario. Le refus n'est pas silencieux — la séance part en file
d'attente et la cause apparaît dans le journal d'erreurs de la console — mais
rien ne s'enregistrera.

### 4.6 Nommer le premier administrateur

Il n'y a pas d'amorçage automatique, et c'est voulu : une base fraîche ne doit
contenir aucun compte privilégié par défaut. On promeut donc le premier à la
main, depuis l'éditeur SQL, après avoir créé son compte par le formulaire du
site comme n'importe quel utilisateur.

```sql
update public.profiles set role = 'admin' where email = 'votre@adresse.fr';
select email, role from public.profiles;
```

Le `select` de contrôle n'est pas une politesse : sans la condition
`auth.uid() is not null` dans `profiles_garde()`, l'`UPDATE` annonce
« 1 row affected » et le déclencheur le défait dans la foulée. Le rôle est la
seule preuve.

### 4.7 Migrer les données locales existantes

Le stockage local se transpose directement :

| localStorage | destination |
|---|---|
| `rt-settings` | `profiles.settings` |
| `radiotrainer_history_v2[]` | `sessions` (`kind='scenario'`) |
| `rt-vols[]` | `sessions` (`kind='flight'`) |
| `rt-vols[].lignes[]` | `session_steps` |
| `rt-jours`, `rt-quota` | rien — dérivés (`v_daily_activity`) |
| `rt-vol-en-cours` | `sessions` avec `status='in_progress'` |

`assets/admin/data/source-local.js` fait déjà cette normalisation : sa fonction
`sessionsVols()` est, à peu de chose près, le script de migration.

## 5. Ce qui reste à faire côté application (hors console)

Ces manques sont visibles en creux dans la source « Cet appareil », où les
indicateurs concernés affichent « — ». Ils ne sont pas des bugs de la console :
ce sont des mesures que l'application ne prend pas encore.

- **Durée des séances** — horodater le début, pas seulement la fin.
- **Abandons** — écrire la séance dès son démarrage (`status='in_progress'`),
  puis la faire passer à `completed` ou `abandoned`. Sans cela, aucun entonnoir
  d'abandon n'est calculable, ni localement ni en base.
- **Trace fine des scénarios** — les vols conservent leurs échanges
  (`rt-vols[].lignes[]`), les scénarios non. La même structure suffirait.
- **Résultats de l'épellation** — rien n'est enregistré aujourd'hui.

## 6. Sécurité — la liste courte

- Aucun mot de passe n'est lu, stocké ou transmis. Nulle part.
- Aucune clé secrète dans le client. La clé `anon` n'est pas un secret ; la clé
  `service_role` ne doit jamais y figurer.
- `#admin` n'est **pas** protégé et ne peut pas l'être sur un site statique. Le
  bandeau de la console le dit en permanence. L'autorisation viendra des
  politiques RLS.
- Le rôle affiché dans l'interface est un confort d'affichage. L'autorisation se
  prend en base, via `is_admin()`.
- Toute lecture des données d'autrui s'écrit dans `admin_audit_log`, **avant**
  affichage.
- Pas d'impersonation depuis le navigateur (ADMIN.md § 11, niveau 3).
