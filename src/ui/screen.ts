// Phone screen helpers: full screen and landscape lock where the phone allows it.
// iPhones don't allow either from a web page; the game simply carries on there.

export function isPhone(): boolean {
  return window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
}

export function goFullscreenOnPhone(): void {
  if (!isPhone()) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(() => lockLandscape())
        .catch(() => undefined);
    }
  } catch {
    /* not allowed here */
  }
}

function lockLandscape(): void {
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  try {
    o?.lock?.('landscape').catch(() => undefined);
  } catch {
    /* not supported */
  }
}
