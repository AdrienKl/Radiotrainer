/* =============================================================================
   Albatros VFR — LES AVIS, CÔTÉ PAGE (29/09/2026)
   -----------------------------------------------------------------------------
   Ce qui compte vraiment — un seul avis par compte, aucune modification par
   l'auteur, rien de public avant modération, vedette publiée seulement — est
   tranché par la BASE, et vérifié en jouant les rôles anon / authenticated
   par tests/verifier-migrations.mjs § 15. Ici : que la page demande les
   bonnes choses, n'envoie que la note et le commentaire, échappe ce qu'elle
   affiche, et ne propose ni ne rappelle à tort.
   Supabase est remplacé par une doublure qui note chaque requête.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

/* La doublure : `from(table)` rend une chaîne qui note ses filtres et se
   résout sur `donnees[table]` ; `rpc(nom)` sur `rpc[nom]`. */
async function doublure(page, { avis = [], monAvis = null, connecte = false, erreurInsert = null } = {}) {
  await page.evaluate(({ avis, monAvis, connecte, erreurInsert }) => {
    window.__req = [];
    const chaine = (table) => {
      const q = { table, filtres: [], insert: null };
      window.__req.push(q);
      const c = {
        select() { return c; }, order() { return c; }, limit() { return c; },
        eq(k, v) { q.filtres.push([k, v]); return c; },
        insert(v) { q.insert = v; return Promise.resolve(erreurInsert ? { error: erreurInsert } : { error: null }); },
        then(ok, ko) {
          let l = avis.slice();
          q.filtres.forEach(([k, v]) => { l = l.filter(a => a[k] === v); });
          return Promise.resolve({ data: l, error: null }).then(ok, ko);
        }
      };
      return c;
    };
    RTAuth.client = () => ({ from: chaine, rpc: (nom) => Promise.resolve({ data: nom === 'mon_avis' ? monAvis : null, error: null }),
                             auth: { getSession: () => Promise.resolve({ data: { session: null } }) } });
    RTAuth.utilisateur = () => (connecte ? { id: 'u1', email: 'pilote@exemple.fr' } : null);
    RTAuth.profil = () => (connecte ? { id: 'u1', plan: 'free', role: 'user', pseudo: 'pilote' } : null);
  }, { avis, monAvis, connecte, erreurInsert });
}
const A = (o) => Object.assign({ statut: 'publie', mis_en_avant: false, ordre_mise_en_avant: null, commentaire: null }, o);

test('accueil : les trois avis mis en avant, dans l\'ordre, texte échappé ; rien d\'autre', async ({ page }) => {
  await ouvrir(page);
  await doublure(page, { avis: [
    A({ id: '1', pseudo: 'pilote-b', note: 4, commentaire: 'Deuxième', mis_en_avant: true, ordre_mise_en_avant: 2, cree_le: '2026-09-20' }),
    A({ id: '2', pseudo: '<img src=x onerror=alert(1)>', note: 5, commentaire: 'Premier <b>gras</b>', mis_en_avant: true, ordre_mise_en_avant: 1, cree_le: '2026-09-21' }),
    A({ id: '3', pseudo: 'attente', note: 5, statut: 'en_attente', cree_le: '2026-09-22' }),
    A({ id: '4', pseudo: 'publie-pas-vedette', note: 5, cree_le: '2026-09-23' })
  ] });
  await page.evaluate(() => RTAvis.chargerAccueil());
  const section = page.locator('#avAccueil');
  await expect(section).toBeVisible();
  // La doublure ne trie pas : c'est la requête qui doit demander publiés + vedettes.
  const req = await page.evaluate(() => window.__req.find(q => q.table === 'avis'));
  expect(req.filtres).toEqual(expect.arrayContaining([['statut', 'publie'], ['mis_en_avant', true]]));
  await expect(page.locator('#avAccueilListe .av-carte')).toHaveCount(2);
  await expect(section).not.toContainText('attente');
  await expect(section).not.toContainText('publie-pas-vedette');
  // Échappé : le texte s'affiche tel quel, aucune balise n'est créée.
  await expect(section).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#avAccueilListe img')).toHaveCount(0);
  await expect(page.locator('#avAccueilListe b')).toHaveCount(0);
  await expect(section.locator('button[data-page="avis"]')).toHaveText('Voir tous les avis');
});

