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

async function compte(page, { plan, catalogue = null }) {
  await page.evaluate(([plan, catalogue]) => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, pending: false, paused: false, getVoices: () => [], cancel() {}, pause() {}, resume() {},
      speak(u) { setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => u.onend && u.onend(), 10); }, 5); }
    } });
    RTAuth.utilisateur = () => ({ id: 'u1', email: 'pilote@exemple.fr' });
    RTAuth.profil = () => ({ id: 'u1', plan, pseudo: 'pilote' });
    const auth = { getSession: () => Promise.resolve({ data: { session: { access_token: 'jeton' } } }) };
    /* Le catalogue de l'administration est posé AVANT l'événement : Google
       étant le moteur par défaut (29/09/2026), la liste se charge dès la
       connexion, et un catalogue posé après arriverait trop tard. */
    RTAuth.client = catalogue
      ? () => ({ auth, from: (t) => ({ select: () =>
          Promise.resolve(t === 'voix_catalogue' ? { data: catalogue, error: null } : { data: [], error: null }) }) })
      : () => ({ auth });
    window.dispatchEvent(new CustomEvent('rt:auth', { detail: { connecte: true } }));
  }, [plan, catalogue]);
  await page.mouse.click(5, 5);   // le geste qui débloque l'audio
}
const reglages = page => page.evaluate(() => JSON.parse(localStorage.getItem('rt-settings') || '{}'));

/* Phase de lancement (29/09/2026, assets/modules/lancement.js) : un compte
   gratuit a la voix Google offerte — 3 vols et 5 scénarios par jour. Le
   bouton est ouvert, dit « Offerte », et l'aide dit ce qu'il reste. */
test('compte gratuit, phase de lancement : Google offert, et ce qu\'il reste aujourd\'hui est dit', async ({ page }) => {
  await ouvrir(page);
  await fonction(page);
  await entrer(page, 'parametres/voix');
  await page.evaluate(() => localStorage.removeItem('rt-quota'));
  await compte(page, { plan: 'free' });
  const bG = page.locator('[data-moteur="google"]');
  await expect(bG).toBeEnabled();
  await expect(bG).toContainText('Offerte');
  await expect(page.locator('[data-moteur="google"]')).toHaveClass(/active/);   // Google par défaut
  await expect(page.locator('#setMoteurAide')).toContainText('phase de lancement');
  await expect(page.locator('#setMoteurAide')).toContainText('il vous reste 3 vols et 5 scénarios');
});

test('hors connexion : Google verrouillé, rien ne part vers voix-atc', async ({ page }) => {
  await ouvrir(page);
  const requetes = await fonction(page);
  await entrer(page, 'parametres/voix');
  await page.evaluate(() => {
    RTAuth.utilisateur = () => null; RTAuth.profil = () => null;
    window.dispatchEvent(new CustomEvent('rt:auth', { detail: { connecte: false } }));
  });
  const bG = page.locator('[data-moteur="google"]');
  await expect(bG).toBeDisabled();
  await expect(bG).toContainText('Premium');
  await expect(page.locator('[data-moteur="navigateur"]')).toHaveClass(/active/);
  await expect(page.locator('#setVoixGoogleRow')).toBeHidden();
  await bG.click({ force: true });
  expect((await reglages(page)).voixMoteur).not.toBe('google');
  expect(requetes).toHaveLength(0);
});

test('Premium : la liste de voix-atc, rangée par modèle, avec le genre', async ({ page }) => {
  await ouvrir(page);
  const requetes = await fonction(page);
  await entrer(page, 'parametres/voix');
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
  await entrer(page, 'parametres/voix');
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
  await entrer(page, 'parametres/voix');
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
  await entrer(page, 'parametres/voix');
  await compte(page, { plan: 'premium' });
  await page.locator('[data-moteur="google"]').click();
  await expect(page.locator('#setVoixGoogle optgroup')).toHaveCount(5);
  await page.locator('#setVoiceTest').click();
  await expect(page.locator('#setVoiceMsg')).toContainText('Voix réaliste : Chirp 3 HD · Charon — Masculine.');
  expect(requetes.filter(r => r.action === 'dire')).toHaveLength(1);
});

