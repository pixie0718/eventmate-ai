// Best-effort persistence of the form and checklist ticks (storage may be blocked).
const STORAGE_KEY = 'eventmate:v1';

/** @returns {Record<string, any>} the saved state, or {} when missing or unavailable */
export function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') ?? {};
  } catch {
    return {};
  }
}

/** @param {Record<string, any>} state */
export function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: ignore */
  }
}
