# shellcheck shell=bash
# 供 package-prod.sh / ci.sh / ensure-node-gyp-deps.sh 共用（需 bash source）
ensure_python_for_node_gyp() {
  if command -v python3 >/dev/null 2>&1; then
    echo "==> node-gyp: python3 已存在 ($(command -v python3))"
    return 0
  fi
  echo "==> node-gyp: 未检测到 python3，尝试安装 python3 make g++ …"
  if [ "$(id -u)" != "0" ]; then
    echo "ERROR: 无 python3 且非 root，无法 apt/yum 自动安装；请安装 python3 make g++ 后重试。" >&2
    return 1
  fi
  export DEBIAN_FRONTEND=noninteractive
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq python3 make g++
    echo "==> node-gyp: 已通过 apt 安装"
    return 0
  fi
  if command -v yum >/dev/null 2>&1; then
    yum install -y python3 make gcc-c++
    echo "==> node-gyp: 已通过 yum 安装"
    return 0
  fi
  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache python3 make g++
    echo "==> node-gyp: 已通过 apk 安装"
    return 0
  fi
  echo "ERROR: 无法自动安装 python3（无 apt/yum/apk）。" >&2
  return 1
}

warn_if_node_lt_20() {
  local major
  major=$(node -p "parseInt(process.versions.node,10)" 2>/dev/null || echo 0)
  if [ "${major}" -lt 20 ]; then
    echo "WARN: 当前 Node $(node -v)。better-sqlite3 12.x 对 Node 18 **无**官方预编译包，将走源码编译（依赖 Python）。请在 Gitee「Nodejs 构建」选用 **Node 20** 以避免编译。" >&2
  fi
}
