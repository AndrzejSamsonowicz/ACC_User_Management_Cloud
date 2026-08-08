// shared/dom-utils.js
// Small DOM/HTML helpers shared across the app. Load this once, before any
// script that calls these functions — they attach to the global scope like
// any other plain <script> (no bundler/module system in this app yet).

// Security: HTML escape function to prevent XSS. Use whenever data that
// originates outside this app (Autodesk API responses, other users' input,
// etc.) is concatenated into an HTML string rather than set via textContent.
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
