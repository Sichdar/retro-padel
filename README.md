# Padel Rush '94

An original padel game in the style of 1990s 16-bit arcade sports games, made for phones.
It runs in the phone's web browser: nothing to download from an app store.

## ▶️ Play

**https://sichdar.github.io/retro-padel/**

Hold the phone upright (portrait).

> 🚧 **Work in progress** (milestone 3 of 7). Tap **QUICK MATCH**: you and a computer partner (blue, near end)
> play two computer players (red) to 4 games. **BALL LAB** is the test court for the ball's bounces.

## How to play a quick match

- **Left thumb:** put it anywhere in the bottom-left corner: a joystick appears under it. Move to run.
- **Right thumb:** **HIT** for a drive or volley, **LOB** for a high ball over the opponents.
  Press just before the ball reaches you: a small **PERFECT!**, **EARLY** or **LATE** shows your timing.
  Hold the joystick left or right while hitting to aim; leave it alone and the ball goes cross-court.
  A high ball near the net becomes a **smash** by itself.
- **Serving:** tap **HIT** (joystick left/right aims). The serve bounces first and must land in the box diagonally opposite.
- If you leave the joystick alone, your player drifts towards the ball for you (assisted movement).
- **Rules:** the ball must bounce once on the other side before touching a wall; after that the glass and mesh are in play.
  Golden point at 40-40. Pause button at the top right (sound on/off is there too).

## What's planned

| # | Milestone | Status |
|---|---|---|
| 1 | Skeleton: title screen, menu, crisp pixels on every phone, published here | ✅ |
| 2 | Court and ball: walls, glass, mesh, net, ball shadow (try it in Ball Lab) | ✅ |
| 3 | Single player: controls, shots, rules, scoring, computer opponents, sound | ✅ |
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
In a match: **arrow keys** or **WASD** to run, **Space** or **Z** = HIT, **X** = LOB, **P** or **Esc** = pause.

Every push to `main` is tested, built and published to GitHub Pages automatically
(see `.github/workflows/deploy.yml`).

### Folder layout

| Folder | What's in it |
|---|---|
| `src/scenes` | The screens (boot, title, menu, Ball Lab, match) |
| `src/game` | Rules, physics, scoring, computer players: plain code with no engine parts, so it can be tested |
| `src/ui` | Drawing helpers: palette, pixel font, buttons, court art, screen scaling, all game texts (`strings.ts`) |
| `src/audio` | Sound effects made in code |
| `src/net` | Online multiplayer (from milestone 5) |
| `tests` | Automatic tests |

## Licence

Code: [MIT](LICENSE). Third-party parts and their licences: [CREDITS.md](CREDITS.md).
