# tasknest: Learning Guide

![CWE-639](https://img.shields.io/badge/CWE--639-IDOR-red?style=flat-square)
![Node](https://img.shields.io/badge/Node-NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white)
![Docker](https://img.shields.io/badge/Lab-Docker-2496ED?style=flat-square&logo=docker&logoColor=white)

**tasknest is an intentionally vulnerable application built for security education.** It contains a deliberate [IDOR / broken access control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
(CWE-639) flaw so you can practice finding and exploiting it in a safe and controlled environment.

<br>

> [!TIP]
> A guided, **non-spoiler** path to solving this lab. It teaches the *method*, not the answer — the exact winning request and the flag stay in [SOLUTION.md](SOLUTION.md).

<br>

## 🧬 What broken access control is

Here is the whole idea in one sentence:

> **Broken access control happens when an app checks _who you are_ but forgets
> to check _whether you're allowed to touch this particular thing_.**

Logging in answers "who are you?" — that's **authentication**. Deciding whether
*this* user may read, edit or delete *this* task is a separate question —
that's **authorization**. This lab is an **IDOR** (Insecure Direct Object
Reference): the app takes a task reference from the request and acts on the
task, never asking whether it belongs to the caller.

The twist here is **who the caller is working for**. Earlier labs asked "is this
*your* object?" (an owner id). In a **multi-tenant** product the question
is bigger: every customer company (a *tenant*) must be walled off from every
other. The tenant boundary is the most important authorization rule such a
product has — and tasknest forgets to enforce it on the endpoints that address a
single task.

Think of an office building where every company has its own floor, and the
elevator takes anyone to any floor if they press the number. The receptionist
checked your badge at the door (you *are* an employee) — but nobody checks
whether you work on the floor you're visiting.

> Want the deeper background — horizontal vs vertical escalation, why id format
> is never the control, and the full workflow with **Burp Suite** and **OWASP
> ZAP**? Read the shared
> **[Broken Access Control field guide](https://github.com/iv0ks/appsec-labs/blob/main/docs/broken-access-control.md)**.
> This lab is a hands-on application of it.

<br>

## 🎓 What this level teaches

**Level 6 — tenant isolation: the boundary between whole organizations.** The
task endpoints that work on **one task by its number** never compare the task's
organization with yours. Your own board is filtered correctly — which is exactly
what makes the gap easy to miss — but the lookup-by-number paths are not.

- **Entry points:**
  - `GET /api/tasks/:id` — read a task.
  - `PATCH /api/tasks/:id` — modify a task.
  - `DELETE /api/tasks/:id` — delete a task.
- **The broken defence:** "you must be logged in, and you only ever click tasks
  from your own board" — the app trusts the number that comes back.
- **What you can see legitimately:** your own organization's board, via
  `GET /api/tasks`.
- **The target:** another organization's task. The task numbers are **one
  counter shared by every tenant**, so your own numbers reveal the shape of the
  space you are *not* supposed to see.

## 🪧 How to approach it

1. Sign in as `alice` through your proxy and load the board. Write down the task
   numbers on your cards and the organization name you belong to.
2. Open one of your own tasks and capture that request in your proxy. That's your
   **baseline**: `GET /api/tasks/<your-number>` returns your task. Note the fields
   in the response — one of them says which organization the task belongs to.
3. Look at your numbers. Are they `1, 2, 3` and nothing more, or does the counter
   obviously continue past them? Who owns the numbers *between* and *after* yours?
4. Send the same request with a number that is **not** on your board. Compare the
   response with your baseline: whose task is it, and what organization does it
   claim?
5. Find the organization that is not yours and read what it keeps there. Then ask
   yourself whether the other verbs (`PATCH`, `DELETE`) are guarded any better.

## 🕵️‍♂️ Going further

Once you realise the endpoints act on *any* number, the exposure is every task of
every tenant in the system — you can walk the whole counter. Keep a second
identity from another organization handy (see the end of SOLUTION.md for the
seeded accounts) to prove, in both
directions, that an organization's data is reachable from *outside* it. That
contrast — different organization, same session privileges — is the proof of a
broken tenant boundary, independent of how the UI behaves.

Be careful with the write verbs on shared lab data: deleting a task is
irreversible until you re-seed the stack.

## 🤔 Why it matters

Multi-tenant SaaS is built on one promise: *my data is mine*. Most real-world
tenant leaks are not clever crypto attacks — they are a missing
`AND org_id = :mine` in one query that someone wrote in a hurry. Because the list
page is usually scoped correctly, the bug survives code review and manual testing
until an attacker changes one number. Learning to test **cross-tenant** access
with two identities from two organizations is the core skill this level builds.

---

When you have captured the flag (or want to check the fix and the *why* behind
it), continue to **[SOLVE → SOLUTION.md](SOLUTION.md)**.

<br>

> **Legal / ethics.** This is an educational, deliberately vulnerable lab. Run it
> only locally, on owned, isolated infrastructure, and never use these techniques
> against systems without explicit written authorization.
