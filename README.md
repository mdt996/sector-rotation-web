# Sector Rotation: screens and logic

The web part of the Sector Rotation Android app. The app downloads it from here to update itself without a reinstall.

It holds no keys, no holdings and no prices: those stay on the phone. `manifest.json` lists every file with its SHA-256; the app uses a new build only if every file matches, and the downloaded code cannot reach the network on its own.

The iPhone version runs these same screens in Safari: `relay/worker.js` is its Cloudflare Worker, which serves them and relays the few requests a web page can't make itself (eToro, Yahoo Finance, Revolut X). It keeps nothing.
