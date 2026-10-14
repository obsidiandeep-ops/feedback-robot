/**
 * The one-file build (dist/feedback-robot.js) for pages without a bundler: React is inside it. Add it with a script
 * tag and it mounts itself, reading its options from the tag:
 *
 *   <script src="http://127.0.0.1:4545/feedback-robot.js" data-endpoint="http://127.0.0.1:4545/api/feedback-robot"></script>
 *
 * data-endpoint, data-name, data-theme (auto | dark | light), data-remote, data-team. Add data-manual to mount it
 * yourself with window.FeedbackRobot.mount({...}).
 */
import { mountFeedbackRobot } from './mount';
import { registerMapForCapture } from './mapCapture';

const api = { mount: mountFeedbackRobot, registerMapForCapture };
(window as unknown as { FeedbackRobot: typeof api }).FeedbackRobot = api;

const tag = document.currentScript as HTMLScriptElement | null;
if (tag && !tag.hasAttribute('data-manual')) {
    const d = tag.dataset;
    // The robot's server is where this script came from, unless the tag says otherwise.
    const from = tag.src ? new URL(tag.src, window.location.href) : null;
    const endpoint = d.endpoint ?? (from ? `${from.origin}/api/feedback-robot` : '/api/feedback-robot');
    const start = () =>
        mountFeedbackRobot({
            endpoint,
            name: d.name,
            theme: d.theme === 'dark' || d.theme === 'light' ? d.theme : 'auto',
            remote: d.remote !== undefined && d.remote !== 'false',
            team: d.team,
            credentials: from && from.origin !== window.location.origin ? 'omit' : 'same-origin',
        });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
}
