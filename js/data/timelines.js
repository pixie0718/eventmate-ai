// Milestone templates: [days before the event, title, detail].

export const TIMELINES = {
  wedding: { ideal: 365, items: [
    [365, 'Set budget & guest estimate', 'Agree on who pays for what and the rough guest count.'],
    [330, 'Book the venue', 'Venue availability drives every other date.'],
    [300, 'Shortlist caterer & photographer', 'Taste tests and portfolio reviews.'],
    [240, 'Choose attire', 'Allow time for fittings and alterations.'],
    [180, 'Send save-the-dates', 'Especially for guests travelling from other cities.'],
    [120, 'Finalise menu & decor concept', 'Lock the theme, colours and menu.'],
    [90, 'Send invitations', 'Include RSVP date and venue directions.'],
    [60, 'Confirm vendor contracts', 'Get written quotes and payment schedules.'],
    [30, 'Final headcount & seating', 'Share numbers with caterer and venue.'],
    [14, 'Reconfirm every vendor', 'Call each vendor and confirm arrival times.'],
    [7, 'Clear final payments', 'Keep the envelopes/tips ready in advance.'],
    [1, 'Rehearsal & emergency kit', 'Run the day order; pack safety pins, medicines, chargers.'],
    [0, 'Event day', 'Delegate a trusted person to handle vendors.'],
  ] },
  birthday: { ideal: 60, items: [
    [60, 'Set date, budget & guest list', 'Decide the theme and who to invite.'],
    [45, 'Book venue or plan home setup', 'Reserve early for weekends.'],
    [30, 'Send invitations', 'Digital invites are fine; add an RSVP date.'],
    [21, 'Order cake & book entertainers', 'Confirm flavour, size and any allergies.'],
    [14, 'Plan menu & games', 'Match food to dietary needs of guests.'],
    [7, 'Buy decor & return gifts', 'Check balloon, banner and prop quantities.'],
    [3, 'Confirm RSVPs & vendors', 'Share final numbers with the caterer.'],
    [1, 'Set up & prep', 'Decorate, chill drinks, charge the speaker.'],
    [0, 'Party day', 'Assign a friend to take photos so you can enjoy it.'],
  ] },
  community: { ideal: 90, items: [
    [90, 'Define purpose & form a committee', 'Name a lead, treasurer and volunteer coordinator.'],
    [75, 'Request permissions & permits', 'Local authority, society/RWA and noise permissions.'],
    [60, 'Book venue & recruit volunteers', 'Share clear role descriptions and shifts.'],
    [45, 'Start promotion & seek sponsors', 'Posters, WhatsApp groups, local pages.'],
    [30, 'Book sound, food & first aid', 'Get written quotes from at least two vendors.'],
    [21, 'Publish the programme', 'Share the schedule and accessibility details.'],
    [14, 'Volunteer briefing #1', 'Walk through roles and emergency contacts.'],
    [7, 'Confirm all suppliers', 'Deliveries, power, seating, signage.'],
    [2, 'Set up & safety walk-through', 'Check exits, wiring and first-aid kit.'],
    [0, 'Event day', 'Run a short volunteer huddle at opening.'],
  ] },
};

// Extra milestones added on top of a template: [when, [days before, title, detail]].
// `when` is { pref } (the preference is ticked) or { minGuests } (at least that many guests).
export const EXTRA_MILESTONES = [
  { when: { pref: 'outdoor' }, item: [7, 'Decide weather plan', 'Pick a go/no-go time and a covered backup area.'] },
  { when: { pref: 'elders' }, item: [21, 'Check accessibility & seating', 'Ramps, shade, restrooms and reserved seats.'] },
  { when: { minGuests: 201 }, item: [30, 'Crowd & parking plan', 'Entry points, marshals and parking map.'] },
];
