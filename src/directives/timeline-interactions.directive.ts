import { Directive, ElementRef, inject, signal, input, ChangeDetectorRef } from '@angular/core';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineLayoutService } from '../services/timeline-layout.service';
import { ScrollSyncService, ScrollAnchor } from '../services/scroll-sync.service';

@Directive({
  selector: '[appTimelineInteractions]',
  standalone: true,
  host: {
    '(wheel)': 'handleWheel($event)',
    '(pointerdown)': 'handlePointerDown($event)',
    '(pointermove)': 'handlePointerMove($event)',
    '(pointerup)': 'handlePointerUp($event)',
    '(pointercancel)': 'handlePointerUp($event)',
    '(lostpointercapture)': 'handlePointerUp($event)',
    '(pointerleave)': 'handlePointerLeave($event)'
  }
})
export class TimelineInteractionsDirective {
  scrollContainer = input<HTMLElement | null>(null);

  private elementRef = inject(ElementRef<HTMLElement>);
  private state = inject(TimelineStateService);
  private layout = inject(TimelineLayoutService);
  private scrollSync = inject(ScrollSyncService);
  private cdr = inject(ChangeDetectorRef);

  readonly isDragging = signal(false);

  private dragStartX = 0;
  private dragStartYear = 0;
  private dragEndYear = 0;
  private dragAnchor: ScrollAnchor | null = null;
  private evCache: PointerEvent[] = [];
  private prevPinchDiff = -1;

  handleWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      this.handleZoom(event);
      return;
    }

    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      this.handlePan(event);
      return;
    }
  }

  handlePointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const scrollEl = this.scrollContainer();
    if (scrollEl && event.target === scrollEl) {
      const rect = scrollEl.getBoundingClientRect();
      if (event.clientX >= rect.right - (scrollEl.offsetWidth - scrollEl.clientWidth)) return;
      if (event.clientY >= rect.bottom - (scrollEl.offsetHeight - scrollEl.clientHeight)) return;
    }

    if (event.pointerType !== 'mouse') {
      this.state.setHoveredYear(null);
    }

    event.preventDefault();
    event.stopPropagation();

    const target = event.target as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const existingIndex = this.evCache.findIndex(p => p.pointerId === event.pointerId);
    if (existingIndex > -1) {
      this.evCache[existingIndex] = event;
    } else {
      this.evCache.push(event);
    }

    if (this.evCache.length === 1) {
      this.startDrag(event.clientX, event.clientY);
    } else if (this.evCache.length === 2) {
      this.prevPinchDiff = this.getPinchDistance();
    }
  }

  handlePointerMove(event: PointerEvent): void {
    if (event.pointerType === 'mouse') {
      const rect = this.elementRef.nativeElement.getBoundingClientRect();
      const x = event.clientX - rect.left;
      this.updateHoverYear(x);
    }

    const index = this.evCache.findIndex(cached => cached.pointerId === event.pointerId);
    if (index === -1) return;

    this.evCache[index] = event;
    event.preventDefault();
    event.stopPropagation();

    if (this.evCache.length === 2) {
      this.handlePinchZoom(event.clientY);
    } else if (this.evCache.length === 1) {
      this.updateDrag(event.clientX, event.clientY);
    }
  }

  handlePointerUp(event: PointerEvent): void {
    this.removePointer(event);

    if (this.evCache.length === 1) {
      const remaining = this.evCache[0];
      this.startDrag(remaining.clientX, remaining.clientY);
      this.prevPinchDiff = -1;
    } else if (this.evCache.length === 0) {
      this.endDrag();
      this.prevPinchDiff = -1;
    }
  }

  handlePointerLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse') {
      this.state.setHoveredYear(null);
    }
  }

  private startDrag(clientX: number, clientY: number): void {
    this.isDragging.set(true);
    this.dragStartX = clientX;
    this.dragStartYear = this.state.startYear();
    this.dragEndYear = this.state.endYear();

    const scrollEl = this.scrollContainer();
    if (scrollEl) {
      const rect = scrollEl.getBoundingClientRect();
      const absoluteY = scrollEl.scrollTop + (clientY - rect.top);
      this.dragAnchor = this.scrollSync.findScrollAnchor(absoluteY, this.state.processedLayout());
    }
  }

  private updateDrag(clientX: number, clientY: number): void {
    if (!this.isDragging() || !this.dragAnchor) return;

    const deltaPixels = this.dragStartX - clientX;
    this.applyPan(deltaPixels);

    this.cdr.detectChanges();
    const scrollEl = this.scrollContainer();
    if (scrollEl) {
      const rect = scrollEl.getBoundingClientRect();
      const mouseInScrollFrame = clientY - rect.top;
      const newY = this.scrollSync.resolveAnchorY(this.dragAnchor, this.state.processedLayout());
      if (newY !== null) {
        scrollEl.scrollTop = Math.max(0, newY - mouseInScrollFrame);
      }
    }
  }

  private endDrag(): void {
    this.isDragging.set(false);
    this.dragAnchor = null;
  }

  private handleZoom(event: WheelEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;

    const result = this.calculateZoomState(
      mouseX,
      event.deltaY
    );

    if (result) {
      this.applyRangeChange(result.start, result.end, event.clientY);
    }
  }

  private handlePan(event: WheelEvent): void {
    event.preventDefault();
    event.stopPropagation();

    let deltaPixels = event.deltaX;
    if (deltaPixels === 0 && event.shiftKey) {
      deltaPixels = event.deltaY;
    }

    this.applyPan(deltaPixels);
  }

  private applyPan(deltaPixels: number): void {
    const pxPerYear = this.state.pixelsPerYear();
    if (pxPerYear <= 0) return;

    const yearDelta = deltaPixels / pxPerYear;

    const start = this.dragStartYear || this.state.startYear();
    const end = this.dragEndYear || this.state.endYear();

    let newStart = start + yearDelta;
    let newEnd = end + yearDelta;

    this.state.setRange(newStart, newEnd);
  }

  private calculateZoomState(pivotX: number, delta: number): { start: number, end: number; } | null {
    const currentStart = this.state.startYear();
    const currentEnd = this.state.endYear();
    const containerWidth = this.state.layoutWidth();

    const span = currentEnd - currentStart;

    if (span <= 0.001 && delta < 0) return null;
    if (span >= Number.MAX_SAFE_INTEGER / 2 && delta > 0) return null;

    const sidePadding = this.layout.getSidePadding();
    const effectiveWidth = Math.max(1, containerWidth - (2 * sidePadding));
    const relativePivot = pivotX - sidePadding;
    const mouseRatio = Math.max(0, Math.min(1, relativePivot / effectiveWidth));
    const yearUnderMouse = currentStart + (span * mouseRatio);

    const zoomFactor = delta > 0 ? 1.05 : 0.95;
    const newSpan = span * zoomFactor;

    let newStart = yearUnderMouse - (newSpan * mouseRatio);
    let newEnd = newStart + newSpan;

    return { start: newStart, end: newEnd };
  }

  private applyRangeChange(newStart: number, newEnd: number, clientY: number): void {
    const scrollEl = this.scrollContainer();

    if (!scrollEl) {
      this.state.setRange(newStart, newEnd);
      return;
    }

    const rect = scrollEl.getBoundingClientRect();
    const mouseInScrollFrame = clientY - rect.top;
    const absoluteY = scrollEl.scrollTop + mouseInScrollFrame;
    const anchor = this.scrollSync.findScrollAnchor(absoluteY, this.state.processedLayout());

    this.state.setRange(newStart, newEnd);
    this.cdr.detectChanges();

    const newY = this.scrollSync.resolveAnchorY(anchor, this.state.processedLayout());
    if (newY !== null) {
      scrollEl.scrollTop = Math.max(0, newY - mouseInScrollFrame);
    }
  }

  private removePointer(event: PointerEvent): void {
    const index = this.evCache.findIndex(cached => cached.pointerId === event.pointerId);
    if (index > -1) {
      this.evCache.splice(index, 1);
      const target = event.target as HTMLElement;
      if (target.hasPointerCapture && target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
    }
  }

  private getPinchDistance(): number {
    const [p1, p2] = this.evCache;
    const dx = p1.clientX - p2.clientX;
    const dy = p1.clientY - p2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private handlePinchZoom(clientY: number): void {
    const curDiff = this.getPinchDistance();
    if (this.prevPinchDiff > 0) {
      const delta = curDiff - this.prevPinchDiff;
      const rect = this.elementRef.nativeElement.getBoundingClientRect();
      const centerX = ((this.evCache[0].clientX + this.evCache[1].clientX) / 2) - rect.left;

      if (Math.abs(delta) < 2) return;

      const result = this.calculateZoomState(centerX, -delta);

      if (result) {
        this.applyRangeChange(result.start, result.end, clientY);
      }
      this.prevPinchDiff = curDiff;
    }
  }

  private updateHoverYear(x: number): void {
    const year = this.layout.calculateYearFromX(
      x,
      this.state.startYear(),
      this.state.endYear(),
      this.state.layoutWidth()
    );
    this.state.setHoveredYear(year);
  }
}
