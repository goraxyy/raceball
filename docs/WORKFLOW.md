# Workflow and conventions

## Git: the everyday loop

```bash
# 1. Start from an up-to-date main
git switch main
git pull

# 2. One branch per task: <name>/<short-topic>
git switch -c ali/ball-steering

# 3. Work in small steps and commit often
git add <files>            # or: git add -p to pick changes piece by piece
git commit -m "game-core: heading-based steering"

# 4. Before opening a PR, catch up with main
git fetch origin
git rebase origin/main     # fix conflicts if any (see below)

# 5. Push and open a PR
git push -u origin ali/ball-steering
# then open the PR on GitHub (or: gh pr create --fill)
```

After the PR is approved: use **Squash and merge** on GitHub, delete the branch, then `git switch main && git pull`.

### Commit messages

Use `area: what changed`, in the present tense:

- `game-core: add checkpoint lap counting`
- `pad: counter-rotate UI on orientation change`
- `server: forward bump events to pads`
- `assets: add Old Main v1 (12k tris)`
- `docs: update protocol table`

### Resolving rebase conflicts

1. Git stops and lists the conflicted files. Open each one and pick the right code between the `<<<<<<<` and `>>>>>>>` markers.
2. Then run `git add <file>` and `git rebase --continue`.
3. Because the rebase rewrote your branch, push with `git push --force-with-lease`.
4. **Only ever force-push your own branch, never `main`.**

If a rebase goes wrong: `git rebase --abort` puts everything back, and you can ask for help.

### Protecting `main`

Ali, as the repo owner, sets this up once:

1. Settings > Rules > Rulesets > New branch ruleset, targeting `main`.
2. Turn on **Require a pull request before merging**, and **Block force pushes**.
3. Requiring approvals is optional. With three people, we just agree that someone looks at every PR.

## Pull requests

- **Small:** one task from TASKS.md per PR when possible. Aim to merge within a few hours of starting.
- Fill in the PR template: what, why, how to test, screenshots or video.
- Tick the task in TASKS.md **in the same PR**.
- **Reviewer:** anyone else on the team. Check that the app still runs (`pnpm dev`), that the change does what it says, and that it follows the conventions below.
- **Vercel posts a preview URL** on every PR. Use it to test on phones without a tunnel.

## When is a PR done?

- [ ] `pnpm typecheck` and `pnpm lint` pass
- [ ] `pnpm test` passes (if the PR touches `game-core`)
- [ ] You ran it yourself, and on a real phone if the PR touches the pad
- [ ] TASKS.md is updated
- [ ] No secrets, no `node_modules`, no raw art sources, no files over 20 MB
- [ ] New assets are listed in the credits table in [ASSETS.md](ASSETS.md#credits)

## Changing the protocol (`packages/shared/src/protocol.ts`)

The protocol is the contract between the game, the server, the screens and the phones. To change it:

1. Say in the team chat what you want to change and why.
2. Open a PR that:
   - edits `protocol.ts`
   - bumps `PROTOCOL_VERSION`
   - updates the protocol section of [ARCHITECTURE.md](ARCHITECTURE.md#protocol-v1-draft-lives-in-packagessharedsrcprotocolts)
3. The owners of every affected side review it.
4. After merging, deploy the **server first**, then web and pad. Mismatched versions show "please refresh" instead of breaking silently.

## Shared conventions

### Units and coordinates

These are the same in Blender exports, Rapier and Babylon:

- **Meters, seconds, radians, kilograms.**
- **Right-handed, Y up, +Z forward** (the glTF standard).
  - Babylon must run with `scene.useRightHandedSystem = true`, so positions and rotations from the server map 1:1.
- **Heading** `h` is the rotation around +Y.
  - `h = 0` faces +Z, and `forward(h) = (sin h, 0, cos h)`.
  - Steering right (`steer > 0`) **decreases** `h`.
- **Quaternions** are `[x, y, z, w]` everywhere (Rapier, Babylon and the protocol all use this order).

### TypeScript

- `strict: true` everywhere. Avoid `any`, except where a browser API isn't typed yet (orientation lock, the iOS permission call). Leave a comment when you use it.
- **`game-core` is pure TypeScript:** no Babylon, no DOM, no network. It has to run on the server and in the browser.
- **React components only render.** Game logic lives in `game-core`, and networking lives in `apps/web/src/net`.
- Naming: `camelCase` for variables and functions, `PascalCase` for types, classes and components, `SCREAMING_CASE` for constants. File names are `kebab-case.ts`, except React components (`RaceHud.tsx`).
- No magic numbers in game logic. Feel values go in `game-core/src/tuning.ts`, and shared values go in `packages/shared/src/constants.ts`.

### Environment variables

- Every app has an `.env.example` listing what it needs. Copy it to `.env.local`.
- Browser-visible variables must start with `VITE_`. **Never put secrets in a `VITE_` variable**, because they end up in the public bundle.

| Variable | App | Example |
|---|---|---|
| `VITE_SERVER_URL` | web, pad | `wss://raceball-server-production.up.railway.app` |
| `VITE_PAD_URL` | web | `https://raceball-pad.vercel.app` |
| `PORT` | server | `2567` locally. Railway sets it automatically |
| `TRACK_PATH` | server | Optional. Defaults to `../../packages/game-core/tracks/happy_valley_col.glb` (relative to `apps/server`) |

### Assets in git

- Commit **only optimized runtime files**: `apps/web/public/assets/...` and `packages/game-core/tracks/...`.
- Raw sources (`.blend`, `.psd`, `.wav`, `.fbx`) go in the Drive folder.
- Names and budgets are in [ASSETS.md](ASSETS.md). Check a file's size before committing: `du -h <file>`.

## Deploying

| What | How | Who |
|---|---|---|
| Web + pad | Automatic. Vercel deploys `main` to production, and every PR gets a preview URL | Nobody needs to do anything |
| Server | Automatic. Railway redeploys on every push to `main` that touches `apps/server`, `packages/` or the lockfile ([setup](team/ali-game.md#6-deploying-the-server-to-railway)) | Nobody, once Ali has set it up |
| Order | When the protocol changes: server first, then web and pad | |

## Check-ins

- At the end of every milestone, and whenever something big lands:
  - everyone merges
  - you play one full match together on real devices
  - you update TASKS.md and pick the next tasks
- Write down measured numbers (delay, fps, download size) in TASKS.md, so the team knows whether we're on budget.
