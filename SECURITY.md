# Security policy

CarbonPass holds the data behind legal declarations, so security reports are
taken seriously and answered quickly.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub:
[Security → Report a vulnerability](https://github.com/aquiadi/CBAM-Compilance/security/advisories/new).

Include what you found, how to reproduce it, and what an attacker could do with
it. You will get an acknowledgement within three working days and a plan within
ten. Please give a reasonable time to fix before disclosing.

## Supported versions

Only the latest commit on `main` is supported; deployments track it.

## What is in place

- Passwords hashed with scrypt; sessions, reset and invitation links stored as
  hashes; two-factor sign-in (TOTP) with hashed single-use recovery codes and
  secrets encrypted at rest when `CARBONPASS_ENCRYPTION_KEY` is set.
- Every write refused unless it comes from the app's own origin; roles checked
  on every route; sign-in, reset, upload and question endpoints rate-limited.
- A strict Content-Security-Policy and `frame-ancestors 'none'`.
- CI: `npm audit` on shipped dependencies, CodeQL (security-extended) on every
  push and weekly, Dependabot for dependency and action updates.

## Scope

In scope: this repository's code and its default configuration. Out of scope:
a specific deployment's hosting, and findings that need a compromised device or
an already-signed-in session of the victim.
