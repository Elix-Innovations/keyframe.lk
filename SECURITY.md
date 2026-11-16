# Security

## Reporting
Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/elixinnovations/keyframe-web/security/advisories/new) (Security tab → **Report a vulnerability**). Include steps to reproduce. Do not open a public issue for a vulnerability. Expect a reply within a week.

## What stays local
Videos, audio and projects are stored in your browser (IndexedDB). Audio is sent to a transcription provider only when you add that provider's key to `server/.env` and press Generate. API keys live in `server/.env`, which is git-ignored. Never commit it.

## Hardening notes
Run the server on localhost only. Do not expose ports 8787 or 8788 to a network.
