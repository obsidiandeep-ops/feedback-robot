# Feedback robot

A green robot that floats over your web app while you build it. Drag its hand onto the part of the page you mean,
write what should change, and send. The message lands in your **Claude Code** chat with:

- a screenshot of the window, with what you pointed at outlined, and a sharper close-up of it;
- what the hand was on: the React components it sits in, a CSS path, its text and its box (on a map, the place
  under the hand);
- the page, and the console's recent errors and warnings.

Claude says it has it, works on it, asks a question if it needs to, and says what it changed. The robot shows each
step to the person who sent it, within seconds.

It was built for Place Intelligence's own apps, where it has carried hundreds of messages, and works in any web app.

```
 your app (browser)                     your machine                          Claude Code
┌────────────────────┐   POST       ┌──────────────────────────┐   watch   ┌─────────────────────────┐
│  🤖 ── hand on a   │ ──────────▶  │ .feedback-robot/inbox/   │ ───────▶  │ reads the screenshot,   │
│  part of the page  │              │   fb-…/item.json         │           │ fixes it, and answers:  │
│  "make this blue"  │  ◀────────── │   fb-…/screen.png        │  ◀─────── │ feedback-robot set FB-3 │
│  FB-3 · Done ✓     │   status     │   fb-…/focus.png         │    set    │ done "Made it blue"     │
└────────────────────┘              └──────────────────────────┘           └─────────────────────────┘
```

Messages and screenshots stay on your machine. Nothing is sent anywhere else.

## Install

From a copy of this repository, until it's on npm:

```bash
npm install -D github:<owner>/feedback-robot
```

or from a packed file someone sent you (`npm pack` in this repository makes one):

```bash
npm install -D ./placeintelligence-feedback-robot-0.1.0.tgz
```

Then, in your project's folder:

```bash
npx feedback-robot init
```

That makes the inbox folder, adds `.feedback-robot/` to `.gitignore` (screenshots can show anything on screen), and
adds a Claude Code skill (`.claude/skills/feedback-robot/SKILL.md`) that tells Claude how to watch and answer.

## Add it to your app

Pick your stack. The robot needs a small server route (the inbox) and the robot itself on the page. Both are off in
production unless you switch them on.

### Next.js (App Router)

```ts
// app/api/feedback-robot/[[...path]]/route.ts
import { createNextRouteHandlers } from '@placeintelligence/feedback-robot/next';
export const runtime = 'nodejs';
export const { GET, POST, OPTIONS } = createNextRouteHandlers();
```

```tsx
// app/FeedbackRobotDev.tsx, rendered at the end of app/layout.tsx's <body>
'use client';
import { FeedbackRobot } from '@placeintelligence/feedback-robot';
export function FeedbackRobotDev() {
    return process.env.NODE_ENV === 'production' ? null : <FeedbackRobot />;
}
```

### Vite + React

```ts
// vite.config.ts
import { feedbackRobot } from '@placeintelligence/feedback-robot/vite';
export default defineConfig({ plugins: [react(), feedbackRobot()] });
```

```tsx
// main.tsx
{import.meta.env.DEV && <FeedbackRobot />}
```

### Express (or Connect, or plain `http`)

```js
import { feedbackRobotMiddleware } from '@placeintelligence/feedback-robot/node';
app.use(feedbackRobotMiddleware());
```

Then `<FeedbackRobot />` in a React front end, or the script tag below in any page.

### Any other stack (Rails, Django, Laravel, a static site…)

Run the robot's own server beside your app, then add one script tag to your layout in development:

```bash
npx feedback-robot serve --port 4545
```

```html
<script src="http://127.0.0.1:4545/feedback-robot.js" data-endpoint="http://127.0.0.1:4545/api/feedback-robot"></script>
```

Open http://127.0.0.1:4545/ to try it on a demo page first. `examples/` has each of these as files.

## Use it with Claude Code

Ask Claude to **watch the feedback robot**. With the skill from `init`, Claude runs the watcher in the background:

```bash
npx feedback-robot watch
```

It waits, and exits as soon as a message arrives, printing everything Claude needs:

```
1 new message from the feedback robot:

FB-1 · fb-20261014-220315-f5ff · 14/10/2026, 22:03:15 · from You
Page: /pricing  ("Pricing", 1280×800)
Pointing at: PricingCard · div.card · “Starter, $9 a month. Buy now”
  Components (nearest first): PricingCard < PricingPage
  Element: main > div.card:nth-of-type(1)
Message:
  The Buy now button errors with a 402. Make it open checkout instead.
Screenshot: …/.feedback-robot/inbox/fb-20261014-220315-f5ff/screen.png
Close-up: …/.feedback-robot/inbox/fb-20261014-220315-f5ff/focus.png
Console (1 recent errors and warnings):
  [error] Checkout failed: 402 Payment Required
```

Claude answers with `set`, and the robot shows the status and note:

