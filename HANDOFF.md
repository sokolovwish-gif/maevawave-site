# MAEVAWAVE Handoff

Date: 2026-07-15

## Current Git State

- Top-level repo path: `/Users/maxim/Documents/Сайт Maevawave`.
- Current branch: `main`.
- Current handoff commit before final site repo setup: `4aabae795331eef2d5ea22a4aa702068a06383ed`.
- The top-level site repo has no GitHub remote configured yet.
- GitHub repositories visible for `sokolovwish-gif` were checked on 2026-07-15. A separate MAEVAWAVE site repository was not found.
- Recommended repository to create for this site: `sokolovwish-gif/maevawave-site`.
- A separate nested Git repo exists at `work/maeva-wave-pay-bot` on branch `codex/production-sync`.

## Current Project Shape

The project contains:

- public MAEVAWAVE landing page;
- individual trip pages;
- lead form modal;
- admin UI and Node admin API;
- deployment notes;
- a nested payment bot repository under `work/maeva-wave-pay-bot`.

The site is static, with dynamic data provided by `admin/server.mjs`.

The admin backend:

- fetches trips from the bot Google Sheet;
- shows by default only bot-active and payable trips;
- stores website-only overrides separately;
- manages landing placeholder mode;
- manages visible trips, card title/photo, per-trip page copy, gallery, lead form settings and leads;
- relays website lead submissions to the bot internal endpoint.

## Important Decisions and Features

- `maevawave.ru` canonical HTTPS is served by shared Caddy.
- `www` and HTTP redirect to `https://maevawave.ru/`.
- `/admin/` is protected by Caddy Basic Auth.
- Public trip cards load from `/api/trips`.
- Trip detail pages load from `/api/trips/:id`.
- Lead form appears only on trip pages, not on the main trip cards.
- Main trip cards link to the trip page and use only `Подробнее`.
- Lead form asks:
  - people count;
  - 18+;
  - cabin preference;
  - budget in rubles;
  - prepayment readiness;
  - main interest;
  - discovery source;
  - comment;
  - name;
  - phone;
  - optional Telegram username.
- Lead form delivery path:
  1. website/admin backend saves local JSONL copy;
  2. admin backend relays to bot internal endpoint;
  3. bot stores lead in Postgres;
  4. bot worker sends Telegram notification and syncs Google Sheets.
- Internal relay secret must match bot `TELEGRAM_WEBHOOK_SECRET`. Admin compose reads it from `/opt/maevawave-admin/.env`, generated from bot production env.

## Changes Made During the Last Month

High-level site/design changes:

- rebuilt the landing into a more concise modern sales page;
- removed several nonessential blocks;
- switched visual style toward rounded cards, cleaner typography, fixed header;
- added favicon, SEO/meta/OpenGraph tags and legal footer;
- added dedicated trip detail pages;
- moved lead form from main cards into trip pages;
- changed main cards to `Подробнее`;
- added sticky/back navigation for trip pages;
- improved responsive sizing so blocks fit better on laptop screens;
- added full-screen placeholder mode controlled from admin;
- added gallery section on trip pages;
- made gallery configurable per trip from admin;
- moved `Поездки` below `О Маше Маевой`;
- added `Частые вопросы` menu item;
- updated footer line breaks;
- fixed typography issue where `в Турции` could hang at the end of a line.

Admin/backend changes:

- created admin UI at `/admin/`;
- added manual/auto trip visibility controls;
- added inline title/photo editing;
- added full-screen trip settings modal;
- added lead-form settings editor;
- added leads viewer and delivery retry;
- added per-trip page copy fields;
- added per-trip gallery override checkboxes;
- added server-side defaults by country for trip images and galleries;
- added admin data backups on server.

Lead handling changes:

- added website lead persistence;
- added Telegram lead notification;
- added Google Sheets sync for website leads;
- changed lead notification status/date/id formatting to readable Russian;
- added short public lead number `MW-XXXXXXXX`;
- added Telegram username and discovery source fields;
- changed cabin question to two clear options;
- changed budget labels to rubles;
- removed old route/adventure option from form;
- fixed a production relay secret mismatch that caused form submission error despite local save.

Bot-related changes present in nested repo:

- website lead formatting and Sheets row mapping;
- internal website lead endpoint support;
- tests for website lead message formatting;
- other payment/booking-related changes are uncommitted in the nested bot repo and should be handled separately.

## Server State Checked Read-Only

Checked on 2026-07-15 via `ssh sail-maeva` without writing or deploying.

Containers:

