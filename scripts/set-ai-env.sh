#!/usr/bin/env bash
# ============================================================
# 给 ai-gateway 配置环境变量（DeepSeek Key）
# ============================================================
# 用法：
#   1. 在项目根建 .env.ai.local（已被 .gitignore 的 *.local 忽略），内容一行：
#        DEEPSEEK_API_KEY=sk-xxxxxxxx
#   2. bash scripts/set-ai-env.sh
#
# 为什么不让 Key 直接贴进对话：对话记录会留存，Key 走本地文件更安全。
# 脚本只在临时文件里拼一次配置，跑完立即删除，不污染 cloudbaserc.json。
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_ID="wuxian-token-d0guymjkpadcd1f22"
FN="ai-gateway"
KEY_FILE=".env.ai.local"

if [ ! -f "$KEY_FILE" ]; then
  echo "✖ 没找到 $KEY_FILE" >&2
  echo "  请创建该文件，内容：DEEPSEEK_API_KEY=sk-xxxxxxxx" >&2
  exit 1
fi

KEY=$(grep -E '^DEEPSEEK_API_KEY=' "$KEY_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs || true)
if [ -z "${KEY:-}" ]; then
  echo "✖ $KEY_FILE 里没读到 DEEPSEEK_API_KEY" >&2
  exit 1
fi

case "$KEY" in
  sk-*) ;;
  *) echo "✖ Key 格式不像 DeepSeek 的（应以 sk- 开头），请核对" >&2; exit 1 ;;
esac

MODEL=$(grep -E '^AI_MODEL=' "$KEY_FILE" | head -1 | cut -d= -f2- | xargs || true)
MODEL=${MODEL:-deepseek-flash}

TMP=".cloudbaserc.tmp.$$.json"
trap 'rm -f "$TMP"' EXIT

node -e "
const fs=require('fs');
fs.writeFileSync('$TMP', JSON.stringify({
  envId: '$ENV_ID',
  functionRoot: './cloudfunctions',
  functions: [{
    name: '$FN',
    runtime: 'Nodejs18.15',
    timeout: 20,
    memorySize: 256,
    installDependency: false,
    handler: 'index.main',
    envVariables: {
      DEEPSEEK_API_KEY: process.argv[1],
      AI_MODEL: process.argv[2],
      AI_DAILY_QUOTA: '800',
      AI_HOURLY_QUOTA: '60'
    }
  }]
}, null, 2));
" "$KEY" "$MODEL"

echo "==> 推送配置到云函数 $FN（Key 长度 ${#KEY}）"
tcb config update fn "$FN" --config-file "$TMP" -e "$ENV_ID"

echo "==> 完成。验证："
echo "    curl -s -X POST https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com/ai-gateway \\"
echo "      -H 'Content-Type: application/json' -d '{\"sessionToken\":\"probe-1234567890\",\"text\":\"你好\"}'"
echo "    （返回「会话已失效」说明链路正常；返回「未配置 DEEPSEEK_API_KEY」说明配置没生效，可能需重新部署）"
