export type ResolvedTheme = 'light' | 'dark';

export function themeRevealGeometry(rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, width: number, height: number) {
  const x = Math.max(0, Math.min(width, rect.left + rect.width / 2));
  const y = Math.max(0, Math.min(height, rect.top + rect.height / 2));
  return { x, y, radius: Math.ceil(Math.hypot(Math.max(x, width - x), Math.max(y, height - y))) };
}

type Transition = { ready: Promise<void>; finished: Promise<void>; skipTransition(): void };
type TransitionDocument = Document & { startViewTransition?: (update: () => void) => Transition };
let generation = 0;
let stopActive: (() => void) | undefined;

/** Reveal dark from the icon; retract the old dark surface when choosing light. */
export async function transitionTheme(theme: ResolvedTheme, icon: Element, apply: () => void): Promise<void> {
  const ticket = ++generation;
  stopActive?.();
  const doc = document as TransitionDocument;
  const root = doc.documentElement;
  const isHidden = () => doc.visibilityState === 'hidden';
  stopActive = undefined;
  delete root.dataset.themeTransition;
  let applied = false;
  const commit = () => { if (!applied && ticket === generation) { applied = true; apply(); } };
  if (root.dataset.theme === theme || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || isHidden() || doc.querySelector('[data-security-blocked]')
    || typeof doc.startViewTransition !== 'function' || typeof root.animate !== 'function') {
    commit(); return;
  }
  const { x, y, radius } = themeRevealGeometry(icon.getBoundingClientRect(), window.innerWidth, window.innerHeight);
  const collapsed = `circle(0px at ${x}px ${y}px)`;
  const expanded = `circle(${radius}px at ${x}px ${y}px)`;
  let transition: Transition | undefined;
  let animation: Animation | undefined;
  const cancel = () => { animation?.cancel(); transition?.skipTransition(); };
  const hidden = () => { if (isHidden()) cancel(); };
  root.dataset.themeTransition = theme;
  stopActive = cancel;
  doc.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', cancel);
  window.addEventListener('qc:lock-now', cancel);
  window.addEventListener('qc:lock-changed', cancel);
  try {
    transition = doc.startViewTransition(commit);
    // Register rejection handlers immediately; a superseded transition may skip
    // before its ready promise settles.
    const finished = transition.finished.catch(() => undefined);
    await transition.ready;
    if (ticket !== generation || isHidden() || doc.querySelector('[data-security-blocked]')) { cancel(); return; }
    const pseudoElement = theme === 'dark' ? '::view-transition-new(root)' : '::view-transition-old(root)';
    animation = root.animate({ clipPath: theme === 'dark' ? [collapsed, expanded] : [expanded, collapsed] }, {
      duration: 480, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'both', pseudoElement,
    });
    // Some WebViews expose transitions but cannot animate snapshot pseudo-elements.
    // Cancel rather than accidentally clipping the live application itself.
    if ((animation.effect as KeyframeEffect | null)?.pseudoElement !== pseudoElement) { cancel(); return; }
    await Promise.all([animation.finished.catch(() => undefined), finished]);
  } catch {
    cancel(); commit();
  } finally {
    animation?.cancel();
    doc.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('pagehide', cancel);
    window.removeEventListener('qc:lock-now', cancel);
    window.removeEventListener('qc:lock-changed', cancel);
    if (ticket === generation) { delete root.dataset.themeTransition; stopActive = undefined; }
  }
}
