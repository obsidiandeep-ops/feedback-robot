// The robot's inbox for a Next.js app (App Router). Off in production unless you enable it with `author`.
import { createNextRouteHandlers } from '@placeintelligence/feedback-robot/next';

export const runtime = 'nodejs';
export const { GET, POST, OPTIONS } = createNextRouteHandlers();
