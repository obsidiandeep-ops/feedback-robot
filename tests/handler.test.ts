import assert from 'node:assert/strict';
import test from 'node:test';
import { createFeedbackHandler } from '../src/server/handler';
import { message, tempInbox } from './helpers';

const BASE = 'http://localhost:3000/api/feedback-robot';
const KEY = 'k'.repeat(40);
const post = (url: string, body: unknown, headers: Record<string, string> = {}) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('send, list and open one’s own picture; the handler answers nothing outside its base path', async () => {
    const handle = createFeedbackHandler({ dir: tempInbox(), enabled: true });
    const sent = await handle(post(BASE, message()));
    assert.equal(sent.status, 201);
    const { item } = (await sent.json()) as { item: { id: string; ref: string; status: string; shots: { screen: boolean } } };
    assert.equal(item.ref, 'FB-1');
    assert.equal(item.shots.screen, true);
    const list = (await (await handle(new Request(BASE))).json()) as { items: Array<{ id: string }> };
    assert.deepEqual(list.items.map((i) => i.id), [item.id]);
    const shot = await handle(new Request(`${BASE}/${item.id}/shot?name=focus`));
    assert.equal(shot.headers.get('content-type'), 'image/png');
    assert.equal((await handle(new Request('http://localhost:3000/api/other'))).status, 404);
});

test('a refusal says why in words', async () => {
    const handle = createFeedbackHandler({ dir: tempInbox(), enabled: true });
    const res = await handle(post(BASE, message('')));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'Write a message first' });
});

test('off in production unless enabled, and enabled there only with an author', async () => {
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        assert.equal((await createFeedbackHandler({ dir: tempInbox() })(new Request(BASE))).status, 404);
        assert.throws(() => createFeedbackHandler({ dir: tempInbox(), enabled: true }), /pass `author`/);
        const handle = createFeedbackHandler({ dir: tempInbox(), enabled: true, author: (req) => (req.headers.get('x-user') ? { id: req.headers.get('x-user')!, name: 'Alex' } : null) });
        assert.equal((await handle(post(BASE, message()))).status, 401);
        const mine = (await (await handle(post(BASE, message(), { 'x-user': 'alex' }))).json()) as { item: { id: string } };
        // Someone else can neither list nor open Alex's pictures.
        const theirs = (await (await handle(new Request(BASE, { headers: { 'x-user': 'sam' } }))).json()) as { items: unknown[] };
        assert.equal(theirs.items.length, 0);
        assert.equal((await handle(new Request(`${BASE}/${mine.item.id}/shot?name=screen`, { headers: { 'x-user': 'sam' } }))).status, 404);
    } finally {
        process.env.NODE_ENV = was;
    }
});

test('the sync and status routes open with the key and nothing else', async () => {
    const off = createFeedbackHandler({ dir: tempInbox(), enabled: true });
    assert.equal((await off(new Request(`${BASE}/sync`))).status, 503, 'no key set: the sync is off');
    assert.throws(() => createFeedbackHandler({ dir: tempInbox(), enabled: true, syncKey: 'short' }), /at least 32/);
    const handle = createFeedbackHandler({ dir: tempInbox(), enabled: true, syncKey: KEY });
    const { item } = (await (await handle(post(BASE, message()))).json()) as { item: { id: string } };
    assert.equal((await handle(new Request(`${BASE}/sync`, { headers: { authorization: 'Bearer wrong' } }))).status, 401);
    const page = (await (await handle(new Request(`${BASE}/sync?limit=10`, { headers: { authorization: `Bearer ${KEY}` } }))).json()) as { changes: Array<{ item: { id: string } }> };
    assert.deepEqual(page.changes.map((c) => c.item.id), [item.id]);
    assert.equal((await handle(post(`${BASE}/${item.id}/status`, { status: 'done', reply: 'Fixed' }))).status, 401);
    const set = await handle(post(`${BASE}/${item.id}/status`, { status: 'done', reply: 'Fixed' }, { authorization: `Bearer ${KEY}` }));
    assert.equal(((await set.json()) as { item: { status: string } }).item.status, 'done');
    // The remote watcher downloads any picture with the key.
    assert.equal((await handle(new Request(`${BASE}/${item.id}/shot?name=screen`, { headers: { authorization: `Bearer ${KEY}` } }))).status, 200);
});

test('CORS for the standalone server: localhost origins only, and a rate limit per sender', async () => {
    const handle = createFeedbackHandler({ dir: tempInbox(), enabled: true, cors: 'loopback', perHour: 2 });
    const pre = await handle(new Request(BASE, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } }));
    assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const other = await handle(new Request(BASE, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
    assert.equal(other.headers.get('access-control-allow-origin'), null);
    assert.equal((await handle(post(BASE, message('1')))).status, 201);
    assert.equal((await handle(post(BASE, message('2')))).status, 201);
    assert.equal((await handle(post(BASE, message('3')))).status, 429);
});
