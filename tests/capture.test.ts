/**
 * The feedback robot's screenshots (src/components/feedback/capture.ts): a dropdown shows the option
 * chosen on the page. modern-screenshot clones a select with its value as a `value` attribute, which
 * a select ignores, so screenshots showed every dropdown at its first option.
 * And on a scrolled page (only the window is drawn: a report drawn whole was a canvas past the
 * browser's limits, black on 14 Oct 2026), what is pinned to the window stays where the person sees it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pinnedInClone, showChosenOption } from '../src/client/capture';

/** A cloned element as modern-screenshot hands it over: attributes only, the live choice gone. */
function element(nodeName: string, attrs: Record<string, string>, options: Array<{ value: string; selected?: boolean }> = []) {
    const own = new Map(Object.entries(attrs));
    const opts = options.map((o) => {
        const a = new Map<string, string>(o.selected ? [['selected', '']] : []);
        return { value: o.value, setAttribute: (n: string, v: string) => void a.set(n, v), removeAttribute: (n: string) => void a.delete(n), has: (n: string) => a.has(n) };
    });
    return { nodeName, getAttribute: (n: string) => own.get(n) ?? null, querySelectorAll: () => opts, opts };
}
const marked = (el: ReturnType<typeof element>) => el.opts.filter((o) => o.has('selected')).map((o) => o.value);

test('a cloned dropdown shows the option chosen on the page, not its first', () => {
    // The Activity row's H3 level, pinned at L13: the page shows L13, the clone showed Auto.
    const level = element('SELECT', { class: 'input', value: '13' }, [{ value: 'auto' }, ...[5, 6, 7, 8, 9, 10, 11, 12, 13].map((r) => ({ value: String(r) }))]);
    showChosenOption(level);
    assert.deepEqual(marked(level), ['13']);
    // An option marked selected in the markup (a default) gives way to the one chosen since.
    const colour = element('SELECT', { value: 'both' }, [{ value: '', selected: true }, { value: 'both' }, { value: 'before' }]);
    showChosenOption(colour);
    assert.deepEqual(marked(colour), ['both']);
});

test('other nodes, and selects with nothing to match, are left as they are', () => {
    const input = element('INPUT', { value: '13' }, [{ value: '13' }]);
    showChosenOption(input);
    assert.deepEqual(marked(input), [], 'not a select');
    const none = element('SELECT', {}, [{ value: 'a', selected: true }, { value: 'b' }]);
    showChosenOption(none);
    assert.deepEqual(marked(none), ['a'], 'no value kept: unchanged');
    const stray = element('SELECT', { value: 'zz' }, [{ value: 'a', selected: true }, { value: 'b' }]);
    showChosenOption(stray);
    assert.deepEqual(marked(stray), ['a'], 'a value no option has: unchanged');
    showChosenOption({ nodeName: '#text' } as unknown as Node);
});

/** A cloned element with a style, as onCloneEachNode gets it. */
function styled(attrs: Record<string, string>) {
    const own = new Map(Object.entries(attrs));
    const style = new Map<string, [string, string]>();
    return {
        getAttribute: (n: string) => own.get(n) ?? null,
        removeAttribute: (n: string) => void own.delete(n),
        has: (n: string) => own.has(n),
        style: { setProperty: (n: string, v: string, p = '') => void style.set(n, [v, p]) },
        css: (n: string) => style.get(n),
    };
}

test('on a scrolled page, what is fixed to the window or stuck to its top is drawn where the person sees it', () => {
    // The report's tool bar (sticky), stuck 20,000 px down a scrolled report: moved down as far as it is stuck.
    const bar = styled({ 'data-shot-pin': 'sticky,0,20000' });
    pinnedInClone(bar as unknown as Node);
    assert.deepEqual([bar.css('position'), bar.css('top'), bar.css('left')], [['relative', 'important'], ['20000px', 'important'], ['0px', 'important']]);
    assert.ok(!bar.has('data-shot-pin'), 'the mark is not drawn');
    // A fixed button 40 px from the window's top, the page scrolled 500 px: at 540 px of the page drawn from its top.
    const button = styled({ 'data-shot-pin': 'fixed,1200,540,64,32' });
    pinnedInClone(button as unknown as Node);
    assert.deepEqual(
        ['left', 'top', 'right', 'bottom', 'width', 'height', 'transform'].map((n) => button.css(n)?.[0]),
        ['1200px', '540px', 'auto', 'auto', '64px', '32px', 'none'],
    );
    // Anything unmarked is left alone.
    const plain = styled({ class: 'av-page' });
    pinnedInClone(plain as unknown as Node);
    assert.equal(plain.css('top'), undefined);
    pinnedInClone({ nodeName: '#text' } as unknown as Node);
});
