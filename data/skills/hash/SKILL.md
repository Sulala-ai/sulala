---
name: hash
description: Compute or verify file checksums (SHA-256, MD5). Use when the user asks "checksum of this file", "SHA256 of …", "verify the digest", "hash of file", "MD5 of …".
metadata:
  sulala:
    emoji: "🔐"
    requires:
      bins:
        - sha256sum
        - md5sum
---

# Hash / checksum

Use **sha256sum** or **md5sum** via the **exec** tool to compute or verify file digests. Run from the workspace or pass an absolute path.

## SHA-256

```bash
sha256sum path/to/file
sha256sum ./package.json
```

Output: `hexdigest  path/to/file`. Use `-c` to verify a list of digests from stdin or a file.

## MD5

```bash
md5sum path/to/file
md5sum ./image.png
```

## Verify a checksum

User gives expected digest; compute and compare:

```bash
sha256sum -c - <<< "expected_hex  path/to/file"
# Or: echo "expected_hex  file" | sha256sum -c
```

## On macOS

macOS uses different names; use one of:

```bash
shasum -a 256 path/to/file
md5 path/to/file
```

`shasum -a 256` is equivalent to `sha256sum`. Prefer `shasum -a 256` if `sha256sum` is not available.

## Tips

- Path can be relative (to workspace) or absolute (e.g. `~/Downloads/file.zip`).
- For "checksum of this file" or "verify this digest", run the command and compare output to what the user provided.
