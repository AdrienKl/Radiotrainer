#!/bin/sh
# =============================================================================
# AVIERO — LANCE TOUTE LA VÉRIFICATION
# -----------------------------------------------------------------------------
#   sh tests/lancer_tout.sh          tout
#   sh tests/lancer_tout.sh contrat  seulement la lecture du code (< 1 s)
#   sh tests/lancer_tout.sh parcours seulement le navigateur
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
