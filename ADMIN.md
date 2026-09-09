# RadioTrainer — Espace Admin / Controller

Ce document répond aux douze questions posées avant l'implémentation, puis décrit
l'architecture retenue. Il est la référence pour brancher Supabase plus tard.

---

## 1. Le framework utilisé

**Aucun.** RadioTrainer est une application **vanilla HTML/CSS/JavaScript**, en un
seul fichier `index.html` (10 627 lignes, 766 Ko), sans build, sans bundler, sans
`package.json`, sans npm. La seule bibliothèque tierce est **Leaflet**, vendue en
local (`assets/leaflet.js`), pour les cartes.

Deux conséquences dimensionnantes, qui ont dicté toutes les décisions ci-dessous :

1. **Le site doit continuer à fonctionner en `file://`** (double-clic sur
   `index.html`). C'est pour cela que les données volumineuses sont chargées en
   `<script src>` et jamais par `fetch()` — un commentaire du code le dit
   explicitement (ligne 7148). Donc : **pas de modules ES** (`import`/`export`),
   qui échouent en `file://` sur la politique CORS. L'Admin utilise des scripts
   classiques et un namespace global `window.RTAdmin`.
2. **Le déploiement est GitHub Pages** (`AdrienKl/Radiotrainer`), donc statique :
   il n'y a pas de serveur, pas de rendu côté serveur, pas de middleware. Toute
   « sécurité » d'accès à `/admin` posée dans le navigateur est décorative — d'où
   le parti pris du § 11.

## 2. L'architecture actuelle

```
index.html                     ← toute l'application
├─ <head>
│   ├─ <script>   thème anti-flash (lit rt-settings avant peinture)
│   └─ <style>    ~1 680 lignes : jetons de design + tous les styles
├─ <body>
│   ├─ .topnav / .disclaimer   (vitrine)
│   ├─ aside.sidebar           (coquille applicative, 9 entrées)
│   ├─ .app-topbar             (hamburger mobile)
│   ├─ .epel-fond              (décor de l'épellation, hors <main>)
│   ├─ <main>                  12 × <section id="page-XXX" class="page">
│   ├─ <footer>, .toast, #confirmModal
│   └─ 8 blocs <script> à portées SÉPARÉES (IIFE), qui ne partagent
│      que quelques globales explicites (window.rt*)
└─ assets/  leaflet, aerodromes-geo.js, airspace.js, avions.js, tuiles OACI
```

**Routeur.** Un SPA à hash, bloc `<script>` ligne 6425. `showPage(name)` bascule la
classe `.active` entre les `<section class="page">`, met une macro-classe sur
`<body>` (`state-vitrine` / `state-auth` / `state-app`), pousse `#name` dans
l'historique et émet `rt:page` pour les modules qui doivent réagir (Leaflet a
besoin d'`invalidateSize()` une fois visible).

**Authentification.** Mock intégral, **en mémoire seulement** : `var authed=false`
dans l'IIFE du routeur. `loginSubmit` et `signupSubmit` appellent `enterApp()` sans
la moindre vérification. Aucun mot de passe n'est lu, stocké ni transmis. Un
rafraîchissement ramène à la vitrine.

**Styles.** Jetons CSS sur `:root` (`--violet`, `--ink`, `--bg`, `--surface`,
`--border`, `--ok/--warn/--bad`, `--shadow-*`, `--radius`, `--pill`, `--mono`,
`--sans`), et une palette sombre unique sur `:root[data-theme="dark"]`. Une seule
source de vérité : le thème est un attribut, pas une media query dupliquée.

## 3. Les fichiers importants

| Fichier | Rôle |
|---|---|
| `index.html` | Toute l'application (styles, markup, logique) |
| `assets/aerodromes-geo.js` | Coordonnées + fréquences des aérodromes |
| `assets/airspace.js` | CTR / TMA / zones R-P-D |
| `assets/avions.js` | `NAV_AVIONS` — photos détourées + noms d'appareils |
| `assets/leaflet.js` / `.css` | Cartographie (seule dépendance tierce) |
| `Manuel_Phraseologie.pdf` | Manuel DSNA 281 p. — **source de toute la phraséologie** |
| `PHRASEOLOGIE-MANUEL.md` | Notes de travail sur le manuel |

Repères dans `index.html` :

