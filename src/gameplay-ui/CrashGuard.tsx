import { Component, useSyncExternalStore } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { BuildLabel } from './BuildLabel';
import { ReportButton } from './ReportButton';
import { crashState } from './crash-state';
import { RU } from './strings-ru';

/** Task 08.5 §3.2 friendly crash screen; «Вернуться в меню» remounts the app from scratch. */
function CrashScreen() {
  const t = RU.crash;
  const entry = crashState.get();
  return (
    <div className="crash-shell">
      <section className="crash-panel" role="alertdialog" aria-labelledby="crash-title">
        <div className="eyebrow centered">{t.eyebrow}</div>
        <h2 id="crash-title">{t.title}</h2>
        <p>{t.body}</p>
        <p className="crash-hint">{t.hint}</p>
        {entry && <code className="crash-message">{entry.message}</code>}
        <button className="button primary" autoFocus onClick={() => crashState.recover()}>
          {t.back}
        </button>
        <ReportButton />
        <BuildLabel />
      </section>
    </div>
  );
}

class RenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown, _info: ErrorInfo) {
    crashState.report(error, 'render');
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Error boundary + global-error crash state around the alpha app. */
export function CrashGuard({ children }: { children: ReactNode }) {
  const crash = useSyncExternalStore(crashState.subscribe, crashState.get);
  // A new boundary instance per recovery: the app (and its Phaser game) remounts cleanly.
  const generation = useSyncExternalStore(crashState.subscribe, crashState.generation);
  if (crash) return <CrashScreen />;
  return <RenderBoundary key={generation}>{children}</RenderBoundary>;
}
