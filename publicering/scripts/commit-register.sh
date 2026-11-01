#!/usr/bin/env bash
# Committer én fil til grenen og haandterer, at en anden koersel kan have
# pushet i mellemtiden.
#
# HVORFOR DEN FINDES
# Fem publiceringsworkflows skriver i samme fil, publicering/register.json:
# planlaeg-alle, publicer-social, instagram, linkedin og google. De koerer paa
# hver sit kvarter, men et job tager minutter, saa to registreringer kan ligge
# oven i hinanden. Gjorde de det, afviste GitHub den sidste med
# non-fast-forward, og et bart «git push» fejlede jobbet OG tabte posten:
# opslaget ER gaaet ud, men staar ikke i registret. Naeste planlagte koersel
# ser et element uden registerpost og publicerer det igen.
#
# Det er den eneste vej til et dobbeltopslag, der var tilbage i motoren.
#
# HVAD DEN GOER I STEDET
# Bliver pushet afvist, hentes grenen, filen bringes tilbage til det, der nu
# staar paa grenen, og vores aendring laegges oven paa den. For registret sker
# det ved at koere registreringen igen — den foejer sine egne raekker til det
# register, den finder, og de andres raekker bliver staaende. Derfor en
# genskrivningskommando frem for en rebase: to tilfoejelser til samme
# JSON-liste konflikter altid tekstligt, men aldrig indholdsmaessigt.
#
# Gives ingen kommando, er filen en fuld tilstand (fx et tokens udloebsdato),
# og da er vores version den rigtige. Saa gemmes den og laegges tilbage.
#
#   commit-register.sh <fil> <commit-besked> [genskrivningskommando]
set -euo pipefail

FIL="${1:?fil mangler}"
BESKED="${2:?commit-besked mangler}"
GENSKRIV="${3:-}"
FORSOEG_MAKS=5

GREN="$(git rev-parse --abbrev-ref HEAD)"
[ "$GREN" = "HEAD" ] && { echo "Loesrevet HEAD — ved ikke hvilken gren der skal pushes til." >&2; exit 1; }

if [ -z "$(git status --porcelain -- "$FIL")" ]; then
  echo "Ingen aendring i $FIL — intet at committe."
  exit 0
fi

GEMT="$(mktemp)"
cp -- "$FIL" "$GEMT"
trap 'rm -f -- "$GEMT"' EXIT

git add -- "$FIL"
git commit -q -m "$BESKED"

for forsoeg in $(seq 1 "$FORSOEG_MAKS"); do
  if git push origin "HEAD:$GREN"; then
    echo "$FIL pushet (forsoeg $forsoeg)."
    exit 0
  fi

  echo "Push afvist i forsoeg $forsoeg. En anden koersel har skrevet i mellemtiden."
  if [ "$forsoeg" -eq "$FORSOEG_MAKS" ]; then break
  fi

  git fetch origin "$GREN"
  # Vores commit kastes vaek, ikke vores indhold: det laegges oven paa det,
  # der nu staar paa grenen.
  git reset -q --hard "origin/$GREN"

  if [ -n "$GENSKRIV" ]; then
    echo "Genskriver $FIL oven paa grenens udgave: $GENSKRIV"
    # Fejler genskrivningen, er der intet at pushe, og vi maa ikke gaette.
    if ! eval "$GENSKRIV"; then
      echo "Genskrivningen fejlede. Intet pushet." >&2
      exit 1
    fi
  else
    echo "Laegger vores udgave af $FIL tilbage."
    cp -- "$GEMT" "$FIL"
  fi

  if [ -z "$(git status --porcelain -- "$FIL")" ]; then
    echo "Grenens udgave indeholder allerede vores aendring — intet at committe."
    exit 0
  fi
  git add -- "$FIL"
  git commit -q -m "$BESKED"
  sleep $(( forsoeg * 2 ))
done

echo "Kunne ikke pushe $FIL efter $FORSOEG_MAKS forsoeg." >&2
exit 1
