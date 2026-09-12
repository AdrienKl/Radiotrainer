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
