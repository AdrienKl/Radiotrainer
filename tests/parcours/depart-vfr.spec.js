/* =============================================================================
   Albatros VFR — LE DÉPART VFR, DU PREMIER APPEL AU DÉCOLLAGE (03/10/2026)
   -----------------------------------------------------------------------------
   Décision du développeur, manuel DSNA en main :
   - pas de demande de mise en route en VFR. Le seul exemple VFR du manuel
     (p. 45, « Cas d'un vol VFR ») passe du contact (« bonjour ») à la demande
     de roulage, lettre d'information comprise ; la mise en route (p. 39-40)
     est rangée sous « clairance initiale – SID », avec des exemples IFR ;
   - « Prêt au départ, indicatif », sans « point d'attente piste … », et sans
     « rappelez prêt au départ » redit par la tour (déjà dit avec le roulage) ;
   - une fois sur trois, le départ immédiat de la p. 60, mot pour mot.
   Ces tests rougissent si l'une de ces phrases revient en arrière.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer, lireCle } from './_aide.js';

test('Scénario « Contact et roulage » : bonjour, puis roulage — aucune mise en route', async ({ page }) => {
  await ouvrir(page);
  const sc = await page.evaluate(() => {
    const s = SCENARIOS.filter(x => x.id === 'roulage')[0];
    return { titre: s.titre, tours: s.tours.map(t => ({ atc: t.atc, attendu: t.attendu, atisMot: !!t.atisMot })) };
  });
  expect(sc.titre).toBe('Contact et roulage');
  const tout = JSON.stringify(sc.tours).toLowerCase();
  expect(tout, 'Une mise en route est revenue dans le départ VFR').not.toContain('mise en route');
  expect(sc.tours[0].attendu).toBe('{ADRM} {STN}, {CALL}, bonjour.');
  expect(sc.tours[1].atc).toEqual(['{CALL}, {ADRM} {STN}, bonjour.']);
  expect(sc.tours[1].attendu).toContain('demande consignes de roulage');
  expect(sc.tours[1].attendu, 'La lettre d\'information doit être dans la demande de roulage (p. 45)').toContain('{ATISPART}');
  expect(sc.tours[1].atisMot).toBe(true);
});

test('Scénario « Décollage » : « prêt au départ » strict, et le départ immédiat de la p. 60', async ({ page }) => {
  await ouvrir(page);
  const r = await page.evaluate(() => {
    const s = SCENARIOS.filter(x => x.id === 'decollage')[0];
    const pret = s.tours[0];
    const imm = departImmediat();
    return {
      attendu: pret.attendu,
      variantes: pret.motsCles.filter(m => m.label === 'Prêt au départ')[0].variantes,
      piste: pret.motsCles.some(m => m.ref === 'piste'),
      imm: imm.map(t => ({ atc: t.atc, attendu: t.attendu })),
      nOrdinaire: s.tours.length
    };
  });
  expect(r.attendu).toBe('{ADRM} {STN}, {CALL}, prêt au départ.');
  expect(r.attendu).not.toContain('point d\'attente');
  expect(r.variantes, '« prêt » seul, « prêt à décoller »… ne doivent plus être acceptés').toEqual(['pret au depart']);
  expect(r.piste).toBe(false);

  expect(r.imm[0].atc).toBe('{CALL}, êtes-vous prêt pour un départ immédiat ?');
  expect(r.imm[0].attendu).toBe('Affirme, {CALL}.');
  expect(r.imm[1].atc).toBe('{CALL}, alignez-vous piste {PISTE}, autorisé décollage immédiat, vent {VENT}.');
  expect(r.imm[1].attendu).toBe('Je m\'aligne piste {PISTE} et je décolle, {CALL}.');
  expect(JSON.stringify(r.imm), 'Pas de « alignez-vous et attendez » dans un départ immédiat').not.toContain('attendez');
  expect(r.imm.length, 'La suite (cap, sortie de fréquence) est celle du départ ordinaire').toBe(r.nOrdinaire - 1);
});

/* Joue le scénario en rendant mot pour mot la phrase attendue : chaque réponse
   doit être notée entière (aucun élément .ko). Une phrase attendue que le moteur
   ne reconnaît pas lui-même serait impossible à réussir. */