| Ligne | Contenu |
|---|---|
| 2800 | `AERODROMES` — 387 terrains, pistes et caps |
| 3767 | `SCENARIOS` — les scénarios de la page Scénarios |
| 5613 | `rtSettings()` / `rtSaveSettings()` — clé `rt-settings` |
| 5867 | `rtConfirm()` — modale de confirmation maison |
| 6159 | Récapitulatif + historique des sessions + export |
| 6336 | `computeBadges()` / `badgesVol()` |
| 6425 | **Routeur SPA** |
| 6569 | Catalogue de cours + exercice d'épellation |
| 7191 | **Module Navigation** (préparation + vol) |
| 7998 | `ALEAS` — messages du service d'information |
| 8768 | `ALEAS_VOL` + `insererAleaMajeur()` — imprévus et urgences |
| 10210 | Tableau de bord d'accueil |
| 10443 | Page Paramètres |

## 4. Les composants réutilisables

Réutilisés tels quels par l'Admin, sans les modifier :

- **Jetons de design** — toute la palette, les ombres, les rayons, les polices.
- **`.btn`** et ses variantes `.small`, `.cta`, `.ghost`, `.primary`.
- **`.ic-svg`** — convention d'icônes SVG en trait, `viewBox="0 0 24 24"`.
- **`showToast(msg)`** — notification éphémère.
- **`rtConfirm(texte, {title, ok, cancel})`** — modale, renvoie une `Promise`.
- **`.modal` / `.modal-card`** — structure de dialogue.
- **`.switch`** (interrupteur), **`.seg3` / `.segmented-ui`** (contrôles segmentés).
- **`escapeHtml()`** — l'Admin embarque son propre `esc()` équivalent, car les
  portées `<script>` sont cloisonnées.
- **Données de référence** : `AERODROMES`, `SCENARIOS`, `NAV_AVIONS`, `NATO`.
  Le jeu de données fictif s'appuie dessus, de sorte que l'interface affiche de
  vrais codes OACI, de vrais titres de scénarios, de vrais types d'appareils.

Non réutilisés (volontairement) : `.tb-*` (tableau de bord élève), `.nav-*` (vol),
`.spell-*` (épellation) — ce sont des styles de page, pas des composants.

## 5. Comment fonctionne le système de simulation

Il existe **deux** systèmes distincts, et l'Admin n'en crée aucun troisième.

**A. Scénarios** (`#page-exercices`, bloc principal). `SCENARIOS` est un tableau
d'objets `{id, titre, station, defaultTerrain, controllable, tours:[…]}`. Chaque
tour est soit un tour **pilote** (`role:'pilote'`, avec `consigne`, `attendu`,
`motsCles[]`), soit un tour **contrôleur** (`atc:[…]`, puis collationnement
attendu). Les gabarits `{ADRM} {STN} {CALL} {PISTE} {QNH} {VENT}` sont substitués
au lancement. Chaque tour porte une variante `afis:` pour les terrains non
contrôlés. La reconnaissance vocale compare la transcription aux `motsCles`, dont
chacun a des `variantes[]` ou une `ref` (`callsign`, `piste`, `qnh`, `terrain`…).
Le résultat d'un tour est `[{label, found:bool}, …]`.

**B. Navigation / vol** (`#page-navigation`, module ligne 7191). Le vol est
**construit dynamiquement** par `buildFlight()` à partir du contexte `F.ctx`
(départ, arrivée, dégagement, appareil, niveau, passagers, météo tirée au sort,
piste calculée selon le vent, espaces aériens traversés). Il en sort `F.steps[]`,
une suite d'échanges `{ph (phase), stn (station), freq, attendu, motsCles}`.
`insererAleaMajeur()` insère **au plus un** imprévu par vol, avant l'intégration,
environ une fois sur deux : `moteur`, `fumee`, `malaise` (MAYDAY / PAN PAN),
`cap`, `radio`, `ferme` (déroutement), ou l'un des messages de la bibliothèque
`ALEAS_VOL`. Les étapes ne sont **jamais sérialisées** : la reprise d'un vol
interrompu re-fabrique le tableau et se contente de restaurer l'index et la météo.

Conséquence pour l'Admin : **on n'analyse pas « une simulation », on analyse la
trace qu'elle a laissée.** C'est exactement ce que le modèle de données ci-dessous
capture.

## 6. Où sont stockés les résultats aujourd'hui

