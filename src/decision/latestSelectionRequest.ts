export type LatestSelectionResult<T> =
  | { status: "applied"; value: T }
  | { status: "aborted" | "stale" }
  | { status: "error"; error: unknown };

export class LatestSelectionRequest<T> {
  private sequence = 0;
  private controller: AbortController | null = null;

  async run(loader: (signal: AbortSignal) => Promise<T>): Promise<LatestSelectionResult<T>> {
    const sequence = ++this.sequence;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    try {
      const value = await loader(controller.signal);
      if (sequence !== this.sequence) return { status: "stale" };
      return { status: "applied", value };
    } catch (error) {
      if (sequence !== this.sequence) return { status: "stale" };
      if (isAbortError(error)) return { status: "aborted" };
      return { status: "error", error };
    } finally {
      if (sequence === this.sequence) this.controller = null;
    }
  }

  cancel() {
    this.sequence += 1;
    this.controller?.abort();
    this.controller = null;
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
