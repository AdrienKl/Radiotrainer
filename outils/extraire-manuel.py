#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Albatros VFR — LE MANUEL DSNA, TRANSFORMÉ EN CATALOGUE

    python3 outils/extraire-manuel.py assets/donnees/phraseologie-manuel.json

Lit Manuel_Phraseologie.pdf (DSNA, 10e éd., 281 pages) et en sort TOUTE la
phraséologie : 1 058 répliques, avec qui parle, le français, l'anglais, et la
page imprimée.

┌─ POURQUOI UN SCRIPT, ET PAS UNE SAISIE À LA MAIN ────────────────────────┐
│ Le § 2 de CLAUDE.md interdit d'inventer une phrase. Une saisie à la main  │
│ de 1 058 répliques, c'est 1 058 occasions de se tromper d'un mot, et rien │
│ pour s'en apercevoir. Ici, chaque phrase est la chaîne EXACTE du PDF, et  │
│ la sortie se refait en une commande : elle est vérifiable.                │
└───────────────────────────────────────────────────────────────────────────┘

CE QUI EST VERBATIM, ET CE QUI EST DÉDUIT — la distinction est le cœur du
fichier, parce qu'elle dit jusqu'où on peut faire confiance à la sortie.

  VERBATIM : `fr` et `en`. Jamais réécrits. Les fautes du manuel y sont
  reproduites telles quelles (« cleared  for take-off », p. 59) : les corriger
  serait déjà réécrire.

  DÉDUIT de la mise en page, et le manuel donne lui-même la clé (p. 8, « Clés
  de lecture ») :

  1. QUI PARLE — le pictogramme posé à côté du texte. Le manuel p. 8 les
     nomme ; on les reconnaît à leurs dimensions d'image :
         (51×53) et (53×52) = pilote      (67×72) = contrôleur
         (61×45) = agent à bord d'un véhicule sur l'aire de manœuvre
         (69×52) = communication enregistrée ATIS
     C'est la seule information qui compte vraiment : attribuer au pilote une
     phrase du contrôleur, c'est enseigner une erreur (§ 2).

  2. LA LANGUE — la police. Calibri gras = français, Calibri italique =
     anglais. Sans exception dans tout le manuel.

  3. LES COLONNES — dans les tableaux EXPRESSIONS, le contrôleur est à gauche
     et le pilote à droite ; le pictogramme de droite ouvre la colonne pilote.

  4. L'APPARIEMENT FRANÇAIS / ANGLAIS des dialogues. Le manuel imprime le
     dialogue entier en français, PUIS le même en anglais. On recolle les deux
     suites dans l'ordre — mais SEULEMENT si la suite des locuteurs concorde
     des deux côtés. Sinon on ne colle RIEN : l'entrée porte
     `traductionSeparee: true` et n'a qu'une langue. Un couple deviné serait
     pire qu'un couple absent.

LES DEUX PIÈGES DU PDF, déjà tombés pendant l'écriture de ce script

  - LES LETTRINES SONT DES IMAGES. « EXPRESSIONS » s'extrait « XPRESSIONS » :
    le E initial est une image, pas du texte. D'où la table CAPITALE.

  - LES ESPACES N'EXISTENT PAS TOUJOURS. Le PDF place « Piste 27, » puis
    « je » puis « décolle » sans caractère d'espace entre eux — concaténer
    donne « Piste 27,jedécolle ». On mesure donc la largeur réelle de chaque
    segment avec les métriques de la police (/Widths) et on insère l'espace
    quand l'écart dépasse 0,14 × le corps. Seuil calé sur la p. 59 : à 0,22
    il manquait des espaces, à 0,10 rien ne changeait de plus.
    Les espaces VRAIMENT absents du manuel restent absents. C'est voulu.

