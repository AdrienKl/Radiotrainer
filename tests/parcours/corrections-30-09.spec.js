/* =============================================================================
   Albatros VFR — CORRECTIONS DU 30/09/2026 (retours d'un vol Nice → Orly)
   -----------------------------------------------------------------------------
     · « je rappelle en finale piste 07 » était compté JUSTE parce que « finale »
       et « 07 » y étaient : un mot qui change le sens compte désormais faux ;
     · les nombres se disent comme dans la vie courante (manuel p. 17) : piste
       « vingt-deux », fréquence « cent trente-cinq décimale cinq cent trente »,
       zone « R cent soixante-deux » ;
     · la reconnaissance comprend ces formes, « ident », « trafic », le VOR ;
     · « Réenregistrer » passe avant « Valider ma réponse ».
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir } from './_aide.js';

test('un mot qui change le sens compte faux : « je rappelle », « autorisé »', async ({ page }) => {
  await ouvrir(page);
  const r = await page.evaluate(() => {
    const finale = { motsCles: [{ label: 'En finale', variantes: ['finale', 'en finale'] }] };
    const collat = { motsCles: [{ label: 'Rappel', variantes: ['je rappelle vent arriere'] }] };
    const decol = { motsCles: [{ label: 'Je décolle', variantes: ['je decolle'] }] };
    const e = (s, dit, att) => ecartsDeSens(s, fuzzyCorrect(dit), att).map(x => x.label);
    return {
      rappelFaux: e(finale, 'F-BX je rappelle en finale piste 07', 'F-BX, finale piste 07.'),
      finaleJuste: e(finale, 'F-BX finale piste 07', 'F-BX, finale piste 07.'),
      rappelAttendu: e(collat, 'J entre vent arrière piste 07, je rappelle vent arrière', 'J\'entre vent arrière piste 07, QNH 1013, je rappelle vent arrière, F-BX.'),
      autoriseFaux: e(decol, 'autorisé décollage piste 27', 'Piste 27, je décolle, F-BX.')
    };
  });
  expect(r.rappelFaux).toEqual(['« Je rappelle » en trop']);
  expect(r.finaleJuste).toEqual([]);
  expect(r.rappelAttendu).toEqual([]);
  expect(r.autoriseFaux).toEqual(['« Autorisé » dans la bouche du pilote']);
});

test('les nombres se disent comme dans la vie courante (manuel p. 17)', async ({ page }) => {
  await ouvrir(page);
  const r = await page.evaluate(() => ['piste 22', 'piste 07', 'contactez 135.530', 'zone R 162 active', 'piste 27L', 'cap 060', 'QNH 1013']
    .map(t => spokenDigits(t)));
  expect(r).toEqual(['piste vingt-deux', 'piste zéro sept', 'contactez cent trente-cinq décimale cinq cent trente',
    'zone R cent soixante-deux active', 'piste vingt-sept L', 'cap zéro six zéro', 'QNH unité zéro unité trois']);
});

test('la reconnaissance comprend les nombres en lettres, la décimale, ident, trafic, le VOR', async ({ page }) => {
  await ouvrir(page);
  const r = await page.evaluate(() => ({
    piste: digitCanon(fuzzyCorrect('finale piste vingt-deux')).includes('22'),
    freqMots: digitCanon(fuzzyCorrect('cent trente-cinq décimale cinq cent trente')).includes('135530'),
    freqMixte: digitCanon(fuzzyCorrect('unité 35 décimales 530')).includes('135530'),
    affiche: lissageTranscription('contactez Paris unité 35 décimales 530'),
    ident: fuzzyCorrect('transpondeur i dent'),
    indent: fuzzyCorrect('transpondeur indent'),
    trafic: fuzzyCorrect('traffic en vue'),
    vor: fuzzyCorrect('verticale le vor')
  }));
  expect(r).toEqual({ piste: true, freqMots: true, freqMixte: true, affiche: 'contactez Paris 135.530',
    ident: 'transpondeur ident', indent: 'transpondeur ident', trafic: 'trafic en vue', vor: 'verticale le vor' });
});

test('« Réenregistrer » passe avant « Valider ma réponse », en Scénario comme en Navigation', async ({ page }) => {
  await ouvrir(page);
  const ordre = await page.evaluate(() => ['transWrap', 'vfTransWrap'].map(id =>
    [...document.querySelectorAll('#' + id + ' .vf-transact button')].map(b => b.id)));
  expect(ordre[0].slice(0, 2)).toEqual(['reRecordBtn', 'validerBtn']);
  expect(ordre[1].slice(0, 2)).toEqual(['vfRerec', 'vfValider']);
});

test('la prononciation OACI est stable au second passage, accents compris', async ({ page }) => {
  await ouvrir(page);
  const r = await page.evaluate(() => {
    const t = 'PAN PAN PAN, Juliett, X-ray, transpondeur ident, le VOR, SIGMET, CAVOK';
    const a = prononciationRadio(t);
    return { a, stable: prononciationRadio(a) === a };
  });
  expect(r.a).toBe('panne panne panne, djouliètt, ex-ré, transpondeur idènte, le vor, sigmète, cavoké');
  expect(r.stable).toBe(true);
});
