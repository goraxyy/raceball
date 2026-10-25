# Onboarding (everyone, day one)

Work through this top to bottom. It takes about an hour. At the end you can run the project, test on a real phone, and know where your own guide is.

## 1. Read, in this order

1. [README.md](../README.md): what we're building and the stack
2. [TASKS.md](../TASKS.md): decisions, milestones, your checklist
3. [WORKFLOW.md](WORKFLOW.md): how we use git, PRs and the shared conventions
4. **Your guide:**
   - Ali: [team/ali-game.md](team/ali-game.md)
   - Rasim: [team/rasim-platform.md](team/rasim-platform.md)
   - Nuris: [team/nuris-art-ui.md](team/nuris-art-ui.md)
5. The deep-dive docs your guide points to (ARCHITECTURE, CONTROLLER, ASSETS, MAP)

## 2. Accounts

| Account | Who | Why |
|---|---|---|
| GitHub | Everyone | Accept the collaborator invite to `goraxyy/raceball` (Ali sends it from Settings > Collaborators) |
| Google Drive folder `RaceBall/` | Everyone | Raw art sources, `happy_valley.blend`, reference photos |
| Vercel | Ali (the repo owner imports the projects), Rasim configures them | Hosts the web app and the pad. The free plan has no team members, so the projects live in Ali's account |
| Railway | Ali creates and configures the project | Hosts the game server ($5 one-time trial credit, then $5/month) |
| Team chat | Everyone | Daily coordination, and "blocked" messages |

## 3. Install the tools

| Tool | Who | How |
|---|---|---|
| Git | Everyone | macOS: `xcode-select --install` or `brew install git`. Windows: https://git-scm.com |
| Node.js **24 LTS** | Everyone | Installer from https://nodejs.org, or a version manager (`nvm install 24`, `fnm install 24`) |
| pnpm | Everyone | `corepack enable` (Corepack ships with Node 24). If it's missing: `npm i -g corepack` |
| VS Code + extensions | Everyone | ESLint, Prettier, glTF Tools |
| cloudflared | Everyone | macOS: `brew install cloudflared`. Windows: `winget install --id Cloudflare.cloudflared`. Linux: see Cloudflare's downloads page |
| Blender **4.x** | Ali, Nuris | https://www.blender.org |
| gltf-transform CLI | Ali, Nuris | `npm i -g @gltf-transform/cli` |
| KTX-Software (`toktx`) | Nuris (optional) | Releases on GitHub (KhronosGroup/KTX-Software). Needed only for KTX2 texture compression |
| Audacity | Nuris | https://www.audacityteam.org, for trimming and normalizing sounds |
| Railway CLI (optional) | Ali | `npm i -g @railway/cli`, for logs and manual deploys from the terminal |

Check it worked:

```bash
node -v      # v24.x
pnpm -v
git --version
cloudflared --version
```

## 4. Clone and run

```bash
git clone https://github.com/goraxyy/raceball
cd raceball
pnpm install
pnpm dev
```

The M0 bootstrap is merged, so `pnpm dev` starts all three apps:

| App | URL |
|---|---|
| Web (big screen `/host`, player view `/play`) | http://localhost:5173 |
| Pad (phone controller) | http://localhost:5174 |
| Server | ws://localhost:2567 |

Copy each app's `.env.example` to `.env.local` and fill it in. **Never commit `.env*` files.**

## 5. Test on your own phone

Phones only allow motion sensors on **HTTPS** pages, so `localhost` over Wi-Fi won't work. Use a tunnel:

```bash
cloudflared tunnel --url http://localhost:5174   # prints https://<random>.trycloudflare.com
cloudflared tunnel --url http://localhost:2567   # the server (WebSockets work through it)
```

1. Put the server tunnel URL in `apps/pad/.env.local` and `apps/web/.env.local` as `VITE_SERVER_URL=wss://<random>.trycloudflare.com`, then restart `pnpm dev`.
2. Open the pad tunnel URL on your phone.
3. Quick tunnels change URL every time they restart. Once the Railway server is up, you only need the pad tunnel.

**Phone settings for testing:**
- Low Power Mode **off**
- Silent switch **off**, volume up
- iPhone: Portrait Orientation Lock **on**. The pad UI rotates itself, and this is how real players will use it.

**Debugging a phone:** see [CONTROLLER.md > Debugging on phones](CONTROLLER.md#debugging-on-phones). Every team member should be able to open the phone's console.

## 6. Know the map of the repo

```
apps/web/src/game   Ali    Babylon scene, cameras, VFX hookup
apps/web/src/net    Rasim  connection, snapshots, interpolation, React hooks
apps/web/src/ui     Nuris  lobby, HUD, big-screen overlay, results
apps/web/public/assets  Nuris  optimized models, textures, sounds, particles
apps/pad            Rasim (logic) + Nuris (style.css, markup)
apps/server         Rasim  Colyseus rooms, 60 Hz loop
packages/shared     Rasim  protocol.ts, the contract (everyone reviews)
packages/game-core  Ali    physics, race rules, items, track loading
```

## 7. Your first contribution (10 minutes)

To prove your setup works end to end:

1. Make a branch: `git switch -c <yourname>/hello`.
2. Add your name and phone model to the test-device table in [TASKS.md](../TASKS.md#test-devices).
3. Commit, push, open a PR, get it reviewed, merge. The steps are in [WORKFLOW.md](WORKFLOW.md).

## 8. Getting help

- Stuck for more than 30 minutes? Post in the team chat with what you tried and the exact error.
- Blocked by someone else's part? Write `BLOCKED: <why>` next to the task in TASKS.md, and tell them.
- Not sure who owns something? Check the ownership table in the [README](../README.md#team-and-ownership).
