# Padel Rush '94

An original padel game in the style of 1990s 16-bit arcade sports games, made for phones.
It runs in the phone's web browser: nothing to download from an app store.

## ▶️ Play

**https://sichdar.github.io/retro-padel/**

Hold the phone upright (portrait).

> 🚧 **Work in progress.** Right now (milestone 2 of 7) you get the title screen, the menu and the **Ball Lab**:
> a test court where you fire the ball at the floor, glass, mesh and net and watch how it bounces.
> The matches arrive in the next milestones.

## What's planned

| # | Milestone | Status |
|---|---|---|
| 1 | Skeleton: title screen, menu, crisp pixels on every phone, published here | ✅ |
| 2 | Court and ball: walls, glass, mesh, net, ball shadow (try it in Ball Lab) | ✅ |
| 3 | Single player: controls, shots, rules, scoring, computer opponents, sound | ⏳ |
| 4 | Polish: 3 difficulty levels, smash and bandeja, music, settings, how to play, 2 players on one phone | ⏳ |
| 5 | Online 1 vs 1 between two phones | ⏳ |
| 6 | Online 2 vs 2 with 4 phones | ⏳ |
| 7 | Install on the home screen, play offline | ⏳ |

## Install it on your home screen

This works fully from milestone 7; until then it just makes a shortcut.

- **iPhone (Safari):** open the link, tap **Share** → **Add to Home Screen**.
- **Android (Chrome):** open the link, tap the **⋮ menu** → **Install app** (or **Add to Home screen**).

## Why multiplayer uses Wi-Fi/internet, not Bluetooth

A game that runs in a web browser can't link phones over Bluetooth: iPhones don't support
Web Bluetooth at all, and a web page can't make a phone act as a Bluetooth "host".
The game uses **WebRTC** instead. When the phones are on the **same Wi-Fi, the game data goes
directly between them** over the local network (low lag); when they're apart, it goes over the internet.
A free public service (PeerJS) is only used to introduce the phones to each other.
Bluetooth would only be possible later by wrapping the game in a real app, which is not planned for now.

## For developers: run it on a PC

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev     # opens a local test server; the address is printed in the window
npm test        # runs the rules and maths tests
npm run build   # makes the final files in dist/
```

Keyboard on a PC: **Enter** or **Space** to start, **arrow keys** and **Enter** in the menu, **Esc** to go back.

Every push to `main` is tested, built and published to GitHub Pages automatically
(see `.github/workflows/deploy.yml`).

### Folder layout

| Folder | What's in it |
|---|---|
| `src/scenes` | The screens (boot, title, menu, later the match) |
| `src/game` | Rules, physics, scoring, computer players: plain code with no engine parts, so it can be tested |
| `src/ui` | Drawing helpers: palette, pixel font, buttons, court art, screen scaling, all game texts (`strings.ts`) |
| `src/audio` | Sound effects made in code |
| `src/net` | Online multiplayer (from milestone 5) |
| `tests` | Automatic tests |

## Licence

Code: [MIT](LICENSE). Third-party parts and their licences: [CREDITS.md](CREDITS.md).