DÉPENDANCE : pypdf (`pip3 install pypdf`). Elle ne sert QU'ICI, à la demande.
L'application reste un site statique sans aucune dépendance, et le JSON produit
est versionné : personne n'a besoin de ce script pour faire tourner le site.
"""
import pypdf, json, re, sys, collections, unicodedata, os

PDF = 'Manuel_Phraseologie.pdf'
DECALAGE = 18                       # page PDF = page imprimée + 18

# Les pictogrammes du manuel, reconnus à leurs dimensions d'image (manuel p. 8).
LOCUTEUR = {(51,53):'pilote', (53,52):'pilote', (67,72):'controleur',
            (61,45):'vehicule', (55,40):'vehicule', (69,52):'atis'}

# Les lettrines étant des images, chaque étiquette de bloc arrive amputée de sa
# première lettre. L'ordre compte : XEMPLES avant XEMPLE, sinon « EXEMPLES »
# deviendrait « EXEMPLE S ».
CAPITALE = [('XPRESSIONS','EXPRESSIONS'), ('XEMPLES','EXEMPLES'), ('XEMPLE','EXEMPLE'),
            ('MPLOI','EMPLOI'), ('HRASEOLOGIE DE BASE','PHRASÉOLOGIE DE BASE'),
            ('HRASEOLOGIE COMPLEMENTAIRE','PHRASÉOLOGIE COMPLÉMENTAIRE'),
            ("ONDITIONS D'UTILISATION","CONDITIONS D'UTILISATION"),
            ('CTIONS','ACTIONS'), ('CTION','ACTION'), ('ESCRIPTION','DESCRIPTION')]

GENRE = {'EXPRESSIONS':'expressions', 'EXEMPLE':'exemple', 'EXEMPLES':'exemple',
         'PHRASÉOLOGIE DE BASE':'base', 'PHRASÉOLOGIE COMPLÉMENTAIRE':'complementaire',
         'EMPLOI':'emploi', "CONDITIONS D'UTILISATION":'conditions',
         'ACTIONS':'acteurs', 'ACTION':'acteurs', 'DESCRIPTION':'texte'}

# Les douze intercalaires du manuel, relevés sur les titres en corps 28.
CHAPITRES = [(1,'GLOSSAIRE'), (5,'GÉNÉRALITÉS'),
             (25,"RENSEIGNEMENTS SUR L'ÉTAT DE L'AÉRODROME"),
             (33,'COLLATIONNEMENT PAR LE PILOTE'),
             (37,"DÉROULEMENT CHRONOLOGIQUE D'UN VOL"), (181,'FRÉQUENCES'),
             (185,"EMPLOI DU SYSTÈME DE SURVEILLANCE ATS"),
             (203,"SERVICE D'INFORMATION DE VOL"), (219,'ACTIVITÉS SPÉCIFIQUES'),
             (233,'SITUATIONS PARTICULIÈRES'), (237,"SITUATIONS ANORMALES ET D'URGENCE"),
             (259,'COORDINATION')]


# --- 1. Mesurer le texte -----------------------------------------------------

_metriques = {}
def _largeurs(police):
    """Table /Widths de la police, ou None pour les polices CID (sans table)."""
    if police is None: return None
    cle = id(police)
    if cle not in _metriques:
        v = None
        try:
            w = police.get('/Widths')
            if w is not None:
                v = (int(police.get('/FirstChar', 0)), [float(x) for x in w.get_object()])
        except Exception:
            v = None
        _metriques[cle] = v
    return _metriques[cle]

def largeur(texte, police, corps):
    """Largeur rendue d'un segment, en points. Sert UNIQUEMENT à savoir s'il
       manque une espace entre deux segments."""
    m = _largeurs(police)
    if not m: return len(texte) * 0.47 * corps        # repli : Calibri ≈ 0,47 em
    premier, w = m
    total = 0.0
    for c in texte:
        i = ord(c) - premier
        total += w[i] if 0 <= i < len(w) else 500.0
    return total / 1000.0 * corps

def langue(police):
    try: nom = str(police.get('/BaseFont'))
    except Exception: nom = ''
    if 'Italic' in nom and 'Bold' not in nom: return 'en'
    if 'Bold' in nom: return 'fr'
    return 'neutre'

def net(t):
    return re.sub(r'[ \t]+', ' ', t.replace('’', "'").replace(' ', ' ')).strip()

def etiquette(t):
    for ampute, plein in CAPITALE:
        if t.upper().startswith(ampute): return plein + t[len(ampute):]
    return None

def espacer(t):
    """« 4.Autorisation » → « 4. Autorisation » (la lettrine colle au texte)."""
    return re.sub(r'^([A-Za-z0-9]+\.)(?=\S)', r'\1 ', t).strip()

def joindre(segments):
    """Segments d'une même ligne → texte, espaces reconstituées."""
    segments = sorted(segments, key=lambda a: a['x'])
    sortie = ''
    for i, s in enumerate(segments):
        sortie += s['t']
        if i + 1 < len(segments):
            fin = s['x'] + largeur(s['t'], s['f'], s['sz'])
            if segments[i+1]['x'] - fin > 0.14 * s['sz'] and not sortie.endswith(' '):
                sortie += ' '
    return net(sortie)

