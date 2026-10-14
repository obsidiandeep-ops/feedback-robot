/**
 * What the robot's hand is on: the element under it, lifted to a part of the page worth naming
 * (not a word or an icon's path), and described so Claude can find it in the code: the React
 * components it sits in, a CSS path, its text and its box; on a map, the place under the hand.
 */
import type { FeedbackTarget } from '../types';
import { mapOnCanvas } from './mapCapture';

/** Too small or too inline to be what someone means; the robot lifts to the parent. */
const INLINE = new Set(['span', 'b', 'i', 'em', 'strong', 'small', 'code', 'abbr', 'sup', 'sub', 'label', 'svg', 'img', 'kbd', 'mark', 'u', 's']);

/** Framework components that say nothing about the app. */
const QUIET = /(Boundary|Router|Handler|Provider|Fallback|Overlay|Context|Template|Segment|Suspense|HotReload|Root|ServerInsertedHTML|Head|Body|Html)$|^(Anonymous|Unknown)$/;

export function inRobot(el: Element | null): boolean {
    return !!el?.closest('[data-feedback-bot]');
}

/**
 * The deepest page element under a point, ignoring the robot itself. Over the page itself, or
 * over anything inside `stop` (a selector), there is none.
 */
export function elementAt(x: number, y: number, stop?: string): Element | null {
    for (const el of document.elementsFromPoint(x, y)) {
        if (inRobot(el)) continue;
        if (el === document.documentElement || el === document.body) return null;
        if (stop && el.closest(stop)) return null;
        return el;
    }
    return null;
}

/** From the deepest element to the part of the page a person means. */
export function meaningful(el: Element): Element {
    let current: Element = el;
    const svg = current.closest('svg');
    if (svg && svg !== current && !current.closest('foreignObject')) current = svg;
    for (let i = 0; i < 12; i++) {
        const box = current.getBoundingClientRect();
        const small = box.width < 44 || box.height < 20;
        if (!small && !INLINE.has(current.tagName.toLowerCase())) break;
        const parent = current.parentElement;
        if (!parent || parent === document.body) break;
        current = parent;
    }
    return current;
}

/** `levels` steps up from an element, stopping below <body>. */
export function lift(el: Element, levels: number): Element {
    let current = el;
    for (let i = 0; i < levels; i++) {
        const parent = current.parentElement;
        if (!parent || parent === document.body || parent === document.documentElement) break;
        current = parent;
    }
    return current;
}

/** The React components an element sits in, nearest first (development builds keep their names). */
export function componentsOf(el: Element, max = 8): string[] {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    let fiber = key ? (el as unknown as Record<string, unknown>)[key] : null;
    const names: string[] = [];
    let guard = 0;
    while (fiber && names.length < max && guard++ < 400) {
        const f = fiber as { type?: unknown; return?: unknown };
        const t = f.type as { displayName?: string; name?: string; render?: { displayName?: string; name?: string }; type?: { displayName?: string; name?: string } } | string | null | undefined;
        let name: string | undefined;
        if (typeof t === 'function') name = (t as { displayName?: string; name?: string }).displayName ?? (t as { name?: string }).name;
        else if (t && typeof t === 'object') name = t.displayName ?? t.render?.displayName ?? t.render?.name ?? t.type?.displayName ?? t.type?.name;
        if (name && /^[A-Z]/.test(name) && !QUIET.test(name) && names[names.length - 1] !== name) names.push(name);
        fiber = f.return;
    }
    return names;
}

const plainName = (s: string) => /^[A-Za-z][\w-]*$/.test(s);

/** A CSS path short enough to read and specific enough to search for. */
export function cssPath(el: Element): string {
    const parts: string[] = [];
    let current: Element | null = el;
    while (current && current !== document.body && parts.length < 7) {
        let part = current.tagName.toLowerCase();
        if (current.id && plainName(current.id)) {
            parts.unshift(`${part}#${current.id}`);
            break;
        }
        const classes = Array.from(current.classList).filter((c) => plainName(c) && !c.startsWith('is-')).slice(0, 2);
        if (classes.length) part += `.${classes.join('.')}`;
        const parent: Element | null = current.parentElement;
        if (parent) {
            const tag = current.tagName;
            const same = Array.from(parent.children).filter((c) => c.tagName === tag);
            if (same.length > 1) part += `:nth-of-type(${same.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
    }
    return parts.join(' > ');
}

function shortName(el: Element): string {
    const tag = el.tagName.toLowerCase();
    if (el.id && plainName(el.id)) return `${tag}#${el.id}`;
    const cls = Array.from(el.classList).find((c) => plainName(c) && !c.startsWith('is-'));
    return cls ? `${tag}.${cls}` : tag;
}

function clip(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Everything Claude needs to find this element, plus the one-line name the robot shows. */
export function describe(el: Element, hand: { x: number; y: number } | null): FeedbackTarget {
    const box = el.getBoundingClientRect();
    const components = componentsOf(el);
    const html = el as HTMLElement;
    const text = (html.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const label = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? undefined;
    const data: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('data-') && attr.value.length <= 200 && Object.keys(data).length < 8) data[attr.name.slice(0, 80)] = attr.value;
    }
    let map: FeedbackTarget['map'];
    const onMap = el.tagName === 'CANVAS' ? mapOnCanvas(el) : null;
    if (onMap && hand) {
        const at = onMap.unproject([hand.x - box.left, hand.y - box.top]);
        map = { lng: Math.round(at.lng * 1e6) / 1e6, lat: Math.round(at.lat * 1e6) / 1e6, zoom: Math.round(onMap.getZoom() * 100) / 100 };
    }
    const quote = label ?? (text ? clip(text, 42) : '');
    const summary = [onMap ? 'Map' : components[0], shortName(el), quote ? `“${quote}”` : null, map ? `at ${map.lat.toFixed(5)}, ${map.lng.toFixed(5)} (zoom ${map.zoom})` : null]
        .filter(Boolean)
        .join(' · ');
    return {
        selector: cssPath(el).slice(0, 600),
        tag: el.tagName.toLowerCase(),
        ...(el.id ? { id: el.id.slice(0, 200) } : {}),
        classes: Array.from(el.classList).slice(0, 12).map((c) => c.slice(0, 120)),
        ...(el.getAttribute('role') ? { role: el.getAttribute('role')!.slice(0, 60) } : {}),
        ...(label ? { label: label.slice(0, 300) } : {}),
        ...(text ? { text: text.slice(0, 400) } : {}),
        ...(Object.keys(data).length ? { data } : {}),
        components,
        rect: { x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) },
        ...(map ? { map } : {}),
        summary: summary.slice(0, 300),
    };
}
