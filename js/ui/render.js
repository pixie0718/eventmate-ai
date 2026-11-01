// Renders a plan into the results section. `checks` is { get(id) -> bool, set(id, bool) }.
import { parseDate, daysBetween, startOfDay } from '../dates.js';
import { donutSegments, DONUT_RADIUS, PALETTE_SIZE } from '../chart.js';
import { $, $progress, el, svgEl } from './dom.js';
import { fmtMoney, fmtCompactMoney, fmtDate, fmtMonth, whenLabel } from './format.js';

const DONUT_CENTRE = 21; // the donut is drawn in a 42 x 42 viewBox
const DONUT_STROKE = 6;

function timelineState(done, days, isEvent) {
  if (done) return 'done';
  if (isEvent) return 'event';
  if (days < 0) return 'overdue';
  return days === 0 ? 'today' : 'upcoming';
}

function renderSummary({ input, budget, timeline }) {
  const cards = [
    ['Event', input.name],
    ['Date', fmtDate(input.date)],
    ['Days left', String(timeline.daysAvailable)],
    ['Per guest', fmtMoney(budget.perGuest, input.currency)],
  ];
  $('summary').replaceChildren(
    ...cards.map(([label, value]) =>
      el('div', { class: 'stat' }, el('dt', { text: label }), el('dd', { text: value })),
    ),
  );

  const notes = $('notices');
  notes.replaceChildren();
  if (timeline.compressed) {
    notes.append(
      el('p', {
        class: 'notice',
        text:
          `Tight schedule: only ${timeline.daysAvailable} days left of the ideal ${timeline.idealDays}. ` +
          'Deadlines were compressed, so start with the earliest items.',
      }),
    );
  }
  for (const w of budget.warnings) notes.append(el('p', { class: 'notice', text: w }));
}

function renderDonut({ budget, input }) {
  const svg = svgEl('svg', {
    viewBox: '0 0 42 42',
    role: 'img',
    class: 'donut-svg',
    'aria-label': `Budget split: ${budget.lines.map((l) => `${l.label} ${l.pct}%`).join(', ')}.`,
  });
  svg.append(
    svgEl('circle', {
      class: 'donut-track',
      cx: DONUT_CENTRE,
      cy: DONUT_CENTRE,
      r: DONUT_RADIUS,
      fill: 'none',
      'stroke-width': DONUT_STROKE,
    }),
  );
  for (const seg of donutSegments(budget.lines)) {
    svg.append(
      svgEl('circle', {
        class: `seg c${seg.colorIndex}`,
        cx: DONUT_CENTRE,
        cy: DONUT_CENTRE,
        r: DONUT_RADIUS,
        fill: 'none',
        'stroke-width': DONUT_STROKE,
        'stroke-dasharray': seg.dash,
        'stroke-dashoffset': seg.offset,
      }),
    );
  }
  svg.append(svgEl('text', { class: 'donut-label', x: DONUT_CENTRE, y: 20.5, 'text-anchor': 'middle' }, 'Total'));
  svg.append(
    svgEl(
      'text',
      { class: 'donut-total', x: DONUT_CENTRE, y: 25.5, 'text-anchor': 'middle' },
      fmtCompactMoney(budget.total, input.currency),
    ),
  );
  $('donut').replaceChildren(svg);
}

function renderBudget(plan) {
  renderDonut(plan);
  const { budget, input } = plan;
  const maxPct = Math.max(...budget.lines.map((l) => l.pct));
  $('budget-body').replaceChildren(
    ...budget.lines.map((l, i) => {
      const fill = el('span', { class: `fill c${i % PALETTE_SIZE}` });
      // Relative to the largest line. The CSSOM is allowed by the CSP; an inline style attribute is not.
      fill.style.width = `${(l.pct / maxPct) * 100}%`;
      return el(
        'tr',
        {},
        el(
          'th',
          { scope: 'row' },
          el('span', { class: `swatch c${i % PALETTE_SIZE}`, 'aria-hidden': 'true' }),
          l.label,
        ),
        el('td', { text: `${l.pct}%` }),
        el('td', { class: 'num', text: fmtMoney(l.amount, input.currency) }),
        el('td', {}, el('span', { class: 'bar', 'aria-hidden': 'true' }, fill)),
      );
    }),
  );
  $('budget-total').textContent = fmtMoney(budget.total, input.currency);
  $('catering-note').textContent =
    `Catering works out to about ${fmtMoney(budget.cateringPerHead, input.currency)} per guest.`;
}

