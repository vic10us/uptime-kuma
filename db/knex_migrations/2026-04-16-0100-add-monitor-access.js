exports.up = async function (knex) {
    await knex.schema.alterTable("monitor", function (table) {
        // null = owner only, otherwise minimum role that can view the monitor
        table.string("visibility", 16).nullable().defaultTo(null);
        // null = owner only (for edits), otherwise minimum role that can edit
        table.string("edit_access", 16).nullable().defaultTo(null);
    });

    await knex.schema.createTable("monitor_user_permission", function (table) {
        table.increments("id");
        table.integer("monitor_id").unsigned().notNullable().references("id").inTable("monitor").onDelete("CASCADE");
        table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE");
        // "view" or "edit"
        table.string("level", 8).notNullable();
        table.unique([ "monitor_id", "user_id" ]);
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists("monitor_user_permission");
    await knex.schema.alterTable("monitor", function (table) {
        table.dropColumn("visibility");
        table.dropColumn("edit_access");
    });
};
