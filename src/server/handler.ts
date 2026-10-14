/**
 * The robot's server side as one function from a web Request to a Response (the Fetch API), so the same code runs in
 * Next.js route handlers, Express or Connect (node.ts), Vite's dev server (vite.ts), Hono, Bun or Deno, and the CLI's
 * own `feedback-robot serve`.
 *
 * Routes, under `basePath` (default /api/feedback-robot):
 *
 *   GET  <base>                     the sender's messages, newest first, with where each stands
 *   POST <base>                     a message from the robot (its screenshots as PNG data URLs)
 *   GET  <base>/<id>/shot?name=     one of the sender's pictures (screen or focus)
 *   GET  <base>/sync?since=&after=  messages changed since a point: the remote watcher's pull (Bearer sync key)
 *   POST <base>/<id>/status         where a message stands, with a note (Bearer sync key)
 *
 * Off in production unless `enabled: true`, and then only with `author` (who is signed in): the robot sends
 * screenshots of whatever is on screen, so a deployed inbox must know who is sending.
 */
import crypto from 'node:crypto';
import { ZodError } from 'zod';
import { FileStore, summarise, type FeedbackStore } from './store';
import { StatusSchema } from './schema';
import { LOCAL_SHOT_LIMITS, REMOTE_SHOT_LIMITS, isFeedbackId, type FeedbackAuthor, type ShotLimits } from '../types';

export interface FeedbackHandlerOptions {
    /** Where the routes are mounted. Default '/api/feedback-robot'. */
    basePath?: string;
    /** Where messages are kept. Default: a FileStore in `dir`. */
    store?: FeedbackStore;
    /** The FileStore's folder. Default FEEDBACK_ROBOT_DIR, else `.feedback-robot/inbox` in the current directory. */
    dir?: string;
    /** Default: on unless NODE_ENV is 'production'. */
    enabled?: boolean;
    /** Who is sending (your app's signed-in user), or null to refuse. Default, outside production: you, on this machine. */
    author?: (req: Request) => FeedbackAuthor | null | Promise<FeedbackAuthor | null>;
    /** The longest screenshot data URLs kept. Default: LOCAL_SHOT_LIMITS, or REMOTE_SHOT_LIMITS in production. */
    limits?: ShotLimits;
    /** Opens the sync and status routes for `feedback-robot watch --remote`. Default FEEDBACK_ROBOT_SYNC_KEY. At least 32 characters. */
    syncKey?: string;
    /** Messages one sender may send in an hour: a safety net for a stuck page. Default 60. */
    perHour?: number;
    /** Origins allowed to call from another origin (the robot on a page served elsewhere): 'loopback' allows any localhost port. */
    cors?: 'loopback' | string[];
}

const LOCAL_AUTHOR: FeedbackAuthor = { id: 'local', name: 'You' };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}

