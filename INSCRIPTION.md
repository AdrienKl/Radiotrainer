# L'inscription — parcours, réglages, et ce qui reste à faire

Ce fichier documente le parcours de création de compte en cinq étapes. Le schéma
de la base est dans `assets/admin/README.md` § 4 ; la migration qui l'étend est
`sql/001-inscription.sql`.

---

## 1. Ce que vous devez faire, dans cet ordre

Le code est en place. Il ne fonctionnera pas tant que ces trois points ne sont
pas réglés, et **le premier est bloquant** : sans lui, l'étape 2 échoue avec
« La base de données n'est pas à jour ».

### 1.1 Exécuter la migration — obligatoire

> **Fait le 13 septembre 2026.** Vérifié depuis l'extérieur : les quinze colonnes
> répondent, `pseudo_libre()` rend `true`, et `inscription_jalon()` refuse
> correctement avec « aucune session » quand on l'appelle sans être connecté.
> Le garde en base repousse toujours l'auto-promotion en `admin` — c'est le
> point qu'il fallait revérifier, la migration remplaçant `profiles_garde()`.

Supabase → **SQL Editor** → coller `sql/001-inscription.sql` en entier → **Run**.

Le fichier est idempotent : le relancer ne casse rien. Il finit par un `select`
de contrôle, qui doit montrer une ligne par compte avec `parcours_fini` à `true`
et `cgu_acceptees` à `false` pour les comptes antérieurs (ils n'ont jamais rien
accepté — c'est justement ce qui permettra de leur demander leur accord).

> **Ne sautez pas le § 6 du fichier.** C'est lui qui remplit `onboarding_le` des
> comptes existants. Sans ce remplissage, tous les comptes déjà créés — le vôtre
> compris — seraient vus comme des inscriptions inachevées et renvoyés de force
> dans le questionnaire à leur prochaine connexion.
>
> Le code se protège aussi de son côté : `RTInscription.aReprendre()` distingue
> « colonne absente » de « colonne vide », donc déployer le site avant la
> migration ne piège personne. Mais l'inscription, elle, ne marche pas.

### 1.2 Ajouter le code au gabarit d'e-mail — obligatoire

**Où :** colonne de gauche → **Authentication** → **Emails** → onglet
**Magic Link** → champ **Message body**.

Ce n'est pas une ligne à insérer quelque part : c'est **tout le contenu du champ
à remplacer**. Vous devez y trouver, au départ, quelque chose comme :

```html
<h2>Magic Link</h2>
<p>Follow this link to login:</p>
<p><a href="{{ .ConfirmationURL }}">Log In</a></p>
```

Sélectionnez tout (⌘A dans le champ), effacez, et collez le contenu de
**`supabase/gabarit-magic-link.html`**. Puis **Save**.

> Si le champ affiche un rendu au lieu du HTML, cherchez l'onglet ou le bouton
> **Source** / **HTML** au-dessus : le gabarit doit être collé en code, pas en
> texte mis en forme.

> **DEUX GABARITS, PAS UN.** C'est le piège, et il explique « je ne reçois
> toujours aucun code » après avoir corrigé Magic Link.
>
> Une adresse **qui n'a jamais servi** déclenche une *inscription* : Supabase
> envoie alors le gabarit **« Confirm signup »**, pas « Magic Link ». Une
> adresse **déjà connue** reçoit « Magic Link ». Corriger un seul des deux
> laisse donc sans code exactement le cas où l'on en a besoin — le compte neuf.
>
> **Le sujet du message vous dit lequel vous avez reçu :**
>
> | Sujet reçu | Gabarit utilisé |
> |---|---|
> | « Confirm Your Signup » | Confirm signup |
> | « Your Magic Link » | Magic Link |
>
> Mettez le même contenu dans les deux. `supabase/poser-reglages.sh` le fait.

**Ce qui compte, et pourquoi.** Le gabarit d'origine ne contient que
`{{ .ConfirmationURL }}`. Le message part donc **sans le code à six chiffres**
que demande l'étape 2, et cette étape devient infranchissable — c'est le
« message presque vide ». `{{ .Token }}` **est** le code ; il n'apparaît que si
on l'écrit dans le gabarit.

Le lien est gardé en secours : quelqu'un qui clique au lieu de recopier ne doit
pas rester bloqué. Il est en bas du message, en petit ; le code est ce que l'œil
rencontre d'abord.

**Côté client, le même code n'a pas le même *type*.** Une adresse neuve
déclenche une inscription : Supabase range le code dans `confirmation_token` et
l'attend sous le type `signup`. Une adresse déjà connue reçoit un lien magique :
le code va dans `recovery_token`, attendu sous `magiclink`. Le type `email` est
le générique censé couvrir les deux — censé : cela dépend de la version de GoTrue
et de l'état confirmé ou non du compte, et quand il ne couvre pas, le refus est
**indiscernable d'un code faux**. `RTAuth.otpVerifier()` essaie donc les trois.

### 1.2bis — Si l'interface ne montre pas le champ : passer par l'API

Le tableau de bord Supabase renomme et déplace ces réglages souvent ; l'API, non.
`supabase/poser-reglages.sh` pose **les trois d'un coup** — le gabarit, le sujet,
et les adresses de retour du § suivant.

```sh
SUPABASE_ACCESS_TOKEN='sbp_…' sh supabase/poser-reglages.sh
```

Le jeton se crée sur <https://supabase.com/dashboard/account/tokens>. Il donne un
accès complet à vos projets, bien au-delà de ce site : il se passe par
l'environnement le temps d'une commande, **ne touche ni le disque ni le dépôt**,
et se révoque juste après. Le script affiche ce qu'il va écrire et demande
confirmation avant d'envoyer quoi que ce soit.

#### Savoir ce qui est réellement posé — avant de chercher ailleurs

```sh
SUPABASE_ACCESS_TOKEN='sbp_…' sh supabase/poser-reglages.sh --verifier
```

Lecture seule : rien n'est écrit. Le script relit le projet par l'API et dit, pour
chacun des deux gabarits, s'il contient `{{ .Token }}`.

C'est ce qui tranche « je ne reçois toujours pas de code ». Le tableau de bord
montre ce que l'on **croit** avoir enregistré — un champ resté ouvert dans un
autre onglet, un **Save** manqué, un gabarit collé dans le mauvais onglet ne s'y
voient pas. L'API montre ce qui **partira**.

```
Ce que le projet enverra vraiment :
  Confirm signup    79 caracteres, mais AUCUN {{ .Token }} : message sans code.
  Magic Link        porte {{ .Token }} : le code partira. (1814 caracteres)
```

Ci-dessus, le piège exact des deux gabarits : celui qu'un compte neuf reçoit est
le seul qui n'a pas été corrigé.

Un gabarit **vide** n'est pas un gabarit neutre : Supabase retombe alors sur le
sien, d'usine, qui ne porte que `{{ .ConfirmationURL }}`. « Vide » et « sans
code » sont la même panne.

La relecture signale aussi deux réglages qui suppriment l'e-mail au lieu de le
vider — `mailer_autoconfirm` (« Confirm email » désactivé : le compte s'ouvre
sans vérification, donc **aucun** message ne part) et la connexion par e-mail
désactivée. Sans cette mention, on cherche un gabarit fautif alors qu'aucun
message n'a même été envoyé.

### 1.2 bis — Déclarer les adresses de retour — **c'est ce qui rend le lien mort**

Supabase → **Authentication** → **URL Configuration**.

Le lien du message ne pointe pas vers votre site. Il pointe vers Supabase, qui
vérifie le jeton puis **renvoie le navigateur** vers une adresse. Laquelle ?
Celle demandée par le code (`emailRedirectTo`), *à condition qu'elle figure dans
la liste blanche du projet*. Sinon — et c'est silencieux — Supabase retombe sur
le **Site URL**, qui vaut `http://localhost:3000` à la sortie d'usine.

C'est très exactement « un lien qui ne mène à rien » : il mène à un serveur qui
ne tourne pas sur votre machine.

| Champ | Valeur |
|---|---|
| **Site URL** | `https://adrienkl.github.io/Radiotrainer/` |
| **Redirect URLs** | `https://adrienkl.github.io/Radiotrainer/**` |

Les deux astérisques sont un joker : ils couvrent `index.html`, les ancres, et
ce que vous ajouterez demain. Sans eux, seule l'adresse écrite au caractère près
est acceptée.

> **Depuis un fichier ouvert en double-clic, le lien ne pourra jamais aboutir.**
> La page tourne alors en `file://`, et aucun service au monde ne peut y renvoyer
> un navigateur. Le code reste utilisable, et le collage du lien aussi (§ 1.2
> ter). Pour essayer le lien lui-même, il faut passer par le site publié — ou
> `python3 -m http.server` puis déclarer `http://localhost:8000/**` ci-dessus.

### 1.2 quater — Ce que le lien fait une fois qu'il revient

Le lien ne montre **pas** de code dans une page, et il ne doit pas en montrer :
il renvoie le navigateur sur le site avec les jetons dans le *fragment*
d'adresse, `supabase-js` les ramasse, ouvre la session, puis efface le fragment
— un jeton n'a rien à faire dans une barre d'adresse, dans un historique ou
dans une capture d'écran.

Reste la question : où atterrit-on ? Après ce nettoyage, l'adresse ne désigne
plus aucune page, et la route retenue valait « accueil » — c'est-à-dire **la
vitrine**. On déposait donc sur la page de présentation quelqu'un qui venait de
cliquer pour entrer : connecté, mais devant la brochure, sans rien qui signale
que ça avait marché. Corrigé le 13 septembre 2026 : une arrivée par lien est
relevée **avant** le nettoyage (`RTAuth.arriveParLien()`) et mène au tableau de
bord — ou à l'étape d'inscription où l'on s'était arrêté, qui passe avant.

Couvert par `lien_retour.py`.

### 1.2 ter — Ce que le code fait pour vous en attendant

Les deux réglages ci-dessus sont à faire. Mais tant qu'ils ne le sont pas, le
parcours n'est plus bloqué pour autant : **le champ du code accepte aussi le
lien collé**. Le lien porte le même jeton que le code — il suffit de le lire, on
n'est pas obligé de le *suivre*, et c'est le suivre qui échoue.

Copier l'adresse du lien depuis le message, la coller dans « Code reçu »,
valider : la session s'ouvre et l'inscription continue.

Un lien **déjà cliqué** ne marchera pas : le suivre consomme le jeton, même si
la page d'arrivée était morte. Il faut alors demander un nouveau message.

### 1.3 Brancher un vrai expéditeur — bloquant en pratique

Le service d'envoi intégré de Supabase est plafonné à **deux messages par
heure**, toutes adresses confondues. Un parcours dont l'étape 2 est un e-mail
est donc inutilisable en production, et intestable au troisième essai.

Supabase → **Project Settings** → **Authentication** → **SMTP Settings**.
Resend ou Brevo font l'affaire ; comptez dix minutes, dont l'essentiel à
déclarer les enregistrements DNS de votre domaine.

**La clé SMTP se saisit dans l'interface Supabase, jamais dans un fichier du
dépôt.** Tout ce qui est servi au navigateur est public : `assets/` ne contient
et ne doit contenir que l'URL du projet et la clé publiable (`anonKey`), qui
sont publiques par conception.

---

## 2. Le parcours

| Étape | Ce qu'on demande | Ce qui se passe en base |
|---|---|---|
| 1 | Adresse e-mail, acceptation des CGU, déclaration des 15 ans | rien encore — pas de session, donc rien à attribuer |
| 2 | Le code à six chiffres reçu | `verifyOtp` ouvre la session ; `inscription_jalon('consentement')` horodate `cgu_le`, `cgu_version`, `age_15_le` |
| 3 | Mot de passe + confirmation | `updateUser({password})` puis `inscription_jalon('mot-de-passe')` |
| 4 | Le questionnaire (6 questions) | `update profiles` sur `decouverte`, `profil_pilote`, `heures_vol`, `objectifs`, `type_avion`, `niveau_radio` |
| 5 | Nom d'utilisateur, prénom, nom, aérodrome | `update profiles` puis `inscription_jalon('termine')` |

**L'ordre n'est pas décoratif.** On demande l'adresse avant le mot de passe, et
on ne la croit qu'après le code. `signUp(email, password)` de Supabase ne sait
pas faire ça — il exige les deux d'un coup — d'où le passage par
`signInWithOtp` / `verifyOtp` / `updateUser`.

### 2.1 Les parcours abandonnés

Quelqu'un qui ferme l'onglet entre l'étape 2 et l'étape 5 a un compte **réel**
mais inutilisable : sans mot de passe, il ne peut plus se connecter par le
formulaire ordinaire. Deux mécanismes le rattrapent :

- Le routeur consulte `RTInscription.aReprendre()` avant d'ouvrir
  l'application, et le renvoie à l'étape où il s'est arrêté (`routeUtile()`
  dans `index.html`).
