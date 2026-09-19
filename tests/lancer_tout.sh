#!/bin/sh
# =============================================================================
# AVIERO — LANCE TOUTE LA VÉRIFICATION
# -----------------------------------------------------------------------------
#   sh tests/lancer_tout.sh            tout, HORS la base
#   sh tests/lancer_tout.sh contrat    seulement la lecture du code (< 1 s)
#   sh tests/lancer_tout.sh migrations seulement le SQL, sur un PostgreSQL
#                                      jetable en memoire (hors ligne)
#   sh tests/lancer_tout.sh parcours   seulement le navigateur
#   sh tests/lancer_tout.sh base       le catalogue et les politiques, CONTRE LE
#                                      PROJET SUPABASE REEL (lecture seule)
#
# Les tests de contrat passent en premier, et volontairement : ils sont
# instantanés et disent la plupart des dégâts d'un découpage raté. Inutile
# d'attendre qu'un navigateur démarre pour apprendre qu'un symbole a disparu.
# =============================================================================
set -e
cd "$(dirname "$0")/.."

QUOI="${1:-tout}"
CODE=0

if [ "$QUOI" = "tout" ] || [ "$QUOI" = "contrat" ]; then
  echo ""
  echo "═══ CONTRAT — ce que le code doit encore contenir ═══"
  node --test "tests/contrat/*.test.mjs" || CODE=1
fi

# Les migrations, elles, SONT dans « tout » : PGlite est un PostgreSQL en
# memoire, rien ne sort de la machine. C'est le seul endroit ou l'on voit ce que
# les migrations valent sur une base VIDE — sur la production, tout est deja la,
# y compris ce qu'aucune migration ne cree.
if [ "$QUOI" = "tout" ] || [ "$QUOI" = "migrations" ]; then
  echo ""
  echo "═══ MIGRATIONS — un projet neuf monte-t-il a partir des seuls sql/ ? ═══"
  node tests/verifier-migrations.mjs || CODE=1
fi

# La verification de la base n'est PAS dans « tout », et c'est voulu : elle a
# besoin du reseau et interroge le projet de production. Les autres tests, eux,
# coupent Supabase expres — ils doivent rester reproductibles hors ligne.
if [ "$QUOI" = "base" ]; then
  echo ""
  echo "═══ BASE — le catalogue et les politiques du projet reel ═══"
  node tests/verifier-catalogue.mjs || CODE=1
fi

if [ "$QUOI" = "tout" ] || [ "$QUOI" = "parcours" ]; then
  echo ""
  echo "═══ PARCOURS — le site, dans un vrai navigateur ═══"
  if [ ! -d node_modules ]; then
    echo "  node_modules absent. Installer d'abord :"
    echo "    npm install && npx playwright install chromium"
    exit 1
  fi
  npx playwright test || CODE=1
fi

echo ""
if [ "$CODE" = "0" ]; then
  echo "Tout passe."
else
  echo "Au moins une vérification a échoué — voir plus haut."
  echo "Avant de « réparer » un test : lire ce qu'il dit. Il décrit une panne réelle."
fi
exit $CODE
