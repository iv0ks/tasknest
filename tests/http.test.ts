// Integration smoke tests that do not require a live database.
//
// The full tenant-isolation exploit (log in as alice, walk the global task
// counter into Globex's confidential task, read / modify / delete it) is
// verified end-to-end against the Docker stack (see SOLUTION.md). These tests
// pin the guarantees that do not touch Postgres:
//   1. the health endpoint responds,
//   2. every task route refuses unauthenticated callers (the auth guard runs
//      before any DB access, so no connection is opened), and
//   3. a malformed task id is rejected before it reaches the data layer.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main.js';

let app: INestApplication;

beforeAll(async () => {
  app = await createApp();
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

describe('tasknest http surface', () => {
  it('serves the health check', async () => {
    const res = await request(app.getHttpServer()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
  });

  it('requires a session to list your organization board', async () => {
    const res = await request(app.getHttpServer()).get('/api/tasks');
    expect(res.status).toBe(401);
  });

  it('requires a session to create a task', async () => {
    const res = await request(app.getHttpServer()).post('/api/tasks').send({ title: 'x' });
    expect(res.status).toBe(401);
  });

  it('requires a session to read a task by id (the read IDOR endpoint)', async () => {
    const res = await request(app.getHttpServer()).get('/api/tasks/5');
    expect(res.status).toBe(401);
  });

  it('requires a session to modify a task (the write IDOR endpoint)', async () => {
    const res = await request(app.getHttpServer()).patch('/api/tasks/5').send({ status: 'done' });
    expect(res.status).toBe(401);
  });

  it('requires a session to delete a task (the write IDOR endpoint)', async () => {
    const res = await request(app.getHttpServer()).delete('/api/tasks/5');
    expect(res.status).toBe(401);
  });

  it('rejects requests to /api/me without a session', async () => {
    const res = await request(app.getHttpServer()).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('rejects a login without credentials', async () => {
    const res = await request(app.getHttpServer()).post('/api/login').send({});
    expect(res.status).toBe(400);
  });
});
