'use client';

/**
 * The feedback robot: a green robot that floats over the app while it is being built. Drag it anywhere (it
 * remembers where). Drag its hand onto the part of the app you mean and its arm stretches out to it; the part is
 * outlined and named. Write what should change and send: the message goes with a screenshot and a close-up of what
 * the hand is on to the inbox, where Claude picks it up in its Claude Code chat (`npx feedback-robot watch`), and
 * the robot shows where each message stands as Claude picks it up, asks a question or finishes it.
 *
 * With `remote`, the messages go to a team's inbox on a deployed app (pulled with `feedback-robot watch --remote`):
 * screenshots are kept smaller and the robot asks how things stand less often.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { LOCAL_SHOT_LIMITS, REMOTE_SHOT_LIMITS, type FeedbackSummary, type FeedbackTarget, type ShotLimits } from '../types';
import { armBetween, clampToView, fractionIn, pointIn, restingHand, shoulderOf, sideFacing, type Point } from './arm';
import { captureWindow } from './capture';
import { installConsoleLog, recentConsole } from './consoleLog';
import { DRAG_THRESHOLD, clampBot, fromSavedPos, gazeAt, parseSavedPos, placeBeside, readStore, toSavedPos, viewport, writeStore, type SavedPos, type Size } from './float';
import { Icon } from './icons';
import { describe, elementAt, lift, meaningful } from './pointing';
import { RobotCharacter, type RobotPose } from './RobotCharacter';
import { injectStyles } from './styleTag';

export interface FeedbackRobotProps {
    /** Where the server handler is mounted (createFeedbackHandler's basePath). Default '/api/feedback-robot'. */
    endpoint?: string;
    /** Who is signed in, for the panel's footer. */
    name?: string;
    /** The messages go to a team's inbox on a deployed app, not to your own Claude Code chat. */
    remote?: boolean;
    /** Who a remote inbox's messages reach, for the robot's words ("your team" when not given). */
    team?: string;
    /** The server's screenshot limits (ShotLimits); by default a local inbox's, or REMOTE_SHOT_LIMITS with `remote`. */
    limits?: ShotLimits;
    /** 'auto' follows the system's light or dark setting. */
    theme?: 'auto' | 'dark' | 'light';
    /** What the robot keeps in localStorage is named after this (its place, whether it is hidden). */
    storageKey?: string;
    /** For a robot server on another origin (`feedback-robot serve`): 'include' sends cookies, 'omit' doesn't. */
    credentials?: RequestCredentials;
}

const SIZE = 60;
const PANEL: Size = { w: 360, h: 500 };
const BUBBLE: Size = { w: 270, h: 84 };

type Mode = 'rest' | 'pointing' | 'locked';
type Box = { x: number; y: number; w: number; h: number };

const STATUS: Record<FeedbackSummary['status'], string> = {
    new: 'Sent',
    received: 'Claude has it',
    working: 'Claude is on it',
    question: 'Claude has a question',
    done: 'Done',
};

/** Bottom of the window, left of centre: clear of most apps' corner buttons and chat widgets. */
function defaultPos(view: Size): Point {
    return clampBot({ x: Math.round(view.w / 2 - SIZE / 2 - 140), y: view.h - SIZE - 30 }, view, SIZE);
}

