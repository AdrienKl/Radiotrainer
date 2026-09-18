/* =============================================================================
   AVIERO — REGÉNÈRE inventaire.json À PARTIR DU SITE TEL QU'IL EST
   -----------------------------------------------------------------------------
   À lancer À LA MAIN, jamais depuis les tests :

       node tests/contrat/_geler.mjs

   POURQUOI CE N'EST PAS AUTOMATIQUE
   Un inventaire qui se régénère tout seul ne surveille rien : il enregistrerait
   la suppression accidentelle d'un symbole comme un fait nouveau, et le test
   redeviendrait vert sans que personne ne sache ce qui a disparu. Le geler est
   un geste volontaire. On le refait quand on a DÉCIDÉ que le contrat change, et
   le `git diff` du fichier dit alors exactement ce qu'on a décidé.

   Autrement dit : un test rouge ne se répare pas en relançant ce script. Il se
   répare en regardant ce qui manque, puis — si le changement est voulu — en
   relançant ce script et en lisant son diff avant de commiter.
   ========================================================================== */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE, lire, scripts, styles, declarationsRacine, utilise, VENDOR,
         elementsDuTableau, toutLeCode } from './_source.mjs';

const nos = scripts().filter(s => !VENDOR.includes(s.src));

/* ---- Les symboles qui traversent la frontière d'un script ---------------- */
const declarePar = new Map();          // symbole -> index du script qui le déclare
nos.forEach((s, i) => {
  for (const nom of declarationsRacine(s.code)) {
    if (!declarePar.has(nom)) declarePar.set(nom, i);
  }
});

const partages = [];
for (const [nom, iDecl] of [...declarePar].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (nom.length < 3) continue;
  const lecteurs = nos
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => i !== iDecl && utilise(s.code, nom))
    .map(({ s }) => s.origine);
  if (lecteurs.length) partages.push({ nom, declare: nos[iDecl].origine, lu_par: lecteurs });
}

/* ---- Les lectures différées, connues et acceptées ------------------------
   Un fichier peut lire un symbole declaré plus loin, à une condition : que la
   lecture ne se produise pas au chargement. C'est le cas d'un appel écrit dans
   le corps d'une fonction, qui n'est évalué que le jour où la fonction est
   appelée.

   Le cas réel du projet : `assets/donnees/phraseologie-scenarios.js` n'est pas
   que des données. Le scénario « navigation » y porte un `buildTours()` qui
   construit ses échanges sur l'espace aérien réel au-dessus du terrain choisi,
   et qui appelle donc le moteur (`state`, `codeSSR()`, `numVariants()`). Ces
   appels ont lieu au lancement du scénario, pas au chargement de la page.

   On les inscrit ici plutôt que d'assouplir la règle : ce qui est inscrit se
   relit dans un diff, ce qui est assoupli ne se relit plus jamais. */
const lecturesDifferees = [];
for (const [nom, iDecl] of declarePar) {
  nos.forEach((s, i) => {
    if (i >= iDecl || !utilise(s.code, nom)) return;
    if (new RegExp(`typeof\\s+${nom}\\b`).test(s.code)) return;   // déjà gardé
    lecturesDifferees.push(`${nom}@${s.origine}`);
  });
}
lecturesDifferees.sort();

/* ---- Le routeur --------------------------------------------------------- */
const html = lire('index.html');
const lstPages = /var\s+PAGES\s*=\s*\[([^\]]+)\]/.exec(html);
const lstApp = /var\s+APP_PAGES\s*=\s*\[([^\]]+)\]/.exec(html);
const liste = m => m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);

/* ---- Les scénarios ------------------------------------------------------
   On enregistre aussi, pour chacun, le nombre de collationnements attendus et
   le nombre de renvois au manuel. Ce sont les deux chiffres qui disent qu'un
   scénario n'a pas été appauvri en cours de route : perdre un échange, ou
   perdre la page du manuel qui le justifie, ne se voit pas autrement. */
const codeTout = toutLeCode();
const scenarios = (elementsDuTableau(codeTout, 'SCENARIOS') || []).map(p => ({
  id: (/id\s*:\s*"([a-z]+)"/.exec(p) || [])[1],
  titre: (/titre\s*:\s*"([^"]+)"/.exec(p) || [])[1],
  attendus: (p.match(/\battendu\s*:/g) || []).length,
  refs_manuel: (p.match(/[Mm]anuel DSNA p\./g) || []).length
}));

const inv = {
  _lisezmoi: 'Genere par tests/contrat/_geler.mjs. Ne pas modifier a la main : regenerer et lire le diff.',
  gele_le: new Date().toISOString().slice(0, 10),
  ordre_scripts: scripts().map(s => s.origine),
  ordre_styles: styles().map(s => s.origine),
  symboles_partages: partages,
  lectures_differees: lecturesDifferees,
  cles_stockage: [...new Set(
    ((lire('index.html') + nos.map(s => s.code).join('\n'))
      .match(/['"](rt-[a-z-]+|radiotrainer_history_v2)['"]/g) || [])
      .map(s => s.replace(/['"]/g, ''))
  )].sort(),
  pages: lstPages ? liste(lstPages) : [],
  pages_application: lstApp ? liste(lstApp) : [],
  scenarios
};

writeFileSync(join(RACINE, 'tests/contrat/inventaire.json'), JSON.stringify(inv, null, 2) + '\n');
console.log(`inventaire.json regenere :
  ${inv.ordre_scripts.length} scripts, ${inv.ordre_styles.length} feuilles de style
  ${inv.symboles_partages.length} symboles traversent une frontiere de script
  ${inv.cles_stockage.length} cles de stockage
  ${inv.pages.length} pages de routeur, ${inv.scenarios.length} scenarios`);
