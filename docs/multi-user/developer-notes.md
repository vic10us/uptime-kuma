# Developer Notes

Reference material for maintainers of this fork. User-facing docs live in the
other files of this folder.

## Database schema

### Migrations

- `db/knex_migrations/2026-04-16-0000-add-user-role.js`
  - Adds `user.role VARCHAR(32) NOT NULL DEFAULT 'viewer'`.
  - Backfills every existing row to `role = 'admin'` so pre-existing
    single-user installs keep working.
- `db/knex_migrations/2026-04-16-0100-add-monitor-access.js`
  - Adds `monitor.visibility VARCHAR(16) NULL` and
    `monitor.edit_access VARCHAR(16) NULL`.
  - Creates `monitor_user_permission(id, monitor_id, user_id, level)` with a
    unique `(monitor_id, user_id)` and `ON DELETE CASCADE` on both foreign
    keys.

### Runtime validation

Role values are not enforced with a SQL `CHECK` constraint (SQLite/Knex
compatibility). Valid roles are defined in
[`server/model/user.js`](../../server/model/user.js) as `VALID_ROLES`, and
both `addUser` and `editUser` enforce the constraint at write time.

## Source map

| Concern                   | File                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| User model / JWT / public JSON | [`server/model/user.js`](../../server/model/user.js)              |
| Role helpers              | [`server/util-server.js`](../../server/util-server.js) (`checkLogin`, `checkRole`, `checkEditor`, `checkAdmin`) |
| Login / auto-login / setup flows | [`server/server.js`](../../server/server.js)                     |
| User management socket API | [`server/socket-handlers/user-socket-handler.js`](../../server/socket-handlers/user-socket-handler.js) |
| Monitor access helpers    | [`server/monitor-access.js`](../../server/monitor-access.js)            |
| Monitor JSON shape        | [`server/model/monitor.js`](../../server/model/monitor.js) (`toJSON`)   |
| Monitor list filtering    | [`server/uptime-kuma-server.js`](../../server/uptime-kuma-server.js) (`getMonitorJSONList`, `sendMonitorList`) |
| Frontend role state       | [`src/mixins/socket.js`](../../src/mixins/socket.js) (`userRole`, `isAdmin`, `canEdit`) |
| User admin UI             | [`src/components/settings/Users.vue`](../../src/components/settings/Users.vue) |
| Per-monitor access UI     | [`src/pages/EditMonitor.vue`](../../src/pages/EditMonitor.vue) (search: `Access`) |
| i18n strings              | [`src/lang/en.json`](../../src/lang/en.json)                            |

## Socket events added

| Event                     | Direction | Access   | Purpose                                            |
| ------------------------- | --------- | -------- | -------------------------------------------------- |
| `getUserList`             | → server  | admin    | List all users (public JSON).                      |
| `addUser`                 | → server  | admin    | Create a new user.                                 |
| `editUser`                | → server  | admin    | Update username / role / active.                   |
| `deleteUser`              | → server  | admin    | Delete user + their owned resources.               |
| `resetUserPassword`       | → server  | admin    | Reset any user's password.                         |
| `getMonitorPermissions`   | → server  | edit     | Read per-monitor access config.                    |
| `setMonitorPermissions`   | → server  | edit     | Replace per-monitor access config.                 |
| `listUsersForPermissions` | → server  | logged-in | Minimal `[{id, username}]` for user pickers.       |

Existing events whose callback payloads were extended to include `role`:

- `login`
- `loginByToken`
- `autoLogin`

## Access helper API

From [`server/monitor-access.js`](../../server/monitor-access.js):

- `canAccessMonitorBean(socket, monitor, level)` — low-level check. `level` is
  `"view"` or `"edit"`.
- `requireMonitorAccess(socket, monitorID, level)` — loads the monitor, throws
  `"Monitor not found."` or `"Permission denied."`, returns the bean on
  success. Use this at the top of any handler that touches a single monitor.
- `accessibleMonitorIds(socket, level)` — returns `{ all, ids }`. Admins get
  `{ all: true, ids: [] }`; others get an explicit list. Use this for bulk
  queries (heartbeat lists, charts across monitors, etc.).