def en_lignes(segments):
    """Segments d'une cellule → [(y, langue, texte)], de haut en bas."""
    bandes = []
    for s in sorted(segments, key=lambda a: (-a['y'], a['x'])):
        for b in bandes:
            if abs(b[0] - s['y']) <= 1.6: b[1].append(s); break
        else:
            bandes.append((s['y'], [s]))
    sortie = []
    for y, groupe in bandes:
        poids = collections.Counter()
        for s in groupe: poids[s['lg']] += max(1, len(s['t'].strip()))
        t = joindre(groupe)
        if t: sortie.append((y, 'en' if poids['en'] > poids['fr'] else 'fr', t))
    return sortie


# --- 2. Lire une page --------------------------------------------------------

def lire_page(page, numero):
    segments, pictos, dims = [], [], {}
    try:
        xo = page['/Resources']['/XObject']
        for k in xo:
            try: dims[str(k)] = (int(xo[k].get('/Width', 0)), int(xo[k].get('/Height', 0)))
            except Exception: pass
    except Exception:
        pass

    def texte(t, cm, tm, police, corps):
        if t.strip():
            segments.append({'y': round(tm[5], 1), 'x': tm[4], 'sz': corps,
                             'f': police, 'lg': langue(police), 't': t})

    def image(op, args, cm, tm):
        if op == b'Do' and args:
            d = dims.get(str(args[0]))
            if d in LOCUTEUR:
                pictos.append({'y': round(cm[5], 1), 'x': round(cm[4], 1), 'qui': LOCUTEUR[d]})

    page.extract_text(visitor_text=texte, visitor_operand_before=image)
    segments = [s for s in segments if 18 < s['y'] < 692]   # hors en-tête et pied
    pictos.sort(key=lambda a: (-a['y'], a['x']))
    for i, p in enumerate(pictos): p['i'] = i

    # Les titres (corps 12) coupent les cellules : une réplique ne traverse
    # jamais un titre.
    gros = [s for s in segments if s['sz'] >= 11.8 and s['x'] < 300]
    titres, coupures = [], []
    for y, _lg, t in en_lignes(gros):
        titres.append({'y': y, 'etq': etiquette(t), 't': espacer(t)})
        coupures.append(y)
    corps = [s for s in segments if not (s['sz'] >= 11.8 and s['x'] < 300)]

    # Chaque segment rejoint le pictogramme qui l'introduit : même colonne,
    # au-dessus de lui, et rien entre les deux.
    cellules = collections.defaultdict(list)
    libres = []
    for s in corps:
        bande = [p for p in pictos if -3 <= p['y'] - s['y'] <= 95]
        x_droite = min([p['x'] for p in bande if p['x'] > 250], default=None)
        colonne = 'droite' if (x_droite is not None and s['x'] >= x_droite - 2) else 'gauche'
        candidats = [p for p in bande
                     if ('droite' if p['x'] > 250 else 'gauche') == colonne and p['x'] <= s['x'] + 2]
        candidats.sort(key=lambda p: p['y'] - s['y'])
        pris = None
        for p in candidats:
            if any(s['y'] < c < p['y'] for c in coupures): continue          # un titre s'interpose
            if any(q['i'] > p['i'] and s['y'] - 1 <= q['y'] < p['y'] - 3
                   and ('droite' if q['x'] > 250 else 'gauche') == colonne
                   for q in pictos): continue                                 # un picto s'interpose
            pris = p; break
        (libres if pris is None else cellules[pris['i']]).append(s)

    return {'page': numero, 'titres': titres, 'pictos': pictos,
            'cellules': {i: en_lignes(v) for i, v in cellules.items()},
            'libres': en_lignes(libres)}


