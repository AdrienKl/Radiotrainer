/* =============================================================================
   Albatros VFR — CONTACT / FEEDBACK
   -----------------------------------------------------------------------------
   Ce que ce fichier surveille, et pourquoi chaque point a sa raison d'être :

   1. LE BOUTON N'EST PAS UN LIEN DE NAVIGATION. Le routeur relie tout
      [data-page] à une <section>. Le jour où quelqu'un ajoutera un
      data-page="contact" au bouton « par cohérence avec les autres entrées du
      menu », la modale cessera de s'ouvrir et la page tombera sur l'accueil —
      SANS erreur de console, puisque « contact » n'est pas dans PAGES.

   2. LE DOUBLE ENVOI. Deux clics rapides sur « Envoyer » postent deux fois : on
      reçoit le même message en double, et l'utilisateur ne voit rien. Le test
      compte les requêtes réellement parties.

   3. AUCUNE REDIRECTION. Formspree redirige vers sa page de remerciement quand
      on lui poste un formulaire à l'ancienne. Perdre la page à cet instant,
      c'est perdre le scénario en cours. Le test vérifie qu'on est toujours sur
      index.html après l'envoi, et que la confirmation est DANS la modale.

   4. LE CONTEXTE. Ce qui est joint automatiquement doit désigner la page d'où
      l'on écrit — c'est l'intérêt de la chose.

   FORMSPREE N'EST JAMAIS APPELÉ ICI. Toutes les requêtes vers formspree.io sont
   interceptées et la réponse est fabriquée, pour la même raison que Supabase est
   coupé dans _aide.js : une suite de tests n'envoie pas de vrais messages dans
   une vraie boîte de réception, et ne dépend pas d'un service distant.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

const ENDPOINT = '**://formspree.io/**';

/* Intercepte Formspree et rend la réponse demandée. Renvoie le tableau VIVANT
   des corps réellement postés — à lire après les actions du test. */
async function doublerFormspree(page, { statut = 200, corps = { ok: true } } = {}) {
  const envois = [];
  await page.route(ENDPOINT, async route => {
    envois.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({
      status: statut,
      contentType: 'application/json',
      body: JSON.stringify(corps)
    });
  });
  return envois;
}

test('le bouton du menu ouvre la modale et ne navigue pas', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'exercices');

  /* En largeur téléphone, la barre latérale est un tiroir : l'entrée n'est
     atteignable qu'après le hamburger. Passer par `force: true` aurait fait
     « passer » le test sans jamais prouver que le bouton est cliquable là où
     l'utilisateur le voit. */
  const hamburger = page.locator('#hamburger');
  if (await hamburger.isVisible()) await hamburger.click();

  await page.locator('.sidelink[data-contact]').click();

  await expect(page.locator('#contactModal')).toBeVisible();
  /* Le point entier de ce test : la page N'A PAS changé. Un data-page="contact"
     aurait peint l'accueil derrière la modale sans le moindre message. */
  expect(await page.evaluate(() => location.hash)).toBe('#exercices');
  await expect(page.locator('#page-exercices')).toBeVisible();
  expect(erreurs).toEqual([]);
});

test('le lien du pied de page ouvre la modale sans compte', async ({ page }) => {
  /* Un visiteur qui n'a pas de compte doit pouvoir signaler que l'inscription
     ne marche pas — c'est même le signalement le plus utile. */
  await ouvrir(page);
  await page.locator('footer [data-contact]').click();
  await expect(page.locator('#contactModal')).toBeVisible();
  await expect(page.locator('#ctChoix')).toBeVisible();
});

