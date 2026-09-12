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

Supabase → **Authentication** → **Emails** → gabarit **Magic Link**.

Par défaut, ce gabarit ne contient que `{{ .ConfirmationURL }}` : le message
part **sans le code à six chiffres**, et l'étape 2 devient infranchissable
autrement qu'en cliquant le lien. Ajoutez le code dans le corps du message :

```html
<h2>Votre code RadioTrainer</h2>
<p>Saisissez ce code dans la page d'inscription :</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Il est valable une heure. Si vous n'avez pas demandé ce code, ignorez ce message.</p>
<p style="color:#666;font-size:13px">Vous pouvez aussi
   <a href="{{ .ConfirmationURL }}">cliquer ici</a>.</p>
```

Gardez le lien en secours : quelqu'un qui clique au lieu de recopier ne doit pas
rester bloqué. Le parcours accepte les deux (`detectSessionInUrl` est actif).

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

`scratchpad/ins1.py` — tout ce qui se teste sans écrire en base : verrous de
l'étape 1, peinture du questionnaire depuis sa définition, question
conditionnelle des heures de vol, questions obligatoires contre question
facultative, champ libre d'« Autre », forme du nom d'utilisateur, résolution de
l'aérodrome par code **ou** par nom, pages légales, secours par code.

`scratchpad/cpt2.py` — la page Compte : le repli sur l'ancien visage avant la
migration, et après elle les six questions, l'option « aucune réponse » présente
sur la seule question facultative et absente des autres, et l'identité des
listes avec celles de l'inscription.

Les deux suites détectent elles-mêmes si la migration est passée et le disent.
`cpt2.py` a deux moitiés : **relancez-la après la migration**, c'est la seconde
qui vérifie le questionnaire. De même, `cpt1.py` § 4 confirme que
`profiles_garde()` repousse une tentative de promotion — la migration
**remplace** cette fonction, donc c'est le contrôle à refaire en premier.

**Ce qui n'est pas testé automatiquement, et ne peut pas l'être** : l'aller-
retour réel de l'e-mail. Personne ici ne peut lire votre boîte. Après les trois
réglages du § 1, faites **une** inscription complète à la main, de bout en bout,
avec une adresse à vous. C'est la seule vérification qui manque.
