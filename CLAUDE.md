# Albatros VFR — Instructions pour Claude Code

> **Albatros VFR est le nom du projet.** Il s'est appelé RadioTrainer, puis AVIERO
> le 20/09/2026, puis Albatros VFR le 21/09/2026. Même projet, même code, même design.
> Ce ne sont ni de nouveaux produits ni des refontes : seul le nom change.

---

## 1. Vision du projet

Albatros VFR est une plateforme de formation aéronautique destinée à évoluer bien au-delà de l'entraînement à la radiotéléphonie VFR.

La vision à long terme est de créer une plateforme complète de formation pour pilotes, pouvant intégrer notamment :

- plusieurs cours et domaines de formation aéronautique ;
- de nombreux exercices et scénarios interactifs ;
- suivi de progression ;
- comptes utilisateurs ;
- communauté ;
- fonctionnalités pour pilotes et éventuellement instructeurs ;
- nouvelles fonctionnalités proposées par l'équipe au fil du développement.

Ne limite donc jamais tes propositions à ce qui existe actuellement dans l'application. Le projet doit être conçu pour pouvoir évoluer pendant plusieurs années.

---

## 2. Règle absolue — la phraséologie ne s'invente jamais

C'est la règle la plus importante du projet, avant toute considération technique.

Albatros VFR enseigne la radiotéléphonie à de vrais pilotes. **Une formulation inventée est une erreur qui sera apprise, répétée en vol, et entendue par un contrôleur.**

Donc, sans exception :

- **toute** phraséologie, tout collationnement, toute réponse du contrôleur provient du manuel de référence du projet ;
- sources de vérité : `PHRASEOLOGIE-MANUEL.md` (extraits structurés, avec pagination) et `Manuel_Phraseologie.pdf` (manuel officiel DSNA) ;
- une phrase ajoutée ou modifiée cite sa page en commentaire, comme le fait déjà le code existant (`// Manuel DSNA p.39 « Demande mise en route »`) ;
- si le manuel ne couvre pas un cas, **ne comble pas le trou** : signale-le et demande.

Cette règle vaut aussi pour les variantes acceptées à l'oral (`motsCles`, `variantes`) : accepter une formulation fausse revient à l'enseigner.

---

## 3. Rôle de Claude

Tu es un partenaire de développement du projet Albatros VFR, pas simplement un exécutant.

Tu dois :

- analyser le code et comprendre son fonctionnement avant de modifier des parties importantes ;
- identifier les problèmes techniques ;
- proposer des améliorations ;
- proposer de nouvelles fonctionnalités pertinentes ;
- proposer des solutions auxquelles le développeur n'aurait pas forcément pensé ;
- remettre en question une approche lorsqu'une meilleure solution existe ;
- choisir les solutions techniques appropriées lorsque cela ne présente pas de risque important.

Tu disposes d'une grande autonomie technique.

Cependant, le développeur reste le responsable du projet et prend les décisions importantes concernant son orientation.

---

## 4. Validation des changements importants

Lorsqu'un problème ou une décision importante apparaît :

1. explique clairement le problème ;
2. explique pourquoi il est important ;
3. propose une ou plusieurs solutions ;
4. indique la solution que tu recommandes et pourquoi ;
5. attends la validation du développeur avant d'effectuer un changement important ou risqué.

Les changements particulièrement importants incluent notamment :

- modification importante de l'architecture ;
- migration de données ;
- modification importante du schéma Supabase ;
- modification de l'authentification ;
- modification de la sécurité ou des RLS ;
- suppression ou remplacement important de fonctionnalités ;
- changement majeur de technologie ;
- changement ayant un risque important de perte de données ;
- changement important de l'expérience utilisateur.

Pour les corrections simples, bugs évidents, améliorations locales et tâches à faible risque, tu peux agir directement.

---

## 5. Refactoring

Le code actuel a été développé progressivement et certaines parties sont devenues trop volumineuses.

Tu peux effectuer des refactorings importants lorsqu'ils apportent un gain réel en :

- maintenabilité ;
- lisibilité ;
- performances ;
- sécurité ;
- évolutivité ;
- organisation du projet.

Il n'est pas nécessaire de conserver l'ancien code simplement parce qu'il fonctionne.

Cependant, un refactoring doit préserver les fonctionnalités existantes autant que possible.

Après un refactoring important, vérifie systématiquement que les fonctionnalités concernées fonctionnent toujours.

L'objectif n'est pas simplement de modifier le code, mais d'améliorer réellement la structure du projet.

### 5.1 La frontière avec le § 4 — le test du comportement observable

- **Aucun comportement observable ne change** (découper un fichier, extraire un module, centraliser des clés, renommer une variable interne) → **tu y vas directement.**
- **Un contrat change** — données, schéma, API, parcours utilisateur, ce que voit ou fait l'utilisateur, architecture majeure, sécurité → **tu t'arrêtes, tu expliques, tu attends la validation.**

En cas de doute sur le côté de la frontière où tombe un changement : il tombe du côté « demander ».

---

## 6. Architecture

L'application est encore largement portée par un gros `index.html`. Sa réduction a commencé le 18/09/2026 (voir § 6.2 pour l'état exact et ce qui reste).

La migration vers une architecture plus propre doit se faire progressivement lorsque cela est pertinent.

Ne réécris pas toute l'application inutilement.

Privilégie une migration progressive :

- identifier les responsabilités ;
- extraire les parties indépendantes ;
- créer des modules cohérents ;
- centraliser les fonctionnalités communes ;
- réduire progressivement la dépendance au monolithe ;
- tester chaque étape.

### 6.1 Le mode `file://` n'est plus une contrainte produit

**Décision du 18/09/2026.** Albatros VFR est une application web en ligne. Supabase exige de toute façon un environnement `http(s)` — l'authentification est déjà dégradée en `file://` (`lienRetour()` rend `null`).

Le support de l'ouverture par double-clic **n'est donc plus une priorité et ne doit plus dicter l'architecture**.

Conséquence directe : les contraintes qui en découlaient tombent. Sont désormais autorisés s'ils apportent un bénéfice réel — JavaScript moderne, modules ES, TypeScript, React, Vue, un bundler, une architecture modulaire, d'autres outils modernes.

Aucune technologie n'est interdite par principe.

**Mais** : ne choisis pas une technologie parce qu'elle est moderne, choisis-la si elle apporte un avantage réel au projet. Et **une migration technologique majeure doit être expliquée et validée avant d'être engagée** (§ 4).

Note : les bibliothèques sont aujourd'hui vendorées (`assets/vendor/`, `assets/leaflet.js`) précisément à cause de `file://`. Ce vendoring n'a plus de raison d'être obligatoire, mais il n'est pas urgent de le défaire — il ne coûte rien et évite une dépendance réseau.

---

### 6.2 Où en est le découpage — TERMINÉ le 19/09/2026

La phase 2 est close. `index.html` est passé de **14 979 lignes** (tag `reference-avant-migration`) à **2 397** — **−84 %**. Il ne contient plus que du HTML, ses balises, et **un seul script écrit dans la page** : les onze lignes qui posent le thème avant le premier pixel.

```
index.html               2 397 l.   du HTML, 47 balises, un script de thème
assets/css/        14 f.  2 869 l.  l'ordre EST la cascade
assets/donnees/     4 f.  1 431 l.  aérodromes, phraséologie, reconnaissance, icônes
assets/noyau/       7 f.  1 304 l.  alphabet-nombres, texte, réglages, bruit-radio, voix, micro, interface
assets/modules/     7 f.  5 401 l.  routeur, épellation-cours, tuiles-oaci, navigation, carte, tableau-de-bord, paramètres
assets/scenarios/   1 f.  2 528 l.  le moteur
```

