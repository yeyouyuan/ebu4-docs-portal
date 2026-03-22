#!/usr/bin/env bash
# 生成可在线上直接解压运行的生产包（含 node_modules，已在当前 OS 上 npm ci --omit=dev）
# 在仓库根目录执行：bash scripts/package-prod.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$ROOT/ebu4-site"
cd "$SITE"

echo "==> $(node -v) · $(pwd)"
npm ci --omit=dev
npm test

mkdir -p "$ROOT/dist"
SHORT=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
SAFE=$(echo "$SHORT" | tr -cd 'a-zA-Z0-9._-')
OUT="$ROOT/dist/ebu4-site-prod-${SAFE}.tar.gz"

# 排除测试、日志、本地库文件；保留 data/.gitkeep 等空目录结构
tar -czf "$OUT" \
  --exclude='./.git' \
  --exclude='./node_modules/.cache' \
  --exclude='./server/test' \
  --exclude='./logs' \
  --exclude='./data/*.db' \
  --exclude='./data/*.db-shm' \
  --exclude='./data/*.db-wal' \
  -C "$SITE" .

echo "==> 已生成: $OUT ($(du -h "$OUT" | cut -f1))"
ls -la "$OUT"
