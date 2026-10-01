/* =============================================================================
   Albatros VFR — LA PHASE DE LANCEMENT, ET LES PARAMÈTRES EN ONGLETS
   -----------------------------------------------------------------------------
   Demandes du développeur, 29/09/2026 :
     · gratuit pendant le lancement, et la vitrine le dit ;
     · 3 vols et 5 scénarios par jour avec la voix Google, puis la voix du
       navigateur (un message le dit, UNE fois), puis limite à 10 / 15 ;
     · les QCM ne comptent pas ; l'administrateur n'a pas de limite ;
     · les compteurs se lisent sur le tableau de bord ;
     · Paramètres en onglets, bruit radio réglable, bips du micro, taille du
       texte.
   La base (sql/009) borne la voix Google offerte : c'est vérifié hors ligne
   par tests/verifier-migrations.mjs § 14, pas ici.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer, lireCle } from './_aide.js';

async function compteurDuJour(page, n, s) {
  await page.evaluate(([n, s]) => {
    const d = new Date(), j = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    localStorage.setItem('rt-quota', JSON.stringify({ date: j, n, s }));
  }, [n, s]);
}
async function profil(page, p) {
  await page.evaluate((p) => {
    RTAuth.utilisateur = () => ({ id: 'u1', email: 'pilote@exemple.fr' });
    RTAuth.profil = () => Object.assign({ id: 'u1', pseudo: 'pilote' }, p);
    window.dispatchEvent(new CustomEvent('rt:auth', { detail: { connecte: true } }));
  }, p);
}
const indexScenario = (page, quiz) => page.evaluate(q => SCENARIOS.findIndex(sc => !!sc.quiz === q && !sc.emergency), quiz);
const lancer = (page, i) => page.evaluate(i => window.rtRelancerScenario(i, 'LFBD'), i);

test('6e scénario : le message de bascule, une fois, puis le scénario part au clic', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'exercices');
  await profil(page, { plan: 'free', role: 'user' });
  await compteurDuJour(page, 0, 5);
  const i = await indexScenario(page, false);

  await lancer(page, i);
  const modale = page.locator('#lancementModal');
  await expect(modale).toBeVisible();
  await expect(modale).toContainText('Voix réaliste du contrôleur terminée pour aujourd');
  await expect(modale).toContainText('voix par défaut de votre navigateur');
  await expect(page.locator('body')).not.toHaveClass(/in-session/);   // pas encore parti
  await page.locator('#lancementOk').click();
  await expect(modale).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/in-session/);
  expect((await lireCle(page, 'rt-quota')).s).toBe(6);

  // Le suivant part sans message : il a déjà été dit aujourd'hui.
  await lancer(page, i);
  await expect(modale).toBeHidden();
  expect((await lireCle(page, 'rt-quota')).s).toBe(7);
});

test('limite du jour : le scénario ne part pas ; un QCM, lui, part et ne compte pas', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'exercices');
  await profil(page, { plan: 'free', role: 'user' });
  await compteurDuJour(page, 0, 15);

  await lancer(page, await indexScenario(page, false));
  await expect(page.locator('#lancementModal')).toContainText('Limite du jour atteinte');
  await expect(page.locator('#lancementModal')).toContainText('15 scénarios par jour');
  await page.locator('#lancementOk').click();
  await expect(page.locator('body')).not.toHaveClass(/in-session/);

  await lancer(page, await indexScenario(page, true));
  await expect(page.locator('#lancementModal')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/in-session/);
  expect((await lireCle(page, 'rt-quota')).s).toBe(15);
});

test('administrateur : ni compteur, ni message, ni limite', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'exercices');
  await profil(page, { plan: 'free', role: 'admin' });
  await compteurDuJour(page, 10, 15);
  await lancer(page, await indexScenario(page, false));
  await expect(page.locator('#lancementModal')).toHaveCount(0);
  await expect(page.locator('body')).toHaveClass(/in-session/);
  expect((await lireCle(page, 'rt-quota')).s).toBe(15);
  expect(await page.evaluate(() => RTLancement.googleOffert() || RTLancement.exempt())).toBe(true);
});

test('le tableau de bord dit les compteurs du jour et la phase de lancement', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');
  await profil(page, { plan: 'free', role: 'user' });
  await compteurDuJour(page, 2, 6);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('rt:lancement')));
  const carte = page.locator('#tbQuota');
  await expect(page.locator('.tb-lancement')).toContainText('Phase de lancement');
  await expect(carte).toContainText('Vols');
  await expect(carte).toContainText('2 / 10');
  await expect(carte).toContainText('1 avec la voix réaliste du contrôleur');
  await expect(carte).toContainText('6 / 15');
  await expect(carte).toContainText('9 avec la voix du navigateur');
  await expect(page.locator('#tbQuotaNote')).toContainText('QCM ne comptent pas');
});

/* La section Offre de l'accueil a été RETIRÉE le 01/10/2026 (le développeur
   repart de zéro sous le hero). La phase de lancement reste dite sur le
   tableau de bord (test ci-dessus). Ce qui reste de l'accueil : le hero, ses
   chiffres recalculés depuis les données, les avis et les questions. */
