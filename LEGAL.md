# Mentions légales, CGU, confidentialité

Trois pages : `#mentions`, `#cgu`, `#confidentialite`. Elles vivent dans
`index.html`, avec le reste — pas de fichier séparé, pas de fetch : le site doit
continuer de fonctionner depuis `file://`.

## 1. Ce que vous devez remplir, et pourquoi ça bloque

Les textes sont écrits et vous engagent. **Neuf champs restent vides**, et ils
apparaissent en ambre pointillé sur la page : rien ne doit avoir l'air conforme
tant que ça ne l'est pas.

| Où | Champ | Pourquoi il est obligatoire |
|---|---|---|
| Mentions § 1 | Nom ou dénomination | LCEN art. 6-III : identifier l'éditeur |
| Mentions § 1 | Statut (particulier / auto-entrepreneur / société) | Détermine les champs suivants |
| Mentions § 1 | Adresse | idem |
| Mentions § 1 | Adresse de contact | Recevoir les demandes RGPD et les signalements |
| Mentions § 1 | Directeur de la publication | LCEN art. 6-III-1 |
| Mentions § 1 | Forme, capital, RCS, TVA | **Seulement si société** |
| Mentions § 2 | Région d'hébergement Supabase | Dit si les données quittent l'UE |
| Confidentialité § 1 | Responsable du traitement | RGPD art. 13.1.a — reprend le § 1 des mentions |
| Confidentialité § 6 | Région (rappel) | idem |

**Particulier ou professionnel, ça change les obligations.** Un éditeur *non
professionnel* peut, au titre de l'article 6-III-2 de la LCEN, ne pas publier son
nom et son adresse — à condition de les avoir communiqués à son hébergeur et de
publier l'identité de celui-ci (déjà fait, § 2 des mentions). Un éditeur
*professionnel*, ou dès qu'une formule payante existe, doit tout publier. Le
texte dit les deux cas ; à vous de trancher.

**La région Supabase** se lit dans Project Settings → General → Region. Je ne
l'ai pas devinée : l'en-tête `cf-ray` que renvoie l'API indique le point d'entrée
Cloudflare le plus proche de *qui interroge*, pas où vivent les données.

Une fois les neuf champs remplis, passez `CGU_VERSION` de `'brouillon-1'` à
`'1.0'` dans `assets/inscription.js` : chaque compte se verra redemander son
accord sur le texte définitif.

> **Les deux renommages (AVIERO le 20/09/2026, Albatros VFR le 21/09/2026) n'ont PAS fait bouger `CGU_VERSION`**, et
> c'est volontaire. Le service change de nom, pas de nature : ni l'objet, ni
> l'éditeur, ni les obligations, ni les données traitées. Surtout, le texte est
> encore en `brouillon-1` — aucun consentement définitif n'a été recueilli, et
> le passage à `1.0` ci-dessus redemandera de toute façon l'accord de tous.
> Bumper la version pour un changement de nom aurait fait redemander leur
> consentement à des comptes pour rien, ce que l'article 7 du RGPD n'apprécie
> pas plus que l'inverse. **Si le passage à `1.0` devait être abandonné**, il
> faudrait rouvrir la question.

## 2. Le point qui ne se règle pas en écrivant du texte

`assets/oaci/` et `assets/oaci2/` contiennent **116 Mo de tuiles de la carte
OACI-VFR 1:500 000** (SIA / DGAC, édition 2026), servies depuis le site.

Consulter une carte est une chose ; en **rediffuser les images depuis son propre
serveur** en est une autre, et cela relève du droit du producteur de bases de
données et du droit d'auteur. Rien dans ce dépôt ne dit sous quel titre ces
tuiles s'y trouvent. À vérifier auprès du SIA et de l'IGN **avant toute ouverture
au public** — c'est le seul risque juridique de ce dossier que je ne peux pas
lever depuis le code.

Les autres sources sont claires : OurAirports (domaine public), espaces aériens
SIA/DGAC via data.gouv.fr (Licence Ouverte 2.0), OpenStreetMap (ODbL), Leaflet
(BSD-2), photographies créditées en pied de page.

## 2 bis. Les photographies — deux questions distinctes de la licence

