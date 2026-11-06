(() => {
  'use strict';
  if (document.documentElement.dataset.chartInspectorLoaded) return;
  document.documentElement.dataset.chartInspectorLoaded = 'true';
  const NS = 'http://www.w3.org/2000/svg';
  const states = new Set();
  const managed = new WeakSet();
  let serial = 0;
  let queued = false;
  const number = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const displayValue = value => number.format(Math.abs(value) < .05 ? 0 : value);
  // Legacy labels lack numeric metadata. Round only decimal values with a known
  // unit (or at the end), leaving dates, source hours and explanatory text intact.
  const legacyLabel = text => text.replace(/([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d+)(?=\s*(?:%|mesos\b|NX\b|index points\b|units\b|$))/g,
    raw => displayValue(Number(raw.replaceAll(',', ''))));

  function box(svg) {
    const values = (svg.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
    return values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0
      ? { x: values[0], y: values[1], width: values[2], height: values[3] }
      : { x: 0, y: 0, width: svg.clientWidth || 1, height: svg.clientHeight || 1 };
  }
  function mapping(svg) {
    const rect = svg.getBoundingClientRect();
    const view = box(svg);
    let sx = rect.width / view.width;
    let sy = rect.height / view.height;
    let ox = 0;
    let oy = 0;
    const aspect = svg.getAttribute('preserveAspectRatio') || 'xMidYMid meet';
    if (!aspect.includes('none')) {
      sx = sy = aspect.includes('slice') ? Math.max(sx, sy) : Math.min(sx, sy);
      ox = (rect.width - view.width * sx) * (aspect.includes('xMin') ? 0 : aspect.includes('xMax') ? 1 : .5);
      oy = (rect.height - view.height * sy) * (aspect.includes('YMin') ? 0 : aspect.includes('YMax') ? 1 : .5);
    }
    return { rect, view, sx: sx || 1, sy: sy || 1, ox, oy };
  }
  function localPoint(svg, clientX, clientY) {
    try {
      const matrix = svg.getScreenCTM?.();
      if (matrix && svg.createSVGPoint) {
        const point = svg.createSVGPoint();
        point.x = clientX; point.y = clientY;
        const local = point.matrixTransform(matrix.inverse());
        if (Number.isFinite(local.x) && Number.isFinite(local.y)) return local;
      }
    } catch { /* Use viewBox mapping when native SVG geometry is unavailable. */ }
    const m = mapping(svg);
    return { x: (clientX - m.rect.left - m.ox) / m.sx + m.view.x,
      y: (clientY - m.rect.top - m.oy) / m.sy + m.view.y };
  }
  function label(circle) {
    const d = circle.dataset;
    const title = circle.querySelector('title');
    let text;
    if (d.chartValue !== undefined) {
      const date = d.chartDateLabel || d.chartDate || '';
      const precision = d.chartDatePrecision === 'day' ? 'source time unspecified' : '';
      const value = d.chartValue.trim() ? Number(d.chartValue) : NaN;
      const displayCandidate=typeof d.chartDisplayValue==='string'&&d.chartDisplayValue.length<=40&&/^(?:\d{1,3}(?:,\d{3})*|\d+)\.\d$/.test(d.chartDisplayValue)?d.chartDisplayValue:null;
      const exactDisplay=displayCandidate!==null&&Number.isFinite(value)&&value>=0&&Math.abs(Number(displayCandidate.replaceAll(',',''))-value)<=.05+Math.abs(value)*Number.EPSILON*2?displayCandidate:null;
      const measurement = Number.isFinite(value)
        ? `${exactDisplay??displayValue(value)}${d.chartUnit ? ' ' + d.chartUnit : ''}` : 'unavailable';
      text = [d.chartSeries, date, precision, measurement, d.chartNote].filter(Boolean).join(' · ');
    } else text = legacyLabel(d.chartLabel || title?.textContent.trim() || '');
    if (title && title.textContent !== text) title.textContent = text;
    return text;
  }
  function enhance(svg) {
    if (managed.has(svg)) return;
    const points = [...svg.querySelectorAll('circle')].map(circle => ({
      x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')), label: label(circle),
    })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.label)
      .sort((a, b) => a.x - b.x || a.y - b.y);
    if (!points.length) return;
    managed.add(svg);
    const host = svg.closest('.chart') || svg.parentElement;
    if (!host) return;
    host.classList.add('chart-inspector-host');
    svg.classList.add('chart-inspector-ready');
    if (!svg.hasAttribute('tabindex')) svg.setAttribute('tabindex', '0');
    const chartName = svg.getAttribute('aria-label') || host.getAttribute('aria-label') || svg.querySelector('title')?.textContent || 'Chart';
    if (!svg.hasAttribute('aria-label') && !svg.hasAttribute('aria-labelledby')) svg.setAttribute('aria-label', chartName);
    const id = `chart-inspector-${++serial}`;
    const ui = document.createElement('div');
    ui.className = 'chart-inspector-ui';
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'chart-inspector-toggle';
    toggle.textContent = 'Follow: on'; toggle.setAttribute('aria-pressed', 'true');
    toggle.setAttribute('aria-label', `${chartName}: follow nearest observation`);
    const tooltip = document.createElement('output');
    tooltip.id = id; tooltip.className = 'chart-inspector-tooltip'; tooltip.hidden = true;
    tooltip.setAttribute('role', 'status'); tooltip.setAttribute('aria-live', 'polite');
    const instructions = document.createElement('span');
    instructions.id = `${id}-help`; instructions.className = 'chart-inspector-help';
    instructions.textContent = 'Move across the chart to inspect a recorded point. Arrow keys move between points; Home and End jump to the edges. Click or tap to pin or unpin; Escape clears the selection.';
    const described = svg.getAttribute('aria-describedby');
    svg.setAttribute('aria-describedby', [described, instructions.id, id].filter(Boolean).join(' '));
    ui.append(toggle, tooltip, instructions); host.append(ui);
    const guide = document.createElementNS(NS, 'g');
    guide.classList.add('chart-inspector-guide'); guide.setAttribute('aria-hidden', 'true');
    guide.style.display = 'none';
    const line = document.createElementNS(NS, 'line');
    const mark = document.createElementNS(NS, 'circle');
    mark.setAttribute('r', '5');
    guide.append(line, mark); svg.append(guide);
    let index = -1;
    let pinned = false;
    let follow = true;
    const state = { svg, ui, host };
    states.add(state);
    const hide = () => {
      index = -1; pinned = false; guide.style.display = 'none'; tooltip.hidden = true;
      host.classList.remove('chart-inspector-pinned');
    };
    const show = next => {
      index = Math.max(0, Math.min(points.length - 1, next));
      const point = points[index];
      const clip = svg.querySelector('clipPath rect');
      const view = box(svg);
      const top = clip ? Number(clip.getAttribute('y')) : view.y;
      const bottom = clip ? top + Number(clip.getAttribute('height')) : view.y + view.height;
      line.setAttribute('x1', point.x); line.setAttribute('x2', point.x);
      line.setAttribute('y1', top); line.setAttribute('y2', bottom);
      mark.setAttribute('cx', point.x); mark.setAttribute('cy', point.y);
      guide.style.display = ''; tooltip.hidden = false;
      const text = `${point.label}${pinned ? ' · pinned' : ''}`;
      if (tooltip.textContent !== text) tooltip.textContent = text;
      host.classList.toggle('chart-inspector-pinned', pinned);
      const m = mapping(svg);
      const hostRect = host.getBoundingClientRect();
      const left = m.rect.left - hostRect.left + m.ox + (point.x - m.view.x) * m.sx;
      const width = host.clientWidth || hostRect.width || m.rect.width;
      const tipWidth = tooltip.offsetWidth || Math.min(300, width - 16);
      tooltip.style.left = `${Math.max(8, Math.min(left + 12, width - tipWidth - 8))}px`;
    };
    const nearest = event => {
      const at = localPoint(svg, event.clientX, event.clientY);
      let best = 0; let dx = Infinity; let dy = Infinity;
      points.forEach((point, i) => {
        const distanceX = Math.abs(point.x - at.x);
        const distanceY = Math.abs(point.y - at.y);
        if (distanceX < dx - 1e-6 || (Math.abs(distanceX - dx) <= 1e-6 && distanceY < dy)) {
          best = i; dx = distanceX; dy = distanceY;
        }
      });
      return best;
    };
    svg.addEventListener('pointermove', event => {
      if (follow && !pinned && event.pointerType !== 'touch') show(nearest(event));
    });
    svg.addEventListener('pointerleave', () => { if (!pinned) hide(); });
    svg.addEventListener('click', event => {
      const next = nearest(event);
      pinned = !(pinned && index === next);
      show(next);
      svg.focus({ preventScroll: true });
    });
    svg.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); hide(); return; }
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index < 0 ? 0 : index + 1;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index < 0 ? points.length - 1 : index - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = points.length - 1;
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); pinned = !pinned; show(index < 0 ? 0 : index); return;
      } else return;
      event.preventDefault(); show(next);
    });
    svg.addEventListener('blur', () => { if (!pinned) hide(); });
    toggle.addEventListener('click', () => {
      follow = !follow;
      toggle.textContent = `Follow: ${follow ? 'on' : 'off'}`;
      toggle.setAttribute('aria-pressed', String(follow));
      hide();
    });
  }
  function scan() {
    queued = false;
    for (const state of states) {
      if (!state.svg.isConnected) {
        state.ui.remove(); state.host.classList.remove('chart-inspector-pinned'); states.delete(state);
      }
    }
    document.querySelectorAll('.chart svg, svg[data-chart-inspector]').forEach(enhance);
  }
  const observer = new MutationObserver(() => {
    if (!queued) { queued = true; queueMicrotask(scan); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
})();
