# YouTube upload script

Upload a video to YouTube using OAuth credentials. The script reads credentials from **Skills config** (env `YOUTUBE_CLIENT_SECRET_JSON`, set via Dashboard → Skills → YouTube → Configure) or from `scripts/client_secret.json`, and saves `token.json` after the first browser OAuth flow.

## Prerequisites

- **Google Cloud project** with YouTube Data API v3 enabled.
- **OAuth 2.0 Client** (Desktop app): add the JSON via **Skills → YouTube → Configure** (paste full content), or save as `data/skills/youtube/scripts/client_secret.json`.
- **Python 3** with pip packages from `data/skills/youtube/requirements.txt`:
  ```bash
  pip install -r data/skills/youtube/requirements.txt
  ```
  Or: `google-api-python-client`, `google-auth-oauthlib`, `google-auth-httplib2`.

## One-time setup

1. In [Google Cloud Console](https://console.cloud.google.com/): create or select a project → APIs & Services → Enable **YouTube Data API v3**.
2. Create **OAuth 2.0 Client ID** (Application type: Desktop app). Download the JSON.
3. Add the JSON via **Skills → YouTube → Configure** (paste the full content), or save as `client_secret.json` in the skill’s **scripts** directory.
4. Run the script once with any test args; a browser will open to sign in. After authorizing, `token.json` is created in the same directory. Future runs use this token (refreshed automatically).

## Usage

From the skill directory (or use **exec** with `skill_id: "youtube"` so cwd is the skill dir):

```bash
python3 scripts/youtube_upload.py \
  --file /path/to/video.mp4 \
  --title "My video title" \
  --description "Optional description" \
  --tags "shorts,demo" \
  --privacy public
```

## Options

| Option         | Required | Description                                      |
|----------------|----------|--------------------------------------------------|
| `--file`       | Yes      | Path to video file (absolute or relative to script dir). |
| `--title`      | Yes      | Video title.                                     |
| `--description`| No       | Video description (default: empty).              |
| `--tags`       | No       | Comma-separated tags (e.g. `shorts,demo`).       |
| `--privacy`    | No       | `public`, `private`, or `unlisted` (default: public).    |

## Agent usage (exec tool)

Use the **exec** tool with `skill_id: "youtube"` so the command runs in the YouTube skill directory:

```json
{
  "skill_id": "youtube",
  "command": "python3 scripts/youtube_upload.py --file /path/to/video.mp4 --title \"My title\" --description \"Description\" --tags \"tag1,tag2\" --privacy public"
}
```

Ensure the video file path is accessible from the environment where the agent runs (e.g. workspace path or absolute path). Quotes inside the command string must be escaped as required by the shell.

## Troubleshooting

| Problem                    | Cause                          | Action                                      |
|----------------------------|---------------------------------|---------------------------------------------|
| client_secret.json not found / YOUTUBE_CLIENT_SECRET_JSON not set | Credentials missing | Add via Skills → YouTube → Configure or place `scripts/client_secret.json`. |
| Token expired / invalid    | First run or token revoked     | Delete `token.json` and run again to re-auth. |
| File not found             | Wrong path for `--file`        | Use absolute path or path relative to script dir. |
| Quota exceeded             | YouTube API quota              | Check quota in Cloud Console; wait or request increase. |
