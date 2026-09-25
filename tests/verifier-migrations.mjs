/* =============================================================================
   Albatros VFR — LES MIGRATIONS SUFFISENT-ELLES À MONTER UN PROJET NEUF ?
   -----------------------------------------------------------------------------
   Rejoue sql/*.sql dans l'ordre sur un PostgreSQL VIERGE et JETABLE, puis
   recommence. Deux questions, une par passe :

     passe 1 — est-ce qu'un projet neuf se monte à partir des seules migrations ?
     passe 2 — est-ce que les rejouer ne change rien ? (elles sont idempotentes,
               et le fichier qu'on rejoue par prudence ne doit rien casser)

   ┌─ POURQUOI CE CONTRÔLE EXISTE ───────────────────────────────────────────┐
   │ La base de production a été bâtie À LA MAIN depuis                      │
   │ assets/admin/README.md : les tables, is_admin(), profiles_garde(), les   │
   │ vues, toutes les politiques. Les migrations n'en décrivaient qu'une      │
   │ partie — et rien ne pouvait le dire, parce que sur la production tout    │
   │ est là. Le manque ne se voit QUE sur une base vide.                      │
   │                                                                          │
   │ CE QUE CE FICHIER A TROUVÉ À SA PREMIÈRE EXÉCUTION, le 19/09/2026 :      │
   │   · sql/000-socle.sql s'arrêtait sur « function public.is_admin() does   │
   │     not exist » — ses politiques d'app_errors l'appellent ;              │
   │   · sql/002-progression.sql s'arrêtait sur la MÊME erreur, quatre fois   │
   │     dans son § 4.                                                        │
   │ is_admin() n'était définie qu'en sql/003, qui passe après. L'en-tête de  │
   │ sql/003 ANNONÇAIT la panne sans que son numéro permette de l'éviter.     │
   │ Elle vit désormais dans le socle. Sans ce banc d'essai, on l'aurait      │
   │ découvert en montant le projet de test, un jour où on avait autre chose  │
   │ à faire.                                                                 │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌─ CE QUE CE CONTRÔLE NE PROUVE PAS ──────────────────────────────────────┐
   │ PGlite est un vrai PostgreSQL, ce n'est pas Supabase. Le schéma `auth`,  │
   │ les rôles `anon` / `authenticated` / `service_role` et `auth.uid()` sont │
   │ des DOUBLURES posées ci-dessous — minimales, et c'est assumé.            │
   │                                                                          │
   │ Donc : ce fichier prouve que le SQL passe et que le schéma se construit. │
   │ Il ne prouve RIEN sur le comportement réel des politiques face à un vrai │
   │ jeton — ça, c'est tests/verifier-catalogue.mjs, contre le projet réel.   │
   │ Les deux sont complémentaires, aucun ne remplace l'autre.                │
   └──────────────────────────────────────────────────────────────────────────┘

   HORS LIGNE, et c'est pour ça qu'il est dans la suite par défaut : il ne parle
   à aucun Supabase, ni au projet de production, ni à un autre.

   USAGE
       node tests/verifier-migrations.mjs
       sh tests/lancer_tout.sh migrations
   ========================================================================== */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE, elementsDuTableau, toutLeCode } from './contrat/_source.mjs';

/* RACINE vient de _source.mjs, qui la résout par fileURLToPath. Le piège est
   déjà tombé ici : « new URL('..', import.meta.url).pathname » rend un chemin
   d'URL, et le dossier du projet contient une ESPACE — donc « %20 », et un
   ENOENT sur un dossier qui existe. */
const rouge = t => `\x1b[31m${t}\x1b[0m`;
const vert  = t => `\x1b[32m${t}\x1b[0m`;
let problemes = 0;
const rate = m => { problemes++; console.log(rouge('  ✖ ' + m)); };
const passe = m => console.log(vert('  ✔ ' + m));

/* --- PGlite est une dépendance de test, pas de l'application ---------------
   L'application reste un site statique sans aucune dépendance (package.json le
   dit). Si le module manque, on le DIT — on ne saute pas en silence, parce
   qu'un contrôle qu'on croit vert alors qu'il n'a pas tourné est pire que pas
   de contrôle du tout. */
