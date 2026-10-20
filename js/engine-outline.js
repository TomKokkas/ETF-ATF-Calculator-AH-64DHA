// Presentation only: one continuous outline/fill around the selected header
// and the entire shared engine panel. No engine or calculation state is read.
(() => {
    const surface = document.querySelector('.engine-surface');
    const svg = surface.querySelector('.engine-outline');
    const path = svg.querySelector('path');
    const tabs = surface.querySelector('.engine-tabs');
    function drawEngineOutline() {
        const box = surface.getBoundingClientRect();
        const active = tabs.querySelector('[aria-selected="true"]');
        const tab = active.getBoundingClientRect();
        const width = box.width, height = box.height;
        if (!width || !height) return;
        const edge = 0.5, right = width - edge, bottom = height - edge;
        const radius = 10, header = tab.width - edge;
        const join = tab.bottom - box.top;
        // Draw the left-header contour, then mirror for Engine 2. The path
        // has no horizontal segment beneath the active header.
        const d = `M ${radius} ${edge}
            H ${header - radius} Q ${header} ${edge} ${header} ${radius}
            V ${join - radius} Q ${header} ${join} ${header + radius} ${join}
            H ${right - radius} Q ${right} ${join} ${right} ${join + radius}
            V ${bottom - radius} Q ${right} ${bottom} ${right - radius} ${bottom}
            H ${radius} Q ${edge} ${bottom} ${edge} ${bottom - radius}
            V ${radius} Q ${edge} ${edge} ${radius} ${edge} Z`;
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        path.setAttribute('d', d);
        path.setAttribute('transform', active.id === 'engine-tab-2' ? `translate(${width}, 0) scale(-1, 1)` : '');
    }
    new ResizeObserver(drawEngineOutline).observe(surface);
    new MutationObserver(drawEngineOutline).observe(tabs, {subtree: true, attributes: true, attributeFilter: ['aria-selected']});
    drawEngineOutline();
})();
