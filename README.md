# Sector Rotation: screens and logic

The web part of the Sector Rotation Android app. The app downloads it from here to update itself without a reinstall.

It holds no keys, no holdings and no prices: those stay on the phone. `manifest.json` lists every file with its SHA-256 and is signed (`manifest.sig`, ECDSA P-256); the app refuses a bundle whose signature does not match the key built into it.
