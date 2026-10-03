# Référence phraséologie — extraite du Manuel officiel DSNA

> **Source unique** : *Manuel de phraséologie à l'usage de la circulation aérienne générale*,
> DSNA, 10ᵉ édition, à jour au 15 avril 2023 (`Manuel_Phraseologie.pdf`, 281 pages).
> Les numéros de page ci-dessous sont les **pages imprimées** du manuel
> (page PDF = page imprimée + 18).
> **Rien ne doit être inventé** : toute phrase du simulateur doit provenir de ce document.
> Ce fichier remplace `brief-radiotrainer.md` comme source de vérité.

---

## 0. Fondamentaux (Chapitre 1, sections D–H)

### Énonciation des sigles (p. 11-12)
- **AFIS** → « A-FIS » · **QNH** → « Q-N-H » · **QFU** → « Q-F-U / Piste en service »
- **TWR** → « Tour » · **APP** → « Approche » · **VFR** → « V-F-R »
- **VOR** → « VOR / V-O-R » · **NM** → « Nautiques » · **CAVOK** → « CAV-O-Kay »

### Transmission des nombres — langue française (p. 17)
- Un nombre peut être transmis **comme dans la vie courante** OU **chiffre par chiffre**.
  En cas de mauvaise réception → chiffre par chiffre.
- **Fréquences** : « décimale » obligatoire. Ex. 120,775 → « cent vingt **décimale** sept
  cent soixante-quinze ».
- **CAP** : toujours **3 chiffres**. Ex. cap 060 → « cap zéro six zéro » ou « cap zéro soixante ».
- **Altitude** : ajouter le mot « altitude » en cas d'ambiguïté (« Descendez altitude 2000 pieds »).
- **QNH** : ex. « Q-N-H 1020 » ; QNH 1000 → « Q-N-H un thousand » (anglais) / « mille » (fr).

### Transmission des indicatifs (p. 18)
- Indicatif **complet** au premier contact (ex. `F-BGBX`), forme **abrégée** ensuite et
  **seulement à l'initiative du contrôleur** (ex. `F-BX` = 1er caractère + 2 derniers).
- Le **type/constructeur** peut préfixer (ex. « CESSNA FABCD », « CITATION FABCD »).

### Expressions conventionnelles (p. 19-21) — vocabulaire imposé
COLLATIONNEZ (read back), AUTORISÉ (cleared), APPROUVÉ (approved), MAINTENEZ (maintain),
RAPPELEZ / INDIQUEZ (report), CONTACTEZ (contact), VEILLEZ (monitor), AFFIRME, NÉGATIF,
CORRECT, ROGER, WILCO, STANDBY/ATTENDEZ, IMPOSSIBLE (unable), IGNOREZ (disregard).
> ⚠ ROGER ne s'emploie **jamais** pour répondre à une question qui appelle un
> collationnement ou un AFFIRME/NÉGATIF.

---

## 1. Mise en route + roulage — Chapitre 3, A. PRÉVOL / B. CIRCULATION AU SOL (p. 38-45)

### Mise en route (p. 39) — IFR, PAS utilisée par le simulateur
- Pilote : **« Demande mise en route. »**
- ATC : **« Mise en route approuvée[, C-TOT ….] »** / « Prévoyez mise en route à …. »
- Collationnement : « Roger, mise en route approuvée, …, <indicatif>. »
> ⚠ Rangée sous « Mise en route – clairance initiale – **SID** » ; les deux exemples
> (p. 39-40) sont des vols IFR (Rapidair, C-TOT, SID, niveau). L'exemple VFR de la
> p. 45 n'en a pas : contact, puis demande de roulage. **Décision du 03/10/2026** :
> le simulateur (Scénarios et Navigation) ne fait plus demander de mise en route.

### Roulage — exemple **VFR** officiel (Chavenay, p. 45, « Cas d'un vol VFR ») — le modèle du simulateur
```
Pilote : Chavenay tour, F-BX, bonjour.
ATC    : F-BX, Chavenay tour, bonjour.
Pilote : F-BGBX, TB10, parking club, demande consignes de roulage pour vol
         à destination de Guéret, information B.
ATC    : F-BGBX, roulez et entrez aire d'attente 24 et rappelez prêt.
Pilote : Je roule et entre dans l'aire d'attente 24 et rappelle prêt, F-BX.
```
### Autres formes de roulage officielles (p. 44)
- ATC : « Roulez point d'attente piste 27. » → Pilote : « Je roule point d'attente piste 27. »
- ATC : « Remontez piste 27. » → « Je remonte piste 27. »
- ATC : « Roulez via A3 / via piste 29. » → « Je roule via A3 / via piste 29. »