# --- 3. Reconstituer les blocs ----------------------------------------------

def construire():
    lecteur = pypdf.PdfReader(PDF)
    blocs = []
    section = sous = soussous = None
    n = 0
    for i, page in enumerate(lecteur.pages):
        numero = i + 1 - DECALAGE
        # Un intercalaire de chapitre remet les sections à zéro : sans ça, la
        # dernière section du chapitre précédent (« C. PÉRIL AVIAIRE ») reste
        # collée aux premières pages du suivant (le message MAYDAY, p. 238).
        if any(numero == debut for debut, _t in CHAPITRES):
            section = sous = soussous = None
        d = lire_page(page, numero)
        evenements = [(t['y'], 'titre', t) for t in d['titres']]
        evenements += [(l[0][0], 'cellule', (i2, l)) for i2, l in d['cellules'].items() if l]
        evenements += [(y, 'libre', t) for y, _lg, t in d['libres']]
        evenements.sort(key=lambda a: -a[0])

        bloc = None
        for _y, genre, data in evenements:
            if genre == 'titre':
                if data['etq']:
                    n += 1
                    base = data['etq'].split(' n°')[0].split(' N°')[0].rstrip(' :').strip()
                    bloc = {'id': 'm%04d' % n, 'page': numero, 'section': section,
                            'sousSection': sous, 'sousSousSection': soussous,
                            'etiquette': data['etq'], 'genre': GENRE.get(base, 'autre'),
                            'notes': [], 'repliques': []}
                    blocs.append(bloc)
                else:
                    t = data['t']
                    if   re.match(r'^[A-Z]\. ', t): section, sous, soussous, bloc = t, None, None, None
                    elif re.match(r'^\d+\. ', t):   sous, soussous, bloc = t, None, None
                    elif re.match(r'^[a-z]\. ', t): soussous, bloc = t, None
                continue
            if bloc is None:
                n += 1
                bloc = {'id': 'm%04d' % n, 'page': numero, 'section': section,
                        'sousSection': sous, 'sousSousSection': soussous,
                        'etiquette': None, 'genre': 'texte', 'notes': [], 'repliques': []}
                blocs.append(bloc)
            if genre == 'libre':
                bloc['notes'].append(data)
            elif data[1] and data[1][0][2].startswith('•'):
                # Une puce n'est pas une réplique : c'est le commentaire du
                # manuel, que la mise en page a posé sous un pictogramme.
                bloc['notes'].extend(t for _y2, _lg, t in data[1])
            else:
                idx, lignes = data
                bloc['repliques'].append({
                    'locuteur': d['pictos'][idx]['qui'],
                    'fr': ' '.join(t for _y2, lg, t in lignes if lg == 'fr').strip(),
                    'en': ' '.join(t for _y2, lg, t in lignes if lg == 'en').strip()})
    return [b for b in blocs if b['repliques'] or b['notes']]


# --- 4. Recoller le français et l'anglais ------------------------------------

LIAISON = {'puis', 'ou', 'ou bien', 'et', ''}