test('accueil sans avis mis en avant : la section reste cachée', async ({ page }) => {
  await ouvrir(page);
  await doublure(page, { avis: [A({ id: '1', pseudo: 'x', note: 5, cree_le: '2026-09-20' })] });
  await page.evaluate(() => RTAvis.chargerAccueil());
  await page.waitForTimeout(200);
  await expect(page.locator('#avAccueil')).toBeHidden();
});

test('page #avis : publiés seuls, tri récents / mieux notés, mention sur la modération', async ({ page }) => {
  await ouvrir(page);
  await doublure(page, { avis: [
    A({ id: '1', pseudo: 'ancien-top', note: 5, cree_le: '2026-09-01T10:00:00Z' }),
    A({ id: '2', pseudo: 'recent-moyen', note: 3, cree_le: '2026-09-25T10:00:00Z' }),
    A({ id: '3', pseudo: 'rejete', note: 1, statut: 'rejete', cree_le: '2026-09-26T10:00:00Z' })
  ] });
  await page.evaluate(() => window.rtNaviguer('avis'));
  await expect(page.locator('#page-avis')).toHaveClass(/active/);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('light');
  const cartes = page.locator('#avListe .av-carte__qui');
  await expect(cartes).toHaveText(['recent-moyen', 'ancien-top']);
  await page.locator('#avTri').selectOption('notes');
  await expect(cartes).toHaveText(['ancien-top', 'recent-moyen']);
  await expect(page.locator('#avResume')).toContainText('4,0 / 5');
  await expect(page.locator('#avResume')).toContainText('2 avis publiés');
  await expect(page.locator('#avListe')).toContainText('Déposé le');
  const mention = page.locator('#avMention');
  await expect(mention).toContainText('3 jours au plus');
  await expect(mention).toContainText('au moins deux séances');
  await expect(mention).toContainText('vérifié manuellement');
});

test('widget : hors connexion, pas d\'option « Laisser un avis »', async ({ page }) => {
  await ouvrir(page);
  await doublure(page, { connecte: false });
  await page.evaluate(() => window.rtContactOuvrir());
  await page.waitForTimeout(200);
  await expect(page.locator('#ctOptAvis')).toBeHidden();
});

test('widget : un avis déjà laissé → plus d\'option ; une seule séance → option inerte qui dit pourquoi', async ({ page }) => {
  await ouvrir(page);
  await doublure(page, { connecte: true, monAvis: { connecte: true, seances: 4, avis: { statut: 'en_attente' }, peut: false } });
  await page.evaluate(() => window.rtContactOuvrir());
  await page.waitForTimeout(200);
  await expect(page.locator('#ctOptAvis')).toBeHidden();
  await page.evaluate(() => RTContact.fermer());

  await doublure(page, { connecte: true, monAvis: { connecte: true, seances: 1, avis: null, peut: false } });
  await page.evaluate(() => window.rtContactOuvrir());
  await expect(page.locator('#ctOptAvis')).toBeVisible();
  await expect(page.locator('#ctOptAvis')).toBeDisabled();
  await expect(page.locator('#ctOptAvisTxt')).toContainText('vous en avez 1');
});

test('widget : la note est obligatoire, et seules la note et le commentaire partent', async ({ page }) => {
  await ouvrir(page);
  await doublure(page, { connecte: true, monAvis: { connecte: true, seances: 2, avis: null, peut: true } });
  await page.evaluate(() => window.rtContactOuvrir());
  await page.locator('#ctOptAvis').click();
  await expect(page.locator('#ctAvisVue')).toBeVisible();
  await expect(page.locator('#ctTitre')).toHaveText('Laisser un avis');
  await page.locator('#avEnvoyer').click();
  await expect(page.locator('#avMsg')).toContainText('Choisissez une note');

  await page.locator('#avEtoiles label').nth(3).click();                  // 4 étoiles
  await expect(page.locator('#avEtoiles .av-etoile.on')).toHaveCount(4);
  await page.locator('#avCommentaire').fill('  Très utile pour le roulage.  ');
  await page.locator('#avEnvoyer').click();
  await expect(page.locator('#ctFin')).toBeVisible();
  await expect(page.locator('#ctFinTxt')).toContainText('sous 3 jours au plus');
  const envoi = await page.evaluate(() => window.__req.find(q => q.insert));
  expect(envoi.table).toBe('avis');
  expect(envoi.insert).toEqual({ note: 4, commentaire: 'Très utile pour le roulage.' });
});

