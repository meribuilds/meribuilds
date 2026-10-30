# reelcut.

A transcript-driven vlog cutter that runs entirely in your browser. Drop a video, get the words, untick the phrases you don't want, click words to cut them, add a hook and word-by-word captions, preview it inside a phone with the Instagram UI, then render.

Nothing is uploaded anywhere unless you choose the OpenAI transcription option.

## Run it

It is plain HTML, CSS and JavaScript. No install, no build.

- **Local:** open a terminal in this folder and run `python3 -m http.server 8080`, then open http://localhost:8080. (Opening `index.html` directly works for everything except in-browser transcription, which needs a web server for the worker.)
- **Vercel:** import this repo, set the root directory to `reelcut`, framework "Other". That's it.

Use Chrome or Edge on a laptop. Safari previews fine but saves WebM instead of MP4.

## The workflow

1. **Add video.** Drop an MP4 or MOV onto the phone, or use Workflow → Add video.
2. **Get the transcript.** Three options:
   - Paste an OpenAI API key and press Transcribe. Audio is shrunk to a 16 kHz WAV before upload, so a 10 minute vlog is about 20 MB. Costs roughly $0.006 per minute. The key is kept in this browser only.
   - Transcribe in browser. Free. Downloads a Whisper model once (40 to 250 MB depending on size) and runs it on your machine. Takes about as long as the video.
   - Upload an `.srt`, `.vtt` or Whisper `.json`. Word timings from `.json` make the cut precise; subtitle files spread words evenly inside each line.
3. **Cut.** The Words tab lists every phrase. Untick to drop a phrase, click a word to cut it out (great for "um" and "like"; "Cut filler words" does the obvious ones), arrows reorder, Rotate fixes clips shot upside down, ✂ splits a phrase. The timeline at the bottom shows the cut; faded blocks in the Source strip can be clicked to add a phrase back.
4. **Style.** Hook (bubbly, editorial or clean label), how long it shows, word-by-word caption template, size, case. Drag the hook and captions in the preview to move them.
5. **Render cut.** Plays the cut once in real time into a 1080×1920 video and saves it. Keep the tab in front while it records.

Versions: "Save as version" snapshots the cut as ROUGH_V1, V2, and so on. Your draft autosaves per video file in this browser, so you can close the tab and come back.

## Pro export

Workflow → Download `render.sh` gives you a script plus caption file for a full-quality H.264 MP4 using FFmpeg on your computer:

```bash
brew install ffmpeg   # once, on a Mac
bash render.sh        # run it next to your video file
```

Install the Fredoka and Nunito fonts from Google Fonts first if you want the exact look of the preview.

## How it is built

- `index.html` layout. `styles.css` theme tokens (light and dark). `app.js` everything else.
- The cut is a list of source time ranges. Each kept phrase becomes one or more ranges: cut words split a phrase into pieces and "Tight pauses" trims gaps longer than 0.6 s (0.35 s for tighter).
- Preview plays those ranges by seeking a single `<video>` element. Captions and the hook are DOM overlays synced to the current time.
- Render draws the same thing to a canvas and records it with `MediaRecorder`; audio comes through a Web Audio graph so what you hear is what you get.
- In-browser transcription uses transformers.js (Whisper) inside a Web Worker.

## Keyboard

Space play or pause. Left and right arrows nudge a second. Ctrl+Z undo, Ctrl+Shift+Z redo.
