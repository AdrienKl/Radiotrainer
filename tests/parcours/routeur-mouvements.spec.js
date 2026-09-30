/* =============================================================================
   Albatros VFR — LA VERSION TÉLÉPHONE ET LES MOUVEMENTS (30/09/2026)
   -----------------------------------------------------------------------------
   Le nom contient « routeur » pour que le projet « telephone » le joue aussi
   (playwright.config.js) : chaque test dit lui-même s'il vaut pour l'écran
   étroit, l'ordinateur, ou les deux.

   Ce qui est surveillé, et pourquoi :
     · sur téléphone, plus de barre du bas (retirée le 30/09/2026) : le menu
       est le tiroir de gauche, et le bouton Contact ne le recouvre pas ;
     · sur ordinateur, la tour de l'accueil reste ;
     · l'encadré « Chrome, Edge ou Safari » est là où l'on tape son adresse, et
       il le dit plus fort quand le navigateur n'a pas de reconnaissance ;
     · AU REPOS, l'onglet choisi garde son propre fond violet : la pastille qui
       glisse ne doit jamais devenir le seul fond de son texte blanc
       (assets/modules/mouvements.js, en-tête).
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

const etroit = page => (page.viewportSize()?.width || 1280) <= 860;

test('téléphone : pas de barre du bas, le menu est le tiroir de gauche, le bouton Contact s\'efface', async ({ page }) => {
  test.skip(!etroit(page), 'écran étroit seulement');
  await ouvrir(page);
  await entrer(page, 'tableau');
  /* Barre d'onglets retirée le 30/09/2026 : elle prenait trop de place. */
  expect(await page.locator('#tabbar').count()).toBe(0);
  await page.locator('#hamburger').click();
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  await expect(page.locator('.ct-fab')).toBeHidden();
  await page.waitForTimeout(600);
  await page.locator('.sidelink[data-page="progression"]').click();
  await expect(page.locator('#page-progression')).toBeVisible();
  await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
});

test('téléphone : la tour de contrôle n\'est plus sur l\'accueil', async ({ page }) => {
  test.skip(!etroit(page), 'écran étroit seulement');
  await ouvrir(page);
  await expect(page.locator('.hero__title')).toBeVisible();
  await expect(page.locator('.hero__tour')).toBeHidden();
});

test('ordinateur : la tour reste, le menu est à gauche', async ({ page }) => {
  test.skip(etroit(page), 'ordinateur seulement');
  await ouvrir(page);
  await expect(page.locator('.hero__tour')).toBeVisible();
  await entrer(page, 'tableau');
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

/* =============================================================================
   Deuxième lot (30/09/2026) : listes au doigt, « Régler », appui long,
   téléphone à l'horizontale.
   ========================================================================== */
async function lancerVol(page) {
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  const avions = await page.evaluate(() => window.RT_TEST.avions());
  await page.evaluate(a => window.RT_TEST.lancerVol({ dep: 'LFBD', arr: 'LFBH', avion: a, mode: 'voyage', level: 'debutant' }), avions[0]);
  await page.waitForTimeout(500);
}
/* Safari sur iPhone refuse le plein écran d'une page : c'est le cas où le
   message doit s'afficher. Chromium, lui, accepterait — on le fait refuser. */
async function commeUnIphone(page) {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = function () { return Promise.reject(new Error('iPhone')); };
  });
}

test('téléphone : les aérodromes de la Navigation ont une vraie liste, et un tap choisit', async ({ page }) => {
  test.skip(!etroit(page), 'écran tactile seulement');
  await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  /* Le <datalist> (que Safari n'affiche pas) est remplacé au doigt. */
  expect(await page.locator('#navDep').getAttribute('list')).toBeNull();
  await page.locator('#navDep').tap();
  await page.locator('#navDep').fill('LFBD');
  const liste = page.locator('#navAdList-dep');
  await expect(liste).toHaveClass(/open/);
  await liste.locator('.ac-item').first().tap();
  await expect(liste).not.toHaveClass(/open/);
  await expect(page.locator('#navDep')).toHaveValue('LFBD');
});

test('ordinateur : les aérodromes de la Navigation gardent leur liste native', async ({ page }) => {
  test.skip(etroit(page), 'ordinateur seulement');
  await ouvrir(page);
  await entrer(page, 'navigation');
  expect(await page.locator('#navDep').getAttribute('list')).toBe('navAdList');
});

test('téléphone : « Régler » affiche la fréquence demandée ; à la souris il n\'existe pas', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'exercices');
  await page.evaluate(() => window.rtRelancerScenario(0, 'LFBD'));
  const cible = page.locator('#scRadioCible');
  await expect(cible).toBeVisible();
  const regler = cible.locator('.cible-regler');
  if (!etroit(page)) { await expect(regler).toBeHidden(); return; }
  const attendue = (await cible.locator('b').innerText()).trim();
  await regler.tap();
  await expect(page.locator('#scRadioAct')).toHaveText(attendue);
  await expect(cible).toBeHidden();
});

test('ordinateur : un appui long sur la pastille du menu la promène jusqu\'à une autre page', async ({ page }) => {
  test.skip(etroit(page), 'menu toujours visible sur ordinateur seulement');
  await ouvrir(page);
  await entrer(page, 'parametres');
  await page.waitForTimeout(700);
  const dep = await page.locator('.sidelink.current').boundingBox();
  const arr = await page.locator('.sidelink[data-page="exercices"]').boundingBox();
  await page.mouse.move(dep.x + 40, dep.y + dep.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);                    // l'appui long
  await expect(page.locator('.side-nav')).toHaveClass(/tire/);
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(dep.x + 40, dep.y + dep.height / 2 + (arr.y - dep.y) * i / 8);
  }
  await page.mouse.up();
  await expect(page.locator('#page-exercices')).toBeVisible();
  await expect(page.locator('.side-nav')).not.toHaveClass(/tire/);
  /* Un clic ordinaire marche toujours. */
  await page.locator('.sidelink[data-page="progression"]').click();
  await expect(page.locator('#page-progression')).toBeVisible();
});

test('téléphone : en vol, le message « tournez » s\'affiche en portrait si le verrou est refusé', async ({ page }) => {
  test.skip(!etroit(page), 'téléphone seulement');
  await commeUnIphone(page);
  await ouvrir(page);
  await lancerVol(page);
  await expect(page.locator('body')).toHaveClass(/en-session/);
  const msg = page.locator('.tourner');
  await expect(msg).toBeVisible();
  await expect(msg).toContainText('Tournez votre téléphone');

  /* Tourné : le message part, la mise en page paysage prend la main. */
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await expect(msg).toBeHidden();
  await expect(page.locator('#appTopbar')).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('navFlight')).display)).toBe('grid');

  /* Revenu en portrait, « Continuer en vertical » ferme le message. */
  await page.setViewportSize(vp);
  await expect(msg).toBeVisible();
  await msg.locator('.btn').click();
  await expect(msg).toBeHidden();

  /* Quitter la page met fin à la session : tout est rendu. */
  await page.evaluate(() => { location.hash = '#tableau'; });
  await expect(page.locator('body')).not.toHaveClass(/en-session|tourner-demande/);
});

test('ordinateur : un vol ne demande jamais de tourner l\'écran', async ({ page }) => {
  test.skip(etroit(page), 'ordinateur seulement');
  await commeUnIphone(page);
  await ouvrir(page);
  await lancerVol(page);
  await expect(page.locator('body')).toHaveClass(/en-session/);
  await expect(page.locator('body')).not.toHaveClass(/tourner-demande/);
  await expect(page.locator('.tourner')).toBeHidden();
});
