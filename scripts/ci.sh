#!/usr/bin/env bash
# 本地或 Gitee/其他 CI：在仓库根目录执行 bash scripts/ci.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
# shellcheck source=lib-ci-env.sh
source "$ROOT/scripts/lib-ci-env.sh"
warn_if_node_lt_20
ensure_python_for_node_gyp
cd "$ROOT/ebu4-site" || exit 1
echo "==> $(node -v) @ $(pwd)"
npm ci
npm test
