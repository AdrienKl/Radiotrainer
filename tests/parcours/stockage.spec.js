/* =============================================================================
   AVIERO — CE QUI EST GARDÉ D'UNE VISITE À L'AUTRE
   -----------------------------------------------------------------------------
   Quinze clés de stockage local sont écrites par cinq fichiers différents.
   Elles ne servent pas toutes à la même chose :

     · rt-settings, rt-menu-replie   → des préférences d'affichage ;
     · rt-vols, radiotrainer_history_v2, rt-jours, rt-quota → un CACHE de ce que
       la base garde déjà (assets/donnees.js) ;
     · rt-sync-file                  → une file d'attente : ce qui n'a pas encore
       pu partir, et qui serait perdu s'il disparaissait ;
     · rt-auth                       → la session Supabase elle-même.

   Ce fichier vérifie que ce qui doit survivre à un rechargement y survit. Une
   régression ici ne produit aucune erreur : elle produit un compte qui a l'air
   neuf, et personne ne pense à regarder le stockage local.

   Les tests coupent Supabase (voir _aide.js) : ils voient donc le comportement
   HORS LIGNE, celui où le cache local est la seule chose qui reste. C'est
   précisément le cas où ces clés comptent le plus.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer, lireCle, ecrireCle } from './_aide.js';

test('un réglage survit au rechargement', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'parametres');
  await page.evaluate(() => {
    var s = rtSettings(); s.theme = 'dark'; rtSaveSettings(s);
  });

  await page.reload();
  await page.waitForFunction(() => typeof window.rtSessionOuverte === 'function');
  expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
  const s = await lireCle(page, 'rt-settings');
  expect(s.theme).toBe('dark');
});

test('la série de jours ne compte que les jours où l\'on a pratiqué', async ({ page }) => {
  /* Compter les simples ouvertures de page affichait « 1 jour d'affilée » à
     quelqu'un qui n'avait encore rien fait — une fausse récompense. rtJourActif()
     n'est appelé qu'en fin de vol et en fin de scénario. */
  await ouvrir(page);
  await entrer(page, 'tableau');
  await page.evaluate(() => localStorage.removeItem('rt-jours'));

  await page.reload();
  await page.waitForFunction(() => typeof window.rtJourActif === 'function');
  expect(await lireCle(page, 'rt-jours'),
    'Ouvrir la page a suffi à marquer un jour de pratique.').toBeFalsy();

  await page.evaluate(() => window.rtJourActif());
  const jours = await lireCle(page, 'rt-jours');
  expect(Array.isArray(jours) && jours.length === 1).toBe(true);

  /* Deux pratiques le même jour ne font pas deux jours. */
  await page.evaluate(() => window.rtJourActif());
  expect((await lireCle(page, 'rt-jours')).length).toBe(1);
});

test('le quota du jour se compte, et se remet à zéro le lendemain', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');
  await page.evaluate(() => localStorage.removeItem('rt-quota'));

  expect(await page.evaluate(() => window.rtQuotaAtteint())).toBe(false);
  for (let i = 0; i < 4; i++) await page.evaluate(() => window.rtQuotaIncr());
  expect(await page.evaluate(() => window.rtQuotaAtteint()),
    'Le quota de quatre vols par jour ne se déclenche plus.').toBe(true);

  /* Un compteur daté d'hier ne doit pas bloquer aujourd'hui. */
  await ecrireCle(page, 'rt-quota', { date: '2020-01-01', n: 99 });
  expect(await page.evaluate(() => window.rtQuotaAtteint()),
    'Un quota d\'un autre jour bloque encore.').toBe(false);
});

test('l\'historique des scénarios est relu au chargement', async ({ page }) => {
  /* La page Progression lit le cache local. Si elle cessait de le relire, un
     utilisateur hors ligne verrait un historique vide alors que ses séances
     sont là — c'est le bug « la progression ne se relisait jamais ». */
  await ouvrir(page);
  await entrer(page, 'progression');
  await ecrireCle(page, 'radiotrainer_history_v2', [{
    date: new Date().toISOString(), scenario: 'Mise en route + roulage',
    pct: 100, score: 3, total: 3, steps: []
  }]);

  await page.reload();
  await page.waitForFunction(() => typeof window.rtSessionOuverte === 'function');
  await entrer(page, 'progression');
  await page.waitForTimeout(400);

  const texte = await page.locator('#page-progression').innerText();
  expect(/roulage/i.test(texte),
    `La séance présente dans le stockage local n'apparaît pas sur la page Progression.\n${texte.slice(0, 300)}`).toBe(true);
});

test('la file de synchronisation n\'est pas vidée par un rechargement', async ({ page }) => {
  /* Ce qui attend dans rt-sync-file n'est encore NULLE PART ailleurs. Un
     rechargement qui la viderait perdrait des séances pour de bon. */
  await ouvrir(page);
  await ecrireCle(page, 'rt-sync-file', [{ id: 'test-0000', type: 'scenario', statut: 'in_progress' }]);
  await page.reload();
  await page.waitForFunction(() => typeof window.rtSessionOuverte === 'function');
  await page.waitForTimeout(500);

  const file = await lireCle(page, 'rt-sync-file');
  expect(Array.isArray(file) && file.length > 0,
    'La file d\'attente a été vidée au rechargement : les séances non envoyées sont perdues.').toBe(true);
});
