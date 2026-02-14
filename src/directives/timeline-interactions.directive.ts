import { Directive, ElementRef, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineGeometryService } from '../services/timeline-geometry.service';
import { TimelineWorkspaceComponent } from '../components/timeline-workspace.component';
import { TimelineLayoutService } from '../services/timeline-layout.service';

@Directive({
  selector: '[appTimelineInteractions]',
  standalone: true,
  host: {
    '(wheel)': 'onWheel($event)',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerUp($event)',
    '(lostpointercapture)': 'onPointerUp($event)',
    '(pointerleave)': 'onPointerLeave($event)',
  },
})
export class TimelineInteractionsDirective {
  private el = inject(ElementRef<HTMLElement>);
  private state = inject(TimelineStateService);
  private geometry = inject(TimelineGeometryService);
  private workspace = inject(TimelineWorkspaceComponent);
  private layout = inject(TimelineLayoutService);

  scrollContainer = input<HTMLElement | null>(null);

  private activePointers = new Map<number, PointerEvent>();
  private readonly wheelActivity$ = new Subject<void>();
  private lastPinchDist = -1;
  private dragStart = { x: 0, y: 0, yearStart: 0, yearEnd: 0 };
  private isDragging = false;
  private hasMoved = false;

  constructor() {
    this.wheelActivity$
      .pipe(debounceTime(200), takeUntilDestroyed())
      .subscribe(() => {
        if (this.activePointers.size === 0) {
          this.state.isUserInteracting.set(false);
        }
      });
  }

  onWheel(event: WheelEvent): void {
    const isZoom = event.ctrlKey || event.metaKey;
    this.state.isHoverDetailsSuppressed.set(isZoom);
    this.state.isUserInteracting.set(true);
    this.wheelActivity$.next();

    if (isZoom) {
      event.preventDefault();
      event.stopPropagation();
      this.handleZoomWheel(event);
      return;
    }

    let deltaX = event.deltaX;
    let deltaY = event.deltaY;

    if (event.shiftKey && deltaX === 0 && Math.abs(deltaY) > 0) {
      deltaX = deltaY;
      deltaY = 0;
    }

    const isHorizontalPan = Math.abs(deltaX) > Math.abs(deltaY);

    if (isHorizontalPan) {
      event.preventDefault();
      event.stopPropagation();
      const container = this.scrollContainer();
      if (container) {
        const rect = container.getBoundingClientRect();
        const relativeY = event.clientY - rect.top;
        this.workspace.setAnchorAtRelativeY(relativeY);
      }
      this.applyPan(deltaX);
    }
  }

  onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    if (this.isScrollbarInteraction(event)) return;

    this.el.nativeElement.setPointerCapture(event.pointerId);
    this.activePointers.set(event.pointerId, event);
    this.state.isUserInteracting.set(true);

    if (event.pointerType !== 'mouse') {
      this.state.setHoveredYear(null);
    }

