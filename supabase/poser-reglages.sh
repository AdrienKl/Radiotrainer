#!/bin/sh
# =============================================================================
# RadioTrainer — pose les trois réglages d'authentification par l'API Supabase
# -----------------------------------------------------------------------------
# À exécuter quand l'interface du tableau de bord ne montre pas le champ cherché
# — elle change souvent de nom et de place, l'API non.
#
# Ce qu'il pose, en une fois :
#   · le gabarit des DEUX e-mails qui peuvent porter le code — « Magic Link »
#     ET « Confirm signup ». Une adresse qui n'a jamais servi declenche une
#     INSCRIPTION, et Supabase envoie alors le second, pas le premier : ne
#     corriger que « Magic Link » ne change donc rien pour un compte neuf, ce
#     qui est justement le cas ou l'on a besoin du code ;
#   · le sujet des deux messages, pour qu'ils ne s'annoncent plus en anglais ;
#   · l'adresse du site et la liste des adresses de retour autorisées, sans
#     lesquelles le lien retombe sur http://localhost:3000.
#
# ┌─ LE JETON NE DOIT PAS ÊTRE ÉCRIT ICI ───────────────────────────────────┐
# │ Il donne un accès complet à vos projets — bien au-delà de ce site. Il se │
# │ passe par l'environnement, le temps d'une commande, et ne touche jamais  │
# │ le disque ni le dépôt :                                                  │
# │                                                                          │
# │   SUPABASE_ACCESS_TOKEN='sbp_…' sh supabase/poser-reglages.sh            │
# │                                                                          │
# │ Le jeton se crée sur https://supabase.com/dashboard/account/tokens       │
# │ (« Generate new token »). Révoquez-le après usage : il ne sert qu'ici.   │
# └──────────────────────────────────────────────────────────────────────────┘
# =============================================================================
set -eu

PROJET='vbziwjeuzcbvrbrihhrg'
SITE='https://adrienkl.github.io/Radiotrainer/'
RETOURS='https://adrienkl.github.io/Radiotrainer/**'
SUJET='Votre code RadioTrainer'
ICI=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
GABARIT="$ICI/gabarit-magic-link.html"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "SUPABASE_ACCESS_TOKEN n'est pas défini." >&2
  echo "  Créez-en un sur https://supabase.com/dashboard/account/tokens puis :" >&2
  echo "  SUPABASE_ACCESS_TOKEN='sbp_…' sh supabase/poser-reglages.sh" >&2
  exit 1
fi
[ -f "$GABARIT" ] || { echo "Gabarit introuvable : $GABARIT" >&2; exit 1; }

# Le gabarit est du HTML : il doit voyager comme une chaîne JSON échappée.
CORPS=$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1],encoding="utf-8").read()))' "$GABARIT")

echo "Projet        : $PROJET"
echo "Site URL      : $SITE"
echo "Redirect URLs : $RETOURS"
echo "Sujet         : $SUJET   (posé sur Magic Link ET Confirm signup)"
echo "Gabarit       : $(wc -c < "$GABARIT" | tr -d ' ') caractères, {{ .Token }} $(grep -c '{{ .Token }}' "$GABARIT") fois"
printf 'Écrire ces réglages dans le projet ? [o/N] '
read -r rep
case "$rep" in o|O|oui|OUI) ;; *) echo "Abandonné."; exit 0 ;; esac

REPONSE=$(curl -s -w '\n%{http_code}' -X PATCH \
  "https://api.supabase.com/v1/projects/$PROJET/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"site_url\": \"$SITE\",
    \"uri_allow_list\": \"$RETOURS\",
    \"mailer_subjects_magic_link\": \"$SUJET\",
    \"mailer_templates_magic_link_content\": $CORPS,
    \"mailer_subjects_confirmation\": \"$SUJET\",
    \"mailer_templates_confirmation_content\": $CORPS
  }")

CODE=$(printf '%s' "$REPONSE" | tail -1)
if [ "$CODE" = "200" ]; then
  echo "OK — réglages posés."
  echo "Les deux gabarits — Magic Link ET Confirm signup — portent maintenant"
  echo "le code. Essayez avec une adresse qui n'a jamais servi."
else
  echo "ÉCHEC (HTTP $CODE) :" >&2
  printf '%s\n' "$REPONSE" | sed '$d' >&2
  exit 1
fi
