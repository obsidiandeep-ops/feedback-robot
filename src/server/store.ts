/**
 * The inbox: a folder per message under one directory (by default `.feedback-robot/inbox` in the project), each with
 * item.json, and screen.png and focus.png when the message has them. item.json is written last (to a temporary name,
 * then renamed), so the CLI's watcher never sees a message without its pictures.
 *
 * Messages are numbered FB-1, FB-2, … by the inbox. Anything with the same methods can stand in for FileStore
 * (a database and object storage for a deployed app): createFeedbackHandler takes a `store`.
 */
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { FeedbackInputSchema } from './schema';
import { FEEDBACK_ID, LOCAL_SHOT_LIMITS, SHOT_NAMES, isFeedbackId, type FeedbackAuthor, type FeedbackItem, type FeedbackStatus, type FeedbackSummary, type ShotLimits, type ShotName } from '../types';

export interface FeedbackChange {
    item: FeedbackItem;
    changedAt: string;
}

export interface FeedbackStore {
    /** Keep a message from the robot (validated here). A picture over `limits` is left out, and the message says so. */
    create(raw: unknown, author: FeedbackAuthor, opts?: { limits?: ShotLimits; at?: Date }): Promise<FeedbackItem>;
    /** Messages, newest first: one author's, or everyone's. */
    list(opts?: { authorId?: string; limit?: number }): Promise<FeedbackItem[]>;
    get(id: string): Promise<FeedbackItem | null>;
    /** Where a message stands, with Claude's note (the CLI, or a remote inbox's status call). */
    setStatus(id: string, status: FeedbackStatus, reply?: string | null, at?: Date): Promise<FeedbackItem>;
    readShot(id: string, name: ShotName): Promise<Uint8Array | null>;
    /** Messages changed after (since, after), oldest change first: what a remote watcher pulls, a page at a time. */
    changes(opts: { since?: string | null; after?: string | null; limit: number }): Promise<{ changes: FeedbackChange[]; more: boolean }>;
}

/** The inbox folder: FEEDBACK_ROBOT_DIR, else `.feedback-robot/inbox` in the current directory (the project). */
export function defaultInboxDir(): string {
    return process.env.FEEDBACK_ROBOT_DIR ?? path.join(process.cwd(), '.feedback-robot', 'inbox');
}

export function summarise(item: FeedbackItem): FeedbackSummary {
    return {
        id: item.id,
        ref: item.ref,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        message: item.message,
        path: item.page.path,
        target: item.target?.summary ?? null,
        status: item.status,
        reply: item.reply,
        replyTo: item.replyTo,
        shots: { screen: !!item.shots?.screen, focus: !!item.shots?.focus },
    };
}

function stamp(date: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** A screenshot's bytes, checked to be a PNG (its signature), so nothing else is kept under a .png name. */
function pngBytes(dataUrl: string): Buffer {
    const bytes = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
    if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) throw new Error('A screenshot was not a PNG');
    return bytes;
}

const plural = (names: string[]) => (names.length > 1 ? 'were' : 'was');
const pronoun = (names: string[]) => (names.length > 1 ? 'they were' : 'it was');

async function writeJson(file: string, value: unknown): Promise<void> {
    await fs.writeFile(`${file}.tmp`, JSON.stringify(value, null, 1));
    await fs.rename(`${file}.tmp`, file);
}

export class FileStore implements FeedbackStore {
    readonly dir: string;
    /** Creates one at a time in this process, so two messages never take the same FB- number. */
    private queue: Promise<unknown> = Promise.resolve();

    constructor(dir: string = defaultInboxDir()) {
        this.dir = dir;
    }

    private async read(id: string): Promise<FeedbackItem | null> {
        try {
            return JSON.parse(await fs.readFile(path.join(this.dir, id, 'item.json'), 'utf8')) as FeedbackItem;
        } catch {
            return null;
        }
    }

