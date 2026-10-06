// shared/dom-utils.js
// Small DOM/HTML helpers shared across the app. Load this once, before any
// script that calls these functions — they attach to the global scope like
// any other plain <script> (no bundler/module system in this app yet).

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Security: HTML escape function to prevent XSS. Use whenever data that
// originates outside this app (Autodesk API responses, other users' input,
// etc.) is concatenated into an HTML string rather than set via textContent.
// Escapes quotes as well as & < >, so the result is safe both in element
// content and inside a quoted attribute value (data-*, title, ...). The old
// textContent/innerHTML round-trip left quotes intact, so a name containing
// `"` could break out of an attribute and add its own event handler.
// Never use it to build JavaScript (e.g. inline onclick="fn('${x}')"): the
// browser decodes entities before running the handler - attach listeners
// with addEventListener and pass values via dataset instead.
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

// Forma-style avatar colors: people get a pastel circle that is always the same
// for the same email; roles and companies get Forma's neutral grey circle.
const FM_AVATAR_COLORS = ['#F9B8AE', '#A9C7EC', '#BCDB95', '#FDD8A3', '#C9A7F9', '#9FDCD6', '#F5B5D6', '#D8D0C2'];
function fmAvatarColors(type, key) {
    if (type === 'company' || type === 'role') return { background: '#EEEEEE', color: '#999999' }; // as in Forma
    let sum = 0;
    for (const ch of String(key || '')) sum += ch.charCodeAt(0);
    return { background: FM_AVATAR_COLORS[sum % FM_AVATAR_COLORS.length], color: '#3C3C3C' };
}
