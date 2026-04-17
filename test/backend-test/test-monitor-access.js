const { describe, test } = require("node:test");
const assert = require("node:assert");

// Stub redbean-node so we can exercise canAccessMonitorBean without a DB
const resolvedPath = require.resolve("redbean-node");
let grantLookup = null;
require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports: {
        R: {
            findOne: async (table, clause, params) => {
                if (table === "monitor_user_permission" && grantLookup) {
                    return grantLookup(params);
                }
                return null;
            },
        },
    },
};

const { canAccessMonitorBean } = require("../../server/monitor-access");

/**
 * Build a minimal monitor bean shape for tests.
 * @param {object} overrides Fields to override on the monitor.
 * @param {number} overrides.id Monitor id.
 * @param {number} overrides.user_id Owner user id.
 * @param {?string} overrides.visibility Visibility column value.
 * @param {?string} overrides.edit_access Edit access column value.
 * @returns {object} Monitor-like object.
 */
function monitor({ id = 1, user_id = 99, visibility = null, edit_access = null } = {}) {
    return { id, user_id, visibility, edit_access };
}

describe("canAccessMonitorBean", () => {
    test("admin gets view + edit on everything", async () => {
        const sock = { userID: 1, userRole: "admin" };
        assert.strictEqual(await canAccessMonitorBean(sock, monitor(), "view"), true);
        assert.strictEqual(await canAccessMonitorBean(sock, monitor(), "edit"), true);
    });

    test("owner gets view + edit", async () => {
        const sock = { userID: 42, userRole: "viewer" };
        const mon = monitor({ user_id: 42 });
        assert.strictEqual(await canAccessMonitorBean(sock, mon, "view"), true);
        assert.strictEqual(await canAccessMonitorBean(sock, mon, "edit"), true);
    });

    test("viewer can view when visibility=viewer", async () => {
        const sock = { userID: 2, userRole: "viewer" };
        const mon = monitor({ visibility: "viewer" });
        assert.strictEqual(await canAccessMonitorBean(sock, mon, "view"), true);
        assert.strictEqual(await canAccessMonitorBean(sock, mon, "edit"), false);
    });

    test("viewer cannot view when visibility=editor", async () => {
        const sock = { userID: 2, userRole: "viewer" };
        const mon = monitor({ visibility: "editor" });
        assert.strictEqual(await canAccessMonitorBean(sock, mon, "view"), false);
    });

    test("editor can view when visibility=editor, can edit when edit_access=editor", async () => {
        const sock = { userID: 3, userRole: "editor" };
        assert.strictEqual(
            await canAccessMonitorBean(sock, monitor({ visibility: "editor" }), "view"),
            true,
        );
        assert.strictEqual(
            await canAccessMonitorBean(sock, monitor({ visibility: "editor" }), "edit"),
            false,
        );
        assert.strictEqual(
            await canAccessMonitorBean(sock, monitor({ edit_access: "editor" }), "edit"),
            true,
        );
    });

    test("editor can view monitor when only edit_access=editor (edit implies view)", async () => {
        const sock = { userID: 3, userRole: "editor" };
        assert.strictEqual(
            await canAccessMonitorBean(sock, monitor({ edit_access: "editor" }), "view"),
            true,
        );
    });

    test("no access without role match or grant", async () => {
        const sock = { userID: 4, userRole: "viewer" };
        assert.strictEqual(await canAccessMonitorBean(sock, monitor(), "view"), false);
        assert.strictEqual(await canAccessMonitorBean(sock, monitor(), "edit"), false);
    });

    test("direct view grant allows view only", async () => {
        const sock = { userID: 5, userRole: "viewer" };
        grantLookup = () => ({ level: "view" });
        try {
            assert.strictEqual(await canAccessMonitorBean(sock, monitor(), "view"), true);
            assert.strictEqual(await canAccessMonitorBean(sock, monitor(), "edit"), false);
        } finally {
            grantLookup = null;
        }
    });

    test("direct edit grant allows edit", async () => {
        const sock = { userID: 5, userRole: "viewer" };
        grantLookup = () => ({ level: "edit" });
        try {
            assert.strictEqual(await canAccessMonitorBean(sock, monitor(), "view"), true);
            assert.strictEqual(await canAccessMonitorBean(sock, monitor(), "edit"), true);
        } finally {
            grantLookup = null;
        }
    });
});
