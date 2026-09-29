/* =============================================================================
   Albatros VFR — LE MOTEUR GOOGLE DE LA VOIX (assets/noyau/5-voix.js)
   -----------------------------------------------------------------------------
   Ajouté le 27/09/2026 comme SECOND moteur, à l'intérieur de Voix. Ce qu'on
   vérifie ici, c'est le contrat que les appelants (speakATC, speakExtra, les
   boucles ATIS, le bouton d'essai) supposent sans le savoir :
     · un message = un onDebut, puis un onFin — quel que soit le moteur ;
     · stop() fait taire, et rien ne revient après ;
     · une panne de Google ne se ENTEND pas : le même message repart par la
       voix du navigateur.

   Personne ne parle à Supabase ni à Google : voix-atc est intercepté et
   répond un vrai son (un WAV fabriqué ici — decodeAudioData le lit comme un
   MP3), ou une erreur. speechSynthesis est remplacé par un double qui note
   ce qu'on lui fait dire et répond tout de suite.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir } from './_aide.js';

const FONCTION = '**/functions/v1/voix-atc';

/* Un WAV mono 8 kHz, 16 bits, de `secondes` de silence. */
function wav(secondes) {
  const n = Math.round(8000 * secondes), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

/* La fonction voix-atc, simulée. `repondre(requete)` rend { status, body } ;
   chaque requête est notée dans `requetes`. */
async function fonction(page, repondre) {
  const requetes = [];
  await page.route(FONCTION, async route => {
    const r = route.request();
    requetes.push({ corps: JSON.parse(r.postData() || '{}'), auth: r.headers()['authorization'] });
    const rep = await repondre(requetes.length);
    if (rep.attente) await new Promise(ok => setTimeout(ok, rep.attente));
    try {
      await route.fulfill({ status: rep.status || 200,
        contentType: rep.status && rep.status !== 200 ? 'application/json' : 'audio/mpeg',
        body: rep.body ?? wav(0.3) });
    } catch { /* requête annulée par stop() entre-temps */ }
  });
  return requetes;
}

/* Le décor : un compte connecté, premium ou non, le moteur choisi ou non, et
   un speechSynthesis qui note tout. Posé APRÈS le chargement, comme auth.js
   le ferait. */
async function preparer(page, { plan = 'premium', moteur = 'google', voix = 'fr-FR-Neural2-G' } = {}) {
  await page.evaluate(({ plan, moteur, voix }) => {
    window.__dit = [];                      // ce que la voix du NAVIGATEUR a dit
    window.__ev = [];                       // onDebut / onFin, dans l'ordre
    const faux = {
      speaking: false, pending: false, paused: false,
      getVoices: () => [], cancel() {}, pause() {}, resume() {},
      speak(u) {
        /* Le « bonjour » à volume nul de l'amorce (premier geste) n'est pas un
           message : c'est le déverrouillage de l'audio. */
        if (u.volume !== 0) window.__dit.push(u.text);
        setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => u.onend && u.onend(), 10); }, 5);
      }
    };
    Object.defineProperty(window, 'speechSynthesis', { value: faux, configurable: true });
    /* Le repli doit être silencieux (décision du 27/09/2026) : on compte tout
       ce qui s'afficherait à l'élève. */
    window.__toasts = 0;
    const toast = window.showToast;
    window.showToast = (m) => { window.__toasts++; if (toast) toast(m); };
    RTAuth.utilisateur = () => ({ id: 'u1', email: 'pilote@exemple.fr' });
    RTAuth.profil = () => ({ id: 'u1', plan });
    RTAuth.client = () => ({ auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'jeton-essai' } } }) } });
    const s = rtSettings();
    if (moteur) { s.voixMoteur = moteur; s.voixGoogle = voix; } else { delete s.voixMoteur; delete s.voixGoogle; }
    localStorage.setItem('rt-settings', JSON.stringify(s));
    window.__dire = (texte, fn = 'parler', extra = {}) => Voix[fn](texte, Object.assign({
      rate: 1, pitch: 1,
      onDebut: () => window.__ev.push('debut:' + texte),
      onFin: () => window.__ev.push('fin:' + texte)
    }, extra));
  }, { plan, moteur, voix });
  /* Un vrai geste : sans lui, Chrome laisse l'AudioContext suspendu. */
  await page.mouse.click(5, 5);
}
const evenements = page => page.evaluate(() => window.__ev);
const ditParLeNavigateur = page => page.evaluate(() => window.__dit);

