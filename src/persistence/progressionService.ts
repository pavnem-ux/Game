import { checkPurchase, purchaseRank } from '../talents';
import type { TalentBlockReason } from '../talents';
import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { applyRunResult } from '../profile';
import type { PlayerProfile, RunResult, RunSummary } from '../profile';
import type { SaveDataError } from './saveSchema';
import type { LoadResult, SaveFailure, SaveStore } from './saveStore';

/**
 * Task 08 campaign/progression state (framework-free; the UI only renders it). Every permanent
 * change — a finished run, a class choice, a new profile — is applied to a copy and committed with
 * ONE save. Nothing is saved per frame. On a write failure the in-memory state is kept, the status
 * turns into a visible warning, and results never claim to be saved.
 */
export interface SaveStatus {
  /** saved: the last change is on disk. unsaved: the last write failed (in memory only).
   *  not-persisted: storage unavailable for the whole session. error: the save could not be
   *  loaded; nothing is overwritten. */
  readonly state: 'saved' | 'unsaved' | 'not-persisted' | 'error';
  readonly lastSavedAt: string | null;
  readonly failure: SaveFailure | null;
  readonly load: LoadResult['status'];
  readonly loadError: SaveDataError | null;
}
export interface ProgressionState {
  readonly profile: PlayerProfile | null;
  readonly status: SaveStatus;
}
export interface CommitResult {
  readonly summary: RunSummary;
  /** True only if the profile containing these rewards was written to storage. */
  readonly saved: boolean;
  readonly failure: SaveFailure | null;
}
export interface ProgressionService {
  getState(): ProgressionState;
  subscribe(listener: (state: ProgressionState) => void): () => void;
  commitRun(result: RunResult, finishedAt?: string | null): CommitResult;
  selectClass(characterClass: CharacterClass): boolean;
  /** Re-attempts the last failed write with the current in-memory profile. */
  retrySave(): boolean;
  /**
   * Task 09: buys the next rank of a talent node for a class (tree rules from `src/talents`) and
   * autosaves. A refused purchase changes nothing; a failed write keeps it in memory (unsaved).
   */
  purchaseTalent(
    characterClass: CharacterClass,
    nodeId: string,
  ): Readonly<{
    ok: boolean;
    reason: TalentBlockReason | 'no-profile' | null;
    saved: boolean;
    failure: SaveFailure | null;
  }>;
  /** Replaces the profile (import). On a failed write the previous profile stays current. */
  replaceProfile(profile: PlayerProfile): {
    readonly ok: boolean;
    readonly failure: SaveFailure | null;
  };
}

export function createProgressionService(store: SaveStore): ProgressionService {
  const loaded = store.load();
  let profile: PlayerProfile | null = loaded.profile;
  let status: SaveStatus = Object.freeze({
    state:
      loaded.status === 'error'
        ? 'error'
        : loaded.status === 'unavailable'
          ? 'not-persisted'
          : 'saved',
    lastSavedAt: loaded.profile?.lastSavedAt ?? null,
    failure: null,
    load: loaded.status,
    loadError: 'error' in loaded ? loaded.error : null,
  });
  const listeners = new Set<(state: ProgressionState) => void>();
  const state = (): ProgressionState => Object.freeze({ profile, status });
  const emit = () => {
    const s = state();
    for (const l of [...listeners]) l(s);
  };
  /** Commits `next` with one save; returns whether it reached storage. */
  const commit = (next: PlayerProfile): { ok: boolean; failure: SaveFailure | null } => {
    if (status.state === 'error') return { ok: false, failure: 'blocked' };
    const result = store.save(next);
    if (result.ok) {
      profile = result.profile;
      status = Object.freeze({
        ...status,
        state: 'saved',
        lastSavedAt: result.profile.lastSavedAt,
        failure: null,
      });
    } else {
      profile = next; // keep the in-memory progress; it is NOT on disk
      status = Object.freeze({
        ...status,
        state: status.state === 'not-persisted' ? 'not-persisted' : 'unsaved',
        failure: result.reason,
      });
    }
    emit();
    return { ok: result.ok, failure: result.ok ? null : result.reason };
  };
  // A brand-new profile is a permanent change: persist it right away.
  if (loaded.status === 'new' && profile) commit(profile);

  return {
    getState: state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    commitRun(result, finishedAt = null) {
      if (!profile) throw new Error('No profile is loaded (save error); progress cannot change.');
      const { profile: next, summary } = applyRunResult(profile, result, finishedAt);
      if (summary.duplicate)
        return Object.freeze({ summary, saved: status.state === 'saved', failure: status.failure });
      const written = commit(next);
      return Object.freeze({ summary, saved: written.ok, failure: written.failure });
    },
    selectClass(characterClass) {
      if (!profile) return false;
      if (!CHARACTER_CLASSES.includes(characterClass)) throw new TypeError('Unknown class.');
      if (profile.selectedClass === characterClass) return true;
      return commit(Object.freeze({ ...profile, selectedClass: characterClass })).ok;
    },
    retrySave() {
      if (!profile || status.state === 'saved') return status.state === 'saved';
      return commit(profile).ok;
    },
    purchaseTalent(characterClass, nodeId) {
      if (!profile || status.state === 'error')
        return Object.freeze({ ok: false, reason: 'no-profile', saved: false, failure: null });
      const progress = profile.classes[characterClass];
      if (!progress) throw new TypeError('Unknown class.');
      const check = checkPurchase(characterClass, progress.level, progress.talents, nodeId);
      if (!check.ok)
        return Object.freeze({ ok: false, reason: check.reason, saved: false, failure: null });
      const talents = purchaseRank(characterClass, progress.level, progress.talents, nodeId);
      const written = commit(
        Object.freeze({
          ...profile,
          classes: Object.freeze({
            ...profile.classes,
            [characterClass]: Object.freeze({ ...progress, talents }),
          }),
        }),
      );
      return Object.freeze({ ok: true, reason: null, saved: written.ok, failure: written.failure });
    },
    replaceProfile(next) {
      if (status.state === 'error') return { ok: false, failure: 'blocked' };
      const previous = profile,
        previousStatus = status;
      const written = commit(next);
      if (!written.ok) {
        profile = previous; // an import that cannot be saved does not replace anything
        status = Object.freeze({ ...previousStatus, failure: written.failure });
        emit();
      }
      return written;
    },
  };
}

/** Unique run id for a new campaign run (UI-side; never used inside the simulation). */
export function generateRunId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? `run-${globalThis.crypto.randomUUID()}`
    : `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
