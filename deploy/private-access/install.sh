#!/usr/bin/env bash
# Run as root from the uploaded private-access source directory.
# /etc/axio-access/config.json must contain the password hash and a random session secret.
set -euo pipefail
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
version=${1:?Usage: install.sh RELEASE_ID}
[[ "$version" =~ ^[a-zA-Z0-9_-]+$ ]]
[ "$(id -u)" = 0 ]
[ -f /etc/axio-access/config.json ]
/usr/bin/node --check "$source_dir/gate.mjs"
nginx -V 2>&1 | grep -q -- --with-http_auth_request_module
getent passwd axio-access >/dev/null || useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin axio-access
install -d -m 750 -o root -g axio-access /etc/axio-access
chown root:axio-access /etc/axio-access/config.json
chmod 640 /etc/axio-access/config.json
release="/var/lib/axio-access/releases/$version"
[ ! -e "$release" ]
install -d -m 755 "$release"
install -m 644 "$source_dir/gate.mjs" "$source_dir/page.mjs" "$release/"
backup="/opt/axio/access-backups/cookie-$version"
install -d -m 700 "$backup"
cp -p /etc/nginx/snippets/axio-private-access.conf "$backup/nginx-private.conf"
cp -p /etc/nginx/sites-available/axio.percytony.com.conf "$backup/nginx-site.conf"
previous=""
if [ -e /var/lib/axio-access/current ]; then previous=$(readlink -f /var/lib/axio-access/current); fi
if [ -f /etc/systemd/system/axio-access.service ]; then cp -p /etc/systemd/system/axio-access.service "$backup/axio-access.service"; fi
rollback() {
 cp -p "$backup/nginx-private.conf" /etc/nginx/snippets/axio-private-access.conf
 cp -p "$backup/nginx-site.conf" /etc/nginx/sites-available/axio.percytony.com.conf
 nginx -t && systemctl reload nginx
 if [ -n "$previous" ]; then
  ln -sfn "$previous" /var/lib/axio-access/current
  if [ -f "$backup/axio-access.service" ]; then cp -p "$backup/axio-access.service" /etc/systemd/system/axio-access.service; fi
  systemctl daemon-reload; systemctl restart axio-access
 else
  systemctl disable --now axio-access || true
  rm -f /var/lib/axio-access/current
 fi
 echo 'Private access rollout failed; previous Nginx policy restored.' >&2
}
trap rollback ERR
ln -sfn "$release" /var/lib/axio-access/current
install -m 644 "$source_dir/axio-access.service" /etc/systemd/system/axio-access.service
systemctl daemon-reload
systemctl enable axio-access >/dev/null
systemctl restart axio-access
for attempt in {1..20}; do
 if curl -fsS http://127.0.0.1:3018/health >/dev/null; then break; fi
 sleep 0.5
done
curl -fsS http://127.0.0.1:3018/health >/dev/null
install -m 644 "$source_dir/nginx.conf" /etc/nginx/snippets/axio-private-access.conf
nginx -t
systemctl reload nginx
sleep 1
[ "$(curl -sS -o /dev/null -w '%{http_code}' https://axio.percytony.com/access)" = 200 ]
[ "$(curl -sS -o /dev/null -w '%{http_code}' https://axio.percytony.com/api/status)" = 401 ]
trap - ERR
printf 'Private access UI deployed: %s\nBackup: %s\n' "$version" "$backup"
