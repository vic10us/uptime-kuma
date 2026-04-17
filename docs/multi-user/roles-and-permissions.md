# Roles and Permissions

Uptime Kuma has three built-in roles. Every user has exactly one role.

| Role     | Intended use                                                       |
| -------- | ------------------------------------------------------------------ |
| `admin`  | Instance owner / operator. Full access everywhere.                 |
| `editor` | Trusted user who creates and manages their own monitors.           |
| `viewer` | Read-only account for dashboards, reports, or shared access.       |

**Universal rules**

- `admin` can do anything, on any resource, regardless of ownership.
- Every user can always manage their **own** account (password + 2FA).

## What each role can do

### Global app settings (admin-only)

These endpoints require `admin`:

- `setSettings` — the entire **Settings → General** tab: `disableAuth`,
  `apiKeysEnabled`, timezone, data retention, trust proxy, update checks, etc.
- `clearStatistics`, `shrinkDatabase`
- `initServerTimezone`, `testChrome`
- Cloudflared tunnel (`cloudflared_*`: join / start / stop / removeToken)
- User CRUD: `getUserList`, `addUser`, `editUser`, `deleteUser`,
  `resetUserPassword`

Editors and viewers receive `Permission denied.` if they try to invoke any of
these over the socket API.

### Per-user resources

These tables have a `user_id` foreign key. Each resource is owned by the user
who created it.

| Resource         | Model / table    |
| ---------------- | ---------------- |
| Monitors         | `monitor`        |
| Notifications    | `notification`   |
| Maintenances     | `maintenance`    |
| Proxies          | `proxy`          |
| Docker hosts     | `docker_host`    |
| API keys         | `api_key`        |
| Remote browsers  | `remote_browser` |

Behaviour:

- **Create:** `editor` and `admin`.
- **Edit / Delete:** owner or `admin`. Editors cannot modify another editor's
  resources.
- **Viewer:** cannot create, edit or delete. Can only see resources shared with
  them (currently: monitors via the access control model — see
  [Monitor Access Control](./monitor-access-control.md)).

### Global shared resources

These tables have no `user_id` and are shared by the whole instance.

- `status_page` and incidents
- `tag`

Behaviour:

- **Read:** any logged-in user; status pages are also publicly reachable as
  before.
- **Create / Edit / Delete:** `editor` or `admin`.

### Self-service

Any logged-in user can do the following on their own account:

- `changePassword` — change own password.
- 2FA: `prepare2FA`, `save2FA`, `disable2FA`, `verifyToken`, `twoFAStatus`.
- `disconnectOtherSocketClients` — log out sessions other than the current one.

## API keys

API keys authenticate as the user that owns them. An API key's effective
permissions therefore match its owner's role at the time of the request. If an
owner is demoted from `admin` to `editor`, any API keys they own immediately
lose admin privileges on the next call.

## How role changes take effect

- Role is **not** stored in the JWT. The server looks up the current role on
  every authentication (login, reconnect via stored token, or auto-login in
  disabled-auth mode).
- When an admin changes another user's role or deactivates them, the affected
  user's existing socket sessions are disconnected so they are forced to
  re-authenticate with the new role.
- When an admin resets another user's password, their sessions are also
  disconnected.

## Where this is enforced

Role checks are done in the socket handlers via three helpers in
[`server/util-server.js`](../../server/util-server.js):

- `checkLogin(socket)` — must be logged in.
- `checkEditor(socket)` — must be `admin` or `editor`.
- `checkAdmin(socket)` — must be `admin`.

Public/unauthenticated endpoints (status-page reads, badge images, push webhook)
are unchanged.

See [Developer Notes](./developer-notes.md) for the per-handler mapping.
