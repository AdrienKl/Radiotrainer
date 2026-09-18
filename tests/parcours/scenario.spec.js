/* =============================================================================
   AVIERO — UN SCÉNARIO JOUÉ DU DÉBUT À LA FIN
   -----------------------------------------------------------------------------
   C'est le test le plus important de la suite, parce qu'il est le seul à
   traverser tout le moteur : résolution des gabarits de phraséologie, voix du
   contrôleur, normalisation de la réponse, correction floue, notation,
   récapitulatif, écriture de l'historique.

   IL NE JUGE PAS LA PHRASÉOLOGIE — il ne le peut pas, et ce n'est pas son rôle
   (seul un œil humain, le manuel ouvert, peut dire qu'une phrase est juste).
   Ce qu'il vérifie, c'est que le moteur note JUSTE ce qui EST juste : on lui
   rend mot pour mot le collationnement qu'il attend, et il doit compter 100 %.
   Si un découpage casse la normalisation ou la correction floue, cette
   vérification tombe — et sans elle, on ne le verrait qu'en entendant un élève
   dire « mais j'ai dit exactement ça ».

   Aucun micro n'est utilisé : la réponse est tapée dans le champ de
   transcription, exactement comme le fait un utilisateur sans micro (le champ
   existe pour ça, il n'a pas été ajouté pour les tests).
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer, lireCle } from './_aide.js';

/* Avance jusqu'à la première étape où l'élève doit VRAIMENT parler.

   Un scénario ne commence pas forcément par un collationnement : à Bordeaux, la
   première étape demande d'afficher la fréquence ATIS sur le poste et d'écouter
   le message — il n'y a rien à dire. Les tests qui portent sur la notation
   doivent donc se placer d'abord sur une étape qui attend une réponse, sinon
   ils valident le vide et passent pour de mauvaises raisons (c'est exactement
   ce qui est arrivé au premier jet de ce fichier). */
async function jusquAUneReponse(page, max = 8) {
  for (let i = 0; i < max; i++) {
    const pret = await page.evaluate(() => window.RT_TEST_SCN.aRepondre());
    if (pret) return true;
    await page.evaluate(() => window.RT_TEST_SCN.suivant());
    await page.waitForTimeout(200);
  }
  return false;
}

/* Joue un scénario entier en répondant parfaitement. Renvoie le nombre de
   collationnements rendus. */
async function jouerParfaitement(page, maxEtapes = 40) {
  let rendus = 0;
  for (let i = 0; i < maxEtapes; i++) {
    const etat = await page.evaluate(() => ({
      enCours: window.RT_TEST_SCN.enCours(),
      aRepondre: window.RT_TEST_SCN.aRepondre(),
      etape: window.RT_TEST_SCN.etape(),
      total: window.RT_TEST_SCN.total()
    }));
    if (!etat.enCours) break;
    if (etat.aRepondre) {
      const attendu = await page.evaluate(() => window.RT_TEST_SCN.attendu());
      expect(attendu, `Étape ${etat.etape} : aucun collationnement attendu résolu`).not.toBe('');
      await page.evaluate(a => window.RT_TEST_SCN.dire(a), attendu);
      rendus++;
    }
    await page.waitForTimeout(120);
    await page.evaluate(() => window.RT_TEST_SCN.suivant());
    await page.waitForTimeout(120);
  }
  return rendus;
}

test('un scénario se joue du début au récapitulatif', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'exercices');

  const lance = await page.evaluate(() => window.rtRelancerScenario(0, 'LFBD'));
  expect(lance, 'Le scénario 0 (mise en route + roulage) n\'a pas démarré').toBe(true);
  await page.waitForTimeout(300);

  const rendus = await jouerParfaitement(page);
  expect(rendus, 'Aucun collationnement n\'a été demandé').toBeGreaterThan(2);

  await expect(page.locator('#recap, .recap, #recapBox').first()).toBeVisible({ timeout: 5000 });
  expect(erreurs, 'Erreurs de console pendant le scénario').toEqual([]);
});

