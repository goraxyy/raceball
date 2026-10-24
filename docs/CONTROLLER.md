# Phone controller (`apps/pad`)

Owner: **Rasim**. The UI design comes from Nuris.

## Grip and controls: steering-wheel grip, landscape

| Action | Input |
|---|---|
| Steer | Rotate the phone like a wheel. ±45° = full lock (tunable) |
| Gas | Hold your right thumb anywhere on the right half (decided; auto-gas stays as an accessibility option) |
| Brake / drift | Hold your left thumb anywhere on the left half |
| Item | Shake the phone, or tap the item button |
| Accessibility | Auto-gas toggle, sensitivity slider, dead-zone slider |

## Startup flow

Scan the QR code → the page loads → one big **"Tap to start"** button. That single tap does everything browsers only allow inside a tap:

```ts
startButton.addEventListener("click", async () => {
  // iOS 13+: motion permission can only be requested inside a tap, on HTTPS
  const DME = DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  if (DME.requestPermission && (await DME.requestPermission()) !== "granted") {
    return showPermissionHelp(); // tell them to reload, or quit and reopen Safari
  }

  // Android Chrome: real orientation lock (requires fullscreen first).
  // iPhone Safari has neither API, so these fail and the UI rotation below takes over.
  try {
    await document.documentElement.requestFullscreen?.();
    await (screen.orientation as any).lock?.("landscape");
  } catch {}

  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  unlockAudio();     // play a silent sound so later sounds are allowed
  connectAndPair();  // join the room with the pairToken from the QR URL
});
```

Then: calibrate → ready → racing.

### Phone-only players

These players scanned the big screen's QR code, so there's no `pairToken` and no laptop:

- Before calibrating, the pad shows a quick **name + ball picker**.
- While racing, the pad shows a **mini HUD** along the top edge: position, lap and item. Keep it glanceable, because they're watching the big screen.
- The big screen gives them a follow-cam tile. Their pad tells them which tile is theirs ("You're the blue tile, top-left").

## Steering math: use gravity in the device frame

- `devicemotion` gives you `accelerationIncludingGravity` in the **device's own coordinate frame**. That frame does **not** change when the browser rotates the page, so this steering math is immune to auto-rotate.
- **Don't steer with `deviceorientation` beta/gamma.** Those angles break down (gimbal lock) when the phone is held upright like a wheel, which causes sudden jumps.

```ts
const MAX_STEER = (45 * Math.PI) / 180;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));            // keep within -π…π
const deadzone = (x: number, dz = 0.05) =>
  Math.abs(x) < dz ? 0 : (Math.sign(x) * (Math.abs(x) - dz)) / (1 - dz);
const curve = (x: number) => Math.sign(x) * Math.min(1, Math.abs(x)) ** 1.5; // finer control near center

let gx = 0, gy = 0, lastSteer = 0;

addEventListener("devicemotion", (e) => {
  const g = e.accelerationIncludingGravity;
  if (g?.x == null || g?.y == null) return;
  gx = oneEuroX.filter(g.x, e.timeStamp / 1000);  // One Euro filter: low jitter, low lag
  gy = oneEuroY.filter(g.y, e.timeStamp / 1000);
});

function readSteer(): number {
  if (Math.hypot(gx, gy) < 3) return lastSteer;           // phone nearly flat: angle is noise, so hold
  const angle = Math.atan2(gy, gx);                        // where gravity points in the screen plane
  const delta = wrap(angle - calib.neutral) * calib.sign;  // radians from "level", + = right
  return (lastSteer = curve(deadzone(delta / MAX_STEER))); // → -1 … 1
}
```

Send `{ seq, steer: readSteer(), gas, brake, item }` every 16 ms (`setInterval`), and immediately whenever a button changes.

**Shake to fire an item:**

```ts
// e.acceleration excludes gravity. It can be null on phones without a gyroscope,
// so fall back to a high-pass filter on accelerationIncludingGravity.
const mag = magnitudeWithoutGravity(e);
if (mag > 18 && now - lastShake > 600) fireItem();  // threshold in m/s²: tune on real phones
```

## Calibration: 2 steps, about 5 seconds

1. **"Hold it like a wheel, level."** Average the angle over 1 second and store it as `calib.neutral`. Guess which landscape side they're holding from the gravity direction.
2. **"Now turn right."** Whichever way the angle moved sets `calib.sign`. This one step automatically handles **iOS vs Android sign differences** and **left vs right landscape**.

Show a **"Flip"** button if the text appears upside down. Sign conventions differ between platforms, so let the player correct the guess in one tap. Save the calibration in `localStorage`, and add **Recalibrate** to the pause menu.

## Fixing the screen rotation problem

**The bug (seen in other phone racers):** when you steer hard, the OS auto-rotates the page to portrait. The layout jumps and the buttons move out from under your thumbs.

We fix it in three layers:

