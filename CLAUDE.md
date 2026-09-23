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

### 9.1 Le domaine n'est pas encore acheté — ne touche pas à la production

**Décision du 18/09/2026.** Le domaine définitif d'Albatros VFR est prévu mais pas acquis. **Ne modifie aucune configuration de production liée au domaine** (Site URL Supabase, liste blanche de redirection, `supabase/poser-reglages.sh`, `CNAME`, nom du dépôt GitHub).

Resend exige un domaine vérifié : le chantier e-mail est donc **bloqué en amont** par cette décision, et c'est normal.

Quand le domaine sera choisi, l'ordre des opérations compte — une erreur de séquence casse l'inscription **en silence**, sans message d'erreur :

1. domaine acheté, DNS posé ;
2. `CNAME` + GitHub Pages ;
3. **Site URL et liste blanche de redirection Supabase** ← l'oubli classique ;
4. Resend (vérification du domaine, expéditeur) ;
5. gabarits d'e-mail et sujets ;
6. mentions légales (éditeur, hébergeur) ;
7. **vérification manuelle d'une inscription réelle de bout en bout, avant de basculer le DNS.**

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
- **Le logo reste l'icône actuelle** : § 10 interdit une refonte graphique spontanée, et il n'existe pas d'autre marque dessinée. Seul le mot a changé.
- **Conservé tel quel** : la charte actuelle — violet `#5b4bce`, bandeau noir, jetons de couleur, typographie, mise en page.
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
- Renommer le dépôt `Radiotrainer` change l'URL de GitHub Pages, donc casse la liste blanche de redirection Supabase (§ 9.1). À ne pas faire isolément.

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

Une entrée dans le menu (« Contact / Feedback », sans `data-page`) et une dans le
pied de page (accessible **sans compte** — le signalement le plus utile est
souvent « l'inscription ne marche pas »). Les deux ouvrent la même modale.

`assets/modules/contact.js` + `assets/css/15-contact.css`. Le module n'emprunte
**aucun** symbole au moteur ni aux autres modules : il ne lit que le DOM,
`location.hash` et `window.RTAuth` s'il existe, toujours derrière un test. Sa
place dans la liste des `<script>` est donc libre — ce qui n'est le cas d'aucun
de ses voisins.

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

### En attente de validation

- **Convention de nommage** (§ 16.2) — proposée, pas appliquée. Aucun renommage de masse avant accord.
- **Poser `sql/000` et `sql/003` sur la PRODUCTION** (§ 21.4) — ils y seraient sans effet, mais recréent des politiques RLS vivantes. Le no-op de `sql/003` est prouvé ; celui de `sql/000` demande d'abord de lister les politiques d'`app_errors` et `admin_audit_log`, jamais vues. Sans urgence.
- **Les séances détachées** (§ 21.2) — en compter le nombre avant de décider. Si elles sont peu nombreuses, ne rien faire est la bonne réponse.
- **`@electric-sql/pglite` et `pngjs` en dépendances de test** — l'application reste un site statique sans aucune dépendance ; seule la suite de tests en gagne deux. À confirmer.