test('les deux natures ouvrent deux formulaires différents', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');

  await page.evaluate(() => window.rtContactOuvrir());
  await page.locator('[data-ct-nature="bug"]').click();
  await expect(page.locator('#ctDescription')).toBeVisible();
  await expect(page.locator('#ctPage')).toBeVisible();
  await expect(page.locator('#ctIdee')).toBeHidden();

  await page.locator('#ctRetour').click();
  await page.locator('[data-ct-nature="amelioration"]').click();
  await expect(page.locator('#ctIdee')).toBeVisible();
  await expect(page.locator('#ctPourquoi')).toBeVisible();
  await expect(page.locator('#ctDescription')).toBeHidden();

  /* Les champs de l'autre nature sont DÉSACTIVÉS, pas seulement cachés : un
     champ caché mais actif part quand même dans le FormData, et un `required`
     posé dessus bloquerait une validation invisible à l'écran. */
  expect(await page.locator('#ctDescription').isDisabled()).toBe(true);
});

test('rien ne part sans e-mail ni sans description', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');
  const envois = await doublerFormspree(page);

  await page.evaluate(() => window.rtContactOuvrir('bug'));
  await page.locator('#ctEmail').fill('');
  await page.locator('#ctDescription').fill('le micro ne répond plus');
  await page.locator('#ctEnvoyer').click();
  await expect(page.locator('#ctMsg')).toBeVisible();
  expect(envois.length, 'un message est parti sans adresse').toBe(0);

  await page.locator('#ctEmail').fill('pilote@exemple.fr');
  await page.locator('#ctDescription').fill('');
  await page.locator('#ctEnvoyer').click();
  await expect(page.locator('#ctMsg')).toBeVisible();
  expect(envois.length, 'un message vide est parti').toBe(0);
});

test('un bug part avec son type et son contexte, et la confirmation reste dans la modale', async ({ page }) => {
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'navigation');
  const envois = await doublerFormspree(page);

  await page.evaluate(() => window.rtContactOuvrir('bug'));
  /* Le contexte est relevé à l'ouverture : il doit déjà désigner la Navigation. */
  await expect(page.locator('#ctContexteVal')).toContainText('Navigation');

  await page.locator('#ctEmail').fill('pilote@exemple.fr');
  await page.locator('#ctDescription').fill('La carte reste grise après un repli du menu.');
  await page.locator('#ctEnvoyer').click();

  await expect(page.locator('#ctFin')).toBeVisible();
  await expect(page.locator('#ctForm')).toBeHidden();
  /* Aucune redirection : on est toujours sur le site, et sur la même page. */
  expect(page.url()).toContain('index.html');
  expect(await page.evaluate(() => location.hash)).toBe('#navigation');

  expect(envois.length).toBe(1);
  expect(envois[0].type).toBe('Bug');
  expect(envois[0].email).toBe('pilote@exemple.fr');
  expect(envois[0].description).toContain('carte reste grise');
  expect(envois[0].contexte).toContain('Navigation');
  expect(erreurs).toEqual([]);
});

test('une amélioration part avec l\'idée, et le « pourquoi » reste facultatif', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'cours');
  const envois = await doublerFormspree(page);

  await page.evaluate(() => window.rtContactOuvrir('amelioration'));
  await page.locator('#ctEmail').fill('eleve@exemple.fr');
  await page.locator('#ctIdee').fill('Ajouter la phraséologie de la panne de transpondeur.');
  await page.locator('#ctEnvoyer').click();

  await expect(page.locator('#ctFin')).toBeVisible();
  expect(envois.length).toBe(1);
  expect(envois[0].type).toBe('Amélioration');
  expect(envois[0].idee).toContain('transpondeur');
  expect(envois[0].pourquoi).toBe('');          // parti quand même, et vide
});

