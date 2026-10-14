/*
 * On a first visit, the robot starts beside the headline instead of at the bottom of the window. It keeps its place
 * in localStorage ("feedback-robot.pos", as the robot itself does), so once someone drags it, that wins.
 */
(function () {
    var KEY = 'feedback-robot.pos';
    var SIZE = 60;
    var EDGE = 16;
    try {
        if (localStorage.getItem(KEY)) return;
    } catch (e) {
        return;
    }
    var h1 = document.querySelector('.hero h1');
    if (!h1) return;

    // The headline's widest line, measured on its text rather than its full-width box.
    var range = document.createRange();
    range.selectNodeContents(h1);
    var right = 0;
    Array.prototype.forEach.call(range.getClientRects(), function (r) {
        right = Math.max(right, r.right);
    });
    var box = h1.getBoundingClientRect();
    var top = box.top + window.scrollY;

    var x;
    var y;
    if (right + 32 + SIZE + EDGE <= window.innerWidth) {
        x = right + 32;
        y = top + box.height / 2 - SIZE / 2;
    } else {
        // A narrow window: above the headline, at the right.
        x = window.innerWidth - SIZE - EDGE;
        y = Math.max(EDGE, top - SIZE - 12);
    }
    var pos = { h: 'left', dx: Math.round(x), v: 'top', dy: Math.round(Math.min(y, window.innerHeight - SIZE - EDGE)) };
    try {
        localStorage.setItem(KEY, JSON.stringify(pos));
    } catch (e) {}
})();
