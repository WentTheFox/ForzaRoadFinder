# Forza Road Finder

A lightweight browser tool for locating undiscovered roads in **Forza Horizon 6**.

Undiscovered roads render in a distinct grey (`#808080`). This page captures your screen via the browser's Screen Share API and replaces that colour with bright magenta (`#FF00FF`) in real time, making unvisited roads immediately visible on the in-game map.

## Usage

1. Open `index.html` directly in your browser (no server required).
2. Click **Share Screen** and select your Forza Horizon 6 window.
3. Grey undiscovered roads will be highlighted in magenta on the canvas.

## Controls

| Control | Description |
|---------|-------------|
| **Share Screen** | Requests screen-capture permission and starts processing |
| **Pause / Resume** | Freezes the frame loop without stopping the stream |
| **Stop** | Ends the capture and releases the stream |
| **FPS** (0.1 – 5) | Frame rate of the processing loop (default 1 FPS) |
| **Tolerance** (0 – 40) | Per-channel colour tolerance to account for capture compression (default 5) |

## Performance notes

- The canvas context is created with `willReadFrequently: true` to keep pixel data in CPU memory and avoid GPU readback on every frame.
- At tolerance = 0 a fast `Uint32Array` path is used (one comparison per pixel).
- At tolerance > 0 each channel is compared individually with `Math.abs`.
- Frames are scheduled with `setTimeout` rather than `requestAnimationFrame` so the low FPS limit is respected precisely.

## Browser support

Any modern Chromium-based browser (Chrome, Edge) or Firefox that supports the [Screen Capture API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture).
