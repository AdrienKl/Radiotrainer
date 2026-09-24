/* =============================================================================
   Albatros VFR — L'ŒIL DU MOT DE PASSE, ET LA SIMULATION DE PREMIÈRE CONNEXION
   -----------------------------------------------------------------------------
   La simulation (console d'administration › Test / Controller) rejoue le
   parcours d'un compte neuf à partir du questionnaire, SUR LE COMPTE QUI TESTE.
   Sa seule promesse qui compte : n'écrire RIEN en base. Un essai qui écraserait
   les vraies réponses ou reposerait le jalon « terminé » serait pire que pas
   d'essai du tout. On remplace donc les primitives d'écriture de RTAuth par
   des compteurs, et on vérifie qu'ils restent à zéro.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir } from './_aide.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__ecritures = [];
    const poser = () => {
      if (!window.RTAuth) return false;
      window.RTAuth.majProfil  = (c) => { window.__ecritures.push(['majProfil', c]); return Promise.resolve(true); };
      window.RTAuth.jalon      = (j) => { window.__ecritures.push(['jalon', j]); return Promise.resolve(true); };
      window.RTAuth.pseudoLibre = () => Promise.resolve(true);
      return true;
    };
    const t = setInterval(() => { if (poser()) clearInterval(t); }, 2);
  });
});

/* Une question à la fois : on répond, puis « Suivant ». */
async function repondre(page, q, val) {
  await page.click(`[data-q="${q}"] button[data-val="${val}"]`);
  await page.click('#insQcmOk');
}

test('le questionnaire se fait une question à la fois', async ({ page }) => {
  await ouvrir(page);
  await page.evaluate(() => { location.hash = '#signup'; RTInscription._aller(4); });
  await expect(page.locator('.ins-q:not([hidden])')).toHaveCount(1);
  await expect(page.locator('#insQcmPas')).toHaveText('Question 1 sur 5');
  await expect(page.locator('#insQcmPrec')).toBeHidden();

  /* Suivant sans réponse : on reste, avec un motif. */
  await page.click('#insQcmOk');
  await expect(page.locator('#insMsg4')).toContainText(/choisissez une réponse/i);
  await expect(page.locator('#insQcmPas')).toHaveText('Question 1 sur 5');

  /* « Breveté » fait apparaître la question des heures : le total passe à 6. */
  await page.click('[data-q="profil"] button[data-val="brevete"]');
  await expect(page.locator('#insQcmPas')).toHaveText('Question 1 sur 6');
  await page.click('#insQcmOk');
  await expect(page.locator('[data-q="heures"]')).toBeVisible();
  await expect(page.locator('#insQcmPas')).toHaveText('Question 2 sur 6');

  /* Précédent ramène à la question d'avant, réponse conservée. */
  await page.click('#insQcmPrec');
  await expect(page.locator('[data-q="profil"] button[data-val="brevete"]')).toHaveAttribute('aria-pressed', 'true');

  await page.click('#insQcmOk');
  await repondre(page, 'heures', '10-50');
  await repondre(page, 'objectifs', 'aise');
  await repondre(page, 'avion', 'dr400');
  await repondre(page, 'radio', 'bases');
  /* La dernière est la facultative : son bouton dit qu'on peut passer, puis
     qu'on termine une fois qu'on y a répondu. */
  await expect(page.locator('[data-q="decouverte"]')).toBeVisible();
  await expect(page.locator('#insQcmOk')).toHaveText('Continuer');
});

test('l\'œil montre puis masque le mot de passe choisi', async ({ page }) => {
  await ouvrir(page);
  await page.evaluate(() => { location.hash = '#signup'; RTInscription._aller(3); });
  const champ = page.locator('#insMdp1');
  const oeil = page.locator('#insMdp1 + .mdp-oeil');
  await champ.fill('un-secret');
  await expect(champ).toHaveAttribute('type', 'password');
  await oeil.click();
  await expect(champ).toHaveAttribute('type', 'text');
  await expect(oeil).toHaveAttribute('aria-pressed', 'true');
  await oeil.click();
  await expect(champ).toHaveAttribute('type', 'password');
  /* Le bouton est type="button" : Entrée dans le champ valide l'étape, elle ne
     bascule pas l'œil. */
  expect(await oeil.getAttribute('type')).toBe('button');
});

test('les champs du nouveau mot de passe (récupération) ont aussi leur œil', async ({ page }) => {
  await ouvrir(page);
  await expect(page.locator('#mdpNouveau + .mdp-oeil')).toHaveCount(1);
  await expect(page.locator('#mdpConfirme + .mdp-oeil')).toHaveCount(1);
  /* Et pas le champ de CONNEXION : on n'y choisit rien. */
  await expect(page.locator('#loginPwd + .mdp-oeil')).toHaveCount(0);
});

test('la simulation va du questionnaire à l\'application, sans rien écrire', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  /* Le compte qui teste a déjà vu la bulle : la simulation doit la remontrer. */
  await page.evaluate(() => localStorage.setItem('rt-settings', JSON.stringify({ bulleContactVue: true })));

  await page.evaluate(() => RTInscription.simuler());
  await expect(page.locator('#page-signup')).toBeVisible();
  await expect(page.locator('.ins-etape[data-etape="4"]')).toBeVisible();
  await expect(page.locator('#insSimu')).toBeVisible();

  await repondre(page, 'profil', 'eleve-debut');
  await repondre(page, 'objectifs', 'aise');
  await repondre(page, 'avion', 'dr400');
  await repondre(page, 'radio', 'bases');
  await page.click('#insQcmOk');                     // la facultative, laissée vide : Continuer
  await expect(page.locator('.ins-etape[data-etape="5"]')).toBeVisible();

  await page.fill('#insPseudo', 'essai-simu');
  await page.locator('#insPseudo').blur();
  await expect(page.locator('#insPseudoEtat')).toContainText(/disponible/);
  await page.fill('#insPrenom', 'Essai');
  await page.click('#insTerminer');

  await page.waitForFunction(() => window.rtConnecte && window.rtConnecte() === true);
  await expect(page.locator('#ctBulle'), 'la bulle se remontre même déjà vue').toBeVisible({ timeout: 4000 });
  expect(await page.evaluate(() => window.__ecritures), 'aucune écriture en base').toEqual([]);
  expect(await page.evaluate(() => RTInscription._simulation())).toBe(false);
  expect(erreurs).toEqual([]);
});

test('quitter la page pendant la simulation l\'arrête', async ({ page }) => {
  await ouvrir(page);
  await page.evaluate(() => RTInscription.simuler());
  await expect(page.locator('#insSimu')).toBeVisible();
  await page.evaluate(() => { location.hash = '#accueil'; });
  await expect(page.locator('#page-accueil')).toBeVisible();
  expect(await page.evaluate(() => RTInscription._simulation())).toBe(false);
});