test.beforeEach(async ({ page }) => { await ouvrir(page); });

test('premium, Google choisi : une requête avec le texte ENTIER, onDebut puis onFin', async ({ page }) => {
  const requetes = await fonction(page, () => ({}));
  await preparer(page);
  const texte = 'F-ABCD, rappelez vent arrière main droite piste 27. Trafic en finale, un Robin, numéro deux.';
  await page.evaluate(t => __dire(t), texte);
  await expect.poll(() => evenements(page)).toEqual(['debut:' + texte, 'fin:' + texte]);
  expect(requetes).toHaveLength(1);
  expect(requetes[0].corps).toMatchObject({ action: 'dire', texte, voix: 'fr-FR-Neural2-G', debit: 1, hauteur: 0 });
  expect(requetes[0].auth).toBe('Bearer jeton-essai');
  expect(await ditParLeNavigateur(page), 'la voix du navigateur a parlé aussi').toEqual([]);
});

test('une urgence relève la hauteur : 1,1 devient ~+1,65 demi-ton', async ({ page }) => {
  const requetes = await fonction(page, () => ({}));
  await preparer(page);
  await page.evaluate(() => __dire('Mayday.', 'parler', { rate: 1.12, pitch: 1.1 }));
  await expect.poll(() => requetes.length).toBe(1);
  expect(requetes[0].corps.debit).toBe(1.12);
  expect(requetes[0].corps.hauteur).toBe(1.65);
});

for (const [nom, rep] of [['panne 500', { status: 500, body: '{"erreur":"google"}' }],
                          ['502 de la base', { status: 502, body: '{"erreur":"base"}' }],
                          ['quota 429', { status: 429, body: '{"erreur":"quota","restant":3}' }],
                          ['compte refusé 403', { status: 403, body: '{"erreur":"non_premium"}' }],
                          ['réponse illisible', { status: 200, body: 'pas du son' }]]) {
  test(`repli (${nom}) : le MÊME message par la voix du navigateur, en silence`, async ({ page }) => {
    await fonction(page, () => rep);
    await preparer(page);
    await page.evaluate(() => __dire('Rappelez vent arrière.'));
    await expect.poll(() => evenements(page)).toEqual(['debut:Rappelez vent arrière.', 'fin:Rappelez vent arrière.']);
    expect(await ditParLeNavigateur(page)).toEqual(['Rappelez vent arrière.']);
    expect(await page.evaluate(() => window.__toasts), 'un message est apparu pendant l\'exercice').toBe(0);
  });
}

test('délai dépassé (4,5 s) : repli sur la voix du navigateur', async ({ page }) => {
  await fonction(page, () => ({ attente: 7000 }));
  await preparer(page);
  const t0 = Date.now();
  await page.evaluate(() => __dire('Rappelez prêt.'));
  await expect.poll(() => ditParLeNavigateur(page), { timeout: 8000 }).toEqual(['Rappelez prêt.']);
  const ecoule = Date.now() - t0;
  expect(ecoule).toBeGreaterThan(4000);
  expect(ecoule).toBeLessThan(6500);
});

test('après un 429, Google est coupé jusqu\'au rechargement : plus aucune requête', async ({ page }) => {
  const requetes = await fonction(page, () => ({ status: 429, body: '{"erreur":"quota"}' }));
  await preparer(page);
  await page.evaluate(() => __dire('Un.'));
  await expect.poll(() => ditParLeNavigateur(page)).toEqual(['Un.']);
  await page.evaluate(() => __dire('Deux.'));
  await expect.poll(() => ditParLeNavigateur(page)).toEqual(['Un.', 'Deux.']);
  expect(requetes).toHaveLength(1);
});