test('une réponse exacte est notée exacte', async ({ page }) => {
  /* Le cœur du sujet. On rend au moteur le texte qu'il attend, mot pour mot :
     il doit le reconnaître entièrement. Un score partiel ici signifierait que
     la normalisation, les bigrammes ou la correction floue ont été abîmés. */
  await ouvrir(page);
  await entrer(page, 'exercices');
  await page.evaluate(() => window.rtRelancerScenario(0, 'LFBD'));
  await page.waitForTimeout(300);

  expect(await jusquAUneReponse(page), 'Aucune étape n\'attend de collationnement').toBe(true);
  const attendu = await page.evaluate(() => window.RT_TEST_SCN.attendu());
  await page.evaluate(a => window.RT_TEST_SCN.dire(a), attendu);
  await page.waitForTimeout(300);

  /* Le retour est une liste de mots-clés : .ok pour trouvé, .ko pour manquant. */
  const trouves = await page.locator('#feedback .fb-item.ok').count();
  const manquants = await page.locator('#feedback .fb-item.ko').count();
  const detail = await page.locator('#feedback').innerText();

  expect(trouves, 'Aucun mot-clé reconnu : le retour ne s\'affiche pas.').toBeGreaterThan(0);
  expect(manquants,
    `Le moteur déclare manquants des éléments de la phrase qu'il attendait lui-même.\n` +
    `Réponse rendue : « ${attendu} »\nRetour :\n${detail}`).toBe(0);
});

test('une réponse fausse n\'est pas notée juste', async ({ page }) => {
  /* Le contrôle symétrique. Sans lui, un moteur qui accepterait tout passerait
     le test précédent — et enseignerait n'importe quoi. */
  await ouvrir(page);
  await entrer(page, 'exercices');
  await page.evaluate(() => window.rtRelancerScenario(0, 'LFBD'));
  await page.waitForTimeout(300);

  expect(await jusquAUneReponse(page), 'Aucune étape n\'attend de collationnement').toBe(true);
  await page.evaluate(() => window.RT_TEST_SCN.dire('bonjour ça va bien merci'));
  await page.waitForTimeout(300);

  const manquants = await page.locator('#feedback .fb-item.ko').count();
  const detail = await page.locator('#feedback').innerText();
  expect(manquants,
    `Une réponse hors sujet n'a fait manquer aucun mot-clé. Le moteur accepterait ` +
    `n'importe quoi, et le test « une réponse exacte est notée exacte » ne ` +
    `prouverait plus rien.\nRetour :\n${detail}`).toBeGreaterThan(0);
});

test('la séance terminée est écrite dans l\'historique', async ({ page }) => {
  /* Six scénarios sur treize n'enregistraient rien — c'est le dernier bug
     corrigé avant cette migration. Sans ce test, il peut revenir sans bruit :
     la séance se joue, le récapitulatif s'affiche, et rien n'est gardé. */
  await ouvrir(page);
  await entrer(page, 'exercices');
  await page.evaluate(() => localStorage.removeItem('radiotrainer_history_v2'));

  await page.evaluate(() => window.rtRelancerScenario(0, 'LFBD'));
  await page.waitForTimeout(300);
  await jouerParfaitement(page);
  await page.waitForTimeout(500);

  const histo = await lireCle(page, 'radiotrainer_history_v2');
  expect(Array.isArray(histo) && histo.length > 0,
    'Le scénario s\'est joué jusqu\'au bout mais rien n\'a été enregistré.').toBe(true);
});

test('la séance part aussi dans la file de synchronisation', async ({ page }) => {
  /* Supabase est coupé dans les tests : la séance ne peut pas partir. Elle doit
     donc ATTENDRE dans rt-sync-file, et non disparaître. C'est ce qui garantit
     qu'une séance jouée hors ligne n'est pas perdue. */
  await ouvrir(page);
  await entrer(page, 'exercices');
  await page.evaluate(() => localStorage.removeItem('rt-sync-file'));

  await page.evaluate(() => window.rtRelancerScenario(0, 'LFBD'));
  await page.waitForTimeout(300);
  await jouerParfaitement(page);
  await page.waitForTimeout(800);

  const file = await lireCle(page, 'rt-sync-file');
  expect(file, 'Rien n\'attend dans la file : une séance jouée hors ligne serait perdue.').toBeTruthy();
});

test('les treize scénarios démarrent tous', async ({ page }) => {
  /* On ne les joue pas jusqu'au bout — ce serait long et redondant. On vérifie
     que chacun se lance et pose une première étape : un scénario dont les
     données ont été abîmées échoue ici, pas en production. */
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'exercices');

  const nb = await page.evaluate(() => SCENARIOS.length);
  expect(nb).toBe(13);

  const muets = [];
  for (let i = 0; i < nb; i++) {
    const info = await page.evaluate(async (idx) => {
      window.rtRelancerScenario(idx, 'LFBD');
      await new Promise(r => setTimeout(r, 150));
      return {
        id: SCENARIOS[idx].id,
        total: window.RT_TEST_SCN.total(),
        enCours: window.RT_TEST_SCN.enCours()
      };
    }, i);
    if (!info.enCours || info.total === 0) muets.push(`${info.id} (${info.total} étape(s))`);
  }
  expect(muets, 'Ces scénarios ne produisent aucune étape').toEqual([]);
  expect(erreurs).toEqual([]);
});
