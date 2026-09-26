/* =============================================================================
   Albatros VFR — LA PAGE 404 ET LA REDIRECTION DES ROUTES SANS « # »
   -----------------------------------------------------------------------------
   GitHub Pages sert 404.html pour toute adresse inconnue. Le serveur de test,
   lui, ne le fait pas : on intercepte donc les adresses visées et on y répond
   par le contenu de 404.html, exactement comme GitHub Pages.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* Chemin depuis la racine du projet : Playwright y est lancé (tests/lancer_tout.sh). */
const PAGE_404 = readFileSync(join(process.cwd(), '404.html'), 'utf8');

async function servir404(page, chemin) {
  await page.route('**' + chemin, r => r.fulfill({ status: 404, contentType: 'text/html', body: PAGE_404 }));
}

test('une route tapée sans « # » est renvoyée vers la bonne page', async ({ page }) => {
  await servir404(page, '/exercices');
  await page.goto('/exercices');
  await page.waitForURL(/\/#exercices$/);
});

test('les sous-segments suivent : /admin/users → /#admin/users', async ({ page }) => {
  await servir404(page, '/admin/users');
  await page.goto('/admin/users');
  await page.waitForURL(/\/#admin\/users$/);
});

test('une adresse inconnue affiche la page 404, sans erreur', async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) erreurs.push(m.text()); });
  await servir404(page, '/nimporte/quoi');
  await page.goto('/nimporte/quoi');
  await expect(page.locator('h1')).toHaveText("Cette page n'existe pas.");
  await expect(page.locator('a.p404__btn')).toHaveAttribute('href', '/');
  /* Les feuilles du site sont bien chargées depuis la racine : le jeton
     --violet est défini, donc le bouton n'est pas transparent. */
  const fond = await page.locator('a.p404__btn').evaluate(e => getComputedStyle(e).backgroundColor);
  expect(fond).not.toBe('rgba(0, 0, 0, 0)');
  expect(erreurs).toEqual([]);
});

test('la page 404 suit le thème sombre choisi', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rt-settings', JSON.stringify({ theme: 'dark' })));
  await servir404(page, '/pas-la');
  await page.goto('/pas-la');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