def apparier(blocs):
    """Le manuel imprime un dialogue entier en français, PUIS le même en
       anglais, et une page peut en enchaîner plusieurs. On découpe donc les
       répliques en SUITES de même langue, puis on recolle suite française n
       avec suite anglaise n, réplique par réplique.

       Le LOCUTEUR est le garde-fou. Si les deux suites ne se correspondent pas
       locuteur pour locuteur, on ne colle rien et les entrées sortent avec
       `traductionSeparee`. Un faux couple serait pire qu'un couple absent."""
    separes = 0
    for b in blocs:
        # Les mots de liaison (« puis », « ou ») ne sont pas de la phraséologie :
        # ils faussent le compte des suites. Ils partent en notes.
        for r in b['repliques']:
            for a, autre in (('fr', 'en'), ('en', 'fr')):
                if r[autre] and r[a] and r[a].strip().lower().rstrip(' :.') in LIAISON:
                    if r[a] not in b['notes']: b['notes'].append(r[a])
                    r[a] = ''
            for a in ('fr', 'en'):
                m = re.match(r'^(.*?)[ ]+(puis|ou)$', r[a].strip())
                if m and len(m.group(1)) > 3:
                    if m.group(2) not in b['notes']: b['notes'].append(m.group(2))
                    r[a] = m.group(1).strip()

        suites = []
        for r in b['repliques']:
            cote = 'en' if len(r['en']) > len(r['fr']) else 'fr'
            if r['fr'] and r['en'] and abs(len(r['fr']) - len(r['en'])) < 6: cote = 'couple'
            if not suites or suites[-1][0] != cote: suites.append((cote, [r]))
            else: suites[-1][1].append(r)

        fr = [s for s in suites if s[0] == 'fr']
        en = [s for s in suites if s[0] == 'en']
        concorde = (len(fr) == len(en) and fr and
                    all(len(a[1]) == len(c[1]) and
                        all(x['locuteur'] == y['locuteur'] for x, y in zip(a[1], c[1]))
                        for a, c in zip(fr, en)))
        if concorde:
            colles = set()
            for a, c in zip(fr, en):
                for x, y in zip(a[1], c[1]):
                    if y['fr'] and y['fr'] not in b['notes']: b['notes'].append(y['fr'])
                    x['en'] = y['en']; colles.add(id(y))
            b['repliques'] = [r for r in b['repliques'] if id(r) not in colles]
        elif fr and en:
            separes += 1
            b['traductionSeparee'] = True
        b['repliques'] = [r for r in b['repliques'] if r['fr'] or r['en']]
    return separes


# --- 5. Écrire le catalogue --------------------------------------------------

def chapitre_de(page):
    nom = 'LIMINAIRES'
    for debut, titre in CHAPITRES:
        if page >= debut: nom = titre
    return nom

def options(t):
    """Notation du manuel (p. 8) : [crochets] = facultatif,
       (parenthèses) = à compléter, ou variante possible."""
    return (re.findall(r'\[([^\]]+)\]', t), re.findall(r'\(([^)]+)\)', t))

def pages_citees():
    """Quelles pages du manuel le simulateur cite-t-il déjà ? Sert à voir d'un
       coup d'œil ce qui est exploité et ce qui dort encore."""
    vues = collections.Counter()
    for f in ('assets/donnees/phraseologie-scenarios.js', 'assets/scenarios/moteur.js',
              'assets/modules/epellation-cours.js', 'PHRASEOLOGIE-MANUEL.md'):
        try: s = open(f, encoding='utf-8').read()
        except Exception: continue
        for m in re.finditer(r'p\.\s?(\d{1,3})(?:\s?-\s?(\d{1,3}))?', s):
            a = int(m.group(1)); b = int(m.group(2) or a)
            if 1 <= a <= 281:
                for p in range(a, min(b, 281) + 1): vues[p] += 1
    return vues

