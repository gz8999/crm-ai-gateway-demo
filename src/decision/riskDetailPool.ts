export type DetailLoader<T> = (signal: AbortSignal) => Promise<T>;

type QueueTask<T> = {
  key: string;
  generation: number;
  loader: DetailLoader<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

export class RiskDetailPool<T> {
  private readonly cache = new Map<string, T>();
  private readonly pending = new Map<string, Promise<T>>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly queue: QueueTask<T>[] = [];
  private active = 0;
  private generation = 0;

  constructor(private readonly concurrency = 3) {}

  get(key: string) {
    return this.cache.get(key);
  }

  load(key: string, loader: DetailLoader<T>) {
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);
    const existing = this.pending.get(key);
    if (existing) return existing;

    const generation = this.generation;
    let start = () => undefined;
    const promise = new Promise<T>((resolve, reject) => {
      start = () => {
        this.queue.push({ key, generation, loader, resolve, reject });
        this.drain();
      };
    });
    this.pending.set(key, promise);
    start();
    return promise;
  }

  cancelStale() {
    this.generation += 1;
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    const queued = this.queue.splice(0);
    for (const task of queued) {
      this.pending.delete(task.key);
      task.reject(new DOMException("Request scope changed", "AbortError"));
    }
  }

  private drain() {
    while (this.active < this.concurrency && this.queue.length) {
      const task = this.queue.shift()!;
      if (task.generation !== this.generation) {
        this.pending.delete(task.key);
        task.reject(new DOMException("Request scope changed", "AbortError"));
        continue;
      }
      this.run(task);
    }
  }

  private async run(task: QueueTask<T>) {
    this.active += 1;
    const controller = new AbortController();
    this.controllers.set(task.key, controller);
    try {
      const value = await task.loader(controller.signal);
      if (task.generation !== this.generation) throw new DOMException("Request scope changed", "AbortError");
      this.cache.set(task.key, value);
      task.resolve(value);
    } catch (error) {
      task.reject(error);
    } finally {
      this.active -= 1;
      this.controllers.delete(task.key);
      this.pending.delete(task.key);
      this.drain();
    }
  }
}

export function riskDetailKey(mode: string, scenarioId: string, token: string) {
  return `${mode}|${scenarioId || "portfolio"}|${token}`;
}
