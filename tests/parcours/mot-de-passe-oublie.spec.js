/* =============================================================================
   Albatros VFR — LE PARCOURS « MOT DE PASSE OUBLIÉ »
   -----------------------------------------------------------------------------
   Trois étapes : demander un code, le vérifier, choisir un nouveau mot de
   passe. Une seule visible à la fois.

   ┌─ CE QU'ON REMPLACE, ET CE QU'ON NE REMPLACE PAS ────────────────────────┐
   │ Les tests ne parlent JAMAIS au Supabase de production (tests/README.md).│
   │ On remplace donc les trois primitives de RTAuth par des doublures — et  │
   │ RIEN D'AUTRE : l'enchaînement des panneaux, le garde-fou de renvoi, la  │
   │ neutralité des messages et le nettoyage des champs restent le VRAI code │
   │ d'assets/auth.js. C'est lui qu'on teste.                                │
   │                                                                          │
   │ Ce que ces tests ne peuvent pas dire : qu'un e-mail part vraiment, et    │
   │ que Supabase accepte le code. Ça demande une vraie adresse — c'est écrit │
   │ dans INSCRIPTION.md, et ça reste à faire à la main.                      │
   └──────────────────────────────────────────────────────────────────────────┘
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir } from './_aide.js';

/* Les doublures sont posées AVANT le chargement : auth.js accroche ses
   écouteurs dès qu'il s'exécute, et ce sont eux qui appelleront RTAuth. */
async function doubler(page, options = {}) {
  await page.addInitScript((o) => {
    window.__appels = [];
    const attendre = () => new Promise(r => setTimeout(r, 1));
    Object.defineProperty(window, 'RTAuthDouble', { value: o, writable: true });
    document.addEventListener('DOMContentLoaded', () => {}, { once: true });
    const poser = () => {
      if (!window.RTAuth) return false;
      window.RTAuth.recuperationEnvoyer = (email) => {
        window.__appels.push(['envoyer', email]);
        return o.envoiRate ? attendre().then(() => { throw new Error(o.envoiRate); })
                           : attendre().then(() => true);
      };
      window.RTAuth.recuperationVerifier = (email, code) => {
        window.__appels.push(['verifier', email, code]);
        return attendre().then(() => {
          if (code !== '12345678') throw new Error('Token has expired or is invalid');
          return { user: { id: 'essai' } };
        });
      };
      window.RTAuth.definirMotDePasse = (mdp) => {
        window.__appels.push(['motDePasse', mdp]);
        return attendre().then(() => ({ user: { id: 'essai' } }));
      };
      return true;
    };
    const t = setInterval(() => { if (poser()) clearInterval(t); }, 2);
  }, options);
}

async function allerAuLogin(page) {
  await page.evaluate(() => { location.hash = '#login'; });
  await page.waitForTimeout(250);
}

test.beforeEach(async ({ page }) => { await doubler(page); });

test('les trois étapes se suivent, une seule à la fois', async ({ page }) => {
  await ouvrir(page);
  await allerAuLogin(page);

  await expect(page.locator('#mdpBloc'), 'le parcours est replié au départ').toBeHidden();
  await page.locator('#mdpOublie').click();
  await expect(page.locator('#mdpEtape1')).toBeVisible();
  await expect(page.locator('#mdpEtape2')).toBeHidden();
  await expect(page.locator('#mdpEtape3')).toBeHidden();

  await page.locator('#loginId').fill('pilote@exemple.fr');
  await page.locator('#mdpDemander').click();
  await expect(page.locator('#mdpEtape2')).toBeVisible();
  await expect(page.locator('#mdpEtape1')).toBeHidden();
  /* L'étape 3 ne doit PAS être là : sans session de récupération ouverte,
     updateUser échouerait, et proposer le champ reviendrait à faire saisir un
     mot de passe pour rien. */
  await expect(page.locator('#mdpEtape3'), 'le mot de passe ne se demande qu\'après le code').toBeHidden();

  await page.locator('#mdpCode').fill('12345678');
  await page.locator('#mdpValider').click();
  await expect(page.locator('#mdpEtape3')).toBeVisible();
  await expect(page.locator('#mdpEtape2')).toBeHidden();
});

test('le message d\'envoi ne dit pas si le compte existe', async ({ page }) => {
  /* Sinon comparer les deux réponses suffirait à savoir quelles adresses ont
     un compte ici — la même prudence que « adresse ou mot de passe incorrect »,
     qui ne dit pas lequel des deux est faux. */
  await ouvrir(page);
  await allerAuLogin(page);
  await page.locator('#mdpOublie').click();
  await page.locator('#loginId').fill('inconnu@exemple.fr');
  await page.locator('#mdpDemander').click();
  await expect(page.locator('#loginMsg')).toContainText(/si un compte existe/i);
});

