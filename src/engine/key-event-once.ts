/**
 * Phaser's KeyboardPlugin handles every DOM key event immediately and re-scans its whole queue,
 * which is cleared only once per game step (POST_STEP). Its duplicate guard compares only the
 * previous event, so when several key events arrive before the next step (low frame rate,
 * headless browsers, a long main-thread task) an earlier keydown is re-dispatched and a toggle
 * such as pause/resume fires again. Wrapping a handler with this guard makes it run at most once
 * per real DOM event object; distinct presses are unaffected.
 */
export function oncePerKeyEvent<E extends object>(handler: (event: E) => void): (event: E) => void {
  const handled = new WeakSet<E>();
  return (event: E) => {
    if (handled.has(event)) return;
    handled.add(event);
    handler(event);
  };
}
