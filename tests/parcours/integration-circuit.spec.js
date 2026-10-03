/* =============================================================================
   Albatros VFR — L'ARRIVÉE ET LE CIRCUIT, MANUEL EN MAIN (03/10/2026)
   -----------------------------------------------------------------------------
   Manuel DSNA p. 148-152 (Blagnac, PA28) :
   - « Tour, bonjour, F-BX » / « F-BX, bonjour, j'écoute », puis l'annonce
     « F-BGBX, PA28, VFR d'Albi à Blagnac pour un toucher …, 1500 pieds, …,
     information I » ;
   - sans ATIS, piste, vent et QNH AVANT l'entrée dans le circuit (p. 148) ;
   - « Je rappelle vent arrière piste … » (et non « J'entre vent arrière…,
     je rappelle… ») ;
   - comptes rendus « indicatif, position » ; numéro + trafic à suivre +
     « rappelez base », collationné avec « trafic en vue » ; « rappelez finale »
     collationné.
   - l'ATIS du terrain d'arrivée s'écoute avant de l'appeler (p. 214).
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

async function jouerExact(page, id, icao, choix = ['complet']) {
  const i = await page.evaluate(x => SCENARIOS.findIndex(s => s.id === x), id);
  expect(await page.evaluate(([n, t]) => window.rtRelancerScenario(n, t), [i, icao])).toBe(true);
  await page.waitForTimeout(300);
  const echanges = [];
  for (let k = 0; k < 80; k++) {
    const e = await page.evaluate(() => ({ en: window.RT_TEST_SCN.enCours(), rep: window.RT_TEST_SCN.aRepondre(),
                                             choix: window.RT_TEST_SCN.choix() }));
    if (!e.en) break;
    if (e.choix) {
      const k = choix.length > 1 ? choix.shift() : choix[0];
      echanges.push('[choix ' + k + ']');
      expect(await page.evaluate(x => window.RT_TEST_SCN.choisir(x), k), `option ${k} absente : ${e.choix}`).toBe(true);
      await page.waitForTimeout(150);
      continue;
    }
    if (e.rep) {
      /* Changer de station (Sol → Tour) demande d'afficher sa fréquence, comme
         l'élève le fait au poste : on la pose directement. */
      await page.evaluate(() => { const s = currentStep(); if (s && s.freq != null) scRadio.act = Number(s.freq); });
      const a = await page.evaluate(() => window.RT_TEST_SCN.attendu());
      echanges.push(a);
      await page.evaluate(x => window.RT_TEST_SCN.dire(x), a);
      await page.waitForTimeout(250);
      const ko = await page.locator('#feedback .fb-item.ko').count();
      expect(ko, `« ${a} » n'est pas notée entière :\n${await page.locator('#feedback').innerText()}`).toBe(0);
    }
    await page.evaluate(() => window.RT_TEST_SCN.suivant());
    await page.waitForTimeout(120);
  }
  return echanges;
}

test('Scénario « Intégration + atterrissage » : la p. 149 puis la p. 151, réponses notées entières', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'exercices');
  const e = await jouerExact(page, 'integration', 'LFBD');
  const t = e.join(' | ');
  expect(e[0], 'Premier contact « Tour, bonjour, indicatif » (p. 149)').toMatch(/, bonjour, [^,]+\.$/);
  expect(e[1]).toMatch(/VFR de .+ à .+ pour un atterrissage, \d+ pieds/);
  expect(t).not.toContain('milles au sud');
  expect(t).toMatch(/je rappelle vent arrière piste/i);
  expect(t).not.toMatch(/j'entre vent arrière/i);
  expect(t).toMatch(/, vent arrière piste [^,]+\.(?: \||$)/);      // indicatif DEVANT la position
  expect(t).toMatch(/Numéro \d, trafic en vue, je rappelle base piste/);
  expect(t).toMatch(/Je rappelle finale piste/);
  expect(erreurs).toEqual([]);
});

test('Scénario : sans ATIS, piste-vent-QNH avant l\'entrée dans le circuit', async ({ page }) => {
  await ouvrir(page);
  const r = await page.evaluate(() => {
    const s = SCENARIOS.filter(x => x.id === 'integration')[0];
    const t = s.tours.filter(x => x.sansAtis)[0];
    return { atc: t.atc, sans: t.sansAtis.atc, att: t.sansAtis.attendu, afis: t.afis.sansAtis };
  });
  expect(r.atc).toBe('{CALL}, entrez vent arrière piste {PISTE}, rappelez vent arrière.');
  expect(r.sans).toBe('{CALL}, piste {PISTE}, vent {VENT}, QNH {QNH}, entrez vent arrière piste {PISTE}, rappelez vent arrière.');
  expect(r.att).toBe('Piste {PISTE}, QNH {QNH}, je rappelle vent arrière piste {PISTE}, {CALL}.');
  expect(r.afis, 'Un agent AFIS ne donne pas d\'instruction d\'intégration').toBeNull();
});

