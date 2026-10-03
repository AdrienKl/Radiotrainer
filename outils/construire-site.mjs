/* =============================================================================
   Albatros VFR — CE QUI EST PUBLIÉ SUR CLOUDFLARE
   -----------------------------------------------------------------------------
   Copie dans dist/ les SEULS fichiers que le navigateur doit pouvoir charger.
   Cloudflare (Workers + Static Assets, wrangler.jsonc › assets.directory) publie
   dist/, et rien d'autre.

     node outils/construire-site.mjs

   POURQUOI UNE LISTE BLANCHE, ET PAS UNE LISTE D'EXCLUSIONS
   Le premier déploiement publiait la racine du dépôt : node_modules y compris
   (workerd, 128 Mo — « Asset too large »), mais aussi CLAUDE.md, ADMIN.md, sql/,
   tests/, supabase/, les scripts. Une liste d'exclusions (.assetsignore) aurait
   réglé la panne du jour ; elle aurait aussi publié, sans que personne le
   décide, le prochain fichier interne posé à la racine. Ici, un fichier
   n'est publié que si on l'ajoute EXPRÈS à PUBLIC.

   POURQUOI UNE COPIE, ET PAS UN DOSSIER public/
   Jusqu'au 03/10/2026, GitHub Pages servait albatrosvfr.fr depuis la RACINE
   de main : un dossier public/ l'aurait cassé. Le site est désormais servi
   par Cloudflare seul ; la copie reste, parce qu'elle garde la structure à
   l'identique — tous les chemins relatifs (assets/…) et absolus (/assets/…
   dans 404.html) restent vrais, et le serveur local des tests sert la racine
   telle quelle.

   AJOUTER UN FICHIER AU SITE
   Tout ce qui vit sous assets/ suit déjà, sauf EXCLUS. Un fichier nouveau à
   la RACINE que le site charge doit être ajouté à PUBLIC — sinon il manquera
   en ligne (et seulement là : le serveur local des tests sert tout).
   tests/contrat/publication.test.mjs vérifie que rien de ce que index.html
   charge n'est oublié.

   Aucune dépendance : Node seul, pour que la construction chez Cloudflare ne
   dépende de rien d'autre que du dépôt.
   ========================================================================== */
import { cpSync, rmSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'dist');

/* Ce que le navigateur charge. Chemins relatifs à la racine du dépôt. */
export const PUBLIC = [
  'index.html',
  '404.html',               // servie par Cloudflare pour toute adresse inconnue (not_found_handling)
  'robots.txt',
  'sitemap.xml',
  /* Manuel_Phraseologie.pdf n'est plus publié depuis le 02/10/2026 : le cours
     qui l'affichait a été retiré (demande du développeur). Il reste dans le
     dépôt, source de vérité de la phraséologie (CLAUDE.md § 2). */
  'assets'
];

/* Sous les dossiers publiés, ce qui n'est pas pour le navigateur : les notes
   internes, et deux fichiers de données que le site ne lit jamais (le
   catalogue du manuel sert aux outils/ et aux tests, meta.json documente la
   fabrication des tuiles OACI). */
export const EXCLUS = [
  /(^|\/)README\.md$/i,
  /(^|\/)\.DS_Store$/,
  /^assets\/donnees\/phraseologie-manuel\.json$/,
  /^assets\/oaci\/meta\.json$/
];

// Limite de Cloudflare Workers Static Assets : 25 Mio par fichier.
export const TAILLE_MAX = 25 * 1024 * 1024;

const exclu = rel => EXCLUS.some(re => re.test(rel));

/* Ce qui sera publié, sans rien copier : [{ chemin, taille }], chemins en « / ».
   C'est ce que lit tests/contrat/publication.test.mjs. */
export function listerPublies() {
  const liste = [];
  for (const p of PUBLIC) {
    if (!existsSync(join(RACINE, p))) throw new Error('Fichier public introuvable : ' + p);
    (function parcourir(rel) {
      if (exclu(rel)) return;
      const st = statSync(join(RACINE, rel));
      if (st.isDirectory()) { for (const e of readdirSync(join(RACINE, rel))) parcourir(rel + '/' + e); return; }
      liste.push({ chemin: rel, taille: st.size });
    })(p);
  }
  return liste;
}

export function construire({ silencieux = false } = {}) {
  rmSync(SORTIE, { recursive: true, force: true });
  mkdirSync(SORTIE, { recursive: true });
  for (const p of PUBLIC) {
    const src = join(RACINE, p);
    if (!existsSync(src)) throw new Error('Fichier public introuvable : ' + p);
    cpSync(src, join(SORTIE, p), {
      recursive: true,
      filter: s => !exclu(relative(RACINE, s).split(sep).join('/'))
    });
  }
  // Bilan, et refus net plutôt qu'un déploiement qui échouerait plus loin.
  let n = 0, total = 0, trop = [];
  (function parcourir(d) {
    for (const e of readdirSync(d)) {
      const p = join(d, e), st = statSync(p);
      if (st.isDirectory()) { parcourir(p); continue; }
      n++; total += st.size;
      if (st.size > TAILLE_MAX) trop.push(relative(SORTIE, p));
    }
  })(SORTIE);
  if (trop.length) throw new Error('Fichier(s) au-delà de 25 Mio, refusés par Cloudflare : ' + trop.join(', '));
  if (!silencieux) console.log('dist/ : ' + n + ' fichiers, ' + (total / 1048576).toFixed(1) + ' Mo');
  return { n, total };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { construire(); }
  catch (e) { console.error(e.message); process.exit(1); }
}
