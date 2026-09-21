/* =============================================================================
   Albatros VFR — LA FUSION DES RÉGLAGES ENTRE DEUX APPAREILS
   -----------------------------------------------------------------------------
   ┌─ LE SCÉNARIO QUI A MOTIVÉ TOUT ÇA ──────────────────────────────────────┐
   │ On change le THÈME sur son téléphone, puis le DÉBIT DE LA VOIX sur son  │
   │ ordinateur. Avant le 20/09/2026, `_maj` portait sur l'objet entier : le  │
   │ plus récent des deux écrasait l'autre, et le premier changement          │
   │ disparaissait SANS le moindre message. C'est le seul genre de perte que  │
   │ le § 7.1 de CLAUDE.md déclare non négociable.                            │
   └──────────────────────────────────────────────────────────────────────────┘

   Ces tests appellent `RTDonnees.fusionnerReglages(local, base)` — la fonction
   est exposée pour ça, et pour rien d'autre. Aucune porte dérobée : elle est
   pure, elle ne lit ni le stockage ni le réseau, elle prend deux objets et
   rend le troisième.

   LA RÈGLE, tranchée par le développeur le 20/09/2026 : le plus récent gagne,
   CLÉ PAR CLÉ, sans exception — y compris quand la valeur la plus récente est
   le retour au défaut.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir } from './_aide.js';

const HIER   = '2026-09-19T10:00:00.000Z';
const CEMATIN = '2026-09-20T08:00:00.000Z';
const MIDI   = '2026-09-20T12:00:00.000Z';

async function fusionner(page, local, base) {
  return page.evaluate(([l, b]) => window.RTDonnees.fusionnerReglages(l, b), [local, base]);
}

test.beforeEach(async ({ page }) => {
  await ouvrir(page);
  await page.waitForFunction(() => window.RTDonnees && window.RTDonnees.fusionnerReglages);
});

test('deux appareils, deux réglages différents : AUCUN des deux ne se perd', async ({ page }) => {
  /* Le téléphone a changé le thème ce matin. L'ordinateur a changé la voix à
     midi. Avec l'ancienne règle, l'ordinateur gagnait en entier et le thème
     revenait en arrière tout seul. */
  const telephone  = { theme:'dark',  debit:1.0, _maj:CEMATIN, _majCles:{ theme:CEMATIN, debit:HIER } };
  const ordinateur = { theme:'light', debit:1.6, _maj:MIDI,    _majCles:{ theme:HIER,    debit:MIDI } };

  const f = await fusionner(page, telephone, ordinateur);
  expect(f.theme, 'le thème du téléphone était le plus récent').toBe('dark');
  expect(f.debit, 'le débit de l\'ordinateur était le plus récent').toBe(1.6);
});

test('la fusion donne le même résultat dans les deux sens', async ({ page }) => {
  /* Sinon le résultat dépendrait de quel appareil se connecte en premier —
     et deux appareils finiraient par se renvoyer indéfiniment deux états
     différents, chacun se croyant à jour. */
  const a = { theme:'dark',  debit:1.0, _majCles:{ theme:MIDI,    debit:HIER } };
  const b = { theme:'light', debit:1.6, _majCles:{ theme:CEMATIN, debit:MIDI } };

  const ab = await fusionner(page, a, b);
  const ba = await fusionner(page, b, a);
  expect(ab).toEqual(ba);
});

test('un réglage remis à SA VALEUR PAR DÉFAUT redescend chez les autres', async ({ page }) => {
  /* La question posée au développeur, et sa réponse : oui. Remettre un réglage
     à zéro est un choix comme un autre. Le traiter à part aurait voulu dire
     distinguer « je n'ai jamais touché ce réglage » de « je l'ai remis à
     zéro » — deux états qui se ressemblent. */
  const remisAZero = { debit:1.0, _majCles:{ debit:MIDI } };     // 1.0 = le défaut
  const ancien     = { debit:1.8, _majCles:{ debit:CEMATIN } };

  const f = await fusionner(page, remisAZero, ancien);
  expect(f.debit, 'le retour au défaut est le plus récent : il gagne').toBe(1.0);
});