Ce tableau est l'**état à la clôture de la phase 2**, et il n'est pas réécrit à chaque
ajout — c'est un repère, pas un inventaire. L'inventaire vivant, lui, est
`tests/contrat/inventaire.json`, regénéré par `node tests/contrat/_geler.mjs`.
Ajouté depuis : `assets/css/15-contact.css` et `assets/modules/contact.js`
(Contact / Feedback, 22/09/2026).
`assets/css/17-mouvements.css`, `assets/modules/mouvements.js` et
`assets/modules/paysage.js` (version téléphone, transitions, exercice à
l'horizontale, 30/09/2026 — voir le journal).

**Sur les quatre étapes, aucune ligne n'a été réécrite** — tout a été déplacé, et vérifié comme tel : concaténation identique octet pour octet pour le CSS, même multi-ensemble de lignes pour le JavaScript, ordre préservé pour le moteur.

#### Les trois règles d'ordre, qui ne se devinent pas

1. **Le CSS.** Les quatorze `<link>` sont numérotés parce que c'est la cascade. `09-theme-sombre.css` ne vaut que placé après ce qu'il surcharge. Intervertir deux lignes ne produit aucune erreur — seulement un site méconnaissable.
2. **Les données et le noyau chargent AVANT le moteur.** Ils déclarent des `const` au niveau racine. Les descendre sous le moteur casse tout sans la moindre erreur au chargement : `SCENARIOS is not defined` tombe au premier clic.
3. **La balise de `moteur.js` reste après toutes les `<section>`, sans `defer` ni `async`.** Ce fichier construit `el` par `document.getElementById` et pose une vingtaine d'écouteurs dès son chargement. Le remonter donnerait un `el` rempli de `null` — et une page qui se peint normalement pendant qu'aucun bouton ne répond.

#### Ce qu'il ne faut JAMAIS faire au moteur

**Ne pas l'envelopper dans une IIFE, ne pas remplacer ses `function` par des `const`.** Au niveau racine, `function` et `var` deviennent des propriétés de `window` ; `const` et `let` non. La console d'administration appelle `window.rtConfirm` et `window.showToast` derrière un `if (window.X)` : les enfermer couperait l'admin, Paramètres et la Navigation d'un coup, **sans aucune erreur**. `tests/contrat/api-window.test.mjs` surveille exactement ça.

#### Les quatre pièges déjà tombés — ne pas les refaire

- **Les `url()` du CSS.** Dans un `<style>` de la page, `assets/images/x.webp` part de la racine ; dans `assets/css/`, il faut `../images/x.webp`. Dix-sept images de fond en 404, **sans une erreur de console**. `tests/contrat/css.test.mjs` le surveille.
- **`SCENARIOS` appelle `tourVentArriere()`** au moment où son tableau se construit. Les fabriques de tours ont dû partir avec lui. Les tests de contrat n'ont rien vu ; les tests de navigateur l'ont dit en trois secondes.
- **Le décalage d'une ligne.** Le premier élément du corps d'un bloc `<script>` est la fin de la ligne de la balise, pas la ligne suivante. Un « +1 » de trop fait perdre à chaque tranche son ouverture de commentaire. **La vérification « même nombre de lignes » ne le voit pas** : elle prouve qu'on n'a rien perdu, pas qu'on a pris les bonnes lignes.
- **Le `use strict`.** Sortir du code d'un bloc strict sans emporter la directive le fait basculer en mode permissif, silencieusement. Chaque fichier extrait du moteur porte donc le sien.

#### Prochaine étape possible, NON engagée

Découper `assets/scenarios/moteur.js` (2 528 l., toujours le plus gros fichier, 145 symboles globaux dont 21 réellement empruntés). Frontières naturelles : état / carte du DOM / enchaînement des échanges / récapitulatif. **Ça améliore le code, pas le produit** — à mettre après ce qui compte pour les utilisateurs.

---

## 7. Supabase et données utilisateur

Supabase doit progressivement devenir la source de vérité pour les données importantes liées aux comptes utilisateurs.

À terme, les données importantes doivent être liées au compte utilisateur et accessibles depuis différents appareils et navigateurs.

Cela concerne notamment, selon les besoins :

- progression ;
- exercices terminés ;
- historique ;
- statistiques ;
- paramètres importants ;
- données de compte ;
- préférences importantes.

Le `localStorage` peut continuer à être utilisé lorsque cela est pertinent, notamment comme cache ou pour des données temporaires.

Mais les données importantes liées au compte ne doivent pas dépendre uniquement du navigateur.

Lorsqu'une nouvelle fonctionnalité utilise des données persistantes importantes, réfléchis systématiquement à leur stockage côté Supabase.

### 7.1 Conflits entre appareils — on fusionne, on ne remplace pas

**Décision du 18/09/2026.** Quand le même compte a produit des données divergentes sur deux appareils :

- **ce qui peut être fusionné doit être fusionné**, jamais remplacé ;
- une séance est identifiée par son **UUID**, tiré côté client avant le premier envoi (mécanisme déjà en place dans `assets/sync.js`) : c'est ce qui rend la fusion et le rejeu sans doublon possibles ;
- **objectif non négociable : ne jamais perdre une séance parce qu'elle a été créée sur un autre appareil.**

Si un type de donnée **ne peut pas** être fusionné proprement (deux valeurs d'un même réglage, par exemple), **signale le problème avant de choisir une règle.** Ne tranche pas seul entre « le serveur gagne » et « le dernier écrit gagne ».

### 7.2 Les clés de stockage local — risque de perte silencieuse

**Quinze clés** de stockage local, relevées le 18/09/2026 par `tests/contrat/_geler.mjs` — cette section en annonçait dix, il y en avait cinq de plus :

| Clé | Ce qu'elle contient |
|---|---|
| `rt-auth` | **la session Supabase** (`storageKey`) |
| `rt-sync-file` | **les séances qui n'ont pas encore pu partir en base** |
| `rt-settings` | les réglages |
| `rt-vols` | l'historique des vols (cache) |
| `rt-vol-en-cours` | la reprise d'un vol interrompu |
| `radiotrainer_history_v2` | l'historique des scénarios (cache) |
| `rt-jours` | les jours de pratique, pour la série |
| `rt-quota` | le compteur de vols du jour |
| `rt-cache-proprio` | à qui appartient le cache — sans elle, l'historique d'un utilisateur s'affiche chez le suivant |
| `rt-menu-replie` | barre latérale repliée ou non |
| `rt-push-attente` | notification en attente |
| `rt-admin-dev`, `rt-admin-rail`, `rt-admin-errors`, `rt-admin-periode` | console d'administration |

**Renommer une de ces clés sans migration efface des données utilisateur sans aucun message d'erreur.** Les deux premières lignes du tableau sont les plus coûteuses : renommer `rt-auth` déconnecte tout le monde d'un coup ; renommer `rt-sync-file` perd définitivement des séances qui ne sont encore nulle part ailleurs.

Règle : **aucune clé ne se renomme sans une migration à un coup** (copie ancienne → nouvelle, l'ancienne conservée deux versions), et sans un test qui remplit l'ancien jeu et vérifie qu'il est relu.

`tests/contrat/stockage.test.mjs` surveille désormais la disparition d'une clé **et** l'apparition d'une clé non inventoriée — une clé de plus étant une donnée de plus qui ne suit pas le compte d'un appareil à l'autre.

---

## 8. Sécurité

La sécurité doit être considérée comme une priorité dès la conception.

Ne jamais :

- exposer une clé secrète ou une clé `service_role` côté client ;
- contourner les RLS pour simplifier le développement ;
- faire confiance au navigateur pour des décisions de sécurité importantes ;
- stocker inutilement des données sensibles côté client.

Lorsqu'une donnée ou une action doit être protégée, privilégie une vérification côté serveur/Supabase.

Toute modification importante de :

- Supabase ;
- Auth ;
- RLS ;
- permissions ;
- RPC ;
- Edge Functions ;

doit être analysée avec attention avant modification.

**Rappel du principe directeur déjà écrit partout dans le code** : un `if` dans le navigateur ne protège rien, la page appartient à l'utilisateur. Toute règle qui compte se prend en base.

---

## 9. Emails

L'architecture prévue pour les emails d'authentification est :

Albatros VFR → Supabase Auth → fournisseur email

Resend pourra être utilisé comme fournisseur d'envoi en production.

Supabase Auth doit rester responsable de la logique d'authentification, notamment pour :

- confirmation de compte ;
- récupération de mot de passe ;
- changement d'adresse email ;
- OTP ou magic link si utilisés.

Plus tard, les emails personnalisés propres à Albatros VFR pourront utiliser :

Supabase Edge Functions → Resend

Ne mélange pas la logique d'authentification avec les emails marketing ou transactionnels personnalisés.

### 9.1 Le domaine et l'hébergement — `albatrosvfr.fr` sur Cloudflare

**État au 03/10/2026.** Le domaine `albatrosvfr.fr` est acheté ; ses serveurs DNS sont chez Cloudflare. Le site est servi par **Cloudflare Workers** (Static Assets) : Workers Builds construit `dist/` depuis la branche `main` du dépôt GitHub (`node outils/construire-site.mjs`, puis `npx wrangler deploy`), et `albatrosvfr.fr` est le domaine personnalisé du Worker `radiotrainer`. GitHub reste le dépôt de code ; **GitHub Pages ne sert plus le site** (décision du 18/09/2026 remplacée).

Ce qui reste de l'ancien hébergement, et l'ordre pour le retirer — une erreur de séquence casse un accès **en silence** :

1. `www.albatrosvfr.fr` est encore un CNAME vers `adrienkl.github.io` : c'est GitHub qui le redirige vers l'apex. Le passer d'abord sur Cloudflare (enregistrement proxifié + règle de redirection, ou second domaine du Worker) ;
2. **ensuite seulement**, désactiver GitHub Pages sur le dépôt, puis supprimer `CNAME` et `.nojekyll` ;
3. couper l'adresse `radiotrainer.kermeladrien24.workers.dev` (`"workers_dev": false`) puis la retirer de `ORIGINES_PAR_DEFAUT` (`supabase/functions/voix-atc/logique.ts`) et redéployer la fonction.

Toujours vrai : le **Site URL et la liste blanche de redirection Supabase** (`https://albatrosvfr.fr/`, `https://albatrosvfr.fr/**`) ne se touchent qu'exprès — `supabase/poser-reglages.sh --urls`. Resend demande la vérification du domaine (DNS chez Cloudflare). Après tout changement d'hébergement ou de domaine : **une inscription réelle de bout en bout**.

---

## 10. Design

Pour le moment, conserve les principes et le design actuels d'Albatros VFR.

Ne lance pas spontanément une refonte graphique complète simplement parce qu'une autre approche serait possible.

Le design pourra être retravaillé plus tard lorsque la structure technique et les fonctionnalités principales seront stabilisées.

Les améliorations UI/UX pertinentes peuvent toutefois être proposées lorsqu'elles améliorent réellement l'utilisation de l'application.

### 10.1 Le renommage visuel — nom et logo seulement

**Décision du 18/09/2026, appliquée deux fois.** Le nom change, le produit non.

- **20/09/2026** : « RadioTrainer » devient **AVIERO** — 51 occurrences visibles.
- **21/09/2026** : « AVIERO » devient **Albatros VFR** — 165 occurrences dans 98 fichiers,
  visibles et internes (titre, méta, les cinq marques de l'interface, l'accroche, les trois
  pages légales, la console d'administration, les deux gabarits d'e-mail, les sujets des
  e-mails, le préfixe `[Albatros VFR]` de la console, les noms des fichiers d'export, le nom
  npm, et les en-têtes de commentaire de tous les fichiers).
  Deux élisions corrigées à la main : « les textes **d'**Albatros VFR », « ce **qu'**Albatros VFR n'est pas ».
- **Volontairement NON renommé** : `radiotrainer_history_v2` et les quatorze autres clés de
  stockage (§ 7.2 : les renommer sans migration efface des données sans message d'erreur),
  la configuration de production et le domaine (§ 9.1), les migrations `sql/` déjà appliquées
  (§ 14 — leurs deux en-têtes disent encore AVIERO, et c'est voulu : un fichier posé ne se
  réécrit pas), le dépôt GitHub (§ 13.1), le nom de la branche `renommage-aviero` dans le
  journal ci-dessous (c'est une branche qui existe), et la prose qui *raconte* le passé.
- **`CGU_VERSION` n'a pas bougé**, et c'est raisonné dans `LEGAL.md § 1`.
- **Le logo a changé le 26/09/2026, à la demande du développeur** : une tête d'albatros dans un cercle (fichier fourni `albatros-vfr-logo.svg`) remplace l'avion en papier. **Deux symboles** en tête du `<body>` d'`index.html` : `#logo-albatros` (34-40 px : barres, cartes de connexion, menu, console d'admin ; trait +55) et `#logo-albatros-grand` (≥ 56 px : tableau de bord, à gauche du bonjour ; trait +20 — un grand logo a aussi été posé sur la vitrine, puis retiré à la demande le même jour). Icône d'onglet : `assets/images/favicon.svg` ; tracé en direct dans `404.html`. **Leçon** : une première version à 22-24 px et trait +100 a été jugée « pixelisée » — un dessin en traits fins ne se réduit pas, c'est la TAILLE qui règle le problème. Le `<svg>` appelant porte `viewBox="0 0 369 338"`, jamais celui du symbole (sinon le cercle est coupé). Version d'origine au trait fin : `assets/images/logo-albatros.svg`.
- **Conservé tel quel** : la charte actuelle — violet `#5b4bce`, bandeau noir, jetons de couleur, mise en page. **La typographie a changé le 30/09/2026** (voir le journal) : Atkinson Hyperlegible Next, hébergée sur le site.
- **Plus tard, étape dédiée** : l'identité visuelle complète.

---

## 11. Tests et qualité

Ne considère jamais une tâche comme terminée uniquement parce que le code ne produit plus d'erreur évidente.

Après une modification importante :

- vérifie les fonctionnalités concernées ;
- vérifie les interactions avec les autres parties du projet ;
- vérifie les erreurs console ;
- vérifie les données lorsque Supabase est concerné ;
- vérifie que les fonctionnalités existantes n'ont pas été cassées.

L'objectif est de pouvoir faire évoluer Albatros VFR rapidement sans introduire progressivement des régressions.

### 11.1 Les tests sont un prérequis, pas une amélioration future

**Décision du 18/09/2026.** État à cette date : le projet n'avait **aucun test automatisé**. Les huit suites décrites dans `INSCRIPTION.md § 7` vivaient dans `scratchpad/`, qui n'est pas versionné — elles étaient perdues.

Donc :

- **avant le premier gros découpage du code**, recréer et **versionner** (dans `tests/`) une base de tests suffisante pour vérifier que le comportement actuel n'est pas cassé ;
- la migration se fait **étape par étape, avec une vérification après chaque étape importante** ;
- une étape dont les tests ne passent pas n'est pas fusionnée (§ 13).

**Fait (phase 0, 18/09/2026).** `tests/` existe et est versionné : 65 vérifications de contrat (Node seul, < 1 s) et 47 de parcours (Playwright + Chromium, deux largeurs d'écran). Tout se lance par `sh tests/lancer_tout.sh`. Le détail, les deux décisions structurantes et la liste de ce qui n'est **pas** couvert sont dans `tests/README.md` — à lire avant de toucher aux tests.

Ce qu'ils surveillent en priorité, parce que c'est ce que le découpage casse en silence : les **62 symboles** déclarés dans un bloc de script et lus par un autre. Ils ne passent pas par `window` ; les perdre, les dupliquer ou les charger trop tard ne produit aucune erreur au chargement.

Reste à couvrir : le parcours d'inscription et les RLS, qui demandent un **projet Supabase de test** — les tests coupent volontairement toute requête vers le projet de production.

---

## 12. Explications

Le développeur veut comprendre ce qui est fait.

Explique donc les décisions techniques de manière :

- simple ;
- claire ;
- directe ;
- mais sans supprimer les détails techniques importants.

Évite le jargon inutile.

Lorsqu'un concept est complexe, commence par expliquer simplement ce qu'il signifie, puis donne les détails techniques nécessaires.

### 12.1 Sois court

**Va droit au but.** Les réponses longues font perdre du temps et finissent non lues.

- L'essentiel d'abord : ce que tu as fait ou ce que tu recommandes, en quelques lignes.
- Le détail ensuite, et seulement s'il change une décision.
- Pas de récapitulatif de ce que le développeur vient de dire.
- Pas d'inventaire d'options écartées : donne **ta** recommandation.
- Un long document seulement si le développeur le demande explicitement.

---

## 13. Git

Le projet doit progressivement adopter une vraie méthode Git avec notamment :

- branches ;
- commits propres ;
- historique compréhensible ;
- possibilité de revenir en arrière ;
- versions stables.

Lorsque Git est utilisé, privilégie des commits cohérents et faciles à comprendre plutôt que de mélanger de nombreuses modifications sans rapport.

### 13.1 Une branche par étape

**Décision du 18/09/2026.**

- **Dès la première vraie phase de restructuration** : une branche par étape importante, fusionnée **uniquement lorsque les tests passent**.
- **Avant cela** : aucun changement important sur le dépôt GitHub sans l'avoir expliqué au préalable.
- Renommer le dépôt `Radiotrainer` casse la connexion de Workers Builds au dépôt (Cloudflare › Worker › Settings › Build) : à refaire côté Cloudflare dans la foulée. Le site, lui, ne dépend plus de l'URL GitHub Pages.

---

## 14. Documents de référence

Avant de modifier une partie du projet, lis le document qui la couvre. Ils sont denses et à jour, et expliquent surtout **pourquoi** les choses sont comme elles sont.

| Avant de toucher à… | Lire |
|---|---|
| la phraséologie, un scénario, une réponse du contrôleur | `PHRASEOLOGIE-MANUEL.md` + `Manuel_Phraseologie.pdf` — **obligatoire** (§ 2) |
| chercher une formulation que le simulateur n'a pas encore | `PHRASEOLOGIE-CATALOGUE.md`, puis `assets/donnees/phraseologie-manuel.json` — les 1 054 répliques du manuel, avec qui parle |
| le schéma Supabase, les RLS, les vues, la console d'admin | `assets/admin/README.md` (schéma, RLS, notice) puis `ADMIN.md` (décisions) |
| l'inscription, l'auth, les réglages Supabase, les e-mails | `INSCRIPTION.md` |
| les mentions légales, les CGU, la confidentialité, les licences d'images | `LEGAL.md` (§ 15) |
| les migrations SQL | `sql/` — numérotées, idempotentes, **jamais réécrites après application** |
| l'état réel de la base, ce qui bloque, ce qui attend | **§ 21 de ce fichier** — à lire avant toute reprise |

Si une modification rend un de ces documents faux, **mets le document à jour dans le même travail**. Un document périmé coûte plus cher que pas de document — c'est déjà arrivé (`assets/admin/README.md § 5` listait comme « à faire » des mesures que `assets/sync.js` prenait déjà).

---

## 15. Cadre légal

Le détail est dans `LEGAL.md` et dans les trois pages du site (mentions légales, CGU, politique de confidentialité). À ne pas recopier ici, mais à respecter :

- **Ne jamais écrire à l'utilisateur quelque chose de faux sur ses données.** Une phrase comme « rien n'est envoyé sur Internet » est une promesse de confidentialité, pas une tournure de style. Si le code change, la phrase change.
- Les trois pages légales doivent rester **accessibles sans compte** (RGPD art. 13) : elles sont dans la liste `PAGES` du routeur pour cette raison.
- Les jalons de consentement (`cgu_le`, `age_15_le`, `cgu_version`) sont horodatés **par la base**, jamais par le client. Ne jamais contourner `inscription_jalon()`.
- **Modifier les CGU peut obliger à redemander le consentement** — c'est à quoi sert `cgu_version`.
- La question « comment avez-vous connu Albatros VFR » est **facultative par obligation légale** (consentement, art. 7.4 RGPD). Ne jamais la rendre obligatoire.
- Les images ont des licences distinctes (usage, attribution) : `LEGAL.md § 2 bis`.
- Le bloc légal complet sera revu **avant la mise en ligne publique** ; en attendant, on corrige au fil de l'eau ce qui est devenu faux.

---

## 16. Style de code

### 16.1 Les commentaires

Le code actuel commente **en français**, densément, et explique **pourquoi** plutôt que **quoi**. Souvent en racontant le piège déjà tombé :

> *« Le piège s'est déjà refermé deux fois ici (`.nav-navlog`, `.modal`) et une troisième sur `.sidelink` : l'entrée Administration portait bien `hidden`, et restait affichée pour tout le monde. »*

**C'est une qualité rare du projet, à conserver.** Continue dans ce style :

- en français ;
- le **pourquoi**, la décision, l'alternative écartée et la raison de l'écarter ;
- quand un bug a été corrigé à cet endroit, **dis lequel** — c'est ce qui empêche de le réintroduire ;
- pour la phraséologie, la référence au manuel avec la page.

### 16.2 Nommage — convention PROPOSÉE, à valider

Le code mélange aujourd'hui français (`rtEntrer`, `chargerProfil`, `terrains`, `epelerChiffres`) et anglais (`showPage`, `loadHistory`, `pickVoice`). Proposition, **à valider avant d'être généralisée** :

- **fichiers et dossiers** : français, minuscules, tirets (`noyau/stockage.js`, `vol/aleas.data.js`) — c'est déjà la logique de `assets/admin/pages/` ;
- **fonctions et variables métier** : **français**, comme la majorité du code récent, et comme le domaine (phraséologie française, manuel DSNA) ;
- **on ne renomme pas l'existant pour la cohérence seule** : un identifiant anglais qui fonctionne reste en place, sauf s'il est de toute façon déplacé ;
- **exception** : ce qui vient d'une API extérieure garde son nom (`session`, `token`, `profiles`, `insert`, les options Supabase et Leaflet).

Tant que cette convention n'est pas validée, **ne lance aucun renommage de masse.**

---

## 17. Lancer et tester l'application

### 17.1 Lancer

L'application est un site statique : aucune installation, aucune dépendance à installer.

```sh
# Depuis la racine du projet
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Servir en `http(s)` et **non** par double-clic : l'authentification Supabase ne fonctionne pas en `file://` (§ 6.1).

Pour que l'inscription et la connexion fonctionnent en local, `http://localhost:8000` doit figurer dans la liste blanche de redirection du projet Supabase. Si ce n'est pas le cas, l'ajouter **côté développement uniquement** — et ne pas toucher au Site URL de production (§ 9.1).

### 17.2 Tester

```sh
npm install && npx playwright install chromium   # une seule fois
sh tests/lancer_tout.sh                          # tout
sh tests/lancer_tout.sh contrat                  # la lecture du code seule, < 1 s
```

Lancer les tests de contrat **après chaque déplacement de code** : ils coûtent une seconde et disent la plupart des dégâts d'un découpage raté. Les tests de parcours avant chaque commit.

Un test rouge se **lit** avant d'être réparé : chacun décrit une panne réelle, et `tests/contrat/inventaire.json` ne se regèle qu'en connaissance de cause (`node tests/contrat/_geler.mjs`, puis lire le diff).

Le contrôle manuel reste nécessaire pour ce que les tests ne voient pas (§ 11.1 et `tests/README.md`) :

1. **Console du navigateur vide** — aucune erreur au chargement, aucune pendant la navigation.
2. **Un scénario complet** — page Scénarios, micro, jusqu'au récapitulatif et au score.
3. **Un vol complet** — page Navigation, départ et arrivée, jusqu'à l'historique.
4. **Les deux thèmes** — clair et sombre, sur les pages touchées.
5. **Largeur téléphone** (~400 px) sur les pages touchées.
6. **Si Supabase est concerné** — vérifier la ligne réellement écrite en base, pas seulement l'absence d'erreur côté client.
7. **Si l'auth est concernée** — une inscription et une connexion réelles, de bout en bout.
8. **Si la voix est concernée — SAFARI, à l'oreille.** Le 30/09/2026, la voix réaliste était muette sous Safari (icône de son affichée, caractères facturés) alors que Chrome parlait : Safari passe par un autre chemin (5-voix.js › `parElement`, un `<audio>` déverrouillé au premier geste). Le projet de tests `safari` (WebKit, `tests/parcours/safari.spec.js`) vérifie que ce chemin est pris et va jusqu'au bout, mais WebKit n'a pas de haut-parleur. Donc, dans un vrai Safari, après toute modification de `5-voix.js` : Paramètres › Voix et micro › « Écouter un exemple » (compte admin), puis un scénario de plusieurs messages. Idéalement aussi sur iPhone.

Ne déclare jamais une tâche terminée sur la seule absence d'erreur (§ 11).

---

## 18. Propositions et nouvelles idées

Tu es encouragé à proposer de nouvelles idées pour Albatros VFR.

Tu peux notamment proposer :

- nouvelles fonctionnalités ;
- améliorations UX ;
- améliorations techniques ;
- nouvelles façons d'organiser les données ;
- nouvelles fonctionnalités pédagogiques ;
- améliorations de la progression ;
- fonctionnalités communautaires ;
- fonctionnalités destinées aux instructeurs ;
- améliorations commerciales ou produit.

Ne considère jamais que la liste actuelle des fonctionnalités représente la limite du projet.

Lorsque tu proposes une idée importante, explique :

- le problème qu'elle résout ;
- son intérêt pour Albatros VFR ;
- sa difficulté approximative ;
- ses éventuelles conséquences techniques.

Puis attends une validation avant de lancer une modification importante.

---

## 19. Principe général de développement

Le but n'est pas simplement de faire fonctionner Albatros VFR aujourd'hui.

Le but est de construire une base suffisamment propre, sécurisée et évolutive pour permettre à Albatros VFR de devenir progressivement une véritable plateforme aéronautique.

Pour chaque décision importante, réfléchis donc à :

- ce qui fonctionne aujourd'hui ;
- ce qui sera nécessaire demain ;
- la facilité de maintenance ;
- la sécurité ;
- la possibilité d'ajouter de nouvelles fonctionnalités ;
- l'expérience utilisateur ;
- le risque de casser l'existant.

Privilégie les solutions simples lorsqu'elles suffisent, mais n'hésite pas à proposer une architecture plus ambitieuse lorsqu'elle devient réellement nécessaire.

---

## 20. Règle fondamentale

Avant une modification importante :

COMPRENDRE → ANALYSER → EXPLIQUER → PROPOSER → VALIDER → MODIFIER → TESTER

Pour les petites corrections sans risque :

COMPRENDRE → MODIFIER → TESTER

L'objectif final est de construire Albatros VFR comme un produit réel, professionnel et capable d'évoluer sur le long terme.

---

## 21. OÙ EN EST LE TRAVAIL — à lire en premier, état au 20/09/2026

### 21.1 Ce qui est fait et poussé

La **phase 2 est close** (§ 6.2), et une base de tests existe : **184 vérifications automatiques** (98 de contrat, 11 de migration, 75 de parcours), plus deux outils lancés à la demande.

```sh
sh tests/lancer_tout.sh            # les 184, hors réseau
sh tests/lancer_tout.sh contrat    # la lecture du code seule, < 1 s
sh tests/lancer_tout.sh migrations # le SQL sur un PostgreSQL jetable, hors ligne
sh tests/lancer_tout.sh base       # le catalogue et les politiques, CONTRE LE PROJET RÉEL
node tests/comparer-rendu.mjs      # le rendu avant/après un découpage (voir son en-tête)
node tests/mesurer-pixels.mjs      # le contraste sur les PIXELS (site servi requis)
```

### 21.2 `sql/002-progression.sql` — APPLIQUÉ EN ENTIER le 20/09/2026

Ce paragraphe a été, pendant une journée, le point le plus important de cette section. Il ne l'est plus.

| § de la migration | État en base |
|---|---|
| § 1 — les 13 exercices | appliqué (19/09/2026) |
| § 2 — `profiles.etat_vol` | **appliqué** (20/09/2026) |
| § 3 — `v_daily_practice` et les trois autres vues | **les quatre présentes** (20/09/2026) |
| § 4 — les politiques RLS | conformes, écriture anonyme refusée partout |

Vérifié par `sh tests/lancer_tout.sh base`, qui interroge le projet réel : « Le catalogue et les politiques sont conformes. »

**Ce que ça débloque :** `profiles.etat_vol` porte le vol interrompu. Un vol coupé au milieu se reprend désormais depuis n'importe quel appareil, ce que le code savait faire depuis le 18/09 sans pouvoir s'en servir.

#### La leçon, qui vaut plus que la panne

Le fichier avait été **collé dans l'éditeur SQL** de Supabase, et le collage s'était arrêté en route. 390 lignes, 24 ko : un collage partiel passe **sans la moindre erreur**, l'éditeur affiche « Success », et la moitié n'est jamais partie. Personne ne l'a su pendant une journée, et rien dans l'application ne pouvait le dire — le code était juste, c'est la base qui était incomplète.

**Règle qui en découle, et qui vaut pour toute migration à venir :** un fichier SQL se pose par l'API, jamais par le presse-papier.

```sh
SUPABASE_ACCESS_TOKEN='sbp_…' sh supabase/poser-sql.sh sql/00X-….sql
sh tests/lancer_tout.sh base
```

Le jeton se crée sur `supabase.com/dashboard/account/tokens` et **se révoque après usage** : il donne un accès complet à tous les projets, bien au-delà de ce site.

`assets/admin/README.md § 4.2` porte désormais cet avertissement à la place du « collez ce script », et `tests/verifier-migrations.mjs` vérifie hors ligne, à chaque exécution de la suite, que l'enchaînement des fichiers monte bien un projet neuf.

#### Ce qui reste, et pourquoi on n'y touche pas

Les séances des six scénarios enregistrées **avant le 19/09/2026** ont `exercise_key = null` en base. `assets/sync.js` réessaie sans la clé quand la clé étrangère est refusée : la séance est sauvée, mais détachée. Elles s'affichent « Scénario » et ne sont pas relançables. Les nouvelles s'attachent correctement.

**Elles ne sont pas récupérables automatiquement, et c'est démontré :** la ceinture de `sync.js` met `exercise_key` à `null`, et **aucun autre champ de la ligne ne dit quel scénario c'était**. Le déroulé des échanges (`session_steps.phase`, `.station`) le trahirait peut-être, mais rattacher une séance au **mauvais** exercice serait pire que la laisser générique — l'élève relancerait un exercice qu'il n'a jamais fait, et la console compterait faux.

Avant d'envisager quoi que ce soit, il faudrait d'abord **savoir combien elles sont**. C'est une lecture, et elle demande un accès administrateur (RLS) :

```sql
select count(*) as detachees, min(started_at) as la_plus_ancienne, max(started_at) as la_plus_recente
  from public.sessions where kind = 'scenario' and exercise_key is null;
```

Si le compte est petit — ce qui est probable, le site n'est pas ouvert au public — **ne rien faire est la bonne réponse.**

### 21.3 Ce qui a été fusionné dans la nuit du 19 au 20/09/2026

`main` et `origin/main` sont synchronisés. Cinq lots, chacun sur sa branche, chacun fusionné tests verts (§ 13.1).

| Lot | Quoi |
|---|---|
| `sql-003-et-verif-catalogue` | `sql/003` (verse `is_admin()` et la RLS d'`exercises` dans une migration) et `tests/verifier-catalogue.mjs` (compare le catalogue réel à celui du code, sonde les politiques) |
| `sql-000-socle` | `sql/000-socle.sql` — les six tables, `handle_new_user()` et son déclencheur, la clé étrangère du catalogue, cinq index, la RLS des six tables, les politiques d'`app_errors` et `admin_audit_log`. Plus `tests/verifier-migrations.mjs` |
| `contraste-audit` | L'audit annoncé par `INSCRIPTION.md § 8`, et cinq textes repassés au-dessus du seuil AA |
| `renommage-aviero` | La décision § 10.1 appliquée une première fois : RadioTrainer → AVIERO, 51 occurrences visibles |
| `mesure-pixels` | `tests/mesurer-pixels.mjs`, et la réponse chiffrée à la question du § 8 |

**Pourquoi `sql/000` et pas le `sql/004` annoncé.** Un numéro de migration est un **ordre d'exécution**. `sql/001` fait `alter table public.profiles`, `sql/002` insère dans `public.exercises` : les deux supposent ces tables. Un fichier numéroté 004 qu'il faut jouer en premier est un piège — sur un projet neuf, jouer 001 avant lui s'arrête sur « relation does not exist ».

**Ce que le banc d'essai a trouvé en tournant la première fois**, et qui n'était pas qu'un défaut du nouveau fichier : `public.is_admin()` n'était définie qu'en `sql/003`, alors que `sql/000` **et** `sql/002` l'appellent — 002 quatre fois, dans son § 4. Sur une base vide, les migrations s'arrêtaient là. L'en-tête de `sql/003` **annonçait** la panne sans que son numéro permette de l'éviter. Elle vit désormais dans le socle ; `sql/003` garde son `create or replace`, sans effet, comme trace de la fois où le manque a été trouvé.

**Deux dépendances de TEST ont été ajoutées** — `@electric-sql/pglite` (le PostgreSQL jetable) et `pngjs` (la lecture des pixels). L'application, elle, reste un site statique sans aucune dépendance.

### 21.4 Le fossé entre les migrations et la base réelle

La base de production a été **bâtie à la main depuis `assets/admin/README.md`** : les tables, `is_admin()`, `profiles_garde()`, trois vues, toutes les politiques. Les migrations `sql/001` et `sql/002` ne décrivent qu'une partie de tout ça.

Conséquence concrète, tant que c'était vrai : **rejouer les migrations sur un projet neuf ne reproduisait pas la production.**

**Comblé sur la branche `sql-000-socle` (§ 21.3), et vérifié plutôt qu'affirmé.** `tests/verifier-migrations.mjs` rejoue `sql/*.sql` sur un PostgreSQL vierge et jetable à chaque exécution de la suite. Les quatre fichiers passent, deux fois de suite, et le schéma obtenu porte les six tables sous RLS, les quatre vues en `security_invoker`, les cinq fonctions, le déclencheur d'inscription et les treize exercices.

Ce qui reste hors de portée de ce banc d'essai, parce que PGlite est un PostgreSQL et non un Supabase : le comportement réel des politiques face à un **vrai jeton**, avec **deux comptes**. Ça demande toujours un **projet Supabase de test** — lequel reste le préalable à tester l'inscription, les RLS entre comptes et la fusion entre appareils (les tests coupent Supabase exprès, voir `tests/README.md`).

La bonne nouvelle : monter ce projet de test n'est plus un chantier. C'est quatre commandes, dans l'ordre des numéros, et une vérification.

**`sql/000` et `sql/003` ne sont PAS posés sur la production, et c'est délibéré.** Ils y seraient en principe sans effet — mais tous deux font `drop policy if exists` puis `create policy` sur des politiques RLS **vivantes**. Le 20/09/2026, la sortie de `sql/002` a montré que la production porte exactement les noms et les définitions que `sql/003` recrée (`exercice : lecture` → `true`, `exercice : écriture admin` → `is_admin()`) : pour celui-là, le no-op est **prouvé**. Pour `sql/000`, les politiques d'`app_errors` et d'`admin_audit_log` n'ont jamais été listées — leurs noms en production sont **inconnus**. Si la base les porte sous d'autres noms, les siennes resteraient EN PLUS des nôtres : les politiques se cumulent par OU, rien ne devient plus permissif, mais on ne saurait plus laquelle décide.

À faire avant, en lecture seule :

```sql
select tablename, policyname, cmd, qual, with_check from pg_policies
 where schemaname = 'public' and tablename in ('app_errors','admin_audit_log')
 order by tablename, cmd;
```

Rien ne presse : ces deux fichiers existent pour monter un projet **neuf**, et c'est déjà vérifié hors ligne à chaque exécution de la suite.

### 21.5 La fusion des réglages — TRANCHÉE le 20/09/2026

**Le plus récent gagne, CLÉ PAR CLÉ, sans exception.**

Ce qui ne marchait pas : `_maj` portait sur l'**objet entier**. On changeait le thème sur son téléphone, puis le débit de la voix sur son ordinateur — le plus récent des deux objets écrasait l'autre, et le premier changement disparaissait sans le moindre message. Exactement ce que le § 7.1 interdit.

Ce qui est en place (`assets/donnees.js § 7`) : chaque clé porte son propre horodatage dans `_majCles`, et la fusion se fait clé par clé. Les deux changements survivent.

**La question qui avait été posée, et sa réponse.** Un réglage **remis à sa valeur par défaut** sur un appareil redescend-il chez les autres ? **Oui** — c'est le plus récent qui gagne, sans exception. Remettre un réglage à zéro est un choix comme un autre, et le traiter à part aurait voulu dire distinguer « je n'ai jamais touché ce réglage » de « je l'ai remis à zéro », deux états qui se ressemblent et qu'on aurait devinés de travers une fois sur deux.

Trois points qui ne se devinent pas :

- **La forme ne change pas pour ceux qui lisent.** `_majCles` est une clé de plus **à côté** des valeurs, pas autour d'elles : `s.theme` reste `s.theme`. Envelopper chaque valeur dans un `{valeur, horodatage}` aurait cassé tous les lecteurs — y compris les onze lignes du `<head>` qui posent le thème avant le premier pixel, où une erreur ne se voit pas, elle se subit.
- **L'existant ne vaut pas zéro.** Les réglages déjà en base n'ont qu'un `_maj` global : il sert de repli pour chacune de leurs clés. Sans lui, tout ce qui existe se ferait écraser par le premier appareil qui écrit.
- **La photo de l'état se prend au CHARGEMENT**, pas au premier changement. `rtSaveSettings()` a déjà écrit la nouvelle valeur quand il appelle le module : photographier à ce moment-là, c'est photographier l'après, et ne plus jamais rien voir changer. Le piège s'est refermé une fois ; `tests/parcours/reglages-fusion.spec.js` le surveille.

Huit vérifications couvrent la règle, et six d'entre elles rougissent si on revient à l'ancienne.

### 21.6 Ce que les tests ne couvrent toujours pas

- **le micro réel** — la chaîne entière est couverte par une fausse `SpeechRecognition` (`tests/parcours/micro.spec.js`), mais pas l'audio. **Vérifié à la main par le développeur le 20/09/2026 : la Navigation et le micro fonctionnent.** À refaire après toute étape qui touche à la voix ou à la reconnaissance ;
- **l'inscription et les deux parcours d'authentification avec un VRAI e-mail** — les huit vérifications de `mot-de-passe-oublie.spec.js` couvrent l'enchaînement avec Supabase remplacé par une doublure. Qu'un message parte et que Supabase accepte le code demande une vraie adresse, à la main. **Et les trois gabarits doivent être posés sur le projet** (`sh supabase/poser-reglages.sh`), sans quoi le message arrive sans code ;
- **les RLS avec deux comptes** — il faut le projet de test. Depuis le 19/09/2026, `tests/verifier-migrations.mjs` vérifie hors ligne que les politiques sont bien POSÉES et que le déclencheur crée un profil ; ce qu'un compte connecté voit des données d'un autre reste non couvert ;
- **la fusion entre deux appareils** — jamais vérifiée, ni par un test ni à la main ;
- **l'envoi réel vers Formspree** — les vingt-six vérifications de
  `tests/parcours/contact.spec.js` interceptent le service et fabriquent sa réponse. Que
  le formulaire accepte le corps JSON envoyé et que le message arrive demande un envoi
  réel, à la main, une fois (§ 22) ;
- **le contraste sur d'autres machines** — couvert depuis le 20/09/2026 sur deux fronts : `tests/parcours/contraste.spec.js` (couleurs résolues, ~1 350 relevés, dans la suite) et `tests/mesurer-pixels.mjs` (les pixels, 310 textes, à la demande). Mais le second n'a tourné que sur une machine, et le lissage des polices varie d'un système à l'autre. Détail : `INSCRIPTION.md § 8 bis` et `§ 8 ter`.

---

---

## 22. Contact / Feedback — ajouté le 22/09/2026

**Depuis le 24/09/2026 : un bouton flottant en bas à droite** (`.ct-fab`), sur
toutes les pages — vitrine, connexion et application — et un lien dans le pied
de page (accessible **sans compte** — le signalement le plus utile est souvent
« l'inscription ne marche pas »). L'entrée du menu de gauche a été retirée. Les
deux ouvrent la même modale.

**La bulle de première connexion** (`#ctBulle`, `RTContact.bulle()`) explique le
bouton une fois, à la première entrée dans l'application. « Déjà vue » vit dans
les **réglages** (`rt-settings` › `bulleContactVue`), qui suivent le compte
(§ 21.5) — pas dans une clé de stockage de plus (§ 7.2).

`assets/modules/contact.js` + `assets/css/15-contact.css`. Le module n'emprunte
**aucun** symbole au moteur ni aux autres modules : il ne lit que le DOM,
`location.hash`, `window.RTAuth` et les réglages du noyau (`rtSettings`,
`rtSaveSettings`) s'ils existent, toujours derrière un test. Sa place dans la
liste des `<script>` est donc libre — ce qui n'est le cas d'aucun de ses
voisins.

### Les cinq points qui ne se devinent pas

1. **Le bouton ne porte PAS de `data-page`.** Le routeur relie chaque
   `[data-page]` à une `<section>` : un `data-page="contact"` serait tombé sur
   l'accueil, sans erreur, puisque « contact » n'est pas dans `PAGES`. Le bouton
   garde `.sidelink` pour le style et l'infobulle du menu replié — sans
   `data-page`, la règle qui marque l'entrée courante le laisse tranquille.
   `tests/parcours/contact.spec.js` surveille exactement ça.

2. **L'envoi passe par `fetch` avec `Accept: application/json`.** Sans cet
   en-tête, Formspree répond par une **redirection** vers sa page de
   remerciement. Ici, ça voudrait dire perdre le scénario en cours — exactement
   au moment où quelqu'un signale ce qui vient d'y mal tourner.

3. **Le garde anti-double-envoi n'est pas `bouton.disabled`.** Un formulaire se
   soumet aussi par Entrée depuis un champ, et ce chemin ne passe pas par le
   bouton. Le drapeau `envoiEnCours` est testé au **début** du gestionnaire de
   `submit`.

4. **Le contexte est relevé à l'OUVERTURE, pas à l'envoi.** Entre les deux, on a
   pu quitter son scénario pour venir cliquer sur « Contact » : relever à
   l'envoi rapporterait la page d'où l'on écrit, pas celle dont on parle. Il est
   **montré** dans la modale, jamais caché — on envoie une information sur ce que
   la personne faisait, elle doit pouvoir la lire avant d'appuyer.

5. **Rien n'est stocké en base.** Pas de table, pas de RLS, pas de clé de
   stockage local de plus (§ 7.2). Un formulaire de contact n'a pas à entrer
   dans le schéma tant qu'on ne veut pas en faire un suivi de tickets — et le
   jour où on le voudra, ce sera une décision de § 4, pas un effet de bord.

### Ce que ça a révélé ailleurs

La mesure de contraste de la modale en largeur téléphone a trouvé un défaut qui
n'a rien à voir avec elle : `.cta:hover` et `.btn.primary:hover` posent
`var(--violet-dark)` **en fond**, et ce jeton bascule en violet clair dans le
thème sombre — le blanc du libellé tombait à **2,16:1** au survol, sur tous les
boutons pleins du site. C'est le piège déjà nommé le 20/09 (« un jeton de
couleur de TEXTE ne sert jamais de FOND », `INSCRIPTION.md § 8 ter`). Corrigé
dans `09-theme-sombre.css`.

### Ce qui reste à faire à la main

**Un envoi réel n'a jamais été tenté** : les vingt-six vérifications de
`contact.spec.js` interceptent Formspree et fabriquent la réponse, pour la même
raison que Supabase est coupé (`tests/README.md`). Que le formulaire
`xjykwqbg` accepte bien ce corps JSON et que le message arrive demande **un
envoi réel, une fois**. À faire avant la mise en ligne.

---

## Journal des décisions

Ce que le développeur a tranché, avec la date. Ne pas rouvrir une décision de cette liste sans raison nouvelle.

| Date | Décision | Où |
|---|---|---|
| 18/09/2026 | `file://` abandonné comme contrainte produit ; modules ES, bundler, TypeScript, React autorisés si bénéfice réel, migration majeure à valider | § 6.1 |
| 18/09/2026 | Fusion des données entre appareils, jamais remplacement ; UUID de séance ; signaler tout type non fusionnable | § 7.1 |
| 18/09/2026 | Albatros VFR = nouveau nom de RadioTrainer ; nom + logo maintenant, design conservé, identité visuelle plus tard | § 10.1 |
| 18/09/2026 | Frontière refactoring / validation : comportement observable inchangé → agir ; contrat modifié → demander | § 5.1 |
| 18/09/2026 | Tests = prérequis avant le premier gros découpage ; migration étape par étape avec vérification | § 11.1 |
| 18/09/2026 | Domaine pas encore acheté : ne pas toucher à la configuration de production ; ordre imposé le jour J | § 9.1 |
| 18/09/2026 | Une branche par étape dès la première phase de restructuration, fusion seulement si les tests passent | § 13.1 |
| 18/09/2026 | Le bloc légal complet sera revu avant la mise en ligne ; correction au fil de l'eau de ce qui est faux | § 15 |
| 18/09/2026 | Explications courtes, droit au but | § 12.1 |
| 18/09/2026 | Base de tests versionnée dans `tests/` : contrat (Node) + parcours (Playwright). Les tests ne parlent jamais au Supabase de production | § 11.1 |
| 18/09/2026 | Le CSS quitte `index.html` : 14 fichiers numérotés, l'ordre est la cascade | § 6.2 |
| 18/09/2026 | Les données statiques quittent le moteur : aérodromes, phraséologie, reconnaissance, icônes. Chargées AVANT le moteur | § 6.2 |
| 19/09/2026 | Étape 2.1 : les sept blocs IIFE quittent `index.html` vers `assets/modules/`, chacun au même rang de chargement | § 6.2 |
| 19/09/2026 | Étape 2.2 : le noyau de services vers `assets/noyau/`, sept fichiers numérotés par dépendance. La voix ATC déplacée telle quelle | § 6.2 |
| 19/09/2026 | Étape 2.3 : le moteur vers `assets/scenarios/moteur.js`. `index.html` redevient un document — phase 2 close | § 6.2 |
| 19/09/2026 | Le mode strict rendu aux fichiers de `assets/donnees/`, perdu lors de l'extraction de la phase 1 | § 21 |
| 19/09/2026 | Les tests ne parlent jamais au Supabase de production ; l'étape `base` du lanceur est la seule exception, et en lecture | `tests/README.md` |
| 19/09/2026 | Le socle du schéma devient `sql/000-socle.sql` et non `sql/004` : un numéro de migration est un ordre d'exécution, pas une étiquette | § 21.3 |
| 19/09/2026 | `is_admin()` remonte dans le socle : `sql/002` l'appelait quatre fois et `sql/003`, qui la définissait, passe après | § 21.3 |
| 19/09/2026 | Les migrations sont rejouées à chaque exécution des tests sur un PostgreSQL jetable en mémoire — hors ligne, donc dans « tout » | `tests/README.md` |
| 20/09/2026 | Le contraste des deux thèmes est audité à chaque commit, sur les quatorze pages. Cinq défauts trouvés, cinq corrigés — la bascule globale de `--ink-2` n'est plus nécessaire pour être conforme, et reste au développeur | `INSCRIPTION.md § 8 bis` |
| 20/09/2026 | Le renommage visuel en AVIERO est appliqué : 51 occurrences visibles. Les clés de stockage, la configuration de production, les migrations appliquées et le dépôt ne bougent pas. `CGU_VERSION` non plus | § 10.1 |
| 21/09/2026 | Le projet s'appelle **Albatros VFR**. 165 occurrences dans 98 fichiers. Mêmes exclusions qu'au 20/09 — clés de stockage, production, `sql/` posés, dépôt, `CGU_VERSION` | § 10.1 |
| 21/09/2026 | Les 281 pages du manuel DSNA deviennent un catalogue de 1 054 répliques, **produit par un script** et non saisi : `fr`/`en` sont les chaînes exactes du PDF, le locuteur vient des pictogrammes (manuel p. 8). Un couple français/anglais douteux n'est JAMAIS deviné — l'entrée sort avec une seule langue | `PHRASEOLOGIE-CATALOGUE.md` |
| 20/09/2026 | `sql/002-progression.sql` appliqué en entier par l'API. Une migration se pose par `supabase/poser-sql.sh`, JAMAIS par le presse-papier de l'éditeur SQL — un collage partiel affiche « Success » | § 21.2 |
| 20/09/2026 | Les séances détachées d'avant le 19/09 ne sont pas récupérables : `exercise_key` est à `null` et aucun autre champ ne dit quel scénario c'était. Les rattacher au jugé serait pire | § 21.2 |
| 20/09/2026 | L'authentification reste **entièrement Supabase** : `signInWithOtp` / `resetPasswordForEmail` / `verifyOtp` / `updateUser`. Aucun code n'est fabriqué, stocké ni comparé côté client — `tests/contrat/auth-otp.test.mjs` le surveille | `INSCRIPTION.md § 1 bis` |
| 20/09/2026 | « Mot de passe oublié » et « inscription interrompue » deviennent DEUX portes : on ne récupère pas un mot de passe qui n'a jamais existé, et les deux jetons ne sont pas interchangeables | `INSCRIPTION.md § 1 bis` |
| 20/09/2026 | Les gabarits d'e-mail ne portent plus de lien : le parcours est un parcours par CODE, et un lien ouvre un onglet où le formulaire reprend à zéro | `INSCRIPTION.md § 1.2` |
| 20/09/2026 | `poser-reglages.sh` ne touche plus au Site URL ni à la liste blanche sans `--urls` : travailler sur les e-mails ne doit pas entraîner la configuration du domaine (§ 9.1) | § 9.1 |
| 20/09/2026 | Fusion des réglages **clé par clé**, le plus récent gagne, sans exception — y compris le retour à la valeur par défaut | § 21.5 |
| 20/09/2026 | Les trois derniers contrastes sous le seuil corrigés. `--ink-2` reste `#6b7280` : la mesure sur pixels ne justifie pas de bascule globale, la question du § 8 est close | `INSCRIPTION.md § 8` |
| 20/09/2026 | Un jeton de couleur de TEXTE ne sert jamais de FOND : `--violet-dark` bascule en violet clair dans le thème sombre. `.step__n` en était mort | `INSCRIPTION.md § 8 ter` |
| 20/09/2026 | Le contraste se mesure sur DEUX fronts : les couleurs résolues dans la suite (large, rapide, indulgent), les pixels à la demande (juste, mais dépendant de la machine — donc jamais un test) | `INSCRIPTION.md § 8 ter` |
| 22/09/2026 | « Contact / Feedback » : une modale à trois vues, envoyée à Formspree en arrière-plan (`fetch` + `Accept: application/json`), JAMAIS par soumission de formulaire — une redirection vers l'écran de remerciement ferait perdre le scénario en cours. Aucune table Supabase : un formulaire de contact n'entre pas dans le schéma tant qu'on n'en fait pas un suivi de tickets | § 22 |
| 22/09/2026 | L'identifiant de formulaire Formspree est **public** par construction, comme la clé anonyme de Supabase. La protection contre les abus est chez le prestataire (quota, piège à robots), pas dans un `if` du navigateur | § 22 |
| 22/09/2026 | La politique de confidentialité et le pied de page NOMMENT Formspree et disent ce qui part. § 15 : une phrase fausse sur les données de l'utilisateur est une promesse rompue, pas une tournure de style | § 15, § 22 |
| 22/09/2026 | `.cta:hover` et `.btn.primary:hover` posaient `--violet-dark` EN FOND : en thème sombre, le blanc du libellé tombait à 2,16:1 sur TOUS les boutons pleins du site. Même piège que `.step__n` le 20/09. Corrigé en assombrissant au survol (#5849c9, 6,54:1), comme le fait le thème clair | `assets/css/09-theme-sombre.css` |

| 24/09/2026 | Le code reçu par e-mail fait **huit chiffres** (réglage « Email OTP Length » du projet Supabase) : textes, exemples et contrôle de longueur alignés | `assets/auth.js`, `assets/inscription.js` |
| 24/09/2026 | Renvoi du code à l'inscription soumis au même garde-fou que la connexion (`attenteRestante('otp')`), et délai porté de 60 à **120 s** partout — les logs montraient un 200 suivi d'une rafale de 429 | `assets/inscription.js` |
| 24/09/2026 | Contact : bouton flottant à la place de l'entrée du menu, et bulle de première connexion retenue dans les réglages du compte | § 22 |
| 24/09/2026 | Connexion et inscription prennent la carte OACI de l'accueil, FIXÉE à l'écran (en `absolute`/`cover`, elle zoomait à chaque réponse du questionnaire) ; la tour, essayée puis retirée, carte centrée. Questionnaire : UNE question à la fois, « Suivant » / « Précédent », compteur recalculé en route ; questionnaire refondu (pastilles, Piper Cub, question facultative en dernier et discrète) ; œil sur les champs où l'on CHOISIT un mot de passe ; DR400 posé sur un ciel en thème sombre | `06-coquille.css`, `02-vitrine.css` |
| 24/09/2026 | Administration › Test : « Simuler une première connexion », du questionnaire à la bulle Contact, SANS aucune écriture en base (`RTInscription.simuler`) — les étapes 1 à 3 ne sont pas rejouables, elles enverraient un e-mail et changeraient le mot de passe du compte qui teste | `assets/admin/pages/test.js` |

| 25/09/2026 | `sql/004-app-errors-longueurs.sql` : bornes de longueur sur les six colonnes de texte d'`app_errors`, qui accepte les dépôts anonymes. `not valid` (les lignes anciennes ne sont pas relues), aucune politique touchée. Borne la taille d'UNE ligne, PAS le nombre de lignes. Vérifié hors ligne par `tests/verifier-migrations.mjs`, dans les deux sens | `sql/004` |

| 27/09/2026 | Début de vol : UNE phrase par échange, identique en Scénario et en Navigation. Mise en route « organisme, indicatif, demande mise en route, information X » (p. 39-40) ; approbation SANS QNH (absent de la p. 39 ; au départ, le QNH ne vient que de « demande paramètres pour le départ », p. 38, ou de l'ATIS) ; roulage = annonce complète p. 45 « indicatif, type, parking, demande consignes de roulage pour vol à destination de … », réponse « roulez et entrez aire d'attente … et rappelez prêt ». « Personnes à bord » RETIRÉ : absent de tout le manuel | `phraseologie-scenarios.js`, `navigation.js` |

| 27/09/2026 | Voix Google (premium) — étape 1 : une Supabase **Edge Function** `voix-atc` plutôt que Cloud Run. Clé API Google restreinte à Text-to-Speech, dans les secrets Supabase SEULEMENT ; aucune clé Supabase secrète : premium, statut et quota (100 000 caractères/jour) se décident en base par `voix_consommer()` (`sql/005`), appelée avec le jeton de l'utilisateur. Premium = `profiles.plan = 'premium'`, posé à la main par l'admin. Voix navigateur gratuite et repli sur tout code ≠ 200. Frontend PAS encore touché | `supabase/functions/voix-atc/README.md` |
| 27/09/2026 | Reprise des séances locales : le cache d'un compte (copie de la base écrite par `charger()`) n'est plus jamais remonté — il recréait chaque séance sous un second identifiant (46 doublons mesurés en production, 2 comptes), puis faisait refuser le paquet entier (« ON CONFLICT DO UPDATE command cannot affect row a second time »). Paquet dédoublonné par identifiant ; après une montée ratée, le cache n'est plus écrasé | `assets/donnees.js`, `tests/parcours/migration-cache.spec.js` |
| 27/09/2026 | Les 46 doublons supprimés en production, après simulation en lecture seule et validation du développeur. Gardée : l'originale (celle qui porte un `user_agent`), sinon l'une de deux copies identiques ; échanges identiques dans les 46 paires, aucune information présente sur la seule copie. Un seul bloc SQL, annulé de lui-même si le compte n'était pas exactement 46 séances / 1 543 échanges / 2 comptes, ou si une séance choisie portait un `user_agent`. Résultat : 221 → 175 séances, 0 doublon, 0 échange orphelin | — |
| 27/09/2026 | Voix Google mise en service : secret `GOOGLE_TTS_API_KEY` posé (empreinte vérifiée), `sql/005` et `sql/006` posés par l'API et vérifiés objet par objet, `voix-atc` déployée (v2). Testé en réel : 39 voix, MP3, quota à 429 sur un compteur à 99 990, 403 en compte gratuit. Le choix se fait dans Paramètres › Voix du contrôleur (Navigateur / Google Premium, liste de voix-atc rangée par modèle, aperçu) ; la politique de confidentialité le dit, indicatif compris | `supabase/functions/voix-atc/README.md`, `LEGAL.md` |
| 27/09/2026 | Historique de consommation séparé du quota : `voix_historique` (par compte, jour, voix : caractères, requêtes, modèle), écrit dans la transaction du quota, JAMAIS le texte, lisible par l'administration seule. Page Admin › Voix Google ; coût ESTIMÉ en USD d'après `assets/admin/data/tarifs-voix.js`, seul fichier où un prix est écrit ; Chirp HD : « Tarif non publié » | `sql/006`, `assets/admin/pages/voix.js` |
| 27/09/2026 | Administration de la voix (`sql/007`) : voix proposées aux élèves et voix par défaut (`voix_catalogue` — une voix absente est active, une voix désactivée est refusée PAR LA BASE dans `voix_consommer`, sans décompte), plafond journalier réglable (`voix_reglages`, 1 000 à 10 000 000), passage free ⇄ premium sans paiement. Posé en production le 27/09/2026. Écriture réservée au rôle « admin » — pas aux modérateurs, `est_admin_plein()` —, par trois fonctions qui écrivent le journal d'audit dans la même transaction ; aucune politique d'écriture sur les tables. Admin › Voix Google en trois onglets : Consommation (avec jour par jour), Voix proposées (écoute, activer, par défaut), Quotas et comptes (plafond, comptes, journal) | `sql/007`, `assets/admin/pages/voix.js` |
| 27/09/2026 | Quand la voix Google est active, le sélecteur « Voix ATC » de l'écran des scénarios (voix du navigateur) est remplacé par « Voix Google : … — à changer dans les Paramètres » : il ne servait plus à rien et laissait croire qu'on changeait de voix | `assets/modules/parametres.js` |
| 27/09/2026 | Retouches d'interface : l'épellation s'appelle **« Alphabet aéro »** (libellés seulement — la route `#epellation`, le `kind` `spelling` et les fichiers ne bougent pas) ; le logo ramène au tableau de bord si l'on est connecté, en haut de la vitrine sinon ; **la vitrine (accueil + pages légales) reste toujours claire**, le réglage de thème reprend effet dans l'application (`parametres.js › applyTheme` + script du `<head>`) ; cartes du tableau de bord un cran plus couvrantes en sombre | `routeur.js`, `parametres.js`, `10-tableau.css` |
| 27/09/2026 | Admin › Voix Google › « Écouter » muet : la sortie audio naissait hors du clic quand le réglage était « Navigateur » (Safari la laisse suspendue). `Voix.preparerAudio()` dans le clic, délai d'aperçu porté à 12 s (`opts.delaiGoogle`), cause de l'échec dite en clair | `5-voix.js`, `assets/admin/pages/voix.js` |
| 27/09/2026 | **Une voix par contrôleur** : chaque station (Tour, Sol, Info, ATIS…) reçoit un rang à sa première prise de parole ; la première garde la voix choisie, les suivantes prennent les voix d'après, et chacune garde la sienne jusqu'au rechargement. Google : même MODÈLE que la voix choisie (même prix), jamais une voix désactivée, genre opposé d'abord. Navigateur : autres voix françaises locales, sinon une autre hauteur. Les appelants posent la station (`Voix.station`) ; essai, écoute admin et autres appareils gardent la voix choisie | `5-voix.js`, `tests/parcours/voix-controleurs.spec.js` |
| 28/09/2026 | Cloudflare (Workers + Static Assets), en préparation — GitHub Pages et le DNS inchangés. Cloudflare publie `dist/`, fabriqué par `outils/construire-site.mjs` à partir d'une LISTE BLANCHE (`index.html`, `404.html`, `robots.txt`, `sitemap.xml`, `Manuel_Phraseologie.pdf`, `assets/` sans ses README ni les deux JSON jamais chargés). PAS `assets.directory: "."` (publiait `node_modules` — workerd 128 Mio, « Asset too large » — et tout le dépôt), PAS de dossier `public/` (GitHub Pages ne publie que la racine ou `/docs`), PAS de liste d'exclusions (le prochain fichier interne serait publié d'office). `not_found_handling: "404-page"`, comme GitHub Pages. Wrangler épinglé en dépendance de développement. `tests/contrat/publication.test.mjs` surveille les deux sens : rien de chargé n'est oublié, rien d'interne ne part | `wrangler.jsonc`, `outils/construire-site.mjs` |
| 29/09/2026 | Premium payant, étape 1 : la base (`sql/008`, **posée en production le 29/09/2026**, en une transaction, après sauvegarde de `profiles` — export JSON hors dépôt et copie `sauvegardes.profiles_20260929`, schéma non exposé par l'API). Expiration PAR DATE (`profiles.premium_jusqua`, vide = Premium sans fin, offert par l'admin), sans tâche planifiée ; `premium_actif(uid)` seule définition du Premium, lue par `voix_consommer` ; table `paiements` (`stripe_session_id` unique = idempotence du webhook ; `user_id` vidé et non supprimé avec le compte, pièce comptable ; lecture de soi et admin plein) ; `stripe_crediter()` au seul `service_role` : 3 mois calendaires sur le jour de Paris, fin à 23:59:59 Paris, prolongation depuis la fin actuelle, jamais de raccourci d'un Premium sans fin, paiement de test réservé à l'admin plein. **Faille fermée** : un modérateur pouvait écrire `plan` et `role` (se donner le Premium, se nommer admin) — `role`, `plan`, `premium_jusqua` au seul admin plein. `admin_definir_plan` → Premium sans fin. Compteur de la console : `admin_premium_actifs()`. Stripe PAS encore branché | `sql/008`, `tests/verifier-migrations.mjs` § 13 |
| 29/09/2026 | **Phase de lancement : Albatros VFR gratuit.** Par jour et par compte : voix Google offerte pour les 3 premiers vols et les 5 premiers scénarios, puis voix du navigateur (message une fois, au moment de la bascule), puis limite à 10 vols / 15 scénarios. QCM (`quiz`) non comptés ; admin et Premium sans limite. Compté au LANCEMENT (`lancerVol`, `launchScenario`), pas à la reprise ni au changement de terrain ; compteurs dans `rt-quota` (`n`, `s`, drapeaux) — pas de clé de plus —, recomptés depuis la base à la connexion. Les compteurs sont dans la page (les contourner ne coûte rien) ; la voix Google, elle, est bornée EN BASE (`sql/009` : `plafond_gratuit` 20 000 car./jour, phase fermable par `lancement_gratuit`). Google devient le moteur PAR DÉFAUT (choix « Navigateur » respecté) : politique de confidentialité mise à jour. Vitrine et tableau de bord disent la phase et les compteurs. À l'écran, elle s'appelle **« voix réaliste du contrôleur »** (le mot Google ne reste que dans les pages légales, qui nomment le prestataire, et dans la console d'administration) | `assets/modules/lancement.js`, `sql/009` (**posé en production le 29/09/2026**, une transaction, après sauvegarde hors dépôt ; vérifié objet par objet et par `lancer_tout.sh base`), `LEGAL.md` |
| 29/09/2026 | Vitrine : bloc « À propos — Créé par un élève pilote, pour les élèves pilotes », texte du développeur, avant l'offre. PAS de rubrique d'avis tant qu'il n'y a pas de vrais avis (des avis inventés seraient une pratique commerciale trompeuse) | `index.html` |
| 29/09/2026 | **Avis des élèves** (`sql/010`, cahier des charges du développeur). Un avis par compte, pour soi, après **2 séances terminées** (vol ou scénario, `sessions.status`), né `en_attente` — le déclencheur impose statut, vedette, pseudo (figé depuis `profiles.pseudo`) et date, quoi qu'envoie le client ; droits PAR COLONNE (dépôt : note + commentaire ; lecture publique : sans `user_id`) ; AUCUNE politique UPDATE / DELETE : l'auteur ne peut rien changer, même par l'API. Modération par l'admin PLEIN seul (`est_admin_plein`), quatre fonctions `admin_avis_*` journalisées ; 3 vedettes au plus, publiées seulement (contrainte + index unique sur le rang). **Modifié le même jour (`sql/011`, posé en production, demande du développeur) : un avis dès la connexion, sans nombre de séances** ; le rappel, lui, attend toujours la 2e séance. Widget : option « Laisser un avis » dans la modale Contact ; rappel discret après la 2e séance (« Plus tard » = 3 séances, dans les réglages) ; accueil (3 vedettes, section cachée s'il n'y en a pas) ; page publique `#avis` (tri, mention L111-7-2 / D111-16 s., délai de **3 jours au plus**) ; Admin › Avis. Politique de confidentialité : ligne « Avis » | `sql/010` (**posé en production le 29/09/2026**, une transaction, vérifié droit par droit), `assets/modules/avis.js`, `assets/admin/pages/avis.js` |
| 29/09/2026 | Paramètres en **cinq onglets** (Compte · Voix et micro · Entraînement · Apparence · Données), onglet dans l'adresse (`#parametres/voix`). Nouveaux : bruit radio Aucun / Faible / Moyen / Fort (`bruit`, absent = moyen = l'ancien niveau), bips du micro (`bipsMicro`), taille du texte pendant les exercices (`texte`, `html.txt-grand`). Le logo de la console d'administration ramène aussi au tableau de bord | `parametres.js`, `4-bruit-radio.js`, `admin.js` |
| 30/09/2026 | **Choix de la voix et essai : administrateur seul.** Un compte élève garde le moteur (réaliste / navigateur), le débit et le bruit, mais n'a plus ni liste de voix (Paramètres et écran des scénarios) ni bouton d'essai ; il entend la voix par défaut réglée dans Admin › Voix Google, même s'il en avait choisi une avant (5-voix.js › voixGoogle). Choix d'interface, pas règle de sécurité. Tests de voix : projet Playwright `safari` (WebKit) ajouté, `npx playwright install webkit` une fois ; check-list § 17.2, point 8 | `parametres.js`, `5-voix.js`, `playwright.config.js`, `tests/parcours/safari.spec.js` |
| 30/09/2026 | **Voix réaliste muette sur Safari** : l'essai disait « Voix réaliste : Achernar », l'onglet montrait l'icône de son, la base comptait les caractères — et rien ne sortait ; Chrome parlait. Sur Safari et tout navigateur d'iPhone/iPad, le MP3 de Google est désormais joué par UN élément `<audio>` réutilisé, déverrouillé dans un geste (amorce du premier clic, `preparerAudio`) par un silence ; Chrome et les autres gardent Web Audio. Lecture refusée → même repli que toute panne audio. `window.RT_LECTEUR_ELEMENT = true` force ce chemin (tests) | `assets/noyau/5-voix.js`, `tests/parcours/voix-google.spec.js` |
| 30/09/2026 | **Retours d'un vol Nice → Orly.** (1) Nombres « comme dans la vie courante » (manuel p. 17) : piste « vingt-deux » (zéro de tête dit : « zéro sept »), fréquence « cent trente-cinq décimale cinq cent trente » (exemple du manuel), zones « R cent soixante-deux » ; lettres et chiffres collés séparés (« 27L »). La reconnaissance comprend les nombres en lettres et « décimale » (`digitCanon`), l'affichage recolle « unité 35 décimales 530 » en « 135.530 ». (2) **Contresens** : un mot qui change le sens (« je rappelle » là où l'on attend la position ; « autorisé » dans la bouche du pilote, p. 59) ajoute un élément FAUX s'il n'est ni dans la phrase attendue ni dans ses variantes (`ecartsDeSens`, Scénarios et Navigation). (3) Prononciation : nouvelles graphies (Juliett, November, Quebec, X-ray, Pan Pan → « panne », ident, VOR/NOTAM/ATIS/AFIS/CAVOK dits comme des mots, p. 11-12), frontières Unicode ; **réglables depuis Admin › Voix Google › Prononciation** (atelier : écouter, enregistrer pour tous, revenir) — `sql/013`, table `prononciations`, lecture publique, écriture admin plein journalisée. (4) Reconnaissance : ident, trafic, vent arrière (Safari), VOR (devenait « vol »), SIGMET, NOTAM. (5) Carte : les phases d'aérodrome se placent en DISTANCE du terrain (`nmDep`/`nmArr`) — au départ de Nice pour Orly, l'avion était au-dessus des Préalpes au décollage. (6) « Réenregistrer » avant « Valider ma réponse » | `1-alphabet-nombres.js`, `moteur.js`, `navigation.js`, `reconnaissance.js`, `sql/013` (**posé en production le 30/09/2026**) |
| 30/09/2026 | **Supprimer un compte, et bloquer son adresse** (`sql/012`, validé par le développeur). Admin › Utilisateurs › fiche : « Supprimer » (réinscription possible) ou « Supprimer et bloquer l'adresse » (3 ans ; à l'inscription, le site répond seulement « Une erreur est survenue. Réessayez plus tard. »). Confirmation en retapant l'adresse, revérifiée EN BASE ; admin plein seul ; jamais soi ni un compte à rôle. Suppression par une fonction `security definer` (`delete from auth.users`, cascade) — **aucune clé `service_role`**, tout dans une transaction. Blocage = EMPREINTE SHA-256 de l'adresse (minuscules, sans `+…`) + pseudo, lue par le hook Auth « Before User Created » (`hook_avant_creation_compte`) — **à activer dans la configuration Auth**, le SQL seul ne bloque rien. Historique de voix gardé SANS NOM (`voix_historique_anonyme`), paiements gardés sans nom ; journal sans adresse ni pseudo. Liste « Adresses bloquées » + « Débloquer ». CGU § 10 et politique de confidentialité mises à jour (`LEGAL.md`) | `sql/012` (**posé en production le 30/09/2026**, hook Auth activé et vérifié : `hook_before_user_created_enabled: true`), `assets/admin/pages/users.js`, `assets/auth.js` |
| 30/09/2026 | **Prononciation OACI pour toutes les voix.** La table `PRONONCIATION_RADIO` (1-alphabet-nombres.js) passe de « Echo » seul à dix lettres qu'une voix française lit à la française (India, Juliett, Mike, November, Quebec, Romeo, Uniform, Whiskey, X-ray, Yankee, Zulu), d'après l'OACI (Annexe 10, vol. II — le manuel DSNA n'a pas la table). Appliquée DANS le moteur (`Voix.parler` / `empiler`), donc aux voix Google, aux Paramètres et à l'admin — `opts.brut` pour s'en passer. Réécritures idempotentes (le moteur peut passer deux fois). Admin › Voix Google › **Prononciation** : alphabet, chiffres, sigles, mots de l'aviation, avions, nombres lus à la radio, une phrase libre ; la graphie envoyée sous chaque mot ; le résultat (Google ou cause du repli) RESTE affiché — un toast passe | `1-alphabet-nombres.js`, `5-voix.js`, `assets/admin/pages/voix.js` |
| 30/09/2026 | **Version téléphone et transitions « à la iOS 26 »** (demande du développeur). Encadré ROUGE « Chrome, Edge ou Safari uniquement » juste sous le champ d'adresse, à la connexion et à l'inscription (ligne de plus si le navigateur n'a pas de reconnaissance vocale). Téléphone (≤ 860 px) : barre du haut en verre, `#hamburger` à droite ouvrant le tiroir de gauche comme sur ordinateur (une barre d'onglets en bas et un menu en feuille, essayés le même jour, ont été RETIRÉS à la demande : trop de place), cartes plus rondes, champs à 16 px (sinon Safari zoome) ; **tour de contrôle retirée de l'accueil sous 760 px**. Partout : pastille qui GLISSE sous l'entrée choisie (menu, onglets des Paramètres, segmentés) — visible seulement pendant le glissement, l'entrée garde son fond au repos (contraste mesurable) ; enfoncement au toucher ; entrée des pages et des panneaux. Ordinateur au repos : pixel pour pixel celui d'avant (vérifié par captures) | `17-mouvements.css`, `mouvements.js`, `tests/parcours/routeur-mouvements.spec.js` |
| 30/09/2026 | **Téléphone, deuxième lot** (demande du développeur). **Appui long** sur la pastille violette (menu, onglets des Paramètres, segmentés, y compris ceux des Scénarios — `.segmented-ui`, jusque-là jamais branchés) : elle se soulève, suit le doigt ou la souris, l'entrée où on la lâche est choisie ; un clic ordinaire reste un clic. **Au doigt** il faut l'appui long (sinon on veut défiler) ; **à la souris** on attrape dès que ça bouge, sans attente, pastille collée au curseur (corrigé le même jour : l'attente s'appliquait aussi à la souris, et la pastille « ne suivait pas »). **Logo** : battement d'aile à chaque clic. Transitions sur les réglages des Scénarios et de la Navigation (bascules, champs qui réapparaissent, listes qui s'ouvrent). **Listes au doigt** : les aérodromes de la Navigation prennent, sur écran tactile seulement, la liste du moteur à la place du `<datalist>` (Safari iPhone ne l'affiche pas) ; les deux listes restent ouvertes quand on les fait défiler au doigt. **« Régler »** sur les pastilles radio et transpondeur, écran tactile seulement (`pointer:coarse`) : affiche directement la fréquence ou le code demandé. **Exercice à l'horizontale** (`paysage.js`) : au lancement d'un vol ou d'un scénario sur téléphone, plein écran + verrouillage paysage ; refusé (toujours le cas sur iPhone) → on reste en vertical (un message « Tournez votre téléphone » a existé quelques heures, retiré à la demande). En paysage : un écran sans défilement, échange à gauche (bouton micro collé en bas), radio + transpondeur resserrés à droite, carte (ou fiche du terrain) plus petite dessous ; transitions coupées pendant la rotation. Ordinateur : identique (captures comparées) | `17-mouvements.css`, `mouvements.js`, `paysage.js`, `navigation.js`, `moteur.js`, `tests/parcours/routeur-mouvements.spec.js` |
| 30/09/2026 | **Téléphone, retours du développeur** : le message « Tournez votre téléphone » est RETIRÉ, puis le passage automatique en paysage aussi (plus de plein écran ni de verrou, Android compris : le sens du téléphone est celui que la personne choisit ; tourné, la mise en page paysage prend la main) ; photo d'avion masquée sous 860 px ; en paysage, TROIS colonnes (échange · avionique · carte sur toute la hauteur) ; transpondeur : saisie directe du code (chiffres 0-7, comme la saisie de la radio) et boutons agrandis, écran tactile seulement ; « Régler » en **Débutant seulement** (Scénarios et Navigation) ; plus de zoom au double tap (`touch-action:manipulation`, le pincement reste) | `17-mouvements.css`, `paysage.js`, `navigation.js`, `moteur.js` |
| 30/09/2026 | **Accueil allégé** (demande du développeur, ordinateur et téléphone) : phrase « 68 112 vols différents… cinq façons de s'entraîner » retirée ; section « 5 façons différentes de s'entraîner » SUPPRIMÉE (on passe du hero au DR400) ; « Les questions qu'on nous pose » repliées derrière une flèche (`<details>`, une colonne). Le développeur annonce d'autres changements de l'accueil | `index.html`, `02-vitrine.css` |
| 30/09/2026 | **Accueil, bloc du DR400** : texte ET avion dans un rectangle violet plein (`--violet`, texte blanc, 6,3:1 / 5,3:1) ; « …sont sous vos yeux pendant que vous parlez. » (la piste déduite du vent retirée de la phrase) ; « Ensuite, c'est vous qui parlez. Mise en route, décollage, croisière, panne… » (texte du développeur) | `index.html`, `02-vitrine.css` |
| 30/09/2026 | **Accueil réécrit et harmonisé** (textes choisis par le développeur, proposition par proposition). Phrases simples partout : étapes, six cartes, neuf imprévus (sens vérifié au manuel : p. 46 « piste » réservé à un cas précis, p. 211 « Roger » / « Trafic en vue »), offre (« Créez un compte, faites un vol complet, et jugez par vous-même. »), bande de l'offre (aussi dans `routeur.js › RT_OFFRE`), questions, fin de page (« Lors d'une panne en vol, vous n'aurez pas le temps de chercher vos mots. Entraînez-vous ici. »). Les six lignes de la bande sont GARDÉES telles quelles, à la demande. Mise en page : une largeur commune (1 120 px, accueil seulement), fonds alternés (`.sec--surface`), imprévus en cartes (3 colonnes ou 1, jamais 2), six cartes en 3 colonnes, questions pleine largeur | `index.html`, `02-vitrine.css`, `routeur.js` |
| 30/09/2026 | **Police du site : Atkinson Hyperlegible Next** (choix du développeur après recherche : Inter, Geist, Satoshi — la police système en est très proche — sont celles de presque tous les sites récents, d'où l'air « fait par une IA »). Lisibilité maximale, 0/O et 1/I/l distincts (F-BYFO, LFOR, 118.300). **Hébergée sur le site** (`assets/polices/`, licence OFL jointe), jamais Google Fonts : pas d'adresse IP envoyée à un tiers. Tout le site, admin compris, par `--sans`. Étiquettes en MAJUSCULES espacées à chasse fixe → texte normal (`18-typographie.css`) ; la chasse fixe ne reste qu'aux afficheurs (radio, transpondeur, fréquences, codes, alphabet, code e-mail). Étapes de l'accueil réécrites (texte du développeur, « Comment ça marche ») | `01-socle.css`, `18-typographie.css`, `LEGAL.md § 2 ter` |
| 30/09/2026 | **Accueil** : espaces entre et dans les sections réduits d'environ un quart (accueil seulement). Un rectangle violet autour du titre du hero a été essayé puis RETIRÉ à la demande (« affreux ») : le titre reste sur la carte, en encre du site | `02-vitrine.css` |
| 01/10/2026 | **Barre du haut de la vitrine : un rectangle flottant** (barre « îlot » des sites récents) — décollé de 12 px du haut et des bords, coins arrondis, gris foncé légèrement transparent, page floutée dessous ; sur l'accueil il flotte au-dessus du hero, ailleurs il garde sa place. Les pages publiques se rangent à gauche de « Se connecter » : « Avis » pour commencer. **Page Avis refaite** : titre et tri à gauche, panneau de la note à droite (moyenne en grand + répartition par étoiles), avis en grille de cartes (pastille à l'initiale, pas de photo), mention légale dans un encadré lisible tel quel | `01-socle.css`, `16-avis.css`, `avis.js`, `index.html` |
| 01/10/2026 | Barre plus sombre (`rgba(18,19,24,.90)`) et plus large (1 360 px) ; bouton **« Accueil »** dans la barre, visible hors de l'accueil seulement (sur téléphone, le nom à côté du logo s'efface alors pour que tout tienne). Accueil : les six cartes « Tout ce qui passe par la radio » remplacées par six bénéfices (texte du développeur, titres en casse normale — § typographie du 30/09), titre de section retiré | `01-socle.css`, `index.html` |
| 01/10/2026 | **La barre de l'accueil se replie** en descendant, jusqu'au logo et au nom (largeur mesurée, transition de 0,55 s), VERS LA DROITE — marge droite fixe, gauche automatique : le logo glisse à droite —, et se rouvre en remontant. Logo ou nom cliqué barre repliée : elle se rouvre, la page NE remonte PAS ; barre ouverte, le logo garde son rôle. Clic pris en capture sur la barre, avant l'écouteur de routeur.js | `mouvements.js`, `17-mouvements.css`, `tests/parcours/retouches-interface.spec.js` |
| 01/10/2026 | Accueil, étape 2 de « Comment ça marche » : « Faites votre annonce » devient « Le contrôleur vous répond » — voix réaliste, une voix par contrôleur (décision du 27/09) | `index.html` |
| 01/10/2026 | **Type d'avion reconnu sous toutes ses écritures** (« DA50 » dit, « da 50 » transcrit, compté faux) : `typeAvionVariantes` (2-texte.js) — forme écrite, séparée, collée, épelée, chaque mot de 3 lettres et plus —, servie aux Scénarios et à la Navigation. Noms d'avions protégés du correcteur flou (`protegerMots`) : « Jodel » devenait « hotel », « Pitts » « piste », « CAP10 » « cap ». Vérifié sur les 180 types, sans faux positif (« DA 40 » ne valide pas un DA50). Phrase « Phase de lancement : gratuit… » retirée du hero (la section Offre l'annonce) | `2-texte.js`, `moteur.js`, `navigation.js`, `tests/parcours/types-avion.spec.js` |
| 01/10/2026 | **Journal des échanges refait** (Scénarios et Navigation, `journalLigne` dans 7-interface.js) : un encadré repliable « Échanges précédents (n) », fermé par défaut sur téléphone et ordinateur ; dedans une conversation (contrôleur à gauche, vous à droite), le score posé sur votre bulle au lieu de lignes « — Éléments détectés » / « — Échange réussi ». Les avis (micro, fréquence…) s'affichent aussi HORS de l'encadré (`.journal-avis`) jusqu'à la réponse suivante. **Logos en noir et blanc** partout (pastille blanche sur fond sombre, noire sur fond clair ; 404 comprise) ; logo de la barre mobile recentré dans sa pastille. **Avion de la carte** : le Cessna vu de dessus fourni par le développeur (`assets/images/avion-carte.png`, détouré, 32 px, liseré sombre), pour tous les avions — image du développeur, qui en est l'auteur (`LEGAL.md § 2 bis`) | `7-interface.js`, `navigation.js`, `moteur.js`, `07-navigation.css`, `06-coquille.css`, `admin.css`, `404.html` |
| 01/10/2026 | **Carte du hero : la Côte d'Azur, sans voile blanc** (`carte-oaci-accueil.webp`, tuiles 7_65-67_46-47, bord droit sur Menton — la carte française s'arrête là —, un peu plus dézoomée). Nice est donc à droite, en partie sous la tour sur ordinateur ; sur téléphone l'image est calée à droite. Lisibilité du titre et du texte par un HALO blanc autour des lettres, pas par un voile. Les écrans de connexion gardent l'ancienne carte (`carte-oaci-hero.webp`) | `02-vitrine.css` |
| 01/10/2026 | **Accueil refait de zéro, sombre, SANS violet** (demande du développeur : « l'accueil est affreux… aucune trace du violet »). Hero = photo plein cadre d'un cockpit en courte finale (Oskar Kadaksoo, Unsplash — `cockpit-finale*.webp`, deux tailles par `srcset`) ; tour découpée et carte OACI retirées de l'accueil (fichiers supprimés). Palette : nuit `#0b0d10`, ardoise `#13161a`, filet `#262b32`, brume `#eceef1`, gris `#a2a9b3`, accent unique **jaune « balise »** `#e9b949` (panneaux de position des voies de circulation) — porté par le « panneau » en tête de section et le bouton principal. Les jetons (`--violet` compris) sont REDÉFINIS sur `#page-accueil` : aucun composant partagé ne peut y ramener du violet. Barre du haut : « S'inscrire » et page courante en jaune balise, partout. Bouton Contact et sa modale sans violet sur l'accueil. Textes inchangés. Classes `acc-*` (`ac-*` = la liste d'autocomplétion). Test : aucun violet calculé sur l'accueil | `index.html`, `02-vitrine.css`, `01-socle.css`, `LEGAL.md § 2 bis` |
| 01/10/2026 | **Plus de violet sur tout le site** (demande du développeur, après le nouvel accueil). Les jetons gardent leur nom (`--violet`…) mais portent la palette de l'accueil : thème clair = graphite `#1f242b` (boutons, accents) ; thème sombre = fonds de l'accueil (`#0b0d10` / `#13161a`), boutons graphite clair `#4a525e`, texte d'accent jaune balise `#e9b949`. Barre latérale et console d'admin passées du bleu-violet au noir neutre, accent jaune. Images de fond et fonctionnalités inchangées ; **seules exceptions gardées violettes : les CTR sur la carte (convention de la carte)**. Hero de l'accueil **dézoomé** : photo calée sur la hauteur, bords fondus. **Chiffres de l'accueil recalculés au chargement** (`data-chiffre`, navigation.js ; `data-limite`, lancement.js) au lieu d'être écrits en dur | `01-socle.css`, `09-theme-sombre.css`, `06-coquille.css`, `02-vitrine.css` |
| 01/10/2026 | **Accueil vidé sous le hero** (demande du développeur : « on repart de 0 ») : restent le hero, les avis (cachés tant qu'il n'y en a pas) et les questions. Retirés : « Avant de partir », « Comment ça marche » et l'échange radio, les six bénéfices, les imprévus, **l'offre** (la phase de lancement reste dite sur le tableau de bord ; `RT_OFFRE` de routeur.js n'a plus rien à remplir sur l'accueil), l'appel final. Les nouvelles sections viendront une par une, sur indication du développeur | `index.html`, `02-vitrine.css` |
| 01/10/2026 | **Accueil, deuxième version** (« trop de noir… et l'inscription change complètement de design ») : photo du hero de nouveau en plein cadre, **sans aucun voile ni dégradé** — le titre (« Maîtrisez la radio comme un vrai pilote. », plus petit) et les boutons se posent sur le tableau de bord, détachés par une ombre autour des lettres ; panneau « Phraséologie radio VFR » retiré ; phrase d'introduction et quatre chiffres **sous** la photo, sur fond blanc ; sections claires (papier `#f4f5f7`, blanc, encre `#16191e`), jaune balise gardé pour le bouton principal et les panneaux. **Connexion et inscription** : la photo du cockpit, légèrement floutée, remplace la carte OACI en fond, et les boutons principaux des cartes prennent le jaune de l'accueil | `02-vitrine.css`, `06-coquille.css`, `index.html` |
| 01/10/2026 | Accueil, retouches du développeur : photo du hero **plein écran** (100svh, le blanc n'apparaît qu'en descendant) ; **titre seul sur la photo, en haut à droite** ; les deux boutons **à droite de la phrase d'introduction**, sous la photo (empilés dessous sur téléphone) ; « S'inscrire » de la barre du haut **de la couleur du logo** (blanc, encre noire) | `02-vitrine.css`, `01-socle.css`, `index.html` |
| 01/10/2026 | Tableau de bord : en thème clair, **un ciel** (Sam Schooler, Unsplash) remplace le hall d'embarquement, voile plus léger ; en thème sombre, cartes un cran **moins transparentes** (.72 → .82, teinte neutre) | `04-epellation.css`, `10-tableau.css`, `LEGAL.md` |
| 01/10/2026 | Accueil, sous les chiffres : **le DR400 à gauche, les six bénéfices à droite** (deux colonnes, texte du développeur, titres en casse normale) ; l'avion passe au-dessus sur écran étroit | `index.html`, `02-vitrine.css` |
| 01/10/2026 | Accueil, sous le DR400 : **section « Les pannes »** (textes du développeur, orthographe corrigée) et un **écran de démonstration** — alerte panne moteur, instruments, échange radio animé. L'exemple est une DÉMONSTRATION VISUELLE À FAIRE VÉRIFIER : il reprend mot pour mot le scénario Urgence (message MAYDAY étiqueté A-E selon la structure du Manuel p. 238, accusé « Mayday Roger, transpondeur 7700 » p. 238, collationnement p. 34-35) ; un test compare les deux. **Relevé au passage, non corrigé** : le scénario Urgence fait dire au contrôleur « Pan Pan Roger, **maintenez l'écoute** » — la p. 238 ne donne que « Pan Pan Roger » | `index.html`, `02-vitrine.css`, `tests/parcours/lancement.spec.js` |
| 01/10/2026 | **Accusés de détresse et d'urgence alignés mot pour mot sur le Manuel p. 238** : « {CALL}, Mayday Roger, transpondeur 7700. » et « {CALL}, Pan Pan Roger. », dans le scénario Urgence ET dans les imprévus des Scénarios (moteur.js › aleaUrgence) et de la Navigation. Retirés : « maintenez l'écoute », « reçu » à la place de « Roger », « terrain dégagé, vous êtes prioritaire » — absents du manuel. Le même jour, sur validation du développeur : la suite d'une urgence en Navigation (navigation.js › consequencesUrgence) reprend les phrases NORMALES d'intégration, de finale et de piste dégagée (p. 149, 151, 160-161). « Vous êtes prioritaire », « Les services de secours sont en place », « Secours en bord de piste », « les secours vous rejoignent », « une assistance vous attend » retirés : le manuel n'a aucune phrase sur la priorité ni sur les secours (281 pages parcourues). Restent deux règles du simulateur : transpondeur inchangé, numéro 1 dans le circuit (dit en vent arrière, p. 151-152) | `phraseologie-scenarios.js`, `moteur.js`, `navigation.js` |
| 02/10/2026 | Section des pannes **refaite** (nouveau texte du développeur) : titre « Et si quelque chose tournait mal ? », **grand compteur 43** (recompté sur ALEAS_SCEN), **mur des 43 situations** rangées par moment du vol (sol 5, à tout moment 9, en vol 21, circuit 8 — champ `ou`), les 5 vraies pannes en rouge ; bloc « À vous de gérer la situation », démonstration radio inchangée, conclusion. Un test vérifie que le mur affiche exactement les libellés de ALEAS_SCEN. NB : 43 = imprévus des Scénarios (mode Réel) ; la Navigation a sa propre liste | `index.html`, `02-vitrine.css`, `tests/parcours/lancement.spec.js` |
| 02/10/2026 | Section des pannes : **mur des 43 situations retiré**, et le compteur refait — un **cadran d'instrument à 43 graduations** (une par situation, autant que ALEAS_SCEN, test à l'appui) qui s'allument en jaune l'une après l'autre, le nombre au centre, sur fond clair (le bloc noir rayé est retiré) | `index.html`, `02-vitrine.css`, `tests/parcours/lancement.spec.js` |
| 02/10/2026 | Section des pannes : le haut (titre + compteur) et « À vous de gérer » (texte + démonstration) sur **la même grille 5/7** — compteur et démonstration alignés au pixel — et séparés par un filet | `02-vitrine.css` |
| 02/10/2026 | Accueil, sous les pannes : **« Entraînez-vous où vous voulez »** — bande couleur du fond des images (#333b3f), Mac + iPad à gauche (visuel principal, recadré au ras des appareils, bords fondus), l'iPhone détouré flottant devant le Mac **sur ordinateur seulement** (caché sous 1 000 px, demande du développeur), texte, trois appareils et « Votre entraînement vous suit partout. » à droite. Images fournies par le développeur (`LEGAL.md § 2 bis`) | `index.html`, `02-vitrine.css` |
| 02/10/2026 | Accueil, sous les appareils : **« Commencez gratuitement »** — carte centrée sur fond clair : gratuit pendant la phase de lancement, sans carte bancaire, tous les exercices, limites du jour (lues dans lancement.js › LIMITES, test à l'appui), boutons « S'inscrire gratuitement » et « Se connecter ». Ce bloc change si la phase de lancement se ferme ou si un prix est fixé | `index.html`, `02-vitrine.css` |
| 02/10/2026 | **Cours** (demande du développeur) : le cours « Manuel de phraséologie (DSNA) » (le PDF dans la page) est RETIRÉ — le PDF reste dans le dépôt mais n'est plus publié (`outils/construire-site.mjs`) ; « Alphabet phonétique » devient **« Alphabet aéronautique »**, sans description ni partie Chiffres ; nouveau cours **« Les mots de la radio »** : 18 expressions (Roger, Wilco, Affirm, Négatif, Collationnez, Standby, Impossible… Mayday, Pan Pan) avec leur sens recopié MOT POUR MOT du manuel (p. 19-20, règles d'emploi p. 21, p. 238) ; mention « D'autres cours arriveront prochainement ». **Carte** : phrase d'introduction réécrite, plus humaine | `epellation-cours.js`, `05-cours.css`, `index.html` |
| 02/10/2026 | **Mot de passe oublié : l'étape du nouveau mot de passe sautait.** `verifyOtp` ouvre la session et Supabase annonce `SIGNED_IN` : `onAuthStateChange` faisait entrer dans l'application avant l'étape 3. Drapeau `RTAuth.recuperationEnCours` levé pendant la vérification, l'entrée se fait après l'enregistrement. Le gabarit « Reset Password » du projet (code, sans lien) a été posé par le développeur dans le tableau de bord | `assets/auth.js`, `tests/parcours/mot-de-passe-oublie.spec.js` |
| 03/10/2026 | **Départ VFR, du premier appel au décollage, revu manuel en main** (décision du développeur). (1) **Plus de demande de mise en route en VFR** : la p. 39 est « Mise en route – clairance initiale – SID », exemples IFR ; l'exemple « Cas d'un vol VFR » (p. 45) passe de « {terrain} tour, {indicatif}, bonjour » / « {indicatif}, {terrain} tour, bonjour » à la demande de roulage, **lettre d'information comprise**. Scénario « Mise en route + roulage » → **« Contact et roulage »** (clé `roulage` inchangée ; `sql/014` pour le titre en base, **à poser**) ; Navigation : étape « Premier contact » à la place de la mise en route et de son collationnement (auto-information inchangée). (2) **« Prêt au départ, indicatif »** : PAS mot pour mot dans le manuel — déduction validée (règle « Prêt à …, indicatif » p. 77, 83, 222 ; mots p. 42) ; « point d'attente piste … » retiré du scénario, variantes réduites à « prêt au départ », la tour ne redit plus « rappelez prêt au départ » en Navigation, un agent AFIS ne dit plus « alignez-vous et attendez ». (3) **Une fois sur trois, départ immédiat p. 60** mot pour mot (question, « Affirme », « alignez-vous piste …, autorisé décollage immédiat » → « Je m'aligne piste … et je décolle »), gardé à la reprise d'un vol. (4) « dans l'axe **de piste** » (p. 63). **Restent hors manuel** : les départs AFIS et en auto-information (le manuel ne les traite pas) | `phraseologie-scenarios.js`, `navigation.js`, `PHRASEOLOGIE-MANUEL.md`, `sql/014`, `tests/parcours/depart-vfr.spec.js` |
| 03/10/2026 | **Arrivée et circuit revus manuel en main (p. 148-152, 214)**, Scénarios et Navigation. Arrivée en deux temps « Tour, bonjour, {indicatif} » / « {indicatif}, bonjour, j'écoute », puis « {indicatif}, {type}, VFR de A à B pour un atterrissage, {alt} pieds[, information X] » (« 5 milles au sud », inventé, retiré ; point d'entrée et estimée omis, faute des points VAC). **ATIS du terrain d'arrivée écouté avant le premier contact** (Scénario « Intégration » et Navigation ; météo d'arrivée tirée à cette étape, `meteoArrivee`). Sans ATIS : piste, vent, QNH AVANT « entrez vent arrière » (p. 148) ; collationnement « Je rappelle vent arrière piste … » (plus « J'entre vent arrière…, je rappelle… »). Circuit : comptes rendus « indicatif, position » ; « numéro N, suivez un Cessna 172, en base, rappelez base » collationné « Numéro N, trafic en vue, je rappelle base » ; « rappelez finale » collationné (deux collationnements qui manquaient en Navigation). Numéro tiré 2-3 (le 1 reste à l'urgence, sans trafic). Numéro et rappels = instructions : tour seulement (`twrSeul`), plus jamais dits par un agent AFIS. Imprévus insérés avant l'arrivée (`debutArrivee`). **Relevé, non corrigé** : au toucher, le pilote collationne « Piste X, autorisé toucher » — le manuel (p. 164) ne donne pas la réponse du pilote, et le pilote ne dit jamais « autorisé » ailleurs | `phraseologie-scenarios.js`, `moteur.js`, `navigation.js`, `tests/parcours/integration-circuit.spec.js` |
| 03/10/2026 | **L'ATIS doit être entendu** (demande du développeur) : sur l'écoute de l'ATIS, « Suivant » ne s'ouvre qu'une fois le poste accordé ET le message entendu en entier (fin de la première diffusion ; repli : durée de lecture estimée si la voix ne rend jamais la main ; sans synthèse vocale, le texte affiché suffit). Scénarios et Navigation, départ et arrivée. `window.RT_ATIS_IMMEDIAT` (posé par `tests/parcours/_aide.js`) le tient pour entendu dans les tests | `moteur.js › atisDejaEntendu`, `navigation.js › atisEntendu`, `tests/parcours/atis-ecoute.spec.js` |
| 03/10/2026 | **Le pilote choisit** (demande du développeur). Navigation : étapes de DÉCISION (`choix`), insérées au clic (`appliquerChoix`), gardées et rejouées à la reprise (`F.choixFaits` + graine de hasard `seed`, dans `rt-vol-en-cours` — pas de clé de plus). **Vol local refait** : après le décollage, tours de piste ou sortie en zone puis retour « pour un atterrissage » / « pour un toucher » (p. 149) ; avant chaque tour (tour) : normal, exercice d'encadrement, circuit basse hauteur (p. 164) ; à chaque finale : atterrissage complet, toucher (« Demande toucher » / « autorisé toucher », p. 164 ; refusé une fois sur sept : « Faites un atterrissage complet »), remise de gaz (p. 159, « Roger » p. 147), passage bas (p. 164). La tour fait faire un 360 une fois sur cinq (p. 150, collationné comme p. 132). Voyage : même décision en finale à l'arrivée. Scénarios : même choix en finale (tour de piste et « Intégration + atterrissage »), la boucle n'oubliait plus « rappelez finale ». Options « tour seulement » effacées face à un agent AFIS | `navigation.js`, `phraseologie-scenarios.js`, `tests/parcours/vols-choix.spec.js` |
| 03/10/2026 | **Toucher : collationnement « Piste X, autorisé toucher »** — la p. 164 ne donne pas la réponse du pilote ; la p. 34 range le toucher parmi les éléments de piste qui se collationnent, et le collationnement répète la clairance. Pas d'autre forme inventée | `PHRASEOLOGIE-MANUEL.md § 8` |
| 03/10/2026 | **Terrains AFIS : le manuel AFIS de l'UAF & FA (élaboré avec la DGAC, éd. novembre 2022)**, départ et arrivée VFR de Bourges, mot pour mot (Scénarios et Navigation) : « Information, bonjour, F-BX » / « j'écoute », « demandons paramètres pour le départ » → « rappeler pour rouler », « roulons point d'attente », « point d'attente piste 24, prêt au départ », « DR400 en finale, vos intentions » → « maintenons avant piste », « nous alignons », « décollons », « rappellerons en vue de l'aérodrome / vent arrière / finale », « piste engagée… quelles sont vos intentions ? » → « remettrons les gaz », « atterrissons », « au parking, quittons la fréquence ». **Retirés, faute de source** : un agent AFIS qui disait « roulez et entrez aire d'attente », « alignez-vous et attendez », « autorisé atterrissage » ou donnait un numéro dans le circuit. L'organisme AFIS s'appelle « … Information » (et plus « … Info ») | `PHRASEOLOGIE-MANUEL.md § 9` |
| 03/10/2026 | **Auto-information : l'arrêté du 12 juillet 2019** (utilisation des aérodromes) fixe les moments et le contenu des comptes rendus, pas leur formulation. Le simulateur reprend les comptes rendus du pilote du manuel AFIS, précédés du nom de la station à chaque message (diffusion). Retirés : « je mets en route », « j'entre au point d'attente », « je m'aligne et je décolle piste … » | `PHRASEOLOGIE-MANUEL.md § 10` |
| 03/10/2026 | Au passage : le cap de départ s'affiche sur trois chiffres (« cap 050 », p. 17) ; « Sortie de circuit, je quitte la fréquence » mot pour mot (p. 153) ; « Je roule parking aviation générale » mot pour mot (p. 160) ; le correcteur flou ne change plus « basse » en « base » | `moteur.js`, `navigation.js`, `2-texte.js` |
| 03/10/2026 | **Hébergement : Cloudflare Workers sur `albatrosvfr.fr`** (migration faite par le développeur ; audit puis corrections). Mentions légales § 2, confidentialité § 4 et § 6 : Cloudflare, Inc. remplace GitHub Pages comme hébergeur des fichiers. `supabase/poser-reglages.sh` pose désormais `https://albatrosvfr.fr/` (il visait encore github.io : lancé avec `--urls`, il aurait cassé l'inscription). CLAUDE.md § 9.1, INSCRIPTION.md, ADMIN.md et les commentaires mis à jour. **Pas encore retirés, et c'est voulu** : `CNAME`, `.nojekyll` et GitHub Pages (le `www` passe encore par GitHub), l'origine `workers.dev` de voix-atc (adresse encore active) — ordre au § 9.1 | `index.html`, `LEGAL.md`, `supabase/poser-reglages.sh` |
| 03/10/2026 | **Pages juridiques en version 1.0** (cahier des charges du développeur). Éditeur et directeur de la publication : Adrien Kermel, particulier ; adresse NON publiée (LCEN 6-III-2, communiquée à l'hébergeur Cloudflare) ; contact@albatrosvfr.fr. Région de la base : **Irlande (AWS eu-west-1)**, établie par l'adresse IP du serveur de base dans la liste officielle d'AWS. CGU § 13 « Albatros VFR Premium » : 17,99 €, paiement unique, 3 mois (fin 23 h 59 Paris, prolongation depuis la fin en cours), sans renouvellement, Stripe, rétractation 14 jours avec retenue au prorata si l'accès a commencé à la demande (L.221-18, L.221-25), formulaire type ; marqué « pas encore ouverte ». Confidentialité : séances (terrain, avion, user agent…), réglages et vol en cours synchronisés, accès Premium, paiements, Stripe ; la phrase « Écouter un exemple pour choisir une voix locale » retirée (fausse depuis le 30/09). `CGU_VERSION` = '1.0'. **Comptes existants NON réinterrogés** (décision du développeur : personnes connues ; le Premium n'ouvrira qu'après la création de la micro-entreprise). Identité de l'éditeur déclarée chez Cloudflare (confirmé). **Restent ouverts** : médiateur de la consommation et durée de conservation des paiements, à régler avant l'ouverture du Premium | `index.html`, `LEGAL.md`, `assets/inscription.js` |
| 03/10/2026 | **Carte OACI retirée du site** (décision du développeur) : le SCAN OACI n'est pas libre de droits, un site grand public demande une licence spécifique, et l'édition 2026 est produite par le SIA. Tuiles (`assets/oaci/*.webp`, `assets/oaci2/`) et `carte-oaci-hero.webp` supprimées du dépôt, exclues de la publication ; `OACI_PUBLIEE = false` (tuiles-oaci.js) fait prendre à la Navigation et à la Carte leur chemin de repli : fond OpenStreetMap, espaces aériens tracés. Bouton de bascule et réglage « Fond par défaut » cachés ; mentions, confidentialité et pied de page corrigés. Demande de licence au SIA en cours. Retour : LEGAL.md § 2 | `tuiles-oaci.js`, `outils/construire-site.mjs`, `LEGAL.md § 2` |

### En attente de validation


- **RAPPEL — basculer le `www` sur Cloudflare, puis désactiver GitHub Pages** (reporté par le développeur le 03/10/2026). Aujourd'hui `www.albatrosvfr.fr` est un CNAME vers `adrienkl.github.io` : c'est GitHub Pages qui le redirige vers l'apex. L'ORDRE compte (§ 9.1) :
  1. Cloudflare › DNS › `www` : CNAME vers `albatrosvfr.fr`, **Proxied** (nuage orange) ;
  2. Cloudflare › Rules › Redirect Rules : *Hostname equals* `www.albatrosvfr.fr` → *Dynamic* `concat("https://albatrosvfr.fr", http.request.uri.path)`, 301, conserver la query string ;
  3. vérifier : `curl -sI https://www.albatrosvfr.fr/` → 301 vers `https://albatrosvfr.fr/`, `server: cloudflare` ;
  4. **ensuite seulement** : GitHub › Settings › Pages › retirer le *Custom domain*, *Branch* = None ;
  5. dans le dépôt : supprimer `CNAME` et `.nojekyll`, mettre à jour § 9.1 ;
  6. plus tard : `"workers_dev": false` dans `wrangler.jsonc`, puis retirer `radiotrainer.kermeladrien24.workers.dev` de `ORIGINES_PAR_DEFAUT` (`supabase/functions/voix-atc/logique.ts`) et redéployer la fonction.
- **Poser `sql/014` sur la PRODUCTION** — renomme l'exercice « roulage » en « Contact et roulage » (une ligne, idempotent). Par `supabase/poser-sql.sh`. Tant qu'il n'est pas posé, `lancer_tout.sh base` signale un titre divergent.
- **Convention de nommage** (§ 16.2) — proposée, pas appliquée. Aucun renommage de masse avant accord.
- **Poser `sql/000` et `sql/003` sur la PRODUCTION** (§ 21.4) — ils y seraient sans effet, mais recréent des politiques RLS vivantes. Le no-op de `sql/003` est prouvé ; celui de `sql/000` demande d'abord de lister les politiques d'`app_errors` et `admin_audit_log`, jamais vues. Sans urgence.
- **Poser `sql/004` sur la PRODUCTION** — par `supabase/poser-sql.sh` (§ 21.2), jeton créé puis révoqué. Sans risque pour les lignes existantes (`not valid`). Tant qu'il n'est pas posé, la production accepte toujours des erreurs de taille arbitraire.
- **Le volume de dépôts anonymes dans `app_errors`** — `sql/004` borne une ligne, pas leur nombre. Le fermer demande de trancher : dépôt réservé aux comptes connectés (on perd les erreurs d'avant connexion, celles de l'inscription), ou fonction de dépôt limitée en débit. Décision de politique RLS (§ 4, § 8).
- **Les séances détachées** (§ 21.2) — en compter le nombre avant de décider. Si elles sont peu nombreuses, ne rien faire est la bonne réponse.
- **`@electric-sql/pglite` et `pngjs` en dépendances de test** — l'application reste un site statique sans aucune dépendance ; seule la suite de tests en gagne deux. À confirmer.