Tout est en **localStorage**, sur l'appareil, jamais envoyé sur Internet.

| Clé | Écrite par | Forme |
|---|---|---|
| `radiotrainer_history_v2` | fin de scénario (`saveHistory`) | 50 dernières : `{date, scenario, scIdx, terrain, piste, found, total, missed[], mode}` |
| `rt-vols` | fin de vol (`enregistrerVol`) | 40 derniers : `{date, titre, dep, arr, deg, mode, level, avion, alt, pax, ok, total, pct, alea, lignes[]}` |
| `rt-vols[].lignes[]` | idem | `{ph, stn, freq, attendu, dit, manquants[], repondu}` — **la trace fine, échange par échange** |
| `rt-vol-en-cours` | pendant le vol | contexte de reprise `{dep, arr, alt, mode, level, acft, fl, pax, i, results, call, meteo, rwy, …}` |
| `rt-jours` | `rtJourActif()` | dates ISO des journées de pratique effective |
| `rt-quota` | `rtQuotaIncr()` | `{date, n}` — quota du jour, compté mais non bloquant |
| `rt-settings` | Paramètres | thème, voix, débit, indicatif, difficulté, carte… |
| `rt-menu-replie` | barre latérale | `'0'` / `'1'` |

L'épellation ne persiste rien (statistiques de série en mémoire).
Les badges ne sont pas stockés : ils sont **recalculés** depuis l'historique.

## 7. L'architecture Admin retenue

**Une seule application, un seul `index.html`, un seul routeur.** L'Admin est une
`<section>` de plus dans `<main>`, servie par le même routeur à hash. Ce qui change,
c'est *où vit son code* : dans `assets/admin/`, pas dans `index.html`.

```
                 index.html                        assets/admin/
 ┌──────────────────────────────────┐   ┌───────────────────────────────────┐
 │ routeur SPA (showPage)           │   │  admin.js      coquille + routeur │
 │   #accueil …#compte  → inchangé  │   │                interne + garde    │
 │   #admin/*           → nouveau ──┼──▶│  ui/kit.js     tableaux, tuiles,  │
 │                                  │   │                graphes, états     │
 │ <section id="page-admin">        │◀──┤  pages/*.js    8 pages            │
 │   <div id="admRoot"></div>       │   │                                   │
 └──────────────────────────────────┘   │  data/contract.js   ← LE contrat  │
                                        │      ├ source-mock.js     fictif  │
                                        │      ├ source-local.js    réel    │
                                        │      └ source-supabase.js  stub   │
                                        └───────────────────────────────────┘
```

### Le point central : la couche de données

Aucune page Admin ne lit `localStorage`, ne connaît un tableau de données ni
n'écrit de valeur en dur. Toutes passent par la **façade** `RTAdmin.data`, dont
chaque méthode renvoie une `Promise` :

```
RTAdmin.data.overview({range})     RTAdmin.data.flights({filtres})
RTAdmin.data.activity({limit})     RTAdmin.data.flight(id)
RTAdmin.data.alerts()              RTAdmin.data.analytics({range})
RTAdmin.data.users({filtres})      RTAdmin.data.exercises({filtres})
RTAdmin.data.user(id)              RTAdmin.data.errors({filtres})
RTAdmin.data.userSessions(id)      RTAdmin.data.error(id)
RTAdmin.data.userWeaknesses(id)    RTAdmin.data.capabilities()
```

Derrière la façade, **trois sources interchangeables**, choisies dans la barre du
haut de l'Admin :

| Source | Ce qu'elle affiche | Statut |
|---|---|---|
| **Démonstration** | Jeu **fictif** déterministe (graine fixe) construit sur les vraies références de l'appli — vrais codes OACI, vrais titres de scénarios, vrais appareils, vrais imprévus | par défaut |
| **Cet appareil** | Les **vraies** données locales de la personne connectée (`rt-vols`, `radiotrainer_history_v2`, `rt-jours`…) | réel, un seul « utilisateur » |
| **Supabase** | Rien : l'adaptateur existe, il n'est pas connecté et le dit | à brancher |

Le bandeau et le sélecteur affichent en permanence la nature des données. **Aucune
donnée fictive n'est jamais présentée comme réelle** : toutes les vues de la source
Démonstration portent la mention « fictif », et la source « Cet appareil » signale
au contraire ce qui est réel et ce qui n'est pas mesurable localement (« — »).

