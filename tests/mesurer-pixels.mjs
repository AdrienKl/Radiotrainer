/* =============================================================================
   Albatros VFR — LE CONTRASTE SUR LES PIXELS, PAS SUR LES VALEURS CSS
   -----------------------------------------------------------------------------
   Le dernier morceau de `scratchpad/ins_contraste.py`, l'outil perdu. Il
   répond à UNE question, restée ouverte depuis le 18/09/2026 :

       faut-il basculer --ink-2 (#6b7280) vers une valeur plus sombre
       dans tout le site ? (INSCRIPTION.md § 8)

   ┌─ POURQUOI LES VALEURS CSS NE SUFFISENT PAS ─────────────────────────────┐
   │ tests/parcours/contraste.spec.js lit les couleurs RÉSOLUES. C'est large │
   │ (~1 350 relevés), c'est rapide, et c'est INDULGENT : le projet a lui-   │
   │ même mesuré l'écart — --ink-2 donne 4,83:1 en théorie sur du blanc et   │
   │ 4,07:1 en pixels à 13,5 px. À ces tailles le noyau des glyphes n'atteint│
   │ jamais la couleur déclarée : l'antialiasing le mélange au fond.         │
   │                                                                          │
   │ Ce qui passe à 4,6:1 « en théorie » peut donc échouer à l'œil, et c'est │
   │ exactement la zone où vit --ink-2. Seuls les pixels tranchent.          │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌─ COMMENT ON LIT UN PIXEL DE TEXTE ──────────────────────────────────────┐
   │ On capture l'élément, puis on trie ses pixels par luminance.            │
   │   · le FOND est la valeur la plus fréquente (un aplat domine toujours   │
   │     une ligne de texte en surface) ;                                    │
   │   · le TEXTE est le centile extrême du côté opposé au fond — le noyau   │
   │     des glyphes, ce que l'œil lit réellement.                           │
   │ On prend le 5e centile et non le pixel unique le plus extrême : un seul │
   │ pixel peut venir d'un liseré, d'un curseur ou d'une bordure, et dirait  │
   │ un contraste meilleur que ce qui est lisible.                           │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌─ POURQUOI CE N'EST PAS UN TEST ─────────────────────────────────────────┐
   │ Le rendu d'une police dépend de la machine, de l'échelle et de la       │
   │ version de Chromium. Un seuil dur ici rougirait un jour chez quelqu'un  │
   │ d'autre sans qu'aucun code ait changé — et un test qu'on apprend à      │
   │ ignorer ne protège plus rien. C'est donc un OUTIL, lancé quand on veut  │
   │ la réponse, comme tests/comparer-rendu.mjs.                             │
   └──────────────────────────────────────────────────────────────────────────┘

   USAGE
       node tests/mesurer-pixels.mjs              les textes sous 16 px
       node tests/mesurer-pixels.mjs --tout       tous les textes
       node tests/mesurer-pixels.mjs --ink-2      seulement ce que --ink-2 porte

   Demande que le site soit servi : python3 -m http.server 8000
   ========================================================================== */
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const ARGS = process.argv.slice(2);
const TOUT = ARGS.includes('--tout');
const INK2_SEUL = ARGS.includes('--ink-2');
const TAILLE_MAX = TOUT ? 999 : 16;

const SANS_COMPTE = ['accueil', 'login', 'signup', 'cgu', 'confidentialite', 'mentions'];
const APPLICATIVES = ['tableau', 'exercices', 'navigation', 'carte', 'epellation',
                      'cours', 'progression', 'parametres'];

const rouge = t => `\x1b[31m${t}\x1b[0m`;
const jaune = t => `\x1b[33m${t}\x1b[0m`;
const vert  = t => `\x1b[32m${t}\x1b[0m`;

/* --- WCAG 2.1 ------------------------------------------------------------ */
const canal = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = p => 0.2126 * canal(p[0]) + 0.7152 * canal(p[1]) + 0.0722 * canal(p[2]);
const rapport = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/* --- Le fond et le noyau du texte, lus dans les pixels -------------------- */
const MARGE = 2;   /* voir « la bordure » ci-dessous */

