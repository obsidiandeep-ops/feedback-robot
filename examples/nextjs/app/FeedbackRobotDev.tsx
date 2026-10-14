'use client';
// The robot, in development only. Put <FeedbackRobotDev /> at the end of app/layout.tsx's <body>.
import { FeedbackRobot } from '@placeintelligence/feedback-robot';

export function FeedbackRobotDev() {
    if (process.env.NODE_ENV === 'production') return null;
    return <FeedbackRobot />;
}
