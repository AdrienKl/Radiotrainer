/* =============================================================================
   AVIERO — L'API window RÉPOND VRAIMENT, DANS UN VRAI NAVIGATEUR
   -----------------------------------------------------------------------------
   tests/contrat/api-window.test.mjs vérifie la NATURE des déclarations en lisant
   le code : `function` et `var` atterrissent sur window, `const` et `let` non.

   Ce fichier-ci vérifie l'autre moitié, celle qu'on ne peut pas déduire du
   texte : que le symbole est bel et bien là, au moment où un autre fichier le
   demande. Un bloc mort en cours de route, un fichier en 404, une exception qui
   arrête un script avant sa dernière ligne — et la déclaration est parfaite dans
   le fichier tout en étant absente de window.

   ┌─ POURQUOI CE TEST EXISTE MAINTENANT ────────────────────────────────────┐
   │ Écrit AVANT l'extraction du noyau (étape 2.2), pour constater l'état     │
   │ actuel. L'étape 2.2 va déplacer rtConfirm, showToast et Voix hors du     │
   │ moteur. Ce sont les trois que la console d'administration et la page     │
   │ Paramètres atteignent par window, derrière un `if (window.X)` — donc     │
   │ les trois dont la disparition ne produirait AUCUNE erreur. Un bouton qui │
   │ ne fait plus rien, et c'est tout.                                        │
   └──────────────────────────────────────────────────────────────────────────┘
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

test('les fonctions atteintes par window.X répondent', async ({ page }) => {
  await ouvrir(page);

  const etat = await page.evaluate(() => ({
    rtConfirm:          typeof window.rtConfirm,
    showToast:          typeof window.showToast,
    rtBadges:           typeof window.rtBadges,
    rtRelancerScenario: typeof window.rtRelancerScenario,
    rtEntrer:           typeof window.rtEntrer,
    rtSessionOuverte:   typeof window.rtSessionOuverte,
    rtJourActif:        typeof window.rtJourActif,
    rtQuotaAtteint:     typeof window.rtQuotaAtteint,
    rtMajLienAdmin:     typeof window.rtMajLienAdmin
  }));

  const absentes = Object.entries(etat).filter(([, t]) => t !== 'function').map(([n, t]) => `${n} = ${t}`);
  expect(absentes,
    'Ces fonctions ne sont plus sur window. Les fichiers qui les appellent le ' +
    'font derrière un « if (window.X) » : rien ne plantera, la fonctionnalité ' +
    'aura simplement disparu.').toEqual([]);
});

test('window.Voix expose toujours ses quatre commandes', async ({ page }) => {
  /* assets/modules/parametres.js appelle window.Voix.parler() pour le bouton
     « essayer la voix ». L'étape 2.2 déplace Voix dans assets/noyau/3-voix.js
     SANS RIEN Y CHANGER : cette forme-là doit donc être exactement la même
     avant et après. */
  await ouvrir(page);
  const v = await page.evaluate(() => {
    if (!window.Voix) return null;
    return { parler: typeof window.Voix.parler, empiler: typeof window.Voix.empiler,
             stop: typeof window.Voix.stop, occupe: typeof window.Voix.occupe };
  });
  expect(v, 'window.Voix a disparu — le bouton « essayer la voix » des Paramètres ne dira plus rien.').not.toBeNull();
  expect(v).toEqual({ parler: 'function', empiler: 'function', stop: 'function', occupe: 'function' });
});

test('window.RT_SCENARIOS_MAP relie les séances de la base aux scénarios', async ({ page }) => {
  /* assets/donnees.js s'en sert pour retraduire une séance lue en base. Sans
     elle, l'historique affiche des lignes sans titre — une perte silencieuse,
     puisque les données sont là. */
  await ouvrir(page);
  const carte = await page.evaluate(() => window.RT_SCENARIOS_MAP || null);
  expect(carte, 'RT_SCENARIOS_MAP a disparu').not.toBeNull();
  expect(Object.keys(carte).length).toBe(13);
  expect(carte.roulage).toMatchObject({ idx: 0 });
  expect(typeof carte.roulage.titre).toBe('string');
});

test('les prises de test restent accessibles à la console d\'administration', async ({ page }) => {
  /* La page #admin/test les appelle. Ce ne sont pas que des prises pour la
     suite de tests : ce sont l'API d'une page visible. */
  await ouvrir(page);
  await entrer(page, 'tableau');
  const prises = await page.evaluate(() => ({
    RT_TEST:      typeof window.RT_TEST,
    RT_TEST_EPEL: typeof window.RT_TEST_EPEL,
    RT_TEST_SCN:  typeof window.RT_TEST_SCN,
    RT_AIR:       typeof window.RT_AIR
  }));
  expect(prises).toEqual({ RT_TEST: 'object', RT_TEST_EPEL: 'object', RT_TEST_SCN: 'object', RT_AIR: 'object' });
});