Brancher Supabase revient à **remplir `source-supabase.js`** et à changer la source
par défaut. Aucune page n'est à réécrire.

## 8. Les fichiers créés

```
ADMIN.md                              ce document
assets/admin/README.md                notice d'intégration Supabase
assets/admin/admin.css                styles de la console (préfixe .adm-)
assets/admin/admin.js                 coquille, rail, topbar, routeur interne, garde
assets/admin/data/contract.js         façade, contrat, taxonomie des points faibles
assets/admin/data/source-mock.js      jeu FICTIF déterministe
assets/admin/data/source-local.js     lecture des vraies données de l'appareil
assets/admin/data/source-supabase.js  adaptateur Supabase (non connecté)
assets/admin/ui/kit.js                primitives d'interface (tableau, tuiles, graphes)
assets/admin/pages/dashboard.js       /admin
assets/admin/pages/users.js           /admin/users et /admin/users/:id
assets/admin/pages/flights.js         /admin/flights
assets/admin/pages/analytics.js       /admin/analytics
assets/admin/pages/exercises.js       /admin/exercises
assets/admin/pages/errors.js          /admin/errors
assets/admin/pages/test.js            /admin/test
```

## 9. Les fichiers existants modifiés

**`index.html` seulement**, et par touches minimales :

1. `<head>` : un `<link>` vers `assets/admin/admin.css`.
2. Une `<section id="page-admin" class="page">` vide dans `<main>` (l'Admin la
   remplit lui-même).
3. Dans le CSS : une poignée de règles `body.state-admin` (masquer topnav,
   disclaimer, footer, barre latérale élève) et l'annulation de l'animation
   d'entrée sur `#page-admin`.
4. Dans le routeur (bloc ligne 6425) : reconnaissance des routes à segments
   (`admin/users/u_07`), macro-état `admin`, émission de `rt:admin`.
5. Une entrée « Administration » dans la barre latérale, **masquée par défaut**,
   révélée par le drapeau de développement.
6. Dans la page Paramètres : un interrupteur « Espace administrateur
   (développement) », clairement étiqueté comme non sécurisé.
7. Les `<script src>` de l'Admin en fin de `<body>`.

Rien d'autre n'est touché. Aucune fonction existante n'est réécrite.

## 10. L'architecture de données recommandée pour Supabase

Le cahier des charges proposait neuf tables. **Six suffisent**, et deux des neuf
proposées seraient redondantes. Voici pourquoi.

### Les tables réellement nécessaires

**`profiles`** — miroir public de `auth.users`.
```
id uuid PK REFERENCES auth.users(id) ON DELETE CASCADE
email text, display_name text, callsign text default 'F-ABCD'
role text CHECK (role IN ('user','admin','moderator','content_manager')) default 'user'
status text CHECK (status IN ('active','suspended','pending')) default 'active'
plan text default 'free'          -- suffit tant qu'il n'y a pas de facturation
settings jsonb default '{}'       -- reprend rt-settings tel quel
created_at timestamptz, last_seen_at timestamptz
```
> **`users` n'est pas à créer** : `auth.users` existe déjà et est géré par Supabase
> Auth. Une table `users` maison serait une duplication à tenir synchronisée, et
> une tentation de stocker des identifiants. `profiles` est le seul miroir.

**`sessions`** — *une seule* table pour les scénarios ET les vols.
```
id uuid PK, user_id uuid → profiles(id)
kind text CHECK (kind IN ('scenario','flight','spelling'))
status text CHECK (status IN ('completed','abandoned','in_progress'))
started_at timestamptz, ended_at timestamptz, duration_s int
level text ('debutant'|'reel'), mode text ('voyage'|'local')
exercise_key text → exercises(key)      -- scénarios
dep_icao text, arr_icao text, alt_icao text, diverted_icao text, runway text
aircraft text, cruise_alt_ft int, pax int
alea text                                -- moteur|fumee|malaise|cap|radio|ferme|…
score_ok int, score_total int, score_pct numeric GENERATED
app_version text, user_agent text
```
> **`training_sessions` et `flight_sessions` fusionnées.** Elles partagent 80 % de
> leurs colonnes (utilisateur, date, durée, score, niveau, statut) et *toutes* les
> questions d'analytics les traversent : « score moyen », « durée moyenne »,
> « où abandonne-t-on ? » n'ont pas de sens table par table. Deux tables
> imposeraient un `UNION ALL` dans chaque requête. Le discriminant `kind` coûte
> une colonne et supprime toute la duplication.