test('un réglage que SEUL un appareil connaît n\'est pas effacé', async ({ page }) => {
  /* Le cas d'une version plus récente de l'application : elle ajoute un
     réglage que l'autre appareil n'a jamais vu. Sans cette garantie, se
     connecter depuis un vieux navigateur effacerait le réglage neuf. */
  const neuf   = { theme:'dark', bruitRadio:0.4, _majCles:{ theme:HIER, bruitRadio:MIDI } };
  const ancien = { theme:'dark', _majCles:{ theme:CEMATIN } };

  const f = await fusionner(page, neuf, ancien);
  expect(f.bruitRadio, 'le réglage inconnu de l\'autre côté survit').toBe(0.4);
  expect(f.theme).toBe('dark');
});

test('les réglages d\'AVANT la fusion par clé ne valent pas zéro', async ({ page }) => {
  /* La migration. Ce qui est déjà en base n'a qu'un `_maj` global : il date le
     dernier changement, donc c'est le meilleur horodatage connu pour chacune
     de ses clés. Sans ce repli, tout l'existant vaudrait zéro et se ferait
     écraser par le premier appareil qui écrit. */
  const ancienneForme = { theme:'dark', debit:1.6, _maj:MIDI };         // pas de _majCles
  const nouvelleForme = { theme:'light', debit:1.0, _majCles:{ theme:HIER, debit:HIER } };

  const f = await fusionner(page, ancienneForme, nouvelleForme);
  expect(f.theme, 'l\'ancienne forme est plus récente : elle gagne').toBe('dark');
  expect(f.debit).toBe(1.6);
  expect(f._majCles.theme, 'et elle repart avec des horodatages par clé').toBe(MIDI);
});

test('une base vide ne vide pas l\'appareil', async ({ page }) => {
  /* Un compte qui n'a jamais rien enregistré : ses réglages locaux doivent
     MONTER, pas disparaître. */
  const local = { theme:'dark', debit:1.6, _maj:MIDI };
  const f = await fusionner(page, local, {});
  expect(f.theme).toBe('dark');
  expect(f.debit).toBe(1.6);
});

test('le `_maj` global reste le plus récent des horodatages par clé', async ({ page }) => {
  /* Les versions de l'application qui ne lisent que `_maj` doivent continuer
     de se comporter correctement entre elles. */
  const a = { theme:'dark', _majCles:{ theme:HIER } };
  const b = { debit:1.6,    _majCles:{ debit:MIDI } };
  const f = await fusionner(page, a, b);
  expect(f._maj).toBe(MIDI);
});

test('un réglage touché est le seul réestampillé', async ({ page }) => {
  /* Bout à bout, par la vraie porte : rtSaveSettings() → reglagesModifies().
     Si `reglagesModifies` réestampillait TOUT, cet appareil gagnerait sur des
     réglages qu'il n'a jamais touchés — et la fusion par clé ne servirait à
     rien. */
  /* Les réglages doivent exister AVANT le chargement — c'est la situation
     réelle, et c'est celle qui compte : le module photographie l'état au
     chargement du fichier. Les poser après puis recharger revient au même,
     et évite de dépendre de l'ordre des scripts. */
  await page.evaluate(() => {
    localStorage.setItem('rt-settings', JSON.stringify({
      theme:'light', debit:1.0,
      _maj:'2026-09-19T10:00:00.000Z',
      _majCles:{ theme:'2026-09-19T10:00:00.000Z', debit:'2026-09-19T10:00:00.000Z' }
    }));
  });
  await page.reload();
  await page.waitForFunction(() => window.RTDonnees && window.RTDonnees.reglagesModifies);

  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rt-settings'));
    s.theme = 'dark';                       // on ne touche QUE le thème
    localStorage.setItem('rt-settings', JSON.stringify(s));
    window.RTDonnees.reglagesModifies();
  });
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('rt-settings')));
  expect(s._majCles.theme, 'le thème vient de changer').not.toBe('2026-09-19T10:00:00.000Z');
  expect(s._majCles.debit, 'le débit n\'a pas bougé : son horodatage non plus')
    .toBe('2026-09-19T10:00:00.000Z');
});
