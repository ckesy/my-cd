#!/usr/bin/env bash
# ============================================================
# 部署 AI 助手两个云函数
# 用法：bash scripts/deploy-ai.sh
# 前置：tcb login（浏览器授权，凭据有效期约 1 天）
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_ID="wuxian-token-d0guymjkpadcd1f22"

echo "==> 检查登录态"
if ! tcb fn list -e "$ENV_ID" >/dev/null 2>&1; then
  echo "✖ 未登录。请先执行：tcb login" >&2
  exit 1
fi

echo "==> 部署 ai-token"
tcb fn deploy ai-token --httpFn --path /ai-token --force -e "$ENV_ID"

echo "==> 部署 ai-gateway"
tcb fn deploy ai-gateway --httpFn --path /ai-gateway --force -e "$ENV_ID"

echo "==> 完成。验证地址（把 <env> 换成实际域名）："
echo "    https://<env>/ai-gateway"
echo
echo "⚠️ 别忘了在控制台给 ai-gateway 配环境变量 DEEPSEEK_API_KEY / AI_MODEL"