let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  console.error(rouge('\n  @electric-sql/pglite est absent — ce contrôle n\'a PAS tourné.'));
  console.error('  Il fournit un PostgreSQL en mémoire, sans installation ni service.');
  console.error('  Installer :  npm install\n');
  process.exit(2);
}

const db = new PGlite();

/* --- Les doublures : le strict minimum que Supabase fournit --------------- */
await db.exec(`
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  -- auth.uid() rend NULL ici : aucune session. C'est exactement le contexte
  -- « éditeur SQL » que profiles_garde() traite à part (sql/001 § 4).
  create or replace function auth.uid() returns uuid
    language sql stable as $x$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $x$;
  create role anon;
  create role authenticated;
  create role service_role;
`);

/* --- Les migrations, dans l'ordre du dossier -------------------------------
   Lues depuis le disque et triées : ajouter sql/004 le fera entrer ici tout
   seul, sans toucher à ce fichier. C'est le numéro qui commande — d'où
   l'importance qu'il dise la vérité sur l'ordre (voir l'en-tête de
   sql/000-socle.sql). */
const migrations = readdirSync(join(RACINE, 'sql')).filter(f => f.endsWith('.sql')).sort();

console.log('\n═══ MIGRATIONS — un projet neuf, à partir des seuls fichiers ═══\n');
console.log(`    ${migrations.length} fichiers : ${migrations.join(', ')}\n`);

async function jouer(fichier, numeroDePasse) {
  try {
    await db.exec(readFileSync(join(RACINE, 'sql', fichier), 'utf8'));
    passe(`${fichier.padEnd(34)} passe ${numeroDePasse}`);
    return true;
  } catch (e) {
    rate(`${fichier.padEnd(34)} passe ${numeroDePasse} — ${e.message}`);
    if (e.position) console.log(rouge(`      à la position ${e.position} du fichier`));
    if (numeroDePasse === 1) {
      console.log(`\n    Un projet Supabase NEUF ne peut pas être monté en l'état.`);
      console.log(`    Souvent : un objet employé avant d'être créé, et défini dans un`);
      console.log(`    fichier au numéro PLUS GRAND — donc joué plus tard.\n`);
    } else {
      console.log(`\n    Le fichier n'est pas idempotent : le rejouer casse. Or on le`);
      console.log(`    rejoue — c'est la manœuvre de rattrapage recommandée partout.\n`);
    }
    return false;
  }
}

for (const f of migrations) if (!(await jouer(f, 1))) break;

if (!problemes) {
  console.log('');
  for (const f of migrations) if (!(await jouer(f, 2))) break;
}

/* --- Ce que la base doit contenir une fois tout joué ---------------------- */
const q = async sql => (await db.query(sql)).rows;

