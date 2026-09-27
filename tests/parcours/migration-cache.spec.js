/* =============================================================================
   Albatros VFR — LA MONTÉE DU CACHE LOCAL VERS LE COMPTE (assets/donnees.js)
   -----------------------------------------------------------------------------
   La panne du 27/09/2026, vue dans la console d'un compte réel :
     POST …/rest/v1/sessions 500
     Reprise des séances locales impossible : ON CONFLICT DO UPDATE command
     cannot affect row a second time

   Deux défauts s'enchaînaient :
     1. le cache d'un compte — une COPIE de la base, écrite par charger() — était
        remonté à chaque connexion, sous un identifiant déduit du contenu, donc
        DIFFÉRENT de celui de la séance d'origine : chaque séance était
        dupliquée en base (46 doublons mesurés en production) ;
     2. à la connexion suivante, les deux copies revenaient dans le cache,
        donnaient le même identifiant dans le même upsert, et PostgreSQL
        refusait tout le paquet.
   Et un troisième, découvert en lisant le code : après une montée ratée,
   charger() écrasait quand même le cache — une séance qui n'existait qu'en
   local disparaissait.

   Le faux client ci-dessous imite PostgreSQL sur le seul point qui compte ici :
   il refuse un upsert qui contient deux fois le même identifiant.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir } from './_aide.js';

const UID = '11111111-1111-4111-8111-111111111111';

async function preparer(page, { proprio = null, cache = [], refuser = false } = {}) {
  await page.evaluate(({ UID, proprio, cache, refuser }) => {
    window.__upserts = [];
    window.__lectures = 0;
    const lecture = () => {
      window.__lectures++;
      const r = { data: [], error: null, count: 0 };
      const chaine = new Proxy(function () {}, {
        get: (_, k) => (k === 'then' ? (ok) => Promise.resolve(r).then(ok) : chaine),
        apply: () => chaine
      });
      return chaine;
    };
    const faux = {
      from: (table) => ({
        upsert: (lignes) => {
          const l = Array.isArray(lignes) ? lignes : [lignes];
          window.__upserts.push({ table, ids: l.map(x => x.id || (x.session_id + '#' + x.idx)) });
          if (refuser) return Promise.resolve({ error: { message: 'panne simulée', code: '08006' } });
          if (table === 'sessions') {
            const ids = l.map(x => x.id);
            if (new Set(ids).size !== ids.length)
              return Promise.resolve({ error: { code: '21000',
                message: 'ON CONFLICT DO UPDATE command cannot affect row a second time' } });
          }
          return Promise.resolve({ error: null });
        },
        select: lecture, update: lecture
      })
    };
    RTAuth.client = () => faux;
    RTAuth.utilisateur = () => ({ id: UID, email: 'pilote@exemple.fr' });
    localStorage.setItem('radiotrainer_history_v2', JSON.stringify(cache));
    localStorage.removeItem('rt-vols');
    if (proprio) localStorage.setItem('rt-cache-proprio', JSON.stringify(proprio));
    else localStorage.removeItem('rt-cache-proprio');
  }, { UID, proprio, cache, refuser });
}

const SEANCE = { date: '2026-09-20T10:00:00.000Z', scenario: 'Tour de piste', scIdx: 0,
                 terrain: 'LFPN', piste: '25', found: 7, total: 8, mode: 'debutant', duree: 300,
                 lignes: [{ ph: 'Roulage', attendu: 'x', dit: 'x', ok: 1, total: 1 }] };

test('deux entrées identiques du cache montent UNE fois, sans refus de la base', async ({ page }) => {
  await ouvrir(page);
  await preparer(page, { cache: [SEANCE, { ...SEANCE }] });
  const r = await page.evaluate(() => RTDonnees.migrer());
  expect(r.erreur, 'la base a refusé le paquet').toBeUndefined();
  expect(r.montees).toBe(1);
  const seances = await page.evaluate(() => window.__upserts.filter(u => u.table === 'sessions'));
  expect(seances).toHaveLength(1);
  expect(seances[0].ids).toHaveLength(1);
});

test('le cache d\'un compte (copie de la base) n\'est JAMAIS remonté', async ({ page }) => {
  /* C'était la source des 46 doublons : chaque séance revenait sous un
     second identifiant. */
  await ouvrir(page);
  await preparer(page, { proprio: UID, cache: [SEANCE] });
  const r = await page.evaluate(() => RTDonnees.migrer());
  expect(r.montees).toBe(0);
  expect(await page.evaluate(() => window.__upserts.length), 'aucune écriture en base').toBe(0);
});

test('le cache d\'avant les comptes (sans propriétaire) est toujours remonté', async ({ page }) => {
  await ouvrir(page);
  await preparer(page, { proprio: null, cache: [SEANCE] });
  const r = await page.evaluate(() => RTDonnees.migrer());
  expect(r.montees).toBe(1);
});

test('si la montée échoue, le cache n\'est PAS écrasé : ses séances ne sont nulle part ailleurs', async ({ page }) => {
  await ouvrir(page);
  await preparer(page, { proprio: null, cache: [SEANCE], refuser: true });
  await page.evaluate(() => RTDonnees.synchroniser());
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('radiotrainer_history_v2')));
  expect(cache, 'la séance locale a disparu').toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('rt-cache-proprio')),
         'un propriétaire posé empêcherait toute nouvelle tentative').toBeNull();
});
