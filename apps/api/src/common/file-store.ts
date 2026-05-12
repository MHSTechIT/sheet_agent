import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const DATA_DIR = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : resolve(process.cwd(), 'data');

/**
 * Single-file JSON store. Reads are cached in-memory after first load. Writes
 * are serialized via a chained promise to prevent interleaving, and use a
 * temp-file + rename to make writes atomic on the filesystem.
 */
export class FileStore<T> {
  private cache: T | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly filePath: string;

  constructor(file: string, private readonly initial: T) {
    this.filePath = join(DATA_DIR, file);
  }

  async read(): Promise<T> {
    if (this.cache !== null) return this.cache;
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      this.cache = JSON.parse(data) as T;
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        this.cache = structuredClone(this.initial);
        await this.write(this.cache);
      } else {
        throw e;
      }
    }
    return this.cache!;
  }

  async write(value: T): Promise<void> {
    this.cache = value;
    const prev = this.writeChain;
    this.writeChain = (async () => {
      await prev;
      await fs.mkdir(dirname(this.filePath), { recursive: true });
      const tmp = this.filePath + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
      await fs.rename(tmp, this.filePath);
    })();
    return this.writeChain;
  }

  async update(fn: (cur: T) => T | Promise<T>): Promise<T> {
    const cur = await this.read();
    const next = await fn(structuredClone(cur));
    await this.write(next);
    return next;
  }

  async clear(): Promise<void> {
    this.cache = structuredClone(this.initial);
    await this.write(this.cache);
  }
}

/** Append-only log file. Lines are flushed sequentially. */
export class AppendLog {
  private chain: Promise<void> = Promise.resolve();
  private readonly filePath: string;

  constructor(file: string) {
    this.filePath = join(DATA_DIR, file);
  }

  append(message: string) {
    const line = `${new Date().toISOString()}  ${message}\n`;
    const prev = this.chain;
    this.chain = (async () => {
      await prev;
      await fs.mkdir(dirname(this.filePath), { recursive: true });
      await fs.appendFile(this.filePath, line, 'utf8');
    })();
    return this.chain;
  }
}

export { DATA_DIR };
