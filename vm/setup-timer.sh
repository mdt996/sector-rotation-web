#!/bin/bash
# Sector Rotation: a nightly timer on your own VM, for when GitHub does not start the scheduled run.
# Every night (Tuesday to Sunday morning, 01:15 UTC) the VM asks GitHub to start "Full scan on the VM" as the nightly run.
# It needs one thing from you: a GitHub token limited to the repository sector-rotation-sync, with the single permission
# "Actions: Read and write". You paste it here; it is stored only on this VM, readable only by you. No eToro key is involved.
# Nothing secret is in this file. Run it ON THE VM. To remove the timer later: crontab -l | grep -v sector-rotation-nightly | crontab -
set -e
[ "$(uname -s)" = "Linux" ] || { echo "This must run on the VM (Linux), not on this computer."; exit 1; }
[ "$(id -u)" != "0" ] || { echo "Run it as your normal user, not as root."; exit 1; }
DIR="$HOME/.config/sector-rotation"; mkdir -p "$DIR"; chmod 700 "$DIR"
printf 'Paste the GitHub token (it will not be shown) and press Enter: ' > /dev/tty
read -r -s TOKEN < /dev/tty; echo > /dev/tty
[ -n "$TOKEN" ] || { echo "No token given: nothing changed."; exit 1; }
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" -H 'Accept: application/vnd.github+json' https://api.github.com/repos/mdt996/sector-rotation-sync/actions/workflows/scan-vm.yml)
[ "$CODE" = "200" ] || { echo "GitHub refused this token for the repository (answer $CODE): nothing changed. It needs: repository sector-rotation-sync, permission Actions: Read and write."; exit 1; }
( umask 077; printf '%s' "$TOKEN" > "$DIR/token" )
cat > "$DIR/nightly.sh" <<'RUN'
#!/bin/bash
# Started by cron. Asks GitHub to start tonight's run, unless GitHub already started one in the last 3 hours.
DIR="$HOME/.config/sector-rotation"; T=$(cat "$DIR/token"); API=https://api.github.com/repos/mdt996/sector-rotation-sync/actions/workflows/scan-vm.yml
H=(-H "Authorization: Bearer $T" -H 'Accept: application/vnd.github+json')
SINCE=$(date -u -d '3 hours ago' +%Y-%m-%dT%H:%M:%SZ)
N=$(curl -s "${H[@]}" "$API/runs?per_page=5&created=%3E$SINCE" | grep -c '"run_number"' || true)
if [ "${N:-0}" -gt 0 ]; then echo "$(date -u +%FT%TZ) a run exists already: nothing to do" >> "$DIR/nightly.log"; exit 0; fi
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${H[@]}" "$API/dispatches" -d '{"ref":"main","inputs":{"nightly":"yes","rate":"100","limit":"12000"}}')
echo "$(date -u +%FT%TZ) asked GitHub to start the nightly run: answer $C" >> "$DIR/nightly.log"
RUN
chmod 700 "$DIR/nightly.sh"
( crontab -l 2>/dev/null | grep -v sector-rotation-nightly; echo "CRON_TZ=UTC"; echo "20 1 * * 2-7 $DIR/nightly.sh # sector-rotation-nightly" ) | awk '!seen[$0]++' | crontab -
echo "== Done. The VM will start the nightly run at 01:20 UTC, Tuesday to Sunday, when GitHub has not."
echo "== To start tonight's run right now (it reuses the scan already made and sends the practice orders once): $DIR/nightly.sh"