test('deux clics sur « Envoyer » ne postent qu\'une fois', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');

  /* La doublure retient sa réponse : c'est pendant cette attente que le second
     clic se produit dans la vraie vie — un envoi instantané ne prouverait rien. */
  const envois = [];
  await page.route(ENDPOINT, async route => {
    envois.push(JSON.parse(route.request().postData() || '{}'));
    await new Promise(r => setTimeout(r, 600));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.evaluate(() => window.rtContactOuvrir('bug'));
  await page.locator('#ctEmail').fill('pilote@exemple.fr');
  await page.locator('#ctDescription').fill('Message envoyé deux fois ?');

  const envoyer = page.locator('#ctEnvoyer');
  await envoyer.click();
  /* Le clavier compte autant que la souris : un formulaire se soumet aussi par
     Entrée depuis un champ, et ce chemin-là ne passe pas par le bouton. */
  await page.locator('#ctEmail').press('Enter');
  await envoyer.click({ force: true });

  await expect(page.locator('#ctFin')).toBeVisible({ timeout: 5000 });
  expect(envois.length, 'le message est parti plus d\'une fois').toBe(1);
});

test('un refus de Formspree se dit, et laisse réessayer', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');
  await doublerFormspree(page, {
    statut: 422,
    corps: { errors: [{ message: 'Le champ e-mail est invalide.' }] }
  });

  await page.evaluate(() => window.rtContactOuvrir('bug'));
  await page.locator('#ctEmail').fill('pilote@exemple.fr');
  await page.locator('#ctDescription').fill('Un problème quelconque.');
  await page.locator('#ctEnvoyer').click();

  /* Le motif rendu par le service est repris tel quel : écrire « une erreur est
     survenue » alors qu'on sait quoi fait perdre du temps des deux côtés. */
  await expect(page.locator('#ctMsg')).toContainText('invalide');
  await expect(page.locator('#ctForm')).toBeVisible();
  await expect(page.locator('#ctFin')).toBeHidden();
  /* Et surtout : le bouton est rendu, sinon l'échec serait définitif. */
  await expect(page.locator('#ctEnvoyer')).toBeEnabled();
  /* Le message écrit n'est PAS perdu — le retaper après un échec serait la
     dernière chose qu'on fait avant de renoncer. */
  expect(await page.locator('#ctDescription').inputValue()).toContain('problème');
});

test('une coupure réseau se dit aussi', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');
  await page.route(ENDPOINT, route => route.abort());

  await page.evaluate(() => window.rtContactOuvrir('amelioration'));
  await page.locator('#ctEmail').fill('pilote@exemple.fr');
  await page.locator('#ctIdee').fill('Une idée quelconque.');
  await page.locator('#ctEnvoyer').click();

  await expect(page.locator('#ctMsg')).toBeVisible();
  await expect(page.locator('#ctEnvoyer')).toBeEnabled();
});

test('le scénario en cours est joint au message', async ({ page }) => {
  /* C'est le cas qui justifie la fonctionnalité : on signale un scénario
     pendant qu'on le fait, sans le quitter. */
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'exercices');
  const envois = await doublerFormspree(page);

  /* On passe par la porte existante — celle qu'emploie scenario.spec.js — au
     lieu de refaire le remplissage du champ d'aérodrome à la main : ce test
     porte sur le contexte joint au message, pas sur l'autocomplétion. */
  const lance = await page.evaluate(() => window.rtRelancerScenario(0, 'LFBD'));
  expect(lance, 'le scénario 0 n\'a pas démarré').toBe(true);
  await expect(page.locator('#panel')).toBeVisible();

  const titre = (await page.locator('.sc-btn[aria-current="true"] .sc-t').innerText()).trim();

  await page.evaluate(() => window.rtContactOuvrir('bug'));
  await expect(page.locator('#ctContexteVal')).toContainText(titre);
  /* Le champ « page ou scénario concerné » part pré-rempli, et reste modifiable. */
  expect(await page.locator('#ctPage').inputValue()).toContain(titre);

  await page.locator('#ctEmail').fill('pilote@exemple.fr');
  await page.locator('#ctDescription').fill('Le collationnement attendu me semble faux.');
  await page.locator('#ctEnvoyer').click();
  await expect(page.locator('#ctFin')).toBeVisible();

  expect(envois[0].contexte).toContain(titre);
  /* Et le scénario est toujours là derrière : on n'a rien perdu. */
  await page.locator('#ctFin [data-ct-fermer]').click();
  await expect(page.locator('#panel')).toBeVisible();
  expect(erreurs).toEqual([]);
});

