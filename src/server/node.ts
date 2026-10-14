/**
 * The handler for Node's own servers: Express, Connect, Vite's dev server, or plain `http`.
 *
 *   import { feedbackRobotMiddleware } from '@obsidiandeep/feedback-robot/node';
 *   app.use(feedbackRobotMiddleware());   // Express: before any body parser, or after it (it reads req.body then)
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createFeedbackHandler, type FeedbackHandlerOptions } from './handler';

/** The largest request read: two pictures for a local inbox (about 20 MB and 10 MB as data URLs), with room to spare. */
const MAX_BODY = 48 * 1024 * 1024;

type Next = (error?: unknown) => void;

async function bodyOf(req: IncomingMessage & { body?: unknown }): Promise<Buffer | null> {
    // A body parser got there first (Express's json()): use what it read.
    if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Buffer.from(JSON.stringify(req.body));
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > MAX_BODY) return null;
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
}

export function feedbackRobotMiddleware(opts: FeedbackHandlerOptions = {}) {
    const handle = createFeedbackHandler(opts);
    const base = `/${(opts.basePath ?? '/api/feedback-robot').replace(/^\/+|\/+$/g, '')}`;
    return async (req: IncomingMessage & { originalUrl?: string; body?: unknown }, res: ServerResponse, next?: Next): Promise<void> => {
        const path = req.originalUrl ?? req.url ?? '/';
        const pathname = path.split('?')[0];
        if (pathname !== base && !pathname.startsWith(`${base}/`)) {
            if (next) next();
            else {
                res.statusCode = 404;
                res.end();
            }
            return;
        }
        try {
            const method = req.method ?? 'GET';
            let body: Buffer | null = null;
            if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
                body = await bodyOf(req);
                if (!body) {
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'That message is too large. Try without a screenshot.' }));
                    return;
                }
            }
            const host = req.headers.host ?? 'localhost';
            const headers = new Headers();
            for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
            const response = await handle(new Request(`http://${host}${path}`, { method, headers, body: body && body.length ? new Uint8Array(body) : undefined }));
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
            if (next) next(error);
            else {
                res.statusCode = 500;
                res.end();
            }
        }
    };
}
