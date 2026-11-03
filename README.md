# Torchbearer

Built for Hack-Nation × ElevenLabs, 7th Global AI Hackathon (brief: [docs/challenge-brief.pdf](docs/challenge-brief.pdf)).

An expert records how they do a task. Torchbearer watches the screen, writes the workflow live and asks "why" by voice when the screenshots can't explain a step. The expert checks the result, a voice coach then guides a new hire through the same task, and differences go to a supervisor.

**Capture → Mapping → Teaching → Review**

## Run it

```bash
npm install
cp .env.example .env.local   # fill in the keys below
npm run agents               # creates the two ElevenLabs agents and writes their IDs into .env.local
npm run dev                  # http://localhost:3000
```

| Variable | What for |
|---|---|
| `ELEVENLABS_API_KEY` | Voice agents and conversation tokens |
| `ELEVENLABS_INTERVIEWER_AGENT_ID`, `ELEVENLABS_TUTOR_AGENT_ID` | Written by `npm run agents` (prompts live in [docs/agents.md](docs/agents.md)) |
| `GEMINI_API_KEY` | Screen reading, workflow writing, coach |
| `BLOB_READ_WRITE_TOKEN` | Private Vercel Blob store `torchbearer-db`. Get it with `vercel env pull .env.local` |

Stack: Next.js (App Router, TypeScript), Tailwind, `@elevenlabs/react`, Gemini through server routes, Vercel Blob. Deploys to Vercel. This Next.js version has breaking changes: read `node_modules/next/dist/docs/` before changing routing or API code (see [AGENTS.md](AGENTS.md)).

## Pages

| Route | Module |
|---|---|
| `/` | Redirects to `/capture` |
| `/capture` | Launch the floating bot, name the workflow, record the screen |
| `/map` | Mapping: the expert checks each observed step, corrects it, saves a named workflow |
| `/teach` | Teaching: the coach guides a learner through a saved workflow |
| `/review` | Supervisor reviews differences found while teaching |
| `/ledgerline/index.html` | The fake expense tool used as the demo work app |

## API and storage

Server routes in `src/app/api/`: `observe`, `coach`, `workflows` (and `[id]`), `progress`, `reviews`, `elevenlabs/token`.

Data is JSON in the private Blob store ([src/lib/db.ts](src/lib/db.ts)): `workflows/index.json`, `workflows/<id>.json`, `progress/<workflow>/<learner>.json`, `reviews/current.json`.

## Code layout

```
src/app/        pages and API routes
src/features/   observe/ (capture + coach bots), workmap/, apprentice/ (shared popup + dialog), plus a few legacy folders
src/lib/        gemini, db, redact, session, types
public/ledgerline/   the demo work app
docs/           formats, agent prompts, pitch, design mocks
scripts/        agents.mjs
```

Data formats: [docs/formats.md](docs/formats.md). Changes to `src/lib/types.ts` must also update it.

## Workflow (3 developers)

- `main` is always deployable and is what Vercel serves in production.
- Work on short-lived branches (`feat/…`, `fix/…`, `chore/…`), open a PR, get one review, squash-merge, delete the branch.
- The PR's Vercel preview is the place to test. `npm run build` and `npm run lint` must pass.
- No `develop` or `release` branches. Tag milestones (`v0.1.0`).
- Never commit `.env*` files except `.env.example`.
