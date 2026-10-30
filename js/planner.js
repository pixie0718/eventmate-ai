// Rule-based planning engine. Pure and deterministic: same input + same "today" => same plan.
// Works fully offline; the optional AI layer (ai.js) only adds extra ideas on top.

const MS_DAY = 86_400_000;

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function addDays(date, n) {
  const r = new Date(date);
  r.setDate(r.getDate() + n);
  return r;
}

export function daysBetween(a, b) {
  return Math.round((b - a) / MS_DAY);
}

// ---------- Budget ----------

// [id, label, percent]; every template sums to 100.
const BUDGET_TEMPLATES = {
  wedding: [
    ['venue', 'Venue & rentals', 22], ['catering', 'Catering', 28], ['decor', 'Decor & flowers', 10],
    ['photography', 'Photo & video', 10], ['attire', 'Attire & beauty', 10],
    ['entertainment', 'Music & entertainment', 6], ['misc', 'Invitations, gifts & misc', 4],
    ['contingency', 'Contingency buffer', 10],
  ],
  birthday: [
    ['venue', 'Venue', 15], ['catering', 'Food & drinks', 35], ['decor', 'Decor & balloons', 12],
    ['entertainment', 'Games & entertainment', 15], ['cake', 'Cake & desserts', 8],
    ['gifts', 'Return gifts & invites', 5], ['contingency', 'Contingency buffer', 10],
  ],
  community: [
    ['venue', 'Venue & setup', 15], ['catering', 'Refreshments', 25], ['av', 'Sound, lights & AV', 15],
    ['outreach', 'Outreach & printing', 12], ['safety', 'Permits, safety & first aid', 8],
    ['supplies', 'Volunteer supplies', 10], ['program', 'Programme & performers', 5],
    ['contingency', 'Contingency buffer', 10],
  ],
};

// Typical per-guest spend in INR, used only to flag unrealistic budgets (an assumption, see README).
const PER_GUEST_BASELINE_INR = { wedding: 1500, birthday: 600, community: 250 };
const INR_RATE = { INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0095 };

function shift(weights, from, to, points) {
  if (!(from in weights) || !(to in weights)) return;
  const moved = Math.min(points, weights[from] - 1);
  weights[from] -= moved;
  weights[to] += moved;
}

function adjustWeights(type, prefs) {
  const w = Object.fromEntries(BUDGET_TEMPLATES[type].map(([id, , pct]) => [id, pct]));
  const fun = 'entertainment' in w ? 'entertainment' : 'program';
  if (prefs.includes('kids')) shift(w, 'catering', fun, 3);
  if (prefs.includes('lowkey')) shift(w, fun, 'catering', 3);
  if (prefs.includes('outdoor')) shift(w, 'venue', 'contingency', 3); // weather backup
  if (prefs.includes('tech')) shift(w, 'decor' in w ? 'decor' : 'outreach', 'av' in w ? 'av' : fun, 2);
  return w;
}

/** Largest-remainder rounding so the lines always add up to exactly `total`. */
export function allocate(total, weights) {
  const entries = Object.entries(weights);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  const raw = entries.map(([id, w]) => ({ id, exact: (total * w) / sum }));
  const out = raw.map((r) => ({ id: r.id, amount: Math.floor(r.exact), frac: r.exact % 1 }));
  let left = total - out.reduce((s, r) => s + r.amount, 0);
  [...out].sort((a, b) => b.frac - a.frac).forEach((r) => { if (left > 0) { r.amount += 1; left -= 1; } });
  return Object.fromEntries(out.map((r) => [r.id, r.amount]));
}

