#!/usr/bin/env bash
# 本地或 Gitee/其他 CI：在仓库根目录执行 bash scripts/ci.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/ensure-node-gyp-deps.sh"
cd "$ROOT/ebu4-site"
echo "==> $(node -v) @ $(pwd)"
npm ci
npm test
