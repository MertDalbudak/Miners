# Miners

A 3D mining game built with [PlayCanvas](https://playcanvas.com). Dig down through five layers of the
earth, memorize the dark, collect ores to keep your energy up and outsmart cave monsters.

Originally a 2D canvas game (2015). The original version is kept untouched in [`legacy/`](legacy/).

## Run it

Requires Node.js 20.19+ or 22.12+ (for Vite 8).

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # game-rule tests (no browser needed)
npm run build    # production build in dist/
npm run preview  # serve the production build locally
```

## Deploy / install

`dist/` is a static site. Upload it to any static host (GitHub Pages, Netlify, Cloudflare Pages, your own
server). Serve it over **HTTPS** so the service worker can register. After the first visit the game
works offline and can be installed as an app:

- **Desktop (Chrome/Edge):** install icon in the address bar
- **Android:** browser menu → *Install app* / *Add to Home screen*
- **iPhone/iPad (Safari):** Share → *Add to Home Screen*

## Ads (Google AdSense)

Miners uses Google's ad API for HTML5 games (the [Ad Placement API](https://developers.google.com/ad-placement), also called H5 Games Ads):

- **Interstitials** only at natural breaks: when starting a new run, never before the first run of a
  session and never during play. Google decides whether one is due (at most about every 2 minutes).
- **Rewarded ad** on the results screen: players can choose to watch an ad to double the coins of the run.

Setup:

1. Copy `.env.example` to `.env.production` and set `VITE_ADSENSE_CLIENT` to your publisher ID
   (`ca-pub-…`), then `npm run build`. Without an ID nothing is loaded from Google.
2. The build writes `dist/ads.txt`. It must be reachable at the root of your domain (`https://example.com/ads.txt`).
3. In AdSense: add and verify your site, make sure games ads (H5 Games Ads) are enabled for your account,
   keep **Auto ads off** for this site (they would cover the game), and turn on the consent message under
   **Privacy & messaging** for visitors from the EEA, UK and Switzerland.

`npm run dev` always shows Google's test ads. `VITE_ADS=test` does the same in a production build (useful
for a staging deploy), and `VITE_ADS=off` turns ads off completely.

## How it plays

- Dig **left, right and down**, never up. Digging dirt costs 1 energy; ores give energy back.
- Underground only the blocks around your headlamp are visible. The torch near the bottom of each
  section lights up the next one for a moment, so memorize the way.
- TNT explodes, stone needs a pickaxe, loose boulders fall when undermined, monsters wake up below
  30 m and hunt you through open tunnels. A hard hat absorbs one deadly hit.
- Ores, chests and depth earn coins for permanent upgrades. There is a seeded **Daily Dig**,
  achievements, a local scoreboard and stats.

**Controls:** arrow keys / WASD, `F` or `Space` for a flare, `Esc` pause, `M` mute · swipe, on-screen
buttons or tap a neighbouring block on touch screens · D-pad / stick, `X`/`Y` flare, `Start` pause on
gamepads.

## Project layout

```
src/
  game/      rules only, no rendering: grid, level generator, monsters, scoring, profile, upgrades
  render/    PlayCanvas: instanced blocks, walls, surface camp, miner, monsters, particles, camera
  audio/     original sound files + synthesized effects + generative music
  ui/        DOM menus, HUD, input (keyboard, touch, gamepad)
  app.js     ties everything together
tests/       node:test suites for the game rules
tools/       icon.html renders the app icon from the 3D miner (open via `npm run dev`)
public/      sounds, icons, web app manifest
```

Everything visual (textures, models, the miner) is generated in code. There are no image assets
apart from the app icons, which are renders of the in-game miner.

To regenerate the icons after changing the character, run `npm run dev`, open
`http://localhost:5173/tools/icon.html?variant=any` (and `?variant=maskable`), screenshot the 1024×1024
square and scale it to the sizes in `public/icons/`.
