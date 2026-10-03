/* =============================================================================
   Albatros VFR — LE TABLEAU DE BORD COMPTE TOUTES LES SÉANCES (03/10/2026)
   -----------------------------------------------------------------------------
   Le tableau de bord comptait sur le cache, qui ne garde que 40 vols : passé le
   40e, « vols réalisés » restait à 40 et le taux moyen ne bougeait presque plus.
   Il prend désormais le bilan de la base (RTDonnees.bilan), plus les séances
   finies depuis la relecture, qui ne sont encore que dans le cache.
   Supabase est coupé dans les tests : le bilan est posé à la main.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

function vol(date, ok, total){
  return { date, titre:'LFPN — vol local', dep:'LFPN', ok, total, pct:Math.round(ok*100/total), lignes:[] };
}

test('au-delà de 40 vols, le compte et le taux suivent la base', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');
  await page.evaluate(([vieux, neuf]) => {
    /* 40 vols en cache, dont UN fini après la relecture du bilan. */
    var v = [neuf]; for (var i = 0; i < 39; i++) v.push(vieux);
    localStorage.setItem('rt-vols', JSON.stringify(v));
    localStorage.setItem('radiotrainer_history_v2', '[]');
    var B = { vols:57, scenarios:12, ok:600, total:1000, le:'2026-10-01T12:00:00.000Z' };
    window.RTDonnees.bilan = function(){ return B; };
    window.dispatchEvent(new CustomEvent('rt:donnees'));
  }, [vol('2026-09-30T10:00:00.000Z', 6, 10), vol('2026-10-02T10:00:00.000Z', 10, 10)]);

  const stats = page.locator('#tbStats');
  await expect(stats).toContainText('58');            // 57 en base + 1 depuis
  await expect(stats).toContainText('12');
  await expect(stats).toContainText('60');            // 610 / 1010 → 60 %
  await expect(stats).not.toContainText('40');
});

test('sans bilan (hors connexion), le cache seul, comme avant', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');
  await page.evaluate((v) => {
    localStorage.setItem('rt-vols', JSON.stringify([v, v, v]));
    localStorage.setItem('radiotrainer_history_v2', '[]');
    window.dispatchEvent(new CustomEvent('rt:donnees'));
  }, vol('2026-09-30T10:00:00.000Z', 7, 10));
  const stats = page.locator('#tbStats');
  await expect(stats).toContainText('70');
  await expect(stats).toContainText('vols réalisés');
});
