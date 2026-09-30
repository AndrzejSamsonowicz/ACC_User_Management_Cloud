// Legal pages (terms.html, privacy.html): Back returns to the page the reader
// came from, and the left nav marks the section currently in view.
(function () {
    const back = document.getElementById('backLink');
    let cameFromApp = false;
    try { cameFromApp = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch { /* no referrer */ }
    if (back && cameFromApp && history.length > 1) {
        back.addEventListener('click', (e) => { e.preventDefault(); history.back(); });
    }

    const toc = document.getElementById('docToc');
    const scroller = document.getElementById('docScroll');
    if (!toc || !scroller) return;

    const links = new Map();
    toc.querySelectorAll('a[href^="#"]').forEach(a => links.set(a.getAttribute('href').slice(1), a));
    const sections = [...links.keys()].map(id => document.getElementById(id)).filter(Boolean);

    function mark() {
        // The last section whose heading has passed the top third of the view;
        // at the very end of the page, the last section.
        const top = scroller.getBoundingClientRect().top;
        const line = top + scroller.clientHeight / 3;
        const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
        let current = null;
        if (atEnd) current = sections[sections.length - 1];
        else sections.forEach(s => { if (s.getBoundingClientRect().top <= line) current = s; });
        links.forEach((a, id) => {
            const on = !!current && id === current.id;
            a.classList.toggle('is-current', on);
            if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
        });
    }

    scroller.addEventListener('scroll', mark, { passive: true });
    window.addEventListener('resize', mark);
    mark();
})();
