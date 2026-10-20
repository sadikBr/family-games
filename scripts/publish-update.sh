#!/usr/bin/env bash
# Publish an over-the-air update of the app from Linux or macOS (EAS Update, channel "preview"): the
# phones download it the next time the app is opened, no new APK needed. The same as
# scripts\publish-update-windows.cmd on Windows.
#
#   bun run publish:update                    (message: the date and the commit id)
#   bun run publish:update -- "Ronda fix"     (your own message)
#
# A NEW APK is still needed when the native side changes (a native package, app.json plugins /
# permissions / icons, eas.json). The update only reaches APKs with the same runtime version: the
# script prints it, compare its first 6 characters with the ones on the app's profile screen.
set -uo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mERROR: %s\033[0m\n' "$1"; exit 1; }

command -v bun >/dev/null || fail 'Install Bun first: https://bun.sh'
command -v node >/dev/null || fail 'Install Node.js first (the Expo tools need it).'

step 'Installing JavaScript dependencies'
bun install || fail 'bun install failed.'

step 'Checking the Expo account'
if ! bunx eas-cli whoami >/dev/null 2>&1; then
  echo 'Sign in to the Expo account the app belongs to (once on this computer):'
  bunx eas-cli login || fail 'Expo sign-in failed.'
fi

# the same settings as the APK: the deployed server's address
if [ -z "${EXPO_PUBLIC_SERVER_URL:-}" ]; then
  EXPO_PUBLIC_SERVER_URL=$(node -e "console.log(require('./eas.json').build.preview.env.EXPO_PUBLIC_SERVER_URL)")
  export EXPO_PUBLIC_SERVER_URL
fi
export NODE_ENV=production
echo "Server: $EXPO_PUBLIC_SERVER_URL"

# Will the update reach the phones? Only APKs with the same runtime version take it.
step 'Checking the runtime version'
runtime=$(bunx expo-updates runtimeversion:resolve --platform android --workflow managed 2>/dev/null | grep -o '"runtimeVersion":"[^"]*"' | head -n1 | cut -d'"' -f4)
echo "This update:    ${runtime:-unknown} (the app's profile screen shows the first 6 characters of its own)"
if [ -f .apk-runtime ]; then
  apk=$(tr -d '[:space:]' < .apk-runtime)
  echo "Last APK built: $apk"
  if [ -n "$runtime" ] && [ "$runtime" != "$apk" ]; then
    printf '\n\033[31mWARNING: the runtime versions differ, so phones with that APK will NOT get this update.\033[0m\n'
    printf '\033[31mSomething native changed since that APK was built: build and install a new one first.\033[0m\n'
    read -r -p 'Publish anyway? (y/N) ' answer
    [[ "$answer" =~ ^[yY] ]] || fail 'Cancelled.'
  fi
fi

message="${1:-}"
if [ -z "$message" ]; then
  message="update-$(date +%Y-%m-%d-%H%M)-$(git rev-parse --short HEAD 2>/dev/null)"
fi

step "Publishing the update ($message)"
bunx eas-cli update --channel preview --platform android --environment preview --message "$message" --non-interactive ||
  fail 'eas update failed (see the messages above).'

printf '\n\033[32mDone. The phones get it the next time the app is opened (a banner on the home screen offers to restart right away).\033[0m\n'
