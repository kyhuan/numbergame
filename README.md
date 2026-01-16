# Numbergame

Two-player online guessing game with rooms, login, and match history.

## Features
- Register/login (username + password, optional email/phone).
- Two-player rooms with per-player dice roll for first turn.
- Turn-based guessing with correct-position count.
- Match history stored in SQLite.

## Local Development
1) Install deps:
```bash
npm install
```

2) Start server:
```bash
npm start
```

Open `http://localhost:3000`.

## Deployment (Linux)
- Set `JWT_SECRET` in the environment.
- Start with PM2:
```bash
pm2 start server.js --name numbergame
pm2 save
```
