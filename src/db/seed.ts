// Seed script — idempotent.
//
// Three organizations (tenants), four users, eight tasks. The task ids are one
// **global sequential counter** (1–8), not one per organization, so the ids on
// your own board give away where the other tenants' tasks live.
//
//   Northwind Traders (org 1)  — alice (you, id 1) and dave (id 4)   tasks 1–3
//   Globex Corporation (org 2) — bob (the victim, id 2)              tasks 4–6
//   Initech (org 3)            — carol (bystander, id 3)             tasks 7–8
//
// Globex's CONFIDENTIAL task (id 5) carries the FLAG in its description. alice
// can only list Northwind's board; reaching Globex's task is the lab.
import { db, sql } from './client.js';
import { orgs, users, tasks } from './schema.js';
import { hashPassword } from '../auth.js';
import { config } from '../config.js';

const seedOrgs = [
  { id: 1, name: 'Northwind Traders', slug: 'northwind' },
  { id: 2, name: 'Globex Corporation', slug: 'globex' },
  { id: 3, name: 'Initech', slug: 'initech' },
];

const seedUsers = [
  {
    id: 1,
    orgId: 1,
    username: 'alice',
    password: 'password123',
    displayName: 'Alice Martins',
  },
  {
    id: 2,
    orgId: 2,
    username: 'bob',
    password: 'correct-horse-battery-staple',
    displayName: 'Bob Keller',
  },
  {
    id: 3,
    orgId: 3,
    username: 'carol',
    password: 'hunter2hunter2',
    displayName: 'Carol Nwosu',
  },
  {
    id: 4,
    orgId: 1,
    username: 'dave',
    password: 'letmein-northwind',
    displayName: 'Dave Okafor',
  },
];

type SeedTask = {
  id: number;
  orgId: number;
  createdBy: number;
  title: string;
  description: string;
  status: string;
};

const seedTasks: SeedTask[] = [
  {
    id: 1,
    orgId: 1,
    createdBy: 1,
    title: 'Prepare Q4 supplier review',
    description: 'Collect delivery KPIs from the three regional warehouses.',
    status: 'in_progress',
  },
  {
    id: 2,
    orgId: 1,
    createdBy: 4,
    title: 'Renew warehouse insurance',
    description: 'Policy expires at the end of the month. Ask finance for the budget.',
    status: 'todo',
  },
  {
    id: 3,
    orgId: 1,
    createdBy: 1,
    title: 'Update onboarding checklist',
    description: 'Add the new VPN steps.',
    status: 'done',
  },
  {
    id: 4,
    orgId: 2,
    createdBy: 2,
    title: 'Plan the board meeting',
    description: 'Agenda draft due Friday.',
    status: 'in_progress',
  },
  {
    // Globex's confidential task — the target. Carries the flag.
    id: 5,
    orgId: 2,
    createdBy: 2,
    title: 'CONFIDENTIAL: acquisition shortlist',
    description: `Do not share outside the leadership team. Access code: ${config.flag}`,
    status: 'todo',
  },
  {
    id: 6,
    orgId: 2,
    createdBy: 2,
    title: 'Review vendor contracts',
    description: 'Legal wants the redlines back by Monday.',
    status: 'todo',
  },
  {
    id: 7,
    orgId: 3,
    createdBy: 3,
    title: 'Fix the TPS report cover sheet',
    description: 'Yes, the new cover sheet. Did you get the memo?',
    status: 'todo',
  },
  {
    id: 8,
    orgId: 3,
    createdBy: 3,
    title: 'Order more red staplers',
    description: 'Somebody keeps taking them.',
    status: 'done',
  },
];

async function main(): Promise<void> {
  console.log('[seed] seeding organizations …');
  for (const o of seedOrgs) {
    await db
      .insert(orgs)
      .values(o)
      .onConflictDoUpdate({ target: orgs.id, set: { name: o.name, slug: o.slug } });
  }

  console.log('[seed] seeding users …');
  for (const u of seedUsers) {
    const passwordHash = hashPassword(u.password);
    await db
      .insert(users)
      .values({
        id: u.id,
        orgId: u.orgId,
        username: u.username,
        passwordHash,
        displayName: u.displayName,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          orgId: u.orgId,
          username: u.username,
          passwordHash,
          displayName: u.displayName,
        },
      });
  }

  console.log('[seed] seeding tasks …');
  for (const t of seedTasks) {
    await db
      .insert(tasks)
      .values(t)
      .onConflictDoUpdate({
        target: tasks.id,
        set: {
          orgId: t.orgId,
          createdBy: t.createdBy,
          title: t.title,
          description: t.description,
          status: t.status,
        },
      });
  }

  console.log(
    '[seed] done. orgs: northwind, globex, initech. flag seeded on globex confidential task (id 5).',
  );
  await sql.end();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
