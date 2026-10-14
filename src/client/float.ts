/**
 * Where the robot floats, as pure functions so they can be tested: drag it anywhere (it remembers where, measured
 * from the nearest edges so it survives a resize); its panel and speech bubbles open beside it wherever there is
 * room, never over it.
 */

export interface Point {
    x: number;
    y: number;
}

export interface Size {
    w: number;
    h: number;
}

/** How far a press must travel before it is a drag rather than a click. */
export const DRAG_THRESHOLD = 5;
const EDGE = 6;

export function clampBot(point: Point, viewport: Size, size: number): Point {
    return {
        x: Math.round(Math.max(EDGE, Math.min(viewport.w - size - EDGE, point.x))),
        y: Math.round(Math.max(EDGE, Math.min(viewport.h - size - EDGE, point.y))),
    };
}

/** A position as stored: measured from the nearest edges, so it survives a resize. */
export interface SavedPos {
    h: 'left' | 'right';
    dx: number;
    v: 'top' | 'bottom';
    dy: number;
}

export function toSavedPos(point: Point, viewport: Size, size: number): SavedPos {
    const right = viewport.w - (point.x + size);
    const bottom = viewport.h - (point.y + size);
    return {
        h: right < point.x ? 'right' : 'left',
        dx: Math.max(0, Math.round(right < point.x ? right : point.x)),
        v: bottom < point.y ? 'bottom' : 'top',
        dy: Math.max(0, Math.round(bottom < point.y ? bottom : point.y)),
    };
}

export function fromSavedPos(saved: SavedPos, viewport: Size, size: number): Point {
    return clampBot({ x: saved.h === 'right' ? viewport.w - size - saved.dx : saved.dx, y: saved.v === 'bottom' ? viewport.h - size - saved.dy : saved.dy }, viewport, size);
}

export function parseSavedPos(raw: unknown): SavedPos | null {
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as Record<string, unknown>;
    if (value.h !== 'left' && value.h !== 'right') return null;
    if (value.v !== 'top' && value.v !== 'bottom') return null;
    const dx = Number(value.dx);
    const dy = Number(value.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx < 0 || dy < 0 || dx > 20_000 || dy > 20_000) return null;
    return { h: value.h, dx, v: value.v, dy };
}

export interface Placement {
    x: number;
    y: number;
    /** Set when the box had to be shortened to fit above or below. */
    h?: number;
}

/**
 * Where a box (the panel, a speech bubble) opens beside the robot: to whichever side has room, extending up or
 * down; if neither side has room, above or below it, shortened if it must be.
 */
export function placeBeside(bot: Point, size: number, box: Size, viewport: Size, gap = 12, margin = 8): Placement {
    const { w, h } = box;
    const W = viewport.w;
    const H = viewport.h;
    const roomRight = W - (bot.x + size + gap) - margin;
    const roomLeft = bot.x - gap - margin;
    const clampX = (x: number) => Math.max(margin, Math.min(W - w - margin, x));
    const clampY = (y: number) => Math.max(margin, Math.min(H - h - margin, y));
    if (roomRight >= w || roomLeft >= w) {
        const toRight = roomRight >= w && (roomLeft < w || roomRight >= roomLeft);
        const roomDown = H - bot.y - margin;
        const roomUp = bot.y + size - margin;
        const down = roomDown >= h || (roomUp < h && roomDown >= roomUp);
        return { x: Math.round(toRight ? bot.x + size + gap : bot.x - gap - w), y: Math.round(clampY(down ? bot.y : bot.y + size - h)) };
    }
    const roomBelow = H - (bot.y + size + gap) - margin;
    const roomAbove = bot.y - gap - margin;
    const below = roomBelow >= h || roomBelow >= roomAbove;
    const height = Math.max(Math.min(h, below ? roomBelow : roomAbove), Math.min(h, 300));
    const x = clampX(bot.x + size / 2 > W / 2 ? bot.x + size - w : bot.x);
    const y = Math.max(margin, Math.min(H - height - margin, below ? bot.y + size + gap : bot.y - gap - height));
    return { x: Math.round(x), y: Math.round(y), ...(height < h ? { h: Math.round(height) } : {}) };
}

/** Where the pupils look: towards the pointer when it is near, straight ahead when far. */
export function gazeAt(center: Point, pointer: Point | null, reach = 3, radius = 480): Point {
    if (!pointer) return { x: 0, y: 0 };
    const dx = pointer.x - center.x;
    const dy = pointer.y - center.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1 || distance > radius) return { x: 0, y: 0 };
    const scale = (Math.min(1, distance / 140) * reach) / distance;
    return { x: Math.round(dx * scale * 10) / 10, y: Math.round(dy * scale * 10) / 10 };
}

/** A value kept in this browser (JSON in localStorage), or null. */
export function readStore(key: string): unknown {
    try {
        const raw = window.localStorage.getItem(key);
        return raw == null ? null : JSON.parse(raw);
    } catch {
        return null;
    }
}

export function writeStore(key: string, value: unknown) {
    try {
        if (value == null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Private windows and blocked storage: the robot simply forgets.
    }
}

export const viewport = (): Size => ({ w: window.innerWidth, h: window.innerHeight });
