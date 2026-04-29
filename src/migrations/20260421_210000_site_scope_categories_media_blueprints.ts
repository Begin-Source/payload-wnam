import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Optional site scope for categories, media, and site-blueprints (nullable site_id).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql`ALTER TABLE \`categories\` ADD \`site_id\` integer REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null;`,
  )
  await db.run(sql`CREATE INDEX \`categories_site_idx\` ON \`categories\` (\`site_id\`);`)

  await db.run(
    sql`ALTER TABLE \`media\` ADD \`site_id\` integer REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null;`,
  )
  await db.run(sql`CREATE INDEX \`media_site_idx\` ON \`media\` (\`site_id\`);`)

  await db.run(
    sql`ALTER TABLE \`site_blueprints\` ADD \`site_id\` integer REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null;`,
  )
  await db.run(sql`CREATE INDEX \`site_blueprints_site_idx\` ON \`site_blueprints\` (\`site_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX IF EXISTS \`categories_site_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`media_site_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`site_blueprints_site_idx\`;`)
  await db.run(sql`ALTER TABLE \`categories\` DROP COLUMN \`site_id\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`site_id\`;`)
  await db.run(sql`ALTER TABLE \`site_blueprints\` DROP COLUMN \`site_id\`;`)
}
