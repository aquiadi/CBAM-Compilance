/**
 * Server errors as one structured JSON line each, on stderr, where Railway,
 * Vercel and Docker already collect logs. The line carries the error digest
 * the user sees on the error page, so a support request can be matched to its
 * log line. Nothing about the request body is logged: it may hold customer
 * data.
 */

export function register() {
  // Nothing to set up; the hook below is the point.
}

export function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const err = error as { message?: string; digest?: string; stack?: string; name?: string };
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      digest: err.digest ?? null,
      name: err.name ?? "Error",
      message: err.message ?? String(error),
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      routeType: context.routeType,
      stack: err.stack?.split("\n").slice(0, 8).join("\n"),
    }),
  );
}
