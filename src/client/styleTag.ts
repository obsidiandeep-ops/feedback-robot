/**
 * The robot's stylesheet, put in the page once when the robot first mounts, so nothing has to import a CSS file
 * (bundlers differ on that). The CSS is inlined into this module at build time (scripts/build.mjs).
 */
import css from './styles.css';

const ID = 'feedback-robot-styles';

export function injectStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(ID)) return;
    const tag = document.createElement('style');
    tag.id = ID;
    tag.textContent = css;
    document.head.appendChild(tag);
}