test('Tour de piste : numéro, trafic, « rappelez finale » — joué en entier', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'exercices');
  const e = await jouerExact(page, 'tourdepiste', 'LFBD');
  const t = e.join(' | ');
  expect(t).toMatch(/Numéro \d, trafic en vue, je rappelle base piste/);
  expect(t).toMatch(/Je rappelle finale piste/);
  expect(erreurs).toEqual([]);
});

async function etapes(page, dep, arr) {
  await page.evaluate(() => window.RT_TEST.forcerAlea('aucun'));
  const avions = await page.evaluate(() => window.RT_TEST.avions());
  const err = await page.evaluate(([d, a, av]) => window.RT_TEST.lancerVol({ dep: d, arr: a, avion: av, mode: 'voyage' }), [dep, arr, avions[0]]);
  expect(err).toBeNull();
  return page.evaluate(() => window.RT_TEST.etapes());
}

test('Navigation vers un terrain contrôlé : ATIS d\'arrivée, bonjour / j\'écoute, annonce complète, collationnements du circuit', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  const S = await etapes(page, 'LFBH', 'LFBD');
  const ph = S.map(s => s.ph);
  const iInteg = ph.indexOf('Intégration');
  const iContact = ph.indexOf('Contact arrivée');
  expect(iContact, 'Plus de « Contact arrivée »').toBeGreaterThan(0);
  expect(iContact).toBeLessThan(iInteg);

  const atisArr = ph.lastIndexOf('Écoute ATIS');
  const avecAtis = atisArr > 0 && atisArr < iContact && S[atisArr].ph === 'Écoute ATIS';
  const contact = S[iContact], integ = S[iInteg], coll = S[ph.indexOf('Collationnement intégration')];
  expect(contact.attendu).toMatch(/, bonjour, \{CALL\}\.$/);
  expect(contact.atcAfter).toBe('{CALL}, bonjour, j\'écoute.');
  expect(integ.attendu).toMatch(/^\{CALL\}, .+, VFR de .+ à .+ pour un atterrissage, \{ALT\} pieds/);
  if (avecAtis) {
    expect(integ.attendu).toMatch(/, information \{ATIS\}\.$/);
    expect(integ.atcAfter).toBe('{CALL}, entrez vent arrière piste {PISTE}, rappelez vent arrière.');
    expect(coll.attendu).toBe('Je rappelle vent arrière piste {PISTE}, {CALL}.');
  } else {
    expect(integ.atcAfter).toBe('{CALL}, piste {PISTE}, vent {VENT}, QNH {QNH}, entrez vent arrière piste {PISTE}, rappelez vent arrière.');
    expect(coll.attendu).toBe('Piste {PISTE}, QNH {QNH}, je rappelle vent arrière piste {PISTE}, {CALL}.');
  }

  const va = S[ph.indexOf('Vent arrière')];
  expect(va.atcAfter).toBe('{CALL}, numéro {NUM}{SUIVEZ}, rappelez base piste {PISTE}.');
  expect(S[ph.indexOf('Collationnement numéro')].attendu).toBe('Numéro {NUM}{TRAFICVU}, je rappelle base piste {PISTE}, {CALL}.');
  expect(S[ph.indexOf('Base')].atcAfter).toBe('{CALL}, rappelez finale piste {PISTE}.');
  expect(S[ph.indexOf('Collationnement base')].attendu).toBe('Je rappelle finale piste {PISTE}, {CALL}.');

  // Le trafic à suivre se résout bien dans la phrase.
  const phrase = await page.evaluate(() => fillDisplay('{CALL}, numéro {NUM}{SUIVEZ}, rappelez base piste {PISTE}.'));
  expect(phrase).toMatch(/numéro [23], suivez un (Cessna 172|PA28|DR400), en base, rappelez base piste/);
  expect(erreurs).toEqual([]);
});

test('Navigation : l\'ATIS d\'arrivée s\'écoute avant d\'appeler, quand le terrain en a un', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  // On cherche un terrain d'arrivée qui publie un ATIS, depuis les données du moteur.
  const arr = await page.evaluate(() => {
    const ads = (typeof AERODROMES !== 'undefined' ? AERODROMES : []);
    const a = ads.filter(x => x && x.icao !== 'LFBH' && atisFreqOf(x))[0];
    return a ? a.icao : null;
  });
  test.skip(!arr, 'aucun terrain avec ATIS dans les données');
  const S = await etapes(page, 'LFBH', arr);
  const ph = S.map(s => s.ph);
  const iContact = ph.indexOf('Contact arrivée');
  expect(ph[iContact - 1], 'L\'écoute de l\'ATIS d\'arrivée doit précéder le premier contact').toBe('Écoute ATIS');
  expect(S[ph.indexOf('Intégration')].attendu).toMatch(/, information \{ATIS\}\.$/);
});

