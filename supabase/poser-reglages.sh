#!/bin/sh
# =============================================================================
# RadioTrainer — pose les trois réglages d'authentification par l'API Supabase
# -----------------------------------------------------------------------------
# À exécuter quand l'interface du tableau de bord ne montre pas le champ cherché
# — elle change souvent de nom et de place, l'API non.
#
# Ce qu'il pose, en une fois :
#   · le gabarit des TROIS e-mails — « Magic Link » et « Confirm signup » qui
#     portent le code de connexion, « Reset Password » qui porte celui de
#     récupération de compte
#     ET « Confirm signup ». Une adresse qui n'a jamais servi declenche une
#     INSCRIPTION, et Supabase envoie alors le second, pas le premier : ne
#     corriger que « Magic Link » ne change donc rien pour un compte neuf, ce
#     qui est justement le cas ou l'on a besoin du code ;
#   · le sujet des deux messages, pour qu'ils ne s'annoncent plus en anglais ;
#   · l'adresse du site et la liste des adresses de retour autorisées, sans
#     lesquelles le lien retombe sur http://localhost:3000.
#
# Il RELIT ensuite le projet et dit ce qui s'y trouve vraiment. C'est le seul
# moyen de trancher « je ne reçois toujours pas de code » : le tableau de bord
# montre ce que l'on croit avoir enregistré, l'API montre ce qui partira.
#
#   sh supabase/poser-reglages.sh --verifier   ← relit SANS rien écrire
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
SUJET='AVIERO — votre code de connexion'
SUJET_RECUP='AVIERO — récupération de votre compte'
ICI=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
GABARIT="$ICI/gabarit-magic-link.html"
GABARIT_RECUP="$ICI/gabarit-recuperation.html"

# ┌─ LES URL NE PARTENT QUE SI ON LE DEMANDE ------------------------------┐
# │ Ce script posait les gabarits ET le Site URL / la liste blanche d'un   │
# │ même bloc. Or CLAUDE.md § 9.1 gèle toute configuration de production   │
# │ liée au domaine tant qu'il n'est pas acheté — et le jour où il le      │
# │ sera, l'ORDRE des opérations comptera.                                 │
# │ Travailler sur les e-mails ne doit pas entraîner les URL avec soi :    │
# │ par défaut ce script ne touche QUE les gabarits et les sujets.         │
# │   sh poser-reglages.sh            les e-mails seuls                    │
# │   sh poser-reglages.sh --urls     les e-mails ET les URL               │
# └────────────────────────────────────────────────────────────────────────┘
AVEC_URLS='non'
for a in "$@"; do [ "$a" = "--urls" ] && AVEC_URLS='oui'; done

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "SUPABASE_ACCESS_TOKEN n'est pas défini." >&2
  echo "  Créez-en un sur https://supabase.com/dashboard/account/tokens puis :" >&2
  echo "  SUPABASE_ACCESS_TOKEN='sbp_…' sh supabase/poser-reglages.sh" >&2
  exit 1
fi
[ -f "$GABARIT" ]       || { echo "Gabarit introuvable : $GABARIT" >&2; exit 1; }
[ -f "$GABARIT_RECUP" ] || { echo "Gabarit introuvable : $GABARIT_RECUP" >&2; exit 1; }

# Le gabarit est du HTML : il doit voyager comme une chaîne JSON échappée.
CORPS=$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1],encoding="utf-8").read()))' "$GABARIT")
CORPS_RECUP=$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1],encoding="utf-8").read()))' "$GABARIT_RECUP")

