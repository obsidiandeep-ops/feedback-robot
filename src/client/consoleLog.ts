/**
 * The last few errors and warnings in this tab, so a message about something broken arrives with
 * what the browser said at the time. Installed once, when the robot first appears.
 */
export interface ConsoleEntry {
    level: 'error' | 'warn';
    text: string;
    at: string;
}

const KEEP = 30;
const entries: ConsoleEntry[] = [];
let installed = false;

function format(args: unknown[]): string {
    return args
        .map((a) => {
            if (a instanceof Error) return `${a.name}: ${a.message}`;
            if (typeof a === 'string') return a;
            try {
                return JSON.stringify(a);
            } catch {
                return String(a);
            }
        })
        .join(' ')
        .slice(0, 1500);
}

function push(level: ConsoleEntry['level'], text: string) {
    entries.push({ level, text: text.slice(0, 1500), at: new Date().toISOString() });
    if (entries.length > KEEP) entries.splice(0, entries.length - KEEP);
}

export function installConsoleLog() {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    for (const level of ['error', 'warn'] as const) {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]) => {
            push(level, format(args));
            original(...args);
        };
    }
    window.addEventListener('error', (e) => push('error', `${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`));
    window.addEventListener('unhandledrejection', (e) => push('error', `Unhandled rejection: ${format([e.reason])}`));
}

export function recentConsole(): ConsoleEntry[] {
    return entries.slice();
}