test('accueil : hero, chiffres recalculés, questions — et plus de section Offre', async ({ page }) => {
  await ouvrir(page);
  await expect(page.locator('#page-accueil .acc-hero')).toBeVisible();
  await expect(page.locator('#page-accueil .offre')).toHaveCount(0);
  await expect(page.locator('#page-accueil .acc-qa details')).toHaveCount(6);
  const chiffres = await page.evaluate(() => ({
    aerodromes: document.querySelector('[data-chiffre="aerodromes"]').textContent,
    attendu: String(AERODROMES.length),
    scenarios: document.querySelector('[data-chiffre="scenarios"]').textContent,
    attenduS: String(SCENARIOS.length),
    imprevus: document.querySelector('[data-chiffre="imprevus"]').textContent,
    attenduI: String(ALEAS_SCEN.length)
  }));
  expect(chiffres.aerodromes).toBe(chiffres.attendu);
  expect(chiffres.scenarios).toBe(chiffres.attenduS);
  expect(chiffres.imprevus).toBe(chiffres.attenduI);
});

/* La section « Les pannes » (01/10/2026). L'exemple radio reprend MOT POUR MOT
   les phrases du scénario Urgence (Manuel DSNA p. 238 et p. 34-35) : si l'un
   change, l'autre doit suivre — d'où la comparaison avec SCENARIOS. Et la
   démonstration ne doit pas élargir la page sur téléphone. */
test('accueil : la section des pannes et son exemple tiré du manuel', async ({ page }) => {
  await ouvrir(page);
  const demo = page.locator('#page-accueil .acc-demo');
  await expect(page.locator('#page-accueil .acc-pannes')).toContainText('À vous de gérer la situation');
  await expect(page.locator('#page-accueil .acc-pannes')).toContainText('Chaque panne est une nouvelle situation à gérer.');
  await expect(demo).toContainText('Démonstration');
  await expect(demo).toContainText('p.\u00a0238');
  const attendus = await page.evaluate(() => {
    const u = SCENARIOS.find(s => s.id === 'urgence').tours[0].options.find(o => o.key === 'mayday').tours;
    return [u[0].attendu, u[1].atc, u[1].attendu];
  });
  expect(attendus[0]).toContain('MAYDAY MAYDAY MAYDAY, {ADRM} {STN}, {CALL}, {CAUSE}, je me pose, verticale terrain, {ALT} pieds.');
  expect(attendus[1]).toBe('{CALL}, Mayday Roger, transpondeur 7700.');
  expect(attendus[2]).toBe('Transpondeur 7700, {CALL}.');
  await expect(demo).toContainText('F-BYFO, Mayday Roger, transpondeur 7700.');
  await expect(demo).toContainText('Transpondeur 7700, F-BYFO.');
  const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(deborde).toBe(false);
});

test('Paramètres : un onglet à la fois, lu et écrit dans l\'adresse', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'parametres/voix');
  await expect(page.locator('#setPanel-voix')).toBeVisible();
  await expect(page.locator('#setPanel-compte')).toBeHidden();
  await expect(page.locator('#setTab-voix')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#setTab-apparence').click();
  await expect(page.locator('#setPanel-apparence')).toBeVisible();
  await expect(page.locator('#setPanel-voix')).toBeHidden();
  expect(await page.evaluate(() => location.hash)).toBe('#parametres/apparence');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#setPanel-donnees')).toBeVisible();
  // Sans onglet dans l'adresse : Compte.
  await entrer(page, 'tableau');
  await entrer(page, 'parametres');
  await expect(page.locator('#setPanel-compte')).toBeVisible();
});

test('bruit radio en quatre niveaux, bips du micro, taille du texte', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'parametres/voix');
  const reglages = () => page.evaluate(() => rtSettings());
  await expect(page.locator('[data-bruit="moyen"]')).toHaveClass(/active/);      // absent = l'ancien niveau
  await page.locator('[data-bruit="fort"]').click();
  expect(await reglages()).toMatchObject({ noise: true, bruit: 'fort' });
  expect(await page.evaluate(() => niveauBruitRadio())).toBe(0.07);
  await page.locator('[data-bruit="aucun"]').click();
  expect((await reglages()).noise).toBe(false);
  expect(await page.evaluate(() => document.getElementById('noiseToggle').checked)).toBe(false);

  await expect(page.locator('#setBips')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#setBips').click();
  expect((await reglages()).bipsMicro).toBe(false);

  await page.locator('#setTab-apparence').click();
  await page.locator('[data-texte="grand"]').click();
  await expect(page.locator('html')).toHaveClass(/txt-grand/);
  expect((await reglages()).texte).toBe('grand');
  await page.locator('[data-texte="normal"]').click();
  await expect(page.locator('html')).not.toHaveClass(/txt-grand/);
});