**`session_steps`** — la trace fine, échange par échange.
```
id bigserial PK, session_id uuid → sessions(id) ON DELETE CASCADE
idx int, phase text, station text, freq text
expected text, said text, answered bool
missed text[], score_ok int, score_total int
at timestamptz
UNIQUE (session_id, idx)
```
> **`exercise_results` et `flight_events` fusionnées** : `rt-vols[].lignes[]` et
> `state.results[]` ont déjà exactement cette forme dans le code actuel. Une
> seule table, un seul chemin d'écriture.

**`exercises`** — catalogue, **métadonnées seulement**.
```
key text PK                    -- 'roulage', 'decollage', 'integration'…
title text, category text, level text, station text
manual_ref text                -- « p. 44 » du manuel DSNA
is_active bool default true, sort_order int
notes text, updated_at timestamptz, updated_by uuid
```
> **Le déroulé des scénarios reste dans le code.** `SCENARIOS` contient des
> `motsCles` avec variantes et des `ref` résolues à l'exécution : c'est de la
> logique, pas du contenu. La mettre en base obligerait à un interpréteur en
> base et rendrait impossible toute revue en diff Git. La table sert à
> **piloter** le catalogue (activer/désactiver, ordonner, classer, annoter), pas
> à le définir. Le jour où l'on veut créer un scénario sans redéploiement, on
> ajoute une colonne `payload jsonb` — pas avant.

**`app_errors`** — journal technique.
```
id bigserial PK, occurred_at timestamptz default now()
level text ('error'|'warn'|'info')
kind text ('js'|'speech'|'audio'|'network'|'simulation'|'user_report')
message text, stack text, url text, user_agent text, app_version text
user_id uuid → profiles(id) ON DELETE SET NULL
session_id uuid → sessions(id) ON DELETE SET NULL
context jsonb, resolved_at timestamptz
```

**`admin_audit_log`** — indispensable dès qu'un admin regarde les données d'autrui.
```
id bigserial PK, at timestamptz default now()
admin_id uuid → profiles(id), action text
target_type text, target_id text, meta jsonb
```

### Les tables à ne PAS créer maintenant

| Proposée | Verdict |
|---|---|
| `users` | Redondante avec `auth.users`. Utiliser `profiles`. |
| `training_sessions` + `flight_sessions` | Fusionnées dans `sessions` (`kind`). |
| `exercise_results` + `flight_events` | Fusionnées dans `session_steps`. |
| `errors` | Renommée `app_errors` (`errors` est ambigu en SQL). |
| `subscriptions` | **À différer.** Tant qu'il n'y a pas de facturation réelle, `profiles.plan` suffit. Le jour où Stripe entre en jeu, la table sera dictée par Stripe, pas devinée aujourd'hui. |

### Ce qui doit être une vue, pas une table

