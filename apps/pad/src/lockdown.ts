// Stop the browser from zooming, scrolling, selecting or showing callouts while thumbs are on the screen.
// These are controller behaviour, not looks, so they live here rather than in style.css.

export function lockDownGestures() {
  for (const el of [document.documentElement, document.body]) {
    Object.assign(el.style, {
      touchAction: "none",
      overscrollBehavior: "none",
      userSelect: "none",
      webkitUserSelect: "none",
      overflow: "hidden",
    });
    // Not in CSSStyleDeclaration's typings
    el.style.setProperty("-webkit-touch-callout", "none");
  }

  // iOS ignores user-scalable=no, so cancel pinch and double-tap zoom ourselves
  const cancel = (e: Event) => e.preventDefault();
  for (const type of [
    "gesturestart",
    "gesturechange",
    "gestureend",
    "dblclick",
    "contextmenu",
  ]) {
    document.addEventListener(type, cancel, { passive: false });
  }
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}