    if (this.activePointers.size === 1) {
      this.beginDrag(event);
    } else if (this.activePointers.size === 2) {
      this.beginPinch();
    }
  }

  onPointerMove(event: PointerEvent): void {
    this.state.isHoverDetailsSuppressed.set(event.ctrlKey || event.metaKey);
    if (event.pointerType === 'mouse') {
      this.updateHoverYear(event.clientX);
    }

    if (this.activePointers.has(event.pointerId)) {
      this.activePointers.set(event.pointerId, event);
    }

    if (!this.hasMoved) {
      const dist = Math.hypot(
        event.clientX - this.dragStart.x,
        event.clientY - this.dragStart.y,
      );
      if (dist > 5) this.hasMoved = true;
    }

    if (this.activePointers.size === 2) {
      this.updatePinch();
    } else if (this.activePointers.size === 1 && this.isDragging) {
      this.updateDrag(event);
    }
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) return;
    this.activePointers.delete(event.pointerId);

    if (this.el.nativeElement.hasPointerCapture(event.pointerId)) {
      this.el.nativeElement.releasePointerCapture(event.pointerId);
    }

    if (this.activePointers.size === 0) {
      if (event.pointerType !== 'mouse' && !this.hasMoved) {
        this.updateHoverYear(event.clientX);
      }
      this.endDrag();
      this.state.isUserInteracting.set(false);
    } else if (this.activePointers.size === 1) {
      const remaining = this.activePointers.values().next().value;
      if (remaining) this.beginDrag(remaining);
      this.lastPinchDist = -1;
    }
  }

  onPointerLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse') {
      this.state.setHoveredYear(null);
    }
  }

  private handleZoomWheel(event: WheelEvent) {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const delta =
      Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY), 100);
    this.applyZoom(relativeX, delta);
  }

  private beginDrag(event: PointerEvent) {
    this.isDragging = true;
    this.hasMoved = false;
    this.dragStart = {
      x: event.clientX,
      y: event.clientY,
      yearStart: this.state.startYear(),
      yearEnd: this.state.endYear(),
    };
    const container = this.scrollContainer();
    const startY = container
      ? event.clientY - container.getBoundingClientRect().top
      : 0;
    this.workspace.startDrag(startY);
  }

  private updateDrag(event: PointerEvent) {
    if (!this.isDragging) return;

    const deltaX = this.dragStart.x - event.clientX;
    const pxPerYear = this.state.pixelsPerYear();

    if (pxPerYear > 0) {
      const yearDelta = deltaX / pxPerYear;
      this.state.setRange(
        this.dragStart.yearStart + yearDelta,
        this.dragStart.yearEnd + yearDelta,
      );
    }

    const deltaY = event.clientY - this.dragStart.y;
    this.workspace.updateDrag(deltaY);
  }

  private endDrag() {
    this.isDragging = false;
    this.workspace.endDrag();
    this.lastPinchDist = -1;
  }

  private beginPinch() {
    this.isDragging = false;
    this.hasMoved = true;
    this.lastPinchDist = this.getPinchDistance();
  }

  private updatePinch() {
    const currentDist = this.getPinchDistance();
    if (this.lastPinchDist > 0 && currentDist > 0) {
      const delta = this.lastPinchDist - currentDist;
      const pointers = Array.from(this.activePointers.values());
      const centerX = (pointers[0].clientX + pointers[1].clientX) / 2;
      const rect = this.el.nativeElement.getBoundingClientRect();
      const relativeX = centerX - rect.left;

      if (Math.abs(delta) > 2) {
        this.applyZoom(relativeX, delta * 2.5);
        this.lastPinchDist = currentDist;
      }
    }
  }

  private applyPan(deltaPx: number) {
    const pxPerYear = this.state.pixelsPerYear();
    if (pxPerYear <= 0) return;
    const yearDelta = deltaPx / pxPerYear;
    this.state.setRange(
      this.state.startYear() + yearDelta,
      this.state.endYear() + yearDelta,
    );
  }

  private applyZoom(pivotX: number, delta: number) {
    const start = this.state.startYear();
    const end = this.state.endYear();
    const span = end - start;

    if (span < 0.01 && delta < 0) return;
    if (span > 100000 && delta > 0) return;

    const width = this.state.layoutWidth();
    const sidePadding = this.layout.getSidePadding();
    const effectiveW = Math.max(1, width - 2 * sidePadding);

    const ratio = Math.max(0, Math.min(1, (pivotX - sidePadding) / effectiveW));
    const pivotYear = start + span * ratio;
    const factor = 1 + delta * 0.001;
    const newSpan = span * factor;

    this.state.setRange(
      pivotYear - newSpan * ratio,
      pivotYear + newSpan * (1 - ratio),
    );
  }

  private updateHoverYear(clientX: number) {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const year = this.geometry.calculateYearFromX(
      clientX - rect.left,
      this.state.startYear(),
      this.state.endYear(),
      this.state.layoutWidth(),
    );
    this.state.setHoveredYear(year);
  }

  private getPinchDistance(): number {
    const pointers = Array.from(this.activePointers.values());
    if (pointers.length < 2) return 0;
    return Math.hypot(
      pointers[0].clientX - pointers[1].clientX,
      pointers[0].clientY - pointers[1].clientY,
    );
  }

  private isScrollbarInteraction(event: PointerEvent): boolean {
    const container = this.scrollContainer();
    return !!container && event.target === container;
  }
}
