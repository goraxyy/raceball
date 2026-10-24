# Demo guide

The goal: in about 3 minutes, judges are **holding phones and racing each other**, then they see the results.

## Why judges join through the browser (no app install)

- Getting a native app onto a judge's iPhone during the event isn't realistic:
  - **TestFlight public links** need Apple's beta review, which usually takes 1–2 days and sometimes much longer.
  - **Expo Go** on iPhone only opens a project when the phone is signed into *our* Expo account.
- So the pad is a web page. Judges scan a QR code and they're in within about 15 seconds.
- iPhones get sound and visual feedback, because iPhone browsers have no vibration API. Android phones also get vibration.

## Devices

| Device | Role | Who sets it up |
|---|---|---|
| Projector laptop | `/host`: big screen, lobby, map, standings, follow-cams | Ali |
| 2–3 team laptops | `/play`: personal chase cams | Everyone |
| Team phones (4+) | Pads, already paired and calibrated | Everyone |
| Judges' phones | Phone-only players from the big-screen QR | The judges |
| Travel router or hotspot | Our own network | Rasim |

## The night before (or an hour before)

- [ ] The Railway server is running (green in the dashboard), and `curl https://raceball-server.up.railway.app/health` returns `ok`
- [ ] Final web + pad deployed. The protocol version matches everywhere
- [ ] The router or hotspot works. Every laptop and phone has joined it once
- [ ] Backup gameplay video recorded (60–90 s, showing phones and the big screen)
- [ ] Bots tested: we can fill the race to 8 in one click
- [ ] Measured delay and fps on the demo setup, written in TASKS.md

## 10 minutes before

- [ ] Projector laptop: `/host` fullscreen, notifications off, charger in, assets loaded
- [ ] Team laptops: `/play` joined and paired, assets loaded
- [ ] Phones:
  - [ ] charged
  - [ ] **Low Power Mode off**
  - [ ] volume up, silent switch off
  - [ ] Do Not Disturb on
  - [ ] iPhones: **Portrait Orientation Lock on**
  - [ ] calibrated and ready
- [ ] The big-screen QR is visible and large
- [ ] Do one test join from a phone that hasn't joined yet

## Script (about 3 minutes)

| Time | Who | What |
|---|---|---|
| 0:00 | Ali | "Mario Kart, but you're the ball. Your phone is the steering wheel. Scan this and you're in." |
| 0:15 | Rasim | Hand out the team phones, and help judges scan the big-screen QR |
| 0:35 | Nuris | Start the race. Point out the Penn State landmarks as they appear |
| 0:40–1:50 | Everyone | **Race:** cheer, call out the bumps and items. Turn on bots if fewer than 4 people are playing |
| 1:50 | Ali | Results and podium: "Look, the phone never flipped to portrait mid-turn. We fixed that." |
| 2:10 | Rasim | Tech in 20 seconds: the server runs the only physics, about 100 ms from tilt to screen, works on any phone without an app |
| 2:30 | Nuris | The art and audio pipeline, the accessibility options (auto-gas, color + shape IDs, captions) |
| 2:50 | Ali | "Want a rematch?" |

**Make haptics visible:** the audience can't feel a vibration, so the big screen shows a ripple on a player's tag whenever their phone buzzes.

## If something breaks

| Problem | Fix |
|---|---|
| Venue Wi-Fi is slow, or devices can't reach each other | Switch everything to our router or hotspot |
| The server is down | Check the logs in the Railway dashboard (or `railway logs`), then redeploy from the dashboard. As a last resort, run the server locally with a `cloudflared` tunnel and point `VITE_SERVER_URL` at it |
| A judge's phone won't grant motion access | Hand them a team phone. (iPhone fix: reload, or quit and reopen Safari) |
| A phone disconnects mid-race | It rejoins its slot by itself within a few seconds. If not, rescan the QR |
| Fewer than 4 players | Turn on bots |
| Everything fails | Play the backup video and walk through the architecture |

## After the event

- [ ] Delete the Railway project (Project Settings > Danger), or keep it on Hobby if we want to keep playing
- [ ] Remove any API keys or tokens from Vercel/Railway that we no longer need
- [ ] Tag the demo build: `git tag v1.0 && git push --tags`
