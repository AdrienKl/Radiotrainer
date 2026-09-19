/* =============================================================================
   AVIERO — LECTURE DU SITE TEL QUE LE NAVIGATEUR LE VOIT
   -----------------------------------------------------------------------------
   Tous les tests de contrat partent d'ici. Le principe tient en une phrase :
   on ne lit JAMAIS index.html à coups de numéros de ligne.

   POURQUOI C'EST LE POINT CENTRAL
   Ces tests existent pour surveiller un découpage. Or un découpage déplace des
   lignes — c'est même sa définition. Un test qui dirait « le moteur commence
   ligne 4929 » deviendrait faux au premier fichier extrait, et il faudrait le
   réparer à chaque étape : au bout de trois réparations, plus personne ne le
   croit, et il ne protège plus rien.

   Ce module reconstruit donc ce que le navigateur reconstruit lui-même : la
   LISTE ORDONNÉE des scripts et des feuilles de style, qu'ils soient écrits
   dans la page ou tirés d'un fichier. Extraire un bloc vers assets/ ne change
   pas cette liste — seulement l'origine de ses éléments. Les tests continuent
   donc de passer quand le découpage est correct, et tombent quand il ne l'est
   pas. C'est exactement ce qu'on leur demande.
   ========================================================================== */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const INDEX = join(RACINE, 'index.html');

export function lire(chemin) {
  return readFileSync(join(RACINE, chemin), 'utf8');
}

/* ---------------------------------------------------------------------------
   Le scanner.

   Un simple /<script[^>]*>/g ne suffit pas, et le piège s'est présenté tout de
   suite : index.html parle de ses propres blocs <script> dans ses commentaires
   (« les deux blocs <script> ne partagent pas de portée », ligne 6566 avant le
   découpage). Une expression régulière naïve prenait ces phrases pour du code.
   D'où un automate qui sait dans quoi il se trouve : commentaire HTML, bloc de
   script, ou balisage.
   ------------------------------------------------------------------------- */
function scanner(html) {
  const morceaux = [];
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const fin = html.indexOf('-->', i + 4);
      i = fin < 0 ? html.length : fin + 3;
      continue;
    }
    if (html.startsWith('<script', i) && /[\s>]/.test(html[i + 7] || '')) {
      const finBalise = html.indexOf('>', i);
      const balise = html.slice(i, finBalise + 1);
      const finBloc = html.indexOf('</script>', finBalise);
      const corps = html.slice(finBalise + 1, finBloc < 0 ? html.length : finBloc);
      const src = /\ssrc\s*=\s*"([^"]+)"/.exec(balise);
      morceaux.push({
        type: 'script',
        src: src ? src[1] : null,
        corps: src ? null : corps,
        ligne: html.slice(0, i).split('\n').length
      });
      i = finBloc < 0 ? html.length : finBloc + 9;
      continue;
    }
    if (html.startsWith('<style', i) && /[\s>]/.test(html[i + 6] || '')) {
      const finBalise = html.indexOf('>', i);
      const finBloc = html.indexOf('</style>', finBalise);
      morceaux.push({
        type: 'style',
        src: null,
        corps: html.slice(finBalise + 1, finBloc < 0 ? html.length : finBloc),
        ligne: html.slice(0, i).split('\n').length
      });
      i = finBloc < 0 ? html.length : finBloc + 8;
      continue;
    }
    if (html.startsWith('<link', i)) {
      const finBalise = html.indexOf('>', i);
      const balise = html.slice(i, finBalise + 1);
      if (/rel\s*=\s*"stylesheet"/.test(balise)) {
        const href = /\shref\s*=\s*"([^"]+)"/.exec(balise);
        if (href) morceaux.push({ type: 'style', src: href[1], corps: null, ligne: html.slice(0, i).split('\n').length });
      }
      i = finBalise + 1;
      continue;
    }
    i++;
  }
  return morceaux;
}

let _cache = null;

/* ---------------------------------------------------------------------------
   Le NOM d'un bloc écrit dans la page est son RANG, pas sa ligne.

   Premier réflexe : nommer un bloc « index.html:4929 ». Première conséquence :
   ajouter quinze lignes n'importe où plus haut renomme tous les blocs suivants,
   et l'inventaire gelé devient faux sans qu'aucun bloc n'ait bougé. C'est
   arrivé dès le deuxième jour, en ajoutant RT_TEST_SCN.

   Le rang, lui, ne change que si un bloc est ajouté, retiré ou déplacé — ce qui
   est exactement ce qu'on veut voir. Le numéro de ligne reste disponible pour
   les messages d'erreur, où il sert vraiment à quelque chose.
   ------------------------------------------------------------------------- */
