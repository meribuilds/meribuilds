# Meri Curates Studio (reelcut)

A transcript-driven reel editor that runs entirely in the browser. Drop a vlog, get the words, untick the phrases you don't want, click words to cut them, add a hook, captions, effects, music and sound, preview it inside a phone with the Instagram UI, then render.

The live copy is the **Studio** area of Meri Curates (`/studio/` in the `works` repo), behind the same team sign-in as the dashboard. This folder is the source.

## Update the studio

Edit the files here, then rebuild the studio copy and push `works`:

```bash
python3 reelcut/build-studio.py /path/to/works/studio
```

The build adds the sign-in gate, the Meri Curates header and the link back to the dashboard. Clients who sign in see a "team only" message.

## The workflow

1. **Add video.** Drop an MP4 or MOV onto the phone.
2. **Get the transcript.** OpenAI Whisper with your API key (about $0.006 a minute, key stays in your browser), free in-browser Whisper, or upload an `.srt`, `.vtt` or Whisper `.json`.
3. **Cut.** Words tab: untick phrases, click words out, "Cut filler words", reorder, rotate, punch-in zoom, a transition into each clip (dissolve, fade to black, zoom, whip). Drag clip edges on the timeline to trim.
4. **Style.** Hook, word-by-word captions, colour grade, output size (9:16, 4:5, 1:1, 16:9), progress bar, end card.
5. **Effects.** All 25 effects from the FX menu (FX01 to FX25) plus the counter card. Move the playhead, pick an effect, edit its words, timing and sound. Cutout effects find you in the frame with an in-browser segmentation model.
6. **Audio.** Generate a music track (chill, upbeat, dreamy, lo-fi, any tempo, new variation on click) or use your own file. Music ducks under your voice and fades at the end. Sound effects (whoosh, pop, impact, riser, sparkle, shatter and more) play with each effect automatically or on their own.
7. **Render cut.** Records the finished reel in real time at full size. Chrome saves MP4. "Cover" saves the current frame as a PNG thumbnail.

Versions: "Save as version" snapshots the edit as ROUGH_V1, V2 and so on. The draft autosaves per video in this browser.

## Pro export

Workflow → `render.sh` gives an FFmpeg script and caption file for a full-quality H.264 MP4. It covers the cut, trims, zooms, grade, hook and captions. Effects, transitions, music, stickers and the end card come only from the in-browser render.

## Files

- `index.html` layout, `styles.css` Meri Curates theme, `app.js` the editor, `fx.js` the 25 effects, `whisper-worker.js` in-browser transcription, `gate.js` the studio sign-in, `build-studio.py` builds the studio copy.

## Keyboard

Space play or pause. Arrows move a second, Shift+arrows a tenth. S splits at the playhead. Ctrl+Z undo, Ctrl+Shift+Z redo.
