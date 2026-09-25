# AiLabor Art Studio

**AI Labor Automation**: a desktop studio that takes an idea all the way to finished artwork using AI.
You describe a theme, and the app writes the prompts, generates images, checks their quality with a
vision model, writes titles and descriptions, and puts everything in a review gallery where a human
makes the final call.

Built with **Electron** and plain JavaScript (no framework, no build step): about 30 renderer modules and
12 main-process modules.

> This is the **showcase build**. It ships with no credentials, no user data, no generated images and
> no installed libraries. It also runs in **all-ages safe mode**: every prompt that reaches an image or
> video generator is checked, and anything unsuitable is refused (`src/renderer/safemode.js`).

---

## What it does

| Tab | Purpose |
|---|---|
| **Dashboard** | Live status of every AI engine (configured / observed / reachable), the work-in-progress pipeline, and **Auto mode**, which ideates, generates and quality-checks unattended. |
| **Overseer** | A chat assistant that runs the app with tools: write prompts, queue art, reorder the queue, research reference images on the web, edit a picture, turn a picture into a video. |
| **Prompt Lab** | Writes prompts from an example prompt (variations / similar / remix / evolve), from **reference images** (a vision model reads them), or **from a short story**. |
| **Review** | The human gate. Each card shows the image, the AI quality verdict and editable title/description/tags. *Pick keepers* compares all renders of one prompt side by side. |
| **Comics** | Builds comic pages: character model sheet → panel script → panel images → lettered page with speech bubbles. |
| **Continuations** | Writes a "part 2" prompt that keeps the same character, setting and style. |
| **Statistics** | Reads gallery performance and learns which themes and styles people like best. |
| **Settings** | Engines, generation, publishing, learning, themes (9 colour themes). |

### The pipeline, per job

1. **Ideate.** An LLM writes image prompts for a theme, pushed toward variety (lighting, camera, place,
   palette and mood axes are forced to change every round).
2. **Generate.** Either the free Perchance web generator (driven inside an embedded browser) or a local
   **ComfyUI** server. The workflow file *is* the config, so any ComfyUI graph can be plugged in.
3. **Quality check.** A vision model lists defects first (hands, anatomy, artifacts) and then scores the
   image. Three independent checks can only *lower* the score, so a generous model can't wave a broken
   image through.
4. **Metadata.** Titles, descriptions and tags written in the artist's own measured house style.
5. **Review and publish.** A human approves every piece; nothing is posted automatically.

**Video.** Approved images can be turned into short clips with sound (image-to-video through ComfyUI),
then checked automatically: frames, audio and a Whisper transcript are compared against the request.

---

## Install (Windows)

1. Download or clone this repository.
2. Double-click **`install.bat`**. It installs Node.js LTS through `winget` if it is missing, then runs
   `npm install` (downloads Electron, about 100 MB).
3. Double-click **`start.bat`**.

macOS / Linux: `./install.sh`, then `npm start`.

### Connect an AI engine (required for prompt writing and QC)

The app needs an OpenAI-compatible LLM endpoint. The easiest free option is **[LM Studio](https://lmstudio.ai)**:

1. Install LM Studio, download a small vision-capable model (e.g. *Gemma 3 4B*), and start the local server
   (default `http://localhost:1234/v1`).
2. In the app: **Settings → Engines**. Point *LM Studio* at that address, press **Test**.

Hosted APIs (OpenAI, OpenRouter, DeepSeek, …) can be added in the same panel with your own API key.
Keys are stored locally in your user profile, never in this folder.

### Image generation

- **Perchance** (default, free): works out of the box in the Perchance tab.
- **ComfyUI** (optional, local GPU): run ComfyUI on `http://127.0.0.1:8188`, put a workflow `.json` into the
  workflows folder and select it in **Settings → Generation**.

---

## Architecture

```
src/main/          Electron main process
  main.js          window, IPC, ala:// media protocol (byte ranges), ComfyUI bridge
  store.js         JSON settings/library persistence + defaults + migrations
  llm.js           provider chains per role (vision / ideation / metadata / overseer) with fallbacks
  research.js      web research for reference images (SSRF-safe fetch, size/MIME caps)
  videocheck.js    ffprobe + frame grabs + audio level + Whisper transcript for video self-check
src/renderer/      UI + orchestration (modules on window, no build step)
  app.js           tabs, review, drafts, stats, settings
  pipeline.js      job worker: generate → QC → metadata
  comfy.js         ComfyUI driver (reads any workflow graph, finds prompt/seed/save nodes)
  perchance.js     Perchance driver (drives the page inside a webview)
  overseer.js      tool-using chat agent
  promptlab.js     prompt writing modes     comics.js   comic pages     insights.js  learning loop
  safemode.js      all-ages prompt guard
tools/
  safemode_test.mjs   node tools/safemode_test.mjs
```

User data lives in the OS profile folder (`%APPDATA%\AiLabor Art Studio\` on Windows), not in the repo.

---

Made by **PanPenek**. Uses Electron (MIT). ComfyUI, Perchance, LM Studio and the AI models are separate
projects with their own licences.
