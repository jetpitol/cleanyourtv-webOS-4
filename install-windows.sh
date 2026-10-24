#!/usr/bin/env bash
# Windows (Git Bash) wrapper around install.sh. It supplies what the macOS/Linux script assumes:
# a python3 command, Zig's .exe path and POSIX file modes inside the built packages.
# Usage: ./install-windows.sh <TV IPv4 address>                  launcher + Home Helper (install.sh)
#        ./install-windows.sh --launcher-only <TV IPv4 address>  launcher only, for TVs the helper does not support
#        ./install-windows.sh --webos4 <TV IPv4 address>         launcher + short-Home helper for webOS 4 (Node 0.12)
set -euo pipefail
cd "$(dirname "$0")"
case "$(uname -s)" in MINGW*|MSYS*) ;; *) echo 'Use ./install.sh on macOS/Linux.' >&2; exit 1 ;; esac
command -v py >/dev/null || { echo 'Install Python 3.9+ (with the py launcher) first.' >&2; exit 1; }

[[ -x .venv/Scripts/python.exe ]] || py -m venv .venv
venv_python="$PWD/.venv/Scripts/python.exe"
"$venv_python" -m pip install -q -r requirements.txt 'ziglang==0.14.1'
mkdir -p build/winbin

# install.sh recreates .venv with python3; on Windows the running interpreter is locked, so skip that call.
cat > build/winbin/python3 <<EOF
#!/usr/bin/env bash
[[ "\${1:-} \${2:-}" == '-m venv' ]] && exit 0
exec "$venv_python" -X utf8 "\$@"
EOF

