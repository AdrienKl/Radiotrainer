/* =============================================================================
   Albatros VFR — LA VERSION TÉLÉPHONE ET LES MOUVEMENTS (30/09/2026)
   -----------------------------------------------------------------------------
   Le nom contient « routeur » pour que le projet « telephone » le joue aussi
   (playwright.config.js) : chaque test dit lui-même s'il vaut pour l'écran
   étroit, l'ordinateur, ou les deux.

   Ce qui est surveillé, et pourquoi :
     · la barre du bas mène où elle dit, et « Plus » ouvre le menu complet —
       c'est la seule façon d'atteindre Carte, Cours, Progression, Paramètres ;
     · sur ordinateur, rien de tout ça ne se montre, et la tour de l'accueil
       reste ;
     · l'encadré « Chrome, Edge ou Safari » est là où l'on tape son adresse, et
       il le dit plus fort quand le navigateur n'a pas de reconnaissance ;
     · AU REPOS, l'onglet choisi garde son propre fond violet : la pastille qui
       glisse ne doit jamais devenir le seul fond de son texte blanc
       (assets/modules/mouvements.js, en-tête).
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

const etroit = page => (page.viewportSize()?.width || 1280) <= 860;

test('téléphone : la barre du bas mène à sa page et marque l\'onglet courant', async ({ page }) => {
  test.skip(!etroit(page), 'écran étroit seulement');
  await ouvrir(page);
  await entrer(page, 'tableau');
  const barre = page.locator('#tabbar');
  await expect(barre).toBeVisible();
  await expect(barre.locator('.tabbar__item[data-page="tableau"]')).toHaveClass(/courant/);

  for (const cible of ['exercices', 'navigation', 'epellation', 'tableau']) {
    await barre.locator(`.tabbar__item[data-page="${cible}"]`).click();
    await expect(page.locator(`#page-${cible}`)).toBeVisible();
    await expect(barre.locator(`.tabbar__item[data-page="${cible}"]`)).toHaveAttribute('aria-current', 'page');
  }
  /* Rien ne doit finir sous la barre : le bas de la page a sa marge. */
  const marge = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom));
  expect(marge).toBeGreaterThanOrEqual(80);
});

test('téléphone : « Plus » ouvre le menu complet, et le bouton Contact s\'efface', async ({ page }) => {
  test.skip(!etroit(page), 'écran étroit seulement');
  await ouvrir(page);
  await entrer(page, 'tableau');
  await page.locator('#tabPlus').click();
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  await expect(page.locator('.ct-fab')).toBeHidden();
  await page.waitForTimeout(700);
  await page.locator('.sidelink[data-page="progression"]').click();
  await expect(page.locator('#page-progression')).toBeVisible();
  await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
  /* Une page sans onglet allume « Plus ». */
  await expect(page.locator('#tabPlus')).toHaveClass(/courant/);
});

test('téléphone : la tour de contrôle n\'est plus sur l\'accueil', async ({ page }) => {
  test.skip(!etroit(page), 'écran étroit seulement');
  await ouvrir(page);
  await expect(page.locator('.hero__title')).toBeVisible();
  await expect(page.locator('.hero__tour')).toBeHidden();
});

test('ordinateur : ni barre du bas, et la tour reste', async ({ page }) => {
  test.skip(etroit(page), 'ordinateur seulement');
  await ouvrir(page);
  await expect(page.locator('.hero__tour')).toBeVisible();
  await entrer(page, 'tableau');
  await expect(page.locator('#tabbar')).toBeHidden();
  await expect(page.locator('#sidebar')).toBeVisible();
});

test('l\'encadré « Chrome, Edge ou Safari » suit le champ d\'adresse, à la connexion et à l\'inscription', async ({ page }) => {
  await ouvrir(page);
  for (const [route, champ, cadre] of [['login', '#loginId', '#loginNavRequis'], ['signup', '#insEmail', '#insNavRequis']]) {
    await page.evaluate(r => { location.hash = '#' + r; }, route);
    await expect(page.locator(cadre)).toBeVisible();
    await expect(page.locator(cadre)).toContainText('Chrome, Edge ou Safari');
    /* JUSTE sous le champ : l'élément qui suit le bloc du champ. */
    const suit = await page.evaluate(([c, k]) =>
      document.querySelector(c).closest('.auth-field').nextElementSibling === document.querySelector(k), [champ, cadre]);
    expect(suit, `${cadre} n'est pas juste sous ${champ}`).toBe(true);
    /* Chrome a la reconnaissance : pas de ligne « pas compatible ». */
    await expect(page.locator(`${cadre} .nav-requis__ici`)).toBeHidden();
  }
});

test('un navigateur sans reconnaissance vocale se l\'entend dire', async ({ page }) => {
  await page.addInitScript(() => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; });
  await ouvrir(page);
  await page.evaluate(() => { location.hash = '#login'; });
  await expect(page.locator('#loginNavRequis .nav-requis__ici')).toBeVisible();
  await expect(page.locator('#loginNavRequis')).toHaveClass(/nav-requis--ici/);
});

test('au repos, l\'onglet choisi porte son propre fond (la pastille ne le remplace pas)', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'parametres');
  await page.locator('#setTab-voix').click();
  await page.waitForTimeout(800);
  const etat = await page.evaluate(() => {
    const t = document.querySelector('#setTab-voix');
    return { fond: getComputedStyle(t).backgroundColor, glisse: t.parentElement.classList.contains('glisse'),
             pastille: !!t.parentElement.querySelector(':scope > .glisseur') };
  });
  expect(etat.pastille, 'la pastille n\'a pas été posée').toBe(true);
  expect(etat.glisse).toBe(false);
  expect(etat.fond).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
});
