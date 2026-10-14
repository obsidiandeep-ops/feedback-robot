import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A 1×1 PNG, as the robot sends its pictures. */
export const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export function tempInbox(): string {
    return path.join(mkdtempSync(path.join(os.tmpdir(), 'feedback-robot-')), 'inbox');
}

/** A message as the robot sends it. */
export function message(text = 'The button should be blue', extra: Record<string, unknown> = {}) {
    return {
        message: text,
        page: { url: 'http://localhost:3000/pricing', path: '/pricing', title: 'Pricing', viewport: { w: 1280, h: 800 }, dpr: 2 },
        target: {
            selector: 'main > div.card:nth-of-type(1)',
            tag: 'div',
            classes: ['card'],
            text: 'Starter, $9 a month. Buy now',
            components: ['PricingCard', 'PricingPage'],
            rect: { x: 24, y: 339, w: 286, h: 159 },
            summary: 'PricingCard · div.card · “Starter, $9 a month”',
        },
        hand: { x: 80, y: 360 },
        console: [{ level: 'error', text: 'Checkout failed: 402', at: '2026-10-14T10:00:00.000Z' }],
        screen: PNG,
        focus: PNG,
        replyTo: null,
        ...extra,
    };
}
