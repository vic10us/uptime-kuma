const { describe, test } = require("node:test");
const assert = require("node:assert");
const { checkLogin, checkRole, checkEditor, checkAdmin } = require("../../server/util-server");

describe("util-server role helpers", () => {
    test("checkLogin throws when no userID", () => {
        assert.throws(() => checkLogin({}), /not logged in/);
    });

    test("checkLogin passes when socket has userID", () => {
        assert.doesNotThrow(() => checkLogin({ userID: 1 }));
    });

    test("checkRole throws when role not allowed", () => {
        assert.throws(
            () => checkRole({ userID: 1, userRole: "viewer" }, [ "admin", "editor" ]),
            /do not have permission/,
        );
    });

    test("checkRole passes when role allowed", () => {
        assert.doesNotThrow(() => checkRole({ userID: 1, userRole: "admin" }, [ "admin", "editor" ]));
    });

    test("checkEditor allows admin and editor", () => {
        assert.doesNotThrow(() => checkEditor({ userID: 1, userRole: "admin" }));
        assert.doesNotThrow(() => checkEditor({ userID: 2, userRole: "editor" }));
    });

    test("checkEditor rejects viewer", () => {
        assert.throws(
            () => checkEditor({ userID: 3, userRole: "viewer" }),
            /do not have permission/,
        );
    });

    test("checkAdmin rejects editor and viewer", () => {
        assert.throws(() => checkAdmin({ userID: 1, userRole: "editor" }), /do not have permission/);
        assert.throws(() => checkAdmin({ userID: 2, userRole: "viewer" }), /do not have permission/);
    });

    test("checkAdmin passes for admin", () => {
        assert.doesNotThrow(() => checkAdmin({ userID: 1, userRole: "admin" }));
    });

    test("role checks require login first", () => {
        assert.throws(() => checkEditor({ userRole: "admin" }), /not logged in/);
        assert.throws(() => checkAdmin({ userRole: "admin" }), /not logged in/);
    });
});

describe("User model", () => {
    const User = require("../../server/model/user");

    test("VALID_ROLES contains admin, editor, viewer", () => {
        assert.deepStrictEqual(User.VALID_ROLES.sort(), [ "admin", "editor", "viewer" ]);
    });

    test("toPublicJSON excludes password and 2FA secret", () => {
        // Simulated bean shape; BeanModel prototype not needed for this mapping test
        const u = Object.create(User.prototype);
        u.id = 5;
        u.username = "alice";
        u.password = "should-not-leak";
        u.role = "editor";
        u.active = 1;
        u.timezone = "UTC";
        u.twofa_status = 0;
        u.twofa_secret = "SECRETKEY";

        const json = u.toPublicJSON();

        assert.strictEqual(json.id, 5);
        assert.strictEqual(json.username, "alice");
        assert.strictEqual(json.role, "editor");
        assert.strictEqual(json.active, true);
        assert.strictEqual(json.timezone, "UTC");
        assert.strictEqual(json.twofa_status, false);
        assert.strictEqual("password" in json, false);
        assert.strictEqual("twofa_secret" in json, false);
    });

    test("toPublicJSON defaults role to viewer when missing", () => {
        const u = Object.create(User.prototype);
        u.id = 1;
        u.username = "legacy";
        u.role = null;
        u.active = 1;
        const json = u.toPublicJSON();
        assert.strictEqual(json.role, "viewer");
    });
});
