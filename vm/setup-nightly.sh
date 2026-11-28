#!/bin/bash
# Sector Rotation: the nightly scan and the practice portfolio run by your own VM, without GitHub's job service.
# The VM's own clock starts the work every night. GitHub is then used only as the private folder the apps read their files from.
# It asks you for two things, typed or pasted here, stored only on this VM and readable only by you:
#   1. to add one "deploy key" to the repository sector-rotation-sync (so that this VM, and nothing else, can save files there);
#   2. your two eToro keys (the same ones the scan already uses).
# Nothing secret is in this file. Run it ON THE VM. To stop the nightly work later: crontab -l | grep -v sector-rotation-nightly | crontab -
#
# Version 8 (28 Nov 2026, Matteo: "self update yes"): the VM also looks after itself, every 30 minutes, every day (nightly.sh check,
# whose steps are in the private repository, vm/nightly-run.sh): it starts a night's work that did not start (once a night, before
# 05:30 UTC), keeps the night's line at 01:15 UTC when the clock changes hour (summer time), and applies a newer copy of THIS file
# by itself. Run that way (SR_AUTO=1, no terminal) it asks nothing: whatever would need a person stops it before anything is changed,
# the keys are never tested or removed, the practice choice is kept, the private repository is not touched, and the old wrapper and
# timetable stay as they were unless the new ones are complete. Raise INSTALLER_VERSION with every change, or the VMs will not take it.
# sector-rotation-installer
INSTALLER_VERSION=8
AUTO="${SR_AUTO:-}"
set -e
[ "$(uname -s)" = "Linux" ] || { echo "This must run on the VM (Linux), not on this computer."; exit 1; }
[ "$(id -u)" != "0" ] || { echo "Run it as your normal user, not as root."; exit 1; }
ask() { [ -z "$AUTO" ] || { echo "   (run by the VM itself) this step needs a person: stopping here, nothing has been changed"; exit 3; }
  printf '%s' "$1" > /dev/tty; if [ "$2" = "hidden" ]; then read -r -s REPLY < /dev/tty; echo > /dev/tty; else read -r REPLY < /dev/tty; fi; }
[ -z "$AUTO" ] || echo "== $(date -u +%FT%TZ) installer version $INSTALLER_VERSION, run by the VM itself"
[ -z "$AUTO" ] || command -v crontab > /dev/null || { echo "   the timer (crontab) is missing: stopping here, nothing has been changed"; exit 3; }
TEST_REPO="${SR_TEST_REPO:-}"   # the tests off the VM only: a local repository in place of GitHub
BASE="$HOME/sector-rotation"; CONF="$HOME/.config/sector-rotation"; mkdir -p "$BASE" "$CONF" "$HOME/scan-cache" "$HOME/.ssh"; chmod 700 "$CONF" "$HOME/.ssh"
for c in git curl tar xz ssh-keygen flock; do command -v $c > /dev/null || { [ -z "$AUTO" ] || { echo "   $c is missing: stopping here, nothing has been changed"; exit 3; }; echo "== Installing what is missing (git, curl, tar, xz)"; sudo apt-get update -qq && sudo apt-get install -y -qq git curl tar xz-utils openssh-client util-linux; break; }; done