Les photos viennent d'Unsplash, de Pixabay et de Pexels. Les trois licences
autorisent l'usage commercial sans obligation d'attribution, et c'est réglé.
Deux points ne le sont pas, parce qu'une licence de photo n'a jamais pu les
régler :

**Des personnes identifiables.** Le DR400 (F-GUXQ) est photographié avec deux
occupants visibles à travers la verrière, et le Piper Cub avec son pilote. En
droit français, le droit à l'image appartient à la personne, pas au
photographe : la licence Pixabay ne vaut pas autorisation de ces personnes-là.
À la taille où les vignettes s'affichent — 465 px de large, un visage y fait une
quinzaine de pixels — le risque est très faible. Il n'est pas nul si quelqu'un
ouvre le fichier de 760 px. Deux sorties possibles : garder ainsi, ou flouter.
La question est posée, elle n'est pas tranchée.

**Une marque commerciale.** La photo `a320-air-france.webp` montre un appareil
en livrée Air France, avec le nom et le logo. Illustrer n'est pas s'autoriser
d'une marque, mais sur un site d'entraînement à la phraséologie — surtout si une
formule payante existe un jour — l'image peut se lire comme un lien qui
n'existe pas. C'est le point à surveiller en priorité depuis qu'elle ne défile
plus parmi neuf autres : elle est désormais **l'image fixe du tableau de bord**,
la première chose que voit un abonné à chaque connexion. Pour la retirer :
la balise `.tb-avion` d'`index.html`, et la ligne correspondante
d'`assets/avions.js` si vous la voulez hors de l'application aussi.

**Le dessin de l'avion sur la carte** (`assets/images/avion-carte.png`, depuis le
01/10/2026) : un Cessna vu de dessus, **fourni par le développeur, qui en est
l'auteur**. Aucune licence tierce, aucune attribution due.

**La photo du hero de l'accueil** (`assets/images/cockpit-finale*.webp`, depuis le
01/10/2026) : un cockpit en courte finale, d'Oskar Kadaksoo, licence Unsplash
(usage commercial, sans attribution obligatoire — créditée quand même en pied de
page). Les deux pilotes sont de dos, casque sur la tête : aucun visage n'est
visible. Elle remplace la tour découpée (rawpixel, CC0) et la carte OACI.

**Le ciel du tableau de bord en thème clair** (`assets/images/tableau-ciel-jour*.webp`,
depuis le 01/10/2026) : Sam Schooler, licence Unsplash. Aucune personne, aucune
marque. Il remplace le hall d'embarquement (`tableau-hall-jour`), retiré.

## 2 ter. La police du site (30/09/2026)

**Atkinson Hyperlegible Next** (Braille Institute), sous **SIL Open Font License 1.1**.
La licence permet d'utiliser, d'intégrer et de redistribuer la police gratuitement,
à condition de joindre le texte de la licence : il est dans `assets/polices/OFL.txt`,
publié avec les fichiers. Aucune mention n'est exigée sur les pages.

Elle est **hébergée sur le site** et non chargée depuis Google Fonts : sinon, chaque
visite enverrait l'adresse IP du visiteur à Google, et la politique de confidentialité
devrait le dire (§ 15 de CLAUDE.md). Si un jour elle est chargée depuis un service
tiers, la politique de confidentialité change dans le même travail.

## 3. Ce que la politique de confidentialité dit, et qui n'allait pas de soi

**Le microphone part chez Google.** La reconnaissance vocale n'est pas faite par
ce site : c'est l'API du navigateur. Sur Chrome et Edge, le son capté est envoyé
aux serveurs de Google pour transcription. Ce n'est pas un choix de conception —
il n'existe pas d'autre voie dans un navigateur — mais c'est un transfert de
données vocales, et il devait être écrit. En revanche, l'enregistrement de
réécoute de l'épellation, lui, reste en mémoire sur l'appareil et disparaît en
fermant la page : vérifié dans le code (`startRecorder`, blob révoqué).

**Pas de bandeau cookies, et ce n'est pas un oubli.** Rien n'est déposé pour la
publicité ni pour la mesure d'audience. Le stockage local sert aux réglages et au
jeton de session ; le seul cookie tiers est `__cf_bm`, posé par Cloudflare pour
le compte de Supabase à des fins anti-robot. Tout cela relève des traceurs
strictement nécessaires, dispensés de consentement par l'article 82 de la loi
Informatique et Libertés. Le § 7 les énumère un par un.

