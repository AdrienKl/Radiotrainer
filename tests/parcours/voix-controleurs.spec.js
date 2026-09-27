/* =============================================================================
   Albatros VFR — UNE VOIX PAR CONTRÔLEUR
   -----------------------------------------------------------------------------
   Ajouté le 27/09/2026 (5-voix.js › « une voix par contrôleur »). On vérifie :
     · la première station garde la voix choisie, la suivante en prend une
       autre du MÊME modèle, de l'autre genre ; revenir à la première rend
       SA voix ;
     · une voix désactivée par l'administration n'est jamais attribuée ;
     · l'ATIS a sa propre voix ;
     · même principe avec les voix du navigateur.
   voix-atc et speechSynthesis sont simulés.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

const VOIX = [
  { nom: 'fr-FR-Chirp3-HD-Charon', genre: 'M' }, { nom: 'fr-FR-Chirp3-HD-Kore', genre: 'F' },
  { nom: 'fr-FR-Chirp3-HD-Aoede', genre: 'F' }, { nom: 'fr-FR-Chirp3-HD-Puck', genre: 'M' },
  { nom: 'fr-FR-Studio-A', genre: 'F' }
];
function wav() {
  const n = 800, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

async function premium(page, { coupees = [] } = {}) {
  await ouvrir(page);
  const dites = [];
  await page.route('**/functions/v1/voix-atc', route => {
    const c = JSON.parse(route.request().postData() || '{}');
    if (c.action === 'voix') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ voix: VOIX }) });
    dites.push(c.voix);
    return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: wav() });
  });
  await entrer(page, 'tableau');
  await page.evaluate((coupees) => {
    localStorage.setItem('rt-settings', JSON.stringify({ voixMoteur: 'google', voixGoogle: 'fr-FR-Chirp3-HD-Charon' }));
    RTAuth.utilisateur = () => ({ id: 'u1' });
    RTAuth.profil = () => ({ id: 'u1', plan: 'premium' });
    RTAuth.client = () => ({
      auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'j' } } }) },
      from: () => ({ select: () => Promise.resolve({ data: coupees.map(v => ({ voix: v, active: false })), error: null }) })
    });
  }, coupees);
  await page.mouse.click(5, 5);
  return dites;
}
// Fait parler une station et attend la fin du message.
async function dire(page, station, opts = {}) {
  await page.evaluate(({ station, opts }) => new Promise(ok => {
    if (!opts.atis) Voix.station(station);
    Voix.parler('Bonjour ' + station, Object.assign(opts.atis ? { station } : { controleur: true }, { onFin: ok }));
  }), { station, opts });
}

test('Google : une voix par station, du même modèle, et chacune garde la sienne', async ({ page }) => {
  const dites = await premium(page);
  await dire(page, 'Lyon Tour');                 // la liste des voix se charge ici
  await page.waitForTimeout(200);
  await dire(page, 'Lyon Sol');
  await dire(page, 'Lyon Info');
  await dire(page, 'Lyon Tour');
  await dire(page, 'Lyon ATIS', { atis: true });
  expect(dites).toEqual([
    'fr-FR-Chirp3-HD-Charon',   // la première station : la voix choisie
    'fr-FR-Chirp3-HD-Kore',     // la suivante : même modèle, autre genre
    'fr-FR-Chirp3-HD-Puck',
    // la Tour qui revient : SA voix, servie par le cache audio — aucune requête
    'fr-FR-Chirp3-HD-Aoede'     // l'ATIS a la sienne
  ]);
  expect(dites).not.toContain('fr-FR-Studio-A');   // jamais un autre modèle (autre prix)
});

test('Google : une voix désactivée par l\'administration n\'est jamais attribuée', async ({ page }) => {
  const dites = await premium(page, { coupees: ['fr-FR-Chirp3-HD-Kore'] });
  await dire(page, 'Tour');
  await page.waitForTimeout(200);
  await dire(page, 'Sol');
  await dire(page, 'Info');
  expect(dites).toEqual(['fr-FR-Chirp3-HD-Charon', 'fr-FR-Chirp3-HD-Aoede', 'fr-FR-Chirp3-HD-Puck']);
});

test('navigateur : une autre voix française locale par station', async ({ page }) => {
  await page.addInitScript(() => {
    const voix = [
      { name: 'Thomas', lang: 'fr-FR', localService: true }, { name: 'Google français', lang: 'fr-FR', localService: false },
      { name: 'Audrey', lang: 'fr-FR', localService: true }, { name: 'Amélie', lang: 'fr-CA', localService: true },
      { name: 'Grandma (French (France))', lang: 'fr-FR', localService: true }
    ];
    window.__dites = [];
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, pending: false, paused: false, getVoices: () => voix, cancel() {}, pause() {}, resume() {},
      speak(u) {
        if (u.volume !== 0) window.__dites.push([u.voice && u.voice.name, u.pitch]);
        setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => u.onend && u.onend(), 5); }, 5);
      }
    } });
  });
  await ouvrir(page);
  for (const s of ['Tour', 'Sol', 'Info', 'Tour']) await dire(page, s);
  expect(await page.evaluate(() => window.__dites)).toEqual([
    ['Thomas', 1], ['Audrey', 1],   // fr-FR locales ; ni la voix distante, ni « Grandma »
    ['Thomas', 0.86],               // plus de voix : même voix, autre hauteur
    ['Thomas', 1]                   // la Tour retrouve la sienne
  ]);
});