    private async all(): Promise<FeedbackItem[]> {
        let names: string[] = [];
        try {
            names = (await fs.readdir(this.dir)).filter((n) => FEEDBACK_ID.test(n));
        } catch {
            return [];
        }
        const items = await Promise.all(names.map((n) => this.read(n)));
        return items.filter((i): i is FeedbackItem => !!i).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    create(raw: unknown, author: FeedbackAuthor, opts: { limits?: ShotLimits; at?: Date } = {}): Promise<FeedbackItem> {
        const run = this.queue.then(() => this.createNow(raw, author, opts));
        this.queue = run.catch(() => undefined);
        return run;
    }

    private async createNow(raw: unknown, author: FeedbackAuthor, opts: { limits?: ShotLimits; at?: Date }): Promise<FeedbackItem> {
        const limits = opts.limits ?? LOCAL_SHOT_LIMITS;
        const at = opts.at ?? new Date();
        // A picture too big for this inbox never loses the message: it is left out, and the message says so.
        const tooBig: string[] = [];
        if (raw && typeof raw === 'object') {
            const body = raw as Record<string, unknown>;
            for (const key of ['screen', 'focus'] as const) {
                if (typeof body[key] === 'string' && (body[key] as string).length > limits[key]) {
                    body[key] = null;
                    tooBig.push(key === 'screen' ? 'screenshot' : 'close-up');
                }
            }
        }
        const input = FeedbackInputSchema.parse(raw);
        // Checked before anything is kept: a picture that isn't a PNG refuses the message.
        const bytes = { screen: input.screen ? pngBytes(input.screen) : null, focus: input.focus ? pngBytes(input.focus) : null };
        const id = `fb-${stamp(at)}-${crypto.randomBytes(2).toString('hex')}`;
        await fs.mkdir(this.dir, { recursive: true });
        const existing = await this.all();
        const folder = path.join(this.dir, id);
        await fs.mkdir(folder);
        const shots: FeedbackItem['shots'] = { screen: null, focus: null };
        for (const key of ['screen', 'focus'] as const) {
            const body = bytes[key];
            if (!body) continue;
            await fs.writeFile(path.join(folder, SHOT_NAMES[key]), body);
            shots[key] = SHOT_NAMES[key];
        }
        const highest = existing.reduce((max, i) => Math.max(max, Number(i.ref.replace('FB-', '')) || 0), 0);
        const note = tooBig.length ? `\n\n(The ${tooBig.join(' and ')} ${plural(tooBig)} too large to keep, so ${pronoun(tooBig)} left out.)` : '';
        const item: FeedbackItem = {
            id,
            ref: `FB-${highest + 1}`,
            createdAt: at.toISOString(),
            updatedAt: at.toISOString(),
            author,
            message: `${input.message}${note}`,
            page: input.page,
            target: input.target,
            hand: input.hand,
            console: input.console,
            shots,
            replyTo: input.replyTo ?? null,
            status: 'new',
            reply: null,
            announcedAt: null,
        };
        // Written last, so the watcher never sees a message without its pictures.
        await writeJson(path.join(folder, 'item.json'), item);
        return item;
    }

    async list(opts: { authorId?: string; limit?: number } = {}): Promise<FeedbackItem[]> {
        const all = await this.all();
        return all.filter((i) => !opts.authorId || i.author.id === opts.authorId).slice(0, opts.limit ?? 15);
    }

    get(id: string): Promise<FeedbackItem | null> {
        return isFeedbackId(id) ? this.read(id) : Promise.resolve(null);
    }

    async setStatus(id: string, status: FeedbackStatus, reply?: string | null, at = new Date()): Promise<FeedbackItem> {
        const item = isFeedbackId(id) ? await this.read(id) : null;
        if (!item) throw new Error(`No feedback ${id}`);
        item.status = status;
        if (reply !== undefined) item.reply = reply;
        item.updatedAt = at.toISOString();
        await writeJson(path.join(this.dir, id, 'item.json'), item);
        return item;
    }

    async readShot(id: string, name: ShotName): Promise<Uint8Array | null> {
        if (!isFeedbackId(id)) return null;
        try {
            return await fs.readFile(path.join(this.dir, id, SHOT_NAMES[name]));
        } catch {
            return null;
        }
    }

    async changes(opts: { since?: string | null; after?: string | null; limit: number }): Promise<{ changes: FeedbackChange[]; more: boolean }> {
        const limit = Math.max(1, Math.min(100, Math.floor(opts.limit)));
        const since = opts.since ? Date.parse(opts.since) : -Infinity;
        const after = opts.after ?? '';
        const sorted = (await this.all())
            .map((item) => ({ item, at: Date.parse(item.updatedAt) }))
            .filter(({ item, at }) => at > since || (at === since && item.id > after))
            .sort((a, b) => a.at - b.at || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));
        return { changes: sorted.slice(0, limit).map(({ item }) => ({ item, changedAt: item.updatedAt })), more: sorted.length > limit };
    }
}
