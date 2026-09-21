/* =============================================================================
   Albatros VFR — LE CSS, ET LE PIÈGE QU'IL A TENDU LE JOUR DE SON EXTRACTION
   -----------------------------------------------------------------------------
   Ce fichier existe à cause d'une panne qui a bien failli passer.

   Le CSS vivait dans un <style> d'index.html, et ses images s'écrivaient
   `url("assets/images/…")` — une adresse relative AU DOCUMENT, ce que le bloc
   était. Sorti dans assets/css/, le même texte devient relatif AU FICHIER
   CSS : `assets/css/assets/images/…`. Dix-sept images de fond, toutes en 404,
   d'un coup.

   Ce que ça donne à l'écran : la page se charge, la console ne dit rien
   d'anormal (une image manquante n'est pas une erreur JavaScript), le site
   fonctionne — et les décors ont disparu. Aucun test de parcours ne l'aurait
   vu : ils regardent le comportement, pas les fonds d'écran.

   D'où ce contrôle, qui coûte quelques millisecondes : toute adresse écrite
   dans le CSS doit désigner un fichier qui existe.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { RACINE, styles, lire } from './_source.mjs';

const FEUILLES = readdirSync(join(RACINE, 'assets/css')).filter(f => f.endsWith('.css')).sort();

test('chaque image citée par le CSS existe', () => {
  const cassees = [];
  for (const f of FEUILLES) {
    const chemin = `assets/css/${f}`;
    const texte = lire(chemin);
    for (const m of texte.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) {
      const cible = m[2].trim();
      /* `%23g` n'est pas un fichier : c'est un « #g » encodé, la référence
         qu'une image SVG embarquée en data: fait à son propre filtre. Elle ne
         sort jamais de la chaîne qui la contient. */
      if (/^(data:|https?:|#|%23)/.test(cible)) continue;
      const absolu = resolve(dirname(join(RACINE, chemin)), cible.split('?')[0].split('#')[0]);
      if (!existsSync(absolu)) cassees.push(`${chemin} → ${cible}`);
    }
  }
  assert.deepEqual(cassees, [],
    `Adresse d'image qui ne mène nulle part. Attention au piège de l'extraction : ` +
    `dans un <style> de la page, « assets/images/x.webp » part de la RACINE ; dans ` +
    `assets/css/, il faut « ../images/x.webp ». Une image manquante ne produit ` +
    `aucune erreur de console — elle produit un décor absent.`);
});

test('le CSS n\'est plus écrit dans index.html', () => {
  /* Une règle réintroduite en <style> dans la page échapperait à tous les
     fichiers, donc à toute relecture. On ne l'interdit pas par principe : on
     veut simplement le voir passer. */
  const inline = styles().filter(s => !s.externe);
  assert.deepEqual(inline.map(s => `index.html ligne ${s.ligne}`), [],
    `Un bloc <style> est revenu dans index.html. Si c'est volontaire, le dire ici ` +
    `— sinon ces règles vivront à un endroit que personne ne pense à ouvrir.`);
});

test('les feuilles sont numérotées, et chargées dans l\'ordre de leur numéro', () => {
  /* Le numéro n'est pas décoratif : c'est la cascade. 09-theme-sombre.css ne
     vaut que placé après tout ce qu'il surcharge. */
  const chargees = styles().filter(s => s.src && s.src.startsWith('assets/css/')).map(s => s.src);
  const attendues = FEUILLES.map(f => `assets/css/${f}`);
  assert.deepEqual(chargees, attendues,
    `L'ordre des <link> ne suit plus la numérotation des fichiers, ou une feuille ` +
    `du dossier n'est pas chargée du tout.`);

  const numeros = chargees.map(c => parseInt(c.match(/\/(\d+)-/)[1], 10));
  assert.deepEqual(numeros, [...numeros].sort((a, b) => a - b));
});

test('le thème sombre charge après ce qu\'il surcharge', () => {
  const noms = styles().map(s => s.src || '');
  const sombre = noms.findIndex(n => n.includes('theme-sombre'));
  const socle = noms.findIndex(n => n.includes('01-socle'));
  assert.ok(socle >= 0 && sombre > socle,
    `09-theme-sombre.css est passé devant le socle : le thème sombre ne s'applique ` +
    `plus à ce qui charge après lui, et personne ne verra d'erreur.`);
});
