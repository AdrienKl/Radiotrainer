/* =============================================================================
   Albatros VFR — LA VOIX GOOGLE DANS LES PARAMÈTRES, ET SA PAGE D'ADMINISTRATION
   -----------------------------------------------------------------------------
   Ajouté le 27/09/2026. Ce qu'on vérifie :
     · un compte gratuit voit Google VERROUILLÉ, et rien ne part vers voix-atc ;
     · un compte Premium voit la liste renvoyée par voix-atc, rangée par
       modèle, avec le genre — aucune voix n'est écrite dans la page ;
     · le choix est enregistré (voixMoteur / voixGoogle) et le message suivant
       part avec la nouvelle voix, sans rien relancer ;
     · l'essai passe par Google, et dit pourquoi quand Google refuse ;
     · la console d'administration affiche la consommation avec « Coût
       estimé », et ses sommes sont justes sur des cas écrits à la main.

   Ni Supabase ni Google ne sont appelés : voix-atc est intercepté.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

const FONCTION = '**/functions/v1/voix-atc';
const VOIX = [
  { nom: 'fr-FR-Chirp3-HD-Charon', genre: 'M' }, { nom: 'fr-FR-Chirp3-HD-Kore', genre: 'F' },
  { nom: 'fr-FR-Chirp-HD-D', genre: 'M' },
  { nom: 'fr-FR-Neural2-F', genre: 'F' }, { nom: 'fr-FR-Neural2-G', genre: 'M' },
  { nom: 'fr-FR-Studio-A', genre: 'F' },
  { nom: 'fr-FR-Wavenet-F', genre: 'F' }
];

function wav(secondes = 0.3) {
  const n = Math.round(8000 * secondes), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

/* voix-atc simulé : la liste des voix, et du son — ou un refus pour « dire ». */
async function fonction(page, { dire = { status: 200 } } = {}) {
  const requetes = [];
  await page.route(FONCTION, async route => {
    const corps = JSON.parse(route.request().postData() || '{}');
    requetes.push(corps);
    if (corps.action === 'voix')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ voix: VOIX }) });
    if (dire.status !== 200)
      return route.fulfill({ status: dire.status, contentType: 'application/json', body: JSON.stringify(dire.body || {}) });
    return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: wav() });
  });
  return requetes;
}

async function compte(page, { plan }) {
  await page.evaluate((plan) => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, pending: false, paused: false, getVoices: () => [], cancel() {}, pause() {}, resume() {},
      speak(u) { setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => u.onend && u.onend(), 10); }, 5); }
    } });
    RTAuth.utilisateur = () => ({ id: 'u1', email: 'pilote@exemple.fr' });
    RTAuth.profil = () => ({ id: 'u1', plan, pseudo: 'pilote' });
    RTAuth.client = () => ({ auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'jeton' } } }) } });
    window.dispatchEvent(new CustomEvent('rt:auth', { detail: { connecte: true } }));
  }, plan);
  await page.mouse.click(5, 5);   // le geste qui débloque l'audio
}
const reglages = page => page.evaluate(() => JSON.parse(localStorage.getItem('rt-settings') || '{}'));

test('compte gratuit : Google verrouillé, et rien ne part vers voix-atc', async ({ page }) => {
  await ouvrir(page);
  const requetes = await fonction(page);
  await entrer(page, 'parametres');
  await compte(page, { plan: 'free' });
  const bG = page.locator('[data-moteur="google"]');
  await expect(bG).toBeDisabled();
  await expect(bG).toContainText('Premium');
  await expect(page.locator('[data-moteur="navigateur"]')).toHaveClass(/active/);
  await expect(page.locator('#setVoixGoogleRow')).toBeHidden();
  await expect(page.locator('#setMoteurAide')).toContainText('réservée aux comptes Premium');
  await bG.click({ force: true });
  expect((await reglages(page)).voixMoteur).not.toBe('google');
  expect(requetes).toHaveLength(0);
});