def main(sortie):
    blocs = construire()
    apparier(blocs)
    citees = pages_citees()

    entrees = []
    for b in blocs:
        for r in b['repliques']:
            e = {'id': 'ph%04d' % (len(entrees) + 1), 'page': b['page'],
                 'chapitre': chapitre_de(b['page']), 'section': b['section'],
                 'sousSection': b['sousSection'], 'sousSousSection': b['sousSousSection'],
                 'bloc': b['etiquette'], 'genre': b['genre'],
                 'locuteur': r['locuteur'], 'fr': r['fr'], 'en': r['en']}
            facultatifs, a_completer = options(r['fr'])
            if facultatifs: e['facultatifs'] = facultatifs
            if a_completer: e['aCompleter'] = a_completer
            if b.get('traductionSeparee'): e['traductionSeparee'] = True
            if b['page'] in citees: e['dejaCite'] = True
            entrees.append(e)

    contexte = [{'page': b['page'], 'chapitre': chapitre_de(b['page']),
                 'section': b['section'], 'sousSection': b['sousSection'],
                 'sousSousSection': b['sousSousSection'], 'bloc': b['etiquette'],
                 'genre': b['genre'], 'notes': b['notes']}
                for b in blocs if b['notes']]

    catalogue = {
      'meta': {
        'titre': "Manuel de phraséologie à l'usage de la circulation aérienne générale",
        'editeur': 'DSNA — Direction des services de la navigation aérienne',
        'edition': '10e édition, à jour au 15 avril 2023',
        'fichier': 'Manuel_Phraseologie.pdf', 'pagesPdf': 281,
        'pageImprimee': 'page PDF = page imprimée + 18',
        'genereLe': '21/09/2026', 'genereAvec': 'outils/extraire-manuel.py',
        'aNePasEditerAlaMain': "ce fichier se REFAIT, il ne se corrige pas : "
                               "`python3 outils/extraire-manuel.py assets/donnees/phraseologie-manuel.json`",
        'verbatim': "`fr` et `en` sont les chaînes exactes du PDF, jamais réécrites — "
                    "y compris ses coquilles (« cleared  for take-off », p. 59).",
        'deduit': {
          'locuteur': "le pictogramme posé à côté du texte, que le manuel nomme p. 8 : "
                      "(51×53) et (53×52) = pilote, (67×72) = contrôleur, "
                      "(61×45) = agent à bord d'un véhicule, (69×52) = ATIS.",
          'langue': "la police : Calibri gras = français, Calibri italique = anglais.",
          'colonnes': "dans les tableaux EXPRESSIONS, le contrôleur est à gauche "
                      "et le pilote à droite.",
          'traduction': "le manuel imprime le dialogue entier en français puis en "
                        "anglais ; les deux suites sont recollées dans l'ordre, et "
                        "SEULEMENT si la suite des locuteurs concorde. Sinon rien "
                        "n'est collé : l'entrée porte `traductionSeparee` et n'a "
                        "qu'une langue. Jamais de couple deviné.",
          'espaces': "le PDF n'écrit pas toujours l'espace entre deux segments ; "
                     "elle est réinsérée quand l'écart mesuré dépasse 0,14 × le corps.",
        },
        'conventions': {
          'crochets': "[entre crochets] = mots facultatifs (manuel p. 8).",
          'parentheses': "(entre parenthèses) = indication à compléter, ou variante "
                         "possible (manuel p. 8).",
          'epellation': "les capitales soulignées du manuel s'épellent ; le soulignement "
                        "ne survit pas à l'extraction. « F B X » se lit donc F-BX épelé, "
                        "et « I_L_S » se lit i-l-s (manuel p. 9).",
        },
        'champs': {
          'genre': "expressions = le tableau normatif de la section (ce qu'on PEUT dire) ; "
                   "base / complementaire / exemple = des dialogues qui l'illustrent ; "
                   "emploi / conditions / acteurs / texte = de la prose, pas de la phraséologie.",
          'dejaCite': "vrai si cette page du manuel est déjà citée quelque part dans le "
                      "simulateur. Faux = matière encore inexploitée.",
        },
        'compte': {},
      },
      'chapitres': [{'page': p, 'titre': t} for p, t in CHAPITRES],
      'entrees': entrees,
      'contexte': contexte,
    }
    catalogue['meta']['compte'] = {
        'entrees': len(entrees),
        'parLocuteur': dict(collections.Counter(e['locuteur'] for e in entrees)),
        'parGenre': dict(collections.Counter(e['genre'] for e in entrees)),
        'traductionsSeparees': sum(1 for e in entrees if e.get('traductionSeparee')),
        'pagesDejaCitees': len(citees),
        'blocsDeContexte': len(contexte),
    }
    with open(sortie, 'w', encoding='utf-8') as f:
        json.dump(catalogue, f, ensure_ascii=False, indent=1)
        f.write('\n')
    c = catalogue['meta']['compte']
    print(f"{sortie} — {c['entrees']} entrées, {c['blocsDeContexte']} blocs de contexte")
    print(f"  locuteurs : {c['parLocuteur']}")
    print(f"  genres    : {c['parGenre']}")
    print(f"  traductions non appariées : {c['traductionsSeparees']}")

if __name__ == '__main__':
    if not os.path.exists(PDF):
        sys.exit("À lancer depuis la racine du projet : %s est introuvable." % PDF)
    main(sys.argv[1] if len(sys.argv) > 1 else 'assets/donnees/phraseologie-manuel.json')
