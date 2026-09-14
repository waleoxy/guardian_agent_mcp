# Guardian — Fire TV Setup

Guardian's Fire TV app is the household command center: real-time
incident display, member status, and quick actions — all controlled
with the Fire TV remote's D-pad.

## What this is

`fire-tv/index.html` is a leanback web app built for 1920×1080,
D-pad navigation, and Fire TV's Silk browser engine. It connects to
the same Guardian MCP server that Alexa+ uses — same data, same
decisions, different surface.

## How to run it on Fire TV (Amazon Web App Tester)

Amazon's Web App Tester (WAT) is the official path for web apps on
Fire TV. It sideloads a web app as a native Fire TV app.

### 1. Install Web App Tester on your Fire TV

On your Fire TV:
- Settings → My Fire TV → Developer Options → ADB Debugging: ON
- Settings → My Fire TV → Developer Options → Apps from Unknown Sources: ON
- Search the Amazon Appstore for "Web App Tester" and install it

### 2. Deploy the Guardian server

The Fire TV app connects to the Guardian server at runtime. Either:

**Local network (demo):**
```bash
npm run build && npm start
# Server runs at http://<your-machine-ip>:3000
```
Make sure your Fire TV and your machine are on the same WiFi network.

**Deployed (production):**
```bash
sam build && sam deploy --guided
# Use the McpEndpoint output URL
```

### 3. Update the server URL in the manifest

Edit `fire-tv/manifest.json` and set `start_url` to your server:
```json
"start_url": "http://<your-machine-ip>:3000/fire-tv/index.html"
```

For a deployed server:
```json
"start_url": "https://<your-api-gateway-url>/fire-tv/index.html"
```

### 4. Serve the fire-tv/ directory

The Guardian Express server already serves `public/` statically.
Add `fire-tv/` the same way — or just copy `index.html` into `public/`
and access it at `/fire-tv.html`.

Alternatively, serve it separately:
```bash
npx serve fire-tv -p 3001
```

### 5. Load in Web App Tester

Open Web App Tester on your Fire TV and enter the URL:
```
http://<your-machine-ip>:3000/fire-tv/index.html
```

WAT loads the app fullscreen. Use the D-pad remote to navigate.

## D-pad controls

| Key | Action |
|-----|--------|
| ▲ ▼ ◀ ▶ | Move focus between buttons |
| OK / Select | Activate focused button |
| Back | Return focus to monitoring toggle |

## Serving fire-tv/ from the Guardian Express server

Add this one line to `src/app.ts` (after the existing `express.static`):

```typescript
app.use('/fire-tv', express.static(path.join(__dirname, '..', 'fire-tv')));
```

Then the app is available at `http://localhost:3000/fire-tv/` — the
same origin as the MCP server, so all `/mcp` and `/api/*` calls work
without CORS configuration.

## Files

```
fire-tv/
  index.html      TV-optimized UI (1920x1080, D-pad nav, leanback layout)
  manifest.json   WAT app manifest (name, icons, Fire OS platform config)
  icons/
    icon-512.png  App icon (512x512, same brand as addon-package/media/)
```