function analyser(tampon, declaree) {
  const png = PNG.sync.read(tampon);
  const pixels = [];
  const comptes = new Map();

  /* ┌─ ON ROGNE DEUX PIXELS SUR CHAQUE BORD ──────────────────────────────┐
     │ Une BORDURE pleine est d'un seul ton, donc elle pèse d'un bloc dans │
     │ le décompte — alors que le texte, lissé, s'éparpille sur vingt      │
     │ nuances, et qu'un fond translucide posé sur une photo n'a pas deux  │
     │ pixels identiques. Résultat observé sur la pastille d'accroche de   │
     │ l'accueil : la bordure violette est sortie « couleur de fond », et  │
     │ le texte violet mesuré contre elle donnait 1,28:1.                  │
     │ Deux pixels suffisent, et emportent au passage l'escalier des coins │
     │ arrondis.                                                            │
     └───────────────────────────────────────────────────────────────────────┘ */
  const x0 = Math.min(MARGE, Math.floor(png.width / 4));
  const y0 = Math.min(MARGE, Math.floor(png.height / 4));
  for (let y = y0; y < png.height - y0; y++) {
    for (let x = x0; x < png.width - x0; x++) {
      const i = (png.width * y + x) << 2;
      if (png.data[i + 3] < 250) continue;               // transparent : hors sujet
      const p = [png.data[i], png.data[i + 1], png.data[i + 2]];
      pixels.push(p);
      const cle = (p[0] << 16) | (p[1] << 8) | p[2];
      comptes.set(cle, (comptes.get(cle) || 0) + 1);
    }
  }
  if (pixels.length < 40) return null;

  /* Le fond : la couleur la plus fréquente. */
  let meilleur = 0, cleFond = 0;
  for (const [cle, n] of comptes) if (n > meilleur) { meilleur = n; cleFond = cle; }
  let fond = [(cleFond >> 16) & 255, (cleFond >> 8) & 255, cleFond & 255];

  /* ┌─ SAUF QUAND LA BOÎTE EST REMPLIE PAR SON PROPRE TEXTE ──────────────┐
     │ Un <b> inline reçoit une boîte serrée autour de ses glyphes. En gras│
     │ et à petite taille, le TEXTE devient la couleur la plus fréquente : │
     │ on le mesurait alors contre lui-même, et « Chrome, Edge ou Safari » │
     │ ressortait à 1,00:1. Le vrai fond est alors l'autre extrême.        │
     │ On reconnaît le cas à ceci : la couleur dominante est celle que le  │
     │ CSS déclare pour le texte.                                          │
     └───────────────────────────────────────────────────────────────────────┘ */
  const proche = (a, b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]) < 12;
  let fondEstLeTexte = declaree && proche(fond, declaree);

  /* Le texte : le NOYAU des glyphes, du côté opposé au fond.
     ┌─ PAS UN CENTILE — UN RANG ────────────────────────────────────────┐
     │ Premier jet : « le 5e centile ». Faux, et faux en donnant des      │
     │ chiffres crédibles : du --ink (#242838) sur blanc ressortait à     │
     │ rgb(206,207,210), soit 1,56:1 au lieu de ~13:1. La raison est de   │
     │ proportion — dans la boîte d'une ligne de texte, les glyphes       │
     │ couvrent souvent MOINS de 5 % des pixels (interlignes, marges,     │
     │ espaces). Le 5e centile retombait donc dans le fond, et mesurait   │
     │ le fond contre lui-même.                                           │
     │ On prend un RANG absolu : le 10e pixel le plus extrême. Il tient   │
     │ quelle que soit la taille de la boîte, et reste à l'abri du pixel  │
     │ isolé d'un liseré, d'un curseur ou d'une bordure — lesquels ne     │
     │ sont jamais dix.                                                   │
     └─────────────────────────────────────────────────────────────────────┘ */
  const tries = pixels.slice().sort((a, b) => lum(a) - lum(b));
  const RANG = Math.min(9, tries.length - 1);

  /* DE QUEL CÔTÉ CHERCHER ? « Plus sombre que le fond si le fond est clair »
     suffit tant que le fond est franc. Il tombe dès qu'il est MI-CLAIR : sur
     le badge orange rgb(200,137,47) d'une pastille « Essai », l'outil est allé
     chercher du côté clair alors que le texte y est presque noir, et a rendu
     2,48:1 pour un texte qui en vaut plus de sept.
     On tranche donc par la couleur DÉCLARÉE, qu'on connaît : elle dit de quel
     côté du fond le texte se trouve. La mesure en pixels sert à savoir COMBIEN
     l'antialiasing en retire, pas à deviner ce qu'on cherche. */
  if (fondEstLeTexte) {
    /* La dominante EST le texte : le fond se lit à l'extrême opposé. */
    const lt = lum(fond);
    const autre = tries.map(p => [p, lum(p)]).reduce((a, b) =>
      Math.abs(b[1] - lt) > Math.abs(a[1] - lt) ? b : a);
    const texte = fond;
    fond = autre[0];
    return { pxFond: fond, pxTexte: texte, rapport: rapport(texte, fond),
             pixels: pixels.length, serree: true };
  }

  const lf2 = lum(fond);
  const versLeSombre = declaree ? lum(declaree) < lf2 : lf2 > 0.5;
  const texte = versLeSombre ? tries[RANG] : tries[tries.length - 1 - RANG];

  /* `pxTexte` / `pxFond` et non `texte` / `fond` : l'appelant fusionne cet
     objet avec celui de la page, qui porte deja un champ `texte` — la chaine
     lue. Le piege s'est referme ici au premier jet : le pixel ecrasait la
     phrase, et le rapport n'affichait plus de quel texte il parlait. */
  return { pxFond: fond, pxTexte: texte, rapport: rapport(texte, fond), pixels: pixels.length };
}

