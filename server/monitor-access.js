const { R } = require("redbean-node");

/**
 * Levels of access a user can have on a monitor.
 * view < edit (edit implies view).
 */
const LEVELS = [ "view", "edit" ];

/**
 * Which roles can view a monitor whose `visibility` column is set to X?
 * Example: visibility='editor' means editors and admins can view.
 * visibility='viewer' means every logged-in user (viewer/editor/admin) can view.
 * @param {?string} visibility Monitor.visibility column value
 * @returns {string[]} Role names that can view
 */
function rolesAllowedByVisibility(visibility) {
    if (visibility === "viewer") {
        return [ "viewer", "editor", "admin" ];
    }
    if (visibility === "editor") {
        return [ "editor", "admin" ];
    }
    return [];
}

/**
 * Which roles can edit a monitor whose `edit_access` column is set to X?
 * Example: edit_access='editor' means editors and admins can edit.
 * @param {?string} editAccess Monitor.edit_access column value
 * @returns {string[]} Role names that can edit
 */
function rolesAllowedByEditAccess(editAccess) {
    if (editAccess === "editor") {
        return [ "editor", "admin" ];
    }
    return [];
}

/**
 * Can the user act on the monitor at the given level?
 * Admin and the monitor's owner always pass.
 * @param {object} socket Socket with userID and userRole
 * @param {object} monitor Monitor bean (must include user_id, visibility, edit_access)
 * @param {string} level "view" or "edit"
 * @returns {Promise<boolean>} True if allowed.
 */
async function canAccessMonitorBean(socket, monitor, level = "view") {
    if (!monitor) {
        return false;
    }
    if (!LEVELS.includes(level)) {
        throw new Error(`Unknown access level: ${level}`);
    }
    if (socket.userRole === "admin") {
        return true;
    }
    if (monitor.user_id === socket.userID) {
        return true;
    }

    // Role-based access
    if (level === "view") {
        if (rolesAllowedByVisibility(monitor.visibility).includes(socket.userRole)) {
            return true;
        }
        if (rolesAllowedByEditAccess(monitor.edit_access).includes(socket.userRole)) {
            return true;
        }
    } else if (level === "edit") {
        if (rolesAllowedByEditAccess(monitor.edit_access).includes(socket.userRole)) {
            return true;
        }
    }

    // Direct per-user grant
    const grant = await R.findOne(
        "monitor_user_permission",
        " monitor_id = ? AND user_id = ? ",
        [ monitor.id, socket.userID ]
    );
    if (grant) {
        if (level === "view") {
            return true;
        }
        if (level === "edit" && grant.level === "edit") {
            return true;
        }
    }

    return false;
}

/**
 * Load a monitor by id and assert access, throwing a standard error if denied.
 * @param {object} socket Socket with userID and userRole
 * @param {number} monitorID Monitor id to check
 * @param {string} level "view" or "edit"
 * @returns {Promise<object>} Monitor bean.
 * @throws {Error} If monitor missing or access denied.
 */
async function requireMonitorAccess(socket, monitorID, level = "view") {
    const monitor = await R.findOne("monitor", " id = ? ", [ monitorID ]);
    if (!monitor) {
        throw new Error("Monitor not found.");
    }
    if (!(await canAccessMonitorBean(socket, monitor, level))) {
        throw new Error("Permission denied.");
    }
    return monitor;
}

/**
 * Return the list of monitor ids the user may access at the given level.
 * Admins get all ids (the returned object's `all` is true).
 * @param {object} socket Socket with userID and userRole
 * @param {string} level "view" or "edit"
 * @returns {Promise<{all: boolean, ids: number[]}>} Access result.
 */