test('Premium : la liste de voix-atc, rangée par modèle, avec le genre', async ({ page }) => {
  await ouvrir(page);
  const requetes = await fonction(page);
  await entrer(page, 'parametres');
  await compte(page, { plan: 'premium' });
  await page.locator('[data-moteur="google"]').click();
  await expect(page.locator('#setVoixGoogleRow')).toBeVisible();
  await expect(page.locator('#setVoixNavRow')).toBeHidden();
  await expect(page.locator('#setVoixGoogle optgroup')).toHaveCount(5);
  const groupes = await page.locator('#setVoixGoogle optgroup').evaluateAll(gs => gs.map(g => ({
    modele: g.label, voix: [...g.querySelectorAll('option')].map(o => o.textContent) })));
  expect(groupes).toEqual([
    { modele: 'Chirp 3 HD', voix: ['Charon — Masculine', 'Kore — Féminine'] },
    { modele: 'Chirp HD',   voix: ['Voix D — Masculine'] },
    { modele: 'Neural2',    voix: ['Voix F — Féminine', 'Voix G — Masculine'] },
    { modele: 'Studio',     voix: ['Voix A — Féminine'] },
    { modele: 'WaveNet',    voix: ['Voix F — Féminine'] }
  ]);
  expect(requetes.filter(r => r.action === 'voix')).toHaveLength(1);
  // Première voix présélectionnée ET enregistrée : le moteur ne reste jamais sans voix.
  expect(await reglages(page)).toMatchObject({ voixMoteur: 'google', voixGoogle: 'fr-FR-Chirp3-HD-Charon' });
});

test('changer de voix : enregistré, et le message SUIVANT part avec elle', async ({ page }) => {
  await ouvrir(page);
  const requetes = await fonction(page);
  await entrer(page, 'parametres');
  await compte(page, { plan: 'premium' });
  await page.locator('[data-moteur="google"]').click();
  await expect(page.locator('#setVoixGoogle optgroup')).toHaveCount(5);
  await page.locator('#setVoixGoogle').selectOption('fr-FR-Neural2-G');
  expect(await reglages(page)).toMatchObject({ voixMoteur: 'google', voixGoogle: 'fr-FR-Neural2-G' });
  await page.evaluate(() => Voix.parler('F-ABCD, rappelez vent arrière.', {}));
  await expect.poll(() => requetes.filter(r => r.action === 'dire').map(r => r.voix)).toEqual(['fr-FR-Neural2-G']);
});

test('revenir au navigateur : plus aucune requête', async ({ page }) => {
  await ouvrir(page);
  const requetes = await fonction(page);
  await entrer(page, 'parametres');
  await compte(page, { plan: 'premium' });
  await page.locator('[data-moteur="google"]').click();
  await expect(page.locator('#setVoixGoogle optgroup')).toHaveCount(5);
  await page.locator('[data-moteur="navigateur"]').click();
  expect((await reglages(page)).voixMoteur).toBe('navigateur');
  await expect(page.locator('#setVoixNavRow')).toBeVisible();
  await page.evaluate(() => Voix.parler('F-ABCD, rappelez vent arrière.', {}));
  await page.waitForTimeout(500);
  expect(requetes.filter(r => r.action === 'dire')).toHaveLength(0);
});

test('l\'essai passe par Google et le dit', async ({ page }) => {
  await ouvrir(page);
  const requetes = await fonction(page);
  await entrer(page, 'parametres');
  await compte(page, { plan: 'premium' });
  await page.locator('[data-moteur="google"]').click();
  await expect(page.locator('#setVoixGoogle optgroup')).toHaveCount(5);
  await page.locator('#setVoiceTest').click();
  await expect(page.locator('#setVoiceMsg')).toContainText('Voix Google : Charon — Masculine.');
  expect(requetes.filter(r => r.action === 'dire')).toHaveLength(1);
});

test('l\'essai refusé par la base dit POURQUOI, et la voix du navigateur prend le relais', async ({ page }) => {
  await ouvrir(page);
  await fonction(page, { dire: { status: 429, body: { erreur: 'quota', restant: 0 } } });
  await entrer(page, 'parametres');
  await compte(page, { plan: 'premium' });
  await page.locator('[data-moteur="google"]').click();
  await expect(page.locator('#setVoixGoogle optgroup')).toHaveCount(5);
  await page.locator('#setVoiceTest').click();
  await expect(page.locator('#setVoiceMsg')).toContainText('quota du jour atteint');
  await expect(page.locator('#setVoiceMsg')).toContainText('voix du navigateur');
});

test('la liste des voix indisponible : on le dit, rien ne casse', async ({ page }) => {
  await ouvrir(page);
  await page.route(FONCTION, r => r.fulfill({ status: 502, contentType: 'application/json', body: '{"erreur":"google"}' }));
  await entrer(page, 'parametres');
  await compte(page, { plan: 'premium' });
  await page.locator('[data-moteur="google"]').click();
  await expect(page.locator('#setVoixGoogleAide')).toContainText('Impossible de charger les voix Google');
});

