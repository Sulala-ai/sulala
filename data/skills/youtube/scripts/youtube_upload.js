#!/usr/bin/env node
/**
 * Upload a video to YouTube. Uses OAuth credentials from YOUTUBE_CLIENT_SECRET_JSON
 * (Skills config) or scripts/client_secret.json. Saves token.json in scripts/ for reuse.
 *
 * Usage: node scripts/youtube_upload.js --file VIDEO.mp4 --title "Title" [--description "..." ] [--tags "a,b"] [--privacy public|private|unlisted]
 *
 * Dependencies: npm install (in the skill directory). Agent can run: exec with skill_id "youtube", command "npm install".
 */

const fs = require("fs");
const path = require("path");
const http = require("http");

const SCRIPT_DIR = path.resolve(path.dirname(__filename));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const TOKEN_PATH = path.join(SCRIPT_DIR, "token.json");
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];
const REDIRECT_URI = "http://localhost:8090/";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { file: null, title: null, description: "", tags: "", privacy: "public" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) out.file = args[++i];
    else if (args[i] === "--title" && args[i + 1]) out.title = args[++i];
    else if (args[i] === "--description" && args[i + 1]) out.description = args[++i];
    else if (args[i] === "--tags" && args[i + 1]) out.tags = args[++i];
    else if (args[i] === "--privacy" && args[i + 1]) out.privacy = args[++i];
  }
  return out;
}

function getClientSecret() {
  const fromEnv = process.env.YOUTUBE_CLIENT_SECRET_JSON;
  if (fromEnv && fromEnv.trim()) {
    try {
      return JSON.parse(fromEnv.trim());
    } catch (e) {
      console.error("ERROR: YOUTUBE_CLIENT_SECRET_JSON is not valid JSON.", e.message);
      process.exit(1);
    }
  }
  const p = path.join(SCRIPT_DIR, "client_secret.json");
  if (!fs.existsSync(p)) {
    console.error("ERROR: client_secret.json not found and YOUTUBE_CLIENT_SECRET_JSON not set.");
    console.error("Add via Skills → YouTube → Configure or place scripts/client_secret.json.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function getOAuth2Client(credentials) {
  const { google } = require("googleapis");
  const client = credentials.installed || credentials.web;
  if (!client) {
    console.error("ERROR: client_secret JSON must have 'installed' or 'web' with client_id and client_secret.");
    process.exit(1);
  }
  return new google.auth.OAuth2(client.client_id, client.client_secret, REDIRECT_URI);
}

function loadSavedToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveToken(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

function authorize(oauth2Client) {
  return new Promise((resolve, reject) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
    });
    const server = http
      .createServer(async (req, res) => {
        const url = new URL(req.url || "", `http://localhost`);
        const code = url.searchParams.get("code");
        res.writeHead(200, { "Content-Type": "text/plain" });
        if (code) {
          res.end("Authorized. You can close this tab.");
          server.close();
          try {
            const { tokens } = await oauth2Client.getToken(code);
            oauth2Client.setCredentials(tokens);
            saveToken(tokens);
            resolve(oauth2Client);
          } catch (e) {
            reject(e);
          }
        } else {
          res.end("Missing code. Try again.");
        }
      })
      .listen(8090, "localhost", () => {
        console.error("Open this URL in your browser to authorize:");
        console.error(authUrl);
        const op = require("child_process").spawn(
          process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open",
          [authUrl],
          { stdio: "ignore" }
        );
        op.on("error", () => {});
      });
    server.on("error", reject);
  });
}

async function getAuthenticatedClient() {
  let credentials;
  try {
    credentials = getClientSecret();
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
  const oauth2Client = getOAuth2Client(credentials);
  const token = loadSavedToken();
  if (token) {
    oauth2Client.setCredentials(token);
    oauth2Client.on("tokens", (tokens) => {
      const creds = oauth2Client.credentials;
      if (tokens.refresh_token) creds.refresh_token = tokens.refresh_token;
      saveToken(creds);
    });
    return oauth2Client;
  }
  return authorize(oauth2Client);
}

async function uploadVideo(oauth2Client, filePath, title, description, tagsList, privacy) {
  const { google } = require("googleapis");
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const body = {
    snippet: {
      title,
      description: description || "",
      tags: tagsList,
      categoryId: "22",
    },
    status: { privacyStatus: privacy },
  };
  const media = {
    body: fs.createReadStream(filePath),
  };
  const res = await youtube.videos.insert({
    part: "snippet,status",
    requestBody: body,
    media,
  });
  const videoId = res.data.id;
  console.log("Uploaded: https://youtube.com/watch?v=" + videoId);
  return videoId;
}

async function main() {
  const args = parseArgs();
  if (!args.file || !args.title) {
    console.error("Usage: node youtube_upload.js --file <path> --title \"Title\" [--description \"...\"] [--tags \"a,b\"] [--privacy public|private|unlisted]");
    process.exit(1);
  }
  if (!["public", "private", "unlisted"].includes(args.privacy)) {
    console.error("ERROR: --privacy must be public, private, or unlisted");
    process.exit(1);
  }
  let filePath = path.resolve(args.file);
  if (!path.isAbsolute(args.file)) filePath = path.resolve(SCRIPT_DIR, args.file);
  if (!fs.existsSync(filePath)) {
    console.error("ERROR: File not found:", filePath);
    process.exit(1);
  }
  const tagsList = args.tags ? args.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

  try {
    const auth = await getAuthenticatedClient();
    await uploadVideo(auth, filePath, args.title, args.description, tagsList, args.privacy);
    const creds = auth.credentials;
    if (creds && (creds.access_token || creds.refresh_token)) saveToken(creds);
    process.exit(0);
  } catch (e) {
    if (e.code === "MODULE_NOT_FOUND" && (e.message || "").includes("googleapis")) {
      console.error("ERROR: Missing npm dependencies. Install with:");
      console.error("  npm install");
      console.error("Run that from the skill directory (exec with skill_id 'youtube', command 'npm install'), then retry.");
      process.exit(1);
    }
    console.error("ERROR:", e.message || e);
    process.exit(1);
  }
}

main();