### Maintien de position (p. 46) — le mot « piste » réservé décollage/atterrissage/traversée
- ATC : « Maintenez position. » → « Je maintiens position. »
- ATC : « Maintenez avant point d'attente C1. » → « Je maintiens avant point d'attente C1. »

---

## 2. Alignement + décollage — Chapitre 3, C. ALIGNEMENT-DÉCOLLAGE (p. 50-63)

### Préparatifs (p. 50, p. 60)
- ATC : « Rappelez prêt au départ. » / « Êtes-vous prêt pour un départ immédiat ? »
- Pilote : « Affirme, <indicatif>. » / « Négatif, <indicatif>. » (p. 50, p. 60)
> ⚠ **« Prêt au départ, <indicatif> » N'EST PAS dans le manuel** (ce fichier
> l'attribuait à tort à la p. 50). Aucune page ne donne la réponse du pilote au
> point d'attente. Le simulateur l'emploie par **déduction validée par le
> développeur le 03/10/2026** : à chaque « rappelez prêt à … », le manuel fait
> répondre « Prêt à …, indicatif » (p. 77, 83, 222), et « prêt au départ » est
> dans la bouche d'un pilote p. 42 (au poste, IFR).
> Départ immédiat (p. 60) : « alignez-vous piste 05 gauche, autorisé décollage
> immédiat, vent … » → « Je m'aligne piste 05 gauche et je décolle, <indicatif> ».

### Alignement (p. 53)
- ATC : « Alignez-vous et attendez piste 33 droite. »
- Pilote : **« Je m'aligne et j'attends piste 33 droite. »**

### Autorisation de décollage (p. 59) — ⚠ CORRECTION MAJEURE
- ATC : **« Piste 27, autorisé décollage, vent 280 degrés 10 nœuds. »**
  (ou « Alignez-vous piste 27, autorisé décollage, vent … »)
