/**
 * Task 08 campaign run state machine (pure reducer).
 * - Victory = boss dead AND duration reached, in either order.
 * - Defeat = the survival run ended (death without revival / second death). Never unlocks.
 * - Abandoned = player quit/reload during the run (no rewards).
 * The first resolution wins; afterwards every input is ignored (exactly-once resolution).
 */
export type RunOutcome = 'victory' | 'defeat' | 'abandoned';
export interface CampaignRunState {
  readonly status: 'active' | RunOutcome;
  readonly bossKilled: boolean;
  readonly durationReached: boolean;
  readonly eliteKills: number;
  /** Simulation time of the resolution (null while active). */
  readonly resolvedAt: number | null;
}
export type RunInput =
  | { readonly type: 'boss-killed'; readonly time: number }
  | { readonly type: 'elite-killed'; readonly time: number }
  | { readonly type: 'duration-reached'; readonly time: number }
  | { readonly type: 'player-defeated'; readonly time: number }
  | { readonly type: 'abandon'; readonly time: number };

export const INITIAL_RUN_STATE: CampaignRunState = Object.freeze({
  status: 'active',
  bossKilled: false,
  durationReached: false,
  eliteKills: 0,
  resolvedAt: null,
});

export interface RunTransition {
  readonly state: CampaignRunState;
  /** The outcome this input resolved, or null (no change of status). */
  readonly resolved: RunOutcome | null;
}

export function reduceRun(state: CampaignRunState, input: RunInput): RunTransition {
  if (state.status !== 'active') return { state, resolved: null };
  const resolve = (next: CampaignRunState, outcome: RunOutcome): RunTransition => ({
    state: Object.freeze({ ...next, status: outcome, resolvedAt: input.time }),
    resolved: outcome,
  });
  switch (input.type) {
    case 'elite-killed':
      return {
        state: Object.freeze({ ...state, eliteKills: state.eliteKills + 1 }),
        resolved: null,
      };
    case 'boss-killed':
    case 'duration-reached': {
      const next = Object.freeze({
        ...state,
        bossKilled: state.bossKilled || input.type === 'boss-killed',
        durationReached: state.durationReached || input.type === 'duration-reached',
      });
      return next.bossKilled && next.durationReached
        ? resolve(next, 'victory')
        : { state: next, resolved: null };
    }
    case 'player-defeated':
      return resolve(state, 'defeat');
    case 'abandon':
      return resolve(state, 'abandoned');
  }
}
