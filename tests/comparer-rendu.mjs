/* =============================================================================
   AVIERO — COMPARER LE RENDU AVANT / APRÈS UN DÉCOUPAGE
   -----------------------------------------------------------------------------
   Les tests de parcours disent que l'application FONCTIONNE. Ils ne disent rien
   de ce à quoi elle RESSEMBLE. Or déplacer du CSS ne casse presque jamais un
   comportement : ça décale une marge, ça perd une couleur, ça fait disparaître
   un fond — et aucun test de comportement ne le verra.

   Cet outil ouvre les mêmes pages sur DEUX versions du site et compare les
   captures. Il ne remplace pas un œil humain ; il dit où regarder.

   ┌─ MODE D'EMPLOI ─────────────────────────────────────────────────────────┐
   │ 1. poser la version de référence à côté, sans toucher au dossier de      │
   │    travail :                                                             │
   │                                                                          │
   │      git worktree add /tmp/aviero-ref main                               │
   │      (cd /tmp/aviero-ref && python3 -m http.server 8001 &)               │
   │      python3 -m http.server 8000 &                                       │
   │                                                                          │
   │ 2. comparer :                                                            │
   │                                                                          │
   │      node tests/comparer-rendu.mjs                                       │
   │                                                                          │
   │ 3. ranger :                                                              │
   │                                                                          │
   │      git worktree remove /tmp/aviero-ref                                 │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌─ LIRE LE RÉSULTAT — LE PIÈGE ───────────────────────────────────────────┐
   │ Quatre pages ne sont PAS reproductibles : l'accueil et la Navigation     │
   │ portent une carte Leaflet dont les tuiles n'arrivent jamais au même      │
   │ instant, les Exercices et la Navigation tirent une photo d'avion AU      │
   │ SORT à chaque session, et plusieurs décors ont un grain généré.          │
   │                                                                          │
   │ Ces pages ressortent donc « différentes » même en comparant une version  │
   │ à ELLE-MÊME. C'est la seule lecture honnête : lancer d'abord le contrôle │
   │ (--temoin, qui compare 8000 à 8000) et ne s'inquiéter que des pages qui  │
   │ diffèrent dans la vraie comparaison SANS diffèrer dans le contrôle.      │
   │                                                                          │
   │ Relevé du 18/09/2026, extraction du CSS : 13 écarts sur 56 captures, et  │
   │ EXACTEMENT 13 dans le contrôle. Aucun écart imputable au découpage.      │
   └──────────────────────────────────────────────────────────────────────────┘

   Les captures divergentes sont écrites dans /tmp/diff-*.png, par paires
   AVANT / APRÈS, pour être ouvertes côte à côte.
   ========================================================================== */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const TEMOIN = process.argv.includes('--temoin');
const APRES = 'http://localhost:8000';
const AVANT = TEMOIN ? 'http://localhost:8000' : 'http://localhost:8001';

const PAGES = ['accueil', 'login', 'signup', 'mentions', 'cgu', 'confidentialite',
               'tableau', 'exercices', 'navigation', 'carte', 'epellation', 'cours',
               'progression', 'parametres'];

/* Les quatre pages qu'on ne peut PAS comparer au pixel, et pourquoi :
     accueil, navigation, carte  → une carte Leaflet, dont les tuiles n'arrivent
                                   jamais au même instant ;
     exercices, navigation       → une photo d'avion tirée AU SORT à chaque
                                   session ;
     epellation                  → un code tiré au sort, et un décor à grain
                                   généré.
   Elles ressortent « différentes » même comparées à elles-mêmes. Les compter
   avec les autres donnerait un résultat qui ne veut rien dire — et qu'on
   finirait par ignorer. Elles sont donc rapportées à part, et leur vérification
   revient aux tests de parcours (comportement) et à un œil humain (apparence). */
const NON_REPRODUCTIBLES = ['accueil', 'navigation', 'carte', 'epellation', 'exercices'];
const APP = ['tableau', 'exercices', 'navigation', 'carte', 'epellation', 'cours',
             'progression', 'parametres'];
const THEMES = ['light', 'dark'];
const TAILLES = [{ w: 1280, h: 900, nom: 'bureau' }, { w: 400, h: 800, nom: 'telephone' }];

const navigateur = await chromium.launch();

async function tirer(base, page, route, theme) {
  await page.addInitScript(t => localStorage.setItem('rt-settings', JSON.stringify({ theme: t })), theme);
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.goto(`${base}/index.html`);
  await page.waitForFunction(() => typeof window.rtSessionOuverte === 'function');
  await page.evaluate(([r, app]) => {
    if (app.includes(r)) window.rtSessionOuverte();
    location.hash = '#' + r;
  }, [route, APP]);
  await page.waitForTimeout(900);
  return page.screenshot({ fullPage: true });
}

const ecarts = [];
const bruit = [];
let n = 0, nStables = 0;
for (const taille of TAILLES) {
  for (const theme of THEMES) {
    const ctxA = await navigateur.newContext({ viewport: { width: taille.w, height: taille.h } });
    const ctxB = await navigateur.newContext({ viewport: { width: taille.w, height: taille.h } });
    const pA = await ctxA.newPage(), pB = await ctxB.newPage();
    for (const route of PAGES) {
      const apres = await tirer(APRES, pA, route, theme);
      const avant = await tirer(AVANT, pB, route, theme);
      n++;
      const stable = !NON_REPRODUCTIBLES.includes(route);
      if (stable) nStables++;
      if (createHash('sha1').update(apres).digest('hex') !== createHash('sha1').update(avant).digest('hex')) {
        (stable ? ecarts : bruit).push(`${taille.nom} · ${theme} · ${route}`);
        writeFileSync(`/tmp/diff-${taille.nom}-${theme}-${route}-APRES.png`, apres);
        writeFileSync(`/tmp/diff-${taille.nom}-${theme}-${route}-AVANT.png`, avant);
      }
    }
    await ctxA.close(); await ctxB.close();
  }
}
await navigateur.close();

console.log(`\n${TEMOIN ? 'CONTRÔLE (la version comparée à elle-même)' : 'COMPARAISON'} : ` +
            `${n} captures (${PAGES.length} pages × ${THEMES.length} thèmes × ${TAILLES.length} largeurs)`);

console.log(`\nPAGES COMPARABLES — ${nStables} captures`);
if (!ecarts.length) {
  console.log('   Aucun écart. Le rendu est identique au pixel près.');
} else {
  console.log(`   ${ecarts.length} écart(s) — À REGARDER :`);
  ecarts.forEach(e => console.log('     ' + e));
}

console.log(`\nPAGES NON REPRODUCTIBLES — ${n - nStables} captures (carte Leaflet, photo tirée au sort)`);
console.log(`   ${bruit.length} écart(s), attendus et sans signification :`);
bruit.forEach(e => console.log('     ' + e));
console.log('   Ces pages se vérifient par les tests de parcours, et à l\'œil.');

if (ecarts.length || bruit.length) console.log('\nCaptures dans /tmp/diff-*.png (paires AVANT / APRÈS).');
process.exit(ecarts.length ? 1 : 0);
