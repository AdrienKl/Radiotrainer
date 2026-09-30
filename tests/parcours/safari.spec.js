/* =============================================================================
   Albatros VFR — LA VOIX RÉALISTE SOUS SAFARI (WebKit) — 30/09/2026
   -----------------------------------------------------------------------------
   Panne du 30/09/2026 : sous Safari, l'essai affichait « Voix réaliste :
   Achernar », l'onglet montrait l'icône de son, Google facturait — et rien ne
   sortait. Le son décodé par l'AudioContext y restait muet. Safari passe
   désormais par un élément <audio> déverrouillé au premier geste
   (5-voix.js › parElement, jouerElement).

   Ce fichier ne tourne QUE dans le projet « safari » (playwright.config.js) :
   il vérifie que WebKit prend ce chemin DE LUI-MÊME — sans RT_LECTEUR_ELEMENT —
   et que le message va jusqu'à onFin sans que la voix du navigateur parle.
   Que le son s'entende, WebKit ne peut pas le dire : c'est l'oreille
   (CLAUDE.md § 17.2).
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir } from './_aide.js';

function wav(secondes) {
  const n = Math.round(8000 * secondes), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

test('Safari : la voix réaliste passe par le lecteur <audio>, jusqu\'au bout', async ({ page }) => {
  await ouvrir(page);
  const requetes = [];
  await page.route('**/functions/v1/voix-atc', async route => {
    requetes.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'audio/wav', body: wav(0.3) });
  });
  await page.evaluate(() => {
    window.__dit = []; window.__ev = []; window.__lu = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, pending: false, paused: false, getVoices: () => [], cancel() {}, pause() {}, resume() {},
      speak(u) { if (u.volume !== 0) window.__dit.push(u.text);
                 setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => u.onend && u.onend(), 10); }, 5); }
    } });
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__lu.push(this.src.slice(0, 5)); return orig.call(this); };
    RTAuth.utilisateur = () => ({ id: 'u1', email: 'pilote@exemple.fr' });
    RTAuth.profil = () => ({ id: 'u1', plan: 'premium', role: 'admin' });
    RTAuth.client = () => ({ auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'j' } } }) } });
    localStorage.setItem('rt-settings', JSON.stringify({ voixMoteur: 'google', voixGoogle: 'fr-FR-Neural2-G' }));
  });
  expect(await page.evaluate(() => typeof window.RT_LECTEUR_ELEMENT)).toBe('undefined');   // rien de forcé
  await page.mouse.click(5, 5);          // le premier geste, qui déverrouille le lecteur
  await page.evaluate(() => Voix.parler('Piste 27, autorisé atterrissage.', {
    onDebut: () => window.__ev.push('debut'), onFin: () => window.__ev.push('fin') }));
  await expect.poll(() => page.evaluate(() => window.__ev), { timeout: 10000 }).toEqual(['debut', 'fin']);
  expect(requetes.filter(r => r.action === 'dire')).toHaveLength(1);
  expect(await page.evaluate(() => window.__lu)).toContain('blob:');
  expect(await page.evaluate(() => Voix.etatGoogle().dernier)).toBe('google');
  expect(await page.evaluate(() => window.__dit)).toEqual([]);
});