- `getMonitorPermissions(monitorID)` / `setMonitorPermissions(monitorID, perms)`
  — the CRUD primitives for the permission config, used by the corresponding
  socket handlers.

### Admin-bypass convention

Several model methods accept an `{ isAdmin = false }` options bag:

- `Monitor.deleteMonitor`, `Monitor.deleteMonitorRecursively`
- `DockerHost.save`, `DockerHost.delete`
- `Proxy.save`, `Proxy.delete`
- `RemoteBrowser.save`, `RemoteBrowser.delete`
- `Notification.save`, `Notification.delete`
- helpers in `server.js`: `startMonitor`, `pauseMonitor`, `restartMonitor`,
  `checkOwner`

Callers that already validated access (via `requireMonitorAccess` or
`checkAdmin`) pass `isAdmin: true` to skip the redundant `user_id` filter in
the query. This keeps the owner check in one place — the socket handler —
instead of spreading role logic across every model.

## Handler gating cheat sheet

Quick map of the gating used in each socket handler. Anything not listed is
unchanged from upstream Uptime Kuma.

**admin only**

- `setSettings`, `clearStatistics`, `initServerTimezone`, `testChrome`
- `shrinkDatabase`
- all `cloudflared_*`
- user management (`getUserList`, `addUser`, `editUser`, `deleteUser`,
  `resetUserPassword`)

**editor or admin**

- monitors: `add`, `editMonitor`, `pauseMonitor`, `resumeMonitor`,
  `deleteMonitor`, `clearEvents`, `clearHeartbeats`
- monitor access: `getMonitorPermissions`, `setMonitorPermissions` (also
  requires `edit` on the target monitor)
- notifications: `addNotification`, `deleteNotification`, `testNotification`
- maintenances, proxies, API keys, Docker hosts, remote browsers: all
  mutating handlers
- status pages & incidents, tags: all mutating handlers

**any logged-in user**

- reads (`getMonitorList`, `getMonitor`, `getMonitorBeats`,
  `monitorImportantHeartbeatList*`, `getMonitorChartData`, `getTags`,
  `getSettings`, `checkApprise`, `getDatabaseSize`, `getGameList`,
  `getPushExample`, …)
- self-service: `changePassword`, 2FA flow, `disconnectOtherSocketClients`
- `listUsersForPermissions`

Read handlers additionally enforce monitor-level access via
`requireMonitorAccess(..., "view")` or `accessibleMonitorIds(..., "view")`.

## Tests

- `test/backend-test/test-role-helpers.js` — unit tests for `checkRole` /
  `checkEditor` / `checkAdmin` and for `User.toPublicJSON`.
- `test/backend-test/test-monitor-access.js` — `canAccessMonitorBean` matrix
  (admin, owner, role match, no match, direct grant).

Both files are pure unit tests. `test-monitor-access.js` stubs `redbean-node`
so it can run without a database. Run them directly:

```bash
TEST_BACKEND=1 node --test --test-reporter=spec test/backend-test/test-role-helpers.js
TEST_BACKEND=1 node --test --test-reporter=spec test/backend-test/test-monitor-access.js
```

## Extending the model

Adding a new role is straightforward:

1. Append the role to `VALID_ROLES` in `server/model/user.js`.
2. Update the helper logic in `server/util-server.js` (`checkEditor` /
   `checkAdmin`) and in `server/monitor-access.js` (the
   `rolesAllowedBy*` helpers and `accessibleMonitorIds`).
3. Add the option to the Users admin form (`src/components/settings/Users.vue`)
   and to the per-monitor Access UI if it should be usable as a role-target.
4. Add an i18n key and a `canEdit`/`isAdmin`-style computed in
   `src/mixins/socket.js` if the new role implies different UI gating.

Adding new per-user resources should follow the existing pattern: give the
table a `user_id` column, add an `{ isAdmin }` bypass option to the model's
`save` / `delete`, and gate the socket handler with `checkEditor` (or
stricter) plus an explicit ownership check — or migrate to the monitor-style
access model if fine-grained sharing is needed.
