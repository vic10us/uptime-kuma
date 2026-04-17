# User Management

All user-management actions are admin-only and live under **Settings → Users**
(the tab only appears for admins).

## Initial setup

The very first account created via the Setup page is automatically assigned
the `admin` role. On an upgrade, any pre-existing user is migrated to `admin`
so that nothing breaks.

There is no self-registration. All further users must be created by an admin.

## Adding a user

1. Log in as an admin.
2. Go to **Settings → Users**.
3. Click **Add User**.
4. Fill in:
   - **Username** — must be unique.
   - **Password** — must pass the same strength check the setup flow uses
     (at least 6 characters, mix of alphabetic and numeric).
   - **Role** — `admin`, `editor`, or `viewer`.
5. Click **Save**.

New users are created with `active = true`. They can log in immediately.

## Editing a user

Click **Edit** on a user row. You can change:

- Username (still must be unique).
- Role.
- Active flag.

Role or active-flag changes force-disconnect any existing sockets belonging to
that user, so the change takes effect on their next reconnect.

### Last-admin protection

The server refuses to let you:

- **Demote** the last remaining active `admin` to any other role.
- **Deactivate** the last remaining active `admin`.
- **Delete** the last remaining active `admin`.
- Delete **yourself**, regardless of whether other admins exist.

You will get a clear error message if any of these are attempted.

## Resetting a user's password

1. Click **Reset Password** on a user row.
2. Type the new password (strength check still applies) and click **Save**.

The target user's sessions are disconnected, forcing them to log in again with
the new password. The admin action does not require knowing the old password.

## Deleting a user

Click **Delete**, then confirm. **This is destructive:**

- The user row is removed.
- All resources they owned are deleted in a single operation:
  monitors (and their heartbeats by cascade), notifications, maintenances,
  proxies, Docker hosts, API keys, remote browsers.
- Any active sockets belonging to the user are disconnected.

If you want to keep a user's data but block their access, use **Edit** →
uncheck **Active** instead.

## Deactivating vs. deleting

| Action         | Resources kept | Login blocked | Sessions kicked |
| -------------- | -------------- | ------------- | --------------- |
| Edit → Active=off | yes          | yes           | yes             |
| Delete         | **no**         | yes           | yes             |

## Role changes and running work

- Changing a user's role does not pause or remove any monitors they own. The
  monitors keep running. Their owner ID does not change. If the user is
  deleted, their monitors are deleted with them.
- If you need to transfer ownership, do it via direct DB access — there's no
  built-in "re-assign owner" action yet.

## Auditing

There's no dedicated audit log in this fork. Role-gated actions that are
rejected are recorded in the server log at `info`/`warn` level (the default
Uptime Kuma logging). Successful admin actions are not individually logged
beyond the existing per-handler debug logs.
