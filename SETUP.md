# Quiz Battle: Neon Arena

A responsive React/Vite multiplayer quiz game with a neon gaming interface and Supabase backend scaffold.

## What is included
- Neon responsive UI for home, lobby, live quiz, scoreboard and results
- Five-question match structure, 15-second question timer, four answers, speed bonus
- Room codes and up to eight players
- Supabase SQL migration with server-side RPC functions, one-answer-per-round constraint and scoring validation
- Local visual preview before connecting a backend

## Important status
The UI can be previewed without Supabase, but preview mode is **not real cross-device multiplayer**. Real multiplayer requires a configured Supabase project and end-to-end testing. This scaffold should be treated as a development starting point, not a security-audited production release. Before public launch, test RPC authentication, room lifecycle, deadlines, realtime synchronization and abuse/rate limits.

## 1. Run the UI locally
Install Node.js LTS, then from this folder run:

```bash
npm install
npm run dev
```

Open the local URL Vite prints, usually `http://localhost:5173`.

## 2. Configure Supabase
1. Create a Supabase project at https://supabase.com/dashboard.
2. Open SQL Editor and run all of `supabase/migrations/0001_initial.sql`.
3. Copy `.env.example` to `.env`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using Project Settings → API.
5. Restart `npm run dev`.

Never put a Supabase service-role key in a browser `.env` file.

## 3. Current backend integration note
The SQL RPC functions expect a per-player token in the `x-player-token` request header. For a production implementation, wire that token into a Supabase client request hook after room create/join, persist it safely for reload/reconnect, and validate host/player tokens consistently on every state-changing RPC. Do not expose correct answers to clients before they submit. The current frontend uses a local preview and is a UI scaffold; backend integration must be completed and verified before representing the game as production multiplayer.

## 4. Build and deploy
```bash
npm run build
```
Deploy the resulting `dist/` directory to a static host such as Vercel or Netlify. Set the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables in the host settings, then redeploy. A public frontend URL alone does not prove the multiplayer backend works—test from two separate devices/browsers.

## Gameplay rules
- Up to 8 players per room; at least 2 are needed for a real match.
- Five multiple-choice questions, 15 seconds each.
- Correct answers earn 500 points plus up to 300 speed-bonus points.
- One answer per player per round; top score wins.
