/*
  localStorage wrapper that never throws (private mode, blocked storage, quota).
*/

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    // ignore
  }
}
