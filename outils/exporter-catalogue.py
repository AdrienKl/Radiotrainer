#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Albatros VFR — LE CATALOGUE, EN CSV ET EN MARKDOWN

    python3 outils/exporter-catalogue.py

Écrit à la racine du projet :
    Albatros-VFR-phraseologie-DSNA.csv   ~200 ko — un tableur, ou une analyse
    Albatros-VFR-phraseologie-DSNA.md    ~130 ko — lisible, groupé par section

À quoi ça sert : le JSON fait 638 ko et porte des champs internes. Pour lire,
trier, ou faire analyser le corpus par un autre outil, ces deux formats sont
plus commodes. Ils ne contiennent RIEN de plus que le JSON — ce sont deux vues.

Ces deux fichiers ne sont pas versionnés (.gitignore) : ils se refont en une
commande, et deux copies d'une même donnée finissent toujours par diverger.
Le JSON, lui, reste la source.
"""
import json, csv, io, os, sys

SOURCE = 'assets/donnees/phraseologie-manuel.json'
NOM = {'pilote': 'PILOTE', 'controleur': 'ATC', 'vehicule': 'VEHICULE', 'atis': 'ATIS'}

EN_TETE = """# Phraséologie DSNA — Manuel de phraséologie à l'usage de la CAG, 10e éd.

Source : DSNA, 10e édition à jour au 15 avril 2023, 281 pages.
{n} répliques. Le français et l'anglais sont les chaînes exactes du PDF,
jamais réécrites — les coquilles du manuel comprises.

Locuteurs : PILOTE, ATC (contrôleur), VEHICULE (agent sur l'aire de manœuvre).

Conventions du manuel :
- « F B X » se lit F-BX, épelé. I_L_S, V_F_R, Q_N_H s'épellent aussi (p. 9).
- [entre crochets] = mots facultatifs (p. 8).
- (entre parenthèses) = à compléter, ou variante possible (p. 8).
- Quand une réplique n'a qu'une langue, c'est que l'appariement français /
  anglais n'était pas certain : rien n'a été deviné.
"""

def main():
    if not os.path.exists(SOURCE):
        sys.exit("À lancer depuis la racine du projet : %s est introuvable." % SOURCE)
    cat = json.load(io.open(SOURCE, encoding='utf-8'))
    e = cat['entrees']

    # utf-8-sig : sans le BOM, Excel ouvre les accents de travers.
    with io.open('Albatros-VFR-phraseologie-DSNA.csv', 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['page', 'chapitre', 'section', 'sous_section', 'genre', 'locuteur',
                    'francais', 'anglais', 'traduction_non_appariee', 'deja_utilise'])
        for x in e:
            w.writerow([x['page'], x['chapitre'], x['section'] or '', x['sousSection'] or '',
                        x['genre'], x['locuteur'], x['fr'], x['en'],
                        'oui' if x.get('traductionSeparee') else '',
                        'oui' if x.get('dejaCite') else ''])

    lignes = [EN_TETE.format(n=len(e))]
    cle = None
    for x in e:
        k = (x['chapitre'], x['section'], x['sousSection'])
        if k != cle:
            cle = k
            lignes.append('\n## ' + ' — '.join(p for p in k if p) + '\n')
        t = '- **%s** (p.%d) : %s' % (NOM[x['locuteur']], x['page'], x['fr'] or '—')
        if x['en']: t += '  \n  *%s*' % x['en']
        lignes.append(t)
    io.open('Albatros-VFR-phraseologie-DSNA.md', 'w', encoding='utf-8').write('\n'.join(lignes) + '\n')

    for f in ('Albatros-VFR-phraseologie-DSNA.csv', 'Albatros-VFR-phraseologie-DSNA.md'):
        print('%-40s %6.0f ko' % (f, os.path.getsize(f) / 1024))

if __name__ == '__main__':
    main()
