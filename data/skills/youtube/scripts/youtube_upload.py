#!/usr/bin/env python3
"""Upload a video to YouTube using OAuth credentials in the skill directory.

Usage:
  python3 youtube_upload.py --file VIDEO.mp4 --title "Title" --description "Description" [--tags "a,b,c"] [--privacy public|private|unlisted]

First run: place client_secret.json (from Google Cloud Console) in this script's directory.
Browser OAuth will run once; token.json is saved for reuse.

Requires: pip install google-api-python-client google-auth-oauthlib google-auth-httplib2
"""

import argparse
import os
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
TOKEN_FILE = SCRIPT_DIR / "token.json"
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

REQUIREMENTS_MSG = (
    "YouTube skill requires Google API packages. Install them with:\n"
    f"  pip install -r \"{SKILL_DIR / 'requirements.txt'}\"\n"
    "Or: pip install google-api-python-client google-auth-oauthlib google-auth-httplib2"
)


def _client_secret_path() -> Path:
    """Path to client secrets: from env YOUTUBE_CLIENT_SECRET_JSON (Skills UI) or scripts/client_secret.json."""
    raw = os.environ.get("YOUTUBE_CLIENT_SECRET_JSON", "").strip()
    if raw:
        try:
            f = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
            f.write(raw)
            f.close()
            return Path(f.name)
        except Exception:
            pass
    return SCRIPT_DIR / "client_secret.json"


def get_authenticated_service():
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ModuleNotFoundError:
        print("ERROR: Missing required Google API packages.", file=sys.stderr)
        print(REQUIREMENTS_MSG, file=sys.stderr)
        sys.exit(1)

    client_secret_file = _client_secret_path()
    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not client_secret_file.exists():
                print("ERROR: client_secret.json not found and YOUTUBE_CLIENT_SECRET_JSON not set.", file=sys.stderr)
                print("Add via Skills → YouTube → Configure (paste OAuth client JSON) or place scripts/client_secret.json.", file=sys.stderr)
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(str(client_secret_file), SCOPES)
            creds = flow.run_local_server(port=8090, open_browser=True)
            if client_secret_file != SCRIPT_DIR / "client_secret.json":
                try:
                    client_secret_file.unlink()
                except Exception:
                    pass
        TOKEN_FILE.write_text(creds.to_json())
    return build("youtube", "v3", credentials=creds)


def upload(youtube, file_path: str, title: str, description: str, tags: list[str], privacy: str, category_id: str = "22"):
    from googleapiclient.http import MediaFileUpload

    body = {
        "snippet": {
            "title": title,
            "description": description,
            "tags": tags,
            "categoryId": category_id,
        },
        "status": {"privacyStatus": privacy},
    }
    media = MediaFileUpload(file_path, chunksize=1024 * 1024, resumable=True)
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"  Progress: {int(status.progress() * 100)}%")
    video_id = response["id"]
    print(f"Uploaded: https://youtube.com/watch?v={video_id}")
    return video_id


def main():
    ap = argparse.ArgumentParser(description="Upload a video to YouTube.")
    ap.add_argument("--file", required=True, help="Path to video file (e.g. video.mp4)")
    ap.add_argument("--title", required=True, help="Video title")
    ap.add_argument("--description", default="", help="Video description")
    ap.add_argument("--tags", default="", help="Comma-separated tags (e.g. shorts,demo)")
    ap.add_argument("--privacy", default="public", choices=("public", "private", "unlisted"), help="Privacy status")
    args = ap.parse_args()

    file_path = Path(args.file)
    if not file_path.is_absolute():
        file_path = SCRIPT_DIR / file_path
    if not file_path.exists():
        print(f"ERROR: File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    tags_list = [t.strip() for t in args.tags.split(",") if t.strip()]
    youtube = get_authenticated_service()
    upload(youtube, str(file_path), args.title, args.description, tags_list, args.privacy)


if __name__ == "__main__":
    main()