- Collationnement pilote : **« Piste 27, je décolle, <indicatif>. »**
  (ou « Je m'aligne piste 27 et je décolle, <indicatif>. »)
  → **PAS** « autorisé décollage piste 27 » côté pilote : le pilote dit **« je décolle »**.

### Après décollage (p. 63)
- ATC : « Continuez au cap de la piste. » / « Restez dans l'axe de piste. »
- Pilote : « Je continue au cap de la piste. » / « Je reste dans l'axe de piste. »

---

## 3-4. Circuit d'aérodrome + atterrissage — Chapitre 5, J. & K. (p. 148-161)

### Intégration — exemple **VFR** officiel (Blagnac, PA28, p. 149)
```
Pilote : Blagnac Tour, bonjour, F-BX.
ATC    : F-BX, bonjour, j'écoute.
Pilote : F-BGBX, PA28, VFR d'Albi à Blagnac pour un toucher (atterrissage/remise de gaz),
         1500 pieds, estimé E à 05, information I.
ATC    : F-BGBX, roger, rappelez E.
Pilote : Je rappelle E, F-BX.
puis :
Pilote : Blagnac Tour, F-BX, passe E.
ATC    : F-BX, entrez vent arrière main droite piste 33 droite, rappelez vent arrière.
Pilote : Je rappelle vent arrière main droite piste 33 droite, F-BX.
```
> En l'absence d'ATIS, avant la clairance d'entrée, l'ATC fournit dans l'ordre :
> **piste en service, direction/vitesse du vent, QNH** (p. 148).
> **Ce que le simulateur en garde (03/10/2026)** : tout, sauf le point d'entrée et
> son heure estimée (« estimé E à 05 », « rappelez E », « passe E ») et « main
> droite / main gauche » — nos données n'ont ni les points des cartes VAC ni le sens
> du circuit de chaque terrain, et ils ne s'inventent pas. Sans ATIS : « piste …,
> vent …, QNH …, entrez vent arrière piste …, rappelez vent arrière », collationné
> « Piste …, QNH …, je rappelle vent arrière piste … » (QNH collationné comme p. 38).
> L'ATIS du terrain d'arrivée s'écoute avant le premier contact (p. 214).

### Reports dans le circuit (p. 150-151)
Segments officiels : **Montée initiale · Vent traversier · Vent arrière · Travers mi-piste ·
Fin de vent arrière · Base · Dernier virage · Finale**.
```
Pilote : Blagnac Tour, F-BX, vent arrière main droite piste 33 droite.
ATC    : F-BX, numéro 3, suivez un Cessna 172 en base, rappelez base main droite piste 33 droite.
Pilote : Numéro 3, trafic en vue, je rappelle base main droite piste 33 droite, F-BX.
puis :
Pilote : Blagnac Tour, F-BX, base main droite piste 33 droite.
ATC    : F-BX, rappelez finale piste 33 droite.
Pilote : Je rappelle finale piste 33 droite, F-BX.
```

### Atterrissage (p. 154) — ⚠ CORRECTION MAJEURE
- ATC : **« Piste 33 droite, autorisé atterrissage, vent 350 degrés 10 nœuds. »**
- Collationnement pilote : **« Piste 33 droite, j'atterris, <indicatif>. »**
  → **PAS** « autorisé atterrissage » côté pilote : le pilote dit **« j'atterris »**.

### Remise de gaz (p. 159) — ⚠ le vent n'est pas mentionné (éviter confusion)
- ATC : « F-BX, remettez les gaz, rappelez vent arrière main droite piste 33 droite. »
- Pilote : « Je remets les gaz et rappelle vent arrière main droite piste 33 droite, F-BX. »

### Après atterrissage (p. 160-161)
- ATC : « Rappelez piste dégagée. » / « Dégagez première à gauche. »
  → Pilote : « Piste dégagée. » / « Je dégage première à gauche. »
- ATC : « Roulez parking aviation générale. » → « Je roule parking aviation générale. »
- ATC : « Faites un 180, remontez piste puis dégagez première à gauche. »
  → « Je remonte piste puis première à gauche, <indicatif>. »

### Sortie de circuit (p. 153)
- ATC : « Rappelez quittant la fréquence. »
- Pilote : « Sortie de circuit, je quitte la fréquence, <indicatif>. »

---

## 5. Navigation / croisière VFR — N. TRANSIT VFR (p. 178) + Information de vol (p. 204-213)

### Transit VFR (p. 178)
```
Pilote : Blagnac Tour, F-BX, demande transit VFR, 2000 pieds, de WH à EN, j'estime W à 52.
ATC    : F-BX, transitez via WH, WD, puis EN, maintenez 2000 pieds, et rappelez avant WD.
Pilote : Roger, je transite via WH, WD, puis EN, maintiens 2000 pieds, et rappelle avant WD, F-BX.
```
### Changement de fréquence (p. 182)
- ATC : « <indicatif>, contactez Reims CTL 134,050. » → Pilote : « Reims CTL 134,050, <indicatif>. »

### Information de trafic (FIS) (p. 211) — utile pour les « aléas »
- ATC : « <indicatif>, trafic convergent, route 180, estimant Montauban à 52, Cessna 172,
  même altitude. » → Pilote : « Roger, <indicatif>. » (ou « Trafic en vue, <indicatif>. »)

---

## 6. Urgence — MAYDAY / PAN PAN (SITUATIONS ANORMALES ET D'URGENCE, p. 238)

### Détresse (SERA.14095)
**« MAYDAY »** (de préférence ×3) suivi de :
A) nom de l'organisme ATS (si possible) · B) identification de l'aéronef ·
C) nature du cas de détresse · D) intentions du commandant de bord ·
E) position, niveau et cap actuels.
- Accusé ATC : **« Mayday Roger, transpondeur 7700. »**
- Fin : « TRAFIC DE DÉTRESSE TERMINÉ ».

### Urgence
**« PAN PAN »** (de préférence ×3) suivi de : A) organisme ATS · B) identification ·
C) nature du cas d'urgence · D) intentions · E) position, niveau, cap ·
F) autres renseignements utiles.
- Accusé ATC : **« Pan Pan Roger. »**

---

## 7. Panne radio — B. EXEMPLES DE PANNES §1 (p. 246-248)

- Trois situations : plus de réponse aux appels ; contact non établi alors qu'obligatoire ;
  transpondeur **7600** affiché.
- ATC (test récepteur) : « <indicatif>, <organisme>, me recevez-vous ? » →
  « …, si vous me recevez, **transpondeur ident**. » →
  « …, ident observé, vous êtes en panne d'émission, **transpondeur 7600**, accusez réception
  de tous mes messages par ident. »