test('Échap et le clic sur le fond referment la modale', async ({ page }) => {
  await ouvrir(page);
  await entrer(page, 'tableau');

  await page.evaluate(() => window.rtContactOuvrir());
  await page.keyboard.press('Escape');
  await expect(page.locator('#contactModal')).toBeHidden();

  await page.evaluate(() => window.rtContactOuvrir());
  await page.locator('#contactModal').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#contactModal')).toBeHidden();
});

/* ---------------------------------------------------------------------------
   LE CONTRASTE DE LA MODALE

   contraste.spec.js relève les quatorze PAGES — et une modale vit hors de
   `.page`, donc n'y entrait pas. Ces deux vérifications comblent le trou pour
   la seule surface ajoutée ici, avec le même outil et le même seuil.

   Rappel de contraste.spec.js, qui vaut aussi ici : la mesure lit les couleurs
   résolues, pas les pixels — elle est donc PLUS INDULGENTE que la réalité à
   petite taille. On vise 6:1, pas 4,6:1.
   ------------------------------------------------------------------------- */
import { MESURER } from './_contraste.js';

for (const theme of ['light', 'dark']) {
  test(`le contraste de la modale tient — thème ${theme}`, async ({ page }) => {
    await page.addInitScript(t => {
      try { localStorage.setItem('rt-settings', JSON.stringify({ theme: t })); } catch (e) {}
    }, theme);
    await ouvrir(page);
    await entrer(page, 'tableau');
    await doublerFormspree(page);

    const releves = [];
    const relever = async etiquette => {
      await page.waitForTimeout(150);
      for (const x of await page.evaluate(MESURER, '#contactModal')) releves.push({ vue: etiquette, ...x });
    };

    await page.evaluate(() => window.rtContactOuvrir());
    await relever('choix');
    await page.locator('[data-ct-nature="bug"]').click();
    await relever('bug');
    await page.locator('#ctRetour').click();
    await page.locator('[data-ct-nature="amelioration"]').click();
    await relever('amélioration');

    /* La vue de confirmation, et le bandeau d'erreur : deux surfaces qu'on ne
       voit qu'une fois, et qu'on ne relit donc jamais. */
    await page.locator('#ctEmail').fill('pilote@exemple.fr');
    await page.locator('#ctIdee').fill('Une idée quelconque.');
    await page.locator('#ctEnvoyer').click();
    await expect(page.locator('#ctFin')).toBeVisible();
    await relever('confirmation');

    await page.locator('#ctAutre').click();
    await page.locator('[data-ct-nature="bug"]').click();
    await page.locator('#ctEmail').fill('pas-une-adresse');
    await page.locator('#ctEnvoyer').click();
    await expect(page.locator('#ctMsg')).toBeVisible();
    await relever('erreur');

    const mesures = releves.filter(x => !x.nonMesurable);
    expect(mesures.length, 'rien n\'a pu être mesuré : la modale ne s\'ouvrait pas')
      .toBeGreaterThan(10);

    const fautifs = mesures.filter(x => !x.conforme && !x.inactif);
    const message = fautifs.map(f =>
      `\n  ${f.rapport}:1 (seuil ${f.seuil}, ${f.taille}px${f.gras ? ' gras' : ''}) vue « ${f.vue} »`
      + `\n     ${f.avant} sur ${f.arriere}\n     ${f.ou}\n     « ${f.texte} »`).join('');
    expect(fautifs.length,
      `${fautifs.length} texte(s) de la modale sous le seuil WCAG AA en thème ${theme} :${message}\n`)
      .toBe(0);

    console.log(`  modale, thème ${theme} : ${mesures.length} relevés conformes, `
      + `${releves.length - mesures.length} fonds non mesurables`);
  });
}
