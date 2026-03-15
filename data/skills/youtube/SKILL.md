---
name: youtube
description: Upload videos (or Shorts) to YouTube using a local OAuth setup. Uses a script in the skill directory; run it via the exec tool. Use when the user wants to upload a video, publish to YouTube, or upload Shorts.
credentials:
  - YOUTUBE_CLIENT_SECRET_JSON
---


# YouTube upload

Upload videos to **YouTube** using a **script** in this skill. Credentials are stored in the skill directory (`client_secret.json` + `token.json`). Use the **exec** tool to run the script; no static upload code in the loader.

## Overview

1. **One-time setup**: Enable YouTube Data API v3, create an OAuth Desktop client, add the client JSON via Skills → Configure (or place `client_secret.json` in the skill). Install Node dependencies with **npm install** (see below). Run the upload script once to complete browser OAuth; `token.json` is saved for reuse.
2. **Upload**: Use **exec** with `skill_id: "youtube"` and a `command` that runs **node scripts/youtube_upload.js** (recommended) or the Python script, with `--file`, `--title`, and optional `--description`, `--tags`, `--privacy`.

## Setup

Follow these steps so the skill can upload to your YouTube account. The **Skills → YouTube → Configure** dialog (Setup button) shows this section and a field for the client JSON.

1. **Google Cloud project**  
   Go to [Google Cloud Console](https://console.cloud.google.com/). Create or select a project.

2. **Enable YouTube Data API v3**  
   APIs & Services → Library → search “YouTube Data API v3” → Enable.

3. **Create OAuth 2.0 credentials**  
   APIs & Services → Credentials → Create Credentials → **OAuth client ID**.  
   - If asked, configure the OAuth consent screen (e.g. External, add your email).  
   - Application type: **Web application** (so you can set a redirect URI).  
   - Name: e.g. “YouTube upload”.  
   - Under **Authorized redirect URIs**, click Add URI and add exactly:  
     **`http://localhost:8090/`**  
     (If this is missing, you will get “Error 400: redirect_uri_mismatch” when signing in.)  
   - Create. Copy or download the client JSON.

4. **Add the client JSON to this skill**  
   Paste the **full JSON** (the whole file content) into the **OAuth client JSON** field below (Skills → YouTube → Configure), then Save.  
   Alternatively, save the file as `scripts/client_secret.json` in the YouTube skill directory.

5. **Install Node dependencies**  
   From the skill directory run: `npm install`. The agent can do this via exec with `skill_id: "youtube"`, `command: "npm install"`.

6. **First sign-in**  
   Run the upload script once (e.g. with a test video). A browser opens; sign in with your Google account and allow access. After that, `token.json` is saved and future uploads do not require signing in again.

Details: [references/youtube-upload.md](references/youtube-upload.md).

## Install dependencies (agent must do this when needed)

**Preferred (Node):** If the Node script fails with "Missing npm dependencies", or before first upload, install with **exec** and `skill_id: "youtube"`, `command: "npm install"`. Then retry. No system Python or pip needed.

**Optional (Python):** If using the Python script and it reports missing Google API packages, use a virtual environment; the agent cannot install into system Python on externally-managed systems (e.g. macOS).

## Upload video (exec tool)

Use **exec** with `skill_id: "youtube"` (command runs in the skill directory).

**Recommended — Node script (no Python/pip):**  
`node scripts/youtube_upload.js --file <path> --title "<title>" [--description "<desc>"] [--tags "tag1,tag2"] [--privacy public|private|unlisted]`

Example:

```json
{
  "skill_id": "youtube",
  "command": "node scripts/youtube_upload.js --file /path/to/video.mp4 --title \"My video\" --description \"Optional\" --tags \"shorts,demo\" --privacy public"
}
```

**Optional — Python script** (requires venv + pip): `python3 scripts/youtube_upload.py --file ... --title ...`

- **--file**: Path to the video file (absolute or relative to skill dir). Must be reachable where the agent runs.
- **--title**: Required. **--description**, **--tags**, **--privacy** optional (default: `public`).

**Interpreting exec result:** After running the upload script, check **stdout**. If it contains a line like `Uploaded: https://youtube.com/watch?v=...`, the upload **succeeded**. Tell the user the video was uploaded and give them that URL. Do not say authorization is required when stdout shows a success URL. If exitCode is non-zero but stdout contains the upload URL, still report success (the script may have been interrupted after writing the URL). Only when stdout has no upload URL and stderr says "Open this URL in your browser" should you ask the user to authorize.

Full script options: [references/youtube-upload.md](references/youtube-upload.md).

## Skill layout

- **scripts/youtube_upload.js** — Node upload script (recommended): `--file`, `--title`, `--description`, `--tags`, `--privacy`. No Python/pip required.
- **scripts/youtube_upload.py** — Python upload script (optional; requires venv + pip install).
- **package.json** — Node dependencies (googleapis). Run `npm install` in the skill dir.
- **config.schema.json** — defines `YOUTUBE_CLIENT_SECRET_JSON` for the Skills config UI.
- **scripts/client_secret.json** — (optional) OAuth client JSON if not set via Skills → Configure.
- **scripts/token.json** — (created on first run) stored credentials; shared by both scripts.
- **requirements.txt** — pip dependencies for the Python script only.
- **references/youtube-upload.md** — setup, usage, and exec examples.
- **SKILL.md** — this file.
