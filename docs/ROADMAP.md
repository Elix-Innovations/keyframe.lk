# Roadmap

Keyframe.lk is a local-first video editor with Sinhala captions at its core. Nothing is uploaded unless you configure an API key.

## Shipped
- Auto-captions (Sinhala, English, code-mixed), Unicode and legacy FM fonts
- Styling, animation, templates, burned-in MP4 export in the browser
- Media bin: main video, music tracks, b-roll images, drag-and-drop import
- Concat-style layout: library tabs, preview, inspector tabs, track-header timeline
- 100 looks: 44 filters, 20 transitions, 36 effects (motion, glitch, light, texture, frame); keyframes with easing
- Timeline row switches: hide, lock, mute
- Timeline clips: video and audio on separate linked layers (unlink, relink), split, trim, move with snapping, duplicate, ripple delete, per-clip speed 0.1–8× with pitch kept, freeze frame, per-clip volume and fades
- Multi-layer timeline: several video tracks (overlays on top of the main track), several filter and effect tracks that apply to everything below, drag clips between tracks, drag filters, effects and transitions from the panels onto the timeline, drop files onto a track
- Overlays: unlimited text, sticker (emoji) and image overlays on their own timeline tracks; 17 trending text looks, 10 labels (NEW, FOLLOW, PART 2...), in/out/loop animations, blend modes, drag in the preview to move
- Trending looks: Trending section in Filters, Effects and Transitions (Y2K, VHS, CCD, whip pans, zoom blur, RGB shift, film burn, beat zoom, camcorder, sparkle, confetti...)
- Several videos at once: pick or drop many files when creating a project; they are laid end to end
- Contextual inspector: the right pane's tabs follow the selection (video clip, audio clip, filter/effect clip, caption, nothing)
- Timeline export: frame-by-frame renderer for edited timelines; fast single-pass path for untouched videos
- Noise removal in the browser: AI voice isolation with RNNoise (jitsi/rnnoise-wasm, handles changing noise) and spectral subtraction for steady noise
- Sounds tab: 18 built-in synthesized effects plus a free search of Creative Commons sound effects (Freesound via Openverse, commercial-use licences only, no key); add at the playhead as short tracks that are never ducked
- Inspector tabs for overlays and video clips (Text / Layout / Motion / Timing, Clip / Crop / Transform / Keyframes)

## CapCut gap list
Still missing: reverse, speed ramps (curves), volume keyframes, clip thumbnails, voice changer, chroma key, masks, picture-in-picture, text-to-speech, background removal, auto-reframe, stabilization, AI-based noise removal (RNNoise) for non-steady noise.

## Next (browser)
- Track headers with lock, hide, mute; snapping
- Keyframes for caption layers and audio volume; curve editor
- More transitions between clips

## Next (local Rust engine, optional sidecar)
Work the browser cannot do well. Run as `server/` neighbour, never required for basic editing.
- Background removal (ONNX Runtime)
- Local Whisper transcription (whisper.cpp)
- Local text-to-speech
- Hardware-accelerated export via FFmpeg for 4K and HEVC / AV1