- ATC : « Veillez Paris 133,5, je répète 133,5. »
- En circulation d'aérodrome (accusés visuels, p. 248) : « Accusez réception en **balançant
  les ailes** / en **faisant des appels de phares** / en **manœuvrant les ailerons**. »
  « Allumez vos phares. »

---

## Corrections principales à porter dans le simulateur (deltas vs version actuelle)
1. **Décollage** : collationnement pilote = « Piste X, je décolle » (et non « autorisé décollage »).
2. **Atterrissage** : collationnement pilote = « Piste X, j'atterris » (et non « autorisé atterrissage »).
3. **Circuit** : reports avec « main droite/gauche » + « je rappelle <segment> piste X, <indicatif> ».
4. **Intégration** : appel initial complet (type avion, VFR départ→arrivée, altitude, estimé point, information ATIS) puis « entrez vent arrière… ».
5. **Indicatif** : complet au 1er contact (F-BGBX), abrégé (F-BX) ensuite, à l'initiative du contrôleur.
6. **Remise de gaz** : pas de vent dans l'instruction.
7. **Toucher** (touch-and-go) : annoncé « pour un toucher » à l'intégration.
8. **Urgence** : structure MAYDAY/PAN PAN complète (organisme, identification, nature, intentions, position/niveau/cap) ; accusé « Mayday Roger, transpondeur 7700 ».

---

## 8. Manœuvres en finale — Chapitre 5, K.6 (p. 164-165) et remise de gaz (p. 159)

| Contrôleur | Pilote |
|---|---|
| — | « Demande toucher. » |
| « Piste 28, autorisé toucher. » | *(non donné par le manuel)* |
| « Faites un atterrissage complet. » | « Atterrissage complet. » |
| « Circuit basse hauteur approuvé. » | « Demande circuit basse hauteur. » |
| « Exercice d'encadrement approuvé. » | « Demande exercice d'encadrement. » |
| « Passage bas approuvé. » | « Demande passage bas. » |
| « Piste 28, autorisé option. » (écolage) | « Demande option. » |
| « Remettez les gaz, rappelez vent arrière … » | « Je remets les gaz et rappelle vent arrière …, F-BX. » |
| — | « Je remets les gaz. » (p. 159) |

> **Le collationnement du toucher** (03/10/2026). La p. 164 ne donne pas la réponse
> du pilote. La p. 34 range « toucher/option » parmi les éléments de PISTE qui se
> collationnent, et définit le collationnement comme la répétition de tout ou
> partie du message. Pour le décollage et l'atterrissage, le manuel remplace
> « autorisé … » par « je décolle » / « j'atterris » ; pour le toucher, il ne donne
> aucune forme de ce genre. Le simulateur attend donc la règle générale :
> **« Piste 28, autorisé toucher, F-BX »** — et ne l'invente pas autrement.

---

## 9. Terrain AFIS — « Manuel d'information pour l'utilisation de la phraséologie lorsqu'un service AFIS est rendu »

> **Source** : UAF & FA (Union des Aéroports Français & Francophones Associés),
> élaboré avec l'aide de la DGAC, **édition novembre 2022** (106 p.) ; première
> édition mai 2019. La DGAC a précisé (courrier du 25/03/2019, reproduit en tête)
> qu'il ne s'agit que d'une **préconisation**, sans valeur juridique — c'est
> néanmoins la seule phraséologie AFIS publiée depuis que la DGAC a retiré les
> chapitres AFIS de son manuel (2017). Le PDF n'est PAS dans le dépôt (publication
> de l'UAF) ; l'URL d'origine (ecologie.gouv.fr › Manuel_phraseo_afis.pdf) renvoie
> désormais une 404 — copie archivée sur web.archive.org.
>
> **Deux coquilles de l'édition 2022** (p. 32-33), où le pilote répète la phrase de
> l'agent : le simulateur prend la ligne de l'édition 2019, que la colonne anglaise
> de l'édition 2022 confirme (« taxiing holding point », « Roger, DR 400 in sight,
> holding short of runway 24 »).

