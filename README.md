# 482 Capstone — Blackjack Web App

**Team:** Mushtariy, Michele, Jorge  
**Client:** Dr. Ho  
**Status:** Planning and design

## Overview

A multiplayer blackjack web application where users can play with friends or bots using virtual money. The platform will feature a simple, green-themed interface and advertisements in the lobby and game tables.

## Running the Project

Requires Node.js 20.19+ or 22.12+. Run everything from this folder; there is no need to `cd backend`.

```sh
npm install          # installs the frontend and (automatically) the backend
npm run dev          # backend on :5000 + frontend on :5173, in one terminal (Ctrl+C stops both)
npm run dev:memory   # same, but with a throwaway in-memory MongoDB (no MONGO_URI needed)
npm test             # game-logic, backend and React component tests
npm run build        # production build of the frontend
```

`backend/.env` needs `MONGO_URI` (not needed for `dev:memory`) and `JWT_SECRET` (used to sign login tokens).

Single parts: `npm run dev:frontend`, `npm run dev:backend`, `npm run test:logic`, `npm run test:backend`, `npm run test:ui`.

## Code Layout

- `shared/rules.js`: blackjack rules (card values, scoring, dealer, payouts) used by both the browser and the server
- `src/App.jsx`: app state and which screen is shown; screens live in `src/screens/`, the header in `src/layout/`
- `src/blackjack.js`: solo/practice game played in the browser
- `backend/realtime/`: multiplayer tables over Socket.IO (`round.js` runs the shared round)
- `backend/controllers/`, `backend/routes/`: REST API for accounts, friends, messages and history
- Tests: `*.test.js` (Node test runner) and `src/**/*.test.jsx` (Vitest + Testing Library)

## Planned Features

- **Accounts and guest access:** Register, log in, or play as a guest. New accounts receive a virtual-money bonus.
- **Game lobby:** View active tables, buy-in amounts, available seats, and game status.
- **Custom tables:** Create public or password-protected tables, invite friends, and add bots.
- **Dealer:** The dealer is always a bot. Players, including the table creator, cannot be the dealer (clarified with the professor).
- **Social features:** Friend lists, invitations, table chat, and private messages.
- **Player profiles:** Avatars, virtual-money balances, and game history.
- **Tutorial:** A skippable video tutorial that players can watch again.
- **Admin tools:** Manage users, distribute virtual money, respond to feedback, and view usage statistics.
- **Security:** Protect user accounts and prevent cheating.

## Game Rules

- Use virtual money only.
- Use one deck and reshuffle after each round.
- Support a minimum of one player and one dealer; clarify the six-person table limit with the client.
- Allow players to join between games.
- Prevent switching tables during an active game.
- Apply a virtual-money penalty for leaving an active game; the exact amount is to be determined.

## Design Goals

- Use green as the main color.
- Create an original game name and company logo.
- Keep navigation clear and easy to use.
- Include card animations and sound effects if time allows.
- Display advertisements in lobby side panels and game screens.

## Next Steps

1. Confirm unclear game rules and prioritize core features.
2. Choose the technology stack.
3. Create wireframes and a prototype for client feedback.
4. Build and test the core blackjack experience.