# build.sh calls \$ARES_PACKAGE: package, then fix modes of the packages in the -o directory.
cat > build/winbin/ares-package <<EOF
#!/usr/bin/env bash
set -euo pipefail
"$PWD/build/tools/node_modules/.bin/ares-package" "\$@"
out=.; while [[ \$# -gt 0 ]]; do [[ "\$1" == -o ]] && out="\$2"; shift; done
"$venv_python" -X utf8 "$PWD/scripts/win-fix-modes.py" "\$out"/*.ipk
EOF
chmod +x build/winbin/python3 build/winbin/ares-package

export PATH="$PWD/build/winbin:$PATH"
export ZIG="$PWD/.venv/Lib/site-packages/ziglang/zig.exe"
export ARES_PACKAGE="$PWD/build/winbin/ares-package"
mode="${1:-}"
[[ "$mode" == --launcher-only || "$mode" == --webos4 ]] || exec ./install.sh "$@"

# Launcher only / webOS 4: the same pairing and app sync as install.sh; webOS 4 adds the short-Home helper.
shift
[[ $# -eq 1 ]] || { echo "Usage: ./install-windows.sh $mode <TV IPv4 address>" >&2; exit 1; }
export TV_HOST="$1"
python3 -c 'import ipaddress, os; ipaddress.IPv4Address(os.environ["TV_HOST"])' 2>/dev/null ||
  { echo 'Enter a valid TV IPv4 address, for example 192.168.1.50.' >&2; exit 1; }
export DEVICE="${DEVICE:-clean-your-tv-${TV_HOST//./-}}"
[[ -x build/tools/node_modules/.bin/ares-install ]] ||
  npm install --prefix build/tools --no-audit --no-fund '@webos-tools/cli@3.2.6'
export PATH="$PWD/build/tools/node_modules/.bin:$PATH"

printf '\nEnable Developer Mode and Key Server on the TV. Keep its screen open.\n'
# Never print --listfull: saved profiles may include passphrases.
profile=$(ares-setup-device --listfull | python3 -c '
import json, os, sys
matches=[d for d in json.load(sys.stdin) if d["name"]==os.environ["DEVICE"]]
if matches and matches[0].get("deviceinfo") != dict(ip=os.environ["TV_HOST"], port="9922", user="prisoner"):
    raise SystemExit("DEVICE has a different address or SSH configuration. Choose a different DEVICE name.")
print("existing" if matches else "new")')
if [[ "$profile" == new ]]; then
  info=$(python3 -c 'import json,os; print(json.dumps(dict(host=os.environ["TV_HOST"],port="9922",username="prisoner")))')
  ares-setup-device --add "$DEVICE" --info "$info" >/dev/null 2>&1 ||
    { echo 'Could not create the TV profile. Check webOS CLI configuration and permissions.' >&2; exit 1; }
fi
ssh_ok() { [[ "$(ares-novacom -d "$DEVICE" --run 'echo CYTV_SSH_OK' 2>/dev/null)" == *CYTV_SSH_OK* ]]; }
# ares-novacom --getkey races webOS 4's key server, which closes again within a minute or two:
# fetch the key whenever it is served, then let the CLI profile use it with the typed passphrase.
if ! ssh_ok; then
  key="$HOME/.ssh/${DEVICE}_webos"
  if ! grep -qs 'PRIVATE KEY' "$key"; then
    mkdir -p "$HOME/.ssh"
    printf 'Waiting for Key Server (toggle it off and on in the Developer Mode app)...\n'
    for _ in $(seq 1 150); do
      curl -sf -o "$key.tmp" --max-time 3 "http://$TV_HOST:9991/webos_rsa" && grep -q 'PRIVATE KEY' "$key.tmp" && break
      sleep 2
    done
    grep -qs 'PRIVATE KEY' "$key.tmp" || { rm -f "$key.tmp"; echo 'Key Server did not respond within 5 minutes.' >&2; exit 1; }
    mv -f "$key.tmp" "$key"; chmod 600 "$key"
  fi
  read -r -s -p 'Passphrase shown in the Developer Mode app: ' CYTV_PASSPHRASE; echo
  export CYTV_PASSPHRASE KEY_NAME="${DEVICE}_webos"
  info=$(python3 -c 'import json,os; print(json.dumps(dict(privatekey=os.environ["KEY_NAME"],passphrase=os.environ["CYTV_PASSPHRASE"],files="sftp")))')
  unset CYTV_PASSPHRASE
  # Output is discarded: the CLI prints saved profiles, passphrases included.
  ares-setup-device --modify "$DEVICE" --info "$info" >/dev/null 2>&1 ||
    { echo 'Could not save the key in the TV profile.' >&2; exit 1; }
  unset info
  if ! ssh_ok; then
    ares-novacom -d "$DEVICE" --run 'echo CYTV_SSH_OK' 2>&1 | tail -3 >&2
    echo 'SSH connection was not confirmed. Rerun to type the passphrase again; the downloaded key is kept.' >&2
    exit 1
  fi
fi

printf '\nAccept the remote-control pairing request on the TV if shown.\n'
python3 sync-apps.py "$TV_HOST"
python3 -c '
import json
from pathlib import Path
s=Path("launcher/apps.js").read_text()
if not json.loads(s[s.index("{"):].rstrip().rstrip(";"))["apps"]: raise SystemExit("No apps were synced. Check TV pairing and icon errors.")'

launcher=$(python3 -c 'import json; a=json.load(open("launcher/appinfo.json")); print("dist/"+a["id"]+"_"+a["version"]+"_all.ipk")')
rm -f "$launcher"
if [[ "$mode" == --launcher-only ]]; then
  "$ARES_PACKAGE" launcher renewal-service -o dist
  ares-install -d "$DEVICE" "$launcher"
  ares-launch -d "$DEVICE" com.gathin.tvhome
  printf '\nLauncher installed. Put "Home" first in the LG app bar or assign it to a Quick Access number key.\n'
else
  helper=$(python3 -c 'import json; a=json.load(open("native/app/appinfo.json")); print("dist/"+a["id"]+"_"+a["version"]+"_arm.ipk")')
  rm -f "$helper"
  NATIVE_OVERLAY=native/webos4 bash scripts/build.sh
  # webOS 4 stalls every app launch if the helper is launched while it runs. Removing the package
  # stops a running helper, so the single launch below always starts it fresh.
  ares-install -d "$DEVICE" --remove com.local.nativehome 2>/dev/null || true
  ares-install -d "$DEVICE" "$helper"
  ares-install -d "$DEVICE" "$launcher"
  ares-launch -d "$DEVICE" com.local.nativehome
  printf '\nLauncher and Home Helper installed. Short Home opens the launcher; hold Home 2 s for LG Home.\n'
  printf 'The helper starts again after each power-on; after an emergency stop use Resume Home in the launcher.\n'
fi
printf 'Keep Developer Mode active: LG can remove sideloaded apps when the session expires.\n'
