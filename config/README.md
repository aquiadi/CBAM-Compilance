# Deployment configuration

Runtime configuration is environment-driven. It is validated in
[`src/config/env.ts`](../src/config/env.ts), the only place that reads `process.env`. An invalid
value fails the process at startup with the variable named, rather than surfacing later as a wrong
figure in a declaration.

See [`.env.example`](../.env.example) for every variable, its default and its accepted range. The
README's _Deploy it_ section covers Vercel, Railway and Docker step by step.

The platform files live at the repository root, where the platforms look for them:

- [`railway.json`](../railway.json): Dockerfile build, health check on `/api/health`, restart
  policy.
- [`Dockerfile`](../Dockerfile): the standalone image, used by Railway, Docker and any container
  host.
- [`docker-compose.yml`](../docker-compose.yml): the app plus Postgres.
- Vercel needs no file. It detects Next.js, and `next.config.ts` adapts to it when `VERCEL` is set.

This directory is kept for deployment overlays that are not code, such as Kubernetes manifests,
Terraform, or per-environment `.env` files. The application needs none of them.
