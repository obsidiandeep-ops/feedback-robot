import assert from 'node:assert/strict';
import test from 'node:test';
import { armBetween, fractionIn, pointIn, restingHand, shoulderOf, sideFacing } from '../src/client/arm';
import { clampBot, fromSavedPos, parseSavedPos, placeBeside, toSavedPos } from '../src/client/float';

test('the arm comes out of the side facing the hand, and the hand turns along it', () => {
    const bot = { x: 100, y: 100 };
    assert.equal(sideFacing(bot, 60, { x: 50, y: 0 }), 'left');
    assert.equal(sideFacing(bot, 60, { x: 400, y: 0 }), 'right');
    const arm = armBetween(shoulderOf(bot, 60, 'right'), { x: 400, y: 142 });
    assert.equal(arm.length, 251);
    assert.ok(arm.angle > 0 && arm.angle < 45, 'reaching right, the hand points right and a little down (the arm droops)');
    assert.match(arm.d, /^M\d/);
    const rest = restingHand({ x: 900, y: 500 }, 60, 1000);
    assert.ok(rest.x < 900 + 30, 'on the right of the screen it rests on its left');
});

test('a saved place survives a resize, and a picked point stays put on its box', () => {
    const saved = toSavedPos({ x: 1100, y: 700 }, { w: 1200, h: 800 }, 60);
    assert.deepEqual(saved, { h: 'right', dx: 40, v: 'bottom', dy: 40 });
    assert.deepEqual(fromSavedPos(saved, { w: 800, h: 600 }, 60), { x: 700, y: 500 });
    assert.equal(parseSavedPos({ h: 'up', dx: 1, v: 'top', dy: 1 }), null);
    assert.deepEqual(clampBot({ x: -50, y: 9999 }, { w: 400, h: 300 }, 60), { x: 6, y: 234 });
    const rect = { x: 10, y: 20, w: 100, h: 50 };
    assert.deepEqual(pointIn(rect, fractionIn(rect, { x: 35, y: 45 })), { x: 35, y: 45 });
});

test('the panel opens beside the robot where there is room, and fits a narrow window', () => {
    assert.equal(placeBeside({ x: 100, y: 300 }, 60, { w: 360, h: 500 }, { w: 1280, h: 800 }).x, 172, 'to the right');
    assert.equal(placeBeside({ x: 1100, y: 300 }, 60, { w: 360, h: 500 }, { w: 1280, h: 800 }).x, 728, 'to the left');
    const narrow = placeBeside({ x: 20, y: 520 }, 60, { w: 318, h: 500 }, { w: 334, h: 603 });
    assert.ok(narrow.x >= 8 && narrow.x + 318 <= 334 - 8 + 1, 'inside the window');
});
