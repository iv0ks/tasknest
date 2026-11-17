// Database schema (Drizzle ORM).
//
// tasknest is a small multi-tenant task manager: every user belongs to exactly
// one organization (the tenant), and every task belongs to exactly one
// organization. The tenant boundary is `tasks.org_id`.
//
// The primary key of `tasks` is a plain **sequential integer** — one global
// counter shared by all tenants, not one per organization. The listing endpoint
// scopes by `org_id`, but the single-task endpoints look a task up by that id
// alone and never compare its `org_id` with the caller's. That missing tenant
// check is the lab (CWE-639).
import { pgTable, integer, text, timestamp } from 'drizzle-orm/pg-core';

export const orgs = pgTable('orgs', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
});

export const users = pgTable('users', {
  id: integer('id').primaryKey(),
  orgId: integer('org_id')
    .notNull()
    .references(() => orgs.id),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
});

export const tasks = pgTable('tasks', {
  // Sequential integer PK, global across tenants.
  id: integer('id').primaryKey(),
  // The tenant this task belongs to — the boundary the vulnerable endpoints
  // forget to enforce.
  orgId: integer('org_id')
    .notNull()
    .references(() => orgs.id),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  // Free-form notes. The victim organization's confidential task carries the
  // FLAG here.
  description: text('description').notNull().default(''),
  // 'todo' | 'in_progress' | 'done'
  status: text('status').notNull().default('todo'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Org = typeof orgs.$inferSelect;
export type User = typeof users.$inferSelect;
export type Task = typeof tasks.$inferSelect;
