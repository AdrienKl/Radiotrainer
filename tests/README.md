# Les tests d'AVIERO

## Lancer

```sh
npm install && npx playwright install chromium   # une seule fois
sh tests/lancer_tout.sh
```

Les tests de contrat seuls, quand on itère vite (moins d'une seconde) :

```sh
sh tests/lancer_tout.sh contrat
```

---

## Pourquoi ils existent

Le projet migre d'un `index.html` de 15 000 lignes vers une architecture
modulaire. Ce découpage a un mode de panne à lui, et il est silencieux : **on
déplace du code, la page se charge, elle a l'air normale — et une
fonctionnalité a disparu.**

C'est possible parce que les blocs de script d'`index.html` ne sont pas
étanches. Une soixantaine de noms déclarés dans l'un sont lus par un autre, sans
jamais passer par `window` : ce sont des liaisons de portée globale, celles
qu'un script classique offre gratuitement. Quand un symbole disparaît, est
déclaré deux fois, ou arrive trop tard, rien ne se voit au chargement. L'erreur
tombe au premier clic, dans une console que personne ne regarde.

Ces tests sont là pour que ce clic soit le nôtre, et pas celui d'un élève.

---

## Deux étages

### `tests/contrat/` — la lecture du code

Node seul, aucune dépendance, moins d'une seconde. Ils ne lancent rien : ils
lisent `index.html` **comme le navigateur le lit** — la liste ordonnée des
scripts et des feuilles de style, qu'ils viennent de la page ou d'un fichier.

C'est ce qui les rend utilisables pendant un découpage : sortir un bloc vers
`assets/` ne change pas cette liste, seulement l'origine de ses éléments. Aucun
test ne parle en numéros de ligne.

| Fichier | Ce qu'il empêche |
|---|---|
| `symboles.test.mjs` | Un symbole partagé disparaît, est déclaré deux fois, ou est lu avant d'exister sans `typeof` ni inscription |
| `chargement.test.mjs` | L'ordre des scripts ou de la cascade CSS change ; un fichier référencé manque |
| `stockage.test.mjs` | Une clé de stockage est renommée sans migration — c'est-à-dire des données effacées sans message |
| `routeur.test.mjs` | Une route perd sa page ; une page légale devient inaccessible sans compte |
| `phraseologie.test.mjs` | Un scénario disparaît, perd des échanges, ou perd ses renvois au manuel ; le catalogue diverge de la table `exercises` |
| `css.test.mjs` | Une image du CSS ne mène nulle part ; les feuilles changent d'ordre ; du CSS revient dans la page |
| `syntaxe.test.mjs` | Un bloc ne se lit plus (et meurt en silence pendant que les autres continuent) |
| `secrets.test.mjs` | Une clé secrète, un jeton ou un mot de passe entre dans un fichier servi |

### `tests/parcours/` — le site dans un vrai navigateur

Playwright + Chromium. Ils ouvrent le site et s'en servent : c'est le seul étage
qui peut dire qu'un scénario se joue jusqu'au bout, qu'un vol s'enregistre, et
que la console reste vide.

| Fichier | Ce qu'il couvre |
|---|---|
| `demarrage.spec.js` | Chargement sans erreur, les neuf blocs vont au bout, thème clair/sombre, pages légales sans compte |
| `routeur.spec.js` | Les seize routes peignent quelque chose, `#compte` → Paramètres, retour arrière, barre latérale |
| `scenario.spec.js` | Un scénario joué du début au récapitulatif, la notation juste ET fausse, l'écriture de l'historique, les treize scénarios démarrent |
| `vol.spec.js` | Vol lancé, sauvegardé, terminé, enregistré ; modes voyage et local ; imprévu imposé |
| `epellation.spec.js` | Verdict juste, verdict faux, code suivant |
| `stockage.spec.js` | Réglages, série de jours, quota, relecture de l'historique, file de synchronisation préservée |

Le projet `telephone` rejoue `demarrage` et `routeur` en largeur mobile (Pixel 7).

---

## Deux décisions qu'il faut connaître

### 1. Les tests ne parlent jamais à Supabase

Toute requête vers `*.supabase.co` est **coupée** (`tests/parcours/_aide.js`). Le
projet visé par `assets/supabase-config.js` est le projet **réel** : y écrire
depuis une suite de tests polluerait les données de vrais comptes, et ferait
dépendre chaque exécution d'un service distant.

Conséquence assumée : **ces tests ne vérifient ni les politiques RLS, ni le
parcours d'inscription réel, ni la fusion entre deux appareils.** Voir plus bas.

### 2. On entre dans l'application par la porte existante

Les tests appellent `window.rtSessionOuverte()` — la même fonction
qu'`assets/auth.js` appelle quand Supabase rend une session. Aucune porte
dérobée n'a été ajoutée pour les tests. Si cette fonction cesse d'ouvrir
l'application, les tests le disent, et c'est une vraie information.

De même, les réponses sont **tapées** dans le champ de transcription : ce champ
existe pour les utilisateurs sans micro, il n'a pas été inventé ici.

---

## Les prises de test de l'application

Trois existaient déjà, et servent aussi à la page `#admin/test` de la console :

- `window.RT_TEST` — piloter un vol (`lancerVol`, `forcerAlea`, `enVol`, `reinitialiser`)
- `window.RT_TEST_EPEL` — `attendu()`, `dire()`, `suivant()`
- `window.rtRelancerScenario(index, icao)`

Une quatrième a été ajoutée pour cette suite :

- `window.RT_TEST_SCN` — `attendu()`, `dire()`, `suivant()`, `etape()`, `total()`, `enCours()`, `aRepondre()`

Elle n'ajoute aucune logique : `dire()` écrit dans `#transText` puis clique
`#validerBtn`. Sans `attendu()`, un test ne peut pas connaître le
collationnement attendu — il est tiré au lancement du scénario — donc ne peut
vérifier qu'une réponse **fausse**, ce qui ne prouve rien sur la notation d'une
réponse juste.

---

## L'inventaire gelé

`tests/contrat/inventaire.json` est l'état de référence : symboles partagés,
ordre de chargement, clés de stockage, routes, scénarios. Il se régénère **à la
main**, jamais automatiquement :

```sh
node tests/contrat/_geler.mjs
git diff tests/contrat/inventaire.json     # lire AVANT de commiter
```

Un inventaire qui se régénérerait tout seul ne surveillerait rien : il
enregistrerait la disparition d'un symbole comme un fait nouveau.

**Un test rouge ne se répare donc pas en relançant ce script.** Il se lit, on
comprend ce qui manque, et *si le changement est voulu*, on regèle — en lisant
le diff.

### `lectures_differees`

Une entrée de cet inventaire dit : « ce fichier lit un symbole déclaré plus
loin, je le sais, et c'est sans danger parce que la lecture n'a lieu que dans le
corps d'une fonction ».

Le cas réel : `assets/donnees/phraseologie-scenarios.js` n'est pas que des
données. Le scénario « navigation » y porte un `buildTours()` qui construit ses
échanges sur l'espace aérien réel au-dessus du terrain choisi, et appelle donc
le moteur (`state`, `codeSSR()`, `numVariants()`…). Ces appels ont lieu au
lancement du scénario, pas au chargement de la page.

Ce qui reste interdit — et c'est le seul vrai danger — est une lecture
**nouvelle**, ni gardée par `typeof`, ni inscrite.

---

## Ce qui n'est pas couvert, et ne peut pas l'être ici

À vérifier **à la main**, avant toute mise en ligne :

1. **L'aller-retour réel d'un e-mail** — personne ici ne peut lire votre boîte.
   Une inscription complète, de bout en bout, avec une vraie adresse.
2. **Les politiques RLS** — elles se vérifient en base, pas dans un navigateur.
   Un `if` côté client ne prouve rien : la page appartient à l'utilisateur.
3. **La fusion entre deux appareils** — deux navigateurs, un même compte, une
   séance de chaque côté, puis vérifier qu'aucune n'a disparu et qu'aucune n'est
   en double (les UUID de `assets/sync.js` sont là pour ça).
4. **La ligne réellement écrite en base** — l'absence d'erreur côté client ne
   dit rien de ce qui a été enregistré.
5. **Le contraste des deux thèmes** — l'ancienne suite `ins_contraste.py` faisait
   90 relevés sur les pixels réels. Elle n'a jamais été versionnée et reste à
   refaire.

Ces cinq points étaient déjà les angles morts de l'ancienne série de tests
(`INSCRIPTION.md § 7`), qui vivait dans `scratchpad/` — non versionné — et a
donc été perdue. C'est la raison pour laquelle ce dossier-ci est dans le dépôt.
