/* =============================================================================
   AVIERO — LA PAGE SE CHARGE, ET RIEN NE CASSE EN SILENCE
   -----------------------------------------------------------------------------
   Neuf blocs de script s'exécutent au chargement d'index.html. Une erreur dans
   l'un d'eux n'arrête pas les autres : la page se peint, et seule la
   fonctionnalité portée par le bloc mort a disparu. C'est le mode de panne le
   plus coûteux d'un découpage — on regarde la page, elle a l'air normale.

   Ce fichier est le seul à pouvoir le voir, parce qu'il exécute vraiment le
   code. Les tests de contrat, eux, ne font que le lire.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

test('le site se charge sans erreur de console', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await page.waitForTimeout(1200);       // laisser les neuf blocs finir leur init
  expect(erreurs, 'Erreurs de console au chargement').toEqual([]);
});

test('aucun fichier du site ne répond 404', async ({ page }) => {
  /* Une feuille de style, un script ou une image absente ne lève aucune erreur
     JavaScript : la page se charge et il manque quelque chose. C'est ce qui est
     arrivé aux dix-sept images de fond quand le CSS a quitté index.html —
     « assets/images/… » ne partait plus de la racine mais de assets/css/.
     On visite les pages à décor : ce sont elles qui chargent les images. */
  const { absents } = await ouvrir(page);
  await entrer(page, 'tableau');
  for (const p of ['tableau', 'exercices', 'navigation', 'epellation', 'cours', 'parametres']) {
    await page.evaluate(r => { location.hash = '#' + r; }, p);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(600);
  expect(absents, 'Fichiers du site introuvables').toEqual([]);
});

test('aucun bloc de script n\'est mort au chargement', async ({ page }) => {
  /* Chaque bloc publie au moins un symbole. S'il manque, c'est que le bloc
     s'est arrêté avant la fin — sans que rien ne soit visible à l'écran. */
  await ouvrir(page);
  const absents = await page.evaluate(() => {
    const attendus = {
      'moteur de scénarios': () => typeof SCENARIOS !== 'undefined' && typeof launchScenario === 'function',
      'routeur':             () => typeof window.rtEntrer === 'function',
      'épellation + cours':  () => !!window.RT_TEST_EPEL,
      'navigation':          () => !!window.RT_TEST,
      'espaces aériens':     () => !!window.RT_AIR,
      'tableau de bord':     () => typeof window.rtJourActif === 'function',
      'badges':              () => typeof window.rtBadges === 'function',
      'quota':               () => typeof window.rtQuotaAtteint === 'function'
    };
    return Object.entries(attendus).filter(([, f]) => { try { return !f(); } catch (e) { return true; } }).map(([n]) => n);
  });
  expect(absents, 'Ces blocs ne sont pas allés au bout de leur exécution').toEqual([]);
});

test('le thème sombre est posé avant la première peinture', async ({ page }) => {
  /* Le bloc anti-flash lit rt-settings avant que quoi que ce soit ne s'affiche.
     S'il partait dans un fichier, la page se peindrait en clair puis
     basculerait — un clignotement blanc à chaque chargement. */
  await page.addInitScript(() => localStorage.setItem('rt-settings', JSON.stringify({ theme: 'dark' })));
  await ouvrir(page);
  expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
});

test('le thème clair reste le thème clair', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rt-settings', JSON.stringify({ theme: 'light' })));
  await ouvrir(page);
  expect(await page.locator('html').getAttribute('data-theme')).toBe('light');
});

test('les trois pages légales s\'ouvrent sans compte', async ({ page }) => {
  /* RGPD art. 13 : on doit pouvoir lire ce à quoi on consent AVANT de créer un
     compte. Si l'une d'elles exigeait une session, elle serait illisible pour
     exactement les personnes à qui elle s'adresse. */
  for (const [route, titre] of [['mentions', /mentions/i], ['cgu', /conditions|cgu/i], ['confidentialite', /confidentialit/i]]) {
    const { erreurs } = await ouvrir(page, '#' + route);
    await expect(page.locator(`#page-${route}`)).toBeVisible();
    await expect(page.locator(`#page-${route}`)).toContainText(titre);
    expect(erreurs).toEqual([]);
  }
});

test('la vitrine s\'affiche sans session, l\'application non', async ({ page }) => {
  await ouvrir(page, '#progression');
  /* Sans session, une page applicative renvoie à la connexion — pas à l'accueil :
     la destination est mémorisée pour y revenir une fois identifié. */
  await expect(page.locator('#page-login')).toBeVisible();
  await expect(page.locator('#page-progression')).toBeHidden();
});

test('une session ouverte donne accès à l\'application', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');
  await expect(page.locator('#page-tableau')).toBeVisible();
});
