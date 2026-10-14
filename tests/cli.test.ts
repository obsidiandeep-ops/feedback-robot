import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { FileStore } from '../src/server/store';
import { message, tempInbox } from './helpers';

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const TSX = require.resolve('tsx/cli');
const CLI = path.join(import.meta.dirname, '..', 'src', 'cli', 'index.ts');
const cli = (...args: string[]) => run(process.execPath, [TSX, CLI, ...args], { env: { ...process.env, FEEDBACK_ROBOT_REMOTE: '' } });

test('watch announces a new message once, with what Claude needs; set answers it; list shows it', async () => {
    const dir = tempInbox();
    const item = await new FileStore(dir).create(message('Make the button blue'), { id: 'local', name: 'You' });
    const first = await cli('watch', '--dir', dir, '--hours', '0.001');
    assert.match(first.stdout, /1 new message from the feedback robot/);
    assert.match(first.stdout, /FB-1 · fb-/);
    assert.match(first.stdout, /Pointing at: PricingCard · div\.card/);
    assert.match(first.stdout, /Components \(nearest first\): PricingCard < PricingPage/);
    assert.match(first.stdout, /\[error\] Checkout failed: 402/);
    assert.match(first.stdout, new RegExp(`Screenshot: .*${item.id}/screen\\.png`));
    const again = await cli('watch', '--dir', dir, '--hours', '0.0003');
    assert.match(again.stdout, /No feedback in the last/, 'announced once');
    const set = await cli('set', 'FB-1', 'done', 'Made it blue', '--dir', dir);
    assert.match(set.stdout, /FB-1 is now done: Made it blue/);
    const kept = JSON.parse(readFileSync(path.join(dir, item.id, 'item.json'), 'utf8'));
    assert.equal(kept.status, 'done');
    assert.equal(kept.reply, 'Made it blue');
    const list = await cli('list', '--dir', dir);
    assert.match(list.stdout, /FB-1\s+done\s+local\s+\/pricing/);
    await assert.rejects(cli('set', 'FB-1', 'finished', '--dir', dir), /Status must be one of/);
});