async function accessibleMonitorIds(socket, level = "view") {
    if (socket.userRole === "admin") {
        return { all: true, ids: [] };
    }

    const ownedRows = await R.getAll("SELECT id FROM monitor WHERE user_id = ?", [ socket.userID ]);
    const ownedIds = ownedRows.map((r) => r.id);

    const viewableVisibility = [];
    if (level === "view") {
        if (socket.userRole === "viewer") {
            viewableVisibility.push("viewer");
        }
        if (socket.userRole === "editor") {
            viewableVisibility.push("viewer", "editor");
        }
    }

    const editAccessValues = [];
    if (socket.userRole === "editor") {
        editAccessValues.push("editor");
    }

    let roleRows = [];
    if (viewableVisibility.length > 0 || editAccessValues.length > 0) {
        const clauses = [];
        const params = [];
        if (viewableVisibility.length > 0) {
            clauses.push(`visibility IN (${viewableVisibility.map(() => "?").join(",")})`);
            params.push(...viewableVisibility);
        }
        if (editAccessValues.length > 0) {
            clauses.push(`edit_access IN (${editAccessValues.map(() => "?").join(",")})`);
            params.push(...editAccessValues);
        }
        roleRows = await R.getAll(`SELECT id FROM monitor WHERE ${clauses.join(" OR ")}`, params);
    }
    const roleIds = roleRows.map((r) => r.id);

    const grantClause = level === "edit" ? " AND level = 'edit' " : " ";
    const grantRows = await R.getAll(
        `SELECT monitor_id AS id FROM monitor_user_permission WHERE user_id = ? ${grantClause}`,
        [ socket.userID ]
    );
    const grantIds = grantRows.map((r) => r.id);

    const ids = Array.from(new Set([ ...ownedIds, ...roleIds, ...grantIds ]));
    return { all: false, ids };
}

/**
 * Get the permissions for a monitor: the row's visibility/edit_access plus
 * all direct user grants (joined with username).
 * @param {number} monitorID Monitor id to load.
 * @returns {Promise<object>} { visibility, edit_access, users: [{user_id, username, level}] }
 */
async function getMonitorPermissions(monitorID) {
    const monitor = await R.findOne("monitor", " id = ? ", [ monitorID ]);
    if (!monitor) {
        throw new Error("Monitor not found.");
    }
    const users = await R.getAll(
        `SELECT mup.user_id, mup.level, u.username
         FROM monitor_user_permission mup
         JOIN user u ON u.id = mup.user_id
         WHERE mup.monitor_id = ?
         ORDER BY u.username ASC`,
        [ monitorID ]
    );
    return {
        visibility: monitor.visibility,
        edit_access: monitor.edit_access,
        users,
    };
}

/**
 * Replace the permissions for a monitor.
 * Admin or owner only — the caller is responsible for checking.
 * @param {number} monitorID Monitor id
 * @param {object} permissions { visibility, edit_access, users: [{user_id, level}] }
 * @returns {Promise<void>}
 */
async function setMonitorPermissions(monitorID, permissions) {
    const validVisibility = [ null, "viewer", "editor" ];
    const validEditAccess = [ null, "editor" ];
    const vis = permissions.visibility || null;
    const ea = permissions.edit_access || null;
    if (!validVisibility.includes(vis)) {
        throw new Error("Invalid visibility value.");
    }
    if (!validEditAccess.includes(ea)) {
        throw new Error("Invalid edit_access value.");
    }

    await R.exec("UPDATE monitor SET visibility = ?, edit_access = ? WHERE id = ?", [ vis, ea, monitorID ]);
    await R.exec("DELETE FROM monitor_user_permission WHERE monitor_id = ?", [ monitorID ]);

    const users = Array.isArray(permissions.users) ? permissions.users : [];
    const seen = new Set();
    for (const entry of users) {
        const userId = Number(entry.user_id);
        const lvl = entry.level;
        if (!Number.isInteger(userId) || seen.has(userId)) {
            continue;
        }
        if (lvl !== "view" && lvl !== "edit") {
            throw new Error("Invalid permission level.");
        }
        seen.add(userId);
        await R.exec(
            "INSERT INTO monitor_user_permission (monitor_id, user_id, level) VALUES (?, ?, ?)",
            [ monitorID, userId, lvl ]
        );
    }
}

module.exports = {
    LEVELS,
    canAccessMonitorBean,
    requireMonitorAccess,
    accessibleMonitorIds,
    getMonitorPermissions,
    setMonitorPermissions,
};
