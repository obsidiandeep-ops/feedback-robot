/**
 * What the robot, the server and the CLI share. A message goes from the robot to the server (FeedbackInput), is
 * kept as a FeedbackItem in the inbox (a folder per message, with its screenshots), and comes back to the robot as a
 * FeedbackSummary with where it stands and Claude's note.
 */

export const FEEDBACK_STATUSES = ['new', 'received', 'working', 'question', 'done'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** What Claude can set (from the CLI, or a remote inbox's status call): everything but new. */
export const REPLY_STATUSES = ['received', 'working', 'question', 'done'] as const;
export type ReplyStatus = (typeof REPLY_STATUSES)[number];

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** What the robot's hand was on, described so Claude can find it in the code. */
export interface FeedbackTarget {
    /** A CSS path short enough to read and specific enough to search for. */
    selector: string;
    tag: string;
    id?: string;
    classes: string[];
    role?: string;
    label?: string;
    text?: string;
    /** Its data-* attributes (a few, short ones). */
    data?: Record<string, string>;
    /** The React components it sits in, nearest first (development builds keep their names). */
    components: string[];
    rect: Rect;
    /** When the hand is on a registered map (registerMapForCapture): the place under it and the zoom. */
    map?: { lng: number; lat: number; zoom: number };
    /** The one-line name the robot showed while pointing. */
    summary: string;
}

export interface ConsoleEntry {
    level: 'error' | 'warn';
    text: string;
    at: string;
}

export interface FeedbackPage {
    url: string;
    path: string;
    title: string;
    viewport: { w: number; h: number };
    dpr: number;
}

/** What the robot sends. Screenshots are PNG data URLs. */
export interface FeedbackInput {
    message: string;
    page: FeedbackPage;
    target: FeedbackTarget | null;
    hand: { x: number; y: number } | null;
    console: ConsoleEntry[];
    screen: string | null;
    focus: string | null;
    replyTo?: string | null;
}

export interface FeedbackAuthor {
    id: string;
    name: string;
    email?: string;
}

/** A message as the inbox keeps it (item.json). */
export interface FeedbackItem {
    id: string;
    /** FB-n, numbered by the inbox. */
    ref: string;
    createdAt: string;
    updatedAt: string;
    author: FeedbackAuthor;
    message: string;
    page: FeedbackPage;
    target: FeedbackTarget | null;
    hand: { x: number; y: number } | null;
    console: ConsoleEntry[];
    shots: { screen: string | null; focus: string | null };
    replyTo: string | null;
    status: FeedbackStatus;
    /** Claude's note back: what it did, or what it needs to know. */
    reply: string | null;
    /** Set by the CLI's watcher once it has shown the message to Claude. */
    announcedAt?: string | null;
}

/** What the robot lists: no screenshots, no console. */
export interface FeedbackSummary {
    id: string;
    ref: string;
    createdAt: string;
    updatedAt: string;
    message: string;
    path: string;
    target: string | null;
    status: FeedbackStatus;
    reply: string | null;
    replyTo: string | null;
    /** Which pictures it has (the sender can open them: GET <endpoint>/<id>/shot?name=screen). */
    shots: { screen: boolean; focus: boolean };
}

/** The longest PNG data URLs the inbox keeps, in characters (a picture over its limit is left out and the message says so). */
export interface ShotLimits {
    screen: number;
    focus: number;
}

/** A local inbox: about 20 MB and 10 MB pictures (as base64 data URLs). */
export const LOCAL_SHOT_LIMITS: ShotLimits = { screen: Math.ceil((20_000_000 * 4) / 3) + 64, focus: Math.ceil((10_000_000 * 4) / 3) + 64 };

/** A deployed app behind a request-size limit (Vercel's is 4.5 MB): smaller pictures, drawn smaller until they fit. */
export const REMOTE_SHOT_LIMITS: ShotLimits = { screen: 3_000_000, focus: 1_000_000 };

export const FEEDBACK_ID = /^fb-\d{8}-\d{6}-[0-9a-f]{4}$/;
export const SHOT_NAMES = { screen: 'screen.png', focus: 'focus.png' } as const;
export type ShotName = keyof typeof SHOT_NAMES;

export function isFeedbackId(id: unknown): id is string {
    return typeof id === 'string' && FEEDBACK_ID.test(id);
}
