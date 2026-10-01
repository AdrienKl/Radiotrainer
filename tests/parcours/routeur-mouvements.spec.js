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

/* L'accueil refait le 01/10/2026 : photo du cockpit, plus de tour, aucun
   violet. On vérifie la photo, le titre, et l'absence de violet calculé. */
test('accueil : photo du cockpit, titre visible, aucun violet', async ({ page }) => {
  await ouvrir(page);
  await expect(page.locator('.acc-hero__titre')).toBeVisible();
  await expect(page.locator('.acc-hero__photo')).toBeVisible();
  await expect(page.locator('.hero__tour')).toHaveCount(0);
  const violets = await page.evaluate(() => {
    const re = /rgba?\((\d+), (\d+), (\d+)/g, trouves = [];
    for (const e of [document.querySelector('.topnav'), ...document.querySelectorAll('#page-accueil, #page-accueil *, .ct-fab')]) {
      const cs = getComputedStyle(e);
      for (const v of [cs.color, cs.backgroundColor, cs.borderTopColor, cs.backgroundImage, cs.boxShadow]) {
        for (const m of v.matchAll(re)) {
          const [r, g, b] = [+m[1], +m[2], +m[3]];
          if (b > r + 40 && b > g + 40 && r > g + 15) trouves.push(e.className + ' ' + v);
        }
      }
    }
    return trouves;
  });
  expect(violets).toEqual([]);
});

test('ordinateur : le menu est à gauche', async ({ page }) => {
  test.skip(etroit(page), 'ordinateur seulement');
  await ouvrir(page);
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
    /* Compte les demandes : le site ne doit plus en faire aucune. */
    window.__pleinEcranDemande = 0;
    Element.prototype.requestFullscreen = function () { window.__pleinEcranDemande++; return Promise.reject(new Error('iPhone')); };
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

test('téléphone : aucun message « tournez » ; à l\'horizontale, trois colonnes et la carte en grand', async ({ page }) => {
  test.skip(!etroit(page), 'téléphone seulement');
  await commeUnIphone(page);
  await ouvrir(page);
  await lancerVol(page);
  await expect(page.locator('body')).toHaveClass(/en-session/);
  /* Retiré le 30/09/2026, à la demande : le vertical tient bien. */
  expect(await page.locator('.tourner').count()).toBe(0);
  /* Et plus aucun passage forcé en paysage, Android compris. */
  expect(await page.evaluate(() => window.__pleinEcranDemande)).toBe(0);
  await expect(page.locator('#vfAvion')).toBeHidden();       // la photo d'avion quitte le téléphone

  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await expect(page.locator('#appTopbar')).toBeHidden();
  const grille = await page.evaluate(() => getComputedStyle(document.getElementById('navFlight')).gridTemplateColumns.split(' ').length);
  expect(grille).toBe(3);
  /* La carte prend toute la hauteur sous le bandeau : plus de la moitié de l'écran. */
  const haut = await page.evaluate(() => document.getElementById('vfMapSlot').getBoundingClientRect().height);
  expect(haut).toBeGreaterThan(vp.width * 0.5);
  await page.setViewportSize(vp);

  await page.evaluate(() => { location.hash = '#tableau'; });
  await expect(page.locator('body')).not.toHaveClass(/en-session/);
});

test('téléphone : le code transpondeur se tape, puis EXÉC', async ({ page }) => {
  test.skip(!etroit(page), 'écran tactile seulement');
  await ouvrir(page);
  await lancerVol(page);
  const champ = page.locator('#xpdrSaisie');
  await expect(champ).toBeVisible();
  await champ.fill('4589');                        // 8 et 9 n'existent pas en code SSR : retirés
  await expect(champ).toHaveValue('45');
  await champ.fill('');
  await champ.pressSequentially('4521');
  await expect(page.locator('#xpdrCode')).toHaveText('4521');
  await expect(page.locator('#xpdrEtat')).toHaveText('EXÉC ?');   // composé, pas encore émis
  await page.locator('#xpdrExec').click();
  await expect(page.locator('#xpdrEtat')).not.toHaveText('EXÉC ?');
});

test('ordinateur : pas de saisie du code transpondeur, les roues restent', async ({ page }) => {
  test.skip(etroit(page), 'ordinateur seulement');
  await ouvrir(page);
  await lancerVol(page);
  await expect(page.locator('#xpdrSaisie')).toBeHidden();
  await expect(page.locator('#xpdrRoues button').first()).toBeVisible();
});

test('« Régler » n\'existe pas en mode Réel', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'exercices');
  await page.evaluate(() => { const s = document.getElementById('difficultySelect'); s.value = 'reel'; s.dispatchEvent(new Event('change')); });
  await page.evaluate(() => window.rtRelancerScenario(0, 'LFBD'));
  const cible = page.locator('#scRadioCible');
  if (await cible.isVisible()) expect(await cible.locator('.cible-regler').count()).toBe(0);
});

test('pas de zoom au double tap (touch-action: manipulation)', async ({ page }) => {
  await ouvrir(page);
  const ta = await page.evaluate(() => [getComputedStyle(document.documentElement).touchAction, getComputedStyle(document.querySelector('button')).touchAction]);
  expect(ta).toEqual(['manipulation', 'manipulation']);
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

test('ordinateur : à la souris, appuyer puis tirer TOUT DE SUITE fait suivre la pastille', async ({ page }) => {
  /* Le bug du 30/09/2026 : l'attente de l'appui long valait aussi pour la
     souris, et le moindre mouvement avant elle annulait tout — la pastille
     restait sur place pendant que la souris montait. */
  test.skip(etroit(page), 'ordinateur seulement');
  await ouvrir(page);
  await entrer(page, 'parametres');
  await page.waitForTimeout(700);
  const dep = await page.locator('.sidelink.current').boundingBox();
  const arr = await page.locator('.sidelink[data-page="carte"]').boundingBox();
  const centre = () => page.evaluate(() => {
    const r = document.querySelector('.side-nav > .glisseur').getBoundingClientRect();
    return r.top + r.height / 2;
  });
  await page.mouse.move(dep.x + 40, dep.y + dep.height / 2);
  await page.mouse.down();
  const milieu = dep.y + dep.height / 2 + (arr.y - dep.y) / 2;
  for (let i = 1; i <= 5; i++) await page.mouse.move(dep.x + 40, dep.y + dep.height / 2 + (milieu - dep.y - dep.height / 2) * i / 5);
  await page.waitForTimeout(60);
  expect(Math.abs(await centre() - milieu), 'la pastille ne suit pas la souris').toBeLessThan(24);
  await page.mouse.move(dep.x + 40, arr.y + arr.height / 2);
  await page.mouse.up();
  await expect(page.locator('#page-carte')).toBeVisible();
});

test('téléphone : la pastille du menu suit le doigt même quand le navigateur annule le pointeur (iPhone)', async ({ page, browserName }) => {
  /* Safari envoie pointercancel en plein glissement ; après lui, plus aucun
     pointermove. La pastille restait figée au milieu du menu (30/09/2026).
     On rejoue ce pointercancel dans Chromium, et le doigt par le protocole de
     Chrome — Playwright ne sait pas faire glisser un doigt. */
  test.skip(!etroit(page) || browserName !== 'chromium', 'téléphone Chromium seulement');
  await ouvrir(page);
  await entrer(page, 'parametres');
  await page.evaluate(() => { const s = rtSettings(); s.bulleContactVue = true; rtSaveSettings(s); });
  await page.locator('#hamburger').tap();
  await page.waitForTimeout(700);
  const cdp = await page.context().newCDPSession(page);
  const d = await page.locator('.sidelink.current').boundingBox();
  const a = await page.locator('.sidelink[data-page="exercices"]').boundingBox();
  const x = d.x + 60, y0 = d.y + d.height / 2, y1 = a.y + a.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  await page.waitForTimeout(600);                                   // l'appui long
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / 10 }] });
    if (i === 3) await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'touch' })));
  }
  await page.waitForTimeout(60);
  const centre = await page.evaluate(() => {
    const r = document.querySelector('.side-nav > .glisseur').getBoundingClientRect(); return r.top + r.height / 2;
  });
  expect(Math.abs(centre - y1), 'la pastille s\'est figée').toBeLessThan(30);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#page-exercices')).toBeVisible();
});
