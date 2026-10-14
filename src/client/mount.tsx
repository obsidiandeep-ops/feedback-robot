/**
 * The robot in any page, React app or not: mounts it in a container of its own at the end of <body>.
 *
 *   import { mountFeedbackRobot } from '@placeintelligence/feedback-robot/mount';
 *   const unmount = mountFeedbackRobot({ endpoint: 'http://127.0.0.1:4545/api/feedback-robot' });
 */
import { createRoot } from 'react-dom/client';
import { FeedbackRobot, type FeedbackRobotProps } from './FeedbackRobot';

export function mountFeedbackRobot(props: FeedbackRobotProps = {}): () => void {
    if (typeof document === 'undefined') return () => undefined;
    const host = document.createElement('div');
    host.setAttribute('data-feedback-robot-host', '');
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<FeedbackRobot {...props} />);
    return () => {
        root.unmount();
        host.remove();
    };
}