/* ---- La page d'administration ------------------------------------------------ */

async function admin(page) {
  await ouvrir(page);
  await entrer(page, 'tableau');
  await page.evaluate(() => {
    RTAuth.estAdmin = () => true;
    RTAdmin.data.setSource('mock');
    location.hash = '#admin/voix';
  });
}

test('admin › Voix Google : la page s\'affiche, avec « Coût estimé » partout', async ({ page }) => {
  await admin(page);
  const p = page.locator('#page-admin');
  await expect(p.locator('h1')).toHaveText('Voix Google');
  await expect(p).toContainText('Coût estimé, pas une facture');
  await expect(p).toContainText('coût estimé aujourd\'hui');
  await expect(p.locator('th', { hasText: 'Coût estimé' }).first()).toBeVisible();
  await expect(p.locator('th', { hasText: 'Utilisateur' })).toBeVisible();
  await expect(p.locator('th', { hasText: 'Modèle' })).toBeVisible();
  await expect(p).toContainText('Tarif non publié');         // les voix Chirp HD de la démo
  await expect(p).toContainText('forte consommation');       // le gros consommateur de la démo
  await expect(p).not.toContainText('facture Google');       // jamais présenté comme une facture
});

test('admin › Voix Google : les sommes sont justes sur des cas écrits à la main', async ({ page }) => {
  await admin(page);
  await expect(page.locator('#page-admin h1')).toHaveText('Voix Google');
  const s = await page.evaluate(() => RTAdmin.voixStats({
    aujourdhui: '2026-10-03', premiumTotal: 4,
    rows: [
      // Camille : 990 000 Chirp 3 HD le 1er, 20 000 aujourd'hui → franchit la gratuité de 10 000
      { userId: 'a', userName: 'Camille', jour: '2026-10-01', voix: 'fr-FR-Chirp3-HD-Charon', modele: 'Chirp3-HD', caracteres: 990000, requetes: 9000 },
      { userId: 'a', userName: 'Camille', jour: '2026-10-03', voix: 'fr-FR-Chirp3-HD-Charon', modele: 'Chirp3-HD', caracteres: 20000,  requetes: 200 },
      // Léo : Chirp HD (non publié) aujourd'hui, et Neural2 le mois DERNIER (dans les 7 jours, pas dans le mois)
      { userId: 'b', userName: 'Léo', jour: '2026-10-03', voix: 'fr-FR-Chirp-HD-D', modele: 'Chirp-HD', caracteres: 500, requetes: 5 },
      { userId: 'b', userName: 'Léo', jour: '2026-09-28', voix: 'fr-FR-Neural2-G', modele: 'Neural2', caracteres: 3000, requetes: 30 }
    ]
  }));
  expect(s.jour).toEqual({ car: 20500, req: 205 });
  expect(s.mois).toEqual({ car: 1010500, req: 9205 });
  expect(s.actifsMois).toBe(2);
  expect(s.coutJour).toEqual({ total: 0.3, inconnu: true });      // 10 000 × 30 $ / M ; Chirp HD non chiffré
  expect(s.coutMois).toEqual({ total: 0.3, inconnu: true });
  expect(s.nonPublies).toBe(500);
  const camille = s.utilisateurs.find(u => u.id === 'a'), leo = s.utilisateurs.find(u => u.id === 'b');
  expect(camille).toMatchObject({ jour: 20000, sept: 1010000, mois: 1010000, requetes: 9200,
                                  cout: { total: 30.3, inconnu: false } });   // brut, sans gratuité
  expect(leo).toMatchObject({ jour: 500, sept: 3500, mois: 500, cout: { total: 0, inconnu: true } });
  expect(s.utilisateurs[0].id).toBe('a');                            // trié par consommation du mois
  expect(s.modeles.map(m => [m.libelle, m.car, m.publie])).toEqual([
    ['Chirp 3 HD', 1010000, true], ['Chirp HD', 500, false]
  ]);
});

test('admin › Voix Google : refusée sans le rôle', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');
  await page.evaluate(() => { location.hash = '#admin/voix'; });
  await expect(page.locator('#page-admin')).toBeHidden();
});