test('après une panne, Google fait une pause : le message suivant ne le rappelle pas', async ({ page }) => {
  const requetes = await fonction(page, () => ({ status: 500, body: '{"erreur":"google"}' }));
  await preparer(page);
  await page.evaluate(() => __dire('Un.'));
  await expect.poll(() => ditParLeNavigateur(page)).toEqual(['Un.']);
  await page.evaluate(() => __dire('Deux.'));
  await expect.poll(() => ditParLeNavigateur(page)).toEqual(['Un.', 'Deux.']);
  expect(requetes).toHaveLength(1);
});

/* Phase de lancement (29/09/2026, assets/modules/lancement.js). Le compteur
   du jour se pose dans rt-quota, à la date LOCALE, comme le fait le module. */
async function compteurDuJour(page, n, sc) {
  await page.evaluate(([n, sc]) => {
    const d = new Date(), j = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    localStorage.setItem('rt-quota', JSON.stringify({ date: j, n, s: sc }));
  }, [n, sc]);
}

test('compte gratuit, phase de lancement : la voix Google est offerte', async ({ page }) => {
  const requetes = await fonction(page, () => ({ body: wav(0.2) }));
  await preparer(page, { plan: 'free' });
  await compteurDuJour(page, 0, 0);
  await page.evaluate(() => __dire('Rappelez vent arrière.'));
  await expect.poll(() => requetes.length).toBe(1);
  expect(await ditParLeNavigateur(page)).toEqual([]);
});

for (const [nom, decor, n, sc] of [
  ['compte gratuit, 3 vols et 5 scénarios Google déjà faits', { plan: 'free' }, 3, 5],
  ['moteur « Navigateur » choisi', { moteur: 'navigateur' }, 0, 0]]) {
  test(`${nom} : aucune requête, la voix du navigateur`, async ({ page }) => {
    const requetes = await fonction(page, () => ({}));
    await preparer(page, decor);
    await compteurDuJour(page, n, sc);
    await page.evaluate(() => __dire('Rappelez vent arrière.'));
    await expect.poll(() => ditParLeNavigateur(page)).toEqual(['Rappelez vent arrière.']);
    expect(requetes).toHaveLength(0);
  });
}

test('un vol lancé au-delà de la voix offerte garde la voix du navigateur jusqu\'au bout', async ({ page }) => {
  const requetes = await fonction(page, () => ({ body: wav(0.2) }));
  await preparer(page, { plan: 'free' });
  await compteurDuJour(page, 3, 0);
  // Lancé sans message (pas de relance) : c'est le décompte qui compte ici.
  expect(await page.evaluate(() => RTLancement.autoriser('vol'))).toBe(true);
  await page.evaluate(() => __dire('Rappelez vent arrière.'));
  await expect.poll(() => ditParLeNavigateur(page)).toEqual(['Rappelez vent arrière.']);
  /* La LISTE des voix a pu partir avant (Paramètres, à la connexion) ; aucun
     message, lui, ne doit être parti vers Google. */
  expect(requetes.filter(r => r.corps.action !== 'voix')).toHaveLength(0);
});

test('moteur jamais choisi : Google par défaut, avec la voix choisie', async ({ page }) => {
  const requetes = await fonction(page, () => ({ body: wav(0.2) }));
  await preparer(page, { moteur: null });
  await page.evaluate(() => { const s = rtSettings(); s.voixGoogle = 'fr-FR-Neural2-G'; localStorage.setItem('rt-settings', JSON.stringify(s)); });
  await page.evaluate(() => __dire('Rappelez vent arrière.'));
  await expect.poll(() => requetes.length).toBe(1);
});

