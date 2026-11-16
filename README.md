# Lineup

Check it out: lineup-consumerapp.vercel.app

A fantasy league for your own life. Players draft their week by voice, put money on it, and prove each task to their league with AI-verified photos. The interface is modelled on the ESPN Fantasy app.

A week goes like this:

1. **Draft.** Say what you want to get done this week. The draft turns it into a lineup: one task in each of five slots (body, mind, recharge, chores, people) and up to three flex tasks, each worth 10 to 50 points.
2. **Stake.** Join a league and pay its buy-in through Whop. A free league skips this step, and an unpaid member still plays but takes nothing from the pot.
3. **Prove.** Take a photo in the app, or text one to the league's agent. An AI referee passes or fails it and says why. A failed proof can be retried until the week ends.
4. **Compete.** Standings, the head-to-head matchup, leaderboards and the feed update on every phone the moment a proof is verified.
5. **Settle.** When the week ends, players who cleared all five slots get their stake back and split the stakes of those who did not, in proportion to points, less a 10% fee on those forfeited stakes.

**Stack:** Expo SDK 58 (Expo Router, TypeScript) at the repo root. Convex is the whole backend, and Convex Auth gives each device an anonymous account kept in expo-secure-store. Whop moves the money (sandbox only), Keiki carries the texts, OpenAI drafts and referees, and Supermemory remembers past weeks; all four are called only from Convex actions. Everything installed runs in Expo Go; nothing needs a custom development build. The one native module, the on-device photo pre-check in `modules/on-device-referee`, is detected at runtime and is absent in Expo Go.

## Where to read

| Document | What it covers |
| --- | --- |
| [hackathon.md](hackathon.md) | How the project was built with Convex, Capy and Revyl, with counts and the file behind each claim. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | One diagram, the boundary rules, and a paragraph on every module. |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Every Convex table, its indexes and why each exists. |
| [docs/SCORING.md](docs/SCORING.md) | The scoring, referee and settlement rules, with the functions that hold them. |
| [docs/demo/ACCEPTANCE.md](docs/demo/ACCEPTANCE.md) | The device checks and their status. |
| [docs/demo/REAL_PHONE.md](docs/demo/REAL_PHONE.md) | Opening the app on your own iPhone with Expo Go. |

## Commands

```bash
npm ci                    # install
npx expo start            # run the app (Expo Go, or press w for web)
npx convex dev --once     # typecheck, deploy and regenerate convex/_generated (needs CONVEX_DEPLOY_KEY)
npm run typecheck         # tsc for the app, then for convex/
npm test                  # vitest
npx expo install <pkg>    # add an Expo package at the version SDK 58 expects
```

CI runs `npm ci`, `npm run typecheck` and `npm test` on every pull request.

## Environment

- `EXPO_PUBLIC_CONVEX_URL` is the only value the app reads. It is public, so it is committed in `.env`; override it in `.env.local` or the build environment.
- `CONVEX_DEPLOY_KEY` lets `npx convex dev --once` deploy without a login. Keep it in your shell or `.env.local`, never in git.
- Backend secrets live in the Convex deployment, not in files: `npx convex env set NAME "$NAME"` for `OPENAI_API_KEY`, `SUPERMEMORY_API_KEY`, `WHOP_API_KEY`, `WHOP_ENVIRONMENT`, `WHOP_WEBHOOK_SECRET`, `KEIKI_API_KEY`, `KEIKI_AGENT_ID` and `KEIKI_SIGNING_SECRET`. `KEIKI_LINE_NUMBER` and `KEIKI_JOIN_CODE` are set the same way but are public: the app shows both. All ten are declared in `convex/convex.config.ts`; read them through the typed `env` exported by `convex/_generated/server`.

## Layout

