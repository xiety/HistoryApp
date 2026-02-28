import { Directive, ElementRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineGeometryService } from '../services/timeline-geometry.service';
import { TimelineWorkspaceComponent } from '../components/timeline-workspace.component';

@Directive({
  selector: '[appTimelineInteractions]',
  standalone: true,
  host: {
    '[style.touch-action]': '"none"',
    '[style.-webkit-tap-highlight-color]': '"transparent"',
    '[style.-webkit-touch-callout]': '"none"',
    '(wheel)': 'onWheel($event)',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerCancel($event)',
    '(pointerleave)': 'onPointerLeave($event)',
    '(click)': 'onHostClick($event)',
  },
})
export class TimelineInteractionsDirective {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly state = inject(TimelineStateService);
  private readonly geometry = inject(TimelineGeometryService);
  private readonly workspace = inject(TimelineWorkspaceComponent);

  private activePointers = new Map<number, PointerEvent>();
  private readonly wheelActivity$ = new Subject<void>();

  private lastPinchDist = -1;
  private isDragging = false;
  private hasMoved = false;
  private dragStart = { x: 0, y: 0, yearStart: 0, yearEnd: 0 };

  constructor() {
    this.wheelActivity$
      .pipe(debounceTime(200), takeUntilDestroyed())
      .subscribe(() => {
        if (this.activePointers.size === 0) {
          this.state.isUserInteracting.set(false);
          this.state.isContentManipulation.set(false);
        }
      });
  }

  private getScrollContainer(): HTMLElement {
    return this.workspace.scrollContainer().nativeElement;
  }

  onWheel(event: WheelEvent): void {
    const isZoom = event.ctrlKey || event.metaKey;
    this.state.isHoverDetailsSuppressed.set(isZoom);
    this.state.isUserInteracting.set(true);
    this.wheelActivity$.next();

    if (isZoom) {
      this.lockAnchorAtMouse(event);
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

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      this.lockAnchorAtMouse(event);
      event.preventDefault();
      event.stopPropagation();
      this.applyPan(deltaX);
    }
  }

  onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === 'mouse') return;

    this.state.isContentManipulation.set(false);

    if (event.pointerType === 'mouse' && this.isScrollbarInteraction(event))
      return;
    if (event.pointerType === 'touch') event.preventDefault();

    this.activePointers.set(event.pointerId, event);

    if (event.pointerType !== 'mouse') {
      this.state.setHoveredYear(null);
    }

    if (this.activePointers.size === 1) {
      this.startTracking(event);
    } else if (this.activePointers.size === 2) {
      this.switchToPinch();
    }
  }

  onPointerMove(event: PointerEvent): void {
    this.state.isHoverDetailsSuppressed.set(event.ctrlKey || event.metaKey);

    if (event.pointerType === 'mouse') {
      this.updateHoverYear(event.clientX);
      if (this.isDragging && event.buttons === 0) {
        this.onPointerUp(event);
        return;
      }
    }

    if (!this.activePointers.has(event.pointerId)) return;
    this.activePointers.set(event.pointerId, event);

    if (this.activePointers.size === 2) {
      this.updatePinch();
    } else if (this.isDragging) {
      this.processDrag(event);
    }
  }

  private startTracking(event: PointerEvent) {
    this.isDragging = true;
    this.hasMoved = false;
    this.dragStart = {
      x: event.clientX,
      y: event.clientY,
      yearStart: this.state.startYear(),
      yearEnd: this.state.endYear(),
    };
  }

  private switchToPinch() {
    this.isDragging = false;
    this.hasMoved = true;
    this.state.isUserInteracting.set(true);
    this.state.isContentManipulation.set(true);
    this.lastPinchDist = this.getPinchDistance();
  }

  private processDrag(event: PointerEvent) {
    if (!this.hasMoved) {
      const dist = Math.hypot(
        event.clientX - this.dragStart.x,
        event.clientY - this.dragStart.y,
      );
      if (dist > 5) {
        this.hasMoved = true;
        this.state.isUserInteracting.set(true);
        this.state.isContentManipulation.set(true);
        this.el.nativeElement.setPointerCapture(event.pointerId);

        const container = this.getScrollContainer();
        const startY = this.dragStart.y - container.getBoundingClientRect().top;
        this.workspace.startDrag(startY);
      }
    } else {
      const yearDelta =
        (this.dragStart.x - event.clientX) / this.state.pixelsPerYear();
      this.state.setRange(
        this.dragStart.yearStart + yearDelta,
        this.dragStart.yearEnd + yearDelta,
      );
      this.workspace.updateDrag(event.clientY - this.dragStart.y);
    }
  }

  onPointerUp(event: PointerEvent): void {
    const tracked = this.activePointers.get(event.pointerId);
    if (!tracked || tracked.pointerType !== event.pointerType) return;

    this.activePointers.delete(event.pointerId);
    if (this.el.nativeElement.hasPointerCapture(event.pointerId)) {
      this.el.nativeElement.releasePointerCapture(event.pointerId);
    }

    if (this.activePointers.size === 0) {
      if (!this.hasMoved && event.pointerType === 'mouse') {
        this.updateHoverYear(event.clientX);
      }
      this.isDragging = false;
      if (this.hasMoved) {
        this.workspace.endDrag();
        this.state.isUserInteracting.set(false);
      }
    } else if (this.activePointers.size === 1) {
      const remaining = this.activePointers.values().next().value;
      if (remaining) this.startTracking(remaining);
      this.lastPinchDist = -1;
    }
  }

  onPointerCancel(event: PointerEvent): void {
    this.onPointerUp(event);
  }

  onPointerLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.state.setHoveredYear(null);
  }

  onHostClick(event: MouseEvent): void {
    this.state.isContentManipulation.set(false);
  }

  private lockAnchorAtMouse(event: MouseEvent) {
    this.state.isContentManipulation.set(true);
    const container = this.getScrollContainer();
    const rect = container.getBoundingClientRect();
    this.workspace.setAnchorAtMouse(
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  }

  private handleZoomWheel(event: WheelEvent) {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const delta =
      Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY), 100);
    this.applyZoom(event.clientX - rect.left, delta);
  }

  private updatePinch() {
    const currentDist = this.getPinchDistance();
    if (this.lastPinchDist > 0 && currentDist > 0) {
      const delta = this.lastPinchDist - currentDist;
      if (Math.abs(delta) > 2) {
        const pointers = Array.from(this.activePointers.values());
        const centerX = (pointers[0].clientX + pointers[1].clientX) / 2;
        const rect = this.el.nativeElement.getBoundingClientRect();
        this.applyZoom(centerX - rect.left, delta * 2.5);
        this.lastPinchDist = currentDist;
      }
    }
  }

  private applyPan(deltaPx: number) {
    const yearDelta = deltaPx / this.state.pixelsPerYear();
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

    const ratio = Math.max(0, Math.min(1, pivotX / this.state.layoutWidth()));
    const pivotYear = start + span * ratio;
    const newSpan = span * (1 + delta * 0.001);

    this.state.setRange(
      pivotYear - newSpan * ratio,
      pivotYear + newSpan * (1 - ratio),
    );
  }

  private updateHoverYear(clientX: number) {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const year = this.geometry.pixelToYear(
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
    const container = this.getScrollContainer();
    if (event.target !== container) return false;
    return (
      event.offsetX > container.clientWidth ||
      event.offsetY > container.clientHeight
    );
  }
}
