# Le catalogue du manuel — toute la phraséologie, en un fichier

`assets/donnees/phraseologie-manuel.json` — **1 058 répliques**, tirées des
281 pages du *Manuel de phraséologie à l'usage de la circulation aérienne
générale* (DSNA, 10ᵉ édition, 15 avril 2023).

Pour chacune : **qui parle**, le **français**, l'**anglais**, la **page
imprimée**, et l'endroit exact du manuel d'où elle vient.

> **Ce fichier ne s'édite pas à la main. Il se refait.**
> ```sh
> pip3 install pypdf                 # une seule fois
> python3 outils/extraire-manuel.py assets/donnees/phraseologie-manuel.json
> ```
> `pypdf` ne sert qu'ici, à la demande. L'application reste un site statique
> sans aucune dépendance, et le JSON est versionné : personne n'a besoin de ce
> script pour faire tourner le site.

---

## 1. Pourquoi un script plutôt qu'une saisie

Le § 2 de `CLAUDE.md` interdit d'inventer une phrase. Saisir 1 058 répliques à
la main, c'est 1 058 occasions de se tromper d'un mot — et rien pour s'en
apercevoir.

Ici, `fr` et `en` sont les **chaînes exactes du PDF**, jamais réécrites. Les
coquilles du manuel y sont reproduites telles quelles (« cleared&nbsp;&nbsp;for
take-off », p. 59) : les corriger serait déjà réécrire. Et la sortie se refait
en une commande, donc elle se vérifie.

---

## 2. Ce qui est verbatim, et ce qui est déduit

La distinction est le cœur du fichier : elle dit jusqu'où on peut lui faire
confiance.

**Verbatim** — `fr` et `en`.

**Déduit de la mise en page.** Le manuel donne lui-même la clé de deux de ces
quatre points, page 8 (« Clés de lecture ») :

| Quoi | D'où ça vient |
|---|---|
| **Qui parle** | le pictogramme posé à côté du texte, que le manuel nomme p. 8. On le reconnaît aux dimensions de l'image : (51×53) et (53×52) = pilote, (67×72) = contrôleur, (61×45) = agent à bord d'un véhicule, (69×52) = ATIS. |
| **La langue** | la police. Calibri **gras** = français, Calibri *italique* = anglais. Sans exception dans tout le manuel. |
| **Les colonnes** | dans les tableaux EXPRESSIONS, le contrôleur est à gauche, le pilote à droite. |
| **L'appariement FR/EN** | le manuel imprime le dialogue entier en français, **puis** le même en anglais. Les deux suites sont recollées dans l'ordre. |

**Le seul point déduit qui pourrait faire un dégât réel, c'est « qui parle ».**
Attribuer au pilote une phrase du contrôleur, c'est enseigner une erreur.
C'est donc celui que `tests/contrat/catalogue-manuel.test.mjs` surveille, avec
six ancres du circuit VFR (décollage, alignement, atterrissage) dont
`PHRASEOLOGIE-MANUEL.md` documente la page et la bouche.

**L'appariement ne devine jamais.** Les deux suites ne sont recollées que si
la **suite des locuteurs concorde des deux côtés**. Sinon rien n'est collé :
l'entrée porte `traductionSeparee: true` et n'a qu'une langue. C'est le cas de
**341 entrées sur 1 058** — un couple absent vaut mieux qu'un faux couple.

---

## 3. Une entrée

```json
{
 "id": "ph0198",
 "page": 59,
 "chapitre": "DÉROULEMENT CHRONOLOGIQUE D'UN VOL",
 "section": "C. ALIGNEMENT - DÉCOLLAGE",
 "sousSection": "4. Autorisation de décollage",
 "sousSousSection": null,
 "bloc": "EXPRESSIONS",
 "genre": "expressions",
 "locuteur": "controleur",
 "fr": "Piste 27, autorisé décollage, vent 280 degrés 10 nœuds.",
 "en": "Runway 27, cleared for take-off, wind 280 degrees 10 knots.",
 "dejaCite": true
}
```

| Champ | Ce qu'il dit |
|---|---|
| `genre` | `expressions` = le tableau **normatif** de la section, ce qu'on **peut** dire. `base`, `complementaire`, `exemple` = des dialogues qui l'illustrent. `texte` = de la prose. |
| `locuteur` | `pilote`, `controleur`, `vehicule`, `atis`. |
| `facultatifs` | les `[mots entre crochets]` — facultatifs selon le manuel p. 8. |
| `aCompleter` | les `(mots entre parenthèses)` — à compléter, ou variante possible (p. 8). |
| `traductionSeparee` | l'anglais n'a pas pu être apparié avec certitude ; l'entrée n'a qu'une langue. |
| `dejaCite` | cette page du manuel est déjà citée quelque part dans le simulateur. **Faux = matière encore inexploitée.** |