test('Scénario « Intégration » sur un terrain contrôlé SANS ATIS, puis sur un terrain AFIS', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'exercices');
  const ads = await page.evaluate(() => {
    const L = (typeof AERODROMES !== 'undefined' ? AERODROMES : []).filter(a => a && /^LF/.test(a.icao || ''));
    const sansAtis = L.filter(a => a.ctrl && !atisFreqOf(a))[0];
    const afis = L.filter(a => !a.ctrl)[0];
    return { sansAtis: sansAtis && sansAtis.icao, afis: afis && afis.icao };
  });
  if (ads.sansAtis) {
    const e = (await jouerExact(page, 'integration', ads.sansAtis)).join(' | ');
    expect(e, 'Sans ATIS : piste et QNH collationnés avant le rappel vent arrière (p. 148)')
      .toMatch(/Piste [^,]+, QNH \d+, je rappelle vent arrière piste/);
  }
  if (ads.afis) {
    const e = (await jouerExact(page, 'integration', ads.afis)).join(' | ');
    expect(e, 'En AFIS : ni numéro dans le circuit ni « rappelez finale »').not.toMatch(/Numéro \d|Je rappelle finale/);
  }
  expect(erreurs).toEqual([]);
});

test('Navigation : la lettre de l\'ATIS d\'arrivée devient un mot-clé noté, une fois l\'ATIS écouté', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(400);
  const S = await etapes(page, 'LFBH', 'LFBD');
  const ph = S.map(s => s.ph);
  const iAtis = ph.lastIndexOf('Écoute ATIS'), iInteg = ph.indexOf('Intégration');
  test.skip(!(iAtis > 0 && iAtis < iInteg), 'LFBD sans ATIS dans les données');
  await page.evaluate(i => window.RT_TEST.allerA(i), iAtis);
  await page.waitForTimeout(200);
  const apres = await page.evaluate(() => window.RT_TEST.etapes());
  const mc = apres[iInteg].motsCles.filter(m => m.label === 'Lettre d\'information')[0];
  expect(mc && mc.n, 'La lettre de l\'ATIS d\'arrivée n\'est pas attendue').toBeGreaterThan(0);
  expect(apres[iAtis].atcBefore, 'Le message ATIS d\'arrivée est vide').toMatch(/^Ici .+, information /);
});

test('Tour de piste : toucher, remise de gaz, passage bas puis complet — chaque boucle se joue', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'exercices');
  const e = await jouerExact(page, 'tourdepiste', 'LFBD', ['touchgo', 'remise', 'passagebas', 'complet']);
  const t = e.join(' | ');
  expect(t).toMatch(/demande toucher\. \| Piste [^,]+, autorisé toucher/);
  expect(t).toMatch(/je remets les gaz\./);
  expect(t).toMatch(/demande passage bas\./);
  expect(t).toMatch(/\[choix complet\].*j'atterris/);
  // Après chaque boucle, le tour de piste repart avec « rappelez finale ».
  expect((t.match(/Je rappelle finale piste/g) || []).length).toBeGreaterThanOrEqual(4);
  expect(erreurs).toEqual([]);
});

test('Terrain AFIS : départ, intégration et circuit du manuel AFIS, sans aucune clairance', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'exercices');
  const afis = await page.evaluate(() => {
    const L = AERODROMES.filter(a => { const g = a && NAV_AD_GEO[a.icao]; return g && g.freq && g.freq.AFIS && !a.ctrl && /^LF[A-Z]{2}$/.test(a.icao); });
    return L[0] && L[0].icao;
  });
  test.skip(!afis, 'aucun terrain AFIS avec fréquence');
  const tout = [];
  for (const id of ['roulage', 'decollage', 'integration']) tout.push(...await jouerExact(page, id, afis));
  const t = tout.join(' | ');
  expect(t).toMatch(/Information, bonjour, /);
  expect(t).toMatch(/demandons paramètres pour le départ/);
  expect(t).toMatch(/roulons point d'attente piste/);
  expect(t).toMatch(/point d'attente piste [^,]+, prêt au départ/);
  expect(t).toMatch(/nous alignons piste/);
  expect(t).toMatch(/Décollons piste/);
  expect(t).toMatch(/rappellerons en vue de l'aérodrome/);
  expect(t).toMatch(/au parking, quittons la fréquence/);
  expect(t, 'Un agent AFIS ne délivre aucune clairance').not.toMatch(/j'atterris|je décolle|je roule et entre|Numéro \d|toucher/i);
  expect(erreurs).toEqual([]);
});
