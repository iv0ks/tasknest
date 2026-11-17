# tasknest

![CWE-639](https://img.shields.io/badge/CWE--639-IDOR-red?style=flat-square)
![Node](https://img.shields.io/badge/Node-NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white)
![Docker](https://img.shields.io/badge/Lab-Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
[![GHCR](https://img.shields.io/badge/ghcr.io-iv0ks%2Ftasknest-blue?logo=docker)](https://github.com/iv0ks/tasknest/pkgs/container/tasknest)

**tasknest is an intentionally vulnerable application built for security education.** It contains a deliberate [IDOR / broken access control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
(CWE-639) flaw in a **multi-tenant** task manager — proving that "you must be logged in" is not the same as "this record belongs to your organization".

<br>

<div align="center">

| 🛡️ Vulnerability | 🎯 Difficulty | 🛠️ Stack | 🚩 Entry point |
| :--- | :--- | :--- | :--- |
| Tenant-isolation IDOR (CWE-639) | ⭐⭐⭐⭐ Level 6 | Node · NestJS | `GET · PATCH · DELETE /api/tasks/:id` |

</div>

<br>

> [!NOTE]
> The guided, spoiler-free path is [GUIDE.md](GUIDE.md); the full answer waits in [SOLUTION.md](SOLUTION.md) whenever you want it.

<br>

## 📂 Project layout

The repository is organised so the vulnerable code is easy to find and reason
about. The **application** lives in `src/` (a small NestJS API plus a static
kanban board), the **data layer** is Drizzle ORM over Postgres (`src/db/` +
`drizzle/` migrations), and the **tooling** around it (Docker, CI/CD, linters)
turns the lab into a production-shaped project. The challenge flag is never in
the repo — it is baked into the image and seeded into the victim organization's
confidential task.

```
tasknest/
├── src/                      # the application (the bug lives here)
│   ├── main.ts               # bootstrap: session, validation pipe, static UI
│   ├── app.module.ts         # root module
│   ├── health.controller.ts  # GET /healthz → "ok"
│   ├── config.ts             # env-backed configuration
│   ├── auth.ts               # password hashing
│   ├── auth/
│   │   └── auth.controller.ts   # POST /api/login · /api/logout · GET /api/me
│   ├── tasks/
│   │   ├── tasks.controller.ts  # list/create (scoped) + the vulnerable by-id endpoints
│   │   ├── tasks.service.ts     # queries (list · create · find · update · remove)
│   │   ├── auth.guard.ts        # session guard (no tenant check)
│   │   └── tasks.module.ts
│   ├── db/
│   │   ├── schema.ts         # Drizzle schema (orgs + users + tasks)
│   │   ├── client.ts         # Postgres connection
│   │   ├── migrate.ts        # applies migrations on startup
│   │   └── seed.ts           # seeds 3 organizations (flag on the victim's task)
│   └── public/               # the board UI (html/css/js)
├── drizzle/                  # generated SQL migrations
├── tests/                    # http smoke tests (vitest + supertest)
├── GUIDE.md                  # non-spoiler learning guide
├── SOLUTION.md               # exploit writeup + the fix (spoilers)
├── SECURITY.md               # security policy (it's a lab — read before reporting)
├── .github/workflows/        # integration · delivery · security · release
├── Dockerfile                # hardened multi-stage image (node:26-slim)
├── docker-compose.yml        # postgres + tasknest + traefik stack
├── docker-entrypoint.sh      # migrates + seeds, then starts the app
└── .env.example              # DB creds, session secret, Traefik ACME
```

The flag is **not** in the repo: the `Dockerfile` bakes it in via a build arg
and the seed writes it into the victim organization's task.

<br>

## 🚀 The Lab

The lab ships as a Docker Compose stack with three services:

- **`postgres`** — Postgres 16. The app waits until it is *healthy* before migrating.
- **`tasknest`** — the API + task board UI, published on port `3000`.
- **`traefik`** — an optional reverse proxy for HTTPS on a real hostname.

Because the stack attaches to an **external** Docker network (`iv0ks-dev`),
create it once before the first run:

```bash
docker network create iv0ks-dev
```

<br>

#### Option A — app + database (quickest)

Build and start the database and the app (Compose skips `traefik` when you name
services explicitly):

```bash
docker compose up -d --build postgres tasknest
```

The entrypoint migrates the schema and seeds the data automatically, so the app
is ready at:

- **<http://localhost:3000>**

Sign in with the seeded demo account **`alice` / `password123`**. That is all
you need to start playing with Burp Suite.

<br>

#### Option B — full stack with Traefik (HTTPS + hostname)

Bring up everything to also expose the app through Traefik with TLS:

```bash
docker compose up -d --build
```

Now the _same_ app is reachable two ways at once:

- **<http://localhost:3000>** — direct, no TLS (handy for quick testing).
- **<https://tasknest.iv0ks.dev>** — proxied by Traefik with a real certificate.

Traefik routing is defined in `tools/traefik/`. TLS uses the ACME DNS-01
challenge via Namecheap, so Traefik needs those API credentials — copy
`.env.example` to `.env` and fill them in (the `.env` file is gitignored). The
dashboard is at `https://traefik.iv0ks.dev`.

<br>

> [!CAUTION]
> The `tasknest.iv0ks.dev` hostname must resolve to the host running the stack.
> For purely local experiments, Option A (localhost) is simpler and needs no
> DNS or certificates.

<br>

## 🎯 The Challenge

### The Scenario

tasknest is a team task manager used by several companies at once. Every
company is an **organization** with its own private board. You sign in as
**alice**, who works at *Northwind Traders*, and your board lists *Northwind's*
tasks — each one with a plain task number. A legitimate user only ever sees and
edits their own organization's tasks. You're going to find out whether the walls
between the organizations are real.

### Your objective

Reach a task that belongs to **another organization** — specifically, the
confidential task of the company *Globex Corporation* — and capture the flag
hidden in it. You'll also want to prove you can **change** and **delete** data
across the boundary.

> [!NOTE]
> The flag has the format `FLAG{...}`.

### The rules

Everything happens over HTTP against the running app — no need to read the
source to win (though you can). The flag is **not** in the repo: it lives in
another organization's task in the database, reachable only by breaking access
control on the running app. Look closely at what your own board tells you about
how tasks are numbered.

> [!TIP]
> For the full method, the **[Learning Guide](GUIDE.md)** walks you through it.

<br>

## ⚖️ Legal / ethics

This is an **educational, deliberately vulnerable** lab. Run it only locally, on
owned, isolated infrastructure (Docker). Never deploy it publicly, and never use
these techniques against systems without explicit written authorization.