if (!problemes) {
  console.log('\n═══ LE SCHÉMA OBTENU ═══\n');

  /* 1. Les six tables, toutes sous RLS. Une table née sans RLS est lisible et
        modifiable par quiconque détient la clé publiable — laquelle est dans le
        code source du site, par conception. */
  const ATTENDUES = ['admin_audit_log','app_errors','exercises','profiles','session_steps','sessions'];
  const tables = await q(`
    select c.relname as t, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' order by 1`);
  const noms = tables.map(r => r.t);
  const absentes = ATTENDUES.filter(t => !noms.includes(t));
  if (absentes.length) rate(`tables absentes : ${absentes.join(', ')}`);
  else passe(`les ${ATTENDUES.length} tables sont créées`);

  const sansRls = tables.filter(r => !r.rls).map(r => r.t);
  if (sansRls.length) {
    rate(`table(s) SANS row level security : ${sansRls.join(', ')}`);
    console.log(rouge(`      Lisible et modifiable par n'importe qui : la clé publiable est`));
    console.log(rouge(`      dans le code source du site.`));
  } else passe('toutes les tables sont sous row level security');

  /* 2. Les vues. security_invoker n'est pas décoratif : sans lui, une vue
        s'exécute avec les droits de son PROPRIÉTAIRE et court-circuite la RLS
        des tables qu'elle lit — n'importe quel compte connecté verrait la
        progression de tout le monde. */
  const VUES = ['v_daily_activity','v_daily_practice','v_missed_items','v_user_progress'];
  const vues = (await q(`select table_name as v from information_schema.views where table_schema='public'`)).map(r => r.v);
  const vuesAbsentes = VUES.filter(v => !vues.includes(v));
  if (vuesAbsentes.length) rate(`vue(s) absente(s) : ${vuesAbsentes.join(', ')}`);
  else passe(`les ${VUES.length} vues sont créées`);

  const sansInvoker = await q(`
    select c.relname as v from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relkind='v'
       and not coalesce(array_to_string(c.reloptions, ',') like '%security_invoker=true%', false)`);
  if (sansInvoker.length) {
    rate(`vue(s) sans security_invoker : ${sansInvoker.map(r => r.v).join(', ')}`);
    console.log(rouge(`      Elles s'exécutent avec les droits de leur propriétaire : la RLS des`));
    console.log(rouge(`      tables sous-jacentes ne s'applique plus. Fuite de données entre comptes.`));
  } else passe('les vues portent toutes security_invoker = true');

  /* 3. Les fonctions. `security definer` sans `search_path` figé est la faille
        classique : qui peut créer un schéma devant `public` fait résoudre
        `profiles` vers SA table. */
  const FONCTIONS = ['handle_new_user','inscription_jalon','is_admin','profiles_garde','pseudo_libre'];
  const fonctions = await q(`
    select p.proname as f, p.prosecdef as definer,
           coalesce(array_to_string(p.proconfig, ','), '') as config
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' order by 1`);
  const fAbsentes = FONCTIONS.filter(f => !fonctions.some(r => r.f === f));
  if (fAbsentes.length) rate(`fonction(s) absente(s) : ${fAbsentes.join(', ')}`);
  else passe(`les ${FONCTIONS.length} fonctions sont créées`);

  const definerSansChemin = fonctions.filter(r => r.definer && !r.config.includes('search_path='));
  if (definerSansChemin.length) {
    rate(`fonction(s) « security definer » sans search_path figé : ${definerSansChemin.map(r => r.f).join(', ')}`);
    console.log(rouge(`      C'est le détournement classique d'une fonction security definer.`));
  } else passe('toute fonction « security definer » a son search_path figé');

  /* 4. Le déclencheur d'inscription. Sans lui, un compte neuf n'a pas de
        profil, et sa première requête tombe sur une ligne absente — pas une
        erreur bruyante, une page vide. */
  const trg = await q(`
    select t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='auth' and c.relname='users' and t.tgname='on_auth_user_created'`);
  if (!trg.length) rate('le déclencheur on_auth_user_created est absent de auth.users');
  else passe('le déclencheur on_auth_user_created est posé sur auth.users');

  /* 5. La clé étrangère du catalogue, et surtout SON on delete. En `cascade`
        elle effacerait les séances des élèves quand on retire un exercice. */
  const fk = await q(`
    select pg_get_constraintdef(oid) as def from pg_constraint
     where conname = 'sessions_exercise_key_fkey'`);
  if (!fk.length) rate('la clé étrangère sessions.exercise_key → exercises.key est absente');
  else if (!/ON DELETE SET NULL/i.test(fk[0].def)) {
    rate(`sessions_exercise_key_fkey n'est pas « on delete set null » : ${fk[0].def}`);
    console.log(rouge(`      En cascade, retirer un exercice du catalogue EFFACERAIT les séances`));
    console.log(rouge(`      que des élèves ont faites dessus.`));
  } else passe('la clé étrangère du catalogue est « on delete set null »');

  /* 6. Le journal d'audit est en AJOUT SEUL. Un journal qu'on peut réécrire ne
        prouve rien. Sous RLS, ce qui n'est pas autorisé est refusé — l'absence
        de politique DELETE/UPDATE n'est pas un oubli, c'est la protection. */
  const audit = await q(`
    select policyname, cmd from pg_policies
     where schemaname='public' and tablename='admin_audit_log' and cmd in ('DELETE','UPDATE')`);
  if (audit.length) {
    rate(`${audit.length} politique(s) DELETE/UPDATE sur admin_audit_log : ${audit.map(r => r.policyname).join(', ')}`);
    console.log(rouge(`      Un journal d'audit modifiable ne vaut rien.`));
  } else passe('le journal d\'audit est en ajout seul — aucune politique DELETE ni UPDATE');

  /* 7. Le catalogue, comparé à ce que l'APPLICATION déclare. C'est le jumeau
        hors ligne de tests/verifier-catalogue.mjs : celui-ci compare le code
        aux migrations, l'autre compare le code à la base réelle. */
  const scenarios = (elementsDuTableau(toutLeCode(), 'SCENARIOS') || [])
    .map(p => (/id\s*:\s*"([a-z]+)"/.exec(p) || [])[1]).filter(Boolean);
  const catalogue = (await q(`select key from public.exercises order by sort_order`)).map(r => r.key);
  const oublies = scenarios.filter(s => !catalogue.includes(s));
  if (oublies.length) {
    rate(`${oublies.length} scénario(s) du code absent(s) du catalogue des migrations : ${oublies.join(', ')}`);
    console.log(rouge(`      Leurs séances monteront SANS rattachement : l'historique les affiche`));
    console.log(rouge(`      « Scénario », et « Refaire ce scénario » ne marche pas dessus.`));
  } else passe(`les ${scenarios.length} scénarios du code sont au catalogue`);

  /* 8. Et pour finir, la seule chose qui se prouve en agissant : une
        inscription crée-t-elle vraiment un profil ? */
  await db.exec(`insert into auth.users (email, raw_user_meta_data)
                 values ('essai@albatros.test', '{"display_name":"Essai"}'::jsonb)`);
  const profil = await q(`select email, display_name, role, status from public.profiles
                           where email = 'essai@albatros.test'`);
  if (!profil.length) {
    rate('une inscription ne crée PAS de profil');
    console.log(rouge(`      Le compte existe et n'a pas de ligne dans profiles : la première`));
    console.log(rouge(`      requête du nouveau venu tombe sur une page vide.`));
  } else if (profil[0].role !== 'user' || profil[0].status !== 'active') {
    rate(`le profil créé n'a pas les valeurs par défaut attendues : ${JSON.stringify(profil[0])}`);
  } else {
    passe(`une inscription crée un profil « ${profil[0].display_name} », rôle « user », actif`);
  }

  /* 9. Les bornes de taille d'app_errors (sql/004). La table accepte les
        dépôts anonymes : sans bornes, n'importe qui y dépose des mégaoctets.
        On vérifie dans les deux sens — une erreur ordinaire PASSE (une borne
        trop serrée perdrait de vraies erreurs), une trop longue est REFUSÉE. */
  const deposer = async (champs) => {
    const cols = Object.keys(champs), vals = cols.map((_, i) => `$${i + 1}`);
    try {
      await db.query(`insert into public.app_errors (${cols.join(',')}) values (${vals.join(',')})`,
                     Object.values(champs));
      return null;
    } catch (e) { return e.message; }
  };
  const ordinaire = await deposer({
    message: 'TypeError: Cannot read properties of undefined (reading \'icao\')',
    stack: 'at f (moteur.js:1:1)\n'.repeat(60), url: 'https://albatrosvfr.fr/#navigation',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    app_version: '2026.09', context: JSON.stringify({ page: 'navigation', scenario: 'tour-de-piste' })
  });
  if (ordinaire) rate(`une erreur de taille ordinaire est refusée : ${ordinaire}`);
  else passe('une erreur de taille ordinaire est acceptée');

  const TROP = [
    ['message',     { message: 'x'.repeat(2001) }],
    ['stack',       { message: 'm', stack: 'x'.repeat(16001) }],
    ['url',         { message: 'm', url: 'x'.repeat(2049) }],
    ['user_agent',  { message: 'm', user_agent: 'x'.repeat(513) }],
    ['app_version', { message: 'm', app_version: 'x'.repeat(65) }],
    ['context',     { message: 'm', context: JSON.stringify({ d: 'x'.repeat(16000) }) }]
  ];
  const passees = [];
  for (const [col, champs] of TROP) if (!(await deposer(champs))) passees.push(col);
  if (passees.length) {
    rate(`app_errors accepte des valeurs trop longues : ${passees.join(', ')}`);
    console.log(rouge(`      Dépôt anonyme autorisé : n'importe qui peut y écrire des mégaoctets.`));
  } else passe(`app_errors refuse les dépôts trop longs, sur ses ${TROP.length} colonnes bornées`);
}

console.log('');
if (problemes) {
  console.log(rouge(`${problemes} problème(s). Voir ci-dessus.\n`));
  process.exit(1);
}
console.log(vert('Les migrations montent un projet neuf, et se rejouent sans rien changer.\n'));
