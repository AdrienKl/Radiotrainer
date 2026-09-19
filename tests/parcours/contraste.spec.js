/* =============================================================================
   AVIERO — LE CONTRASTE DES DEUX THÈMES
   -----------------------------------------------------------------------------
   Quatorze pages, deux thèmes, ~1 350 relevés. Le seuil est celui de WCAG 2.1
   AA : 4,5:1 pour du texte courant, 3:1 pour du grand texte.

   ┌─ POURQUOI CE FICHIER EXISTE ────────────────────────────────────────────┐
   │ INSCRIPTION.md § 8 décrit un défaut de contraste « constaté et non       │
   │ corrigé » : --ink-2 (#6b7280) tient sur du blanc et lâche dès qu'il      │
   │ porte du petit texte ailleurs. Le § 8 concluait que le corriger          │
   │ « revient à basculer --ink-2 partout : c'est un audit, pas une retouche  │
   │ au passage » — et l'audit n'existait pas, parce que l'outil qui l'avait  │
   │ fait (scratchpad/ins_contraste.py, 90 relevés) vivait dans un dossier    │
   │ NON VERSIONNÉ. Il a été perdu. CLAUDE.md § 21.6 le listait comme         │
   │ « à refaire ».                                                           │
   │                                                                          │
   │ CE QUE CE FICHIER A TROUVÉ À SA PREMIÈRE EXÉCUTION, le 20/09/2026 :      │
   │   · .scene-credit / .spell-credit — 3,48:1 en clair, 4,11:1 en sombre.   │
   │     C'est l'attribution des photos, à 11 px. Les licences ne l'exigent  │
   │     pas (LEGAL.md § 2 bis) — le projet la donne par choix ; un crédit    │
   │     illisible occupe la place sans rien créditer.                        │
   │   · .rx__head, .nav-tgl, .seg3-opt — 4,35:1. Tous les trois : --ink-2    │
   │     sur --surface-2. Le jeton --ink-2-fort existait déjà pour ce cas.    │
   │ Les trois sont corrigés. La bascule GLOBALE de --ink-2, elle, reste une  │
   │ décision du développeur (INSCRIPTION.md § 8) — et cette mesure dit       │
   │ maintenant ce qu'elle coûterait : plus rien d'autre n'est sous le seuil. │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌─ CE QUE CE TEST NE VOIT PAS, ET IL FAUT LE SAVOIR ──────────────────────┐
   │ Il lit les couleurs RÉSOLUES (getComputedStyle), pas les pixels d'une    │
   │ capture. Or le projet a déjà mesuré l'écart : --ink-2 donne 4,83:1 en    │
   │ théorie sur du blanc et 4,07:1 MESURÉ à 13,5 px, parce qu'à ces tailles  │
   │ l'antialiasing n'atteint jamais la couleur pleine (01-socle.css).        │
   │                                                                          │
   │ CE TEST EST DONC PLUS INDULGENT QUE LA RÉALITÉ. Un relevé « conforme »   │
   │ à 4,6:1 sur du texte de 11 px ne l'est probablement pas à l'œil. Il ne   │
   │ remplace pas un contrôle sur les pixels — il attrape ce qui échoue même  │
   │ dans l'hypothèse la plus favorable, ce qui est déjà beaucoup, et il      │
   │ tourne en trente secondes à chaque commit.                               │
   │                                                                          │
   │ C'est pourquoi les correctifs ci-dessus visent 6:1 et non 4,6:1 : la     │
   │ marge absorbe l'écart théorie/pixels.                                    │
   └──────────────────────────────────────────────────────────────────────────┘
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';
import { MESURER } from './_contraste.js';

/* Les six pages qu'on voit SANS compte — l'article 13 du RGPD les veut
   accessibles, donc lisibles. Puis les huit pages de l'application. */
const SANS_COMPTE = ['accueil', 'login', 'signup', 'cgu', 'confidentialite', 'mentions'];
const APPLICATIVES = ['tableau', 'exercices', 'navigation', 'carte', 'epellation',
                      'cours', 'progression', 'parametres'];

/* Les cartes entrent en fondu (.reveal, opacity 0 → 1). Mesurer trop tôt donne
   un fond « non mesurable » sur les deux tiers de la page : le premier jet
   comptait 554 renoncements pour 289 relevés, uniquement pour ça. On laisse la
   page se poser. */
const POSE = 900;

async function releverLaPage(page, releves, nom) {
  await page.evaluate(r => { location.hash = '#' + r; }, nom);
  await page.waitForTimeout(POSE);
  for (const x of await page.evaluate(MESURER)) releves.push({ page: nom, ...x });
}

for (const theme of ['light', 'dark']) {
  test(`le contraste tient sur les quatorze pages — thème ${theme}`, async ({ page }) => {
    test.setTimeout(120000);

    /* Le thème se pose par le réglage que l'utilisateur pose lui-même, avant le
       premier pixel — c'est le petit script en tête d'index.html qui le lit. */
    await page.addInitScript(t => {
      try { localStorage.setItem('rt-settings', JSON.stringify({ theme: t })); } catch (e) {}
    }, theme);

    await ouvrir(page);
    const releves = [];
    for (const p of SANS_COMPTE) await releverLaPage(page, releves, p);
    await entrer(page, 'tableau');
    for (const p of APPLICATIVES) await releverLaPage(page, releves, p);

    const mesures = releves.filter(x => !x.nonMesurable);
    const aveugles = releves.filter(x => x.nonMesurable);

    /* GARDE-FOU CONTRE UN TEST DEVENU AVEUGLE. Une image de fond, un dégradé ou
       un ancêtre en opacity < 1 rendent la mesure impossible : on les déclare
       plutôt que de les deviner. Mais si un jour la proportion s'effondre, ce
       test passerait au vert en n'ayant plus rien regardé. C'est exactement le
       piège décrit dans _aide.js à propos des filtres de console. */
    const part = mesures.length / releves.length;
    expect(part, `seuls ${mesures.length} relevés sur ${releves.length} ont pu être mesurés `
      + `(${aveugles.length} fonds non mesurables). Le test ne regarde presque plus rien : `
      + `vérifier ce qui a introduit une image de fond ou une opacité sur les conteneurs.`)
      .toBeGreaterThan(0.65);

    const fautifs = mesures.filter(x => !x.conforme && !x.inactif);
    const message = fautifs.map(f =>
      `\n  ${f.rapport}:1 (seuil ${f.seuil}, ${f.taille}px${f.gras ? ' gras' : ''})`
      + ` page « ${f.page} »\n     ${f.avant} sur ${f.arriere}`
      + `\n     ${f.ou}\n     « ${f.texte} »`).join('');

    expect(fautifs.length,
      `${fautifs.length} texte(s) sous le seuil WCAG AA en thème ${theme} :${message}\n\n`
      + `  Rappel : ce test lit les couleurs résolues, pas les pixels — la réalité est\n`
      + `  PIRE que ce chiffre à petite taille. Viser 6:1, pas 4,6:1.\n`)
      .toBe(0);

    console.log(`  thème ${theme} : ${mesures.length} relevés conformes, `
      + `${aveugles.length} fonds non mesurables (image, dégradé ou opacité), `
      + `${mesures.filter(x => x.inactif && !x.conforme).length} composant(s) inactif(s) exemptés`);
  });
}
