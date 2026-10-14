# Any other stack (Rails, Django, Laravel, a static site…)

Run the robot's own little server beside your app, on this machine only:

```bash
npx feedback-robot serve --port 4545
```

Then add one line to your app's layout, in development only:

```html
<script src="http://127.0.0.1:4545/feedback-robot.js" data-endpoint="http://127.0.0.1:4545/api/feedback-robot"></script>
```

The server answers pages on `localhost`, `127.0.0.1` and `[::1]` at any port, and keeps messages in
`.feedback-robot/inbox` wherever you started it (start it in your project's folder). Open
http://127.0.0.1:4545/ to try the robot on a demo page first.
