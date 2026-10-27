#!/bin/bash
# 修复 GitHub 443 超时：为 github.com 自动挑选一个当前可达 IP 并写入 /etc/hosts
#
# 用法（需要管理员密码）：
#   sudo bash scripts/fix-github-ip.sh
#
# 背景：国内 DNS 常把 github.com 解析到 20.205.243.166（不通），而
# 140.82.x.x / 20.200.245.247 往往仍可达，钉一个通的 IP 即可恢复 HTTPS 推送。
# 每个 IP 过期后重跑本脚本即可；原 hosts 会备份为 /etc/hosts.bak.<时间戳>。

set -u

IPS="140.82.112.3 140.82.113.3 140.82.121.4 20.200.245.247 140.82.116.3"
GOOD=""

echo "==> 探测可达 IP ..."
for ip in $IPS; do
  code=$(curl --noproxy '*' -s -o /dev/null -m 5 -w '%{http_code}' --resolve github.com:443:$ip https://github.com/ 2>/dev/null)
  printf '    %-16s %s\n' "$ip" "${code:-超时}"
  if [ -z "$GOOD" ] && [ "$code" = "200" ]; then GOOD="$ip"; fi
done

if [ -z "$GOOD" ]; then
  echo "==> 没有可用 IP，说明当前网络整体不可达，请改用代理或手机热点"
  exit 1
fi

cp /etc/hosts "/etc/hosts.bak.$(date +%Y%m%d%H%M%S)"

grep -v -E '(^|[[:space:]])github\.com([[:space:]]|$)' /etc/hosts > /tmp/hosts.new 2>/dev/null || true
printf '%s github.com\n' "$GOOD" >> /tmp/hosts.new
cat /tmp/hosts.new > /etc/hosts
rm -f /tmp/hosts.new

dscacheutil -flushcache 2>/dev/null || true
killall -HUP mDNSResponder 2>/dev/null || true

echo "==> 已钉 github.com -> $GOOD"
curl --noproxy '*' -sS -o /dev/null -w "==> 验证: HTTP %{http_code}, %{time_total}s\n" --connect-timeout 8 https://github.com/