- L'écran de connexion offre **« Recevoir un code par e-mail »**
  (`#logCodeDemander`). Sans cette porte, chaque inscription abandonnée
  laisserait un compte mort **et** une adresse définitivement inutilisable,
  puisque déjà prise.

### 2.2 Arriver sur l'inscription avec une session déjà ouverte

Un bandeau le dit, et **rien ne bouge**. Une première version appelait
`rtEntrer()` à cet endroit : cliquer « S'inscrire » depuis l'écran de connexion
ouvrait alors l'application sans qu'on ait rien saisi. La session derrière était
légitime — elle dormait en stockage local — mais du siège de l'utilisateur ça
ressemble exactement à un trou de sécurité, et sur un poste partagé c'était la
session du précédent qui s'ouvrait d'un clic.

**Une navigation que l'utilisateur n'a pas demandée est toujours un bug**, même
quand elle est techniquement justifiée. Le bandeau propose les deux issues
possibles — aller à l'application, ou se déconnecter pour s'inscrire — et
`envoyerCode()` refuse net tant qu'une session est ouverte, pour qu'un bandeau
survolé ne suffise pas à envoyer un code qui remplacerait la session en cours au
milieu du parcours.

Garde-fou : `scratchpad/ins_deja.py`.

---

## 3. Obligatoire ou facultatif : le raisonnement