echo "== 1 of 4: Node.js (the program's engine), in your own folder"
case "$(uname -m)" in aarch64|arm64) A=arm64;; x86_64) A=x64;; *) echo "Unknown machine type $(uname -m)"; exit 1;; esac
if [ ! -x "$BASE/node/bin/node" ]; then
  F=$(curl -fsSL https://nodejs.org/dist/latest-v20.x/SHASUMS256.txt | grep -o "node-v[0-9.]*-linux-$A.tar.xz" | head -n 1)
  [ -n "$F" ] || { echo "Could not find Node.js to download."; exit 1; }
  curl -fsSL "https://nodejs.org/dist/latest-v20.x/$F" -o /tmp/node.tar.xz; rm -rf "$BASE/node"; mkdir -p "$BASE/node"; tar -xJf /tmp/node.tar.xz -C "$BASE/node" --strip-components 1; rm /tmp/node.tar.xz
fi
echo "   $("$BASE/node/bin/node" --version)"

echo "== 2 of 4: the key that lets this VM save files in your private repository"
K="$HOME/.ssh/sector_rotation_deploy"; [ -f "$K" ] || [ -z "$AUTO" ] || { echo "   this VM's key for the repository is missing: stopping here, nothing has been changed"; exit 3; }
[ -f "$K" ] || ssh-keygen -q -t ed25519 -N '' -C 'sector-rotation VM' -f "$K"
export GIT_SSH_COMMAND="ssh -i $K -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
REPO="${TEST_REPO:-git@github.com:mdt996/sector-rotation-sync.git}"
if ! git ls-remote "$REPO" HEAD > /dev/null 2>&1; then
  echo; echo "   Open this page:  https://github.com/mdt996/sector-rotation-sync/settings/keys/new"
  echo "   Title: VM      Tick: Allow write access      Key: paste the line below, then press Add key"; echo; cat "$K.pub"; echo
  ask "   Press Enter here when the key is added... "
  git ls-remote "$REPO" HEAD > /dev/null 2>&1 || { echo "GitHub still refuses the key. Check that the whole line was pasted, then run this installer again."; exit 1; }
fi
echo "   the repository accepts this VM"
# run by the VM itself, the update comes from a step that runs inside $BASE/sync: that folder is left exactly as it is
if [ -n "$AUTO" ]; then [ -d "$BASE/sync/.git" ] || { echo "   the private repository is not on this VM: stopping here, nothing has been changed"; exit 3; }
elif [ -d "$BASE/sync/.git" ]; then git -C "$BASE/sync" fetch -q origin main && git -C "$BASE/sync" reset -q --hard origin/main; else git clone -q --depth 1 --branch main "$REPO" "$BASE/sync"; fi
git -C "$BASE/sync" config user.name "nightly-scan"; git -C "$BASE/sync" config user.email "nightly-scan@users.noreply.github.com"

echo "== 3 of 4: your two eToro keys (they are not shown, and stay in a file only you can read)"
if [ -n "$AUTO" ]; then   # the keys are kept as they are: never asked, never tested here (a refusal at a bad moment must not remove them)
  [ -s "$CONF/etoro.env" ] || { echo "   no eToro keys on this VM: stopping here, nothing has been changed"; exit 3; }
  echo "   the keys are kept; practice orders stay $( [ "$(cat "$CONF/practice" 2>/dev/null)" = on ] && echo ON || echo off )"
else
if [ ! -s "$CONF/etoro.env" ]; then
  ask "   Paste the eToro API key (the public one) and press Enter: " hidden; A1="$(printf '%s' "$REPLY" | tr -d '[:space:]')"; echo "      received ${#A1} characters"
  ask "   Paste the eToro user key (the private one) and press Enter: " hidden; A2="$(printf '%s' "$REPLY" | tr -d '[:space:]')"; echo "      received ${#A2} characters"
  [ -n "$A1" ] && [ -n "$A2" ] || { echo "A key is missing: nothing saved."; exit 1; }
  ( umask 077; printf 'export ETORO_API_KEY=%q\nexport ETORO_USER_KEY=%q\n' "$A1" "$A2" > "$CONF/etoro.env" ); unset A1 A2 REPLY
fi
. "$CONF/etoro.env"
C=$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $ETORO_API_KEY" -H "x-user-key: $ETORO_USER_KEY" -H "x-request-id: $(cat /proc/sys/kernel/random/uuid)" 'https://public-api.etoro.com/api/v1/market-data/instruments/rates?instrumentIds=1001')
if [ "$C" != "200" ]; then   # the usual slip: the two keys pasted in the other order
  C2=$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $ETORO_USER_KEY" -H "x-user-key: $ETORO_API_KEY" -H "x-request-id: $(cat /proc/sys/kernel/random/uuid)" 'https://public-api.etoro.com/api/v1/market-data/instruments/rates?instrumentIds=1001')
  if [ "$C2" = "200" ]; then ( umask 077; printf 'export ETORO_API_KEY=%q\nexport ETORO_USER_KEY=%q\n' "$ETORO_USER_KEY" "$ETORO_API_KEY" > "$CONF/etoro.env" ); . "$CONF/etoro.env"; echo "   the two keys were pasted in the other order: put right"; C=200; fi
fi
[ "$C" = "200" ] || { rm -f "$CONF/etoro.env"; echo "eToro refused these keys (answer $C): they were not kept. Run this installer again."; exit 1; }
echo "   eToro accepts the keys"
if [ "$(cat "$CONF/practice" 2>/dev/null)" = "on" ]; then REPLY=on; echo "   practice orders are already ON (to turn them off: rm $CONF/practice)"; else
ask "   Send the practice orders to the eToro DEMO account every night? Type on to allow it, or just press Enter for dry runs only: "; fi
if [ "$REPLY" = "on" ] || [ "$REPLY" = "ON" ] || [ "$REPLY" = "On" ]; then echo on > "$CONF/practice"; echo "   practice orders: ON (demo account only)"; else rm -f "$CONF/practice"; echo "   practice orders: off (dry runs)"; fi
fi

echo "== 4 of 4: the nightly timer"
# written beside the old one and moved over it only once complete: a script that is running is never rewritten in place
cat > "$BASE/nightly.sh.new" <<'RUN'
#!/bin/bash
# Started by the VM's own clock. It takes the lock, opens the log, loads the keys, brings the private repository up to date, and
# hands over to the steps kept there (vm/nightly-run.sh), so later improvements need no new installation.
#   nightly.sh = scan, then the practice portfolio.   nightly.sh orders = the practice portfolio only.   nightly.sh settle = stops and targets only.
#   nightly.sh tick = stops and targets, then the fast part (1-hour signals).   nightly.sh check = the VM looking after itself (version 8).
BASE="$HOME/sector-rotation"; CONF="$HOME/.config/sector-rotation"; export PATH="$BASE/node/bin:$PATH"
export GIT_SSH_COMMAND="ssh -i $HOME/.ssh/sector_rotation_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
# At 01:15 UTC the nightly run and a 5-minute look start in the same minute. Until 21 November 2026 whichever came second gave up at
# once, so a look that won the lock could cost the night its scan and its orders. Now the nightly run (no word) waits for the look to
# end, up to 10 minutes (a look takes seconds); a look, or any other run, still gives up at once when a run is going.
exec 9> "$CONF/lock"; if [ -z "$1" ]; then flock -w 600 9; else flock -n 9; fi || { echo "$(date -u +%FT%TZ) a run is already going: nothing started ($1)" >> "$BASE/nightly.log"; exit 0; }
[ "$(stat -c %s "$BASE/nightly.log" 2>/dev/null || echo 0)" -gt 3000000 ] && { tail -n 3000 "$BASE/nightly.log" > "$BASE/nightly.log.new"; mv "$BASE/nightly.log.new" "$BASE/nightly.log"; }   # the log is kept short
exec >> "$BASE/nightly.log" 2>&1; echo; echo "=== $(date -u +%FT%TZ) start ($1)"
. "$CONF/etoro.env"; cd "$BASE/sync" || exit 1
git checkout -q -f main 2>/dev/null; git fetch -q origin main && git reset -q --hard origin/main || { echo "the repository could not be read: stopping"; exit 1; }
exec bash vm/nightly-run.sh "$@"
RUN
chmod 700 "$BASE/nightly.sh.new"; bash -n "$BASE/nightly.sh.new" || { echo "The new wrapper is not complete: the old one is kept. Send this output to Claude."; exit 1; }
mv -f "$BASE/nightly.sh.new" "$BASE/nightly.sh"
at() { date -d "$1 UTC" +'%M %H'; }                       # a UTC time on this machine's own clock (so the night's line moves when the clock changes hour)
crontab -l > "$CONF/timetable.before" 2>/dev/null || : > "$CONF/timetable.before"   # kept, to put back if the new timetable is not complete
( grep -v sector-rotation-nightly "$CONF/timetable.before" || true      # "|| true": with no other line in the timetable grep reports a failure, which used to stop this step before our lines were written
  echo "$(at 01:15) * * 2-7 $BASE/nightly.sh # sector-rotation-nightly"
  echo "*/5 * * * 1-5 $BASE/nightly.sh tick # sector-rotation-nightly"
  echo "3,33 * * * * $BASE/nightly.sh check # sector-rotation-nightly" ) | crontab -
N=$(crontab -l 2>/dev/null | grep -c sector-rotation-nightly || true)
[ "$N" = "3" ] || { crontab "$CONF/timetable.before" 2>/dev/null; echo "The timetable was NOT written (found $N of 3 lines): the old one is back. Send this output to Claude."; exit 1; }
cp -f "$0" "$CONF/installer.sh" 2>/dev/null && chmod 600 "$CONF/installer.sh"; echo "$INSTALLER_VERSION" > "$CONF/installer-version"   # what the VM compares a newer copy with
echo "   the timetable now holds these three lines:"; crontab -l | grep sector-rotation-nightly | sed 's/^/     /'
echo "   timer service: $(systemctl is-active cron 2>/dev/null || systemctl is-active crond 2>/dev/null || echo unknown)"
echo "   every night at 01:15 UTC (scan and orders), Tuesday to Sunday"
echo "   and every 5 minutes, Monday to Friday: stops and targets are set on what has opened, and the fast part looks at the 1-hour signals"
echo "   and every 30 minutes, every day: the VM looks after itself (a night that did not start, summer time, a newer installer)"
[ -z "$AUTO" ] || { echo "== $(date -u +%FT%TZ) installer version $INSTALLER_VERSION applied by the VM itself"; exit 0; }
echo
echo "== Done. Nothing more is needed from GitHub's job service."
echo "== Running one look now, so you can see it work:"
"$BASE/nightly.sh" tick; tail -n 8 "$BASE/nightly.log"
