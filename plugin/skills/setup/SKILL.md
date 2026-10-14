---
name: setup
description: Add the green feedback robot to this web app, in development only, so the user can point at the page, write what should change, and have it arrive in this chat with a screenshot. Use when asked to "set up the feedback robot", "add the feedback robot", or "install the robot".
---

# Set up the feedback robot

The robot has two parts: a small inbox route on the app's dev server, and the robot itself on the page. Both stay
off in production. Work out the stack, wire both parts in, and check the robot appears.

## 1. Look before changing anything

- If `package.json` already lists `@obsidiandeep/feedback-robot`, it's installed: check the wiring below instead
  of adding it twice.
- Find the stack from `package.json` and the folders:
  - **Next.js App Router**: `next` in dependencies and an `app/` (or `src/app/`) folder with `layout.tsx`.
  - **Next.js Pages Router**: `next` and a `pages/` folder, no `app/` layout.
  - **Vite**: `vite` in devDependencies and a `vite.config.*`. Note whether the front end is React.
  - **Express or Connect**: an `express`/`connect` server that serves the pages.
  - **Anything else** (Rails, Django, Laravel, Astro, plain HTML, a monorepo you can't place): the robot's own
    server and a script tag.
- Use the package manager whose lockfile is there (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock*`, else npm).

## 2. Install

```bash
npm install -D @obsidiandeep/feedback-robot
```

If the registry says it doesn't exist, install from GitHub instead:
`npm install -D github:obsidiandeep-ops/feedback-robot`.

Then make the inbox folder and keep screenshots out of git (this plugin already carries the skill for answering
messages, so skip the copy):

```bash
npx feedback-robot init --no-skill
```

## 3. Wire it in

**Next.js App Router.** Add the inbox route:

```ts
// app/api/feedback-robot/[[...path]]/route.ts
import { createNextRouteHandlers } from '@obsidiandeep/feedback-robot/next';
export const runtime = 'nodejs';
export const { GET, POST, OPTIONS } = createNextRouteHandlers();
```

and a client component rendered at the end of `<body>` in the root `app/layout.tsx`:

```tsx
// app/FeedbackRobotDev.tsx
'use client';
import { FeedbackRobot } from '@obsidiandeep/feedback-robot';
export function FeedbackRobotDev() {
    return process.env.NODE_ENV === 'production' ? null : <FeedbackRobot />;
}
```

Put the files under `src/app/` if that's where the app lives. If the app uses a custom `basePath`, pass
`endpoint` with it to `<FeedbackRobot />`.

**Vite + React.** Add `feedbackRobot()` to the plugins in `vite.config.*`
(`import { feedbackRobot } from '@obsidiandeep/feedback-robot/vite'`; it only runs on the dev server), and render
`{import.meta.env.DEV && <FeedbackRobot />}` next to the app's root component.

**Vite, not React.** Add the same plugin, then in the entry file:

```ts
if (import.meta.env.DEV) {
    import('@obsidiandeep/feedback-robot/feedback-robot.js').then(() => (window as any).FeedbackRobot.mount());
}
```

**Express or Connect.** Only outside production:

```js
import { feedbackRobotMiddleware } from '@obsidiandeep/feedback-robot/node';
if (process.env.NODE_ENV !== 'production') app.use(feedbackRobotMiddleware());
```

Then `<FeedbackRobot />` if the front end is React, or this tag before `</body>` in development, after serving
the file at `/feedback-robot.js` (`res.sendFile(require.resolve('@obsidiandeep/feedback-robot/feedback-robot.js'))`):

```html
<script src="/feedback-robot.js" data-endpoint="/api/feedback-robot"></script>
```

**Next.js Pages Router, or anything else.** Run the robot's own server from the project's folder beside the app:

```bash
npx feedback-robot serve --port 4545
```

and add this tag to the app's layout, in development only (in a Pages Router app, `pages/_document.tsx` behind a
`process.env.NODE_ENV !== 'production'` check):

```html
<script src="http://127.0.0.1:4545/feedback-robot.js" data-endpoint="http://127.0.0.1:4545/api/feedback-robot"></script>
```

If it fits the project, add a script such as `"feedback-robot": "feedback-robot serve"` to `package.json` so it's
easy to start again.

## 4. Check it works

Run the type check or build the project uses, then start the dev server (in the background) and open the app. A
green robot should float in the bottom-left corner. If you can't open a browser, request
`<app origin>/api/feedback-robot` (or `http://127.0.0.1:4545/api/feedback-robot`) and expect JSON, not a 404.

## 5. Tell the user

In two or three sentences: what you added and where, that it only runs in development, and how to use it: drag the
robot's green hand onto what they mean, write what should change, and send. Then offer to watch for their messages
now; that's this plugin's `feedback-robot` skill.

## Care

- Never enable the robot or its inbox in a production build. Keep every change behind the dev checks above.
- Don't change the app's own behaviour, styles or dependencies beyond what's needed here.
- `.feedback-robot/` must be in `.gitignore`: screenshots can show anything on screen.
