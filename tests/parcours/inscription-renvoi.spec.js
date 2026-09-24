/* =============================================================================
   Albatros VFR — LE GARDE-FOU DE RENVOI DU CODE, À L'INSCRIPTION
   -----------------------------------------------------------------------------
   Les logs Supabase ont montré un POST /auth/v1/otp → 200 suivi d'une rafale
   de POST /auth/v1/otp → 429. La page de connexion et le mot de passe oublié
   portaient déjà le garde-fou (RTAuth.attenteRestante / marquerEnvoi) ; les
   deux boutons de l'inscription, « Recevoir mon code » et « Renvoyer », ne
   l'avaient pas. Ils n'étaient protégés que par occuper(), qui rend le bouton
   dès la fin de l'appel — trois secondes plus tard, on pouvait recliquer.

   Même méthode que mot-de-passe-oublie.spec.js : on ne remplace QUE
   RTAuth.otpEnvoyer, pour compter les envois. Le garde-fou testé est le VRAI
   code d'assets/auth.js et d'assets/inscription.js.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir } from './_aide.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__envois = 0;
    const poser = () => {
      if (!window.RTAuth) return false;
      window.RTAuth.otpEnvoyer = () => { window.__envois++; return Promise.resolve(true); };
      return true;
    };
    const t = setInterval(() => { if (poser()) clearInterval(t); }, 2);
  });
});

async function premierEnvoi(page) {
  await ouvrir(page);
  await page.evaluate(() => { location.hash = '#signup'; });
  await page.locator('#insEmail').fill('pilote@exemple.fr');
  await page.locator('#insCgu').check();
  await page.locator('#insAge').check();
  await page.locator('#insEnvoyer').click();
  await expect(page.locator('#insMsg2')).toContainText(/code envoyé/i);
  expect(await page.evaluate(() => window.__envois)).toBe(1);
}

test('« Renvoyer » juste après l\'envoi est retenu, avec le temps restant', async ({ page }) => {
  await premierEnvoi(page);
  await page.locator('#insRenvoyer').click();
  await expect(page.locator('#insMsg2')).toContainText(/patientez \d+ seconde/i);
  expect(await page.evaluate(() => window.__envois), 'le second envoi ne doit pas partir').toBe(1);
});

/* Le chemin détourné : revenir à l'étape 1 par « modifier l'adresse » et
   recliquer « Recevoir mon code ». C'est le même appel, donc le même plafond. */
test('revenir à l\'étape 1 ne contourne pas le délai', async ({ page }) => {
  await premierEnvoi(page);
  await page.locator('#insRetourMail').click();
  await page.locator('#insEnvoyer').click();
  await expect(page.locator('#insMsg1')).toContainText(/patientez \d+ seconde/i);
  expect(await page.evaluate(() => window.__envois)).toBe(1);
});

test('le délai écoulé, le renvoi repart', async ({ page }) => {
  await premierEnvoi(page);
  await page.evaluate(() => { RTAuth._dernierEnvoi.otp = Date.now() - (RTAuth.DELAI_RENVOI + 1) * 1000; });
  await page.locator('#insRenvoyer').click();
  await expect(page.locator('#insMsg2')).toContainText(/nouveau code envoyé/i);
  expect(await page.evaluate(() => window.__envois)).toBe(2);
});