- `edge-caddy-1` up.
- `maevawave-admin-admin-1` up.
- `sail_maeva-app-1` up.
- `sail_maeva-postgres-1` up and healthy.
- Other unrelated containers also run on the same VPS.

Paths:

- Site: `/opt/maevawave-site`.
- Admin app: `/opt/maevawave-admin`.
- Admin runtime data: `/opt/maevawave-admin/data`.
- Bot: `/opt/sail-maeva`.
- Edge Caddy: `/opt/edge`.

Result of file-hash comparison:

- Public site files in `/opt/maevawave-site` match local files.
- Admin code files in `/opt/maevawave-admin` match local `admin/`.
- Bot website-lead files checked on server match local nested bot files:
  - `bot/website-leads.js`;
  - `bot/website-lead-format.js`;
  - `bot/website-lead-format.test.js`;
  - `bot/server.js`;
  - `docker-compose.production.yml`;
  - `package.json`.

Server-only runtime/data files that should not be committed:

- `/opt/maevawave-admin/.env`;
- `/opt/maevawave-admin/data/site-overrides.json`;
- `/opt/maevawave-admin/data/site-settings.json`;
- `/opt/maevawave-admin/data/site-leads.jsonl`;
- `/opt/maevawave-admin/data/uploads/...`;
- `/opt/maevawave-admin/backups/...`;
- `/opt/sail-maeva/.env.production`;
- `/opt/sail-maeva/backups/...`;
- `/opt/edge/.env.unused`.

Server edge Caddy note:

- Local `deploy/current-edge/Caddyfile` is not fully equal to `/opt/edge/Caddyfile`.
- Production edge Caddy includes additional current routing for `nadlife.ru` canonical redirects and `reelspulse.ru`.
- Do not overwrite `/opt/edge/Caddyfile` from this repo without first merging current production config.

## Known Gaps / Unfinished Tasks

- Top-level Git has no remote configured, so site push requires a separate site repository first.
- Recommended repo name: `sokolovwish-gif/maevawave-site`.
- Do not use `sokolovwish-gif/maeva-wave-pay-bot` as the site remote. That repository is only for the bot.
- Top-level repo currently excludes nested `work/maeva-wave-pay-bot/` by `.gitignore` to avoid committing a broken embedded repo.
- The bot nested repo has its own uncommitted changes and no remote configured locally.
- Admin access for a staff member still needs an operational decision:
  - share the current Basic Auth credentials out-of-band, or
  - replace Caddy Basic Auth with a new known password/hash, or
  - implement named users.
- Per-trip gallery currently selects from existing images only. Uploading custom gallery images is not implemented beyond the existing single card image upload.
- Google Sheets website lead header migration was implemented in code; verify on the next real lead that the sheet accepted the expanded columns.
- Analytics/Yandex Webvisor is not connected yet.
- Legal text exists, but no public offer/payment terms page has been deeply reviewed by a lawyer.

## Next Steps on Windows

After the site repository is created and pushed from this machine:

```sh
git clone https://github.com/sokolovwish-gif/maevawave-site.git
cd maevawave-site
git switch codex/windows-handoff
```

There is currently no npm install/build step for the public site because it is plain HTML/CSS/JS plus a Node admin backend.

Preview the public site:

```sh
python3 -m http.server 8080
```

Run syntax checks with Node:

```sh
node --check script.js
node --check trip.js
node --check lead-form.js
node --check admin/admin.js
node --check admin/server.mjs
```

Run the admin backend with throwaway local data:

```sh
DATA_FILE=/tmp/maevawave-admin.json \
SETTINGS_FILE=/tmp/maevawave-settings.json \
LEADS_FILE=/tmp/maevawave-leads.jsonl \
PORT=3012 \
node admin/server.mjs
```

Operational notes:

1. If bot work is needed, handle `work/maeva-wave-pay-bot` as a separate repo, not as a normal subfolder.
2. Before any deployment, compare:
   - local `deploy/current-edge/Caddyfile`;
   - production `/opt/edge/Caddyfile`;
   - production admin data in `/opt/maevawave-admin/data`.
3. For site-only copy changes, edit static files and deploy only those files.
4. For admin API changes, rebuild only `maevawave-admin-admin-1`.
5. For lead-delivery/bot changes, use the bot repo and rebuild only `sail_maeva-app-1`.

## Does the Bot Need a Separate Handoff?

Yes, if work on payments, bookings, Robokassa, Google Sheets, Telegram bot flows, or lead delivery will continue on Windows.

Reason: `work/maeva-wave-pay-bot` is an independent nested Git repository with its own branch and uncommitted changes. This site handoff documents the integration points, but it does not replace a dedicated bot handoff/commit/push.
