/* =============================================================================
   Albatros VFR — SUPPRIMER UN COMPTE, BLOQUER UNE ADRESSE (30/09/2026, sql/012)
   -----------------------------------------------------------------------------
   Ce qu'on vérifie, sur la source de démonstration de la console :
     · la fiche d'un élève propose les deux suppressions ; celle d'un compte à
       rôle ne propose rien et dit pourquoi ;
     · rien ne part sans l'adresse retapée ;
     · supprimer ramène à la liste, et le compte n'y est plus ;
     · « supprimer et bloquer » ajoute une ligne aux adresses bloquées, que
       l'on peut débloquer ;
     · le refus d'une adresse bloquée s'affiche tel quel à l'inscription : le
       message d'une panne passagère, sans « Échec de l'opération : ».
   Les règles elles-mêmes (qui peut, cascade, empreinte, hook) sont vérifiées
   sur un vrai PostgreSQL par tests/verifier-migrations.mjs § 16.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

async function admin(page) {
  await ouvrir(page);
  await entrer(page, 'tableau');
  await page.evaluate(() => {
    RTAuth.estAdmin = () => true;
    RTAdmin.data.setSource('mock');
    window.__toasts = []; window.showToast = t => window.__toasts.push(t);
  });
}
// Un élève (rôle « user ») et un compte à rôle, pris dans la source de démonstration.
async function comptes(page) {
  return page.evaluate(async () => {
    const r = await RTAdmin.data.users({ perPage: 500, page: 1 });
    const rows = r.rows || r;
    return { eleve: rows.find(u => u.role === 'user' && u.email), role: rows.find(u => u.role && u.role !== 'user') };
  });
}
const aller = (page, h) => page.evaluate(h => { location.hash = h; }, h);

test('fiche élève : les deux suppressions ; rien ne part sans l\'adresse retapée', async ({ page }) => {
  await admin(page);
  const { eleve } = await comptes(page);
  await aller(page, '#admin/users/' + eleve.id);
  const carte = page.locator('.adm-suppr');
  await expect(carte.getByRole('button', { name: 'Supprimer', exact: true })).toBeVisible();
  await expect(carte.getByRole('button', { name: 'Supprimer et bloquer l\'adresse' })).toBeVisible();
  await carte.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.locator('.adm-suppr-confirmation').fill('autre@exemple.fr');
  await page.locator('.adm-suppr-go').click();
  await expect(page.locator('.adm-drawer')).toContainText('ne correspond pas');
  const encore = await page.evaluate(id => RTAdmin.data.user(id), eleve.id);
  expect(encore).not.toBeNull();
});

test('supprimer : retour à la liste, le compte n\'y est plus, aucune adresse bloquée', async ({ page }) => {
  await admin(page);
  const { eleve } = await comptes(page);
  await aller(page, '#admin/users/' + eleve.id);
  await page.locator('.adm-suppr').getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.locator('.adm-suppr-confirmation').fill(eleve.email.toUpperCase());
  await page.locator('.adm-suppr-go').click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#admin/users');
  expect(await page.evaluate(id => RTAdmin.data.user(id), eleve.id)).toBeNull();
  await expect.poll(() => page.evaluate(() => window.__toasts.join(' | '))).toContain('Compte supprimé.');
  expect(await page.evaluate(() => RTAdmin.data.comptesBloques())).toEqual([]);
});

test('supprimer et bloquer : la ligne apparaît dans « Adresses bloquées », et se débloque', async ({ page }) => {
  await admin(page);
  const { eleve } = await comptes(page);
  await aller(page, '#admin/users/' + eleve.id);
  await page.locator('.adm-suppr').getByRole('button', { name: 'Supprimer et bloquer l\'adresse' }).click();
  await expect(page.locator('.adm-drawer')).toContainText('Réessayez plus tard');
  await page.locator('.adm-suppr-confirmation').fill(eleve.email);
  await page.locator('.adm-suppr-go').click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#admin/users');
  await page.getByRole('button', { name: 'Adresses bloquées' }).click();
  const ligne = page.locator('.adm-bloc-ligne');
  await expect(ligne).toHaveCount(1);
  await expect(ligne).toContainText(eleve.name);
  await ligne.getByRole('button', { name: 'Débloquer' }).click();
  await expect(page.locator('.adm-drawer')).toContainText('Aucune adresse bloquée');
});

test('un compte à rôle : aucune suppression proposée, et la raison est dite', async ({ page }) => {
  await admin(page);
  const { role } = await comptes(page);
  test.skip(!role, 'la démonstration n\'a pas de compte à rôle');
  await aller(page, '#admin/users/' + role.id);
  const carte = page.locator('.adm-suppr');
  await expect(carte).toContainText('Retirez-lui d\'abord ce rôle');
  await expect(carte.getByRole('button')).toHaveCount(0);
});

test('inscription d\'une adresse bloquée : le message neutre, tel quel', async ({ page }) => {
  await ouvrir(page);
  const m = await page.evaluate(() => RTAuth.message({ message: 'Une erreur est survenue. Réessayez plus tard.', status: 500 }));
  expect(m).toBe('Une erreur est survenue. Réessayez plus tard.');
});
