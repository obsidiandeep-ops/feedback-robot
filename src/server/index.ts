/** The server side: the request handler and the inbox it keeps. Adapters: ./next, ./node, ./vite. */
export { createFeedbackHandler, type FeedbackHandlerOptions } from './handler';
export { FileStore, defaultInboxDir, summarise, type FeedbackStore, type FeedbackChange } from './store';
export type { FeedbackAuthor, FeedbackItem, FeedbackSummary, FeedbackStatus, ShotLimits } from '../types';
export { LOCAL_SHOT_LIMITS, REMOTE_SHOT_LIMITS, FEEDBACK_STATUSES, REPLY_STATUSES } from '../types';
