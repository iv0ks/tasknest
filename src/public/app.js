// tasknest front-end.
//
// The board lists your own organization's tasks (each card shows its task
// number). You can also "open a task by number". The UI only ever shows your
// own board on its own — the task numbers are a single counter shared by every
// organization, though, so the numbers on YOUR cards tell you where the other
// tenants' tasks live. Reaching another organization's task is the lab: ask the
// server for a number that is not on your board (e.g. from Burp Repeater) and
// see what GET /api/tasks/:id — and PATCH / DELETE — let you do.
//
// All dynamic text is written with textContent so the UI itself adds no XSS.
const $ = (sel) => document.querySelector(sel);

const loginCard = $('#login-card');
const boardView = $('#board-view');
const who = $('#who');

const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
const NEXT_STATUS = { todo: 'in_progress', in_progress: 'done', done: 'todo' };

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function card(t) {
  const node = el('button', 'task');
  node.type = 'button';
  node.appendChild(el('span', 't-id', `#${t.id}`));
  node.appendChild(el('span', 't-title', t.title));
  node.addEventListener('click', () => openTask(t.id));
  return node;
}

function renderBoard(rows) {
  document.querySelectorAll('.col').forEach((col) => {
    const box = col.querySelector('.cards');
    box.replaceChildren(...rows.filter((t) => t.status === col.dataset.status).map((t) => card(t)));
  });
}

function row(k, v) {
  const r = el('div', 'row');
  r.appendChild(el('span', 'k', k));
  r.appendChild(el('span', 'v', v));
  return r;
}

function renderDetail(t) {
  const box = el('div', 'detail');
  box.appendChild(el('h3', '', `#${t.id} · ${t.title}`));
  box.appendChild(row('status', STATUS_LABEL[t.status] ?? t.status));
  box.appendChild(row('description', t.description || '—'));
  box.appendChild(row('organization', String(t.orgId)));
  box.appendChild(row('created by', String(t.createdBy)));
  box.appendChild(
    row('updated', new Date(t.updatedAt).toISOString().slice(0, 16).replace('T', ' ')),
  );

  const actions = el('div', 'actions');
  const advance = el('button', 'secondary', `Move to ${STATUS_LABEL[NEXT_STATUS[t.status]]}`);
  advance.type = 'button';
  advance.addEventListener('click', async () => {
    await api(`/api/tasks/${t.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: NEXT_STATUS[t.status] }),
    });
    await loadBoard();
    await openTask(t.id);
  });
  const del = el('button', 'danger', 'Delete');
  del.type = 'button';
  del.addEventListener('click', async () => {
    await api(`/api/tasks/${t.id}`, { method: 'DELETE' });
    $('#viewer').replaceChildren();
    await loadBoard();
  });
  actions.append(advance, del);
  box.appendChild(actions);
  $('#viewer').replaceChildren(box);
}

async function openTask(id) {
  if (!id) return;
  const { status, body } = await api(`/api/tasks/${encodeURIComponent(id)}`);
  if (status !== 200) {
    $('#viewer').replaceChildren(el('p', 'error', body.message || 'could not open task'));
    return;
  }
  renderDetail(body.task);
}

async function loadBoard() {
  const me = await api('/api/tasks');
  if (me.status !== 200) return false;
  renderBoard(me.body.tasks);
  return true;
}

async function enter(userLabel, orgName) {
  who.textContent = userLabel;
  $('#org-name').textContent = orgName;
  loginCard.classList.add('hidden');
  boardView.classList.remove('hidden');
  await loadBoard();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  const f = e.target;
  const { status, body } = await api('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username: f.username.value, password: f.password.value }),
  });
  if (status !== 200) {
    $('#login-error').textContent = body.message || 'sign in failed';
    return;
  }
  await enter(`${body.user.displayName} · ${body.org?.name ?? ''}`, body.org?.name ?? '');
});

$('#new-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const { status } = await api('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: f.title.value }),
  });
  if (status === 201 || status === 200) {
    f.reset();
    await loadBoard();
  }
});

$('#open-form').addEventListener('submit', (e) => {
  e.preventDefault();
  openTask(e.target.id.value);
});

$('#logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  location.reload();
});

// Resume an existing session on page load.
(async () => {
  const me = await api('/api/me');
  if (me.status === 200) {
    await enter(`${me.body.username} · ${me.body.org?.name ?? ''}`, me.body.org?.name ?? '');
  }
})();
