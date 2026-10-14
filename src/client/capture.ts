/**
 * The robot's screenshots: the window as the person sees it (maps included, the robot left out),
 * with the pointed-at part outlined in the robot's green, and a sharper close-up of that part.
 */
import { domToCanvas } from 'modern-screenshot';
import { freezeMaps } from './mapCapture';

export interface Shots {
    screen: string;
    focus: string | null;
}

interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

const GREEN = '#3fd07f';
/** Keep a capture to about 9 megapixels whatever the screen. */
const MAX_PIXELS = 9_000_000;
/** The longest PNG data URLs sent to a local inbox, safely under what it keeps (LOCAL_SHOT_LIMITS in ../types.ts). */
const MAX_URL = { screen: 18_000_000, focus: 9_000_000 };

/** What to aim for under the server's limits (a deployed app's are small: Vercel takes at most 4.5 MB a request). */
export function urlBudget(limits?: { screen: number; focus: number } | null): { screen: number; focus: number } {
    if (!limits) return MAX_URL;
    return { screen: Math.min(MAX_URL.screen, Math.floor(limits.screen * 0.95)), focus: Math.min(MAX_URL.focus, Math.floor(limits.focus * 0.95)) };
}

/** A canvas as a PNG data URL of at most `max` characters: drawn smaller until it fits (a satellite basemap barely compresses). */
function pngWithin(canvas: HTMLCanvasElement, max: number): string {
    let current = canvas;
    let url = current.toDataURL('image/png');
    for (let i = 0; url.length > max && i < 8; i++) {
        const smaller = document.createElement('canvas');
        smaller.width = Math.max(1, Math.round(current.width * 0.7));
        smaller.height = Math.max(1, Math.round(current.height * 0.7));
        smaller.getContext('2d')!.drawImage(current, 0, 0, smaller.width, smaller.height);
        current = smaller;
        url = current.toDataURL('image/png');
    }
    return url;
}

/** What showChosenOption reads and writes: an element of the cloned page (a select and its options). */
interface ClonedNode {
    nodeName: string;
    getAttribute(name: string): string | null;
    querySelectorAll?(selector: 'option'): ArrayLike<{ value: string; setAttribute(name: string, value: string): void; removeAttribute(name: string): void }>;
}

/**
 * A dropdown in a screenshot shows the option chosen on the page. modern-screenshot clones a select
 * with its chosen value as a `value` attribute, which a select ignores: it shows the option marked
 * selected, else its first, and React keeps the choice in the live element, not in the markup. So
 * the clone's chosen option is marked selected (and no other). For every node as it is cloned.
 */
export function showChosenOption(cloned: Node | ClonedNode): void {
    const el = cloned as ClonedNode;
    if (el.nodeName !== 'SELECT' || typeof el.getAttribute !== 'function' || !el.querySelectorAll) return;
    const chosen = el.getAttribute('value');
    if (chosen === null) return;
    const options = Array.from(el.querySelectorAll('option'));
    if (!options.some((o) => o.value === chosen)) return;
    for (const o of options) {
        if (o.value === chosen) o.setAttribute('selected', '');
        else o.removeAttribute('selected');
    }
}

function scaleFor(w: number, h: number): number {
    const want = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    return Math.max(0.75, Math.min(want, Math.sqrt(MAX_PIXELS / Math.max(1, w * h))));
}

function outline(ctx: CanvasRenderingContext2D, box: Box, scale: number, label: string | null) {
    const pad = 3 * scale;
    ctx.save();
    ctx.lineWidth = 3 * scale;
    ctx.strokeStyle = GREEN;
    ctx.setLineDash([]);
    ctx.strokeRect(box.x * scale - pad, box.y * scale - pad, box.w * scale + pad * 2, box.h * scale + pad * 2);
    if (label) {
        ctx.font = `600 ${12 * scale}px ui-sans-serif, system-ui, sans-serif`;
        const text = label.length > 70 ? `${label.slice(0, 69)}…` : label;
        const tw = ctx.measureText(text).width + 12 * scale;
        const th = 20 * scale;
        let lx = box.x * scale - pad;
        let ly = box.y * scale - pad - th - 2 * scale;
        if (ly < 0) ly = (box.y + box.h) * scale + pad + 2 * scale;
        lx = Math.max(0, Math.min(ctx.canvas.width - tw, lx));
        ctx.fillStyle = GREEN;
        ctx.fillRect(lx, ly, tw, th);
        ctx.fillStyle = '#06210f';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, lx + 6 * scale, ly + th / 2);
    }
    ctx.restore();
}

/** Screenshot the window. `target` is the pointed-at part in window coordinates; `limits` the server's (ShotLimits). */
export async function captureWindow(target: Box | null, label: string | null, limits?: { screen: number; focus: number } | null): Promise<Shots> {
    const budget = urlBudget(limits);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = scaleFor(vw, vh);
    // Full-screen pages position everything against the window, so <body> can measure 0 px tall:
    // render at least the window's size (and the whole page where it scrolls).
    const fullW = Math.max(vw, document.documentElement.scrollWidth, document.body.scrollWidth);
    const fullH = Math.max(vh, document.documentElement.scrollHeight, document.body.scrollHeight);
    const thaw = await freezeMaps();
    let page: HTMLCanvasElement;
    try {
        page = await domToCanvas(document.body, {
            scale,
            width: fullW,
            height: fullH,
            style: { margin: '0', width: `${fullW}px`, height: `${fullH}px` },
            backgroundColor: getComputedStyle(document.body).backgroundColor || '#0d0e13',
            filter: (node) => !(node instanceof Element && node.closest('[data-feedback-bot]')),
            // Dropdowns show what is chosen, not their first option.
            onCloneEachNode: showChosenOption,
            features: { restoreScrollPosition: true },
            timeout: 20_000,
        });
    } finally {
        thaw();
    }
    if (!page.width || !page.height) throw new Error('The screenshot came out empty. Untick “Include a screenshot” to send without one.');
    // The window's part of the page (the whole page when it doesn't scroll).
    const sx = Math.round(window.scrollX * scale);
    const sy = Math.round(window.scrollY * scale);
    const screen = document.createElement('canvas');
    screen.width = Math.round(vw * scale);
    screen.height = Math.round(vh * scale);
    const ctx = screen.getContext('2d')!;
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#0d0e13';
    ctx.fillRect(0, 0, screen.width, screen.height);
    ctx.drawImage(page, sx, sy, screen.width, screen.height, 0, 0, screen.width, screen.height);

    // The close-up is cut before the outline is drawn, with some of the surroundings.
    let focus: string | null = null;
    if (target && target.w > 0 && target.h > 0) {
        const margin = 28;
        const x0 = Math.max(0, target.x - margin);
        const y0 = Math.max(0, target.y - margin);
        const x1 = Math.min(vw, target.x + target.w + margin);
        const y1 = Math.min(vh, target.y + target.h + margin);
        if (x1 - x0 > 8 && y1 - y0 > 8) {
            const crop = document.createElement('canvas');
            crop.width = Math.round((x1 - x0) * scale);
            crop.height = Math.round((y1 - y0) * scale);
            crop.getContext('2d')!.drawImage(screen, Math.round(x0 * scale), Math.round(y0 * scale), crop.width, crop.height, 0, 0, crop.width, crop.height);
            const cctx = crop.getContext('2d')!;
            outline(cctx, { x: target.x - x0, y: target.y - y0, w: target.w, h: target.h }, scale, null);
            focus = pngWithin(crop, budget.focus);
        }
    }
    if (target) outline(ctx, target, scale, label);
    return { screen: pngWithin(screen, budget.screen), focus };
}