test('stop() pendant la requête : silence, ni onDebut, ni repli', async ({ page }) => {
  await fonction(page, () => ({ attente: 1500 }));
  await preparer(page);
  await page.evaluate(() => __dire('Rappelez vent arrière.'));
  await page.waitForTimeout(300);
  await page.evaluate(() => Voix.stop());
  await page.waitForTimeout(2500);
  expect(await evenements(page)).toEqual([]);
  expect(await ditParLeNavigateur(page)).toEqual([]);
  expect(await page.evaluate(() => Voix.occupe())).toBe(false);
});

test('stop() pendant la lecture : aucun onFin en retard', async ({ page }) => {
  await fonction(page, () => ({ body: wav(2) }));
  await preparer(page);
  await page.evaluate(() => __dire('Message long.'));
  await expect.poll(() => evenements(page)).toEqual(['debut:Message long.']);
  await page.evaluate(() => Voix.stop());
  await page.waitForTimeout(2500);
  expect(await evenements(page)).toEqual(['debut:Message long.']);
  expect(await page.evaluate(() => Voix.occupe())).toBe(false);
});

test('ATIS en boucle : le même texte redit ne coûte qu\'UNE requête (cache)', async ({ page }) => {
  const requetes = await fonction(page, () => ({}));
  await preparer(page);
  const atis = 'Information Alpha, piste en service 25, vent 250 degrés 10 nœuds, QNH 1013.';
  for (let i = 1; i <= 3; i++) {
    await page.evaluate(t => __dire(t), atis);
    await expect.poll(() => page.evaluate(() => __ev.filter(e => e.startsWith('fin:')).length)).toBe(i);
  }
  expect(requetes).toHaveLength(1);
  expect(await ditParLeNavigateur(page)).toEqual([]);
});

test('empiler() pendant une lecture Google : dit ensuite, sans couper', async ({ page }) => {
  await fonction(page, n => ({ body: wav(n === 1 ? 1 : 0.3) }));
  await preparer(page);
  await page.evaluate(() => __dire('Contrôleur.'));
  await expect.poll(() => evenements(page)).toEqual(['debut:Contrôleur.']);
  await page.evaluate(() => __dire('Autre avion.', 'empiler'));
  await expect.poll(() => evenements(page), { timeout: 5000 })
    .toEqual(['debut:Contrôleur.', 'fin:Contrôleur.', 'debut:Autre avion.', 'fin:Autre avion.']);
});

test('parler() pendant une lecture Google : coupe, et enchaîne sur le nouveau', async ({ page }) => {
  await fonction(page, n => ({ body: wav(n === 1 ? 2 : 0.3) }));
  await preparer(page);
  await page.evaluate(() => __dire('Premier.'));
  await expect.poll(() => evenements(page)).toEqual(['debut:Premier.']);
  await page.evaluate(() => __dire('Second.'));
  await expect.poll(() => evenements(page)).toEqual(['debut:Premier.', 'debut:Second.', 'fin:Second.']);
  await page.waitForTimeout(2200);
  expect(await evenements(page), 'le premier message a émis un onFin après avoir été coupé')
    .toEqual(['debut:Premier.', 'debut:Second.', 'fin:Second.']);
});

test('le bruit radio suit la voix Google (speakATC)', async ({ page }) => {
  await fonction(page, () => ({ body: wav(0.6) }));
  await preparer(page);
  await page.evaluate(() => {
    window.__bruit = [];
    state.noiseEnabled = true;
    const debut = window.startRadioNoise, fin = window.stopRadioNoise;
    window.startRadioNoise = () => { __bruit.push('on'); debut(); };
    window.stopRadioNoise = () => { __bruit.push('off'); fin(); };
    speakATC('F-ABCD, rappelez vent arrière.');
  });
  /* parler() commence par couper le bruit d'un message précédent : un premier
     « off » arrive donc AVANT la voix. Ce qui compte : un « on » quand la voix
     démarre, puis un « off » quand elle se tait. */
  await expect.poll(async () => {
    const b = await page.evaluate(() => __bruit);
    const on = b.indexOf('on');
    return on >= 0 && b.lastIndexOf('off') > on;
  }, { timeout: 5000, message: 'le bruit n\'a pas démarré puis cessé avec la voix Google' }).toBe(true);
});
