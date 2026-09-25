# Sounding Things Out — prototype (full-vision sketch)

A mobile-first cooperative "DAW" for friends, partners, and family to make
music together in a web app. Layered recording at the core, a studio lobby
for mingling, and a toy box of instruments — including one for people who
swear they have no musical talent.

## Run it
Open `index.html` in a phone or desktop browser. For mic/camera features it
needs to be served over HTTPS (or `localhost`):
`python3 -m http.server 8000`

## What's inside
- **Studio Lobby** — who's hanging, spitball chat wall, session doors with
  green OPEN / red RECORDING signs, new-session flow with door policy
  (open / knock+vote / locked; creator breaks ties)
- **Studio** — transport with BPM, metronome, loop, big 1-2-3-4 count-in,
  multitrack list with waveforms, per-track auto-tune / echo / reverb /
  volume, snap-to-grid, master scope (waveform + spectrogram), demo export,
  project save
- **Play** — drum machine (pads + 16-step sequencer + render-to-track),
  touch piano (stay-in-key snapping), theremin pad, motion instruments:
  tilt-to-play and camera-motion ("move and it plays notes that fit")
- **Warm-up** — six vibe briefs (method-actor style), album-cover sketch pad
- **Learn** — 5 interactive lessons: live pitch meter, clap-along timing
  game, call & response, harmony stacking over a drone, FX playground
- **Me** — profile (name/bio/photo), demo list

## Going live (Firebase)
Paste a Firebase web config into `firebase-config.js` to light up anonymous
auth, live presence, shared chat, and shared session doors. Suggested rules
are noted at the top of that file.

## Honest flags
- Prototype: audio clips stay on the device; projects sync metadata only.
- Auto-tune is a prototype-grade modulated-delay effect; the pitch-meter
  teaching is the stronger harmonizing tool.
- Live "spitballing" is presence + chat, not sample-accurate live jamming.
- Not yet tested with a real phone mic/camera — needs a device pass.
