import type { Point } from '../weapon-attacks';
import { compareIds, nonNegative, point, positive } from './validation';
interface Cell {
  x: number;
  y: number;
  entries: { id: string; position: Point }[];
}
/** Center-based uniform grid; query range includes the largest neighbor radius. */
export class SpatialGrid {
  private readonly cells = new Map<string, Cell>();
  private readonly ids = new Set<string>();
  constructor(readonly cellSize: number) {
    positive(cellSize, 'cellSize');
  }
  get cellCount() {
    return this.cells.size;
  }
  clear() {
    this.cells.clear();
    this.ids.clear();
  }
  insert(id: string, position: Point) {
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('Grid id must be non-empty.');
    if (this.ids.has(id)) throw new Error('Duplicate grid ID.');
    const p = point(position, 'grid position'),
      x = this.coordinate(p.x),
      y = this.coordinate(p.y),
      key = this.key(x, y);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = { x, y, entries: [] };
      this.cells.set(key, cell);
    }
    cell.entries.push({ id, position: p });
    this.ids.add(id);
  }
  query(position: Point, radius: number): readonly string[] {
    const p = point(position, 'query position');
    nonNegative(radius, 'query radius');
    const found: string[] = [];
    const minX = this.coordinate(p.x - radius),
      maxX = this.coordinate(p.x + radius),
      minY = this.coordinate(p.y - radius),
      maxY = this.coordinate(p.y + radius);
    const visit = (cell: Cell | undefined) => {
      for (const entry of cell?.entries ?? [])
        if (Math.hypot(entry.position.x - p.x, entry.position.y - p.y) <= radius)
          found.push(entry.id);
    };
    // A huge-radius query visits occupied cells, avoiding unbounded empty-cell loops.
    if ((maxX - minX + 1) * (maxY - minY + 1) > this.cells.size * 4) {
      for (const cell of this.cells.values())
        if (cell.x >= minX && cell.x <= maxX && cell.y >= minY && cell.y <= maxY) visit(cell);
    } else
      for (let x = minX; x <= maxX; x++)
        for (let y = minY; y <= maxY; y++) visit(this.cells.get(this.key(x, y)));
    return Object.freeze(found.sort(compareIds));
  }
  private coordinate(value: number) {
    const coordinate = Math.floor(value / this.cellSize);
    if (!Number.isSafeInteger(coordinate))
      throw new RangeError('Position/radius is not representable in the spatial grid.');
    return coordinate;
  }
  private key(x: number, y: number) {
    return `${x},${y}`;
  }
}