async function jouerExact(page, id, hasard) {
  /* Le hasard n'est figé que le temps du lancement, où buildTours tire le départ. */
  const i = await page.evaluate(x => SCENARIOS.findIndex(s => s.id === x), id);
  expect(await page.evaluate(([n, h]) => {
    const r = Math.random; if (h != null) Math.random = () => h;
    try { return window.rtRelancerScenario(n, 'LFBD'); } finally { Math.random = r; }
  }, [i, hasard])).toBe(true);
  await page.waitForTimeout(300);
  const dits = [];
  for (let k = 0; k < 14; k++) {
    const e = await page.evaluate(() => ({ en: window.RT_TEST_SCN.enCours(), rep: window.RT_TEST_SCN.aRepondre() }));
    if (!e.en) break;
    if (e.rep) {
      const a = await page.evaluate(() => window.RT_TEST_SCN.attendu());
      dits.push(a);
      await page.evaluate(x => window.RT_TEST_SCN.dire(x), a);
      await page.waitForTimeout(250);
      const ko = await page.locator('#feedback .fb-item.ko').count();
      expect(ko, `« ${a} » n'est pas notée entière :\n${await page.locator('#feedback').innerText()}`).toBe(0);
    }
    await page.evaluate(() => window.RT_TEST_SCN.suivant());
    await page.waitForTimeout(150);
  }
  return dits;
}

test('les départs se jouent mot pour mot, réponses notées entières', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'exercices');
  const roul = await jouerExact(page, 'roulage', null);
  expect(roul.join(' ').toLowerCase()).not.toContain('mise en route');
  expect(roul[0]).toMatch(/bonjour\.$/);

  const ordinaire = await jouerExact(page, 'decollage', 0.9);      // ≥ 1/3 : départ ordinaire
  expect(ordinaire[0]).toMatch(/prêt au départ\.$/);
  expect(ordinaire[1]).toMatch(/^Je m'aligne et j'attends/);

  const immediat = await jouerExact(page, 'decollage', 0.1);       // < 1/3 : départ immédiat
  expect(immediat[0]).toMatch(/^Affirme, /);
  expect(immediat[1]).toMatch(/^Je m'aligne piste .+ et je décolle, /);
  expect(erreurs).toEqual([]);
});

async function etapesVol(page, immediat) {
  await page.evaluate(b => window.RT_TEST.forcerImmediat(b), immediat);
  const avions = await page.evaluate(() => window.RT_TEST.avions());
  const err = await page.evaluate(a => window.RT_TEST.lancerVol({ dep: 'LFBD', arr: 'LFBH', avion: a, mode: 'voyage' }), avions[0]);
  expect(err).toBeNull();
  return page.evaluate(() => window.RT_TEST.etapes());
}

test('Navigation (terrain contrôlé) : premier contact, roulage avec l\'ATIS, prêt au départ', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  const S = await etapesVol(page, false);
  const ph = S.map(s => s.ph);

  expect(ph).not.toContain('Mise en route');
  expect(ph).not.toContain('Collationnement mise en route');
  const contact = S.filter(s => s.ph === 'Premier contact')[0];
  expect(contact, 'Plus d\'étape « Premier contact »').toBeTruthy();
  expect(contact.attendu).toMatch(/, \{CALL\}, bonjour\.$/);
  expect(contact.atcAfter).toMatch(/^\{CALL\}, .+, bonjour\.$/);

  const atis = ph.includes('Écoute ATIS');
  const roul = S.filter(s => s.ph === 'Roulage')[0];
  expect(roul.attendu).toContain('demande consignes de roulage');
  if (atis) expect(roul.attendu).toContain('information {ATIS}');

  const pret = S.filter(s => s.ph === 'Prêt au départ')[0];
  expect(pret.attendu).toBe('Prêt au départ, {CALL}.');
  expect(pret.atcBefore, 'La tour redemandait « rappelez prêt au départ »').toBeNull();
  expect(ph).toContain('Alignement');
  expect(S.filter(s => s.ph === 'Décollage')[0].attendu).toBe('Piste {PISTE}, je décolle, {CALL}.');
  expect(erreurs).toEqual([]);
});

test('Navigation : départ immédiat (p. 60), et il se garde à la reprise', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  await page.evaluate(() => localStorage.removeItem('rt-vol-en-cours'));
  const S = await etapesVol(page, true);
  const ph = S.map(s => s.ph);

  expect(ph).toContain('Départ immédiat');
  expect(ph).not.toContain('Prêt au départ');
  expect(ph, 'Pas de « alignez-vous et attendez » dans un départ immédiat').not.toContain('Alignement');
  const q = S.filter(s => s.ph === 'Départ immédiat')[0];
  expect(q.atcBefore).toBe('{CALL}, êtes-vous prêt pour un départ immédiat ?');
  expect(q.attendu).toBe('Affirme, {CALL}.');
  expect(q.atcAfter).toBe('{CALL}, alignez-vous piste {PISTE}, autorisé décollage immédiat, vent {VENT}.');
  expect(S.filter(s => s.ph === 'Décollage')[0].attendu).toBe('Je m\'aligne piste {PISTE} et je décolle, {CALL}.');

  await page.waitForTimeout(600);
  const v = await lireCle(page, 'rt-vol-en-cours');
  expect(v && v.immediat, 'Le départ immédiat n\'est pas sauvegardé : la reprise retirerait au sort').toBe(true);
});
