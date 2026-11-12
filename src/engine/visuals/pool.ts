/**
 * Task 18: allocation-free object pool for per-frame rendering. Each frame: `begin()`, `next()` for
 * every drawn thing (reuses earlier objects, creates only when the pool grows), `end()` hides the
 * unused rest. Pure: the factory/hide callbacks own the objects (Phaser sprites in the scene).
 */
export class Pool<T> {
  private readonly items: T[] = [];
  private used = 0;
  constructor(
    private readonly create: () => T,
    private readonly hide: (item: T) => void,
  ) {}
  begin(): void {
    this.used = 0;
  }
  next(): T {
    if (this.used === this.items.length) this.items.push(this.create());
    return this.items[this.used++];
  }
  /** Hides objects not used this frame; returns how many were used. */
  end(): number {
    for (let i = this.used; i < this.items.length; i++) this.hide(this.items[i]);
    return this.used;
  }
  get size(): number {
    return this.items.length;
  }
  get inUse(): number {
    return this.used;
  }
}
