// Tasks service — the data layer for the lab.
import { Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tasks, type Task } from '../db/schema.js';

export type TaskView = {
  id: number;
  orgId: number;
  createdBy: number;
  title: string;
  description: string;
  status: string;
  updatedAt: Date;
};

function toView(row: Task): TaskView {
  return {
    id: row.id,
    orgId: row.orgId,
    createdBy: row.createdBy,
    title: row.title,
    description: row.description,
    status: row.status,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class TasksService {
  // SAFE: the task board of the caller's organization. Scoped by `org_id` taken
  // from the SESSION, never from the request.
  async listForOrg(orgId: number): Promise<TaskView[]> {
    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.orgId, orgId))
      .orderBy(desc(tasks.updatedAt), desc(tasks.id));
    return rows.map(toView);
  }

  // SAFE: new tasks are always stamped with the caller's organization from the
  // session — the client cannot choose the tenant.
  async create(
    orgId: number,
    userId: number,
    input: { title: string; description?: string },
  ): Promise<TaskView> {
    const [row] = await db
      .insert(tasks)
      .values({
        // Global sequential counter shared by every tenant.
        id: sql`(select coalesce(max(id), 0) + 1 from tasks)`,
        orgId,
        createdBy: userId,
        title: input.title,
        description: input.description ?? '',
      })
      .returning();
    return toView(row!);
  }

  // ⚠️ THE READ VULNERABILITY.
  //
  // Fetches a task by its id and returns it — with no check that the task's
  // `org_id` matches the caller's organization. The query is filtered by the
  // resource id but not by the tenant. A correct implementation adds
  // `AND org_id = <session org>` (see SOLUTION.md).
  async findById(id: number): Promise<TaskView | undefined> {
    const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return row ? toView(row) : undefined;
  }

  // ⚠️ THE UPDATE (write) VULNERABILITY.
  //
  // Updates a task by id with no tenant check: any logged-in user can rewrite
  // another organization's task.
  async update(
    id: number,
    patch: { title?: string; description?: string; status?: string },
  ): Promise<TaskView | undefined> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.status !== undefined) set.status = patch.status;
    const [row] = await db.update(tasks).set(set).where(eq(tasks.id, id)).returning();
    return row ? toView(row) : undefined;
  }

  // ⚠️ THE DELETE (write) VULNERABILITY.
  //
  // Deletes a task by id with no tenant check: any logged-in user can destroy
  // another organization's task.
  async remove(id: number): Promise<TaskView | undefined> {
    const [row] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
    return row ? toView(row) : undefined;
  }
}
