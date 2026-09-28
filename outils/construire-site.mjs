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

   POURQUOI PAS UN DOSSIER public/
   GitHub Pages sert albatrosvfr.fr depuis la RACINE de main, et il ne sait
   publier que la racine ou /docs. Déplacer le site dans public/ l'aurait
   cassé. La copie garde la structure à l'identique : tous les chemins
   relatifs (assets/…, Manuel_Phraseologie.pdf) et absolus (/assets/… dans
   404.html) restent vrais.

   AJOUTER UN FICHIER AU SITE
   Tout ce qui vit sous assets/ suit déjà, sauf EXCLUS. Un fichier nouveau à
   la RACINE que le site charge doit être ajouté à PUBLIC — sinon il manquera
   en ligne sur Cloudflare (et seulement là : GitHub Pages sert tout).
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
  'Manuel_Phraseologie.pdf', // page Cours (assets/modules/epellation-cours.js › MANUEL_PDF)
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
