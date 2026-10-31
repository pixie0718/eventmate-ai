// Budget templates and the assumptions used to judge them.

// [id, label, percent]; every template sums to 100.
export const BUDGET_TEMPLATES = {
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
export const PER_GUEST_BASELINE_INR = { wedding: 1500, birthday: 600, community: 250 };
export const INR_RATE = { INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0095 };
