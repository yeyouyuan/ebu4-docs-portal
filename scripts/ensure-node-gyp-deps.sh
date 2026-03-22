#!/usr/bin/env bash
# better-sqlite3 等原生模块在需源码编译时依赖 node-gyp → Python3 + make + C++ 编译器
# Gitee 等精简镜像常未预装 Python，需在 npm ci 之前执行本脚本（root + apt 时可自动安装）
set -euo pipefail

if command -v python3 >/dev/null 2>&1; then
  echo "==> node-gyp: python3 已存在 ($(command -v python3))"
  exit 0
fi

echo "==> node-gyp: 未检测到 python3，尝试安装构建依赖…"

if [ "$(id -u)" != "0" ]; then
  echo "ERROR: 当前无 python3，且非 root，无法自动 apt/yum 安装。" >&2
  echo "请在本机构建机执行: sudo apt-get update && sudo apt-get install -y python3 make g++" >&2
  echo "（或安装 node-gyp 文档要求的环境后再运行 npm ci）" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq python3 make g++
  echo "==> node-gyp: 已通过 apt 安装 python3 make g++"
  exit 0
fi

if command -v yum >/dev/null 2>&1; then
  yum install -y python3 make gcc-c++
  echo "==> node-gyp: 已通过 yum 安装依赖"
  exit 0
fi

if command -v apk >/dev/null 2>&1; then
  apk add --no-cache python3 make g++
  echo "==> node-gyp: 已通过 apk 安装依赖"
  exit 0
fi

echo "ERROR: 无法自动安装 python3（无 apt-get/yum/apk）。请先安装 python3、make、C++ 编译器。" >&2
exit 1
