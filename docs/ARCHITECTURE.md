# Hugo Protector Architecture

## Goals
- Keep sensitive Markdown content encrypted at rest while stored in git.
- Decrypt inside the visitor's browser using AES-256-GCM derived from a user-supplied password.
- Support both inline/partial content protection (via Hugo shortcode) and full-page protection (password prompt before rendering page content).

## Components

### 1. Encryption CLI (`bin/hugo-protector`)
- Node.js script that reads plaintext from stdin or a file and outputs a payload string.
- Uses PBKDF2 (SHA-256) with configurable iterations to derive a 256-bit key from the password.
- Encrypts with AES-256-GCM. Payload includes: version, cipher, salt, iv, iterations, ciphertext, auth tag. Entire payload is base64-encoded JSON.
- Modes:
  - `shortcode`: result pasted into Markdown via `{{< protector payload="..." >}}` shortcode.
  - `page`: result stored in front matter parameter `protector_full_page_payload`.

### 2. Hugo Shortcode (`layouts/shortcodes/protector.html`)
- Replaces shortcode usage with a password form placeholder.
- Emits a `<div class="hugo-protector-block">` that carries the ciphertext payload via `data-payload` attribute.
- When decrypted, the block's inner HTML is replaced with the plaintext (rendered Markdown fragment).

### 3. Full-Page Partial (`layouts/partials/protector/full_page.html`)
- When `.Params.protector_full_page_payload` exists, render a fullscreen lock overlay instead of page content.
- After successful decrypt, the overlay injects decrypted HTML into the main article container.

### 4. Frontend Runtime (`static/hugo-protector/protector.js`)
- Plain ES module (and UMD shim) that bootstraps automatically on DOMContentLoaded.
- Handles password input flows, uses Web Crypto to derive AES key and decrypt payload.
- Shared logic for shortcode blocks and full-page overlays; exposes `window.HugoProtector` API for manual control.

### 5. Documentation (`README.md`)
- Covers installation, encryption workflow, shortcode usage, full-page protection setup, and security considerations.

## Data Flow
1. Author runs CLI: `npx hugo-protector encrypt --input snippet.html --mode shortcode`.
2. CLI outputs base64 payload; author inserts into Markdown/Front matter. Only ciphertext is committed.
3. Hugo builds site; shortcode/partial render password prompt placeholders and load `protector.js`.
4. Visitor enters password; frontend derives key (PBKDF2 SHA-256) and decrypts payload in-browser. Plaintext never leaves client.

## Security Notes
- PBKDF2 iterations default to 310000; configurable via CLI flag to balance strength vs client-side delay.
- AES-GCM authentication tag ensures tamper detection.
- Password is never persisted; forms clear inputs after each attempt.
- Optional `data-hint` attributes let authors provide password hints without exposing sensitive data.
