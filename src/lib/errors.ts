/**
 * A failure the person can act on: an expired link, a wrong CN code, a request
 * in the wrong state. Its message is shown as written and it maps to a 4xx.
 * Anything else that escapes a route handler is our fault, and the response
 * says so without echoing internals (SQL, file paths) back to the browser.
 */
export class UserError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 410 | 422 = 400,
  ) {
    super(message);
    this.name = "UserError";
  }
}
