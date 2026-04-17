# Multi-User Support

This fork adds multi-user support to Uptime Kuma with role-based access control
and per-monitor sharing.

## Contents

- [Roles and Permissions](./roles-and-permissions.md) — what each role can do
  across the app.
- [Monitor Access Control](./monitor-access-control.md) — how to share individual
  monitors across roles and with specific users.
- [User Management](./user-management.md) — adding, editing and removing users
  as an admin.
- [Developer Notes](./developer-notes.md) — code map, DB schema, and how the
  access helpers are wired into socket handlers.

## Quick Summary

| Capability                              | Admin | Editor        | Viewer         |
| --------------------------------------- | ----- | ------------- | -------------- |
| Manage users                            | ✅    | ❌            | ❌             |
| Change global settings                  | ✅    | ❌            | ❌             |
| Manage own monitors / notifications     | ✅    | ✅            | ❌ (read only) |
| Edit any user's monitor / notification  | ✅    | ❌            | ❌             |
| Edit status pages and tags (global)     | ✅    | ✅            | ❌             |
| View monitors shared with their role    | ✅    | ✅            | ✅             |
| View monitors shared with them directly | ✅    | ✅            | ✅             |
| Change own password / 2FA               | ✅    | ✅            | ✅             |

See [Roles and Permissions](./roles-and-permissions.md) for the full breakdown.

## Backward Compatibility

- Existing single-user installations are unaffected. The migration marks the
  existing user as `admin`, and all existing monitors default to `visibility = null`
  and `edit_access = null` — meaning only the owner (and admins) can see them,
  which matches the original single-user behaviour.
- Disabled-auth mode still works: the anonymous session is auto-logged in as the
  first user (admin), so nothing changes for instances that rely on it.
