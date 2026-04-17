# Monitor Access Control

By default, a monitor is only visible to its owner (and to admins). The
**Access** section on the edit-monitor page lets you widen access by role
and/or grant permissions to specific users.

## Model

Each monitor has two role-based fields plus an optional list of per-user
grants:

| Field          | Values                           | Meaning                                                     |
| -------------- | -------------------------------- | ----------------------------------------------------------- |
| `visibility`   | `null` \| `viewer` \| `editor`   | Minimum role that can **view** the monitor.                 |
| `edit_access`  | `null` \| `editor`               | Minimum role that can **edit** the monitor (implies view).  |
| Direct grants  | list of `(user, view \| edit)`   | Override for specific users, regardless of role.            |

`null` means "owner only". Admins and the owner always have full access; you
never need to list them.

## Resolution order

When a user tries to access a monitor at a given level (`view` or `edit`), the
server checks in order:

1. **Is the user an admin?** → allow.
2. **Is the user the monitor owner (`monitor.user_id`)?** → allow.
3. **Role match.**
   - `view`: allowed if the user's role is ≥ `visibility`, or ≥ `edit_access`
     (since edit implies view).
   - `edit`: allowed if the user's role is ≥ `edit_access`.
4. **Direct user grant.**
   - `view`: any grant (`view` or `edit`) allows.
   - `edit`: only an `edit` grant allows.
5. Otherwise: denied.

Role ordering: `viewer < editor < admin`.

## Examples

| `visibility` | `edit_access` | Direct grants       | Alice (viewer) | Bob (editor)   |
| ------------ | ------------- | ------------------- | -------------- | -------------- |
| `null`       | `null`        | —                   | no access      | no access      |
| `viewer`     | `null`        | —                   | view           | view           |
| `editor`     | `null`        | —                   | no access      | view           |
| `null`       | `editor`      | —                   | no access      | edit           |
| `null`       | `null`        | Alice → `view`      | view           | no access      |
| `null`       | `null`        | Alice → `edit`      | **edit**       | no access      |
| `viewer`     | `null`        | Bob → `edit`        | view           | edit           |

Owners and admins are not shown in these tables because they always pass.

## Setting permissions in the UI

1. Open the monitor (dashboard → pick the monitor → **Edit**).
2. Scroll to **Access** (below **Advanced**, above the Save button).
3. Choose a **View access** and **Edit access** level, or leave both as "Owner
   only".
4. To grant a specific user, pick them from the dropdown, pick a level, and
   click **Add**. Repeat as needed.
5. Click **Save Access**. (This button is separate from the main **Save**
   button so you can change permissions without touching the monitor config.)

Changes take effect immediately — subsequent reads will reflect the new
permissions. Users whose access was just revoked will stop seeing the monitor
on their next list refresh or reconnect.

## Who can edit permissions

Any user who has **edit** access to the monitor can change its permissions.
That means:

- The owner
- Admins
- Editors granted `edit_access=editor` on the monitor
- Users with a direct `edit` grant

Pure `view` access does not include permission-management rights.

## What the access model does **not** cover

- **Notifications**, **proxies**, **Docker hosts**, **maintenances**, **API
  keys**: still strictly owner-scoped (with admin override). These are not
  shared across users.
- **Status pages** and **tags**: global — all editors see and can edit them.
- **Heartbeats / chart data**: inherit from their parent monitor.

If you need a shared notification (for example an on-call Slack channel used
by every editor), create it separately under each user, or add the same
notification to monitors via the monitor's notification list.

## Defaults on creation

New monitors are created with `visibility = null` and `edit_access = null` and
no direct grants — i.e. owner-only — matching the original single-user
behaviour. Permissions can only be changed after the monitor has been saved at
least once (the Access section is hidden on the **Add monitor** page).
