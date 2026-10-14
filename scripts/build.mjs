#!/usr/bin/env node
/**
 * Builds dist/:
 *   index.js, mount.js            the robot for apps with a bundler (ESM; React and modern-screenshot left to the app)
 *   feedback-robot.js             the robot as one script for any page (React inside), for <script src>
 *   server/{index,next,node,vite}.js   the request handler, the inbox and the adapters (Node 18+)
 *   cli.js                        the feedback-robot command
 *   types/                        TypeScript declarations
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
rmSync('dist', { recursive: true, force: true });

const browser = { bundle: true, jsx: 'automatic', loader: { '.css': 'text' }, target: ['es2020', 'chrome100', 'safari15', 'firefox100'], logLevel: 'warning' };
const node = { bundle: true, platform: 'node', format: 'esm', target: 'node18', external: ['zod'], logLevel: 'warning' };

await Promise.all([
    build({
        ...browser,
        entryPoints: { index: 'src/client/index.ts', mount: 'src/client/mount.tsx' },
        outdir: 'dist',
        format: 'esm',
        splitting: true,
        chunkNames: 'chunks/[name]-[hash]',
        external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', 'modern-screenshot'],
        // Next.js' App Router renders it in the browser only.
        banner: { js: "'use client';" },
    }),
    build({
        ...browser,
        entryPoints: { 'feedback-robot': 'src/client/standalone.ts' },
        outdir: 'dist',
        format: 'iife',
        minify: true,
        define: { 'process.env.NODE_ENV': '"production"' },
    }),
    build({
        ...node,
        entryPoints: { index: 'src/server/index.ts', next: 'src/server/next.ts', node: 'src/server/node.ts', vite: 'src/server/vite.ts' },
        outdir: 'dist/server',
        splitting: true,
        chunkNames: 'chunks/[name]-[hash]',
    }),
    build({ ...node, entryPoints: { cli: 'src/cli/index.ts' }, outdir: 'dist', banner: { js: '#!/usr/bin/env node' } }),
]);

execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
console.log('Built dist/.');
