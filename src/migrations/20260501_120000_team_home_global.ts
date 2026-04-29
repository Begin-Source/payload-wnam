import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/** Global `team-home` — keeps Admin「团队」分组；用户集合迁至「系统」。 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`team_home\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`blurb\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(
    sql`INSERT OR IGNORE INTO \`team_home\` (\`id\`, \`blurb\`, \`updated_at\`, \`created_at\`) VALUES (1, NULL, NULL, NULL);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`team_home\`;`)
}