- `v_daily_activity` — journées de pratique (aujourd'hui `rt-jours`) : dérivable
  de `sessions`. Une table serait une source de vérité concurrente.
- `v_missed_items` — fréquence des éléments manqués : `unnest(session_steps.missed)`
  agrégé. Alimente « erreurs les plus fréquentes » et les points faibles.
- `v_user_progress` — nombre de sessions, score moyen, temps d'entraînement.
- Le **quota du jour** (`rt-quota`) : `count(*) from sessions where user_id=… and
  started_at::date = current_date`. Aucune table.

### Row Level Security — l'essentiel en trois règles

```sql
-- 1. Chacun ne voit que ses lignes.
create policy "self read" on sessions for select
  using (user_id = auth.uid());

-- 2. Chacun n'écrit que ses lignes.
create policy "self write" on sessions for insert
  with check (user_id = auth.uid());

-- 3. Les admins lisent tout — le rôle est lu en base, JAMAIS dans le client.
create or replace function public.is_admin() returns boolean
  language sql stable security definer as
  $$ select exists (select 1 from public.profiles
                    where id = auth.uid() and role in ('admin','moderator')) $$;

create policy "admin read all" on sessions for select using (public.is_admin());
```
Même schéma pour `profiles`, `session_steps`, `app_errors`. `admin_audit_log` :
insertion par les admins, lecture par les admins, **aucune suppression**.

Point capital : `is_admin()` interroge `profiles`, pas un champ du JWT modifiable
côté client. Le rôle affiché dans l'interface n'est qu'un confort d'affichage ;
l'autorisation, elle, est prise en base.

## 11. « Voir comme un utilisateur » — la recommandation

Trois niveaux, du plus sûr au plus risqué. **Les deux premiers suffisent**, et
c'est le premier qui est implémenté.

**Niveau 1 — Rejeu en lecture seule (implémenté).** La fiche `/admin/users/:id`
et `/admin/flights/:id` montrent la trace complète : chaque échange, la phrase
attendue, ce qui a été dit, ce qui a manqué. Aucune authentification n'est en jeu,
aucun jeton n'est échangé. **C'est 95 % de la valeur** : quand on demande
« pourquoi Alice a-t-elle raté ce vol ? », c'est cette trace que l'on veut, pas
l'écran d'Alice.

**Niveau 2 — Vue élève en lecture seule (architecture posée).** L'interface
normale, rendue avec les données de la cible, avec le **jeton de l'admin** et un
bandeau permanent « Vue de X — lecture seule ». Techniquement :
`RTAdmin.viewAs.set(userId)` fixe un `viewAsUserId` dans la couche de données ;
les requêtes restent celles de l'admin, autorisées par la politique RLS
`admin read all`. Toute écriture est refusée par la politique `self write`
(`user_id = auth.uid()` échoue). **La sécurité vient de la base, pas d'un
`if` dans le navigateur.** Chaque entrée en vue élève écrit dans `admin_audit_log`.

**Niveau 3 — Impersonation réelle : à éviter.** Si elle devenait indispensable
(reproduire un bug lié au compte lui-même), alors, et seulement alors :
serveur uniquement, dans une **Edge Function** détenant la clé `service_role`
(jamais dans le client), jeton de très courte durée (5 min), périmètre restreint,
écriture d'audit obligatoire *avant* émission, bandeau inamovible côté client,
et consentement préalable de la personne. **Jamais de mot de passe** : l'admin
n'y a pas accès et ne doit pas pouvoir en obtenir un.

## 12. Les risques

| Risque | Parade retenue |
|---|---|
| **`/admin` pris pour une page sécurisée** | Bandeau permanent en tête de la console : la garde est une commodité d'interface, pas une sécurité. Rien de sensible n'existe encore côté client. |
| **Données fictives prises pour réelles** | Source affichée en permanence, mention « fictif » sur chaque vue de démonstration, et une source « Cet appareil » qui montre au contraire du vrai. |
| **Casser le routeur existant** | La modification de `showPage()` est additive : découpage du hash sur `/`, nouveau macro-état. Les douze routes existantes empruntent exactement le même chemin qu'avant. |
| **`index.html` devient ingérable** | Tout le code Admin vit dans `assets/admin/`. `index.html` gagne ~60 lignes. |
| **Fuite de style vers le site élève** | Tous les sélecteurs Admin sont préfixés `.adm-` et portés par `#page-admin`. Aucune règle globale n'est modifiée. |
| **Chargement inutile pour l'élève** | Les scripts Admin sont légers et ne s'exécutent qu'à l'entrée sur `#admin` (enregistrement seulement au chargement). |
| **`file://` cassé** | Aucun module ES, aucun `fetch()` : scripts classiques et namespace global, comme le reste du projet. |
| **Divergence future avec Supabase** | Le contrat est écrit avant les pages ; les trois sources l'implémentent à l'identique. La source « Cet appareil » sert de test permanent que le contrat tient sur de vraies données. |

## 13. Les étapes suivies

1. Analyse du projet (ce document).
2. Couche de données : contrat, taxonomie, source fictive, source locale, stub Supabase.
3. Kit d'interface : tableau triable/filtrable, tuiles, graphes SVG, états.
4. Coquille Admin : rail, barre du haut, routeur interne, garde, sélecteur de source.
5. Branchement du routeur SPA existant.
6. Dashboard.
7. Utilisateurs + fiche utilisateur.
8. Vols.
9. Analytics.
10. Exercices.
11. Erreurs.
12. Test / Controller.
13. Vérification de non-régression du site élève, puis publication.