test('widget : un refus de la base est dit en clair', async ({ page }) => {
  await ouvrir(page);
  await doublure(page, { connecte: true, monAvis: { connecte: true, seances: 2, avis: null, peut: true },
                         erreurInsert: { code: '23505', message: 'duplicate key value violates unique constraint' } });
  await page.evaluate(() => window.rtContactOuvrir('avis'));
  await expect(page.locator('#ctAvisVue')).toBeVisible();
  await page.locator('#avEtoiles label').nth(4).click();
  await page.locator('#avEnvoyer').click();
  await expect(page.locator('#avMsg')).toContainText('déjà laissé un avis');
});

test('rappel : après la 2e séance, discret ; « Plus tard » le repousse de trois séances', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');
  const seance = async (n, avis = null) => {
    await doublure(page, { connecte: true, monAvis: { connecte: true, seances: n, avis, peut: n >= 2 && !avis } });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('rt:seance-terminee', { detail: { kind: 'flight' } })));
    await page.waitForTimeout(150);
  };
  await seance(1);
  await expect(page.locator('#avRappel')).toHaveCount(0);
  await seance(2);
  const rappel = page.locator('#avRappel');
  await expect(rappel).toBeVisible();
  await expect(page.locator('#contactModal')).toBeHidden();                  // pas une modale
  await page.locator('#avRappelNon').click();
  await expect(rappel).toBeHidden();
  expect(await page.evaluate(() => rtSettings().avisRappel)).toBe(2);
  await seance(4);
  await expect(rappel).toBeHidden();
  await seance(5);
  await expect(rappel).toBeVisible();
  await page.locator('#avRappelOui').click();
  await expect(page.locator('#ctAvisVue')).toBeVisible();
  await page.evaluate(() => RTContact.fermer());
  await seance(9, { statut: 'publie' });                                     // avis déjà laissé
  await expect(rappel).toBeHidden();
});

test('admin › Avis : en attente d\'abord, les actions appellent les fonctions de la base', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');
  const vieux = new Date(Date.now() - 4 * 86400000).toISOString();
  await page.evaluate((vieux) => {
    window.__rpc = [];
    const liste = [
      { id: 'a1', pseudo: 'pilote-a', note: 5, commentaire: 'Top', statut: 'en_attente', mis_en_avant: false, cree_le: vieux, email: 'a@x.fr' },
      { id: 'a2', pseudo: 'pilote-b', note: 3, commentaire: null, statut: 'publie', mis_en_avant: true, ordre_mise_en_avant: 1, cree_le: vieux },
      { id: 'a3', pseudo: 'pilote-c', note: 1, commentaire: 'Nul', statut: 'rejete', motif_rejet: 'Hors sujet', mis_en_avant: false, cree_le: vieux }
    ];
    RTAuth.client = () => ({ rpc: (nom, args) => { window.__rpc.push([nom, args]);
      return Promise.resolve({ data: nom === 'admin_avis_liste' ? liste : { ok: true }, error: null }); } });
    RTAuth.estAdmin = () => true;
    location.hash = '#admin/avis';
  }, vieux);
  const p = page.locator('#page-admin');
  await expect(p.locator('h1')).toHaveText('Avis');
  await expect(p).toContainText('1 avis en attente');
  await expect(p).toContainText('3 jours au plus');
  await expect(p.locator('tbody tr')).toHaveCount(1);                        // filtre par défaut : en attente
  await expect(p.locator('tbody')).toContainText('pilote-a');
  await p.locator('tbody button', { hasText: 'Publier' }).click();
  await expect.poll(() => page.evaluate(() => window.__rpc.some(([n, a]) => n === 'admin_avis_moderer' && a.nouveau === 'publie' && a.cible === 'a1'))).toBe(true);

  await p.locator('.adm-filter select').first().selectOption('publie');
  await expect(p.locator('tbody')).toContainText('Accueil 1');
  await p.locator('tbody select').selectOption('2');
  await expect.poll(() => page.evaluate(() => window.__rpc.some(([n, a]) => n === 'admin_avis_vedette' && a.rang === 2 && a.cible === 'a2'))).toBe(true);

  await p.locator('.adm-filter select').first().selectOption('rejete');
  await expect(p.locator('tbody')).toContainText('Motif : Hors sujet');
  await expect(p.locator('tbody select')).toHaveCount(0);                   // pas de vedette pour un rejeté
});