```
app/          Screens only: thin, no business logic. app/(tabs) holds ROSTER, MATCHUP, FEED and LEAGUE.
components/   Shared UI, one folder per area (roster, capture, social, leaderboards, league, checkin, keiki, ui).
theme/        Design tokens: colours, spacing, hairline.
lib/          Client helpers: the Convex client, token storage, the current league, development flags.
modules/      on-device-referee, the one native module. Standalone iOS builds only.
convex/       The backend, one module per domain. convex/lib/ holds the pure rules, each with its test.
scripts/      The cloud iPhone build recipe, the Expo Go check and the demo media tools.
docs/         Engineering docs: architecture, schema, scoring, device checks.
```

Backend modules by area. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has a paragraph on each.

| Area | Modules |
| --- | --- |
| Foundation | `schema.ts`, `auth.ts`, `auth.config.ts`, `convex.config.ts`, `http.ts`, `crons.ts`, `lib/auth.ts` |
| Core data | `users.ts`, `leagues.ts`, `standings.ts`, `seed.ts`, `lib/scoring.ts`, `lib/week.ts`, `lib/seedPhotos.ts` |
| Draft and referee | `lineup.ts`, `proofs.ts`, `ai.ts` (the only file that calls OpenAI), `memory.ts` (the only file that calls Supermemory), `lib/lineupRules.ts`, `lib/verdict.ts`, `lib/geo.ts`, `lib/clip.ts` |
| Social | `feed.ts`, `challenges.ts`, `profile.ts`, `wrapped.ts`, `canvas.ts` |
| Competition | `leaderboards.ts`, `seasons.ts`, `lib/ranking.ts`, `lib/projection.ts`, `lib/schedule.ts`, `lib/weekTally.ts` |
| Money | `whop.ts` (the only file that calls Whop), `lib/settlement.ts` |
| Texting and drops | `keiki.ts` and `keikiMedia.ts` (the only files that call Keiki), `drops.ts`, `checkins.ts`, `leadChange.ts`, `lib/keikiProtocol.ts`, `lib/keikiText.ts`, `lib/dropRules.ts`, `lib/checkinRules.ts`, `lib/mediaType.ts` |

## Rules

- Every third-party API call lives in a Convex action. The app never imports `openai`, `supermemory`, `@whop/sdk` or a Keiki client, and never holds a key.
- Every public Convex function resolves its caller through `convex/lib/auth.ts`: a query or mutation calls `requireUser(ctx)`, and an action asks an internal query that does. `requireUser` honours `users.demoActAs`, the demo's Switch Player control.
- `convex/schema.ts` is the contract between workstreams: new fields are optional and index names don't change.
- `convex/http.ts` only routes; handlers live in their domain module. `POST /whop` and `POST /keiki/turn` check a signature before they read the body, and answer 401 when it fails and 503 while their secret is unset.
- A rule that more than one module needs (scoring, the week, settlement, distance, verdict thresholds) is a pure function in `convex/lib/` with no database access, so it has one definition and a test beside it.
- Tests sit next to the code as `*.test.ts` under `convex/` or `lib/`.
- Mobile binaries are built on Revyl, never with a shell command.

## Data model in one paragraph

A player drafts one lineup per calendar week and it scores in every league they belong to, so lineups, tasks and proofs are keyed by `(userId, weekStart)`, not by league. `weekStart` is the epoch milliseconds of that week's Monday 00:00 in America/Los_Angeles, and each league's `weeks` row for that week has `startsAt` equal to it. A task with a `dropId` scores only in that drop's league.

See [hackathon.md](hackathon.md) for how Convex, Capy and Revyl are used.

## Device builds and the real phone

- Cloud iPhone builds: one recipe, `scripts/build-ios-sim.sh`, run on Revyl through Capy's mobile build tool. The exact calls are in [scripts/README.md](scripts/README.md).
- Pull requests labelled `revyl-proof` are built and exercised on a cloud iPhone by Revyl proof of changes (`.revyl/config.yaml`).
- Your own iPhone: [docs/demo/REAL_PHONE.md](docs/demo/REAL_PHONE.md) opens the app in Expo Go from a QR code. `node scripts/check-expo-go.mjs` fails if a dependency would force a custom build.
