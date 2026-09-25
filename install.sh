#!/usr/bin/env bash
# AiLabor Art Studio installer for macOS / Linux.
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Install Node.js LTS from https://nodejs.org first."; exit 1; }
npm install --no-fund --no-audit
echo "Done. Start the app with: npm start"
