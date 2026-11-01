// Ranked ideas: filtered by event type and ticked preferences, boosted when the style matches.
import { IDEAS } from '../data/ideas.js';

const MAX_IDEAS = 6;
const VIBE_MATCH_SCORE = 3;
const NEEDED_PREF_SCORE = 2; // per preference an idea is built around

/**
 * @param {import('../types.js').EventInput} input
 * @returns {import('../types.js').Plan['ideas']}
 */
export function buildIdeas(input) {
  const fill = (s) => s.replaceAll('{name}', input.name).replaceAll('{city}', input.city || 'your city');
  return IDEAS
    .map(([type, vibes, needs, title, text], i) => ({ type, vibes: /** @type {string[]} */ (vibes), needs: /** @type {string[]} */ (needs), title, text, i }))
    .filter((idea) => idea.type === input.type && idea.needs.every((n) => input.prefs.includes(n)))
    .map((idea) => ({ ...idea, score: (idea.vibes.includes(input.vibe) ? VIBE_MATCH_SCORE : 0) + idea.needs.length * NEEDED_PREF_SCORE }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_IDEAS)
    .map((idea) => ({ title: fill(idea.title), text: fill(idea.text) }));
}
