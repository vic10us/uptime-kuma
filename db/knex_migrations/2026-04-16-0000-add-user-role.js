exports.up = async function (knex) {
    await knex.schema.alterTable("user", function (table) {
        table.string("role", 32).notNullable().defaultTo("viewer");
    });
    // Backfill: existing users become admin (preserves sole-operator semantics on upgrade)
    await knex("user").update({ role: "admin" });
};

exports.down = function (knex) {
    return knex.schema.alterTable("user", function (table) {
        table.dropColumn("role");
    });
};