**Le nom de famille est collecté et ne sert à rien.** C'est contraire au principe
de minimisation (RGPD art. 5.1.c). Deux issues : lui donner un usage, ou cesser
de le demander. La politique le dit franchement plutôt que de le cacher, mais
c'est une dette, pas une solution.

**Formspree est un sous-traitant, nommé comme tel (22/09/2026).** Le formulaire
« Contact / Feedback » envoie à Formspree, Inc. l'adresse e-mail saisie, le texte
écrit, et un contexte technique (page ou scénario en cours, taille de fenêtre,
thème, navigateur). Trois choses en découlent, et elles sont faites :

- le **§ 2** de la politique liste la donnée, sa finalité et sa conservation ;
- le **§ 4** nomme le tiers et dit ce qu'il voit — « **seulement** si vous nous
  écrivez », parce que rien ne part tant qu'on n'appuie pas sur « Envoyer » ;
- le **pied de page** ajoute le message à sa liste de ce qui sort de la machine.
  Il disait « trois choses » et les énumérait : laisser la phrase telle quelle
  l'aurait rendue fausse, et le § 15 de `CLAUDE.md` en fait une règle dure.

La modale elle-même nomme Formspree au-dessus du bouton d'envoi et renvoie à la
politique : c'est le seul endroit où l'information arrive au moment où elle sert.
Le contexte technique joint y est **affiché**, jamais caché.

Reste à faire le jour du domaine : Formspree, Inc. est une société américaine.
L'encadrement du transfert (clauses contractuelles types, ou adhésion au
Data Privacy Framework) est à vérifier et à citer, comme pour Supabase.

**Google Cloud Text-to-Speech est un sous-traitant, nommé comme tel (27/09/2026).**
Pour les comptes Premium qui choisissent la voix Google, la fonction Edge
`voix-atc` envoie à Google le texte que prononce le contrôleur, et la voix
choisie. Ce texte peut contenir l'indicatif de l'élève, l'aérodrome, la piste :
la politique le dit en toutes lettres, parce que c'est ce qu'un élève ne
devinerait pas. Ce qui est fait :

- le **§ 2** liste la seule donnée conservée — la consommation par jour et par
  voix (caractères, requêtes, modèle), **jamais le texte** (`sql/006` n'a pas de
  colonne pour le recevoir, et `tests/verifier-migrations.mjs` le vérifie) ;
- le **§ 4** nomme Google LLC (Cloud Text-to-Speech), distinct de la
  reconnaissance vocale de Chrome, et dit que l'envoi part du SERVEUR : Google
  ne reçoit ni l'adresse e-mail ni l'adresse IP de l'élève ;
- le **§ 5** l'explique à côté de la voix du navigateur, et dit comment
  l'arrêter (revenir à la voix du navigateur) ;
- le **pied de page** l'ajoute à ce qui sort de la machine.

**Phase de lancement (29/09/2026) : la voix Google devient le moteur PAR
DÉFAUT**, pour tous les comptes connectés, sur leurs 3 premiers vols et 5
premiers scénarios du jour (`assets/modules/lancement.js`, borné en base par
`sql/009`). Ce n'est plus un choix actif de l'élève : les quatre passages
ci-dessus disent désormais « par défaut », et le moyen de l'arrêter
(Paramètres › Voix et micro › « Navigateur »), qui reste respecté partout. La
base juridique ne change pas — c'est le service lui-même qui parle — mais la
phrase « si vous la choisissez » serait devenue fausse (CLAUDE.md § 15).

Pas de nouveau consentement : c'est une modification de la politique de
confidentialité, pas des CGU (`CGU_VERSION` inchangée), et l'envoi n'a lieu que
sur un choix explicite de l'élève dans les Paramètres. Reste à faire le jour du
domaine, comme pour Formspree : citer l'encadrement du transfert vers Google
(clauses contractuelles types / Data Privacy Framework).

