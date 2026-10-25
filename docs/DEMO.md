# Demo guide (table presentation)

HackPSU judging is **at our table**. Judges walk up, we have a few minutes, and the goal is simple: within about 30 seconds they're **holding phones and racing each other**, and a minute later they see the results.

- **Hardware:** 2 laptops + 4 phones (plus chargers and our own network).
- **Demo race:** **1 lap** (about 60–75 s). Normal races are 3 laps. The host lobby has a lap selector, and we set it to 1 for judging.

## Table layout

```
            judges stand here
  +--------------------+    +--------------------+
  | Laptop A: /host    |    | Laptop B: /play    |
  | map, standings,    |    | chase cam of       |
  | 3 follow-cam tiles |    | player 1           |
  +--------------------+    +--------------------+
    phones 2, 3, 4            phone 1
    (phone-only players)      (paired to Laptop B)
```

| Device | Role | Notes |
|---|---|---|
| **Laptop A** (the stronger one) | `/host`: lobby + QR, then a **split screen** with a first-person view per phone-only player (and bot) | It renders the most (a view per phone-only player), so use the laptop with the better GPU. Plug it in |
| **Laptop B** | `/play`: player 1's personal chase camera + HUD | Shows the "laptop player" mode. Between races it can show the architecture diagram for questions |
| **Phone 1** | Paired to Laptop B | |
| **Phones 2–4** | Phone-only players, joined from Laptop A's QR | Each watches their own view in Laptop A's split screen |
| **Judges' own phones** (optional) | They can scan Laptop A's QR to join instead of using a team phone | Up to 8 players total |
| **Router or hotspot** | Our own network for all 6 devices | Never rely on the venue Wi-Fi |

**Why judges don't install an app:** the pad is a web page. A native app couldn't be installed on a judge's iPhone on the spot (App Store/TestFlight review, or account sign-ins), so we didn't build one. Scan the QR, and you're in within about 15 seconds.

## The night before (or an hour before)

- [ ] The Railway server is running (green in the dashboard), and `curl https://raceball-server-production.up.railway.app/health` returns `ok`
- [ ] Final web + pad deployed. The protocol version matches everywhere
- [ ] The router or hotspot works. Both laptops and all 4 phones have joined it once
- [ ] Backup gameplay video recorded (60–90 s, showing phones and both laptops), saved on Laptop B
- [ ] Bots tested: we can fill empty slots in one click
- [ ] A 1-lap race measured on the demo setup: delay and fps on Laptop A written in TASKS.md

## 10 minutes before judges arrive

- [ ] **Laptop A:**
  - [ ] `/host` fullscreen, assets loaded
  - [ ] lap selector on **1**
  - [ ] notifications off, charger in, volume up
- [ ] **Laptop B:** `/play` joined and paired with phone 1, assets loaded, fullscreen, charger in
- [ ] **All 4 phones:**
  - [ ] charged, **Low Power Mode off**
  - [ ] volume up, silent switch off
  - [ ] Do Not Disturb on, auto-lock off
  - [ ] iPhones: **Portrait Orientation Lock on**
  - [ ] joined, calibrated and ready
- [ ] The QR on Laptop A is visible, in case a judge wants to use their own phone
- [ ] Optional: a small **wired** speaker for Laptop A (Bluetooth adds audio delay), because hackathons are loud

## Script (about 3 minutes per judge group)

| Time | Who | What |
|---|---|---|
| 0:00 | Ali | "Mario Kart, but you're the ball. Your phone is the steering wheel. Grab one." Hand over the phones |
| 0:15 | Rasim | "Hold it like a wheel, level... now turn right." A 5-second recalibration for each judge's grip. Show the right thumb = gas, left = brake |
| 0:30 | Nuris | Start the 1-lap race. Point out the landmarks on Laptop A as the racers pass them: Old Main, the Lion Shrine, the Creamery cone, Beaver Stadium |
| 0:35–1:45 | Everyone | **Race.** Call out the bumps, items and overtakes. If only 2–3 judges are playing, bots fill the empty slots |
| 1:45 | Ali | Results and podium. "Notice the phone never flipped to portrait mid-turn. Other phone racers have that bug, and we fixed it." |
| 2:05 | Rasim | Tech in 20 seconds: one server runs all the physics, about 100 ms from tilt to screen, any phone with a browser, no app |
| 2:25 | Nuris | Art and audio: original Penn State landmarks. Accessibility: auto-gas, color + shape for every player, captions |
| 2:45 | Ali | "Rematch?" One click restarts with the same players |

**Between judge groups:**
- Press **Rematch** and recalibrate the phones (5 s each).
- Leave the room open, so nobody has to re-pair.

## If something breaks

| Problem | Fix |
|---|---|
| The network is slow, or devices can't reach each other | Make sure all 6 devices are on our router or hotspot |
| The server is down | Check the logs in the Railway dashboard (or `railway logs`), then redeploy from the dashboard. As a last resort, run the server on Laptop B with a `cloudflared` tunnel and point `VITE_SERVER_URL` at it |
| Laptop A drops below 50 fps | It falls back from the split screen to the overview with name tags on its own. If it's still slow, lower the quality preset |
| A judge's phone won't grant motion access | Hand them a team phone. (iPhone fix: reload, or quit and reopen Safari) |
| A phone disconnects mid-race | It rejoins its slot by itself within a few seconds. If not, rescan the QR |
| Fewer than 4 players | Turn on bots |
| Everything fails | Play the backup video on Laptop B and walk through the architecture |

## After the event

- [ ] Delete the Railway project (Project Settings > Danger), or keep it on Hobby if we want to keep playing
- [ ] Remove any API keys or tokens from Vercel/Railway that we no longer need
- [ ] Tag the demo build: `git tag v1.0 && git push --tags`