# -----------------------------------------------------------------------------
# Relire le projet et dire ce qui s'y trouve.
#
# Un gabarit VIDE n'est pas un gabarit neutre : Supabase retombe alors sur le
# sien, celui d'usine, qui ne contient que {{ .ConfirmationURL }} — donc un
# message SANS code. « Vide » et « sans code » sont ici la même panne, et c'est
# pourquoi les deux sont signalés de la même façon.
# -----------------------------------------------------------------------------
relire() {
  REP=$(curl -s -w '\n%{http_code}' \
    "https://api.supabase.com/v1/projects/$PROJET/config/auth" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")
  C=$(printf '%s' "$REP" | tail -1)
  if [ "$C" != "200" ]; then
    echo "Relecture impossible (HTTP $C) :" >&2
    printf '%s\n' "$REP" | sed '$d' >&2
    return 1
  fi
  # Par un fichier, et non par un tube : l'analyse ci-dessous arrive elle-même
  # par l'entrée standard (document en ligne), les deux ne peuvent pas y tenir
  # ensemble. Le fichier est en clair mais ne contient aucun secret — ce sont
  # les réglages publics du projet, pas le jeton — et il part à la sortie.
  TMP=$(mktemp -t rt-auth-config)
  trap 'rm -f "$TMP"' EXIT INT TERM
  printf '%s\n' "$REP" | sed '$d' > "$TMP"
  python3 - "$TMP" <<'FIN_PYTHON'
import json, sys
c = json.load(open(sys.argv[1], encoding="utf-8"))

def etat(cle, nom):
    corps = c.get(cle) or ""
    if not corps.strip():
        print("  %-17s VIDE - Supabase emploie son gabarit d'usine, SANS code." % nom)
    elif "{{ .Token }}" in corps:
        print("  %-17s porte {{ .Token }} : le code partira. (%d caracteres)" % (nom, len(corps)))
    else:
        print("  %-17s %d caracteres, mais AUCUN {{ .Token }} : message sans code." % (nom, len(corps)))

print("Ce que le projet enverra vraiment :")
etat("mailer_templates_confirmation_content", "Confirm signup")
etat("mailer_templates_magic_link_content",   "Magic Link")
etat("mailer_templates_recovery_content",     "Reset Password")
print("  %-17s %s" % ("Sujet signup",   c.get("mailer_subjects_confirmation") or "(defaut)"))
print("  %-17s %s" % ("Sujet magique",  c.get("mailer_subjects_magic_link")   or "(defaut)"))
print("  %-17s %s" % ("Sujet recup",    c.get("mailer_subjects_recovery")     or "(defaut)"))
print("  %-17s %s" % ("Site URL",       c.get("site_url")       or "(vide)"))
print("  %-17s %s" % ("Redirect URLs",  c.get("uri_allow_list") or "(vide)"))

exp = c.get("mailer_otp_exp")
if exp:
    print("  %-17s %d s (%d min)" % ("Validite du code", exp, exp // 60))

# Deux reglages qui suppriment l'e-mail au lieu de le vider. Les taire, ce
# serait laisser chercher un gabarit fautif alors qu'aucun message n'est parti.
if c.get("mailer_autoconfirm"):
    print()
    print("  ATTENTION : « Confirm email » est DESACTIVE (mailer_autoconfirm).")
    print("              Le compte s'ouvre sans verification : aucun e-mail,")
    print("              donc aucun code, quel que soit le gabarit.")
if c.get("external_email_enabled") is False:
    print()
    print("  ATTENTION : la connexion par e-mail est desactivee sur ce projet.")
FIN_PYTHON
  rm -f "$TMP"; trap - EXIT INT TERM
}

if [ "${1:-}" = "--verifier" ] || [ "${1:-}" = "-v" ]; then
  echo "Projet : $PROJET   (lecture seule, rien ne sera écrit)"
  echo
  relire
  exit $?
fi

echo "Projet        : $PROJET"
if [ "$AVEC_URLS" = "oui" ]; then
  echo "Site URL      : $SITE"
  echo "Redirect URLs : $RETOURS"
else
  echo "Site URL      : NON TOUCHÉ (CLAUDE.md § 9.1). Ajouter --urls pour les poser."
fi
echo "Sujet code    : $SUJET   (posé sur Magic Link ET Confirm signup)"
echo "Sujet récup   : $SUJET_RECUP   (posé sur Reset Password)"
echo "Gabarit code  : $(wc -c < "$GABARIT" | tr -d ' ') caractères, {{ .Token }} $(grep -c '{{ .Token }}' "$GABARIT") fois"
echo "Gabarit récup : $(wc -c < "$GABARIT_RECUP" | tr -d ' ') caractères, {{ .Token }} $(grep -c '{{ .Token }}' "$GABARIT_RECUP") fois"
printf 'Écrire ces réglages dans le projet ? [o/N] '
read -r rep
case "$rep" in o|O|oui|OUI) ;; *) echo "Abandonné."; exit 0 ;; esac

if [ "$AVEC_URLS" = "oui" ]; then
  URLS_JSON="\"site_url\": \"$SITE\", \"uri_allow_list\": \"$RETOURS\","
else
  URLS_JSON=''
fi

REPONSE=$(curl -s -w '\n%{http_code}' -X PATCH \
  "https://api.supabase.com/v1/projects/$PROJET/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    $URLS_JSON
    \"mailer_subjects_magic_link\": \"$SUJET\",
    \"mailer_templates_magic_link_content\": $CORPS,
    \"mailer_subjects_confirmation\": \"$SUJET\",
    \"mailer_templates_confirmation_content\": $CORPS,
    \"mailer_subjects_recovery\": \"$SUJET_RECUP\",
    \"mailer_templates_recovery_content\": $CORPS_RECUP
  }")

CODE=$(printf '%s' "$REPONSE" | tail -1)
if [ "$CODE" = "200" ]; then
  echo "OK — réglages envoyés. Relecture du projet :"
  echo
  relire || true
  echo
  echo "Essayez maintenant avec une adresse qui n'a JAMAIS servi : c'est le seul"
  echo "cas qui déclenche « Confirm signup », et c'était celui qui restait muet."
else
  echo "ÉCHEC (HTTP $CODE) :" >&2
  printf '%s\n' "$REPONSE" | sed '$d' >&2
  exit 1
fi
