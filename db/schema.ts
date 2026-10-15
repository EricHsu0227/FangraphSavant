import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const preferenceProfiles=sqliteTable('preference_profiles',{
 userId:text('user_id').primaryKey(),revision:integer('revision').notNull().default(0),writeToken:text('write_token').notNull(),updatedAt:text('updated_at').notNull()
});
export const preferenceChunks=sqliteTable('preference_chunks',{
 userId:text('user_id').notNull(),part:integer('part').notNull(),value:text('value').notNull()
},table=>[primaryKey({columns:[table.userId,table.part]})]);