/* Le site doit être servi. Sans ce contrôle, Playwright échoue vingt secondes
   plus tard sur un net::ERR_CONNECTION_REFUSED noyé dans une trace. */
try {
  const r = await fetch('http://localhost:8000/index.html', { method: 'HEAD' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
} catch (e) {
  console.error(rouge('\n  Le site ne répond pas sur http://localhost:8000.'));
  console.error('  Le servir d\'abord, dans un autre terminal :\n');
  console.error('      python3 -m http.server 8000\n');
  process.exit(2);
}

const navigateur = await chromium.launch();
const resultats = [];
let ignores = 0;

for (const theme of ['light', 'dark']) {
  /* ┌─ LES ANIMATIONS D'ENTRÉE FAUSSENT TOUT, ET SILENCIEUSEMENT ──────────┐
     │ Premier jet : 120 textes « sous le seuil », dont du rgb(70,77,90)     │
     │ annoncé à 1,00:1 sur fond clair — impossible. La cause : `.reveal`    │
     │ part à opacity 0 et n'entre qu'au DÉFILEMENT. Or Playwright fait      │
     │ défiler l'élément pour le capturer : l'animation démarre, la capture  │
     │ part aussitôt, et on photographie un texte transparent. Le chiffre    │
     │ n'était pas « un peu optimiste », il était faux — et rouge, donc      │
     │ crédible.                                                             │
     │ On coupe par le réglage de l'application elle-même (`anim:false` pose │
     │ `html.no-anim`, qui force `.reveal{opacity:1 !important}`), et par    │
     │ `reducedMotion` pour les règles @media du CSS. Deux leviers qui       │
     │ existaient déjà : on n'invente rien pour le test.                     │
     └───────────────────────────────────────────────────────────────────────┘ */
  const contexte = await navigateur.newContext({ locale: 'fr-FR', reducedMotion: 'reduce' });
  const page = await contexte.newPage();
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.addInitScript(t => {
    try { localStorage.setItem('rt-settings', JSON.stringify({ theme: t, anim: false })); } catch (e) {}
  }, theme);
  await page.goto('http://localhost:8000/index.html');
  await page.waitForFunction(() => typeof window.rtSessionOuverte === 'function');

  for (const [phase, routes] of [['sans-compte', SANS_COMPTE], ['app', APPLICATIVES]]) {
    if (phase === 'app') {
      await page.evaluate(() => { location.hash = '#tableau'; window.rtSessionOuverte(); });
      await page.waitForFunction(() => window.rtConnecte && window.rtConnecte() === true);
    }
    for (const route of routes) {
      await page.evaluate(r => { location.hash = '#' + r; }, route);
      await page.waitForTimeout(900);

      const cibles = await page.evaluate(([tailleMax, ink2Seul]) => {
        /* Le rapport calculé sur les VALEURS CSS, pour l'auto-contrôle plus
           bas. Version compacte de tests/parcours/_contraste.js : ici on n'a
           besoin que du chiffre, pas du diagnostic. */
        const ca = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const lu = p => 0.2126 * ca(p[0]) + 0.7152 * ca(p[1]) + 0.0722 * ca(p[2]);
        const rap = (a, b) => { const x = lu(a), y = lu(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
        const rgb = t => { const m = /rgba?\(([^)]+)\)/.exec(t); if (!m) return null;
          const q = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
          return [q[0], q[1], q[2], q.length > 3 ? q[3] : 1]; };
        function fondCss(el) {
          let n = el;
          while (n && n.nodeType === 1) {
            const st = getComputedStyle(n);
            if (st.backgroundImage && st.backgroundImage !== 'none') return null;
            const c = rgb(st.backgroundColor);
            if (c && c[3] === 1) return c;
            n = n.parentElement;
          }
          return null;
        }
        const out = [];
        const section = document.querySelector('.page.active') || document.body;
        let n = 0;
        for (const el of section.querySelectorAll('*')) {
          const texte = Array.from(el.childNodes)
            .filter(x => x.nodeType === 3).map(x => x.textContent).join('').trim();
          if (!texte) continue;
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
          const r = el.getBoundingClientRect();
          if (r.width < 8 || r.height < 6) continue;
          const taille = parseFloat(s.fontSize);
          if (taille > tailleMax) continue;
          /* « Ce que --ink-2 porte » se reconnaît à la couleur résolue du
             jeton, pas au nom : une règle peut l'écrire en dur. */
          const teinte = s.color.replace(/\s/g, '');
          if (ink2Seul && teinte !== 'rgb(107,114,128)') continue;
          el.setAttribute('data-mesure', 'm' + n);
          const fc = fondCss(el), av = rgb(s.color);
          out.push({
            marque: 'm' + n, taille,
            gras: parseInt(s.fontWeight, 10) >= 700,
            couleur: s.color,
            cssRapport: (fc && av && av[3] === 1) ? rap(av, fc) : null,
            texte: texte.slice(0, 44)
          });
          n++;
        }
        return out;
      }, [TAILLE_MAX, INK2_SEUL]);

      for (const c of cibles) {
        try {
          const cible = page.locator(`[data-mesure="${c.marque}"]`);
          await cible.scrollIntoViewIfNeeded({ timeout: 4000 });
          /* Après le défilement, on vérifie que l'élément est bien OPAQUE
             avant de le photographier. Sans ce contrôle, la mesure repart en
             silence sur du texte à moitié transparent. */
          const opaque = await cible.evaluate(el => {
            let n = el;
            while (n && n.nodeType === 1) {
              if (parseFloat(getComputedStyle(n).opacity) < 0.99) return false;
              n = n.parentElement;
            }
            return true;
          });
          if (!opaque) { ignores++; continue; }
          const tampon = await cible.screenshot({ timeout: 4000 });
          const declaree = (/rgba?\(([^)]+)\)/.exec(c.couleur) || [])[1];
          const a = analyser(tampon, declaree
            ? declaree.split(/[,\s/]+/).filter(Boolean).map(Number).slice(0, 3)
            : null);
          if (!a) continue;
          const seuil = (c.taille >= 24 || (c.gras && c.taille >= 18.66)) ? 3 : 4.5;
          resultats.push({ theme, route, ...c, ...a, seuil });
        } catch (e) { /* élément sorti de l'écran ou masqué entre-temps */ }
      }
    }
  }
  await contexte.close();
}
await navigateur.close();

/* --- AUTO-CONTRÔLE : la mesure dit-elle la vérité ? -----------------------
   Sur du GRAND texte, l'antialiasing pèse peu : le noyau des glyphes atteint
   la couleur déclarée, et la mesure en pixels doit retrouver à peu près celle
   du CSS. Si les deux divergent là, c'est l'OUTIL qui se trompe, pas le site —
   et il vaut mieux le dire que publier des chiffres faux.
   Ce contrôle est né de deux erreurs successives, toutes deux passées
   inaperçues parce qu'elles rendaient du ROUGE, donc du crédible : les
   animations d'entrée, puis le centile pris sur toute la boîte. */
function autoControle() {
  const gros = resultats.filter(r => r.taille >= 14 && r.cssRapport);
  if (gros.length < 5) return null;
  const ecarts = gros.map(r => Math.abs(r.rapport - r.cssRapport) / r.cssRapport);
  ecarts.sort((a, b) => a - b);
  return { n: gros.length, median: ecarts[Math.floor(ecarts.length / 2)] };
}

/* --- Le rapport ---------------------------------------------------------- */
console.log(`\n═══ CONTRASTE MESURÉ SUR LES PIXELS ═══`);
console.log(`    ${resultats.length} textes capturés`
  + (TOUT ? '' : ` de moins de ${TAILLE_MAX} px`)
  + (INK2_SEUL ? ', portés par --ink-2' : '') + `, deux thèmes`);
if (ignores) console.log(`    ${ignores} écarté(s) : encore en transparence au moment de la capture`);

const ac = autoControle();
if (ac) {
  const pct = (ac.median * 100).toFixed(0);
  if (ac.median > 0.25) {
    console.log(rouge(`\n  ⚠ AUTO-CONTRÔLE EN ÉCHEC — écart médian de ${pct} % entre pixels et CSS`));
    console.log(rouge(`    sur ${ac.n} textes d'au moins 14 px, où les deux devraient concorder.`));
    console.log(rouge(`    C'EST L'OUTIL QUI SE TROMPE, PAS LE SITE. Ne pas se fier aux chiffres`));
    console.log(rouge(`    ci-dessous : chercher d'abord ce qui fausse la capture (une animation,`));
    console.log(rouge(`    une transparence, un élément hors écran).`));
  } else {
    console.log(vert(`    auto-contrôle : ${pct} % d'écart médian avec le CSS sur ${ac.n} textes ≥ 14 px — cohérent`));
  }
}
console.log('');

const sous = resultats.filter(r => r.rapport < r.seuil).sort((a, b) => a.rapport - b.rapport);
const justes = resultats.filter(r => r.rapport >= r.seuil && r.rapport < r.seuil + 1.2);

if (sous.length) {
  console.log(rouge(`  ${sous.length} texte(s) SOUS le seuil, en pixels :\n`));
  for (const r of sous.slice(0, 40)) {
    console.log(rouge(`  ${String(r.rapport.toFixed(2)).padStart(5)}:1 (seuil ${r.seuil})`)
      + ` ${r.theme.padEnd(5)} ${r.route.padEnd(15)} ${String(r.taille).padStart(5)}px`
      + `  rgb(${r.pxTexte.join(',')}) sur rgb(${r.pxFond.join(',')})`);
    console.log(`           « ${r.texte} »   ${r.couleur} déclaré`);
  }
} else {
  console.log(vert(`  ✔ aucun texte sous le seuil, en pixels`));
}

if (justes.length) {
  console.log(jaune(`\n  ${justes.length} texte(s) dans la zone grise (seuil à seuil + 1,2) :`));
  const parCouleur = new Map();
  for (const r of justes) {
    const k = `${r.theme} ${r.couleur}`;
    if (!parCouleur.has(k)) parCouleur.set(k, []);
    parCouleur.get(k).push(r);
  }
  for (const [k, v] of [...parCouleur].sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
    const pire = Math.min(...v.map(r => r.rapport));
    console.log(jaune(`    ${String(v.length).padStart(3)} × ${k.padEnd(28)} pire : ${pire.toFixed(2)}:1`));
  }
}

/* La question de INSCRIPTION.md § 8, et sa réponse chiffrée. */
const ink2 = resultats.filter(r => r.couleur.replace(/\s/g, '') === 'rgb(107,114,128)');
console.log(`\n═══ LA QUESTION DE INSCRIPTION.md § 8 ═══\n`);
if (!ink2.length) {
  console.log(`    Aucun texte porté par --ink-2 (#6b7280) dans ce relevé.`);
} else {
  const rate = ink2.filter(r => r.rapport < r.seuil);
  const pire = ink2.reduce((a, b) => a.rapport < b.rapport ? a : b);
  console.log(`    ${ink2.length} textes portés par --ink-2 (#6b7280)`);
  console.log(`    ${rate.length} sous le seuil en pixels`);
  console.log(`    le pire : ${pire.rapport.toFixed(2)}:1 — ${pire.theme}, ${pire.route}, ${pire.taille}px`);
  console.log(`\n    ${rate.length ? rouge('→ la bascule globale de --ink-2 est justifiée par la mesure.')
                                   : vert('→ la mesure ne justifie PAS de basculer --ink-2.')}`);
  console.log(`    Le détail par page est ci-dessus. La décision reste au développeur.`);
}
console.log('');
