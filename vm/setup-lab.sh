#!/bin/bash
# Sector Rotation: the paper labs on your VM. Three paper portfolios of $2,000 (crypto at Revolut X prices, eToro's leveraged markets,
# gold only) that trade in and out on 1- and 5-minute bars, all day, ON PAPER ONLY: the program reads prices and never sends an order
# to eToro or Revolut X. It runs for free on the same VM, next to the nightly work, and keeps running after a restart of the VM.
# It asks nothing: it uses what the nightly installer (setup-nightly.sh) already set up (Node.js, the GitHub key, the eToro keys).
# Nothing secret is in this file. Run it ON THE VM, as your normal user.
#   To pause the labs:   touch ~/.config/sector-rotation/lab-off; pkill -f lab/lab.js
#   To start them again: rm ~/.config/sector-rotation/lab-off
set -e
[ "$(uname -s)" = "Linux" ] || { echo "This must run on the VM (Linux), not on this computer."; exit 1; }
[ "$(id -u)" != "0" ] || { echo "Run it as your normal user, not as root."; exit 1; }
BASE="$HOME/sector-rotation"; CONF="$HOME/.config/sector-rotation"; K="$HOME/.ssh/sector_rotation_deploy"
[ -x "$BASE/node/bin/node" ] && [ -f "$K" ] && [ -s "$CONF/etoro.env" ] && [ -d "$BASE/sync/.git" ] || { echo "The nightly installer has not been run on this VM yet (Node.js, keys or repository missing). Run setup-nightly.sh first."; exit 1; }
export PATH="$BASE/node/bin:$PATH"
export GIT_SSH_COMMAND="ssh -i $K -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

echo "== 1 of 3: the lab's own copy of the repository"
REPO=$(git -C "$BASE/sync" remote get-url origin)
if [ -d "$BASE/lab/.git" ]; then git -C "$BASE/lab" fetch -q --depth 1 origin main && git -C "$BASE/lab" reset -q --hard FETCH_HEAD; else git clone -q --depth 1 --branch main "$REPO" "$BASE/lab"; fi
[ -f "$BASE/lab/lab/lab.js" ] || { echo "The lab is not in the repository yet. Tell Claude."; exit 1; }
echo "   $BASE/lab ($(git -C "$BASE/lab" log -1 --format=%h))"
WSMOD=""
if ! node -e "process.exit(typeof WebSocket === 'function' ? 0 : 1)" 2>/dev/null && ! node --experimental-websocket -e "process.exit(typeof WebSocket === 'function' ? 0 : 1)" 2>/dev/null; then
  echo "   this Node.js has no WebSocket: adding the small 'ws' package for eToro's price stream"
  mkdir -p "$BASE/lab-node"; (cd "$BASE/lab-node" && npm i --silent --no-audit --no-fund ws@8 > /dev/null 2>&1) || echo "   (could not add it: the lab will read eToro's prices every 5 seconds instead)"
fi
[ -d "$BASE/lab-node/node_modules/ws" ] && WSMOD="$BASE/lab-node/node_modules/ws"

echo "== 2 of 3: the starter, and the VM's clock"
cat > "$BASE/lab.sh" <<RUN
#!/bin/bash
# The paper labs (written by setup-lab.sh). The VM's clock starts this every 5 minutes and after a restart; when the lab is already
# running it does nothing. It holds the lab's lock, opens its log, loads the eToro keys (prices only: the lab sends no order), brings
# the lab's copy of the repository up to date and hands over to lab/run.sh kept there, so later improvements need no new installation.
BASE="\$HOME/sector-rotation"; CONF="\$HOME/.config/sector-rotation"; export PATH="\$BASE/node/bin:\$PATH"
export GIT_SSH_COMMAND="ssh -i \$HOME/.ssh/sector_rotation_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
[ -e "\$CONF/lab-off" ] && exit 0
exec 8> "\$CONF/lab.lock"; flock -n 8 || exit 0
[ "\$(stat -c %s "\$BASE/lab.log" 2>/dev/null || echo 0)" -gt 3000000 ] && { tail -n 3000 "\$BASE/lab.log" > "\$BASE/lab.log.new"; mv "\$BASE/lab.log.new" "\$BASE/lab.log"; }
exec >> "\$BASE/lab.log" 2>&1; echo; echo "=== \$(date -u +%FT%TZ) lab start"
. "\$CONF/etoro.env"; export LAB_DIR="\$BASE/lab-data"; [ -n "$WSMOD" ] && export WS_MOD="$WSMOD"
cd "\$BASE/lab" || exit 1
git fetch -q --depth 1 origin main && git reset -q --hard FETCH_HEAD || echo "the repository could not be read: the copy already here is used"
exec bash lab/run.sh
RUN
chmod 700 "$BASE/lab.sh"
( crontab -l 2>/dev/null | grep -v sector-rotation-lab || true
  echo "*/5 * * * * $BASE/lab.sh # sector-rotation-lab"
  echo "@reboot sleep 90; $BASE/lab.sh # sector-rotation-lab" ) | crontab -
N=$(crontab -l 2>/dev/null | grep -c sector-rotation-lab || true); M=$(crontab -l 2>/dev/null | grep -c sector-rotation-nightly || true)
[ "$N" = "2" ] || { echo "The timetable was NOT written (found $N of 2 lines). Send this output to Claude."; exit 1; }
echo "   the timetable: the labs' 2 lines added, the nightly work's $M lines kept"

echo "== 3 of 3: starting the labs now"
rm -f "$CONF/lab-off"
nohup "$BASE/lab.sh" > /dev/null 2>&1 &
echo "   waiting one minute for the first prices..."; sleep 70
if pgrep -f "lab/lab.js" > /dev/null; then echo "   the labs are running"; else echo "   the labs are NOT running: send the lines below to Claude"; fi
tail -n 12 "$BASE/lab.log" | sed 's/^/     /'
echo
echo "== Done. Results appear in the app (Trading, Labs) within 10 minutes. Paper only: no order is ever sent."