function nommer(m, rang) {
  return m.src || `index.html#${rang}`;
}

/* La page, découpée en ce que le navigateur charge, DANS L'ORDRE.
   Chaque entrée porte :
     origine  — « index.html#2 » (2e bloc écrit dans la page) ou « assets/donnees.js »
     ligne    — la ligne de la balise, pour les messages
     code     — le JavaScript, qu'il vienne de la page ou d'un fichier
     externe  — true si c'est un <script src>                              */
export function scripts() {
  if (!_cache) _cache = scanner(readFileSync(INDEX, 'utf8'));
  let rang = 0;
  return _cache.filter(m => m.type === 'script').map(m => ({
    origine: nommer(m, m.src ? 0 : ++rang),
    ligne: m.ligne,
    externe: !!m.src,
    src: m.src,
    code: m.src ? (existsSync(join(RACINE, m.src)) ? readFileSync(join(RACINE, m.src), 'utf8') : '') : m.corps
  }));
}

/* Les feuilles de style, dans l'ordre de la cascade. Cet ordre EST le contrat :
   le CSS du site charge avant admin.css pour que la console puisse le surcharger,
   et plusieurs règles du site sont volontairement placées après celles qu'elles
   corrigent (« placé APRÈS les règles .vf-* d'origine pour les surcharger »). */
export function styles() {
  if (!_cache) _cache = scanner(readFileSync(INDEX, 'utf8'));
  let rang = 0;
  return _cache.filter(m => m.type === 'style').map(m => ({
    origine: nommer(m, m.src ? 0 : ++rang),
    ligne: m.ligne,
    externe: !!m.src,
    src: m.src,
    code: m.src ? (existsSync(join(RACINE, m.src)) ? readFileSync(join(RACINE, m.src), 'utf8') : '') : m.corps
  }));
}

/* ---------------------------------------------------------------------------
   Déclarations au niveau racine d'un script.

   La colonne 0 fait tout le travail : les modules du projet sont des IIFE, donc
   tout ce qui est interne est indenté. Ce qui commence colonne 0 est exactement
   ce qui fuit dans la portée globale — c'est-à-dire ce que les autres blocs
   peuvent lire, et donc ce qu'un découpage peut casser.
   ------------------------------------------------------------------------- */
const DECL = /^(?:const|let|var|function|async function)\s+([A-Za-z_$][\w$]*)/;
const DECL_WINDOW = /^window\.([A-Za-z_$][\w$]*)\s*=/;

export function declarationsRacine(code) {
  const noms = new Set();
  for (const ligne of code.split('\n')) {
    const m = DECL.exec(ligne) || DECL_WINDOW.exec(ligne);
    if (m) noms.add(m[1]);
  }
  return noms;
}

/* ---------------------------------------------------------------------------
   Retirer les commentaires et les chaînes avant de chercher un symbole.

   Sans cela, « voir buildQueue » écrit dans un commentaire compte comme un
   usage de buildQueue. Ce n'était pas théorique : en sortant les scénarios du
   moteur, neuf faux positifs sont apparus d'un coup — dont `entre`, qui est
   aussi un mot français ordinaire, et `state`, cité dans une explication.

   Un test qui crie pour un mot dans un commentaire finit ignoré, puis
   désactivé. On paie donc le prix d'un petit automate.

   CE QUE ÇA NE VOIT PLUS : un symbole atteint uniquement par une chaîne
   (window['SCENARIOS']). Le projet ne le fait nulle part, et ce serait de
   toute façon à éviter — précisément parce que plus rien ne peut le suivre.
   ------------------------------------------------------------------------- */
