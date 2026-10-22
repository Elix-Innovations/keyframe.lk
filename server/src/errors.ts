/** An error that maps directly to an HTTP status + `{ error }` JSON body. */
export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 401 | 404 | 413 | 415 | 422 | 429 | 500 | 502 | 503 | 504,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