### Départ VFR (Bourges, p. 32-33)
```
Pilote : Bourges Information, bonjour, F-BX.
AFIS   : F-BX, bonjour, Bourges Information, j'écoute.
Pilote : F-BGBX, PA28, parking club, VFR sans plan de vol, destination Limoges,
         demandons paramètres pour le départ.
AFIS   : F-BX, piste 24, vent 230 degrés 10 nœuds, QNH 1012, température 18, … Rappeler pour rouler.
Pilote : Roger, piste 24, QNH 1012, F-BX.
Pilote : Bourges Information, F-BX, roulons point d'attente piste 24.
AFIS   : F-BX, rappelez point d'attente piste 24, [trafic], assurez votre séparation.
Pilote : Roger, F-BX.
Pilote : Bourges Information, F-BX, point d'attente piste 24, prêt au départ.
AFIS   : F-BX, DR400 en finale, vos intentions.
Pilote : Roger, DR400 en vue, maintenons avant piste 24, F-BX.
Pilote : Bourges Information, F-BX, nous alignons piste 24.
AFIS   : F-BX, rappelez aligné prêt piste 24.
Pilote : Décollons piste 24, F-BX.
AFIS   : F-BX, vent 260 degrés 10 nœuds, rappelez quittant la fréquence.
Pilote : Bourges Information, F-BX, sortie de circuit, quittons la fréquence.
AFIS   : F-BX, roger, au revoir.
```
### Arrivée VFR (Bourges, p. 40-41)
```
Pilote : Bourges Information, bonjour, F-BX.
AFIS   : F-BX, bonjour, Bourges Information, j'écoute.
Pilote : F-BGBX, PA28, VFR avec plan de vol, de Limoges à Bourges estimé à 12.
AFIS   : F-BX, piste 24 en service, vent 350 degrés 10 nœuds, QNH 1015, rappelez en vue de l'aérodrome.
Pilote : QNH 1015, rappellerons en vue de l'aérodrome, F-BX.
Pilote : Bourges Information, F-BX, en vue de l'aérodrome.
AFIS   : F-BX, [parachutage en cours,] rappelez vent arrière piste 24.
Pilote : [Parachutage en cours,] rappellerons vent arrière piste 24, F-BX.
Pilote : Bourges Information, F-BX, vent arrière piste 24.
AFIS   : F-BX, [un DR400 remonte la piste,] rappelez finale piste 24.
Pilote : [DR400 en vue,] rappellerons finale piste 24, F-BX.
Pilote : Bourges Information, F-BX, finale piste 24.
AFIS   : F-BX, piste engagée par DR400, assurez votre séparation. Quelles sont vos intentions ?
Pilote : DR400 en vue, remettrons les gaz piste 24, F-BX.
AFIS   : F-BX, Bourges Information, piste dégagée par le DR400.
Pilote : Roger, atterrissons piste 24, F-BX.
AFIS   : F-BX, vent 260 degrés 10 nœuds, rappelez piste dégagée.
Pilote : Roger, F-BX.
Pilote : Bourges Information, F-BX, piste dégagée.
AFIS   : F-BX, rappelez parking.
Pilote : Bourges Information, F-BX, au parking, quittons la fréquence.
AFIS   : F-BX, au revoir.
```
> Aucune clairance : l'agent informe et demande de rappeler. Pas de toucher, pas
> de passage bas, pas de remise de gaz annoncée d'elle-même dans ce manuel — le
> simulateur ne les propose donc pas sur un terrain AFIS.

---

## 10. Auto-information — arrêté du 12 juillet 2019

> **Source** : arrêté du 12 juillet 2019 relatif aux procédures générales de
> circulation aérienne pour l'utilisation des aérodromes par les aéronefs (JO du
> 2 août 2019, en vigueur le 2 septembre 2019 ; il remplace l'arrêté du 17 juillet
> 1992). Il fixe **quand** le pilote transmet et **quoi** — « des comptes rendus de
> position, indique ses intentions et transmet toutes modifications ultérieures » :
> - à l'arrivée : avant de s'intégrer dans la circulation d'aérodrome, en vent
>   arrière, en base, en finale, lorsque la piste est dégagée, sur l'aire de trafic ;
> - au départ : sur l'aire de trafic avant de se déplacer, aux points d'attente
>   avant de pénétrer sur une piste, une fois aligné avant de décoller, lorsqu'il
>   quitte la circulation d'aérodrome.
>
> **Aucun texte officiel ne donne la formulation.** Le simulateur reprend les
> comptes rendus que le pilote adresse à un agent AFIS (§ 9), identiques, précédés
> du nom de la station à chaque message : « … auto-information, F-BX, roulons point
> d'attente piste 24 », « nous alignons piste 24 », « décollons piste 24 », « vent
> arrière piste 24 », « base piste 24 », « finale piste 24 », « piste dégagée »,
> « au parking, quittons la fréquence ». Remise de gaz : « remettons les gaz piste
> 24 » (forme du manuel AFIS, au présent : un changement d'intention s'annonce).