function sameBox(a: Box | null, b: Box | null): boolean {
    return !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function ago(iso: string): string {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** How often the robot asks where messages stand: often while its panel is open; for a remote inbox, less often while closed. */
function pollEvery(remote: boolean, open: boolean): number {
    if (!remote) return 4000;
    return open ? 5000 : 30_000;
}

export function FeedbackRobot({ endpoint = '/api/feedback-robot', name, remote = false, team, limits, theme = 'auto', storageKey = 'feedback-robot', credentials = 'same-origin' }: FeedbackRobotProps) {
    const base = endpoint.replace(/\/+$/, '');
    const posKey = `${storageKey}.pos`;
    const hiddenKey = `${storageKey}.hidden`;
    const shotLimits = limits ?? (remote ? REMOTE_SHOT_LIMITS : LOCAL_SHOT_LIMITS);
    const who = team ?? 'your team';
    const [mounted, setMounted] = useState(false);
    const [view, setView] = useState<Size>({ w: 1280, h: 800 });
    const [saved, setSaved] = useState<SavedPos | null>(null);
    const [hidden, setHidden] = useState(false);
    const [open, setOpen] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [mode, setMode] = useState<Mode>('rest');
    const [hand, setHand] = useState<Point | null>(null);
    const [target, setTarget] = useState<FeedbackTarget | null>(null);
    const [box, setBox] = useState<Box | null>(null);
    const [message, setMessage] = useState('');
    const [withShot, setWithShot] = useState(true);
    const [sending, setSending] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [items, setItems] = useState<FeedbackSummary[]>([]);
    const [replyTo, setReplyTo] = useState<FeedbackSummary | null>(null);
    const [pose, setPose] = useState<RobotPose>('standard');
    const [gaze, setGaze] = useState<Point>({ x: 0, y: 0 });
    const [bubble, setBubble] = useState<{ text: string; sub?: string } | null>(null);
    const [unread, setUnread] = useState(false);
    const botRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLTextAreaElement>(null);
    const elRef = useRef<Element | null>(null);
    const fracRef = useRef<Point>({ x: 0.5, y: 0.5 });
    const depthRef = useRef(0);
    const openRef = useRef(open);
    openRef.current = open;
    const itemsRef = useRef(items);
    itemsRef.current = items;
    const busyRef = useRef(false);
    busyRef.current = !!sending || mode === 'pointing' || dragging;
    const titleId = useId();

    useEffect(() => {
        injectStyles();
        setMounted(true);
        setView(viewport());
        setSaved(parseSavedPos(readStore(posKey)));
        setHidden(readStore(hiddenKey) === true);
        installConsoleLog();
        const resize = () => setView(viewport());
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [posKey, hiddenKey]);

    const at = useMemo(() => (saved ? fromSavedPos(saved, view, SIZE) : defaultPos(view)), [saved, view]);

    // A blink now and then, unless it is busy or showing a mood.
    const poseLock = useRef(0);
    const mood = useCallback((next: RobotPose, ms = 1600) => {
        setPose(next);
        window.clearTimeout(poseLock.current);
        poseLock.current = window.setTimeout(() => setPose('standard'), ms);
    }, []);
    useEffect(() => {
        let timer = 0;
        const blink = () => {
            if (!busyRef.current) {
                setPose((p) => (p === 'standard' ? 'blink' : p));
                window.setTimeout(() => setPose((p) => (p === 'blink' ? 'standard' : p)), 140);
            }
            timer = window.setTimeout(blink, 2600 + Math.random() * 4200);
        };
        timer = window.setTimeout(blink, 2000);
        return () => window.clearTimeout(timer);
    }, []);

    // Eyes on the hand while it points; otherwise on the pointer when it is near.
    useEffect(() => {
        let frame = 0;
        let pointer: Point | null = null;
        const update = () => {
            frame = 0;
            const r = botRef.current?.getBoundingClientRect();
            if (!r) return;
            const next = gazeAt({ x: r.left + r.width / 2, y: r.top + r.height * 0.52 }, pointer, 3.2, 900);
            setGaze((g) => (Math.abs(g.x - next.x) < 0.2 && Math.abs(g.y - next.y) < 0.2 ? g : next));
        };
        const move = (e: PointerEvent) => {
            pointer = { x: e.clientX, y: e.clientY };
            if (!frame) frame = requestAnimationFrame(update);
        };
        window.addEventListener('pointermove', move, { passive: true });
        return () => {
            window.removeEventListener('pointermove', move);
            cancelAnimationFrame(frame);
        };
    }, []);

    const bubbleTimer = useRef(0);
    const say = useCallback((text: string, sub?: string, ms = 7000) => {
        window.clearTimeout(bubbleTimer.current);
        setBubble({ text, sub });
        bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
    }, []);

    const place = useCallback(
        (point: Point) => {
            const next = toSavedPos(point, viewport(), SIZE);
            writeStore(posKey, next);
            setSaved(next);
        },
        [posKey],
    );

    const clearTarget = useCallback(() => {
        elRef.current = null;
        depthRef.current = 0;
        setMode('rest');
        setHand(null);
        setTarget(null);
        setBox(null);
    }, []);

    const toggle = useCallback((next?: boolean) => {
        const value = next ?? !openRef.current;
        setOpen(value);
        setBubble(null);
        if (value) {
            setUnread(false);
            window.setTimeout(() => textRef.current?.focus(), 50);
        }
    }, []);

    // Drag the robot anywhere; a press that doesn't travel opens or closes its panel.
    const onBotDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const screen = viewport();
        const drag = { sx: event.clientX, sy: event.clientY, from: at, last: at, moved: false };
        const move = (e: PointerEvent) => {
            const dx = e.clientX - drag.sx;
            const dy = e.clientY - drag.sy;
            if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            if (!drag.moved) {
                drag.moved = true;
                setDragging(true);
                setBubble(null);
            }
            drag.last = clampBot({ x: drag.from.x + dx, y: drag.from.y + dy }, screen, SIZE);
            // Re-render as it moves: the arm and the panel follow the robot.
            setSaved(toSavedPos(drag.last, screen, SIZE));
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            if (!drag.moved) {
                toggle();
                return;
            }
            place(drag.last);
            setDragging(false);
            mood('happy', 900);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    };

    const onBotKey = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
            return;
        }
        const step = event.shiftKey ? 96 : 24;
        const moves: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
        const by = moves[event.key];
        if (!by) return;
        event.preventDefault();
        place(clampBot({ x: at.x + by.x, y: at.y + by.y }, viewport(), SIZE));
    };

    // Point: drag the hand over the app; the part under it is outlined. The wheel (or ↑ ↓) widens
    // or narrows the pick to the enclosing parts; Escape puts the hand back.
    const onHandDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        setBubble(null);
        setMode('pointing');
        mood('surprise', 500);
        depthRef.current = 0;
        let last: Point = { x: event.clientX, y: event.clientY };
        let frame = 0;
        const aimNow = () => {
            frame = 0;
            const p = clampToView(last, window.innerWidth, window.innerHeight);
            setHand(p);
            const under = elementAt(p.x, p.y);
            const el = under ? lift(meaningful(under), depthRef.current) : null;
            elRef.current = el;
            if (el) {
                const d = describe(el, p);
                setTarget(d);
                setBox((b) => (sameBox(b, d.rect) ? b : d.rect));
            } else {
                setTarget(null);
                setBox(null);
            }
        };
        const aim = (p: Point) => {
            last = p;
            if (!frame) frame = requestAnimationFrame(aimNow);
        };
        const move = (e: PointerEvent) => aim({ x: e.clientX, y: e.clientY });
        const wheel = (e: WheelEvent) => {
            e.preventDefault();
            depthRef.current = Math.max(0, Math.min(12, depthRef.current + (e.deltaY < 0 ? 1 : -1)));
            aim(last);
        };
        const key = (e: globalThis.KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                stop();
                clearTarget();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                depthRef.current = Math.max(0, Math.min(12, depthRef.current + (e.key === 'ArrowUp' ? 1 : -1)));
                aim(last);
            }
        };
        const stop = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', cancel);
            window.removeEventListener('wheel', wheel);
            window.removeEventListener('keydown', key);
            cancelAnimationFrame(frame);
        };
        const cancel = () => {
            stop();
            clearTarget();
        };
        const up = (e: PointerEvent) => {
            stop();
            const p = clampToView({ x: e.clientX, y: e.clientY }, window.innerWidth, window.innerHeight);
            const robot = botRef.current?.getBoundingClientRect();
            const onRobot = !!robot && p.x >= robot.left - 6 && p.x <= robot.right + 6 && p.y >= robot.top - 6 && p.y <= robot.bottom + 6;
            const under = onRobot ? null : elementAt(p.x, p.y);
            const el = under ? lift(meaningful(under), depthRef.current) : null;
            if (!el) {
                clearTarget();
                return;
            }
            const d = describe(el, p);
            elRef.current = el;
            fracRef.current = fractionIn(d.rect, p);
            setTarget(d);
            setBox(d.rect);
            setHand(p);
            setMode('locked');
            mood('happy', 1100);
            toggle(true);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);
        window.addEventListener('wheel', wheel, { passive: false });
        window.addEventListener('keydown', key);
        aim(last);
    };

    // While a part is picked, keep the outline and the hand on it as the page scrolls or changes.
    useEffect(() => {
        if (mode !== 'locked') return;
        let frame = 0;
        const follow = () => {
            const el = elRef.current;
            if (el && el.isConnected) {
                const r = el.getBoundingClientRect();
                const next = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
                setBox((b) => (sameBox(b, next) ? b : next));
                setHand((h) => {
                    const p = pointIn(next, fracRef.current);
                    return h && Math.abs(h.x - p.x) < 0.5 && Math.abs(h.y - p.y) < 0.5 ? h : p;
                });
            }
            frame = requestAnimationFrame(follow);
        };
        frame = requestAnimationFrame(follow);
        return () => cancelAnimationFrame(frame);
    }, [mode]);

    // Where each message stands; a change gets a word from the robot.
    const refresh = useCallback(async () => {
        try {
            const res = await fetch(base, { cache: 'no-store', credentials });
            if (!res.ok) return;
            const data = (await res.json()) as { items: FeedbackSummary[] };
            const before = new Map(itemsRef.current.map((i) => [i.id, i]));
            for (const item of data.items) {
                const was = before.get(item.id);
                if (!was || was.status === item.status) continue;
                if (item.status === 'done') say(`${item.ref} is done`, item.reply ?? undefined, 12_000);
                else if (item.status === 'question') say(`Claude has a question about ${item.ref}`, item.reply ?? undefined, 15_000);
                else say(`${item.ref}: ${STATUS[item.status]}`, item.reply ?? undefined);
                if ((item.status === 'done' || item.status === 'question') && !openRef.current) setUnread(true);
                mood(item.status === 'question' ? 'surprise' : 'happy', 1600);
            }
            setItems(data.items);
        } catch {
            // The server restarting: the next look will catch up.
        }
    }, [base, credentials, say, mood]);

    useEffect(() => {
        if (!mounted) return;
        void refresh();
        let last = Date.now();
        const timer = window.setInterval(() => {
            if (document.hidden) return;
            if (!(openRef.current || itemsRef.current.some((i) => i.status !== 'done'))) return;
            if (Date.now() - last < pollEvery(remote, openRef.current) - 500) return;
            last = Date.now();
            void refresh();
        }, 1000);
        return () => window.clearInterval(timer);
    }, [mounted, refresh, remote]);

    const send = async () => {
        const text = message.trim();
        if (!text || sending) return;
        setError(null);
        setPose('think');
        try {
            let shots: { screen: string; focus: string | null } | null = null;
            if (withShot) {
                setSending('Taking a screenshot…');
                shots = await captureWindow(mode === 'rest' ? null : box, mode === 'rest' ? null : (target?.summary ?? null), shotLimits);
            }
            setSending('Sending to Claude…');
            const body = {
                message: text,
                page: {
                    url: window.location.href,
                    path: `${window.location.pathname}${window.location.search}`,
                    title: document.title,
                    viewport: { w: window.innerWidth, h: window.innerHeight },
                    dpr: window.devicePixelRatio || 1,
                },
                target: mode === 'rest' ? null : target,
                hand: mode === 'rest' ? null : hand,
                console: recentConsole(),
                screen: shots?.screen ?? null,
                focus: shots?.focus ?? null,
                replyTo: replyTo?.id ?? null,
            };
            const res = await fetch(base, { method: 'POST', credentials, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = (await res.json().catch(() => ({}))) as { item?: FeedbackSummary; error?: string };
            // A refusal says why in words (e.g. "Keep the message under 4,000 characters"), not "Invalid request".
            if (!res.ok || !data.item) throw new Error(data.error ?? `The server answered ${res.status}.`);
            const sent = data.item;
            setItems((list) => [sent, ...list.filter((i) => i.id !== sent.id)]);
            setMessage('');
            setReplyTo(null);
            clearTarget();
            mood('happy', 2200);
            say(`Sent to Claude as ${sent.ref}`, remote ? `Claude picks it up with ${who}. Replies show here.` : 'It’s in the inbox for Claude. Replies show here.');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'It didn’t send. Try again.');
            mood('surprise', 1600);
        } finally {
            setSending(null);
        }
    };

    const hide = () => {
        writeStore(hiddenKey, true);
        setHidden(true);
        setOpen(false);
        clearTarget();
    };
    const unhide = () => {
        writeStore(hiddenKey, false);
        setHidden(false);
        mood('happy', 1200);
    };

    if (!mounted) return null;

    if (hidden)
        return (
            <div className="fb-root" data-feedback-bot data-theme={theme}>
                <button type="button" className="fb-tab" onClick={unhide} title="Bring the feedback robot back">
                    <RobotCharacter pose="happy" size={28} />
                    {unread && <span className="fb-badge" aria-hidden />}
                </button>
            </div>
        );

    // The arm: from the shoulder facing the hand, to the hand; resting by the robot when idle.
    const handAt = mode === 'rest' || !hand ? restingHand(at, SIZE, view.w) : hand;
    const side = sideFacing(at, SIZE, handAt);
    const arm = armBetween(shoulderOf(at, SIZE, side), handAt);
    const reaching = mode !== 'rest' && arm.length > 70;
    const grip: Point = { x: handAt.x - Math.cos((arm.angle * Math.PI) / 180) * 9, y: handAt.y - Math.sin((arm.angle * Math.PI) / 180) * 9 };
    // A narrow or short window (a phone, a side pane) gets a panel that fits it.
    const panel: Size = { w: Math.min(PANEL.w, view.w - 16), h: Math.min(PANEL.h, view.h - 16) };
    const bubbleBox: Size = { w: Math.min(BUBBLE.w, view.w - 16), h: BUBBLE.h };
    const panelAt = placeBeside(at, SIZE, panel, view);
    const bubbleAt = placeBeside(at, SIZE, bubbleBox, view);
    const lowLabel = !!box && box.y < 26;
    const robotPose: RobotPose = sending ? 'think' : pose;
    const footer = [name ? `Signed in as ${name}.` : null, remote ? `Messages and screenshots go to ${who}.` : 'Messages and screenshots stay on this machine, in the project’s inbox.'].filter(Boolean).join(' ');

    return (
        <div className="fb-root" data-feedback-bot data-theme={theme}>
            {box && mode !== 'rest' && (
                <div className={`fb-target${lowLabel ? ' is-low' : ''}${mode === 'pointing' ? ' is-live' : ''}`} style={{ left: box.x - 3, top: box.y - 3, width: box.w + 6, height: box.h + 6 }} aria-hidden>
                    {target && <span className="fb-target__label">{target.summary}</span>}
                </div>
            )}
            <svg className="fb-arm" width={view.w} height={view.h} aria-hidden>
                <path className="fb-arm__outer" d={arm.d} />
                <path className="fb-arm__inner" d={arm.d} />
                {reaching && <circle className="fb-arm__joint" cx={arm.elbow.x} cy={arm.elbow.y} r={5.5} />}
                <g transform={`translate(${handAt.x} ${handAt.y}) rotate(${arm.angle})`}>
                    <circle className="fb-arm__part" cx={-14} cy={0} r={9} />
                    <path className="fb-arm__part" d="M-8 -3.4H-1.6A3.4 3.4 0 0 1 -1.6 3.4H-8Z" />
                    <circle className="fb-arm__part" cx={-14} cy={-8.5} r={3.6} />
                </g>
            </svg>
            <div
                className={`fb-hand${mode === 'pointing' ? ' is-pointing' : ''}${mode === 'rest' ? ' is-resting' : ''}`}
                style={{ left: grip.x, top: grip.y }}
                onPointerDown={onHandDown}
                role="button"
                tabIndex={-1}
                aria-label="The robot's hand: drag it onto the part of the app you mean"
                title={mode === 'rest' ? 'Drag my hand onto the part of the app you mean' : 'Drag to point somewhere else'}
            />
            <div
                ref={botRef}
                className={`fb-bot${dragging ? ' is-dragging' : ''}`}
                style={{ left: at.x, top: at.y, width: SIZE, height: SIZE }}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                aria-label={open ? 'Close the feedback robot' : 'Feedback robot: send Claude a note about this screen. Press Enter to write; arrow keys move it.'}
                title={open ? 'Close' : 'Feedback for Claude · drag me anywhere · click to write'}
                onPointerDown={onBotDown}
                onKeyDown={onBotKey}
            >
                <div className={`fb-bot__float${sending ? ' is-think' : ''}`}>
                    <RobotCharacter pose={robotPose} size={SIZE} gaze={mode === 'rest' ? gaze : { x: Math.sign(handAt.x - (at.x + SIZE / 2)) * 3, y: Math.sign(handAt.y - (at.y + SIZE / 2)) * 2 }} glow={!!sending || mode === 'pointing'} />
                </div>
                <span className="fb-bot__shadow" aria-hidden />
                {unread && !open && <span className="fb-badge" aria-hidden />}
            </div>

            {bubble && !open && (
                <div className="fb-bubble" style={{ left: bubbleAt.x, top: bubbleAt.y, width: bubbleBox.w }} role="status">
                    <div className="fb-bubble__row">
                        <div className="fb-bubble__words">
                            <p className="fb-bubble__text">{bubble.text}</p>
                            {bubble.sub && <p className="fb-bubble__sub">{bubble.sub}</p>}
                        </div>
                        <button type="button" className="fb-bubble__close" onClick={() => setBubble(null)} aria-label="Dismiss">
                            <Icon name="x" size={14} />
                        </button>
                    </div>
                </div>
            )}

            {open && (
                <section className="fb-panel" style={{ left: panelAt.x, top: panelAt.y, width: panel.w, maxHeight: panelAt.h ?? panel.h }} aria-labelledby={titleId} role="dialog">
                    <header className="fb-panel__head">
                        <div className="fb-panel__titles">
                            <h2 id={titleId}>Feedback for Claude</h2>
                            <p>{remote ? `Goes to Claude and ${who}` : 'Goes straight to Claude in your Claude Code chat'}</p>
                        </div>
                        <button type="button" className="fb-icon" onClick={hide} title="Hide the robot" aria-label="Hide the robot">
                            <Icon name="eyeOff" size={15} />
                        </button>
                        <button type="button" className="fb-icon" onClick={() => toggle(false)} title="Close" aria-label="Close">
                            <Icon name="x" size={15} />
                        </button>
                    </header>
                    <div className="fb-panel__body">
                        {target && mode !== 'rest' ? (
                            <div className="fb-chip">
                                <Icon name="target" size={14} />
                                <span className="fb-chip__text" title={target.summary}>
                                    {target.summary}
                                </span>
                                <button type="button" className="fb-chip__clear" onClick={clearTarget} aria-label="Stop pointing" title="Stop pointing">
                                    <Icon name="x" size={13} />
                                </button>
                            </div>
                        ) : (
                            <p className="fb-hint">Drag my green hand onto the part of the app you mean, or just write. Scroll while pointing to pick a bigger or smaller part.</p>
                        )}
                        {replyTo && (
                            <div className="fb-reply">
                                Replying to {replyTo.ref}
                                <button type="button" onClick={() => setReplyTo(null)} aria-label="Stop replying">
                                    <Icon name="x" size={12} />
                                </button>
                            </div>
                        )}
                        <label className="fb-label" htmlFor={`${titleId}-msg`}>
                            What should change?
                        </label>
                        <textarea
                            id={`${titleId}-msg`}
                            ref={textRef}
                            className="fb-text"
                            rows={5}
                            maxLength={4000}
                            value={message}
                            placeholder={target && mode !== 'rest' ? 'Tell Claude what to change here…' : 'Tell Claude what you’d like changed…'}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    void send();
                                }
                            }}
                        />
                        <div className="fb-row">
                            <label className="fb-check">
                                <input type="checkbox" checked={withShot} onChange={(e) => setWithShot(e.target.checked)} />
                                Include a screenshot
                            </label>
                            <button type="button" className="fb-send" onClick={() => void send()} disabled={!message.trim() || !!sending}>
                                <Icon name="send" size={14} />
                                {sending ?? 'Send to Claude'}
                            </button>
                        </div>
                        {error && (
                            <p className="fb-error" role="alert">
                                {error}
                            </p>
                        )}
                        <p className="fb-note">⌘↵ sends. Each message carries the page, what the hand is on and recent console errors.</p>
                    </div>
                    {items.length > 0 && (
                        <div className="fb-items">
                            <h3>Your messages</h3>
                            <ul>
                                {items.slice(0, 8).map((item) => (
                                    <li key={item.id} className="fb-item">
                                        <div className="fb-item__top">
                                            <span className="fb-item__ref">{item.ref}</span>
                                            <span className={`fb-status fb-status--${item.status}`}>{STATUS[item.status]}</span>
                                            <span className="fb-item__when">{ago(item.updatedAt)}</span>
                                        </div>
                                        <p className="fb-item__msg">{item.message}</p>
                                        {item.reply && <p className="fb-item__reply">{item.reply}</p>}
                                        {(item.shots?.screen || item.shots?.focus) && (
                                            <p className="fb-item__shots">
                                                {item.shots.screen && (
                                                    <a href={`${base}/${item.id}/shot?name=screen`} target="_blank" rel="noopener noreferrer">
                                                        Screenshot
                                                    </a>
                                                )}
                                                {item.shots.focus && (
                                                    <a href={`${base}/${item.id}/shot?name=focus`} target="_blank" rel="noopener noreferrer">
                                                        Close-up
                                                    </a>
                                                )}
                                            </p>
                                        )}
                                        {item.status === 'question' && (
                                            <button
                                                type="button"
                                                className="fb-item__answer"
                                                onClick={() => {
                                                    setReplyTo(item);
                                                    textRef.current?.focus();
                                                }}
                                            >
                                                Answer
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <footer className="fb-panel__foot">{footer}</footer>
                </section>
            )}
        </div>
    );
}