test('un code faux laisse à l\'étape 2 avec un motif clair', async ({ page }) => {
  await ouvrir(page);
  await allerAuLogin(page);
  await page.locator('#mdpOublie').click();
  await page.locator('#loginId').fill('pilote@exemple.fr');
  await page.locator('#mdpDemander').click();
  await page.locator('#mdpCode').fill('00000000');
  await page.locator('#mdpValider').click();
  await expect(page.locator('#loginMsg')).toContainText(/code incorrect ou expiré/i);
  await expect(page.locator('#mdpEtape3'), 'un code faux n\'ouvre pas l\'étape du mot de passe').toBeHidden();
  await expect(page.locator('#mdpEtape2')).toBeVisible();
});

test('le code consommé ne reste pas dans le DOM', async ({ page }) => {
  await ouvrir(page);
  await allerAuLogin(page);
  await page.locator('#mdpOublie').click();
  await page.locator('#loginId').fill('pilote@exemple.fr');
  await page.locator('#mdpDemander').click();
  await page.locator('#mdpCode').fill('12345678');
  await page.locator('#mdpValider').click();
  await expect(page.locator('#mdpEtape3')).toBeVisible();
  await expect(page.locator('#mdpCode')).toHaveValue('');
});

test('le nouveau mot de passe part à Supabase, puis quitte les deux champs', async ({ page }) => {
  await ouvrir(page);
  await allerAuLogin(page);
  await page.locator('#mdpOublie').click();
  await page.locator('#loginId').fill('pilote@exemple.fr');
  await page.locator('#mdpDemander').click();
  await page.locator('#mdpCode').fill('12345678');
  await page.locator('#mdpValider').click();
  await expect(page.locator('#mdpEtape3')).toBeVisible();

  await page.locator('#mdpNouveau').fill('unMotDePasseSolide');
  await page.locator('#mdpConfirme').fill('unMotDePasseSolide');
  await page.locator('#mdpEnregistrer').click();
  await page.waitForTimeout(200);

  const appels = await page.evaluate(() => window.__appels);
  expect(appels.some(a => a[0] === 'motDePasse' && a[1] === 'unMotDePasseSolide')).toBe(true);
  /* Un mot de passe qui reste dans un champ finit dans une capture d'écran,
     dans un gestionnaire de formulaires, ou sous les yeux du suivant. */
  await expect(page.locator('#mdpNouveau')).toHaveValue('');
  await expect(page.locator('#mdpConfirme')).toHaveValue('');
});

test('deux mots de passe différents sont refusés AVANT d\'atteindre Supabase', async ({ page }) => {
  await ouvrir(page);
  await allerAuLogin(page);
  await page.locator('#mdpOublie').click();
  await page.locator('#loginId').fill('pilote@exemple.fr');
  await page.locator('#mdpDemander').click();
  await page.locator('#mdpCode').fill('12345678');
  await page.locator('#mdpValider').click();
  await page.locator('#mdpNouveau').fill('unMotDePasseSolide');
  await page.locator('#mdpConfirme').fill('unAutreMotDePasse');
  await page.locator('#mdpEnregistrer').click();
  await expect(page.locator('#loginMsg')).toContainText(/ne correspondent pas/i);
  const appels = await page.evaluate(() => window.__appels);
  expect(appels.some(a => a[0] === 'motDePasse')).toBe(false);
});

test('un second envoi immédiat est retenu, avec le temps restant', async ({ page }) => {
  await ouvrir(page);
  await allerAuLogin(page);
  await page.locator('#mdpOublie').click();
  await page.locator('#loginId').fill('pilote@exemple.fr');
  await page.locator('#mdpDemander').click();
  await expect(page.locator('#mdpEtape2')).toBeVisible();

  await page.locator('#mdpRenvoyer').click();
  await expect(page.locator('#loginMsg')).toContainText(/patientez \d+ seconde/i);
  const appels = await page.evaluate(() => window.__appels.filter(a => a[0] === 'envoyer'));
  expect(appels.length, 'le second envoi ne doit pas partir').toBe(1);
});

test('les deux portes ne s\'ouvrent jamais ensemble', async ({ page }) => {
  /* Deux champs « code » à l'écran, c'est l'assurance de coller le code dans
     le mauvais — et les deux jetons ne sont pas interchangeables. */
  await ouvrir(page);
  await allerAuLogin(page);
  await page.locator('#mdpOublie').click();
  await expect(page.locator('#mdpBloc')).toBeVisible();

  await page.locator('#loginId').fill('pilote@exemple.fr');
  await page.locator('#logCodeDemander').click();
  await expect(page.locator('#mdpBloc'), 'ouvrir une porte referme l\'autre').toBeHidden();
});
