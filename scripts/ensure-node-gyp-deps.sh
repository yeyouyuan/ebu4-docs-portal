#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
# shellcheck source=lib-ci-env.sh
source "$ROOT/scripts/lib-ci-env.sh"
ensure_python_for_node_gyp
