/**
 * Vite: the inbox on Vite's own dev server (never in a build).
 *
 *   // vite.config.ts
 *   import { feedbackRobot } from '@obsidiandeep/feedback-robot/vite';
 *   export default defineConfig({ plugins: [react(), feedbackRobot()] });
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { feedbackRobotMiddleware } from './node';
import type { FeedbackHandlerOptions } from './handler';

/** The little of Vite's plugin shape this needs, so Vite isn't a dependency. */
interface DevServer {
    middlewares: { use(fn: (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void): unknown };
}

export function feedbackRobot(opts: FeedbackHandlerOptions = {}) {
    return {
        name: 'feedback-robot',
        apply: 'serve' as const,
        configureServer(server: DevServer) {
            const mw = feedbackRobotMiddleware({ enabled: true, ...opts });
            server.middlewares.use((req, res, next) => void mw(req, res, next));
        },
    };
}
