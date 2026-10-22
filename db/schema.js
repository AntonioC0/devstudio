import {sqliteTable,text,integer,primaryKey,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const users=sqliteTable('users',{
  id:text('id').primaryKey(),email:text('email').notNull().unique(),name:text('name').notNull(),passwordHash:text('password_hash').notNull(),createdAt:integer('created_at').notNull()
});
export const sessions=sqliteTable('sessions',{
  tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),expiresAt:integer('expires_at').notNull()
},t=>[index('sessions_user_idx').on(t.userId)]);
export const rateLimits=sqliteTable('rate_limits',{
  key:text('key').primaryKey(),hits:integer('hits').notNull(),expiresAt:integer('expires_at').notNull()
});
export const projects=sqliteTable('projects',{
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),name:text('name').notNull(),description:text('description').notNull().default(''),instructions:text('instructions').notNull().default(''),activeApiAlias:text('active_api_alias'),version:integer('version').notNull().default(0),busyUntil:integer('busy_until').notNull().default(0),busyToken:text('busy_token'),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[index('projects_user_idx').on(t.userId)]);
export const conversations=sqliteTable('conversations',{
  id:text('id').primaryKey(),projectId:text('project_id').notNull().references(()=>projects.id,{onDelete:'cascade'}),title:text('title').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[index('conversations_project_idx').on(t.projectId)]);
export const messages=sqliteTable('messages',{
  id:text('id').primaryKey(),conversationId:text('conversation_id').notNull().references(()=>conversations.id,{onDelete:'cascade'}),role:text('role').notNull(),content:text('content').notNull(),provider:text('provider'),model:text('model'),createdAt:integer('created_at').notNull()
},t=>[index('messages_conversation_idx').on(t.conversationId)]);
export const files=sqliteTable('files',{
  projectId:text('project_id').notNull().references(()=>projects.id,{onDelete:'cascade'}),path:text('path').notNull(),content:text('content').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[primaryKey({columns:[t.projectId,t.path]})]);
export const generations=sqliteTable('generations',{
  id:text('id').primaryKey(),projectId:text('project_id').notNull().references(()=>projects.id,{onDelete:'cascade'}),conversationId:text('conversation_id').notNull().references(()=>conversations.id,{onDelete:'cascade'}),status:text('status').notNull(),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),error:text('error')
},t=>[index('generations_project_idx').on(t.projectId)]);
export const apiCredentials=sqliteTable('api_credentials',{
  id:text('id').primaryKey(),projectId:text('project_id').notNull().references(()=>projects.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),name:text('name').notNull(),alias:text('alias').notNull(),provider:text('provider').notNull(),model:text('model'),encryptedSecret:text('encrypted_secret').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[uniqueIndex('credentials_project_alias_unique').on(t.projectId,t.alias),index('credentials_user_idx').on(t.userId)]);
export const securityEvents=sqliteTable('security_events',{
  id:text('id').primaryKey(),projectId:text('project_id').notNull().references(()=>projects.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),action:text('action').notNull(),resource:text('resource').notNull(),createdAt:integer('created_at').notNull()
},t=>[index('security_events_project_idx').on(t.projectId)]);

export const sessionRequests=sqliteTable('session_requests',{
  id:text('id').primaryKey(),projectId:text('project_id').notNull().references(()=>projects.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),inputHash:text('input_hash').notNull(),status:text('status').notNull(),createdAt:integer('created_at').notNull()
},t=>[index('session_requests_project_idx').on(t.projectId)]);
