#!/bin/sh
# =============================================================================
# RadioTrainer — joue un fichier SQL sur le projet, par l'API Supabase
# -----------------------------------------------------------------------------
# Même convention que poser-reglages.sh : le jeton passe par l'environnement,
# jamais par le disque ni par le dépôt.
#
#   SUPABASE_ACCESS_TOKEN='sbp_…' sh supabase/poser-sql.sh sql/002-progression.sql
#
# Sans argument, il joue sql/002-progression.sql — la migration « la progression
# vit en base ».
#
# ┌─ LE JETON NE DOIT PAS ÊTRE ÉCRIT ICI ───────────────────────────────────┐
# │ Il donne un accès complet à vos projets, bien au-delà de ce site. Il se  │
# │ crée sur https://supabase.com/dashboard/account/tokens et se révoque     │
# │ après usage : il ne sert qu'à ça.                                        │
# └─────────────────────────────────────────────────────────────────────────┘
#
# ALTERNATIVE SANS JETON, et elle vaut exactement la même chose : ouvrir
# https://supabase.com/dashboard/project/vbziwjeuzcbvrbrihhrg/sql/new et y
# coller le fichier tel quel. Le script n'existe que pour éviter l'aller-retour.
# =============================================================================
set -eu

PROJET='vbziwjeuzcbvrbrihhrg'
ICI=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
FICHIER="${1:-$ICI/sql/002-progression.sql}"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "SUPABASE_ACCESS_TOKEN n'est pas défini." >&2
  echo "  Créez-en un sur https://supabase.com/dashboard/account/tokens puis :" >&2
  echo "  SUPABASE_ACCESS_TOKEN='sbp_…' sh supabase/poser-sql.sh" >&2
  echo "  (ou collez $FICHIER dans l'éditeur SQL du tableau de bord)" >&2
  exit 1
fi
[ -f "$FICHIER" ] || { echo "Fichier introuvable : $FICHIER" >&2; exit 1; }

echo "→ $FICHIER  vers le projet $PROJET"

# Le SQL voyage dans un champ JSON : il faut l'échapper. python3 est présent sur
# tout macOS récent et sur la plupart des Linux ; jq ne l'est pas toujours.
CORPS=$(python3 -c '
import json, sys
print(json.dumps({"query": open(sys.argv[1], encoding="utf-8").read()}))
' "$FICHIER")

REPONSE=$(printf '%s' "$CORPS" | curl -s -w '\n%{http_code}' \
  -X POST "https://api.supabase.com/v1/projects/$PROJET/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @-)

CODE=$(printf '%s' "$REPONSE" | tail -n1)
CORPS_R=$(printf '%s' "$REPONSE" | sed '$d')

if [ "$CODE" != "200" ] && [ "$CODE" != "201" ]; then
  echo "ÉCHEC (HTTP $CODE) :" >&2
  printf '%s\n' "$CORPS_R" >&2
  exit 1
fi

echo "OK. Ce que la base répond :"
printf '%s\n' "$CORPS_R" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print(sys.stdin.read()); raise SystemExit
for ligne in (d if isinstance(d, list) else [d]):
    if isinstance(ligne, dict):
        print("  " + " · ".join(str(v) for v in ligne.values()))
    else:
        print("  " + str(ligne))
'