function buildBudget(input) {
  const weights = adjustWeights(input.type, input.prefs);
  const amounts = allocate(input.budget, weights);
  const labels = Object.fromEntries(BUDGET_TEMPLATES[input.type].map(([id, label]) => [id, label]));
  const lines = Object.keys(weights).map((id) => ({
    id, label: labels[id], amount: amounts[id], pct: Math.round((weights[id] / 100) * 100),
  }));

  const perGuest = input.budget / input.guests;
  const baseline = PER_GUEST_BASELINE_INR[input.type] * INR_RATE[input.currency];
  const warnings = [];
  if (perGuest < baseline * 0.5) {
    warnings.push('Very tight budget per guest. Consider fewer guests, a simpler menu or a free/community venue.');
  } else if (perGuest < baseline) {
    warnings.push('Budget per guest is on the tight side. Prioritise must-have vendors and keep the buffer.');
  }
  if (input.guests > 300) warnings.push('Large guest list: lock the venue and caterer early and plan crowd flow.');

  return {
    total: input.budget, perGuest: Math.round(perGuest), cateringPerHead: Math.round(amounts.catering / input.guests),
    lines, warnings,
  };
}

// ---------- Timeline ----------

const TIMELINES = {
  wedding: { ideal: 365, items: [
    [365, 'Set budget & guest estimate', 'Agree on who pays for what and the rough guest count.', 'misc'],
    [330, 'Book the venue', 'Venue availability drives every other date.', 'venue'],
    [300, 'Shortlist caterer & photographer', 'Taste tests and portfolio reviews.', 'catering'],
    [240, 'Choose attire', 'Allow time for fittings and alterations.', 'attire'],
    [180, 'Send save-the-dates', 'Especially for guests travelling from other cities.', 'misc'],
    [120, 'Finalise menu & decor concept', 'Lock the theme, colours and menu.', 'decor'],
    [90, 'Send invitations', 'Include RSVP date and venue directions.', 'misc'],
    [60, 'Confirm vendor contracts', 'Get written quotes and payment schedules.', 'contingency'],
    [30, 'Final headcount & seating', 'Share numbers with caterer and venue.', 'catering'],
    [14, 'Reconfirm every vendor', 'Call each vendor and confirm arrival times.', 'contingency'],
    [7, 'Clear final payments', 'Keep the envelopes/tips ready in advance.', 'contingency'],
    [1, 'Rehearsal & emergency kit', 'Run the day order; pack safety pins, medicines, chargers.', 'misc'],
    [0, 'Event day', 'Delegate a trusted person to handle vendors.', 'venue'],
  ] },
  birthday: { ideal: 60, items: [
    [60, 'Set date, budget & guest list', 'Decide the theme and who to invite.', 'venue'],
    [45, 'Book venue or plan home setup', 'Reserve early for weekends.', 'venue'],
    [30, 'Send invitations', 'Digital invites are fine; add an RSVP date.', 'gifts'],
    [21, 'Order cake & book entertainers', 'Confirm flavour, size and any allergies.', 'cake'],
    [14, 'Plan menu & games', 'Match food to dietary needs of guests.', 'catering'],
    [7, 'Buy decor & return gifts', 'Check balloon, banner and prop quantities.', 'decor'],
    [3, 'Confirm RSVPs & vendors', 'Share final numbers with the caterer.', 'catering'],
    [1, 'Set up & prep', 'Decorate, chill drinks, charge the speaker.', 'decor'],
    [0, 'Party day', 'Assign a friend to take photos so you can enjoy it.', 'entertainment'],
  ] },
  community: { ideal: 90, items: [
    [90, 'Define purpose & form a committee', 'Name a lead, treasurer and volunteer coordinator.', 'outreach'],
    [75, 'Request permissions & permits', 'Local authority, society/RWA and noise permissions.', 'safety'],
    [60, 'Book venue & recruit volunteers', 'Share clear role descriptions and shifts.', 'venue'],
    [45, 'Start promotion & seek sponsors', 'Posters, WhatsApp groups, local pages.', 'outreach'],
    [30, 'Book sound, food & first aid', 'Get written quotes from at least two vendors.', 'av'],
    [21, 'Publish the programme', 'Share the schedule and accessibility details.', 'program'],
    [14, 'Volunteer briefing #1', 'Walk through roles and emergency contacts.', 'supplies'],
    [7, 'Confirm all suppliers', 'Deliveries, power, seating, signage.', 'contingency'],
    [2, 'Set up & safety walk-through', 'Check exits, wiring and first-aid kit.', 'safety'],
    [0, 'Event day', 'Run a short volunteer huddle at opening.', 'venue'],
  ] },
};

