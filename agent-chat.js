/* Agent Webchat — Self-Contained Chat Widget (Gateway Edition)
 * Zero dependencies. Single IIFE.
 * Connects to OpenClaw Gateway WebSocket using the Gateway protocol.
 *
 * Usage (floating bubble):
 *   <script src="agent-chat.js"
 *       data-server="ws://localhost:18789"
 *       data-token="YOUR_GATEWAY_TOKEN">
 *   </script>
 *
 * Usage (embedded):
 *   <div id="chat"></div>
 *   <script src="agent-chat.js"
 *       data-mount="#chat"
 *       data-server="ws://localhost:18789"
 *       data-token="YOUR_GATEWAY_TOKEN">
 *   </script>
 *
 * Config via data-* attributes on the script tag:
 *   data-server    — Gateway WebSocket URL (e.g., ws://localhost:18789)
 *   data-token     — Gateway auth token (shared-secret)
 *   data-title     — Header title (default: "Chat")
 *   data-theme     — "dark" or "light" (default: "dark")
 *   data-position  — "bottom-right" or "bottom-left" (floating mode)
 *   data-mount     — CSS selector for embed container (omit for floating bubble)
 *   data-css       — URL to agent-chat.css (auto-detected if omitted)
 */
(function () {
    'use strict';

    // --- Config ---
    var scriptEl = document.currentScript;
    var cfg = {
        server: (scriptEl && scriptEl.getAttribute('data-server')) || '',
        token: (scriptEl && scriptEl.getAttribute('data-token')) || '',
        title: (scriptEl && scriptEl.getAttribute('data-title')) || 'Chat',
        theme: (scriptEl && scriptEl.getAttribute('data-theme')) || localStorage.getItem('ac-theme') || 'dark',
        position: (scriptEl && scriptEl.getAttribute('data-position')) || 'bottom-right',
        mount: (scriptEl && scriptEl.getAttribute('data-mount')) || null,
        css: (scriptEl && scriptEl.getAttribute('data-css')) || null
    };

    // Normalize server URL to ws:// or wss://
    var wsUrl = cfg.server.replace(/\/+$/, '');
    if (!wsUrl) wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    if (/^http/.test(wsUrl)) wsUrl = wsUrl.replace(/^http/, 'ws');

    // --- Inject CSS ---
    function injectCSS() {
        if (document.querySelector('link[data-agent-chat-css]')) return;
        var cssUrl = cfg.css;
        if (!cssUrl && scriptEl && scriptEl.src) {
            cssUrl = scriptEl.src.replace(/agent-chat\.js([?#].*)?$/, 'agent-chat.css');
        }
        if (cssUrl) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssUrl;
            link.setAttribute('data-agent-chat-css', '');
            document.head.appendChild(link);
        }
    }
    injectCSS();

    // --- Helpers ---
    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function el(tag, cls, attrs) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (attrs) {
            for (var k in attrs) {
                if (k === 'text') e.textContent = attrs[k];
                else if (k === 'html') e.innerHTML = attrs[k];
                else e.setAttribute(k, attrs[k]);
            }
        }
        return e;
    }

    function fmtTime(ts) {
        if (!ts) return '';
        var d = typeof ts === 'number' && ts < 1e12 ? new Date(ts * 1000) : new Date(ts);
        return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    }

    function safeJSON(s) { try { return JSON.parse(s); } catch (_) { return null; } }

    function genId() { return 'ac-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

    // --- State ---
    var ws = null;
    var reconnTimer = null;
    var reconnDelay = 2000;
    var connected = false;
    var pendingCallbacks = {};  // req id -> callback
    var allMessages = {};       // id -> msg obj
    var selectedMsgId = null;
    var replyToId = null;
    var userScrolled = false;
    var contextMenu = null;

    // --- DOM refs ---
    var root, msgBox, inputEl, sendBtn, spinner, statusDot, replyBar, replyBarText, themeBtn;

    // --- Gateway Protocol ---
    function gwSend(method, params, cb) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        var id = genId();
        if (cb) pendingCallbacks[id] = cb;
        ws.send(JSON.stringify({ type: 'req', id: id, method: method, params: params || {} }));
        return id;
    }

    function handleGwFrame(frame) {
        if (!frame || !frame.type) return;

        if (frame.type === 'event') {
            handleGwEvent(frame);
            return;
        }

        if (frame.type === 'res') {
            var cb = pendingCallbacks[frame.id];
            if (cb) {
                delete pendingCallbacks[frame.id];
                cb(frame);
            }
            return;
        }
    }

    function handleGwEvent(frame) {
        var evt = frame.event;
        var p = frame.payload || {};

        if (evt === 'chat' || evt === 'chat.message' || evt === 'agent') {
            handleIncomingMessage(p);
        } else if (evt === 'chat.history') {
            if (Array.isArray(p.messages)) {
                for (var i = 0; i < p.messages.length; i++) {
                    addOrUpdate(normalizeGwMsg(p.messages[i]));
                }
                renderAll();
            }
        } else if (evt === 'connect.challenge') {
            doConnect(p);
        }
    }

    function handleIncomingMessage(p) {
        var msg = normalizeGwMsg(p);
        if (!msg.id) return;
        var isNew = addOrUpdate(msg);
        renderAll();
        if (isNew) {
            spinner.classList.remove('visible');
            sendBtn.disabled = false;
        }
    }

    function normalizeGwMsg(p) {
        var id = p.id || p.messageId || p.msg_id || genId();
        var role = p.role || p.sender || 'assistant';
        if (role === 'human' || role === 'user') role = 'user';
        else if (role === 'ai' || role === 'assistant' || role === 'model') role = 'assistant';
        else if (role === 'system' || role === 'tool') role = 'system';

        var text = p.text || p.content || '';
        if (Array.isArray(text)) {
            var parts = [];
            for (var i = 0; i < text.length; i++) {
                if (typeof text[i] === 'string') parts.push(text[i]);
                else if (text[i] && text[i].text) parts.push(text[i].text);
            }
            text = parts.join('\n');
        }

        var ts = p.timestamp || p.ts || p.created_at || (Date.now() / 1000);
        if (ts > 1e12) ts = ts / 1000;

        return {
            id: String(id),
            sender: role,
            text: text,
            timestamp: ts,
            edited: false,
            reply_to: null,
            topic: p.topic || null
        };
    }

    function doConnect(challenge) {
        var params = {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
                id: 'agent-chat-widget',
                version: '2.0.0',
                platform: 'browser',
                mode: 'operator'
            },
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            caps: [],
            commands: [],
            permissions: {},
            auth: {},
            locale: navigator.language || 'en-US',
            userAgent: 'agent-chat-widget/2.0.0'
        };

        if (cfg.token) {
            params.auth = { token: cfg.token };
        }

        if (challenge && challenge.nonce) {
            params.auth.nonce = challenge.nonce;
        }

        gwSend('connect', params, function (res) {
            if (res.ok) {
                connected = true;
                statusDot.classList.add('active');
                reconnDelay = 2000;
                fetchHistory();
            } else {
                console.warn('[AgentChat] Connect failed:', res.error);
                if (res.error && res.error.details && res.error.details.reason === 'startup-sidecars') {
                    var delay = (res.error.details.retryAfterMs || 2000);
                    setTimeout(function () { doConnect(challenge); }, delay);
                }
            }
        });
    }

    function fetchHistory() {
        gwSend('chat.history', {}, function (res) {
            if (res.ok && res.payload) {
                var msgs = res.payload.messages || res.payload;
                if (Array.isArray(msgs)) {
                    for (var i = 0; i < msgs.length; i++) {
                        addOrUpdate(normalizeGwMsg(msgs[i]));
                    }
                }
                renderAll();
            }
        });
    }

    // --- Build DOM ---
    function buildWidget() {
        root = el('div', 'agent-chat-root');
        root.setAttribute('data-theme', cfg.theme);

        // Header
        var header = el('div', 'ac-header');
        var hLeft = el('div', 'ac-header-left');
        statusDot = el('div', 'ac-status-dot');
        var title = el('span', 'ac-header-title', { text: cfg.title });
        hLeft.appendChild(statusDot);
        hLeft.appendChild(title);

        var hRight = el('div', 'ac-header-right');
        themeBtn = el('button', 'ac-btn-icon', { text: cfg.theme === 'dark' ? '☀️' : '🌙', title: 'Toggle theme' });
        themeBtn.addEventListener('click', toggleTheme);
        hRight.appendChild(themeBtn);

        header.appendChild(hLeft);
        header.appendChild(hRight);

        // Messages
        msgBox = el('div', 'ac-messages');
        msgBox.addEventListener('scroll', function () {
            var gap = msgBox.scrollHeight - msgBox.scrollTop - msgBox.clientHeight;
            userScrolled = gap > 60;
        });
        msgBox.addEventListener('click', function (e) {
            if (e.target === msgBox) deselectAll();
            closeContextMenu();
        });

        // Reply bar
        replyBar = el('div', 'ac-reply-bar');
        replyBarText = el('span', 'ac-reply-bar-text');
        var replyClose = el('button', 'ac-reply-bar-close', { text: '✕' });
        replyClose.addEventListener('click', clearReply);
        replyBar.appendChild(replyBarText);
        replyBar.appendChild(replyClose);

        // Input bar
        var inputBar = el('div', 'ac-input-bar');
        inputEl = document.createElement('textarea');
        inputEl.rows = 1;
        inputEl.placeholder = 'Type a message...';
        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            if (e.key === 'Escape') { clearReply(); }
        });
        inputEl.addEventListener('input', function () {
            inputEl.style.height = 'auto';
            inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
        });

        sendBtn = el('button', '', { text: 'Send' });
        sendBtn.disabled = true;
        sendBtn.addEventListener('click', sendMessage);
        inputEl.addEventListener('input', updateSendBtn);
        spinner = el('span', 'ac-spinner');

        inputBar.appendChild(inputEl);
        inputBar.appendChild(spinner);
        inputBar.appendChild(sendBtn);

        root.appendChild(header);
        root.appendChild(msgBox);
        root.appendChild(replyBar);
        root.appendChild(inputBar);

        return root;
    }

    // --- Mount ---
    function mount() {
        var widget = buildWidget();

        if (cfg.mount) {
            var container = document.querySelector(cfg.mount);
            if (container) {
                container.appendChild(widget);
            } else {
                console.error('[AgentChat] Mount target not found:', cfg.mount);
                document.body.appendChild(widget);
            }
        } else {
            var fc = el('div', 'ac-float-container agent-chat-root ' + cfg.position);
            fc.setAttribute('data-theme', cfg.theme);
            var panel = el('div', 'ac-float-panel');
            panel.appendChild(widget);
            widget.style.height = '100%';
            var toggle = el('button', 'ac-float-toggle', { text: '💬' });
            toggle.addEventListener('click', function () {
                panel.classList.toggle('open');
                if (panel.classList.contains('open')) { scrollBottom(); inputEl.focus(); }
            });
            fc.appendChild(panel);
            fc.appendChild(toggle);
            document.body.appendChild(fc);
            root._floatContainer = fc;
        }

        document.addEventListener('click', closeContextMenu);
        wsConnect();
    }

    // --- Theme ---
    function toggleTheme() {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
        if (root._floatContainer) root._floatContainer.setAttribute('data-theme', next);
        cfg.theme = next;
        localStorage.setItem('ac-theme', next);
    }

    // --- Selection ---
    function deselectAll() {
        if (selectedMsgId) {
            var prev = msgBox.querySelector('.ac-msg.selected');
            if (prev) prev.classList.remove('selected');
            selectedMsgId = null;
        }
    }

    function selectMsg(id) {
        deselectAll();
        selectedMsgId = id;
        var node = msgBox.querySelector('[data-msg-id="' + id + '"]');
        if (node) node.classList.add('selected');
    }

    // --- Reply ---
    function setReply(id) {
        var msg = allMessages[id];
        if (!msg) return;
        replyToId = id;
        replyBarText.textContent = msg.sender + ': ' + msg.text.slice(0, 80);
        replyBar.classList.add('visible');
        deselectAll();
        inputEl.focus();
    }

    function clearReply() {
        replyToId = null;
        replyBar.classList.remove('visible');
    }

    // --- Send button state ---
    function updateSendBtn() {
        sendBtn.disabled = !inputEl.value.trim();
    }

    // --- Context menu ---
    function showContextMenu(e, msgId) {
        e.preventDefault();
        e.stopPropagation();
        closeContextMenu();

        var msg = allMessages[msgId];
        if (!msg) return;

        contextMenu = el('div', 'ac-context-menu');
        contextMenu.style.background = msg.sender === 'user' ? 'rgba(30, 58, 92, 0.75)' : 'rgba(42, 42, 42, 0.75)';

        var quoteItem = el('div', 'ac-context-item', { text: '💬 Quote' });
        quoteItem.addEventListener('click', function () { closeContextMenu(); setReply(msgId); });
        contextMenu.appendChild(quoteItem);

        document.body.appendChild(contextMenu);

        var rect = contextMenu.getBoundingClientRect();
        var x = e.clientX, y = e.clientY;
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
        if (x < 8) x = 8;
        if (y < 8) y = 8;
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
    }

    function closeContextMenu() {
        if (contextMenu && contextMenu.parentNode) {
            contextMenu.parentNode.removeChild(contextMenu);
        }
        contextMenu = null;
    }

    // --- Render ---
    function scrollBottom() {
        if (!userScrolled) msgBox.scrollTop = msgBox.scrollHeight;
    }

    function renderMsgNode(msg) {
        var div = el('div', 'ac-msg ' + msg.sender);
        div.setAttribute('data-msg-id', msg.id);

        // Action icon
        var action = el('span', 'ac-msg-action');
        if (msg.sender === 'assistant') {
            action.textContent = '↩️';
            action.title = 'Reply';
            action.addEventListener('click', function (e) { e.stopPropagation(); setReply(msg.id); });
        } else if (msg.sender === 'user') {
            action.textContent = '💬';
            action.title = 'Quote';
            action.addEventListener('click', function (e) { e.stopPropagation(); setReply(msg.id); });
        }

        // Click to select
        div.addEventListener('click', function (e) {
            if (selectedMsgId === msg.id) { deselectAll(); return; }
            selectMsg(msg.id);
        });

        // Right-click context
        div.addEventListener('contextmenu', function (e) { showContextMenu(e, msg.id); });

        // Reply quote
        if (msg.reply_to && allMessages[msg.reply_to]) {
            var quoted = allMessages[msg.reply_to];
            var quoteEl = el('div', 'ac-reply-quote', { text: quoted.sender + ': ' + quoted.text.slice(0, 60) });
            div.appendChild(quoteEl);
        }

        // Sender + time + topic tag
        var timeStr = fmtTime(msg.timestamp);
        var senderLabel = msg.sender === 'user' ? 'You' : msg.sender === 'assistant' ? 'Assistant' : 'System';
        var sender = el('div', 'ac-msg-sender');
        sender.textContent = senderLabel + ' · ' + timeStr;
        if (msg.topic) {
            var tag = el('span', 'ac-topic-tag', { text: msg.topic });
            sender.appendChild(tag);
        }
        div.appendChild(sender);

        // Bubble
        var bubble = el('div', 'ac-msg-bubble', { html: esc(msg.text) });
        div.appendChild(bubble);

        if (msg.sender !== 'system') div.appendChild(action);

        return div;
    }

    function renderAll() {
        msgBox.innerHTML = '';

        // Collect and sort messages chronologically
        var ids = Object.keys(allMessages);
        ids.sort(function (a, b) { return (allMessages[a].timestamp || 0) - (allMessages[b].timestamp || 0); });

        // Render flat — collapse consecutive assistant messages
        var msgs = [];
        for (var i = 0; i < ids.length; i++) {
            msgs.push(allMessages[ids[i]]);
        }

        var i2 = 0;
        while (i2 < msgs.length) {
            var msg2 = msgs[i2];
            if (msg2.sender === 'assistant') {
                var chain = [msg2];
                while (i2 + 1 < msgs.length && msgs[i2 + 1].sender === 'assistant') {
                    i2++;
                    chain.push(msgs[i2]);
                }
                if (chain.length > 1) {
                    var group = el('div', 'ac-chain');
                    var hidden = el('div', 'ac-chain-hidden');
                    for (var c = 0; c < chain.length - 1; c++) {
                        hidden.appendChild(renderMsgNode(chain[c]));
                    }
                    group.appendChild(hidden);
                    var expand = el('div', 'ac-chain-toggle', { text: '▶ ' + (chain.length - 1) + ' earlier repl' + (chain.length - 1 === 1 ? 'y' : 'ies') });
                    expand.addEventListener('click', function () {
                        var h = this.parentNode.querySelector('.ac-chain-hidden');
                        var showing = h.style.display !== 'none';
                        h.style.display = showing ? 'none' : 'block';
                        this.textContent = (showing ? '▶ ' : '▼ ') + this.getAttribute('data-count') + ' earlier repl' + (this.getAttribute('data-count') === '1' ? 'y' : 'ies');
                    });
                    expand.setAttribute('data-count', String(chain.length - 1));
                    group.appendChild(expand);
                    group.appendChild(renderMsgNode(chain[chain.length - 1]));
                    msgBox.appendChild(group);
                } else {
                    msgBox.appendChild(renderMsgNode(msg2));
                }
            } else {
                msgBox.appendChild(renderMsgNode(msg2));
            }
            i2++;
        }

        scrollBottom();
    }

    function addOrUpdate(data) {
        var id = data.id;
        if (!id) return false;
        var existed = !!allMessages[id];
        allMessages[id] = {
            id: id,
            sender: data.sender || 'system',
            text: data.text || '',
            timestamp: data.timestamp || (Date.now() / 1000),
            edited: data.edited || false,
            reply_to: data.reply_to || null,
            topic: data.topic || null
        };
        return !existed;
    }

    // --- WebSocket ---
    function wsConnect() {
        if (ws && ws.readyState <= 1) return;
        try { ws = new WebSocket(wsUrl); } catch (_) { schedReconn(); return; }

        ws.onopen = function () {
            reconnDelay = 2000;
            if (reconnTimer) { clearTimeout(reconnTimer); reconnTimer = null; }
        };

        ws.onmessage = function (ev) {
            var frame = safeJSON(ev.data);
            if (!frame) return;
            handleGwFrame(frame);
        };

        ws.onclose = function () {
            connected = false;
            statusDot.classList.remove('active');
            schedReconn();
        };
        ws.onerror = function () {
            connected = false;
            statusDot.classList.remove('active');
        };
    }

    function schedReconn() {
        if (reconnTimer) return;
        reconnTimer = setTimeout(function () {
            reconnTimer = null;
            reconnDelay = Math.min(reconnDelay * 1.5, 30000);
            wsConnect();
        }, reconnDelay);
    }

    // --- Send ---
    function sendMessage() {
        var text = inputEl.value.trim();
        if (!text) return;

        spinner.classList.add('visible');
        sendBtn.disabled = true;

        // Add optimistic user message
        var optId = genId();
        var optMsg = {
            id: optId,
            sender: 'user',
            text: text,
            timestamp: Date.now() / 1000,
            reply_to: replyToId || null,
            topic: null
        };
        addOrUpdate(optMsg);
        renderAll();

        gwSend('chat.send', { text: text }, function (res) {
            spinner.classList.remove('visible');
            sendBtn.disabled = false;
            if (!res.ok) {
                console.warn('[AgentChat] Send failed:', res.error);
            }
        });

        inputEl.value = '';
        inputEl.style.height = 'auto';
        clearReply();
        updateSendBtn();
    }

    // --- Public API ---
    window.AgentChat = {
        connect: wsConnect,
        send: function (text) {
            if (!text) return;
            gwSend('chat.send', { text: text });
        },
        inject: function (text) {
            if (!text) return;
            gwSend('chat.inject', { text: text });
        },
        destroy: function () {
            if (ws) { ws.close(); ws = null; }
            if (reconnTimer) { clearTimeout(reconnTimer); reconnTimer = null; }
            if (root && root.parentNode) root.parentNode.removeChild(root);
            if (root && root._floatContainer && root._floatContainer.parentNode) {
                root._floatContainer.parentNode.removeChild(root._floatContainer);
            }
        },
        setTheme: function (theme) {
            cfg.theme = theme;
            root.setAttribute('data-theme', theme);
            themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
            if (root._floatContainer) root._floatContainer.setAttribute('data-theme', theme);
            localStorage.setItem('ac-theme', theme);
        }
    };

    // --- Init ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();
