const KEY = 'fantasy-survivors.progression';
export interface SaveData {
  version: 1;
  bestSeconds: number;
  bestKills: number;
  runs: number;
}
const initial = (): SaveData => ({ version: 1, bestSeconds: 0, bestKills: 0, runs: 0 });
let futureVersion = false;
export function loadSave(): SaveData {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (data && data.version !== 1) {
      futureVersion = true;
      return initial();
    }
    if (
      data?.version === 1 &&
      ['bestSeconds', 'bestKills', 'runs'].every(
        (k) => typeof data[k] === 'number' && Number.isFinite(data[k]) && data[k] >= 0,
      )
    )
      return {
        version: 1,
        bestSeconds: data.bestSeconds,
        bestKills: data.bestKills,
        runs: data.runs,
      };
  } catch {
    /* Storage is optional; the game remains playable. */
  }
  return initial();
}
export function saveRun(seconds: number, kills: number) {
  const old = loadSave();
  const next: SaveData = {
    version: 1,
    bestSeconds: Math.max(old.bestSeconds, seconds),
    bestKills: Math.max(old.bestKills, kills),
    runs: old.runs + 1,
  };
  try {
    if (!futureVersion) localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Private mode or quota. */
  }
  return next;
}
