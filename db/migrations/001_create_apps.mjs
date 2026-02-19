/**
 * @param {import('knex').Knex} knex
 */
export function up(knex) {
  return knex.schema.createTable('apps', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable();
    table.string('repo_url', 500).notNullable();
    table.text('env_vars');
    table.text('build_command');
    table.string('start_command', 500).notNullable();
    table.string('pm2_name', 255).unique().notNullable();
    table.string('status', 50).defaultTo('stopped');
    table.timestamps(true, true);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export function down(knex) {
  return knex.schema.dropTableIfExists('apps');
}

