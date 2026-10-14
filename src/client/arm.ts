/**
 * The feedback robot's arm, as plain geometry so it can be tested: a curved arm from a shoulder
 * on the side facing the hand, with an elbow joint halfway and a hand turned along the arm.
 */
export interface Point {
    x: number;
    y: number;
}

export type Side = 'left' | 'right';

/** The shoulders sit on the robot's sides, a little below its middle (in its 120-unit drawing, y 84). */
export function shoulderOf(bot: Point, size: number, side: Side): Point {
    const y = bot.y + size * (84 / 120);
    return side === 'left' ? { x: bot.x + size * (21 / 120), y } : { x: bot.x + size * (99 / 120), y };
}

/** The arm comes out of the side that faces the hand. */
export function sideFacing(bot: Point, size: number, hand: Point): Side {
    return hand.x < bot.x + size / 2 ? 'left' : 'right';
}

/** At rest the hand hangs by the robot, on the side facing the middle of the screen. */
export function restingHand(bot: Point, size: number, viewportWidth: number): Point {
    const side: Side = bot.x + size / 2 > viewportWidth / 2 ? 'left' : 'right';
    const s = shoulderOf(bot, size, side);
    return { x: s.x + (side === 'left' ? -size * 0.2 : size * 0.2), y: s.y + size * 0.3 };
}

function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

export interface Arm {
    /** SVG path data for the arm. */
    d: string;
    elbow: Point;
    /** Direction of the hand, in degrees (0 points right). */
    angle: number;
    length: number;
}

/** A gently drooping arm from the shoulder to the hand; `straight` (for reduced motion) draws it as a plain line. */
export function armBetween(shoulder: Point, hand: Point, straight = false): Arm {
    const dx = hand.x - shoulder.x;
    const dy = hand.y - shoulder.y;
    const length = Math.hypot(dx, dy);
    const lift = straight ? 0 : Math.min(90, length * 0.28);
    const c1 = { x: shoulder.x + dx * 0.3, y: shoulder.y + dy * 0.3 - lift };
    const c2 = { x: shoulder.x + dx * 0.72, y: shoulder.y + dy * 0.72 - lift * 0.55 };
    const r = (n: number) => Math.round(n * 10) / 10;
    const d = `M${r(shoulder.x)} ${r(shoulder.y)}C${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(hand.x)} ${r(hand.y)}`;
    const elbow = { x: r(cubic(shoulder.x, c1.x, c2.x, hand.x, 0.5)), y: r(cubic(shoulder.y, c1.y, c2.y, hand.y, 0.5)) };
    // The hand follows the arm's last stretch; a very short arm just points the way it reaches.
    const tx = length < 2 ? (dx >= 0 ? 1 : -1) : hand.x - c2.x;
    const ty = length < 2 ? 0 : hand.y - c2.y;
    const angle = Math.round((Math.atan2(ty, tx) * 180) / Math.PI);
    return { d, elbow, angle, length: Math.round(length) };
}

/** Keep a point (the hand) inside the window. */
export function clampToView(p: Point, w: number, h: number, margin = 4): Point {
    return { x: Math.max(margin, Math.min(w - margin, p.x)), y: Math.max(margin, Math.min(h - margin, p.y)) };
}

/** Where the hand rests on a pointed-at box, as fractions of it, so it stays put as the page moves. */
export function fractionIn(rect: { x: number; y: number; w: number; h: number }, p: Point): Point {
    const fx = rect.w > 0 ? (p.x - rect.x) / rect.w : 0.5;
    const fy = rect.h > 0 ? (p.y - rect.y) / rect.h : 0.5;
    return { x: Math.max(0, Math.min(1, fx)), y: Math.max(0, Math.min(1, fy)) };
}

export function pointIn(rect: { x: number; y: number; w: number; h: number }, f: Point): Point {
    return { x: rect.x + rect.w * f.x, y: rect.y + rect.h * f.y };
}