function sameKey(given: string, key: string): boolean {
    const a = crypto.createHash('sha256').update(given).digest();
    const b = crypto.createHash('sha256').update(key).digest();
    return crypto.timingSafeEqual(a, b);
}

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function createFeedbackHandler(opts: FeedbackHandlerOptions = {}): (req: Request) => Promise<Response> {
    const production = process.env.NODE_ENV === 'production';
    const enabled = opts.enabled ?? !production;
    if (enabled && production && !opts.author)
        throw new Error('feedback-robot: in production, pass `author` (who is signed in), or the robot would take screenshots from anyone.');
    const base = `/${(opts.basePath ?? '/api/feedback-robot').replace(/^\/+|\/+$/g, '')}`;
    const store = opts.store ?? new FileStore(opts.dir);
    const limits = opts.limits ?? (production ? REMOTE_SHOT_LIMITS : LOCAL_SHOT_LIMITS);
    const syncKey = opts.syncKey ?? process.env.FEEDBACK_ROBOT_SYNC_KEY ?? null;
    if (syncKey !== null && syncKey.length < 32) throw new Error('feedback-robot: the sync key must be at least 32 characters (openssl rand -hex 32).');
    const perHour = opts.perHour ?? 60;
    const authorOf = opts.author ?? (() => LOCAL_AUTHOR);
    const sent = new Map<string, number[]>();

    const corsHeaders = (req: Request): Record<string, string> => {
        const origin = req.headers.get('origin');
        if (!origin || !opts.cors) return {};
        const allowed = opts.cors === 'loopback' ? LOOPBACK.test(origin) : opts.cors.includes(origin);
        if (!allowed) return {};
        return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600' };
    };

    const keyed = (req: Request): boolean => {
        if (!syncKey) return false;
        const auth = req.headers.get('authorization') ?? '';
        return auth.startsWith('Bearer ') && sameKey(auth.slice(7).trim(), syncKey);
    };

    const tooMany = (who: string): boolean => {
        const now = Date.now();
        const recent = (sent.get(who) ?? []).filter((t) => now - t < 3_600_000);
        if (recent.length >= perHour) return true;
        recent.push(now);
        sent.set(who, recent);
        return false;
    };

    return async (req: Request): Promise<Response> => {
        const url = new URL(req.url);
        if (!enabled || !(url.pathname === base || url.pathname.startsWith(`${base}/`))) return json({ error: 'Not found' }, 404);
        const cors = corsHeaders(req);
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        const rest = url.pathname.slice(base.length).replace(/^\/+/, '').split('/').filter(Boolean);
        try {
            // The remote watcher's routes: the sync key, and nothing else, opens them.
            if (rest[0] === 'sync' && req.method === 'GET') {
                if (!keyed(req)) return json({ error: syncKey ? 'Wrong or missing sync key' : 'The sync is off: no sync key is set' }, syncKey ? 401 : 503, cors);
                const limit = Number(url.searchParams.get('limit') ?? 25) || 25;
                const page = await store.changes({ since: url.searchParams.get('since'), after: url.searchParams.get('after'), limit });
                return json(page, 200, cors);
            }
            if (rest.length === 2 && rest[1] === 'status' && req.method === 'POST') {
                if (!keyed(req)) return json({ error: syncKey ? 'Wrong or missing sync key' : 'The sync is off: no sync key is set' }, syncKey ? 401 : 503, cors);
                if (!isFeedbackId(rest[0])) return json({ error: 'No such message' }, 404, cors);
                const body = StatusSchema.parse(await req.json());
                const item = await store.setStatus(rest[0], body.status, body.reply);
                return json({ item: summarise(item) }, 200, cors);
            }

            if (rest.length === 2 && rest[1] === 'shot' && req.method === 'GET') {
                const which = url.searchParams.get('name') === 'focus' ? 'focus' : 'screen';
                const item = await store.get(rest[0]);
                // The sender's own pictures; with the sync key, any (the remote watcher downloads them).
                const author = keyed(req) ? null : await authorOf(req);
                if (!item || !item.shots[which] || (author && item.author.id !== author.id) || (!author && !keyed(req))) return json({ error: 'There is no such picture' }, 404, cors);
                const bytes = await store.readShot(item.id, which);
                if (!bytes) return json({ error: 'There is no such picture' }, 404, cors);
                return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `inline; filename="${item.ref}-${which}.png"`, 'Cache-Control': 'private, no-store', ...cors } });
            }

            if (rest.length === 0) {
                const author = await authorOf(req);
                if (!author) return json({ error: 'Sign in to send feedback' }, 401, cors);
                if (req.method === 'GET') return json({ items: (await store.list({ authorId: author.id, limit: 15 })).map(summarise) }, 200, cors);
                if (req.method === 'POST') {
                    if (tooMany(author.id)) return json({ error: 'That’s a lot of messages in an hour. Try again a little later.' }, 429, cors);
                    const body = await req.json().catch(() => null);
                    if (!body) return json({ error: 'The message didn’t arrive. Try sending it again.' }, 400, cors);
                    const item = await store.create(body, author, { limits });
                    return json({ item: summarise(item) }, 201, cors);
                }
            }
            return json({ error: 'Not found' }, 404, cors);
        } catch (error) {
            // A refusal says why in words ("Keep the message under 4,000 characters"), not "Invalid request".
            if (error instanceof ZodError) return json({ error: error.issues[0]?.message ?? 'That message couldn’t be read' }, 400, cors);
            if (error instanceof Error && /not a PNG|No feedback/.test(error.message)) return json({ error: error.message }, 400, cors);
            console.error('[feedback-robot]', error);
            return json({ error: 'The message couldn’t be kept. Try again.' }, 500, cors);
        }
    };
}