test('l\'essai refusé par la base dit POURQUOI, et la voix du navigateur prend le relais', async ({ page }) => {
  await ouvrir(page);
  await fonction(page, { dire: { status: 429, body: { erreur: 'quota', restant: 0 } } });
  await entrer(page, 'parametres/voix');
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
  await entrer(page, 'parametres/voix');
  await compte(page, { plan: 'premium' });
  await page.locator('[data-moteur="google"]').click();
  await expect(page.locator('#setVoixGoogleAide')).toContainText('Impossible de charger les voix réalistes');
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
  // Le brut, sans gratuité : ce qu'on affiche, marqué d'une astérisque s'il dépasse ce qu'on paie.
  expect(s.brutJour).toEqual({ total: 0.6, inconnu: true });        // 20 000 × 30 $ / M
  expect(s.brutMois).toEqual({ total: 30.3, inconnu: true });       // 1 010 000 × 30 $ / M
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

/* ---- sql/007 : les voix proposées, la voix par défaut, l'écran des scénarios -- */

async function compteAvecCatalogue(page, catalogue) {
  await compte(page, { plan: 'premium', catalogue });
}

test('une voix désactivée par l\'administration n\'est pas proposée ; la voix par défaut est présélectionnée', async ({ page }) => {
  await ouvrir(page);
  await fonction(page);
  await entrer(page, 'parametres/voix');
  await compteAvecCatalogue(page, [
    { voix: 'fr-FR-Studio-A', active: false, par_defaut: false },
    { voix: 'fr-FR-Neural2-G', active: true, par_defaut: true }
  ]);
  await page.locator('[data-moteur="google"]').click();
  await expect(page.locator('#setVoixGoogle optgroup')).toHaveCount(4);           // plus de groupe Studio
  await expect(page.locator('#setVoixGoogle option[value="fr-FR-Studio-A"]')).toHaveCount(0);
  expect(await reglages(page)).toMatchObject({ voixGoogle: 'fr-FR-Neural2-G' });
  await expect(page.locator('#setVoixGoogle')).toHaveValue('fr-FR-Neural2-G');
});

test('voix refusée par la base (désactivée) : l\'essai le dit', async ({ page }) => {
  await ouvrir(page);
  await fonction(page, { dire: { status: 403, body: { erreur: 'voix_desactivee' } } });
  await entrer(page, 'parametres/voix');
  await compte(page, { plan: 'premium' });
  await page.locator('[data-moteur="google"]').click();
  await expect(page.locator('#setVoixGoogle optgroup')).toHaveCount(5);
  await page.locator('#setVoiceTest').click();
  await expect(page.locator('#setVoiceMsg')).toContainText("voix retirée par l'administration");
});

test('Google actif : l\'écran des scénarios ne propose plus les voix du navigateur, il dit la voix Google', async ({ page }) => {
  await ouvrir(page);
  await fonction(page);
  await entrer(page, 'parametres/voix');
  await compte(page, { plan: 'premium' });
  await page.locator('[data-moteur="google"]').click();
  await expect(page.locator('#setVoixGoogle optgroup')).toHaveCount(5);
  await page.locator('#setVoixGoogle').selectOption('fr-FR-Chirp3-HD-Kore');
  const boite = page.locator('#voiceSelect').locator('..');
  await expect(page.locator('#voiceSelect')).toBeHidden();
  await expect(boite.locator('.voix-google-note')).toHaveText('Voix réaliste du contrôleur : Chirp 3 HD · Kore — Féminine — à changer dans les Paramètres');
  await page.locator('[data-moteur="navigateur"]').click();
  await expect(boite.locator('.voix-google-note')).toHaveCount(0);
  await expect(page.locator('#voiceSelect')).not.toHaveCSS('display', 'none');
});

/* ---- Admin : les trois onglets (source fictive) ------------------------------ */

async function onglet(page, nom) {
  await page.locator('#page-admin [role="tab"]', { hasText: nom }).click();
}
async function confirmer(page) {
  await expect(page.locator('#confirmModal')).toBeVisible();
  await page.locator('#confirmYes').click();
}

test('admin › Voix proposées : désactiver, choisir la voix par défaut, et le journal le garde', async ({ page }) => {
  await admin(page);
  await onglet(page, 'Voix proposées');
  const p = page.locator('#page-admin');
  const ligne = (nom, modele) => { const l = p.locator('tr', { hasText: nom }); return modele ? l.filter({ hasText: modele }) : l; };
  await expect(ligne('Charon')).toContainText('par défaut');
  await expect(ligne('Voix A — Féminine')).toContainText('désactivée');
  await expect(ligne('Voix A — Féminine').getByRole('button', { name: 'Écouter' })).toBeDisabled();
  await expect(p).toContainText('Tarif non publié');                 // Chirp HD
  await ligne('Kore').getByRole('button', { name: 'Désactiver' }).click();
  await expect(ligne('Kore')).toContainText('désactivée');
  // Deux « Voix G » (Neural2, WaveNet) : c'est la colonne Modèle qui les distingue.
  await ligne('Voix G — Masculine', 'Neural2').getByRole('button', { name: 'Par défaut' }).click();
  await expect(ligne('Voix G — Masculine', 'Neural2')).toContainText('par défaut');
  await expect(ligne('Charon')).not.toContainText('par défaut');     // une seule voix par défaut
  await onglet(page, 'Quotas et comptes');
  await expect(p.locator('tr', { hasText: 'Kore' })).toContainText('désactivée');
  await expect(p.locator('tr', { hasText: 'Neural2 · Voix G' })).toContainText('par défaut');
});

test('admin › Quotas et comptes : plafond borné et confirmé, passage free ⇄ premium', async ({ page }) => {
  await admin(page);
  await onglet(page, 'Quotas et comptes');
  const p = page.locator('#page-admin');
  const champ = p.locator('input[type="number"]');
  await expect(champ).toHaveValue('100000');
  await champ.fill('500');
  await p.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('#confirmModal')).toBeHidden();           // hors bornes : pas même proposé
  await champ.fill('50000');
  await p.getByRole('button', { name: 'Enregistrer' }).click();
  await confirmer(page);
  await expect(p.locator('input[type="number"]')).toHaveValue('50000');
  await expect(p.locator('tr', { hasText: 'Plafond' })).toContainText('100 000 → 50 000');

  // Trois comptes Premium dans la démo, plus l'admin ; Nora est gratuite.
  await expect(p.locator('tr', { hasText: 'Nora' })).toHaveCount(0);
  await p.locator('input[type="search"]').fill('nora');
  await expect(p.locator('tr', { hasText: 'Nora' })).toContainText('Gratuit');
  await p.locator('tr', { hasText: 'Nora' }).getByRole('button', { name: 'Passer en Premium' }).click();
  await confirmer(page);
  await p.locator('input[type="search"]').fill('');
  await expect(p.locator('tr', { hasText: 'Nora (démo)' }).first()).toContainText('Premium');
  await expect(p.locator('tr', { hasText: 'free → premium' })).toHaveCount(1);
});

test('admin › Consommation : sous la gratuité, le coût estimé s\'affiche quand même, avec son astérisque', async ({ page }) => {
  await admin(page);
  await page.evaluate(() => {
    RTAdmin.data.voix = () => Promise.resolve({ aujourdhui: '2026-09-27', premiumTotal: 1, rows: [
      { userId: 'a', userName: 'Adrien', jour: '2026-09-27', voix: 'fr-FR-Neural2-G', modele: 'Neural2', caracteres: 2154, requetes: 7 } ] });
    location.hash = '#admin'; location.hash = '#admin/voix';
  });
  const p = page.locator('#page-admin');
  const tuile = p.locator('.adm-stat', { hasText: 'coût estimé aujourd\'hui' });
  await expect(tuile).toContainText('0,0345');                       // 2 154 × 16 $ / M, brut
  await expect(tuile.locator('.adm-asterisque')).toHaveText('*');
  await expect(tuile).toContainText('couvert par les crédits gratuits de Google — à payer : 0,00');
  await expect(p).toContainText('* Couvert par les crédits gratuits');
});

test('admin › Consommation : le graphique jour par jour est là', async ({ page }) => {
  await admin(page);
  await expect(page.locator('#page-admin')).toContainText('Jour par jour');
  await expect(page.locator('#page-admin .adm-bar').first()).toBeVisible();
});

/* Panne du 27/09/2026 : « Écouter » ne faisait rien pour un administrateur
   resté sur la voix du navigateur — sa sortie audio naissait hors du clic. */
test('admin › Voix proposées : « Écouter » passe par Google, même réglé sur Navigateur', async ({ page }) => {
  await admin(page);
  const requetes = await fonction(page);
  await compte(page, { plan: 'premium' });
  await page.evaluate(() => localStorage.setItem('rt-settings', JSON.stringify({ voixMoteur: 'navigateur' })));
  await onglet(page, 'Voix proposées');
  const b = page.locator('#page-admin tr', { hasText: 'Kore' }).getByRole('button', { name: 'Écouter' });
  await b.click();
  await expect.poll(() => requetes.filter(r => r.action === 'dire').map(r => r.voix)).toEqual(['fr-FR-Chirp3-HD-Kore']);
  await expect.poll(() => page.evaluate(() => Voix.etatGoogle().dernier)).toBe('google');
  await expect(b).toBeEnabled();                 // rendu une fois la phrase dite
});

test('admin › « Écouter » refusé : la cause est dite en clair', async ({ page }) => {
  await admin(page);
  await fonction(page, { dire: { status: 429, body: { erreur: 'quota' } } });
  await compte(page, { plan: 'premium' });
  await page.evaluate(() => { window.__toasts = []; window.showToast = t => window.__toasts.push(t); });
  await onglet(page, 'Voix proposées');
  await page.locator('#page-admin tr', { hasText: 'Kore' }).getByRole('button', { name: 'Écouter' }).click();
  await expect.poll(() => page.evaluate(() => window.__toasts.join(' | '))).toContain('quota du jour');
});

/* Prononciation (30/09/2026) : l'administrateur écoute chaque lettre de
   l'alphabet aéro, les chiffres et les mots de l'aviation, voix par voix — et
   ce qui part vers Google est la graphie réécrite, celle qu'entend l'élève. */
test('admin › Prononciation : les 26 lettres, la graphie envoyée, et le résultat reste affiché', async ({ page }) => {
  await admin(page);
  const requetes = await fonction(page);
  await compte(page, { plan: 'premium' });
  await onglet(page, 'Prononciation');
  const p = page.locator('#page-admin');
  await expect(p.locator('.adm-pron-mot')).not.toHaveCount(0);
  for (const m of ['Alpha', 'Juliett', 'Whiskey', 'X-ray', 'Zulu'])
    await expect(p.locator(`.adm-pron-mot[data-mot="${m}"]`)).toBeVisible();
  await expect(p.locator('.adm-pron-mot[data-mot="Juliett"]')).toContainText('djouliètt');
  await expect(p.locator('.adm-pron-voix')).toHaveValue('fr-FR-Chirp3-HD-Charon');   // la voix par défaut
  await p.locator('.adm-pron-mot[data-mot="Whiskey"]').click();
  await expect.poll(() => requetes.filter(r => r.action === 'dire').map(r => [r.voix, r.texte]))
    .toEqual([['fr-FR-Chirp3-HD-Charon', 'ouiski']]);
  await expect(p.locator('.adm-pron-etat')).toContainText('Dit par Google');
  // Les nombres passent par la lecture radio, comme en exercice.
  await expect(p.locator('.adm-pron-mot[data-mot="QNH 1013"]')).toContainText('unité zéro unité trois');
});

test('admin › Prononciation : un refus est écrit en clair, et reste à l\'écran', async ({ page }) => {
  await admin(page);
  await fonction(page, { dire: { status: 429, body: { erreur: 'quota' } } });
  await compte(page, { plan: 'premium' });
  await onglet(page, 'Prononciation');
  await page.locator('#page-admin .adm-pron-mot[data-mot="Mike"]').click();
  await expect(page.locator('#page-admin .adm-pron-etat')).toContainText('quota du jour');
});

/* La table s'applique DANS le moteur : l'essai des Paramètres et l'écoute de
   l'administration disaient « Whiskey » à la française jusqu'au 30/09/2026. */
test('toute parole passe par la prononciation OACI, sauf demande « brut »', async ({ page }) => {
  await admin(page);
  const requetes = await fonction(page);
  await compte(page, { plan: 'premium' });
  await page.evaluate(() => Voix.parler('Juliett Whiskey Echo', { voixGoogle: 'fr-FR-Neural2-F' }));
  await expect.poll(() => requetes.filter(r => r.action === 'dire').map(r => r.texte)).toEqual(['djouliètt ouiski èkko']);
  await page.evaluate(() => Voix.parler('Juliett Whiskey', { voixGoogle: 'fr-FR-Neural2-F', brut: true }));
  await expect.poll(() => requetes.filter(r => r.action === 'dire').map(r => r.texte).slice(1)).toEqual(['Juliett Whiskey']);
});

test('admin › Prononciation : l\'atelier écoute une graphie, l\'enregistre pour tout le monde, puis la retire', async ({ page }) => {
  await admin(page);
  const requetes = await fonction(page);
  await compte(page, { plan: 'premium' });
  await onglet(page, 'Prononciation');
  const p = page.locator('#page-admin');
  await p.locator('.adm-pron-mot[data-mot="Mike"]').click();
  await expect(p.locator('.adm-pron-atelier')).toBeVisible();
  await expect(p.locator('.adm-pron-atelier')).toContainText('graphie du code');
  await p.locator('.adm-pron-graphie').fill('maïque');
  await p.getByRole('button', { name: 'Écouter cette graphie' }).click();
  await expect.poll(() => requetes.filter(r => r.action === 'dire').map(r => r.texte)).toContain('maïque');
  await p.locator('.adm-pron-enreg').click();
  // Redessiné : le mot porte sa nouvelle graphie, et le moteur l'applique partout.
  await expect(p.locator('.adm-pron-mot[data-mot="Mike"]')).toContainText('maïque');
  expect(await page.evaluate(() => prononciationRadio('Mike Echo'))).toBe('maïque èkko');
  await p.locator('.adm-pron-mot[data-mot="Mike"]').click();
  await expect(p.locator('.adm-pron-atelier')).toContainText('graphie réglée ici');
  await p.locator('.adm-pron-retirer').click();
  await expect(p.locator('.adm-pron-mot[data-mot="Mike"] small')).toHaveCount(0);
  expect(await page.evaluate(() => prononciationRadio('Mike'))).toBe('Mike');
});

test('admin › Prononciation : une graphie qui contient le mot est refusée avant tout envoi', async ({ page }) => {
  await admin(page);
  await fonction(page);
  await compte(page, { plan: 'premium' });
  await onglet(page, 'Prononciation');
  const p = page.locator('#page-admin');
  await p.locator('.adm-pron-mot[data-mot="Pan Pan"]').click();
  await p.locator('.adm-pron-graphie').fill('pan pan pan');
  await p.locator('.adm-pron-enreg').click();
  await expect(p.locator('.adm-pron-atelier-msg')).toContainText('ne doit pas contenir le mot');
});