function buildTimeline(input, today) {
  const event = parseDate(input.date);
  const avail = Math.max(0, daysBetween(today, event));
  const tpl = TIMELINES[input.type];
  const factor = Math.min(1, avail / tpl.ideal);
  const items = tpl.items.map(([days, title, detail]) => [days, title, detail]);

  if (input.prefs.includes('outdoor')) items.push([7, 'Decide weather plan', 'Pick a go/no-go time and a covered backup area.']);
  if (input.prefs.includes('elders')) items.push([21, 'Check accessibility & seating', 'Ramps, shade, restrooms and reserved seats.']);
  if (input.guests > 200) items.push([30, 'Crowd & parking plan', 'Entry points, marshals and parking map.']);

  const milestones = items
    .map(([days, title, detail], i) => ({
      id: `t${days}-${i}`, title, detail, daysBefore: days,
      date: formatDate(addDays(event, -Math.round(days * factor))),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || b.daysBefore - a.daysBefore);

  return { milestones, daysAvailable: avail, idealDays: tpl.ideal, compressed: factor < 1 };
}

// ---------- Vendors ----------

// [name, category, priority, ideal lead days, note]
const VENDORS = {
  wedding: [
    ['Venue / banquet', 'venue', 'must', 330, 'Ask about overtime, power backup and cancellation terms.'],
    ['Caterer', 'catering', 'must', 300, 'Book a tasting and confirm per-plate pricing.'],
    ['Photographer & videographer', 'photography', 'must', 300, 'Review full albums, not just highlights.'],
    ['Officiant / priest', 'misc', 'must', 180, 'Confirm muhurat or ceremony timings.'],
    ['Attire & tailor', 'attire', 'must', 240, 'Schedule at least two fittings.'],
    ['Decorator / florist', 'decor', 'should', 180, 'Share a mood board and venue photos.'],
    ['Makeup & hair', 'attire', 'should', 120, 'Do a trial run.'],
    ['DJ / band', 'entertainment', 'should', 180, 'Provide a do-play and do-not-play list.'],
    ['Invitation printer', 'misc', 'should', 90, 'Proof-read names and dates twice.'],
    ['Guest transport', 'misc', 'nice', 60, 'Useful for out-of-town guests.'],
  ],
  birthday: [
    ['Venue / hall (if not at home)', 'venue', 'should', 30, 'Check capacity and end time.'],
    ['Cake baker', 'cake', 'must', 21, 'Confirm allergens and delivery slot.'],
    ['Caterer / food order', 'catering', 'must', 21, 'Count vegetarian, vegan and allergy needs.'],
    ['Decorator', 'decor', 'should', 21, 'Share theme and colours.'],
    ['Host / entertainer', 'entertainment', 'nice', 21, 'Match the act to the age group.'],
    ['Photographer', 'entertainment', 'nice', 14, 'A friend with a good phone also works.'],
    ['Return gifts', 'gifts', 'nice', 10, 'Order a few extra.'],
  ],
  community: [
    ['Venue / ground permission', 'venue', 'must', 75, 'Get approval in writing.'],
    ['Local permits / NOC', 'safety', 'must', 75, 'Check noise, fire and gathering rules.'],
    ['Volunteer coordinator', 'supplies', 'must', 60, 'One person owns the roster.'],
    ['Sound & lighting', 'av', 'must', 45, 'Test mics on the day before.'],
    ['First aid & safety marshals', 'safety', 'must', 30, 'Keep a first-aid kit and emergency numbers handy.'],
    ['Refreshments / caterer', 'catering', 'should', 30, 'Plan for dietary needs and waste bins.'],
    ['Banners & printing', 'outreach', 'should', 30, 'Include date, time and accessibility info.'],
    ['Sponsors / local businesses', 'outreach', 'nice', 45, 'Offer visible thanks on signage.'],
    ['Clean-up crew', 'supplies', 'should', 14, 'Agree on waste segregation.'],
  ],
};

function buildVendors(input, budget, today) {
  const event = parseDate(input.date);
  const ids = new Set(budget.lines.map((l) => l.id));
  const pick = (...c) => c.find((id) => ids.has(id)) ?? 'contingency';
  const avail = Math.max(0, daysBetween(today, event));
  const factor = Math.min(1, avail / TIMELINES[input.type].ideal);
  const list = VENDORS[input.type].map(([name, cat, priority, lead, note]) => ({ name, cat: pick(cat), priority, lead, note }));
  const p = input.prefs;

  if (p.includes('outdoor')) {
    list.push({ name: 'Tent / canopy rental', cat: pick('venue'), priority: 'must', lead: 45, note: 'Sidewalls help against rain and wind.' });
    list.push({ name: 'Generator / power backup', cat: pick('av', 'venue'), priority: 'should', lead: 30, note: 'Size it for sound and lighting.' });
  }
  if (input.guests >= 150) list.push({ name: 'Security / crowd marshals', cat: pick('safety', 'misc', 'venue'), priority: 'should', lead: 30, note: 'Roughly one marshal per 50 guests.' });
  if (p.includes('kids')) list.push({ name: 'Kids\' corner & supervisor', cat: pick('entertainment', 'program'), priority: 'should', lead: 21, note: 'Safe play area with an adult in charge.' });
  if (p.includes('elders')) list.push({ name: 'Accessibility support', cat: pick('venue'), priority: 'should', lead: 30, note: 'Ramp, reserved seats and drop-off point.' });
  if (p.includes('vegetarian')) list.push({ name: 'Pure-veg kitchen confirmation', cat: pick('catering'), priority: 'should', lead: 30, note: 'Ask for a separate kitchen or certification.' });
  if (p.includes('tech')) list.push({ name: 'Live-stream operator', cat: pick('av', 'photography', 'entertainment'), priority: 'nice', lead: 21, note: 'Test the internet speed at the venue.' });

  const order = { must: 0, should: 1, nice: 2 };
  return list
    .map((v, i) => {
      const bookBy = addDays(event, -Math.round(v.lead * factor));
      return {
        id: `v${i}`, name: v.name, category: v.cat, priority: v.priority, note: v.note,
        bookBy: formatDate(bookBy < today ? today : bookBy),
      };
    })
    .sort((a, b) => order[a.priority] - order[b.priority] || a.bookBy.localeCompare(b.bookBy));
}

// ---------- Ideas ----------

// [types, vibes (boost), required prefs, title, text]. {name} and {city} are filled in.
const IDEAS = [
  ['wedding', ['traditional', 'rustic'], [], 'Marigold & lantern entrance', 'Frame the entrance for {name} with marigold garlands and hanging lanterns.'],
  ['wedding', ['modern'], ['tech'], 'Live-streamed ceremony', 'Share {name} with relatives who cannot travel using a simple multi-camera stream.'],
  ['wedding', ['traditional'], [], 'Regional feast with live counters', 'Let guests watch chaat, dosa or jalebi being made fresh.'],
  ['wedding', ['modern', 'elegant'], [], 'Welcome hampers from {city}', 'Pack local sweets and a handwritten note for out-of-town guests.'],
  ['wedding', ['fun'], [], 'Family sangeet performances', 'Give each family side a 3-minute act with a shared playlist.'],
  ['wedding', ['elegant'], ['lowkey'], 'Candlelit intimate dinner', 'Minimal florals and long tables for a calm, close-knit evening.'],
  ['wedding', ['fun', 'modern'], [], 'Polaroid guest book', 'A photo booth where every guest leaves a snapshot and a message.'],
  ['wedding', ['fun'], [], 'Signature mocktail named after the couple', 'One zero-proof drink everyone can toast with.'],
  ['wedding', ['traditional'], ['elders'], 'Comfort corner for elders', 'Shaded seating, fans and a volunteer to assist grandparents.'],
  ['birthday', ['fun'], ['kids'], 'Themed treasure hunt', 'Clues hidden around the venue lead to a prize for {name}.'],
  ['birthday', ['fun'], ['kids'], 'Craft or cupcake-decorating corner', 'Keeps children busy and gives them a take-home gift.'],
  ['birthday', ['elegant'], [], 'Memory-lane photo wall', 'A wall of photos from each year of {name}\'s life.'],
  ['birthday', ['rustic', 'modern'], ['outdoor'], 'Backyard movie night', 'Projector, bean bags and popcorn under the stars.'],
  ['birthday', ['modern'], [], 'Potluck dinner with a mocktail bar', 'Relaxed, budget-friendly and everyone brings a dish.'],
  ['birthday', ['modern'], ['tech'], 'Surprise video wishes', 'Collect short clips from friends and family into one video.'],
  ['birthday', ['rustic', 'elegant'], ['outdoor'], 'Garden picnic with floral cake', 'Blankets, fruit platters and a flower-topped cake.'],
  ['birthday', ['fun'], [], 'Karaoke & dance-off', 'Pick a playlist from {name}\'s favourite years.'],
  ['birthday', ['elegant', 'modern'], [], 'Dessert table', 'Mini desserts in the party colours alongside the main cake.'],
  ['birthday', ['fun'], [], 'DIY photo props', 'Print props with inside jokes for {name} and friends.'],
  ['birthday', ['elegant', 'rustic'], [], 'Gratitude jar', 'Guests drop in a note or wish for {name} to read later.'],
  ['community', ['traditional'], [], 'Neighbourhood potluck', 'Every household brings a dish with a short story behind it.'],
  ['community', ['modern'], ['tech'], 'Volunteer QR sign-up & live board', 'Show shifts and tasks on a screen so helpers can self-assign.'],
  ['community', ['fun'], ['kids'], 'Kids\' art corner & storytelling hour', 'A supervised corner so parents can join the main programme.'],
  ['community', ['modern'], [], 'Swap stall', 'Clothes, books and plants exchanged instead of bought.'],
  ['community', ['traditional'], ['outdoor'], 'Open-air cultural evening', 'Invite local performers from {city} for a short showcase.'],
  ['community', ['traditional'], ['elders'], 'Senior-friendly welcome desk', 'Reserved seating and a volunteer guide for older neighbours.'],
  ['community', ['modern', 'fun'], [], 'Local makers\' bazaar', 'Small stalls for home businesses at low or no fee.'],
  ['community', ['modern'], ['lowkey'], 'Coffee-morning meet-up', 'A quiet gathering with name tags and conversation prompts.'],
  ['community', ['modern'], [], 'Welcome desk with volunteer badges', 'Visible helpers and a clear map reduce confusion.'],
  ['community', ['modern'], [], 'Feedback wall', 'Sticky notes for what to repeat next time.'],
  ['community', ['fun'], [], 'Local-business raffle', 'Sponsors donate prizes and get a mention on signage.'],
];

function buildIdeas(input) {
  const fill = (s) => s.replaceAll('{name}', input.name).replaceAll('{city}', input.city || 'your city');
  return IDEAS
    .map(([type, vibes, needs, title, text], i) => ({ type, vibes, needs, title, text, i }))
    .filter((idea) => idea.type === input.type && idea.needs.every((n) => input.prefs.includes(n)))
    .map((idea) => ({ ...idea, score: (idea.vibes.includes(input.vibe) ? 3 : 0) + idea.needs.length * 2 }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 6)
    .map((idea) => ({ title: fill(idea.title), text: fill(idea.text) }));
}

// ---------- Public API ----------

/** @param {object} input validated input (see validate.js) @param {Date} today */
export function buildPlan(input, today = new Date()) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const budget = buildBudget(input);
  const timeline = buildTimeline(input, t0);
  return {
    input, budget, timeline,
    vendors: buildVendors(input, budget, t0),
    ideas: buildIdeas(input),
  };
}
