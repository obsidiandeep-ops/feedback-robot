import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { FileStore, summarise } from '../src/server/store';
import { message, tempInbox, PNG } from './helpers';

const me = { id: 'u1', name: 'Alex' };

test('messages are numbered FB-1, FB-2 … and kept with their pictures, item.json last', async () => {
    const store = new FileStore(tempInbox());
    const [a, b] = await Promise.all([store.create(message('one'), me), store.create(message('two'), me)]);
    assert.deepEqual([a.ref, b.ref].sort(), ['FB-1', 'FB-2'], 'two at once never share a number');
    const dir = path.join(store.dir, a.id);
    assert.ok(existsSync(path.join(dir, 'screen.png')) && existsSync(path.join(dir, 'focus.png')));
    const kept = JSON.parse(readFileSync(path.join(dir, 'item.json'), 'utf8'));
    assert.equal(kept.status, 'new');
    assert.equal(kept.target.components[0], 'PricingCard');
    assert.equal(kept.console[0].text, 'Checkout failed: 402');
    assert.ok(!existsSync(path.join(dir, 'item.json.tmp')));
});

test('a picture over the limit is left out and the message says so; a picture that isn’t a PNG refuses the message', async () => {
    const store = new FileStore(tempInbox());
    const item = await store.create(message('big', { screen: PNG + 'A'.repeat(200) }), me, { limits: { screen: 100, focus: 10_000 } });
    assert.equal(item.shots.screen, null);
    assert.equal(item.shots.focus, 'focus.png');
    assert.match(item.message, /The screenshot was too large to keep, so it was left out/);
    await assert.rejects(store.create(message('fake', { screen: 'data:image/png;base64,AAAA' }), me), /not a PNG/);
});

test('the message itself is checked, and the robot’s details are cut to length rather than refused', async () => {
    const store = new FileStore(tempInbox());
    await assert.rejects(store.create(message('   '), me), /Write a message first/);
    await assert.rejects(store.create(message('x'.repeat(4001)), me), /under 4,000 characters/);
    const long = message('ok');
    long.target.text = 'y'.repeat(5000);
    const item = await store.create(long, me);
    assert.equal(item.target?.text?.length, 400);
});

test('list is newest first and per author; setStatus records Claude’s note; changes pages by (time, id)', async () => {
    const store = new FileStore(tempInbox());
    const t0 = new Date('2026-10-14T10:00:00Z');
    const a = await store.create(message('a'), me, { at: t0 });
    const b = await store.create(message('b'), { id: 'u2', name: 'Sam' }, { at: new Date(t0.getTime() + 1000) });
    assert.deepEqual((await store.list()).map((i) => i.ref), ['FB-2', 'FB-1']);
    assert.deepEqual((await store.list({ authorId: 'u1' })).map((i) => i.id), [a.id]);
    const done = await store.setStatus(a.id, 'done', 'Made it blue', new Date(t0.getTime() + 5000));
    assert.equal(summarise(done).reply, 'Made it blue');
    const first = await store.changes({ limit: 1 });
    assert.equal(first.changes[0].item.id, b.id);
    assert.equal(first.more, true);
    const next = await store.changes({ since: first.changes[0].changedAt, after: b.id, limit: 5 });
    assert.deepEqual(next.changes.map((c) => c.item.id), [a.id]);
    await assert.rejects(store.setStatus('fb-20260101-000000-0000', 'done'), /No feedback/);
});
