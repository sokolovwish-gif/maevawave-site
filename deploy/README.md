# Production deployment

The live static site is stored in `/opt/maevawave-site` on the VPS.

It is served by the shared Caddy container from the `maevawave.ru` host block.
The directory is mounted read-only at `/srv/maevawave`.

Publish local changes:

```sh
rsync -av --delete \
  --exclude='.git' \
  --exclude='deploy' \
  --exclude='README.md' \
  ./ sail-maeva:/opt/maevawave-site/
```

## Admin panel

The admin panel is available at `https://maevawave.ru/admin/` behind Caddy
Basic Auth. Do not store the plaintext password in this repository.

The backend lives in `/opt/maevawave-admin` and runs as the
`maevawave-admin-admin-1` container. Caddy proxies:

- `/api/trips` to the public trips API.
- `/api/admin/*` to the protected admin API.
- `/admin/*` to the protected static admin interface.

The admin backend reads every trip from the bot's Google Sheet. By default,
the site displays only trips that are both enabled for the bot and payable.
Site-specific overrides are stored separately in
`/opt/maevawave-admin/data/site-overrides.json`; they never modify the Sheet
or the bot's payment settings.

Deploy the admin backend:

```sh
rsync -av admin/ sail-maeva:/opt/maevawave-admin/
ssh sail-maeva 'grep "^TELEGRAM_WEBHOOK_SECRET=" /opt/sail-maeva/.env.production > /opt/maevawave-admin/.env'
ssh sail-maeva 'cd /opt/maevawave-admin && docker compose up -d --build'
```

The admin compose file interpolates `TELEGRAM_WEBHOOK_SECRET` from its local
`.env`. It must match the bot's production secret or website leads cannot enter
the delivery queue.