/** A persisted checkbox; `onToggle(checked)` runs after the state is saved. */
function checkboxInput(id, checks, onToggle) {
  const input = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', id }));
  input.checked = checks.get(id);
  input.addEventListener('change', () => {
    checks.set(id, input.checked);
    onToggle(input.checked);
    updateProgress();
  });
  return input;
}

function renderTimeline(plan, checks) {
  const today = startOfDay(new Date());
  $('timeline-list').replaceChildren(
    ...plan.timeline.milestones.map((m) => {
      const date = parseDate(m.date);
      const days = daysBetween(today, date);
      const id = `chk-${m.id}`;
      const li = el('li', { class: 'tl-item' });
      const refresh = (done) => {
        li.dataset.state = timelineState(done, days, m.daysBefore === 0);
      };
      const input = checkboxInput(id, checks, refresh);
      li.append(
        el(
          'div',
          { class: 'tl-date', 'aria-hidden': 'true' },
          el('span', { class: 'day', text: String(date.getDate()) }),
          el('span', { class: 'mon', text: fmtMonth(date) }),
        ),
        el('span', { class: 'tl-dot', 'aria-hidden': 'true' }),
        el(
          'div',
          { class: 'tl-card' },
          input,
          el(
            'label',
            { for: id },
            el('span', { class: 'title', text: m.title }),
            el('span', { class: 'meta', text: `${fmtDate(m.date)} · ${m.detail}` }),
            el('span', { class: 'tl-when', text: whenLabel(days) }),
          ),
        ),
      );
      refresh(input.checked);
      return li;
    }),
  );
}

function renderVendors(plan, checks) {
  $('vendor-list').replaceChildren(
    ...plan.vendors.map((v) => {
      const id = `chk-${v.id}`;
      const category = plan.budget.lines.find((l) => l.id === v.category)?.label ?? '';
      return el(
        'li',
        {},
        checkboxInput(id, checks, () => {}),
        el(
          'label',
          { for: id },
          el('span', { class: 'title', text: v.name }),
          el('span', { class: `badge ${v.priority}`, text: v.priority }),
          el('span', { class: 'meta', text: `Book by ${fmtDate(v.bookBy)} · ${category} · ${v.note}` }),
        ),
      );
    }),
  );
}

function renderIdeas(plan) {
  $('idea-list').replaceChildren(
    ...plan.ideas.map((i) => el('li', {}, el('strong', { text: i.title }), el('p', { text: i.text }))),
  );
}

/** Recounts ticked checklist items and updates the progress bar and its text. */
export function updateProgress() {
  const boxes = /** @type {NodeListOf<HTMLInputElement>} */ (
    document.querySelectorAll('#results input[type="checkbox"]')
  );
  const done = [...boxes].filter((b) => b.checked).length;
  const pct = boxes.length ? Math.round((done / boxes.length) * 100) : 0;
  $progress('progress').value = pct;
  $('progress-text').textContent = `${done} of ${boxes.length} tasks done (${pct}%)`;
}

/**
 * @param {import('../types.js').Plan} plan
 * @param {{ get(id: string): boolean, set(id: string, value: boolean): void }} checks persisted checkbox state
 * @param {{ focus?: boolean }} [options] focus the results heading (false when restoring a saved plan)
 */
export function renderPlan(plan, checks, { focus = true } = {}) {
  renderSummary(plan);
  renderBudget(plan);
  renderTimeline(plan, checks);
  renderVendors(plan, checks);
  renderIdeas(plan);
  $('results').hidden = false;
  updateProgress();
  if (focus) {
    const heading = $('results-heading');
    heading.focus();
    heading.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}
