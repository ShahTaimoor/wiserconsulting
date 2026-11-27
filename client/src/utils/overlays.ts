/**
 * One floating layer at a time. The chat panel, the avatar menu and the phone menu sheet each tell the others when they open, and every other
 * one closes itself. A tiny event on `window`, so the Navbar and the chat widget (separate components) need no shared parent and no store.
 *
 * The caller that closes because ANOTHER layer opened must not hand the keyboard focus back to what opened it (the layer that just opened
 * has taken the focus); a layer closed by the person (Escape, its close button) still does.
 */

export type OverlayId = "chat" | "avatar-menu" | "nav-sheet";

export const OVERLAY_IDS: ReadonlyArray<OverlayId> = Object.freeze(["chat", "avatar-menu", "nav-sheet"] as OverlayId[]);
export const OVERLAY_EVENT = "wiser-overlay-opened";

export function isOverlayId(value: unknown): value is OverlayId {
  return typeof value === "string" && (OVERLAY_IDS as ReadonlyArray<string>).includes(value);
}

/** Does the layer `self` close because `opened` just opened? Only for another, known layer: never for itself, never for unknown or odd input. */
export function shouldCloseFor(self: OverlayId, opened: unknown): boolean {
  return isOverlayId(opened) && opened !== self;
}

type Target = Pick<EventTarget, "addEventListener" | "removeEventListener" | "dispatchEvent">;

const defaultTarget = (): Target | null => (typeof window === "undefined" ? null : window);

/** Tell every other layer that `id` has just opened. */
export function announceOverlayOpen(id: OverlayId, target: Target | null = defaultTarget()): void {
  target?.dispatchEvent(new CustomEvent(OVERLAY_EVENT, { detail: { id } }));
}

/** Calls `onOther` whenever another layer opens. Returns the function that stops listening. */
export function subscribeOverlays(self: OverlayId, onOther: () => void, target: Target | null = defaultTarget()): () => void {
  if (!target) return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ id?: unknown } | undefined>).detail;
    if (shouldCloseFor(self, detail?.id)) onOther();
  };
  target.addEventListener(OVERLAY_EVENT, listener);
  return () => target.removeEventListener(OVERLAY_EVENT, listener);
}
