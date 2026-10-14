/**
 * The browser side: the robot itself, and the hook for maps.
 *
 *   import { FeedbackRobot } from '@placeintelligence/feedback-robot';
 *   <FeedbackRobot name="Alex" />
 */
export { FeedbackRobot, type FeedbackRobotProps } from './FeedbackRobot';
export { registerMapForCapture, type CapturableMap } from './mapCapture';
export type { FeedbackSummary, FeedbackTarget, ShotLimits } from '../types';
export { LOCAL_SHOT_LIMITS, REMOTE_SHOT_LIMITS } from '../types';
