/* =============================================================================
   AVIERO — LA NAVIGATION ENTRE LES PAGES
   -----------------------------------------------------------------------------
   Seize routes, une seule application, un seul historique. Le routeur décide
   aussi qui entre où : une page applicative sans session renvoie à la
   connexion, la console d'administration exige en plus le rôle.

   Ce que ce fichier surveille pendant le découpage : que chaque route peigne
   encore quelque chose. Une section déplacée ou renommée ne produit aucune
   erreur — elle produit un écran vide, et c'est tout.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

const APPLICATIVES = ['tableau', 'exercices', 'navigation', 'carte', 'epellation',
                      'cours', 'progression', 'parametres'];

test('chaque page applicative s\'affiche vraiment', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'tableau');

  for (const route of APPLICATIVES) {
    await page.evaluate(r => { location.hash = '#' + r; }, route);
    await expect(page.locator(`#page-${route}`), `La page #${route} ne s'affiche pas`).toBeVisible();
    /* Une section visible mais vide compte comme un écran vide. */
    const texte = await page.locator(`#page-${route}`).innerText();
    expect(texte.trim().length, `La page #${route} est vide`).toBeGreaterThan(20);
  }
  expect(erreurs, 'Erreurs de console pendant la navigation').toEqual([]);
});

test('la route #compte renvoie sur Paramètres au lieu de tomber sur l\'accueil', async ({ page }) => {
  /* La page Compte a été fondue dans Paramètres, mais des liens et des favoris
     désignent encore #compte. La faire tomber sur l'accueil la casserait sans
     que personne ne s'en aperçoive. */
  await ouvrir(page);
  await entrer(page, 'tableau');
  await page.evaluate(() => { location.hash = '#compte'; });
  await expect(page.locator('#page-parametres')).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('#parametres');
});

test('une route inconnue retombe sur l\'accueil', async ({ page }) => {
  await ouvrir(page, '#nimportequoi');
  await expect(page.locator('#page-accueil')).toBeVisible();
});

test('la console d\'administration est refusée sans le rôle', async ({ page }) => {
  /* Le vrai verrou est en base (RLS) : un `if` dans le navigateur ne protège
     rien. Celui-ci évite seulement d'afficher une page qui ne répondrait pas —
     mais il doit exister, et il doit renvoyer vers le tableau de bord, pas vers
     la connexion : renvoyer quelqu'un de déjà connecté sur un formulaire de
     connexion n'a aucun sens. */
  await ouvrir(page);
  await entrer(page, 'tableau');
  await page.evaluate(() => { location.hash = '#admin'; });
  await expect(page.locator('#page-admin')).toBeHidden();
  await expect(page.locator('#page-tableau')).toBeVisible();
});

test('le retour arrière du navigateur fonctionne', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');
  await page.evaluate(() => { location.hash = '#exercices'; });
  await expect(page.locator('#page-exercices')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#page-tableau')).toBeVisible();
});

/* Sur petit écran la barre latérale est un tiroir : ses liens existent dans le
   document, mais restent hors de l'écran tant que le hamburger n'a pas été
   ouvert. Le premier jet de ce test cliquait dessus quand même et attendait
   indéfiniment (« element is outside of the viewport ») — ce n'était pas une
   panne du site, c'était le test qui ignorait le tiroir. */
async function ouvrirLeTiroirSiBesoin(page) {
  const hb = page.locator('#hamburger');
  if (await hb.isVisible()) {
    await hb.click();
    await page.waitForTimeout(250);
  }
}

test('la barre latérale mène où elle dit', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');

  const cibles = await page.locator('.sidelink').evaluateAll(
    els => els.map(e => e.getAttribute('data-page') || (e.getAttribute('href') || '').replace('#', ''))
  );
  expect(cibles.filter(Boolean).length, 'Aucun lien de navigation').toBeGreaterThan(3);

  for (const cible of cibles) {
    if (!cible || cible === 'admin') continue;
    await ouvrirLeTiroirSiBesoin(page);
    const lien = page.locator(`.sidelink[data-page="${cible}"]`).first();
    await lien.click();
    const attendue = cible === 'compte' ? 'parametres' : cible;
    await expect(page.locator(`#page-${attendue}`), `Le lien « ${cible} » n'ouvre pas sa page`).toBeVisible();
  }
});