Le RGPD impose la **minimisation** (art. 5.1.c) : on ne collecte que ce qui est
nécessaire à la finalité. Le test n'est pas « est-ce utile » mais « le service
est-il impossible sans ça ». D'où trois catégories, et pas deux.

**Obligatoire, base légale « exécution du contrat » (art. 6.1.b)**
adresse e-mail, mot de passe, nom d'utilisateur, acceptation des CGU
(qui n'est pas une donnée mais la conclusion du contrat).

**Obligatoire à condition que le produit s'en serve vraiment**
`profil_pilote`, `objectifs`, `type_avion`, `niveau_radio`, `aerodrome`. Ces
réponses règlent le choix des exercices. **Si un jour elles cessent d'être
utilisées, elles doivent redevenir facultatives** : leur base légale tient à
leur usage, pas à leur présence dans le formulaire.

**Ne peut pas être obligatoire**
- `decouverte` (« où nous avez-vous connu ») — marketing pur, base légale =
  consentement, et un consentement contraint n'en est pas un (art. 7.4).
  Elle porte la mention « (facultatif) » et le parcours passe sans elle.
  **Ne la rendez jamais obligatoire.**
- `nom` (nom de famille) — aucune fonction ne s'en sert aujourd'hui. Le jour où
  vous délivrerez des attestations, il deviendra nécessaire ; pas avant.

**Le compromis retenu ailleurs** : chaque question obligatoire propose une issue
neutre (« je préfère ne pas le dire », « je ne sais pas encore »). Personne
n'est contraint de se livrer, et il n'y a pas de colonnes vides.

**Les heures de vol sont une tranche**, jamais le chiffre exact : le chiffre
exact n'apporte rien à l'application, donc le collecter serait de la collecte
inutile. Et la question ne s'affiche qu'aux profils qui volent.

**L'âge : 15 ans.** C'est le seuil français du consentement autonome (art. 8
RGPD, qui laisse choisir entre 13 et 16 ans ; la loi Informatique et Libertés a
retenu 15). En dessous, il faudrait l'accord conjoint d'un représentant légal.
Ce qui est enregistré est une **déclaration** horodatée, pas une vérification :
prétendre vérifier l'âge réel serait un mensonge.

---

## 4. Ce qui est délibérément absent

| Absent | Pourquoi |
|---|---|
| **Vérification anti-robot** | L'emplacement existe (`#insCaptcha`), il est vide, et il le dit. Le jour venu : hCaptcha ou Turnstile via Supabase → Auth → Settings → Bot protection, qui valide le jeton **côté serveur**. Un contrôle écrit dans la page ne protégerait rien — la page appartient au visiteur. |
| **Le texte des CGU** | Les deux pages (`#cgu`, `#confidentialite`) s'annoncent comme des chantiers et décrivent ce qu'elles contiendront. Y écrire du faux juridique serait pire que de n'avoir rien : un texte inventé engage autant qu'un vrai. La version acceptée est enregistrée sous `brouillon-0`, ce qui permettra de retrouver tout le monde à qui redemander son accord : `where cgu_version = 'brouillon-0'`. |
| **La suppression de compte** | Supprimer une ligne de `auth.users` exige la clé secrète, qui ne doit jamais approcher le navigateur. La page Compte explique donc la démarche au lieu d'offrir un bouton qui échouerait. |
| ~~Les réponses modifiables~~ | **Fait.** La page Compte affiche le questionnaire en entier, avec les mêmes questions et les mêmes choix (lus dans `RTInscription.questions()`). Voir § 4.1. |

### 4.1 La rectification, sur la page Compte

Un questionnaire obligatoire dont les réponses ne peuvent plus être corrigées ni
retirées est un piège à sens unique — c'est précisément ce que le RGPD interdit
(art. 16, rectification ; art. 17, effacement). La carte **« Votre profil de
pilote »** affiche donc les six questions, telles quelles.

- Les questions et les choix viennent de `RTInscription.questions()` : la
  **même** définition qu'à la collecte. Proposer ici autre chose rendrait la
  rectification illusoire, et la copie oubliée finirait par écrire une valeur
  que la contrainte `CHECK` refuse.
- **« Aucune réponse » n'est offert que sur les questions facultatives.** C'est
  là que se retire un consentement, et c'est mis là où on le cherche. Vider
  `profil_pilote` ou `niveau_radio` laisserait en revanche l'application sans
  niveau de départ : pour ces réponses-là, l'effacement passe par la fermeture
  du compte, et la carte le dit au lieu d'offrir un bouton qui mentirait.
- La carte **« Identité »** a changé : « Nom affiché » cède la place au prénom,
  au nom de famille, au nom d'utilisateur (en lecture seule) et à l'aérodrome.
  `display_name` est désormais **calculé** à partir du prénom et du nom — laisser
  les deux modifiables créerait deux réponses à « comment s'appelle cette
  personne ».
- Les deux cartes restent **masquées tant que les colonnes n'existent pas**, et
  la page se replie sur son ancien visage. C'est ce qui lui permet de survivre à
  un déploiement antérieur à la migration.

---

## 5. Le contrat en deux endroits

Les listes de réponses vivent dans `assets/inscription.js` (`QUESTIONS`). Les
listes **fermées** ont une contrainte `CHECK` correspondante dans
`sql/001-inscription.sql` § 2 :

| Liste | Contrainte SQL |
|---|---|
| `profil` | `profils_profil_pilote` |
| `heures` | `profils_heures_vol` |
| `radio` | `profils_niveau_radio` |

Ajouter un choix à l'une des trois **sans toucher au SQL** fait échouer
l'enregistrement avec un message incompréhensible. Les listes **ouvertes**
(`decouverte`, `objectifs`, `avion`) n'ont pas de `CHECK`, justement parce
qu'elles finissent par « Autre » suivi d'un champ libre.

La forme du nom d'utilisateur est écrite **trois fois** : `FORME_PSEUDO` en
JavaScript, la contrainte `profils_pseudo_forme`, et la fonction
`pseudo_libre()`. C'est deux de trop, et c'est assumé : sans la première, une
faute de frappe coûte un aller-retour réseau ; sans les deux autres, un client
modifié écrit n'importe quoi.

---

## 6. Où la sécurité se joue

Nulle part dans le navigateur.

- **`pseudo_libre(text)`** — le navigateur ne peut pas interroger `profiles`
  pour savoir si un pseudo est pris : RLS ne lui montre que sa propre ligne, et
  l'ouvrir en lecture livrerait la liste des utilisateurs, e-mails compris. La
  fonction répond oui ou non. C'est un oracle d'existence sur les **pseudos**,
  assumé (tous les sites qui affichent « ce nom est pris » en sont un). Il n'y a
  **aucun** oracle sur les adresses e-mail : aucune fonction n'en prend en
  argument, et « identifiants incorrects » ne dit pas lequel des deux est faux.
- **Le secours par code n'en est pas un non plus, mais il a fallu le corriger.**
  Supabase répond `Signups not allowed for otp` quand on demande un code pour
  une adresse sans compte. Le motif générique des traductions l'attrapait et
  affichait « Les inscriptions sont fermées » — faux, et surtout **différent** du
  message affiché quand le code part vraiment : comparer les deux réponses
  suffisait à savoir quelles adresses ont un compte. Le gestionnaire affiche
  désormais la **même** phrase au conditionnel dans les deux cas, par la même
  fonction (`neutre()`), et ouvre le champ de code dans les deux cas. L'identité
  est donc structurelle, pas seulement observée. Les autres pannes (réseau,
  saturation d'envoi) continuent de se dire : les taire laisserait quelqu'un
  attendre un code qui ne partira jamais. Garde-fou :
  `scratchpad/ins_secours.py`.
- **`inscription_jalon(text, text)`** — les cinq horodatages (`cgu_le`,
  `age_15_le`, `mdp_le`, `onboarding_le`, `cgu_version`) sont des **preuves**.
  Elles sont datées à l'horloge du serveur, et `profiles_garde()` interdit au
  client de les écrire autrement. Un consentement que l'utilisateur peut
  lui-même antidater ne vaut rien devant un contrôle.
- **`profiles_garde()`** — remettait déjà `role`, `status` et `plan` à leur
  ancienne valeur pour les non-administrateurs ; protège désormais les jalons de
  la même façon. La seule ouverture est le paramètre de session `rt.jalon`, que
  seule `inscription_jalon()` sait poser, et seulement pour la durée de sa
  propre transaction.
- **Aucun mot de passe** n'est lu, comparé, stocké ni journalisé, ni dans
  `auth.js`, ni dans `inscription.js`. Les deux champs de l'étape 3 servent à
  détecter une faute de frappe, puis sont vidés — en cas de succès **comme**
  d'échec.
- **`inscription_jalon('termine')` refuse un questionnaire incomplet.** Sans ce
  garde-fou, un client modifié sauterait l'étape 4 et l'application ne la
  redemanderait plus jamais.

---

## 7. Les tests

> **Mise à jour du 18/09/2026.** Cette section décrivait huit suites Python
> (`scratchpad/ins1.py`, `cpt1.py`, `cpt2.py`, `ins_deja.py`, `ins_secours.py`,
> `ins_contraste.py`, `lancer_tout.sh`). Elles vivaient dans `scratchpad/`, qui
> **n'est pas versionné** : elles ne sont plus sur le disque, et rien dans
> l'historique Git ne permet de les retrouver. Elles sont perdues.
>
> C'est précisément pour que cela ne se reproduise pas que la nouvelle suite est
> **dans le dépôt**, sous `tests/`.

### Ce qui existe aujourd'hui

```sh
npm install && npx playwright install chromium   # une seule fois
sh tests/lancer_tout.sh
```

Deux étages, détaillés dans `tests/README.md` :

- **`tests/contrat/`** — lecture du code, aucune dépendance, moins d'une
  seconde. Surveille les symboles partagés entre blocs, l'ordre de chargement,
  les clés de stockage, les routes, le catalogue de phraséologie et sa parité
  avec la table `exercises`, et l'absence de secret dans les fichiers servis.
- **`tests/parcours/`** — le site dans un vrai navigateur (Playwright). Couvre
  le démarrage sans erreur de console, les seize routes, un scénario joué
  jusqu'au récapitulatif, un vol complet, l'épellation, et ce qui doit survivre
  à un rechargement.

### Ce que la nouvelle suite ne couvre pas

Les tests de parcours **coupent toute requête vers Supabase**. Le projet visé
par `assets/supabase-config.js` est le projet réel : une suite de tests n'a pas
à y écrire. En conséquence, **le parcours d'inscription lui-même n'est pas
retesté automatiquement** — ni les verrous de l'étape 1, ni le questionnaire, ni
le secours par code, ni les jalons de consentement.

C'est une perte réelle par rapport aux anciennes suites, et elle est assumée
pour l'instant : la priorité était de protéger le découpage du monolithe. La
manière propre de la combler est un **compte de test dédié** sur un projet
Supabase séparé — pas sur le projet de production.

En attendant, ces sept points se vérifient **à la main**, et doivent l'être
avant toute mise en ligne :

1. les verrous de l'étape 1 (adresse, mot de passe, CGU, âge) ;
2. le questionnaire : questions obligatoires contre la seule question
   facultative, champ libre d'« Autre », question conditionnelle des heures de
   vol ;
3. la résolution de l'aérodrome par code **ou** par nom ;
4. le bandeau « déjà connecté » ;
5. le secours par code, qui doit répondre la même chose que l'adresse ait un
   compte ou non ;
6. que `profiles_garde()` repousse bien une tentative de promotion ;
7. **l'aller-retour réel de l'e-mail** — personne ici ne peut lire votre boîte.
   Après les trois réglages du § 1, faites **une** inscription complète de bout
   en bout, avec une adresse à vous. C'est, comme avant, la vérification que
   rien ne remplacera.

Le contrôle de contraste (90 relevés sur les pixels réels, dans les deux
thèmes) reste lui aussi à refaire — voir le § 8, qui décrit ce qu'il avait
trouvé et qui n'a pas été corrigé.

---

## 8. Un défaut de contraste plus large — audité le 20/09/2026

En mesurant le contraste du parcours sur les pixels réels (et non sur les
valeurs CSS, qui mentent : à petite taille l'antialiasing n'atteint jamais la
couleur pleine), deux textes **antérieurs** à ce travail sont sortis sous le
seuil AA en mode clair :

| Élément | Taille | Mesuré | Seuil |
|---|---|---|---|
| `.auth-sub` (sous-titre des cartes de connexion et d'inscription) | 13,5 px | **4,07:1** | 4,5:1 |
| `.auth-field label` (étiquette de champ, chasse fixe) | 11 px | **2,97:1** | 4,5:1 |

La cause commune est `--ink-2` (`#6b7280`) : **4,83:1 en théorie sur le blanc,
mais 4,07:1 mesuré** dès qu'on descend sous ~15 px.

Ce qui a été fait : un jeton `--ink-2-fort` (`#464d5a`, ~7:1 mesuré), appliqué
aux cartes d'authentification, au parcours et aux deux pages légales. Tout y
passe désormais, dans les deux thèmes — `scratchpad/ins_contraste.py` le
vérifiait sur 90 relevés. **Ce fichier a été perdu** : `scratchpad/` n'est pas
versionné.

### 8 bis. L'audit annoncé, fait le 20/09/2026

`tests/parcours/contraste.spec.js` remplace l'outil perdu, **dans le dépôt**
cette fois, et tourne à chaque exécution de la suite : quatorze pages, deux
thèmes, **~1 350 relevés** contre 90.

Il a trouvé cinq endroits sous le seuil, et cinq seulement :

| Élément | Thème | Mesuré | Cause | Corrigé en |
|---|---|---|---|---|
| `.scene-credit` / `.spell-credit` (crédits photo, 11 px) | clair | 3,48:1 | `--sc-credit` réglé pour du verre sur photo, employé sur le fond plat | `rgba(20,26,44,.70)` → 6,20:1 |
| idem | sombre | 4,11:1 | idem | `rgba(255,255,255,.58)` → 6,70:1 |
| `.rx__head` (accueil, 11,5 px) | clair | 4,35:1 | `--ink-2` sur `--surface-2` | `--ink-2-fort` → 7,66:1 |
| `.nav-tgl` (Navigation et Carte, 12 px) | clair | 4,35:1 | idem | `--ink-2-fort` → 7,66:1 |
| `.seg3-opt` (Paramètres, 12,5 px) | clair | 4,35:1 | idem | `--ink-2-fort` → 7,66:1 |

Un sixième relevé, le bouton de dézoom **désactivé** de Leaflet (1,75:1), est
exempté : WCAG 2.1 critère 1.4.3 ne demande aucun contraste à un composant
inactif.

**Ce que l'audit change à la décision ci-dessous.** Le § 8 disait qu'il faudrait
« basculer `--ink-2` partout », et que c'était un audit, pas une retouche. La
mesure répond : **hors de ces trois règles, plus rien n'est sous le seuil.** La
bascule globale de `--ink-2` n'est donc plus nécessaire pour être conforme.

Elle resterait souhaitable pour une raison que ce test ne peut pas voir : il lit
les couleurs **résolues**, pas les pixels, et le § 8 a justement démontré que
les deux divergent à petite taille (4,83:1 théorique contre 4,07:1 mesuré). Tout
ce qui passe ici entre 4,5:1 et ~5,5:1 sur du texte de moins de 15 px est donc
**suspect sans être prouvé**. Trancher demande de remesurer sur les pixels —
c'est le seul morceau de l'ancien `ins_contraste.py` qui n'a pas été repris.

**La décision reste ouverte, et elle est au développeur.**

**Ce qui n'a pas été fait, et qu'il faudra décider** (état d'origine, conservé
pour la lecture — voir le § 8 bis ci-dessus pour ce que l'audit y a répondu) :
`--ink-2` est employé
dans tout le site (tableau de bord, cours, progression, paramètres, console
d'administration). Partout où il porte du texte sous ~15 px, le même défaut est
là. Le corriger revient à basculer `--ink-2` en clair vers une valeur plus
sombre, ce qui touche **toutes** les pages : c'est un audit, pas une retouche au
passage, et ce n'est pas à faire en même temps qu'une inscription.

Le mode sombre n'est pas concerné : `--ink-2` y est clair sur fond foncé et
mesure 5,56:1 au minimum. `--ink-2-fort` y reprend simplement `--ink-2` — mais
il doit malgré tout être **redéfini** dans le thème sombre, sinon il garderait
la valeur claire, soit un gris foncé sur un fond presque noir.
