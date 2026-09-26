/* =============================================================================
   Albatros VFR — EFFACER CET APPAREIL, OU SUPPRIMER L'HISTORIQUE DU COMPTE
   -----------------------------------------------------------------------------
   Deux actions séparées le 26/09/2026, parce que la première cachait la
   seconde : « Effacer mes vols et mon historique », sous « Données locales »,
   supprimait en réalité tout l'historique DU COMPTE sur un simple OK.

   Ce qu'on vérifie :
     · connecté, l'action locale n'est pas proposée ;
     · hors connexion, elle vide l'appareil et n'appelle JAMAIS la base ;
     · l'action du compte reste grisée tant que le nom d'utilisateur retapé
       n'est pas le bon, puis supprime une fois, et une seule.

   La suppression elle-même (RTDonnees.effacerTout) est remplacée par un
   compteur : les tests ne parlent jamais à Supabase (tests/README.md), et ce
   qu'on teste ici, c'est le GESTE qui y mène.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

/* Une session « connectée » vue du navigateur : un utilisateur et un profil
   avec pseudo. Posée après le chargement, comme le ferait auth.js. */
async function simulerConnexion(page) {
  await page.evaluate(() => {
    RTAuth.utilisateur = () => ({ id: 'essai', email: 'pilote@exemple.fr' });
    RTAuth.profil = () => ({ id: 'essai', pseudo: 'pilote28' });
  });
}
async function compterEffacements(page) {
  await page.evaluate(() => {
    window.__effacements = 0;
    window.RTDonnees = window.RTDonnees || {};
    RTDonnees.effacerTout = () => { window.__effacements++; return Promise.resolve({ base: true }); };
  });
}

test('connecté, « Effacer les données de cet appareil » n\'est pas proposé', async ({ page }) => {
  await ouvrir(page);
  await simulerConnexion(page);
  await entrer(page, 'parametres');
  await expect(page.locator('#setClearHist')).toBeHidden();
  await expect(page.locator('#cptHistOuvrir')).toBeVisible();
});

test('hors connexion, l\'action locale vide l\'appareil et ne touche jamais la base', async ({ page }) => {
  await ouvrir(page);
  await compterEffacements(page);
  await page.evaluate(() => localStorage.setItem('rt-vols', JSON.stringify([{ id: 'v1' }])));
  await entrer(page, 'parametres');               // interface ouverte, mais aucune session Supabase

  await expect(page.locator('#setClearHist')).toBeVisible();
  await page.locator('#setClearHist').click();
  await expect(page.locator('#confirmModal')).toBeVisible();
  await expect(page.locator('#confirmText')).toContainText(/ne sera pas touché/);
  await page.locator('#confirmYes').click();

  await expect.poll(() => page.evaluate(() => localStorage.getItem('rt-vols'))).toBeNull();
  expect(await page.evaluate(() => window.__effacements), 'aucun appel à la base').toBe(0);
});

test('supprimer l\'historique du compte exige de retaper son nom d\'utilisateur', async ({ page }) => {
  await ouvrir(page);
  await simulerConnexion(page);
  await compterEffacements(page);
  await entrer(page, 'parametres');

  await page.locator('#cptHistOuvrir').click();
  await expect(page.locator('#cptHistConfirm')).toBeVisible();
  await expect(page.locator('#cptHistAttendu')).toHaveText('pilote28');
  const suppr = page.locator('#cptHistSupprimer');
  await expect(suppr).toBeDisabled();

  await page.locator('#cptHistSaisie').fill('pilote2');
  await expect(suppr, 'un nom presque juste ne suffit pas').toBeDisabled();
  await page.locator('#cptHistSaisie').press('Enter');
  expect(await page.evaluate(() => window.__effacements), 'Entrée ne contourne pas le contrôle').toBe(0);

  await page.locator('#cptHistSaisie').fill('Pilote28');   // la casse ne compte pas
  await expect(suppr).toBeEnabled();
  await suppr.click();

  await expect(page.locator('#cptHistMsg')).toContainText('Historique supprimé de votre compte.');
  expect(await page.evaluate(() => window.__effacements)).toBe(1);
  await expect(page.locator('#cptHistConfirm')).toBeHidden();
  await expect(page.locator('#cptHistSaisie')).toHaveValue('');
});

test('si la base refuse, on le dit et rien n\'est annoncé comme supprimé', async ({ page }) => {
  await ouvrir(page);
  await simulerConnexion(page);
  await page.evaluate(() => {
    window.RTDonnees = window.RTDonnees || {};
    RTDonnees.effacerTout = () => Promise.reject(new Error('refusé'));
  });
  await entrer(page, 'parametres');
  await page.locator('#cptHistOuvrir').click();
  await page.locator('#cptHistSaisie').fill('pilote28');
  await page.locator('#cptHistSupprimer').click();
  await expect(page.locator('#cptHistMsg')).toContainText("Rien n'a été supprimé.");
  await expect(page.locator('#cptHistConfirm')).toBeVisible();
});

/* ---- La file d'attente de sync.js (rt-sync-file) --------------------------
   Une séance mise de côté hors connexion AVANT la suppression repartait toute
   seule à la connexion suivante, et réapparaissait. On appelle ici le VRAI
   RTDonnees.effacerTout(), avec un faux client Supabase qui répond aux trois
   requêtes qu'il fait : DELETE, recomptage, remise à zéro du vol en cours. */
async function fauxClient(page, { refuser = false } = {}) {
  await page.evaluate((refuser) => {
    const reponse = (v) => ({ eq: () => Promise.resolve(v) });
    const faux = {
      from: (table) => ({
        delete: () => reponse(refuser ? { error: { message: 'refusé' } } : { error: null }),
        select: () => reponse({ error: null, count: 0 }),
        update: () => reponse({ error: null })
      })
    };
    RTAuth.client = () => faux;
    RTAuth.utilisateur = () => ({ id: 'essai', email: 'pilote@exemple.fr' });
    localStorage.setItem('rt-sync-file', JSON.stringify([{ session: { id: 's-hors-ligne' }, steps: [] }]));
    localStorage.setItem('rt-push-attente', JSON.stringify({ reglages: true }));
  }, refuser);
}

test('un effacement réussi vide aussi la file des séances en attente', async ({ page }) => {
  await ouvrir(page);
  await fauxClient(page);
  const r = await page.evaluate(() => RTDonnees.effacerTout());
  expect(r.base).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('rt-sync-file')), 'file oubliée').toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rt-push-attente'))),
         'la file des réglages et du vol en cours n\'est pas touchée').toEqual({ reglages: true });
  expect(await page.evaluate(() => RTSync.enAttente())).toBe(0);
});

test('si la base refuse l\'effacement, la file des séances en attente est conservée', async ({ page }) => {
  await ouvrir(page);
  await fauxClient(page, { refuser: true });
  const issue = await page.evaluate(() => RTDonnees.effacerTout().then(() => 'résolue', () => 'rejetée'));
  expect(issue).toBe('rejetée');
  expect(await page.evaluate(() => RTSync.enAttente()), 'ces séances n\'existent nulle part ailleurs').toBe(1);
});
