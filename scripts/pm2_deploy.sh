#!/usr/bin/env bash
set -euo pipefail

# Simple PM2 deploy helper. Run from the server after cloning to the target directory.
# Usage: ./scripts/pm2_deploy.sh [branch]

BRANCH=${1:-main}
APP_DIR=/home/dethbird/journal.dethbird.com

echo "Deploying branch ${BRANCH} to ${APP_DIR}"

cd "${APP_DIR}"

# Ensure repo is present
if [ ! -d .git ]; then
  echo "Error: ${APP_DIR} does not look like a git repo. Clone your repo into ${APP_DIR} first." >&2
  exit 2
fi

git fetch origin
git checkout "${BRANCH}"
git pull origin "${BRANCH}"

echo "Installing dependencies (production)..."
npm ci --production

echo "Building UI"
npm run ui:build

echo "Starting/reloading PM2"
npx pm2 startOrReload ecosystem.config.dethbird.cjs --env production || npx pm2 start ecosystem.config.dethbird.cjs --env production

echo "Saving PM2 process list"
npx pm2 save

echo "Deployment complete. Check logs with: npx pm2 logs evidence-journal"
