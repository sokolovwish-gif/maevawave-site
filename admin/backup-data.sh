#!/bin/sh
set -eu

backup_dir="/opt/maevawave-admin/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${backup_dir}/maevawave-admin-${timestamp}.tar.gz"

mkdir -p "$backup_dir"
tar -C /opt/maevawave-admin -czf "$target" data
find "$backup_dir" -type f -name 'maevawave-admin-*.tar.gz' -mtime +14 -delete
chmod 600 "$target"
