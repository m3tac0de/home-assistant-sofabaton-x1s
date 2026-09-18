/** Shared pointer sorter, extracted from the device power-sequence editor. */
export class PointerReorder {
  state: { from: number; over: number; dy: number; height: number; pointerId: number; startY: number } | null = null;
  private handle: HTMLElement | null = null;

  constructor(
    private readonly rows: () => HTMLElement[],
    private readonly changed: () => void,
    private readonly moved: (from: number, to: number) => void,
    private readonly top: () => number = () => 0,
  ) {}

  start(event: PointerEvent, index: number): void {
    if (event.button !== 0 || this.state) return;
    const rect = this.rows()[index]?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    this.handle = event.currentTarget as HTMLElement;
    this.handle.setPointerCapture(event.pointerId);
    window.getSelection()?.removeAllRanges();
    this.state = { from: index, over: index, dy: 0, height: rect.height, pointerId: event.pointerId, startY: event.clientY };
    this.changed();
  }

  move(event: PointerEvent): void {
    const drag = this.state;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    if (event.clientY < this.top() + 32) window.scrollBy(0, -10);
    else if (event.clientY > window.innerHeight - 48) window.scrollBy(0, 10);
    this.state = { ...drag, over: this.slot(event.clientY), dy: event.clientY - drag.startY };
    this.changed();
  }

  private offset(index: number): number {
    const drag = this.state;
    if (!drag) return 0;
    if (index === drag.from) return drag.dy;
    if (drag.from < drag.over && index > drag.from && index <= drag.over) return -drag.height;
    if (drag.over < drag.from && index >= drag.over && index < drag.from) return drag.height;
    return 0;
  }

  private slot(clientY: number): number {
    const drag = this.state!;
    const rows = this.rows();
    const rects = rows.map((row) => row.getBoundingClientRect());
    const offset = (index: number) => {
      const transform = getComputedStyle(rows[index]).transform;
      return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
    };
    const own = rects[drag.from];
    if (!own) return drag.from;
    const centre = own.top - offset(drag.from) + own.height / 2 + clientY - drag.startY;
    let over = drag.from;
    rects.forEach((rect, index) => {
      // Read the actual rendered transform: Lit may not yet have painted
      // the most recent pointer event, and shifting rows can be animating.
      const mid = rect.top - offset(index) + rect.height / 2;
      if (index < drag.from && centre < mid) over = Math.min(over, index);
      if (index > drag.from && centre > mid) over = index;
    });
    return over;
  }

  end(event: PointerEvent): void {
    const drag = this.state;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const over = this.slot(event.clientY);
    this.cancel();
    if (over !== drag.from) this.moved(drag.from, over);
  }

  cancel(event?: PointerEvent): void {
    if (event && event.pointerId !== this.state?.pointerId) return;
    const id = this.state?.pointerId;
    this.state = null;
    if (id != null && this.handle?.hasPointerCapture(id)) this.handle.releasePointerCapture(id);
    this.handle = null;
    this.changed();
  }

  transform(index: number): string {
    return this.state ? `translateY(${this.offset(index)}px)` : "";
  }
}
