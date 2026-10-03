/* =============================================================================
   Albatros VFR — ADMIN › QUESTIONNAIRE (03/10/2026)
   -----------------------------------------------------------------------------
   La page lit `profiles` (lecture admin déjà ouverte par sql/002) et affiche
   les réponses avec les LIBELLÉS du questionnaire, jamais les codes bruts.
   Supabase est remplacé par une doublure qui note les filtres demandés.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

const PROFILS = [
  { id: 'u1-aaaaaaaa', pseudo: 'pilote-a', created_at: '2026-09-20', onboarding_le: '2026-09-21',
    aerodrome: 'LFPN', decouverte: 'aeroclub', profil_pilote: 'eleve-cours', heures_vol: '10-50',
    objectifs: ['examen', 'aise'], type_avion: 'dr400', niveau_radio: 'bases' },
  { id: 'u2-bbbbbbbb', pseudo: '<img src=x onerror=alert(1)>', created_at: '2026-09-22', onboarding_le: '2026-09-22',
    aerodrome: 'LFPN', decouverte: null, profil_pilote: 'curieux', heures_vol: null,
    objectifs: ['plaisir'], type_avion: 'sais-pas', niveau_radio: 'debutant' },
  // Compte antérieur au questionnaire : sql/001 § 6 l'a déclaré terminé, sans réponse.
  { id: 'u3-cccccccc', display_name: 'ancien-eleve', email: 'ancien@exemple.fr', created_at: '2026-09-01',
    onboarding_le: '2026-09-01', aerodrome: null, decouverte: null, profil_pilote: null, heures_vol: null,
    objectifs: null, type_avion: null, niveau_radio: null }
];

async function doublure(page) {
  await page.evaluate((profils) => {
    window.__req = [];
    const chaine = (table) => {
      const q = { table, filtres: [] };
      window.__req.push(q);
      const c = {
        select(cols) { q.cols = cols; return c; }, order() { return c; }, limit() { return c; },
        not(k, op, v) { q.filtres.push(['not', k, op, v]); return c; },
        eq(k, v) { q.filtres.push(['eq', k, v]); return c; },
        maybeSingle() { return Promise.resolve({ data: profils.find(p => p.id === q.filtres[0][2]) || null, error: null }); },
        then(ok, ko) { return Promise.resolve({ data: profils, error: null }).then(ok, ko); }
      };
      return c;
    };
    RTAuth.client = () => ({ from: chaine, rpc: () => Promise.resolve({ data: null, error: null }) });
    RTAuth.estAdmin = () => true;
  }, PROFILS);
}

test('admin › Questionnaire : entrée de menu, répartitions en libellés, table échappée', async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e)));
  await ouvrir(page);
  await entrer(page, 'tableau');
  await doublure(page);
  await page.evaluate(() => { location.hash = '#admin/questionnaire'; });

  const p = page.locator('#page-admin');
  await expect(p.locator('h1')).toHaveText('Questionnaire');
  await expect(page.locator('a[href="#admin/questionnaire"], [data-route="admin/questionnaire"]').first()).toBeVisible();

  // Seuls les questionnaires TERMINÉS sont demandés.
  const req = await page.evaluate(() => window.__req.find(q => q.table === 'profiles'));
  expect(req.filtres).toContainEqual(['not', 'onboarding_le', 'is', null]);

  await expect(p).toContainText('comptes inscrits');
  await expect(p).toContainText('1 sans réponse (comptes antérieurs au questionnaire)');
  // L'ancien compte ne pèse pas dans les répartitions : « Où en êtes-vous ? » n'a pas de « Sans réponse ».
  const profil = p.locator('.adm-card').filter({ has: page.locator('h3', { hasText: /^Où en êtes-vous \?$/ }) });
  await expect(profil).not.toContainText('Sans réponse');
  await expect(p).toContainText('Où en êtes-vous ?');
  await expect(p).toContainText('Élève pilote, en cours de formation');   // libellé, pas « eleve-cours »
  await expect(p).not.toContainText('eleve-cours');
  await expect(p).toContainText('Posée seulement aux profils qui volent : 1 compte.');
  await expect(p).toContainText('Sans réponse');                           // découverte vide chez u2
  await expect(p.locator('tbody tr')).toHaveCount(3);                       // TOUS les inscrits
  await expect(p.locator('tbody')).toContainText('ancien-eleve');
  await expect(p.locator('tbody')).toContainText('aucune réponse');
  await expect(p.locator('tbody')).toContainText('<img src=x onerror=alert(1)>');
  await expect(p.locator('tbody img')).toHaveCount(0);
  expect(erreurs).toEqual([]);
});

test('RT.reponsesQuestionnaire : les réponses d\'un compte, en libellés', async ({ page }) => {
  await ouvrir(page);
  const l = await page.evaluate((p) => RTAdmin.reponsesQuestionnaire(p), PROFILS[0]);
  expect(l).toContainEqual(["Qu'est-ce que vous venez chercher ?", "Préparer l'examen ou l'oral · Être à l'aise au micro en vol"]);
  expect(l).toContainEqual(["Aérodrome d'attache", 'LFPN']);
});
