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
  const ATTENDUES = ['admin_audit_log','app_errors','exercises','profiles','session_steps','sessions','voix_consommation','voix_historique','voix_catalogue','voix_reglages'];
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
  const FONCTIONS = ['handle_new_user','inscription_jalon','is_admin','profiles_garde','pseudo_libre','voix_consommer','voix_plafond_jour','est_admin_plein','admin_voix_regler','admin_voix_plafond','admin_definir_plan'];
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

  /* 10. Le quota de la voix Google (sql/005). Google facture au caractère : ce
         compteur est la seule chose entre un compte premium et une facture
         sans fond. On le fait tourner comme le ferait la fonction Edge — avec
         l'identité de l'utilisateur dans le jeton — et on vérifie chaque refus. */
  const [{ plafond }] = await q(`select public.voix_plafond_jour() as plafond`);
  if (plafond !== 100000) rate(`le plafond journalier de la voix est ${plafond}, et non 100 000`);
  else passe('le plafond journalier de la voix Google est de 100 000 caractères');

  await db.exec(`insert into auth.users (email) values ('gratuit@albatros.test'), ('premium@albatros.test')`);
  const idDe = async e => (await q(`select id from public.profiles where email = '${e}'`))[0].id;
  const gratuit = await idDe('gratuit@albatros.test'), premium = await idDe('premium@albatros.test');
  // Sans session (auth.uid() nul) : le contexte « éditeur SQL », où profiles_garde()
  // laisse l'administrateur changer le plan. C'est la manœuvre documentée.
  await db.exec(`update public.profiles set plan = 'premium' where id = '${premium}'`);
  /* Les § 10 à 13 décrivent le Premium HORS phase de lancement : sql/009 la
     laisse ouverte par défaut, et un compte gratuit y reçoit la voix. On la
     ferme ici ; le § 14 la rouvre et vérifie ce qu'elle change. */
  await db.exec(`update public.voix_reglages set valeur = 0 where cle = 'lancement_gratuit'`);

  const consommer = async (qui, n) => {
    await db.exec(`select set_config('request.jwt.claim.sub', '${qui || ''}', false)`);
    const [r] = await q(`select public.voix_consommer(${n}) as r`);
    return r.r;
  };
  const cas = [
    ['sans session',             () => consommer(null, 10),          'non_connecte'],
    ['compte gratuit',           () => consommer(gratuit, 10),       'non_premium'],
    ['nombre négatif',           () => consommer(premium, -500),     'longueur'],
    ['nombre nul',               () => consommer(premium, 0),        'longueur'],
    ['au-delà du plafond seul',  () => consommer(premium, plafond + 1), 'longueur'],
  ];
  const ratees = [];
  for (const [nom, f, attendu] of cas) {
    const r = await f();
    if (r.ok || r.raison !== attendu) ratees.push(`${nom} → ${JSON.stringify(r)} (attendu « ${attendu} »)`);
  }
  let r1 = await consommer(premium, plafond - 100);
  let r2 = await consommer(premium, 100);
  let r3 = await consommer(premium, 1);
  if (!r1.ok || r1.restant !== 100) ratees.push(`premium, premier décompte → ${JSON.stringify(r1)}`);
  if (!r2.ok || r2.restant !== 0)   ratees.push(`premium, jusqu'au plafond pile → ${JSON.stringify(r2)}`);
  if (r3.ok || r3.raison !== 'quota' || r3.restant !== 0) ratees.push(`premium, un caractère de trop → ${JSON.stringify(r3)}`);
  const [{ total }] = await q(`select sum(caracteres)::int as total from public.voix_consommation`);
  if (total !== plafond) ratees.push(`le compteur vaut ${total} au lieu de ${plafond} : un refus a quand même décompté`);

  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  await db.exec(`update public.profiles set status = 'suspended' where id = '${premium}'`);
  const r4 = await consommer(premium, 1);
  if (r4.ok || r4.raison !== 'compte_inactif') ratees.push(`compte suspendu → ${JSON.stringify(r4)}`);
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);

  if (ratees.length) {
    rate(`voix_consommer() laisse passer ou compte faux :`);
    ratees.forEach(m => console.log(rouge('      · ' + m)));
  } else passe('voix_consommer() refuse sans session, gratuit, suspendu, hors bornes et au-delà du quota — et un refus ne décompte rien');

  /* La table n'a AUCUNE politique d'écriture : seule la fonction y écrit. Une
     politique INSERT/UPDATE permettrait à chacun de remettre son compteur à zéro. */
  const ecriture = await q(`select policyname from pg_policies where schemaname='public'
                             and tablename='voix_consommation' and cmd <> 'SELECT'`);
  if (ecriture.length) rate(`politique(s) d'écriture sur voix_consommation : ${ecriture.map(r => r.policyname).join(', ')}`);
  else passe('voix_consommation n\'a aucune politique d\'écriture — seule la fonction y écrit');

  const anonPeut = await q(`select has_function_privilege('anon', 'public.voix_consommer(integer)', 'execute') as p`);
  if (anonPeut[0].p) rate('le rôle anon peut exécuter voix_consommer()');
  else passe('voix_consommer() est fermée au rôle anon');

  /* 11. L'historique de consommation (sql/006). Trois choses comptent : il ne
         s'écrit QUE quand le quota accepte, il ne peut PAS contenir le texte
         prononcé, et personne d'autre qu'un administrateur ne le lit. */
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  await db.exec(`update public.profiles set status = 'active' where id = '${premium}'`);
  await db.exec(`delete from public.voix_consommation`);
  const consommerAvec = async (qui, n, voix) => {
    await db.exec(`select set_config('request.jwt.claim.sub', '${qui || ''}', false)`);
    const [r] = await q(`select public.voix_consommer(${n}, ${voix === null ? 'null' : `'${voix}'`}) as r`);
    return r.r;
  };
  const histo = async () => q(`select voix, modele, caracteres, requetes from public.voix_historique order by voix`);
  const pb = [];
  let h;
  let r = await consommerAvec(premium, 40, 'fr-FR-Chirp3-HD-Charon');
  if (!r.ok) pb.push(`premium, voix Chirp 3 HD → ${JSON.stringify(r)}`);
  r = await consommerAvec(premium, 60, 'fr-FR-Chirp3-HD-Charon');
  r = await consommerAvec(premium, 25, 'fr-FR-Neural2-G');
  h = await histo();
  const attendu = [
    { voix: 'fr-FR-Chirp3-HD-Charon', modele: 'Chirp3-HD', caracteres: 100, requetes: 2 },
    { voix: 'fr-FR-Neural2-G',        modele: 'Neural2',   caracteres: 25,  requetes: 1 }
  ];
  if (JSON.stringify(h) !== JSON.stringify(attendu)) pb.push(`historique inattendu : ${JSON.stringify(h)}`);
  const [{ total: quotaTotal }] = await q(`select sum(caracteres)::int as total from public.voix_consommation`);
  if (quotaTotal !== 125) pb.push(`le quota vaut ${quotaTotal} au lieu de 125 : les deux comptes divergent`);

  const refus = [
    ['compte gratuit',     () => consommerAvec(gratuit, 10, 'fr-FR-Neural2-G'),     'non_premium'],
    ['sans session',       () => consommerAvec(null, 10, 'fr-FR-Neural2-G'),        'non_connecte'],
    ['voix Standard',      () => consommerAvec(premium, 10, 'fr-FR-Standard-A'),    'voix'],
    ['voix mal formée',    () => consommerAvec(premium, 10, "fr-FR-Neural2-G x"),   'voix'],
    ['autre langue',       () => consommerAvec(premium, 10, 'en-US-Neural2-A'),     'voix'],
    ['au-delà du plafond', () => consommerAvec(premium, plafond, 'fr-FR-Neural2-G'), 'quota'],
  ];
  for (const [nom, f, raison] of refus) {
    const x = await f();
    if (x.ok || x.raison !== raison) pb.push(`${nom} → ${JSON.stringify(x)} (attendu « ${raison} »)`);
  }
  const h2 = await histo();
  if (JSON.stringify(h2) !== JSON.stringify(attendu)) pb.push(`un refus a écrit dans l'historique : ${JSON.stringify(h2)}`);

  // L'ancienne signature : le quota compte, l'historique ne bouge pas.
  r = await consommerAvec(premium, 5, null);
  const [{ total: t2 }] = await q(`select sum(caracteres)::int as total from public.voix_consommation`);
  if (!r.ok || t2 !== 130) pb.push(`ancienne signature voix_consommer(n) → ${JSON.stringify(r)}, quota ${t2}`);
  if (JSON.stringify(await histo()) !== JSON.stringify(attendu)) pb.push('l\'ancienne signature a écrit dans l\'historique');
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);

  if (pb.length) {
    rate('voix_historique ne se comporte pas comme prévu :');
    pb.forEach(m => console.log(rouge('      · ' + m)));
  } else passe('voix_historique : écrit seulement si le quota accepte, additionné par voix, modèle déduit ; l\'ancienne signature marche toujours');

  /* Pas de place pour le texte prononcé : seules ces six colonnes, et les deux
     colonnes de texte sont bornées à la forme d'un nom de voix. */
  const cols = (await q(`select column_name as c from information_schema.columns
                          where table_schema='public' and table_name='voix_historique' order by ordinal_position`)).map(x => x.c);
  const COLS = ['user_id','jour','voix','modele','caracteres','requetes'];
  if (JSON.stringify(cols) !== JSON.stringify(COLS)) rate(`colonnes de voix_historique : ${cols.join(', ')} — attendu ${COLS.join(', ')}`);
  else {
    let texteRefuse = true;
    try {
      await db.exec(`insert into public.voix_historique (user_id, jour, voix, modele) values
                     ('${premium}', current_date, 'fr-FR-F-ABCD, rappelez vent arrière main droite', 'Neural2')`);
      texteRefuse = false;
    } catch { /* refusé : c'est ce qu'on veut */ }
    if (!texteRefuse) rate('voix_historique accepte une phrase dans la colonne `voix`');
    else passe('voix_historique n\'a aucune colonne capable de recevoir le texte prononcé');
  }

  const ecritureH = await q(`select policyname from pg_policies where schemaname='public'
                              and tablename='voix_historique' and cmd <> 'SELECT'`);
  const lectureH = await q(`select qual from pg_policies where schemaname='public'
                             and tablename='voix_historique' and cmd = 'SELECT'`);
  if (ecritureH.length) rate(`politique(s) d'écriture sur voix_historique : ${ecritureH.map(x => x.policyname).join(', ')}`);
  else if (lectureH.length !== 1 || !/is_admin\(\)/.test(lectureH[0].qual) || /auth\.uid/.test(lectureH[0].qual))
    rate(`la lecture de voix_historique n'est pas réservée à l'administration : ${JSON.stringify(lectureH)}`);
  else passe('voix_historique : lecture réservée à l\'administration, aucune écriture possible hors de la fonction');

  const anonPeut2 = await q(`select has_function_privilege('anon', 'public.voix_consommer(integer, text)', 'execute') as p`);
  if (anonPeut2[0].p) rate('le rôle anon peut exécuter voix_consommer(n, nom_voix)');
  else passe('voix_consommer(n, nom_voix) est fermée au rôle anon');

  /* 12. L'administration de la voix (sql/007). Ce qui compte : seul le rôle
         « admin » écrit (pas un modérateur, pas un élève), chaque écriture
         laisse une ligne d'audit, les valeurs sont bornées, et une voix
         désactivée est refusée PAR LA BASE, sans rien décompter. */
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  await db.exec(`insert into auth.users (email) values ('admin@albatros.test'), ('modo@albatros.test')`);
  const admin = await idDe('admin@albatros.test'), modo = await idDe('modo@albatros.test');
  await db.exec(`update public.profiles set role = 'admin' where id = '${admin}'`);
  await db.exec(`update public.profiles set role = 'moderator' where id = '${modo}'`);
  await db.exec(`update public.profiles set plan = 'premium', status = 'active' where id = '${premium}'`);
  await db.exec(`delete from public.voix_consommation`);
  const pb12 = [];
  const comme = async (qui, sql) => {
    await db.exec(`select set_config('request.jwt.claim.sub', '${qui || ''}', false)`);
    try { const [r] = await q(sql); return { ok: true, r }; }
    catch (e) { return { ok: false, code: e.code, message: e.message }; }
  };
  const audits = async () => (await q(`select action, target_id, meta from public.admin_audit_log order by id`));

  // Refusé à un élève, à un modérateur, sans session.
  for (const [nom, qui] of [['élève premium', premium], ['modérateur', modo], ['sans session', null]]) {
    for (const sql of [`select public.admin_voix_plafond(5000)`,
                       `select public.admin_voix_regler('fr-FR-Neural2-G', false, false)`,
                       `select public.admin_definir_plan('${gratuit}', 'premium')`]) {
      const x = await comme(qui, sql);
      if (x.ok) pb12.push(`${nom} a pu exécuter : ${sql}`);
    }
  }
  if ((await audits()).length) pb12.push('un refus a laissé une ligne d\'audit');

  // Le plafond : borné, audité, appliqué au quota.
  let x = await comme(admin, `select public.admin_voix_plafond(500)`);
  if (x.ok) pb12.push('un plafond de 500 (sous 1 000) a été accepté');
  x = await comme(admin, `select public.admin_voix_plafond(2000)`);
  if (!x.ok) pb12.push(`plafond 2 000 refusé à l'admin : ${x.message}`);
  const [{ p: pl }] = await q(`select public.voix_plafond_jour() as p`);
  if (pl !== 2000) pb12.push(`voix_plafond_jour() vaut ${pl} au lieu de 2 000`);
  x = await comme(premium, `select public.voix_consommer(2001, 'fr-FR-Neural2-G') as r`);
  if (!x.ok || x.r.r.raison !== 'longueur') pb12.push(`le nouveau plafond n'est pas appliqué : ${JSON.stringify(x)}`);

  // Une voix désactivée : refusée avant tout décompte.
  x = await comme(admin, `select public.admin_voix_regler('fr-FR-Neural2-G', false, false)`);
  if (!x.ok) pb12.push(`désactiver une voix : ${x.message}`);
  x = await comme(premium, `select public.voix_consommer(10, 'fr-FR-Neural2-G') as r`);
  if (!x.ok || x.r.r.raison !== 'voix_desactivee') pb12.push(`voix désactivée acceptée : ${JSON.stringify(x)}`);
  const [{ t: apresRefus }] = await q(`select coalesce(sum(caracteres),0)::int as t from public.voix_consommation`);
  if (apresRefus !== 0) pb12.push(`le refus d'une voix désactivée a décompté ${apresRefus} caractères`);
  x = await comme(premium, `select public.voix_consommer(10, 'fr-FR-Chirp3-HD-Charon') as r`);
  if (!x.ok || !x.r.r.ok) pb12.push(`une voix non réglée (donc active) est refusée : ${JSON.stringify(x)}`);

  // La voix par défaut : une seule, et jamais une voix désactivée.
  x = await comme(admin, `select public.admin_voix_regler('fr-FR-Neural2-G', false, true)`);
  if (x.ok) pb12.push('une voix désactivée a pu devenir la voix par défaut');
  await comme(admin, `select public.admin_voix_regler('fr-FR-Chirp3-HD-Charon', true, true)`);
  await comme(admin, `select public.admin_voix_regler('fr-FR-Wavenet-F', true, true)`);
  const defauts = (await q(`select voix from public.voix_catalogue where par_defaut`)).map(r => r.voix);
  if (JSON.stringify(defauts) !== JSON.stringify(['fr-FR-Wavenet-F'])) pb12.push(`voix par défaut : ${JSON.stringify(defauts)}`);

  // Le plan : free ⇄ premium, rien d'autre.
  x = await comme(admin, `select public.admin_definir_plan('${gratuit}', 'gold')`);
  if (x.ok) pb12.push('un plan « gold » a été accepté');
  x = await comme(admin, `select public.admin_definir_plan('${gratuit}', 'premium')`);
  const [{ plan: pg }] = await q(`select plan from public.profiles where id = '${gratuit}'`);
  if (!x.ok || pg !== 'premium') pb12.push(`passer un compte en premium : ${JSON.stringify(x)}, plan ${pg}`);
  await comme(admin, `select public.admin_definir_plan('${gratuit}', 'free')`);

  // L'audit : une ligne par écriture acceptée, dans l'ordre.
  const act = (await audits()).map(a => a.action);
  const attenduAudit = ['voix.plafond', 'voix.regler', 'voix.regler', 'voix.regler', 'compte.plan', 'compte.plan'];   // le refus (voix désactivée par défaut) n'écrit rien
  if (JSON.stringify(act) !== JSON.stringify(attenduAudit)) pb12.push(`journal d'audit : ${JSON.stringify(act)}`);
  const plan1 = (await audits()).find(a => a.action === 'compte.plan');
  if (!plan1 || plan1.meta.avant !== 'free' || plan1.meta.apres !== 'premium') pb12.push(`audit du plan incomplet : ${JSON.stringify(plan1)}`);

  // Remise en état pour ce qui suivrait.
  await comme(admin, `select public.admin_voix_plafond(100000)`);
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);

  if (pb12.length) { rate('l\'administration de la voix ne se comporte pas comme prévu :'); pb12.forEach(m => console.log(rouge('      · ' + m))); }
  else passe('administration de la voix : écriture réservée au rôle « admin », bornée, auditée ; voix désactivée refusée sans décompte ; une seule voix par défaut');

  const ecr = await q(`select tablename, policyname from pg_policies where schemaname='public'
                        and tablename in ('voix_catalogue','voix_reglages') and cmd <> 'SELECT'`);
  if (ecr.length) rate(`politique(s) d'écriture sur ${ecr.map(r => r.tablename + ' / ' + r.policyname).join(', ')}`);
  else passe('voix_catalogue et voix_reglages : aucune écriture hors des fonctions d\'administration');
  const anonAdm = await q(`select bool_or(has_function_privilege('anon', f, 'execute')) as p from unnest(array[
      'public.admin_voix_regler(text, boolean, boolean)', 'public.admin_voix_plafond(integer)',
      'public.admin_definir_plan(uuid, text)']) f`);
  if (anonAdm[0].p) rate('une fonction d\'administration est ouverte au rôle anon');
  else passe('les fonctions d\'administration sont fermées au rôle anon');

  /* 13. Le Premium payant (sql/008). Ce qui compte : un Premium expire à sa
         date sans qu'on bascule rien ; un webhook rejoué ne crédite pas deux
         fois ; un rachat prolonge, il ne remet jamais à zéro ; plan,
         premium_jusqua et role ne s'écrivent plus que par l'admin plein —
         la faille des modérateurs est fermée. */
  const pb13 = [];
  const moi13 = async qui => db.exec(`select set_config('request.jwt.claim.sub', '${qui || ''}', false)`);
  const profil13 = async id => (await q(`select plan, role, premium_jusqua from public.profiles where id = '${id}'`))[0];
  const actif = async id => (await q(`select public.premium_actif('${id}') as a`))[0].a;
  const paris = async ts => (await q(`select to_char(timestamptz '${ts}' at time zone 'Europe/Paris', 'YYYY-MM-DD HH24:MI:SS') as t`))[0].t;
  const finParis = async id => (await q(`select to_char(premium_jusqua at time zone 'Europe/Paris', 'YYYY-MM-DD HH24:MI:SS') as t
                                          from public.profiles where id = '${id}'`))[0].t;
  const crediter = async (session, compte, mode = 'live') => {
    await moi13(null);   // le webhook : clé secrète, aucune session utilisateur
    return (await q(`select public.stripe_crediter('${session}', '${compte}', 1799, 'paye', null, '${mode}') as r`))[0].r;
  };

  await moi13(null);
  await db.exec(`insert into auth.users (email) values ('eleve8@albatros.test'), ('acheteur8@albatros.test')`);
  const eleve = await idDe('eleve8@albatros.test'), acheteur = await idDe('acheteur8@albatros.test');

  // 13.1 La garde : ni l'élève, ni le modérateur ; l'admin plein, oui.
  for (const [nom, qui, cible] of [['un élève (sur lui-même)', eleve, eleve], ['un modérateur', modo, eleve], ['un modérateur (sur lui-même)', modo, modo]]) {
    const avant = await profil13(cible);
    await moi13(qui);
    await db.exec(`update public.profiles set plan = 'premium', role = 'admin', premium_jusqua = '2099-01-01' where id = '${cible}'`);
    await moi13(null);
    const apres = await profil13(cible);
    if (apres.plan !== avant.plan || apres.role !== avant.role || String(apres.premium_jusqua) !== String(avant.premium_jusqua))
      pb13.push(`${nom} a pu écrire plan / role / premium_jusqua : ${JSON.stringify(apres)}`);
  }
  await moi13(modo);   // le modérateur garde status
  await db.exec(`update public.profiles set status = 'suspended' where id = '${eleve}'`);
  await moi13(null);
  if ((await q(`select status from public.profiles where id = '${eleve}'`))[0].status !== 'suspended')
    pb13.push('le modérateur ne peut plus suspendre un compte (status) — il le pouvait avant sql/008');
  await db.exec(`update public.profiles set status = 'active' where id = '${eleve}'`);
  await moi13(admin);
  await db.exec(`update public.profiles set plan = 'premium', premium_jusqua = '2099-01-01' where id = '${eleve}'`);
  await moi13(null);
  let p13 = await profil13(eleve);
  if (p13.plan !== 'premium' || !p13.premium_jusqua) pb13.push(`l'admin plein n'a pas pu écrire plan / premium_jusqua : ${JSON.stringify(p13)}`);

  // 13.2 premium_actif : sans fin, date passée, date future, gratuit.
  await db.exec(`update public.profiles set plan = 'premium', premium_jusqua = null where id = '${eleve}'`);
  if (!(await actif(eleve))) pb13.push('Premium sans fin (premium_jusqua NULL) → premium_actif faux');
  await db.exec(`update public.profiles set premium_jusqua = now() - interval '1 second' where id = '${eleve}'`);
  if (await actif(eleve)) pb13.push('Premium à date passée → premium_actif vrai');
  x = await comme(eleve, `select public.voix_consommer(10, null) as r`);
  if (!x.ok || x.r.r.raison !== 'non_premium') pb13.push(`un Premium expiré garde la voix Google : ${JSON.stringify(x)}`);
  await moi13(null);   // comme() laisse la session de l'élève : sa garde bloquerait la mise à jour suivante
  await db.exec(`update public.profiles set premium_jusqua = now() + interval '1 day' where id = '${eleve}'`);
  if (!(await actif(eleve))) pb13.push('Premium à date future → premium_actif faux');
  await db.exec(`update public.profiles set plan = 'free', premium_jusqua = null where id = '${eleve}'`);
  if (await actif(eleve)) pb13.push('compte gratuit → premium_actif vrai');

  // 13.3 La date de fin : 3 mois calendaires, 23:59:59 heure de Paris.
  for (const [depart, attendu] of [
    ['2026-09-29 14:00:00+02', '2026-12-29 23:59:59'],
    ['2026-11-30 12:00:00+01', '2027-02-28 23:59:59'],
    ['2027-11-30 12:00:00+01', '2028-02-29 23:59:59'],   // 2028 est bissextile
    ['2026-09-29 23:30:00+00', '2026-12-30 23:59:59']    // 01 h 30 à Paris le 30/09 : le jour de PARIS compte
  ]) {
    const [{ f }] = await q(`select public.premium_fin_apres('${depart}') as f`);
    const vu = await paris(f.toISOString());
    if (vu !== attendu) pb13.push(`premium_fin_apres(${depart}) → ${vu} au lieu de ${attendu} (Paris)`);
  }

  // 13.4 Un crédit, puis le même webhook rejoué : un seul crédit, une seule ligne.
  let r13 = await crediter('cs_live_premierachat0001', acheteur);
  if (!r13 || !r13.credite) pb13.push(`premier crédit refusé : ${JSON.stringify(r13)}`);
  const fin1 = await finParis(acheteur);
  r13 = await crediter('cs_live_premierachat0001', acheteur);
  if (!r13.ok || r13.credite || r13.raison !== 'deja_traite') pb13.push(`webhook rejoué : ${JSON.stringify(r13)}`);
  const [{ n: lignes }] = await q(`select count(*)::int as n from public.paiements where stripe_session_id = 'cs_live_premierachat0001'`);
  if (lignes !== 1) pb13.push(`${lignes} lignes de paiement pour une seule session`);
  if (await finParis(acheteur) !== fin1) pb13.push('le webhook rejoué a déplacé la date de fin');
  if (!(await actif(acheteur))) pb13.push('l\'acheteur n\'est pas Premium après paiement');

  // 13.5 Rachat avant expiration : prolongation depuis la fin actuelle, y compris 30/11 → 28/02 et 29/02.
  for (const [finActuelle, attendu, session] of [
    ['2026-11-30 23:59:59+01', '2027-02-28 23:59:59', 'cs_live_rachat20261130xx'],
    ['2027-11-30 23:59:59+01', '2028-02-29 23:59:59', 'cs_live_rachat20271130xx']
  ]) {
    await db.exec(`update public.profiles set plan = 'premium', premium_jusqua = '${finActuelle}' where id = '${acheteur}'`);
    r13 = await crediter(session, acheteur);
    const vu = await finParis(acheteur);
    if (!r13.credite || vu !== attendu) pb13.push(`rachat avec fin au ${finActuelle} → ${vu} au lieu de ${attendu} : ${JSON.stringify(r13)}`);
  }
  // Premium expiré : repart de maintenant, pas de l'ancienne date.
  await db.exec(`update public.profiles set plan = 'premium', premium_jusqua = now() - interval '10 days' where id = '${acheteur}'`);
  await crediter('cs_live_apresexpiration1', acheteur);
  const [{ ok: depuisMaintenant }] = await q(`select premium_jusqua = public.premium_fin_apres(now()) as ok from public.profiles where id = '${acheteur}'`);
  if (!depuisMaintenant) pb13.push('un rachat après expiration ne repart pas de maintenant');

  // 13.6 Premium sans fin : le paiement est noté, rien n'est raccourci.
  await db.exec(`update public.profiles set plan = 'premium', premium_jusqua = null where id = '${acheteur}'`);
  r13 = await crediter('cs_live_sansfin000000001', acheteur);
  p13 = await profil13(acheteur);
  if (r13.raison !== 'sans_fin' || p13.premium_jusqua !== null) pb13.push(`Premium sans fin raccourci : ${JSON.stringify(r13)} ${JSON.stringify(p13)}`);
  if (!(await q(`select 1 from public.paiements where stripe_session_id = 'cs_live_sansfin000000001'`)).length)
    pb13.push('le paiement d\'un compte sans fin n\'est pas noté');

  // 13.7 Mode test : refusé pour un non-admin, sans ligne ; accepté pour l'admin plein.
  r13 = await crediter('cs_test_eleve0000000001', eleve, 'test');
  if (r13.ok || r13.raison !== 'test_non_admin') pb13.push(`paiement de test crédité à un élève : ${JSON.stringify(r13)}`);
  if ((await q(`select 1 from public.paiements where stripe_session_id = 'cs_test_eleve0000000001'`)).length)
    pb13.push('un paiement de test refusé a laissé une ligne');
  r13 = await crediter('cs_test_modo00000000001', modo, 'test');
  if (r13.ok) pb13.push('paiement de test crédité à un modérateur');
  await db.exec(`update public.profiles set plan = 'free', premium_jusqua = null where id = '${admin}'`);
  r13 = await crediter('cs_test_admin0000000001', admin, 'test');
  if (!r13.credite) pb13.push(`paiement de test refusé à l'admin plein : ${JSON.stringify(r13)}`);

  // 13.8 Données invalides : refus, rien d'écrit.
  const avantInvalide = (await q(`select count(*)::int as n from public.paiements`))[0].n;
  for (const sql of [`select public.stripe_crediter('cs_live_statutfaux00001', '${acheteur}', 1799, 'rembourse', null, 'live')`,
                     `select public.stripe_crediter('cs_live_modefaux000001', '${acheteur}', 1799, 'paye', null, 'prod')`,
                     `select public.stripe_crediter('cs_test_melange0000001', '${acheteur}', 1799, 'paye', null, 'live')`,
                     `select public.stripe_crediter('pas-une-session', '${acheteur}', 1799, 'paye', null, 'live')`]) {
    try { await db.exec(sql); pb13.push('accepté : ' + sql); } catch (e) {}
  }
  if ((await q(`select count(*)::int as n from public.paiements`))[0].n !== avantInvalide) pb13.push('un paiement invalide a laissé une ligne');
  r13 = await crediter('cs_live_inconnu000000001', '00000000-0000-0000-0000-000000000000');
  if (r13.ok || r13.raison !== 'compte_inconnu') pb13.push(`compte inconnu : ${JSON.stringify(r13)}`);

  // 13.9 admin_definir_plan : Premium offert = sans fin, même sur un achat expiré.
  await db.exec(`update public.profiles set plan = 'premium', premium_jusqua = now() - interval '1 day' where id = '${acheteur}'`);
  x = await comme(admin, `select public.admin_definir_plan('${acheteur}', 'premium')`);
  if (!x.ok || !(await actif(acheteur)) || (await profil13(acheteur)).premium_jusqua !== null)
    pb13.push(`redonner le Premium à un achat expiré ne l'a pas rendu actif : ${JSON.stringify(x)}`);

  // 13.10 Le compteur de la console : les expirés n'y sont pas.
  await moi13(null);
  await db.exec(`update public.profiles set plan = 'free', premium_jusqua = null`);
  await db.exec(`update public.profiles set plan = 'premium', premium_jusqua = null where id = '${eleve}'`);
  await db.exec(`update public.profiles set plan = 'premium', premium_jusqua = now() + interval '5 days' where id = '${acheteur}'`);
  await db.exec(`update public.profiles set plan = 'premium', premium_jusqua = now() - interval '5 days' where id = '${premium}'`);
  x = await comme(admin, `select public.admin_premium_actifs() as n`);
  if (!x.ok || x.r.n !== 2) pb13.push(`admin_premium_actifs → ${JSON.stringify(x)} au lieu de 2 (l'expiré ne compte pas)`);
  x = await comme(eleve, `select public.admin_premium_actifs() as n`);
  if (x.ok) pb13.push('un élève lit le compteur de la console');
  await moi13(null);

  if (pb13.length) { rate('le Premium payant ne se comporte pas comme prévu :'); pb13.forEach(m => console.log(rouge('      · ' + m))); }
  else passe('Premium payant : expiration par date, crédit unique par session, prolongation sans perte, 30/11 → 28/02 / 29/02 à 23:59:59 Paris, test réservé à l\'admin ; plan / premium_jusqua / role au seul admin plein');

  // 13.11 Les droits : stripe_crediter au seul service_role ; paiements sans écriture client.
  const droits = await q(`select r, f, has_function_privilege(r, f, 'execute') as p from
      unnest(array['anon','authenticated','service_role']) r,
      unnest(array['public.stripe_crediter(text, uuid, integer, text, text, text)',
                   'public.premium_actif(uuid)', 'public.premium_fin_apres(timestamptz)']) f`);
  const fautifs = droits.filter(d => (d.r === 'service_role') !== d.p);
  if (fautifs.length) rate('droits d\'exécution : ' + fautifs.map(d => `${d.r} ${d.p ? 'PEUT' : 'ne peut pas'} ${d.f}`).join(' ; '));
  else passe('stripe_crediter, premium_actif, premium_fin_apres : service_role seul — anon et authenticated refusés');
  const polP = await q(`select policyname, cmd from pg_policies where schemaname='public' and tablename='paiements'`);
  const [{ rls }] = await q(`select relrowsecurity as rls from pg_class where oid = 'public.paiements'::regclass`);
  if (!rls || polP.some(pp => pp.cmd !== 'SELECT') || polP.length !== 2)
    rate(`paiements : RLS ${rls} ; politiques ${JSON.stringify(polP)}`);
  else passe('paiements : RLS active, lecture de soi et admin plein, aucune écriture côté client');

  /* 14. La phase de lancement (sql/009). Ce qui compte : un compte gratuit
         reçoit la voix Google tant que la phase est ouverte, mais sous SON
         plafond (plafond_gratuit), pas celui du Premium ; la phase se ferme
         par un réglage, et le refus redevient « non_premium » ; l'admin plein
         n'est pas soumis au plafond gratuit ; anon ne lit plus paiements. */
  const pb14 = [];
  await moi13(null);
  await db.exec(`insert into auth.users (email) values ('lancement9@albatros.test')`);
  const libre = await idDe('lancement9@albatros.test');
  await db.exec(`delete from public.voix_consommation`);
  await db.exec(`update public.profiles set plan = 'free', premium_jusqua = null, role = 'user' where id in ('${libre}', '${admin}')`);
  await db.exec(`update public.profiles set role = 'admin' where id = '${admin}'`);
  await comme(admin, `select public.admin_voix_plafond(100000)`);
  await moi13(null);
  await db.exec(`update public.voix_reglages set valeur = 1 where cle = 'lancement_gratuit'`);
  const [{ pg14 }] = await q(`select public.voix_plafond_gratuit() as pg14`);
  if (pg14 !== 20000) pb14.push(`plafond gratuit ${pg14} au lieu de 20 000`);
  const conso14 = async (qui, n) => { const x = await comme(qui, `select public.voix_consommer(${n}, 'fr-FR-Chirp3-HD-Charon') as r`); return x.ok ? x.r.r : x; };
  let r14 = await conso14(libre, 100);
  if (!r14.ok || r14.restant !== 19900) pb14.push(`gratuit, phase ouverte : ${JSON.stringify(r14)} au lieu de ok, restant 19 900`);
  r14 = await conso14(libre, 20001);
  if (r14.ok || r14.raison !== 'longueur') pb14.push(`gratuit, message plus long que son plafond : ${JSON.stringify(r14)}`);
  r14 = await conso14(libre, 19900);
  if (!r14.ok || r14.restant !== 0) pb14.push(`gratuit, jusqu'au plafond : ${JSON.stringify(r14)}`);
  r14 = await conso14(libre, 1);
  if (r14.ok || r14.raison !== 'quota') pb14.push(`gratuit, au-delà du plafond : ${JSON.stringify(r14)}`);
  r14 = await conso14(admin, 30000);
  if (!r14.ok) pb14.push(`l'admin plein (plan free) est tenu au plafond gratuit : ${JSON.stringify(r14)}`);
  r14 = await conso14(modo, 30000);
  if (r14.ok || r14.raison !== 'longueur') pb14.push(`un modérateur échappe au plafond gratuit : ${JSON.stringify(r14)}`);
  await moi13(null);
  await db.exec(`update public.voix_reglages set valeur = 0 where cle = 'lancement_gratuit'`);
  r14 = await conso14(libre, 10);
  if (r14.ok || r14.raison !== 'non_premium') pb14.push(`gratuit, phase fermée : ${JSON.stringify(r14)}`);
  r14 = await conso14(admin, 10);
  if (!r14.ok) pb14.push(`l'admin plein perd la voix quand la phase ferme : ${JSON.stringify(r14)}`);
  await moi13(null);
  try { await db.exec(`insert into public.voix_reglages (cle, valeur) values ('faute_de_frappe', 1)`); pb14.push('une clé de réglage inconnue est acceptée'); } catch (e) {}
  const [{ anonP }] = await q(`select has_table_privilege('anon', 'public.paiements', 'select') as "anonP"`);
  if (anonP) pb14.push('anon garde le droit SELECT sur paiements');
  const [{ lg }] = await q(`select has_function_privilege('anon', 'public.lancement_gratuit()', 'execute') as lg`);
  if (lg) pb14.push('anon peut exécuter lancement_gratuit()');

  if (pb14.length) { rate('la phase de lancement ne se comporte pas comme prévu :'); pb14.forEach(m => console.log(rouge('      · ' + m))); }
  else passe('phase de lancement : voix Google aux comptes gratuits sous leur plafond (20 000), refus « non_premium » dès la fermeture, admin plein hors plafond gratuit ; anon ne lit plus paiements');
}

console.log('');
if (problemes) {
  console.log(rouge(`${problemes} problème(s). Voir ci-dessus.\n`));
  process.exit(1);
}
console.log(vert('Les migrations montent un projet neuf, et se rejouent sans rien changer.\n'));