À côté des entrées, `contexte` (335 blocs) garde la **prose** du manuel —
EMPLOI, CONDITIONS D'UTILISATION, ACTIONS du contrôleur et du pilote — rattachée
à sa section. C'est là que se trouvent les règles qui encadrent les phrases,
par exemple : *« En l'absence d'ATIS, avant de délivrer la clairance d'entrée
dans le circuit, le contrôleur doit fournir, dans cet ordre : la piste en
service, la direction et la vitesse du vent, le QNH »* (p. 148).

### Deux conventions typographiques qui ne survivent pas à l'extraction

- Les **capitales soulignées** du manuel s'épellent. Le soulignement disparaît :
  `« F B X »` se lit donc **F-BX épelé** (manuel p. 9).
- Les capitales séparées par un **tiret bas** s'épellent aussi : `I_L_S`,
  `V_F_R`, `Q_N_H`, `P_A 28` (p. 9).

---

## 4. Ce que ça ouvre

| Chapitre | Répliques | dont tableaux normatifs | sur une page déjà citée |
|---|---:|---:|---:|
| DÉROULEMENT CHRONOLOGIQUE D'UN VOL | 713 | 241 | 282 |
| SITUATIONS ANORMALES ET D'URGENCE | 104 | 13 | 23 |
| EMPLOI DU SYSTÈME DE SURVEILLANCE ATS | 103 | 43 | 21 |
| ACTIVITÉS SPÉCIFIQUES | 50 | 5 | 7 |
| SERVICE D'INFORMATION DE VOL | 28 | 0 | 28 |
| COLLATIONNEMENT PAR LE PILOTE | 20 | 0 | 0 |
| SITUATIONS PARTICULIÈRES | 14 | 10 | 2 |
| GÉNÉRALITÉS | 12 | 0 | 0 |
| FRÉQUENCES | 11 | 11 | 2 |
| RENSEIGNEMENTS SUR L'ÉTAT DE L'AÉRODROME | 3 | 1 | 0 |
| **Total** | **1 058** | **324** | **365** |

**Les deux tiers du manuel ne sont pas exploités.** Le détail, dans le chapitre
qui compte pour le VFR :

| Section | Répliques | déjà citées |
|---|---:|---:|
| C. ALIGNEMENT - DÉCOLLAGE | 94 | 94 |
| J. CIRCUIT D'AÉRODROME CONTRÔLÉ | 44 | 44 |
| K. ATTERRISSAGE | 68 | 54 |
| B. CIRCULATION AU SOL | 78 | 44 |
| A. PRÉVOL | 25 | 25 |
| **F. CROISIÈRE** | **113** | **0** |
| **G. DESCENTE** | **75** | **0** |
| **I. APPROCHE** | **54** | **0** |
| **E. MONTÉE** | **44** | **0** |
| **H. ATTENTES** | 38 | 13 |
| **D. DÉPARTS** | **27** | **0** |
| **M. VFR SPÉCIAL** | 22 | 3 |
| L. PROCÉDURES PAR FAIBLE VISIBILITÉ | 20 | 0 |
| N. TRANSIT VFR | 11 | 5 |

Ce que le simulateur couvre aujourd'hui — mise en route, roulage, décollage,
circuit, atterrissage — est couvert **entièrement**. Ce qui manque, c'est tout
ce qu'il y a **entre** le décollage et l'intégration : le départ, la montée, la
croisière, la descente, l'approche. Plus le VFR spécial, les attentes, et les
104 répliques de situations anormales et d'urgence.

---

## 5. Ce que ce fichier ne remplace pas

- **`PHRASEOLOGIE-MANUEL.md`** reste la lecture d'entrée : il est court, il
  explique, et il porte les **huit corrections** à appliquer au simulateur. Le
  catalogue, lui, est exhaustif mais plat.
- **`Manuel_Phraseologie.pdf`** reste la source. Le catalogue en est une
  transcription outillée, pas un substitut : les schémas, les tableaux de
  l'état de surface (GRF) et les mises en page qui portent du sens n'y sont pas.
- **`assets/donnees/phraseologie-scenarios.js`** reste ce que l'application
  joue. Le catalogue **n'est chargé par aucune page** : le poser dans
  `index.html` ferait télécharger 639 ko à tout le monde pour une donnée que
  rien ne lit encore. Quand un écran en aura besoin, il le chargera lui-même.

---

## 6. Si une entrée paraît fausse

Ne la corrigez pas dans le JSON : la prochaine regénération l'écrasera.

1. Ouvrez le PDF à la page indiquée et regardez ce qu'il dit vraiment.
2. Si le PDF donne raison au fichier — c'est le manuel qui est ainsi, on n'y
   touche pas (§ 2).
3. Si le PDF donne tort au fichier, c'est l'extraction qui a fauté : corrigez
   `outils/extraire-manuel.py`, refaites le fichier, et **ajoutez une ancre**
   dans `tests/contrat/catalogue-manuel.test.mjs` pour que le cas ne revienne
   pas.
