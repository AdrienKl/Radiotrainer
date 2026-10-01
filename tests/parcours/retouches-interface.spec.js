/* =============================================================================
   Albatros VFR — LE LOGO QUI RAMÈNE À LA MAISON, ET LA VITRINE TOUJOURS CLAIRE
   -----------------------------------------------------------------------------
   Demandes du développeur, 27/09/2026 :
     · le logo « Albatros VFR » mène au tableau de bord quand on est connecté,
       et en haut de la vitrine sinon (barre repliée : il la rouvre d'abord,
       01/10/2026) ;
     · la vitrine (accueil, pages légales) ne passe jamais en thème sombre ;
       le réglage reprend effet dès qu'on entre dans l'application ;
     · l'exercice d'épellation s'appelle « Alphabet aéro ».
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

const theme = page => page.evaluate(() => document.documentElement.getAttribute('data-theme'));

/* 01/10/2026 : en descendant, la barre se replie sur le logo. Logo cliqué
   barre repliée → elle se rouvre, la page NE remonte PAS. Barre ouverte → le
   logo remonte en haut, comme avant. */
test('logo, hors connexion : barre repliée → elle se rouvre sans remonter ; ouverte → haut de la vitrine', async ({ page }) => {
  await ouvrir(page);
  const barre = page.locator('#topnav');
  await expect(barre).not.toHaveClass(/compacte/);
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  await expect(barre).toHaveClass(/compacte/);
  await expect(page.locator('#topnav .nav-right')).toBeHidden();
  const y = await page.evaluate(() => window.scrollY);
  await page.locator('#topnav .brand').click();
  await expect(barre).not.toHaveClass(/compacte/);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
  await page.locator('#topnav .brand').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('#page-accueil')).toHaveClass(/active/);
});

test('logo, hors connexion, depuis la connexion : retour à la vitrine', async ({ page }) => {
  await ouvrir(page, '#login');
  await page.locator('#page-login .auth-brand').click();
  await expect(page.locator('#page-accueil')).toHaveClass(/active/);
});

test('logo, connecté : le tableau de bord, depuis la vitrine comme depuis une page', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'accueil');
  await page.locator('#topnav .brand').click();
  await expect(page.locator('#page-tableau')).toHaveClass(/active/);
  await page.evaluate(() => rtNaviguer('parametres'));
  await page.locator('#sidebar .side-brand').click();
  await expect(page.locator('#page-tableau')).toHaveClass(/active/);
});

test('thème sombre choisi : la vitrine reste claire, l\'application passe en sombre', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('rt-settings', JSON.stringify({ theme: 'dark' })); } catch (e) {} });
  await ouvrir(page);
  expect(await theme(page)).toBe('light');
  await page.evaluate(() => rtNaviguer('cgu'));
  expect(await theme(page)).toBe('light');
  await entrer(page, 'tableau');
  await expect.poll(() => theme(page)).toBe('dark');
  await page.locator('#sidebar .side-brand').click();            // reste dans l'app
  expect(await theme(page)).toBe('dark');
  await page.evaluate(() => rtNaviguer('accueil'));
  await expect.poll(() => theme(page)).toBe('light');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('rt-settings'))).theme).toBe('dark');
});

test('l\'épellation s\'appelle « Alphabet aéro »', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'epellation');
  await expect(page.locator('#sidebar [data-page="epellation"]')).toHaveText('Alphabet aéro');
  await expect(page.locator('#page-epellation h2')).toHaveText('Alphabet aéro');
  await expect(page.locator('body')).not.toContainText('Épellation');
});
