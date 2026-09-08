# Deployment configuration

Runtime configuration is environment-driven and validated in
[`src/config/env.ts`](../src/config/env.ts), which is the single place anything reads
`process.env`. An invalid value fails the process at startup with the variable named, rather than
surfacing later as a wrong figure in a declaration.

See [`.env.example`](../.env.example) for every variable, its default and its accepted range.

This directory holds deployment overlays that are not code — Kubernetes manifests, Terraform, or
per-environment `.env` files. It is deliberately empty in the repository: the application needs no
configuration file to run, and shipping an empty YAML tree to look organised would be noise.
