// Lightweight global navigation feedback events.
// Used to show the top progress bar and dim content while a navigation is
// triggered programmatically (e.g. router.push from filters or pagination).

export const NAV_EVENT = 'app:navigating';

export function emitNavigating(active: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<boolean>(NAV_EVENT, { detail: active }));
}