```bash
npx feedback-robot set FB-1 received "Got it"
npx feedback-robot set FB-1 question "Should it open in a new tab?"
npx feedback-robot set FB-1 done "Buy now opens checkout"
```

`npx feedback-robot list` shows recent messages and where they stand.

## Using the robot

- **Drag the robot** anywhere. It remembers where, per browser.
- **Drag its green hand** onto what you mean. The part under it is outlined and named. While pointing, scroll (or
  ↑ ↓) to pick a bigger or smaller part, and press Escape to put the hand back.
- **Click the robot** to write without pointing. ⌘↵ sends.
- **Answer** a question from Claude with the Answer button: your reply carries "Reply to: FB-n".
- **Hide it** with the eye button. A small tab on the left edge brings it back.

### Maps

WebGL maps (Mapbox GL, MapLibre) come out blank in a screenshot unless the robot can ask them for their picture.
Register each map and the robot photographs it, and also tells Claude the place under its hand:

```ts
import { registerMapForCapture } from '@placeintelligence/feedback-robot';
map.on('load', () => registerMapForCapture(map));
```

## Options

`<FeedbackRobot>`:

| Prop | Default | What |
| --- | --- | --- |
| `endpoint` | `/api/feedback-robot` | Where the inbox's routes are. |
| `theme` | `auto` | `auto` follows the system; or `dark`, `light`. Every colour is a `--fb-*` variable on `.fb-root`. |
| `name` | | Who is signed in, for the panel's footer. |
| `remote`, `team` | `false` | For a deployed app's inbox: wording ("Goes to Claude and Acme's developers"), smaller screenshots, slower polling. |
| `limits` | | The server's screenshot limits, if you changed them. |
| `storageKey` | `feedback-robot` | Names what it keeps in localStorage. |
| `credentials` | `same-origin` | For an inbox on another origin. |

`createFeedbackHandler`, `createNextRouteHandlers`, `feedbackRobotMiddleware`, `feedbackRobot` (Vite):

| Option | Default | What |
| --- | --- | --- |
| `basePath` | `/api/feedback-robot` | Where the routes are mounted. |
| `dir` | `.feedback-robot/inbox` | The inbox folder (or `FEEDBACK_ROBOT_DIR`). |
| `enabled` | on unless `NODE_ENV=production` | |
| `author` | you, on this machine | `(req) => ({ id, name, email? }) \| null`: who is sending, from your app's sign-in. Required in production. |
| `store` | a `FileStore` | Anything with `FeedbackStore`'s methods: a database and object storage for a deployed app. |
| `syncKey` | `FEEDBACK_ROBOT_SYNC_KEY` | Opens the routes `watch --remote` uses. At least 32 characters. |
| `perHour` | 60 | Messages one sender may send in an hour. |
| `cors` | | `'loopback'` or a list of origins, for a robot on another origin. |

The one-file script reads `data-endpoint`, `data-name`, `data-theme`, `data-remote` and `data-team` from its tag, or
`data-manual` to call `window.FeedbackRobot.mount({...})` yourself.

## A deployed app (staging, or production for your team)

The robot can run on a deployed app, so your team or your customers can send feedback that reaches you in Claude
Code. Three things are needed:

1. **Who is sending.** Pass `enabled: true` and `author` from your app's own sign-in. The handler refuses to start in
   production without it, because the robot sends screenshots of whatever is on screen.
2. **Somewhere lasting to keep messages.** `FileStore` writes to the server's disk, which serverless platforms
   (Vercel, Netlify) throw away. Pass a `store` of your own (a table and private object storage), with the
   `FeedbackStore` interface in `src/server/store.ts`. A long-running server with a disk can use `FileStore` as it is.
3. **A sync key**, so your machine can pull the messages. Make one with `openssl rand -hex 32`, set it as
   `FEEDBACK_ROBOT_SYNC_KEY` on the server, and keep it on your machine in `~/.feedback-robot/sync-key` (mode 600).
   Then:

   ```bash
   npx feedback-robot watch --remote https://app.example.com/api/feedback-robot
   ```

   The deployed app's messages arrive as PFB-n beside your own FB-n, and `set PFB-n …` answers on the app.

Show the robot on a deployed app with `<FeedbackRobot remote team="Acme's developers" />`.

## Privacy

- In development, messages and screenshots never leave your machine: they are files in `.feedback-robot/inbox`.
- Screenshots show whatever is on screen. Keep the inbox out of git (`init` does), and don't paste screenshots
  elsewhere.
- The handler is off in production unless you switch it on, and then it needs to know who is sending.
- Each message is capped (4,000 characters), and screenshots are drawn smaller until they fit the server's limits.

## Development

```bash
npm install
npm run build      # dist/: the robot (ESM and one-file), the server and its adapters, the CLI, types
npm test           # node:test via tsx
npm run typecheck
```

## License

MIT, © Place Intelligence.
