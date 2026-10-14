/** A .css import is its text (esbuild's `text` loader, scripts/build.mjs; tsx's loader in tests). */
declare module '*.css' {
    const css: string;
    export default css;
}
