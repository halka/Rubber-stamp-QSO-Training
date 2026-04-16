# CW QSO Trainer

A mobile-first web app for practising **rubber stamp CW (Morse code) QSOs** on any device — phone, tablet, or desktop. No installation, no account, works offline.

Compatible with [vband](https://hamradio.solutions/vband/) — the same key mappings and QSO format used on vband so skills transfer directly.

---

## Features

- **Touch / click CW key** — iambic paddle or straight key, works with finger tap on any touchscreen
- **Sidetone** — real audio feedback via Web Audio API while you key
- **Real-time Morse decoder** — shows decoded text as you send
- **Rubber stamp QSO guide** — 5-step contact sequence with colour-coded character matching
- **Listen mode** — computer plays the full QSO at your chosen speed so you can follow along
- **Practice mode** — free-form keying with live decode
- **vband Assist mode** — visual keyboard guide for use alongside vband
- **Farnsworth timing** — set character speed and overall WPM independently for beginner-friendly spacing
- **Settings** — callsigns, name, QTH, WPM, sidetone frequency, key mode; all saved locally
- **PWA** — installable on Android / iOS via "Add to Home Screen"

---

## Key Mappings (keyboard)

| Key | Action |
|-----|--------|
| `[` | Dit (paddle) |
| `]` | Dah (paddle) |
| `Space` | Straight key |

These match **vband's** paddle key bindings exactly.

---

## Rubber Stamp QSO Sequence

The QSO Guide steps you through a complete contact:

| Step | Who sends | Content |
|------|-----------|---------|
| 1 | You | `CQ CQ CQ DE {mycall} K` |
| 2 | You | `{theircall} DE {mycall} {mycall} K` |
| 3 | Partner (computer) | `{mycall} DE {theircall} GM OM UR RST 599 QTH … NAME … HW? BK` |
| 4 | You | `R {theircall} DE {mycall} GM TNX FER CALL UR 599 QTH … NAME … 73 SK` |
| 5 | Partner (computer) | `{mycall} DE {theircall} TNX 73 SK` |

Fill in your callsign, name, and QTH in Settings (⚙) to personalise the script.

---

## Deploy on Cloudflare Pages (from the dashboard)

1. Fork or push this repository to your GitHub account.
2. Log in to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select your repository and set:

   | Setting | Value |
   |---------|-------|
   | Framework preset | **None** |
   | Build command | *(leave empty)* |
   | Build output directory | `/` |

4. Click **Save and Deploy**. Every push to `main` deploys automatically.

The `_headers` file in the repository is picked up automatically by Cloudflare Pages and sets cache-control and security headers.

### Optional: local development with Wrangler CLI

```sh
npm install
npm run dev        # serves at http://localhost:8788
npm run deploy     # manual deploy via CLI
```

---

## Local development without Cloudflare

ES modules require a local server (`file://` is blocked by browsers):

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

---

## Project structure

```
index.html          App shell and UI markup
style.css           Mobile-first dark theme (portrait + landscape)
manifest.json       PWA manifest
_headers            Cloudflare Pages response headers
js/
  audio.js          Web Audio engine — sidetone + scheduled CW playback
  keyer.js          Iambic Mode B paddle + straight key state machine
  decoder.js        Real-time Morse decoder with Farnsworth timing
  trainer.js        QSO script data and step-advance logic
  app.js            Orchestrator — settings, UI binding, mode switching
```

No build step, no framework, no dependencies at runtime.

---

## vband compatibility

[vband](https://hamradio.solutions/vband/) is a browser-based virtual radio band for CW practice with other operators. This trainer uses the **same key mappings** (`[` / `]`), the **same QSO format**, and the **same Morse timing standards** so skills transfer directly. Use **vband Assist** mode to see the next phrase to send while you practice on vband in another tab.

---

## License

MIT © 2026 halka
