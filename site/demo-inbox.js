/*
 * A pretend inbox for the landing page: the robot talks to /demo-inbox as if it were the real one, and a scripted
 * "Claude" answers and changes the part of the page that was pointed at. Nothing leaves the browser.
 */
(function () {
    var BASE = '/demo-inbox';
    var items = [];
    var count = 0;

    var COLOURS = {
        green: '#22a85a', blue: '#2f6bff', red: '#e5484d', purple: '#8e4ec6', orange: '#f76b15',
        pink: '#e93d82', yellow: '#f5c518', black: '#111113', white: '#ffffff', teal: '#12a594',
    };

    function json(body, status) {
        return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
    }

    function nameOf(target) {
        if (!target) return 'the page';
        var words = (target.label || target.text || '').trim().replace(/\s+/g, ' ');
        if (words.length > 28) words = words.slice(0, 26) + '…';
        var kind = target.tag === 'button' || target.role === 'button' ? 'button' : target.tag === 'a' ? 'link' : /^h[1-6]$/.test(target.tag) ? 'heading' : 'part';
        return words ? 'the “' + words + '” ' + kind : 'that ' + kind;
    }

    function find(target) {
        if (!target || !target.selector) return null;
        try {
            var el = document.querySelector(target.selector);
            return el && el.closest('.demo-app') ? el : null;
        } catch (e) {
            return null;
        }
    }

    /* What "Claude" does: a small, visible change that matches the words in the message. */
    function apply(item) {
        var el = find(item.target);
        var text = item.message.toLowerCase();
        var name = nameOf(item.target);
        var done = [];
        if (el) {
            var solid = /^(button|a)$/.test(el.tagName.toLowerCase()) || el.classList.contains('demo-fill');
            Object.keys(COLOURS).forEach(function (c) {
                if (done.length || !new RegExp('\\b' + c + '\\b').test(text)) return;
                if (solid) {
                    el.style.background = COLOURS[c];
                    el.style.borderColor = COLOURS[c];
                    if (c === 'yellow' || c === 'white') el.style.color = '#111113';
                } else el.style.color = COLOURS[c];
                done.push('made it ' + c);
            });
            var size = parseFloat(getComputedStyle(el).fontSize) || 16;
            if (/\b(bigger|larger|huge|enlarge)\b/.test(text)) {
                el.style.fontSize = Math.round(size * 1.3) + 'px';
                if (solid) el.style.padding = '0.8em 1.5em';
                done.push('made it bigger');
            } else if (/\b(smaller|tiny|shrink)\b/.test(text)) {
                el.style.fontSize = Math.round(size * 0.8) + 'px';
                done.push('made it smaller');
            }
            if (/\bbold\b/.test(text)) {
                el.style.fontWeight = '800';
                done.push('made it bold');
            }
            if (/\b(round|rounder|pill)\b/.test(text)) {
                el.style.borderRadius = '999px';
                done.push('rounded it');
            }
            if (/\b(hide|remove|delete|get rid)\b/.test(text)) {
                el.style.transition = 'opacity .4s';
                el.style.opacity = '0.12';
                done.push('took it out');
            }
            el.classList.remove('demo-changed');
            void el.offsetWidth;
            el.classList.add('demo-changed');
        }
        if (done.length) return capital(done.join(' and ').replace(/\bit\b/, name)) + '.';
        return 'Looked at ' + name + '. In your app, this is where Claude edits the code and tells you what changed.';
    }

    function capital(s) {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    /* Where each message stands, from how long ago it was sent. */
    function advance(item) {
        var age = Date.now() - item.sentAt;
        var was = item.status;
        if (age > 11000) item.status = 'done';
        else if (age > 6000) item.status = 'working';
        else if (age > 1800) item.status = 'received';
        if (item.status === was) return;
        item.updatedAt = new Date().toISOString();
        if (item.status === 'received') item.reply = 'Got it: looking at ' + nameOf(item.target) + '.';
        else if (item.status === 'working') item.reply = 'Working on it.';
        else if (item.status === 'done') item.reply = apply(item);
    }

    function summary(item) {
        return {
            id: item.id, ref: item.ref, createdAt: item.createdAt, updatedAt: item.updatedAt, message: item.message,
            path: location.pathname, target: item.target ? nameOf(item.target) : null, status: item.status,
            reply: item.reply, replyTo: item.replyTo, shots: { screen: false, focus: false },
        };
    }

    var realFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        var url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.origin !== location.origin || url.pathname.indexOf(BASE) !== 0) return realFetch(input, init);
        var method = ((init && init.method) || 'GET').toUpperCase();
        if (method === 'GET' && url.pathname === BASE) {
            items.forEach(advance);
            return Promise.resolve(json({ items: items.map(summary) }));
        }
        if (method === 'POST' && url.pathname === BASE) {
            var body = {};
            try {
                body = JSON.parse(init.body);
            } catch (e) {}
            count += 1;
            var now = new Date().toISOString();
            var item = {
                id: 'demo-' + count, ref: 'FB-' + count, createdAt: now, updatedAt: now, sentAt: Date.now(),
                message: String(body.message || ''), target: body.target || null, status: 'new', reply: null,
                replyTo: body.replyTo || null,
            };
            items.unshift(item);
            return Promise.resolve(json({ item: summary(item) }, 201));
        }
        return Promise.resolve(json({ error: 'There is no such picture in the demo' }, 404));
    };
})();
