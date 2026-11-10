#!/usr/bin/env bash
# Makes this machine a worker ("self-hosted runner") for the nightly scan of the private repository
# mdt996/sector-rotation-sync. Nothing secret is in this file or stored by it: GitHub hands the eToro keys to each
# job when it runs. You are asked once for a registration code, which GitHub shows on the page
# Settings > Actions > Runners > New self-hosted runner of that repository (valid for one hour).
set -euo pipefail
REPO_URL="https://github.com/mdt996/sector-rotation-sync"
if [ "$(uname -s)" != "Linux" ]; then echo "This machine runs $(uname -s): it is not the VM. Connect to the VM first (ssh ...), then run this line again there. Nothing was installed."; exit 1; fi
if [ "$(id -u)" = "0" ]; then echo "Run this as your normal user, not as root (the script uses sudo where it must)."; exit 1; fi
case "$(uname -m)" in x86_64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; *) echo "Unsupported processor: $(uname -m)"; exit 1 ;; esac
echo "== This machine: $(uname -m), $(nproc) processors, $(free -m | awk '/Mem:/{print $2}') MB of memory, $(df -BG --output=avail "$HOME" | tail -1 | tr -d ' ') free on disk"
if ! command -v git >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
  echo "== Installing git, curl and tar"
  if command -v apt-get >/dev/null 2>&1; then sudo apt-get update -y -q && sudo apt-get install -y -q git curl tar; else sudo dnf install -y -q git curl tar || sudo yum install -y -q git curl tar; fi
fi
DIR="$HOME/actions-runner"; mkdir -p "$DIR"; cd "$DIR"
if [ ! -x ./config.sh ]; then
  # the whole answer is read before it is searched: a reader that stops early makes curl report a write failure
  J="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest)"
  V="$(printf '%s\n' "$J" | sed -n -E 's/.*"tag_name": *"v([^"]+)".*/\1/p')"; V="${V%%[[:space:]]*}"
  [ -n "$V" ] || { echo "Could not read the runner's latest version from GitHub."; exit 1; }
  echo "== Downloading GitHub's runner $V for $ARCH"
  curl -fsSL -o runner.tar.gz "https://github.com/actions/runner/releases/download/v${V}/actions-runner-linux-${ARCH}-${V}.tar.gz"
  tar xzf runner.tar.gz && rm -f runner.tar.gz
  sudo ./bin/installdependencies.sh >/dev/null 2>&1 || echo "(the dependency helper reported a problem; continuing)"
fi
if [ -f .runner ]; then echo "== This machine is already registered as a runner."; else
  echo
  echo "Now open, in your browser:  ${REPO_URL}/settings/actions/runners/new"
  echo "and copy the code that follows --token in the 'Configure' box (about 29 capital letters and digits)."
  read -r -p "Paste the registration code here and press Enter: " TOKEN < /dev/tty
  ./config.sh --unattended --url "$REPO_URL" --token "$TOKEN" --name "oracle-vm" --labels vm --replace
  unset TOKEN
fi
if [ ! -f .service ]; then sudo ./svc.sh install "$USER" >/dev/null; fi
sudo ./svc.sh start >/dev/null 2>&1 || true
sleep 2
mkdir -p "$HOME/scan-cache"
echo
sudo ./svc.sh status 2>/dev/null | grep -m1 -E "Active:|active \(running\)" || true
echo "== Done. The runner starts by itself when the machine boots. You can close this terminal."
