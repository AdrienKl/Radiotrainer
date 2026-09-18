/* =============================================================================
   AVIERO — RIEN DE SECRET NE PART DANS LE NAVIGATEUR
   -----------------------------------------------------------------------------
   La page appartient à l'utilisateur. Tout ce qui y est servi est lisible par
   qui la reçoit — « voir la source » suffit. Deux valeurs sont publiques par
   conception et doivent le rester : l'URL du projet Supabase et la clé
   publiable. Elles n'ouvrent que ce que les politiques RLS autorisent, et
   c'est la base qui décide, pas le fichier.

   Trois valeurs, en revanche, ne doivent JAMAIS s'y trouver :
     · la clé `secret` (ex-`service_role`), qui contourne TOUTES les politiques ;
     · le mot de passe de la base ;
     · un jeton d'accès personnel Supabase (`sbp_…`), qui donne la main sur
       l'ensemble des projets du compte, bien au-delà de ce site.

   Si l'une d'elles apparaît ici un jour, ce test la signale — mais il ne
   suffit pas : il faut la RÉVOQUER depuis le tableau de bord Supabase. Un
   secret publié une fois est un secret brûlé, même effacé la minute suivante.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { RACINE, lire } from './_source.mjs';

/* Tous les fichiers texte réellement publiés. Les dossiers exclus ne partent
   pas chez l'utilisateur (ou ne sont pas notre code). */
const EXCLUS = new Set(['.git', 'node_modules', 'originaux', 'carte oaci', 'photo avion',
                        'oaci', 'oaci2', 'images', 'avions', 'test-results', 'tests']);
function fichiersServis(dir = RACINE, acc = []) {
  for (const e of readdirSync(dir)) {
    if (EXCLUS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fichiersServis(p, acc);
    else if (/\.(html|js|css|json|md|sh|sql)$/.test(e)) acc.push(p);
  }
  return acc;
}

const MOTIFS = [
  { nom: 'jeton d\'accès personnel Supabase (sbp_…)', re: /\bsbp_[A-Za-z0-9]{20,}/ },
  { nom: 'clé secrète Supabase (sb_secret_…)', re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { nom: 'clé service_role (JWT)', re: /"role"\s*:\s*"service_role"/ },
  { nom: 'JWT en dur', re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./ }
];

test('aucun secret dans les fichiers du dépôt', () => {
  const trouves = [];
  for (const f of fichiersServis()) {
    const texte = readFileSync(f, 'utf8');
    for (const m of MOTIFS) {
      if (m.re.test(texte)) trouves.push(`${relative(RACINE, f)} : ${m.nom}`);
    }
  }
  assert.deepEqual(trouves, [],
    `RÉVOQUER LA VALEUR IMMÉDIATEMENT depuis le tableau de bord Supabase, puis ` +
    `la retirer du fichier. L'effacer sans la révoquer ne sert à rien : elle est ` +
    `déjà dans l'historique Git et, si le site a été publié, déjà servie.`);
});

test('la configuration Supabase ne porte que des valeurs publiques', () => {
  const cfg = lire('assets/supabase-config.js');
  assert.match(cfg, /url:\s*'https:\/\/[a-z0-9]+\.supabase\.co'/);
  assert.match(cfg, /anonKey:\s*'sb_publishable_/,
    `La clé du client n'est plus une clé publiable. Une clé qui n'est pas ` +
    `publiable n'a rien à faire dans un fichier servi au navigateur.`);
});

test('les scripts de déploiement prennent leur jeton dans l\'environnement', () => {
  /* Ces deux scripts appellent l'API d'administration de Supabase. Le jour où
     l'un d'eux porte son jeton en dur, le dépôt entier devient un secret. */
  for (const f of ['supabase/poser-sql.sh', 'supabase/poser-reglages.sh']) {
    const s = lire(f);
    assert.match(s, /SUPABASE_ACCESS_TOKEN/, `${f} n'attend plus de jeton d'environnement.`);
    assert.ok(!/sbp_[A-Za-z0-9]{10,}/.test(s.replace(/sbp_…|sbp_\.\.\./g, '')),
      `${f} contient un jeton en dur.`);
  }
});
