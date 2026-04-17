const { R } = require("redbean-node");
const { passwordStrength } = require("check-password-strength");
const passwordHash = require("../password-hash");
const { checkAdmin } = require("../util-server");
const { log } = require("../../src/util");
const { UptimeKumaServer } = require("../uptime-kuma-server");
const User = require("../model/user");
const { VALID_ROLES } = require("../model/user");

const OWNED_TABLES = [ "monitor", "notification", "maintenance", "proxy", "docker_host", "api_key", "remote_browser" ];

/**
 * Count active admins, optionally excluding a given user id.
 * @param {?number} excludeUserID Exclude this user from the count
 * @returns {Promise<number>} count
 */
async function countActiveAdmins(excludeUserID = null) {
    if (excludeUserID == null) {
        return (await R.knex("user").where({ role: "admin", active: true }).count("id as c").first()).c;
    }
    return (await R.knex("user").where({ role: "admin", active: true }).whereNot({ id: excludeUserID }).count("id as c").first()).c;
}

/**
 * Handlers for user management (admin only).
 * @param {Socket} socket Socket.io instance
 * @returns {void}
 */
module.exports.userSocketHandler = (socket) => {
    socket.on("getUserList", async (callback) => {
        try {
            checkAdmin(socket);
            const users = await R.find("user", " 1 ORDER BY id ASC ");
            callback({
                ok: true,
                users: users.map((u) => u.toPublicJSON()),
            });
        } catch (e) {
            log.error("user", e);
            callback({ ok: false, msg: e.message });
        }
    });

    socket.on("addUser", async (data, callback) => {
        try {
            checkAdmin(socket);

            const username = (data?.username || "").trim();
            const password = data?.password || "";
            const role = data?.role;

            if (!username) {
                throw new Error("Username is required.");
            }
            if (!VALID_ROLES.includes(role)) {
                throw new Error("Invalid role.");
            }
            if (passwordStrength(password).value === "Too weak") {
                throw new Error("Password is too weak. It should contain alphabetic and numeric characters. It must be at least 6 characters in length.");
            }

            const existing = await R.findOne("user", " TRIM(username) = ? ", [username]);
            if (existing) {
                throw new Error("Username already exists.");
            }

            const user = R.dispense("user");
            user.username = username;
            user.password = await passwordHash.generate(password);
            user.role = role;
            user.active = true;
            const id = await R.store(user);

            callback({
                ok: true,
                msg: "User created successfully.",
                user: (await R.findOne("user", " id = ? ", [id])).toPublicJSON(),
            });
        } catch (e) {
            log.error("user", e);
            callback({ ok: false, msg: e.message });
        }
    });

    socket.on("editUser", async (id, data, callback) => {
        try {
            checkAdmin(socket);

            const user = await R.findOne("user", " id = ? ", [id]);
            if (!user) {
                throw new Error("User not found.");
            }

            const newUsername = data?.username != null ? String(data.username).trim() : user.username;
            const newRole = data?.role != null ? data.role : user.role;
            const newActive = data?.active != null ? !!data.active : !!user.active;

            if (!newUsername) {
                throw new Error("Username is required.");
            }
            if (!VALID_ROLES.includes(newRole)) {
                throw new Error("Invalid role.");
            }

            // Username uniqueness
            if (newUsername !== user.username) {
                const clash = await R.findOne("user", " TRIM(username) = ? AND id <> ? ", [newUsername, user.id]);
                if (clash) {
                    throw new Error("Username already exists.");
                }
            }

            // Protect last active admin
            const demoting = user.role === "admin" && newRole !== "admin";
            const deactivating = user.active && !newActive;
            if ((demoting || deactivating) && (await countActiveAdmins(user.id)) === 0) {
                throw new Error("Cannot demote or deactivate the last active admin.");
            }

            const roleChanged = user.role !== newRole;
            const activeChanged = !!user.active !== newActive;

            user.username = newUsername;
            user.role = newRole;
            user.active = newActive;
            await R.store(user);

            // Force re-auth on role/active change
            if (roleChanged || activeChanged) {
                UptimeKumaServer.getInstance().disconnectAllSocketClients(user.id);
            }

            callback({
                ok: true,
                msg: "Saved.",
                user: user.toPublicJSON(),
            });
        } catch (e) {
            log.error("user", e);
            callback({ ok: false, msg: e.message });
        }
    });

    socket.on("resetUserPassword", async (id, newPassword, callback) => {
        try {
            checkAdmin(socket);

            if (passwordStrength(newPassword).value === "Too weak") {
                throw new Error("Password is too weak. It should contain alphabetic and numeric characters. It must be at least 6 characters in length.");
            }

            const user = await R.findOne("user", " id = ? ", [id]);
            if (!user) {
                throw new Error("User not found.");
            }

            await User.resetPassword(user.id, newPassword);
            UptimeKumaServer.getInstance().disconnectAllSocketClients(user.id);

            callback({ ok: true, msg: "Password has been reset." });
        } catch (e) {
            log.error("user", e);
            callback({ ok: false, msg: e.message });
        }
    });

    socket.on("deleteUser", async (id, callback) => {
        try {
            checkAdmin(socket);

            if (id === socket.userID) {
                throw new Error("You cannot delete yourself.");
            }

            const user = await R.findOne("user", " id = ? ", [id]);
            if (!user) {
                throw new Error("User not found.");
            }

            if (user.role === "admin" && (await countActiveAdmins(user.id)) === 0) {
                throw new Error("Cannot delete the last active admin.");
            }

            const server = UptimeKumaServer.getInstance();

            // Stop running monitors owned by the user
            for (const monitorID of Object.keys(server.monitorList)) {
                const m = server.monitorList[monitorID];
                if (m && m.user_id === user.id) {
                    try {
                        await m.stop();
                    } catch (_) {
                        // ignore
                    }
                    delete server.monitorList[monitorID];
                }
            }
            // Stop maintenances owned by the user
            for (const maintID of Object.keys(server.maintenanceList)) {
                const mt = server.maintenanceList[maintID];
                if (mt && mt.user_id === user.id) {
                    try {
                        mt.stop();
                    } catch (_) {
                        // ignore
                    }
                    delete server.maintenanceList[maintID];
                }
            }

            // Delete owned rows before the user row (explicit cascade, FK cascade not guaranteed here)
            for (const table of OWNED_TABLES) {
                await R.exec(`DELETE FROM ${table} WHERE user_id = ?`, [user.id]);
            }

            await R.trash(user);

            server.disconnectAllSocketClients(user.id);

            callback({ ok: true, msg: "User deleted." });
        } catch (e) {
            log.error("user", e);
            callback({ ok: false, msg: e.message });
        }
    });
};