1. **Android Chrome: a real lock.** On the start tap, go fullscreen and call `screen.orientation.lock("landscape")` (see the code above).
2. **iPhone Safari: no lock API, and no fullscreen for pages on iPhone.** So:
   - **Onboarding asks players to turn on Portrait Orientation Lock** in Control Center (one swipe). The page then never rotates, and **we draw the controller rotated 90° ourselves**, toward the side they're holding.
   - **If they don't turn it on,** we counter-rotate the UI after every rotation, so the buttons stay under their thumbs. Steering keeps working either way, because it uses the device frame.
3. **Touch zones belong to the physical phone,** not to screen coordinates. "Right half" means the right half of the phone as the player holds it.

```ts
// Keep the UI fixed to the phone, whatever the browser did.
// #ui is position:fixed; left:50%; top:50%; transform-origin: center.
function layoutUI() {
  const screenAngle =
    screen.orientation?.angle ?? Number((window as any).orientation ?? 0); // 0 / 90 / 180 / 270 (or -90)
  const holdAngle = calib.holdSide === "left" ? 90 : -90;  // the landscape the player is holding
  const rot = holdAngle - screenAngle;                       // the part the browser didn't rotate for us
  const sideways = Math.abs(rot % 180) === 90;
  ui.style.width = `${sideways ? innerHeight : innerWidth}px`;
  ui.style.height = `${sideways ? innerWidth : innerHeight}px`;
  ui.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
}
addEventListener("resize", layoutUI);
screen.orientation?.addEventListener?.("change", layoutUI);
```

> Check the angle signs on a real iPhone and Android phone with the debug overlay. Then build the test matrix: Portrait Lock on and off, landscape left and right.

## Sound and visual feedback

**We don't use vibration** (decided). iPhone browsers have no vibration API, and we're not building a native app, so feedback is the same on every phone: a short sound plus a visual cue on the pad.

| Event | Sound | Visual on the pad |
|---|---|---|
| bump | Thud, louder for harder hits | Edge flash in the player's color |
| item ready | Chime | Item button glows and shows the item icon |
| boost | Whoosh | Brief streak animation |
| lap | Lap jingle | Full-screen flash + "Lap 2/3" |
| final lap | Rising jingle | "Final lap" banner |
| finish | Fanfare | Place in big type ("2nd") |
| near an edge | Quick ticks | Pulsing edge on the side of the drop |

Sounds can only play after the first tap, which the start button already provides. Keep them short and clear, because phone speakers are small and the venue is loud.

## iPhone vs Android differences

| Issue | iPhone (Safari) | Android (Chrome) | What we do |
|---|---|---|---|
| Motion permission | Only granted after a **tap** on `requestPermission()`, over HTTPS | No prompt, but HTTPS is still required | Big "Tap to start" button. HTTPS everywhere, including dev tunnels |
| Fullscreen | Not available for pages on iPhone | Works after a tap | Only needed on Android, for the orientation lock |
| Orientation lock | Not available | Works in fullscreen | iPhone: Portrait Lock onboarding + self-rotated UI |
| Screen sleeping | Wake Lock API (Safari 16.4+) | Wake Lock API | Request on start, and again on `visibilitychange` |
| Audio | Needs a tap before any sound plays. The silent switch can mute web audio | Usually fine | Unlock audio on the start tap. Ask players to switch silent mode off |
| Zoom / scroll | Ignores `user-scalable=no` | Respects it | `touch-action: none; overscroll-behavior: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;` plus `preventDefault()` on `gesturestart` |
| Axis signs | Can differ from Android | | 2-step calibration + Flip button |
| Gyroscope | All recent iPhones have one | Some budget phones don't | We only need the accelerometer |
| Power saving | Low Power Mode throttles timers and frames | Battery savers throttle too | Onboarding asks players to turn it off |
| Locking the phone or switching apps | Sensors and socket stop | Same | Server sets input to neutral after 200 ms. The pad reconnects into the same slot using the `playerId` in `localStorage` |

## Debugging on phones

- **iPhone + Mac:**
  1. On the iPhone, turn on Settings > Apps > Safari > Advanced > **Web Inspector** (older iOS: Settings > Safari > Advanced).
  2. Connect it to the Mac with a cable.
  3. In Safari on the Mac, enable Settings > Advanced > **Show features for web developers**.
  4. Choose Develop > your iPhone > the pad page.
- **Android:**
  1. Settings > About phone > tap **Build number** 7 times.
  2. Developer options > **USB debugging** on.
  3. Connect with a cable and open `chrome://inspect` in desktop Chrome.
- **No cable or no Mac:** `?debug=1` shows our overlay and loads an in-page console (Eruda), so you can see logs and errors on the phone itself.

## Debug overlay (`?debug=1`)

Shows: raw gravity x/y/z, steer value, send rate, round-trip time, permission state, screen angle, hold side, calibration values.