export function sansCommentairesNiChaines(code) {
  let out = '', i = 0, chaine = null, comm = null;
  while (i < code.length) {
    const c = code[i], d = code[i + 1];
    if (comm === 'ligne') { if (c === '\n') { comm = null; out += '\n'; } i++; continue; }
    if (comm === 'bloc') { if (c === '*' && d === '/') { comm = null; i += 2; continue; } if (c === '\n') out += '\n'; i++; continue; }
    if (chaine) {
      if (c === '\\') { i += 2; continue; }
      if (c === chaine) chaine = null;
      if (c === '\n') out += '\n';
      i++; continue;
    }
    if (c === '/' && d === '/') { comm = 'ligne'; i += 2; continue; }
    if (c === '/' && d === '*') { comm = 'bloc'; i += 2; continue; }
    /* ---- Les expressions régulières littérales -------------------------
       Oubliées du premier jet, et ça se payait cher : escapeHtml contient
       /[&<>"']/g. Le guillemet à l'intérieur de la classe ouvrait une fausse
       chaîne, qui avalait tout le code jusqu'au guillemet suivant — dont la
       déclaration de showToast, trois lignes plus bas. L'analyse de
       dépendances ne voyait donc pas showToast, et personne ne s'en plaignait :
       un symbole qu'on ne voit pas est un symbole qu'on croit absent, pas une
       erreur.

       Le « / » est ambigu en JavaScript : division ou début d'expression. On
       tranche sur le dernier caractère significatif, ce qui suffit largement
       pour du code qui ne cherche pas à piéger un analyseur. */
    if (c === '/' && debutDExpression(out)) {
      i++;
      let classe = false;
      while (i < code.length) {
        const k = code[i];
        if (k === '\\') { i += 2; continue; }
        if (k === '[') classe = true;
        else if (k === ']') classe = false;
        else if (k === '/' && !classe) { i++; break; }
        else if (k === '\n') break;            // pas une expression, en fait
        i++;
      }
      while (i < code.length && /[a-z]/.test(code[i])) i++;   // les drapeaux
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { chaine = c; i++; continue; }
    out += c; i++;
  }
  return out;
}

/* Un « / » qui suit l'un de ces caractères ne peut pas être une division : il
   n'y a rien à diviser. C'est donc une expression régulière. */
function debutDExpression(dejaEcrit) {
  const m = /([^\s])\s*$/.exec(dejaEcrit);
  if (!m) return true;                                  // début de fichier
  const c = m[1];
  if ('(,=:[!&|?+-*%~^{};<>'.includes(c)) return true;
  /* `return /…/`, `typeof /…/` : un mot-clé, pas une valeur. */
  return /\b(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)\s*$/.test(dejaEcrit);
}

const _nu = new Map();
function nu(code) {
  if (!_nu.has(code)) _nu.set(code, sansCommentairesNiChaines(code));
  return _nu.get(code);
}

/* Le symbole est-il VRAIMENT employé par ce code ? */
export function utilise(code, nom) {
  return new RegExp(`\\b${nom.replace(/\$/g, '\\$')}\\b`).test(nu(code));
}

/* Le code JavaScript servi au navigateur, fichiers vendorés exclus : ceux-là ne
   sont pas notre code, et les passer au peigne fin ne dirait rien d'utile. */
export const VENDOR = ['assets/leaflet.js', 'assets/vendor/supabase.js'];

export function inventaire() {
  return JSON.parse(lire('tests/contrat/inventaire.json'));
}

/* ---------------------------------------------------------------------------
   Découper un littéral de tableau JavaScript en ses éléments.

   Écrit à la main, et pas à coups d'expression régulière, pour une raison
   apprise du premier essai : la phraséologie est pleine d'apostrophes et de
   virgules — « point d'attente », « Mérignac Sol, F-GBQA, bonjour » — et un
   compteur de crochets naïf coupait les scénarios en plein milieu d'une phrase.
   Il faut donc savoir quand on est dans une chaîne ou dans un commentaire. Ce
   n'est pas un analyseur JavaScript : juste assez pour traverser des données.
   ------------------------------------------------------------------------- */
export function elementsDuTableau(code, nomConstante) {
  const depart = code.indexOf(`${nomConstante} = [`);
  if (depart < 0) return null;
  const ouvrant = code.indexOf('[', depart);

  let i = ouvrant + 1, prof = 0, debut = i;
  const parts = [];
  let chaine = null, comm = null;

  while (i < code.length) {
    const c = code[i], d = code[i + 1];
    if (comm === 'ligne') { if (c === '\n') comm = null; i++; continue; }
    if (comm === 'bloc') { if (c === '*' && d === '/') { comm = null; i += 2; continue; } i++; continue; }
    if (chaine) {
      if (c === '\\') { i += 2; continue; }
      if (c === chaine) chaine = null;
      i++; continue;
    }
    if (c === '/' && d === '/') { comm = 'ligne'; i += 2; continue; }
    if (c === '/' && d === '*') { comm = 'bloc'; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { chaine = c; i++; continue; }
    if (c === '[' || c === '{' || c === '(') { prof++; i++; continue; }
    if (c === ')' || c === '}') { prof--; i++; continue; }
    if (c === ']') {
      if (prof === 0) { parts.push(code.slice(debut, i)); break; }
      prof--; i++; continue;
    }
    if (c === ',' && prof === 0) { parts.push(code.slice(debut, i)); debut = i + 1; i++; continue; }
    i++;
  }
  return parts.map(p => p.trim()).filter(Boolean);
}

/* Tout notre JavaScript, d'où qu'il vienne. */
export function toutLeCode() {
  return scripts().filter(s => !VENDOR.includes(s.src)).map(s => s.code).join('\n');
}