**Les durées de conservation** sont des propositions défendables, pas des
obligations légales chiffrées : 30 jours après fermeture (le temps des
sauvegardes), 12 mois pour les erreurs techniques, 5 ans pour la preuve du
consentement (prescription de droit commun, art. 2224 du code civil). Vous pouvez
les raccourcir ; les allonger demanderait une justification.

## 4. Ce qui est vérifié automatiquement

`scratchpad/legal.py` — les trois pages répondent, se renvoient l'une à l'autre,
le pied de page y mène ; **aucune adresse postale ni aucun SIRET n'a été
inventé** (vérifié par expression régulière, c'est le garde-fou qui compte le
plus) ; les champs vides sont visibles et se distinguent du texte courant ;
l'avertissement opérationnel des CGU et l'avertissement micro de la
confidentialité sont présents ; les tableaux défilent dans leur conteneur sans
faire déborder la page à 1440, 760 et 390 px ; le contraste tient dans les deux
thèmes, mesuré sur les pixels réels.

`ins1.py` § 6 vérifie qu'**une page juridique ne se dit jamais complète quand
elle ne l'est pas**. Formulé ainsi, ce garde-fou survivra au jour où vous
remplirez les champs : il cessera simplement d'exiger le bandeau d'état.

## 5. Ce qui reste à faire plus tard

- Désigner un médiateur de la consommation **si** une formule payante apparaît
  (art. L.612-1 du code de la consommation). Le § 12 des CGU le signale.
- Registre des traitements (RGPD art. 30) : non obligatoire ici en dessous de
  250 personnes et hors données sensibles, mais il tiendrait en une page et
  rendrait service.
- Le jour où une colonne est ajoutée à `profiles`, elle doit figurer au § 2 de la
  confidentialité **avant** d'être collectée, pas après.


## Suppression de compte et adresse bloquée (30/09/2026)

L'administrateur peut supprimer un compte (effacement complet, `sql/012`), et
choisir d'empêcher l'adresse de recréer un compte. Encadrement :

- **CGU § 10** prévoyait déjà la fermeture à l'initiative de l'éditeur pour
  manquement au § 5, avec avertissement préalable sauf urgence. Il dit
  désormais que l'adresse peut être bloquée **3 ans**. `CGU_VERSION` n'a pas
  bougé : le texte est encore `brouillon-1`, à revoir en bloc avant la mise en
  ligne publique (CLAUDE.md § 15) — cette phrase devra alors compter comme une
  modification de fond (§ 11 des CGU).
- **Politique de confidentialité** : ligne « Adresse bloquée » — empreinte de
  l'adresse (pas l'adresse), pseudo, date ; intérêt légitime ; 3 ans puis
  effacement automatique. Ligne « Consommation de la voix » : à la fermeture,
  totaux gardés sans aucun lien avec la personne.
- Le site répond à une adresse bloquée « Une erreur est survenue. Réessayez plus
  tard. » (choix du développeur). **Cela ne vaut que pour le site** : une
  demande d'accès RGPD (art. 15) d'une personne bloquée appelle une réponse
  exacte, blocage compris.
- Le journal d'audit ne garde ni l'adresse ni le pseudo du compte supprimé.


## Avis des élèves (29/09/2026)

Obligations suivies (Code de la consommation, art. L111-7-2 et D111-16 à
D111-19) : la page `#avis` dit comment les avis sont collectés (compte inscrit et
connecté, un par compte — le seuil de 2 séances a été retiré par `sql/011`), qu'ils sont **vérifiés à la main avant
publication**, le **délai (3 jours au plus)**, les motifs de refus, l'absence de
contrepartie, l'ordre d'affichage (date, ou note au choix) et que les trois avis
de l'accueil sont choisis par l'équipe. Chaque avis affiche sa date. Un avis
refusé : l'auteur en voit le motif (`mon_avis()`, sql/010).

Données : pseudo figé à l'envoi, note, commentaire, date ; base
**consentement** (rien ne part sans « Envoyer mon avis ») ; retrait sur demande
par le bouton Contact — l'auteur ne peut pas le modifier lui-même, et la
politique le dit. Ligne ajoutée au § 2 de la politique de confidentialité.

À ne jamais faire : publier un avis inventé, ou n'importer que les bons (la
sélection de l'accueil est annoncée comme telle) — pratique commerciale
trompeuse.
