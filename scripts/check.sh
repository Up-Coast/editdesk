#!/bin/sh
# The gate: everything that must pass before a push. The pre-push hook runs
# this same script, so there is one implementation of every check.
set -e
cd "$(dirname "$0")/.."
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:browser
