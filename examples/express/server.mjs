// An Express app: the inbox as middleware, and the robot as one script tag in your pages (or <FeedbackRobot /> if
// the front end is React).
import express from 'express';
import { feedbackRobotMiddleware } from '@obsidiandeep/feedback-robot/node';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const app = express();

if (process.env.NODE_ENV !== 'production') {
    app.use(feedbackRobotMiddleware());
    // Serve the one-file robot; pages add <script src="/feedback-robot.js"></script> before </body>.
    app.get('/feedback-robot.js', (_req, res) => res.sendFile(require.resolve('@obsidiandeep/feedback-robot/feedback-robot.js')));
}

app.get('/', (_req, res) => res.send('<h1>Hello</h1><script src="/feedback-robot.js" data-endpoint="/api/feedback-robot"></script>'));
app.listen(3000, () => console.log('http://localhost:3000'));
