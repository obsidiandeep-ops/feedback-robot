/**
 * Next.js (App Router): one catch-all route file.
 *
 *   // app/api/feedback-robot/[[...path]]/route.ts
 *   import { createNextRouteHandlers } from '@obsidiandeep/feedback-robot/next';
 *   export const runtime = 'nodejs';
 *   export const { GET, POST, OPTIONS } = createNextRouteHandlers();
 */
import { createFeedbackHandler, type FeedbackHandlerOptions } from './handler';

export function createNextRouteHandlers(opts: FeedbackHandlerOptions = {}) {
    const handle = createFeedbackHandler(opts);
    const route = (req: Request) => handle(req);
    return { GET: route, POST: route, OPTIONS: route };
}
