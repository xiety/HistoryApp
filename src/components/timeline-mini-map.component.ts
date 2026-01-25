import { Component, inject, computed, ElementRef, viewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimelineStateService } from '../services/timeline-state.service';
import { IconComponent } from './icon.component';

interface DensityBar {
  x: number;
  width: number;

  dimmedY: number;
  dimmedHeight: number;
  hasDimmed: boolean;

  matchY: number;
  matchHeight: number;
  hasMatch: boolean;

  isSearchActive: boolean;
}

@Component({
  selector: 'app-timeline-mini-map',
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './timeline-mini-map.component.html',
  styleUrls: ['./timeline-mini-map.component.css']
})
export class TimelineMiniMapComponent {
  state = inject(TimelineStateService);

  readonly containerRef = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');

  readonly isDragging = signal<boolean>(false);
  readonly dragMode = signal<'start' | 'end' | 'pan' | 'create' | null>(null);
  readonly hoverYear = signal<number | null>(null);

  private dragStartX = 0;
  private dragAnchorYear = 0;
  private initialStartYear = 0;
  private initialEndYear = 0;

  private isPotentialClick = false;
  private readonly CLICK_THRESHOLD = 5;

  readonly mapBounds = computed(() => this.state.dataBounds());

  readonly roundedStart = computed(() => Math.round(this.state.startYear()));
  readonly roundedEnd = computed(() => Math.round(this.state.endYear()));

  readonly canGoBack = computed(() => this.state.startYear() > this.state.dataBounds().min);
  readonly canGoForward = computed(() => this.state.endYear() < this.state.dataBounds().max);

  readonly formattedHoverYear = computed(() => {
    const y = this.hoverYear();
    return y === null ? '' : Math.round(y).toString();
  });

  readonly densityBars = computed<DensityBar[]>(() => {
    const data = this.state.densityData();
    const count = data.total.length;
    if (count === 0) return [];

    const barWidth = 100 / count;
    const isSearchActive = !!data.matching;

    const bars: DensityBar[] = [];

    for (let i = 0; i < count; i++) {
      const totalNorm = data.total[i];
      if (totalNorm <= 0) continue;

      const rawTotalH = totalNorm * 100;
      const rawMatchH = (data.matching ? data.matching[i] : 0) * 100;

      const matchH = rawMatchH > 0 ? Math.max(rawMatchH, 4) : 0;

      const calcDimmed = rawTotalH - matchH;
      const dimmedH = Math.max(0, calcDimmed);

      const visualTotalH = dimmedH + matchH;

      const dimmedY = 100 - dimmedH;
      const matchY = 100 - visualTotalH;

      bars.push({
        x: i * barWidth,
        width: barWidth,

        dimmedY,
        dimmedHeight: dimmedH,
        hasDimmed: dimmedH > 0,

        matchY,
        matchHeight: matchH,
        hasMatch: matchH > 0,

        isSearchActive
      });
    }

    return bars;
  });

  readonly rangePercent = computed(() => {
    const globalMin = this.mapBounds().min;
    const globalMax = this.mapBounds().max;
    const globalSpan = globalMax - globalMin;

    if (globalSpan <= 0) return { left: 0, width: 100 };

    const currentStart = this.state.startYear();
    const currentEnd = this.state.endYear();

    const clampedStart = Math.max(globalMin, currentStart);
    const clampedEnd = Math.min(globalMax, currentEnd);

    const startPct = ((clampedStart - globalMin) / globalSpan) * 100;
    const endPct = ((clampedEnd - globalMin) / globalSpan) * 100;

    const rawWidth = endPct - startPct;
    const width = Math.max(0, rawWidth);

    return {
      left: Math.max(0, startPct),
      width: Math.min(100, width)
    };
  });

  readonly hoverXPercent = computed(() => {
    const year = this.hoverYear();
    if (year === null) return null;

    const globalMin = this.mapBounds().min;
    const globalMax = this.mapBounds().max;
    const globalSpan = globalMax - globalMin;

    if (globalSpan <= 0) return 50;

    const pct = ((year - globalMin) / globalSpan) * 100;
    return Math.max(0, Math.min(100, pct));
  });

  shiftRange(direction: -1 | 1, event: MouseEvent) {
    const bounds = this.mapBounds();
    const step = event.shiftKey ? 10 : 1;
    const change = direction * step;

    let newStart = this.state.startYear() + change;
    let newEnd = this.state.endYear() + change;

    if (direction === -1 && newStart < bounds.min) {
      const diff = bounds.min - newStart;
      newStart += diff;
      newEnd += diff;
    }

    if (direction === 1 && newEnd > bounds.max) {
      const diff = newEnd - bounds.max;
      newStart -= diff;
      newEnd -= diff;
    }

    if (newStart < bounds.min) newStart = bounds.min;
    if (newEnd > bounds.max) newEnd = bounds.max;

    this.state.setRange(newStart, newEnd);
  }

  jumpTo(target: 'start' | 'end') {
    const bounds = this.mapBounds();
    const currentSpan = this.state.endYear() - this.state.startYear();

    let newStart, newEnd;

    if (target === 'start') {
      newStart = bounds.min;
      newEnd = Math.min(bounds.max, bounds.min + currentSpan);
    } else {
      newEnd = bounds.max;
      newStart = Math.max(bounds.min, bounds.max - currentSpan);
    }

    this.state.setRange(newStart, newEnd);
  }

  updateStart(val: number) {
    if (val === null || val === undefined) return;

    const bounds = this.mapBounds();
    const currentStart = this.state.startYear();
    const currentEnd = this.state.endYear();
    const minGap = 1;
    const currentSpan = currentEnd - currentStart;

    let newStart = Math.max(bounds.min, Math.min(val, bounds.max - minGap));

    if (newStart >= currentEnd) {
      let newEnd = newStart + currentSpan;

      if (newEnd > bounds.max) {
        newEnd = bounds.max;
        if (newStart > newEnd - minGap) {
          newStart = newEnd - minGap;
        }
      }
      this.state.setRange(newStart, newEnd);
    } else {
      this.state.startYear.set(newStart);
    }
  }

  updateEnd(val: number) {
    if (val === null || val === undefined) return;

    const bounds = this.mapBounds();
    const currentStart = this.state.startYear();
    const currentEnd = this.state.endYear();
    const minGap = 1;
    const currentSpan = currentEnd - currentStart;

    let newEnd = Math.min(bounds.max, Math.max(val, bounds.min + minGap));

    if (newEnd <= currentStart) {
      let newStart = newEnd - currentSpan;

      if (newStart < bounds.min) {
        newStart = bounds.min;
        if (newEnd < newStart + minGap) {
          newEnd = newStart + minGap;
        }
      }
      this.state.setRange(newStart, newEnd);
    } else {
      this.state.endYear.set(newEnd);
    }
  }

  onPointerDown(event: PointerEvent, mode: 'start' | 'end' | 'pan' | 'create') {
    event.preventDefault();
    event.stopPropagation();

    const target = event.target as HTMLElement;
    target.setPointerCapture(event.pointerId);

    this.isDragging.set(true);
    this.dragMode.set(mode);
    this.dragStartX = event.clientX;
    this.initialStartYear = this.state.startYear();
    this.initialEndYear = this.state.endYear();

    if (mode === 'create') {
      this.isPotentialClick = true;
      const year = this.getYearFromEvent(event);
      this.dragAnchorYear = year;
    } else {
      this.isPotentialClick = false;
    }
  }

  onPointerMove(event: PointerEvent) {
    const globalMin = this.mapBounds().min;
    const globalMax = this.mapBounds().max;
    const span = globalMax - globalMin;

    const hoverY = this.getYearFromEvent(event);
    this.hoverYear.set(hoverY);

    if (!this.isDragging()) return;

    const mode = this.dragMode();
    if (!mode) return;

    event.preventDefault();
    event.stopPropagation();

    if (span <= 0) return;

    if (mode === 'create') {
      if (this.isPotentialClick) {
        const dist = Math.abs(event.clientX - this.dragStartX);
        if (dist > this.CLICK_THRESHOLD) {
          this.isPotentialClick = false;
        } else {
          return;
        }
      }

      const currentYear = this.getYearFromEvent(event);
      const s = Math.min(this.dragAnchorYear, currentYear);
      const e = Math.max(this.dragAnchorYear, currentYear);

      const finalS = Math.max(globalMin, s);
      const finalE = Math.min(globalMax, Math.max(finalS + 1, e));

      this.state.setRange(finalS, finalE);
      return;
    }

    const container = this.containerRef().nativeElement;
    const rect = container.getBoundingClientRect();

    const effectiveWidth = Math.max(1, rect.width);
    const pxPerYear = effectiveWidth / span;
    const deltaPx = event.clientX - this.dragStartX;
    const deltaYear = deltaPx / pxPerYear;

    let newStart = this.initialStartYear;
    let newEnd = this.initialEndYear;
    const minGap = 1;

    if (mode === 'pan') {
      newStart += deltaYear;
      newEnd += deltaYear;

      if (newStart < globalMin) {
        const diff = globalMin - newStart;
        newStart += diff;
        newEnd += diff;
      }

      if (newEnd > globalMax) {
        const diff = newEnd - globalMax;
        newStart -= diff;
        newEnd -= diff;
      }
    } else if (mode === 'start') {
      newStart += deltaYear;
      if (newStart > this.initialEndYear - minGap) newStart = this.initialEndYear - minGap;
      if (newStart < globalMin) newStart = globalMin;
      this.state.setRange(newStart, this.initialEndYear);
      return;
    } else if (mode === 'end') {
      newEnd += deltaYear;
      if (newEnd < this.initialStartYear + minGap) newEnd = this.initialStartYear + minGap;
      if (newEnd > globalMax) newEnd = globalMax;
      this.state.setRange(this.initialStartYear, newEnd);
      return;
    }

    this.state.setRange(newStart, newEnd);
  }

  onPointerUp(event: PointerEvent) {
    if (this.isDragging()) {

      if (this.dragMode() === 'create' && this.isPotentialClick) {
        this.handleBackgroundClick(event);
      }

      this.isDragging.set(false);
      this.dragMode.set(null);
      this.isPotentialClick = false;

      const target = event.target as HTMLElement;

      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
    }
  }

  private handleBackgroundClick(event: PointerEvent) {
    const clickYear = this.getYearFromEvent(event);
    const bounds = this.mapBounds();

    const currentSpan = this.state.endYear() - this.state.startYear();
    const halfSpan = currentSpan / 2;

    let newStart = clickYear - halfSpan;
    let newEnd = clickYear + halfSpan;

    if (newStart < bounds.min) {
      newStart = bounds.min;
      newEnd = newStart + currentSpan;
    }

    if (newEnd > bounds.max) {
      newEnd = bounds.max;
      newStart = newEnd - currentSpan;
    }

    if (newStart < bounds.min) newStart = bounds.min;
    if (newEnd > bounds.max) newEnd = bounds.max;

    this.state.setRange(newStart, newEnd);
  }

  onPointerLeave() {
    if (!this.isDragging()) {
      this.hoverYear.set(null);
    }
  }

  private getYearFromEvent(event: PointerEvent): number {
    const container = this.containerRef().nativeElement;

    const rect = container.getBoundingClientRect();
    const effectiveWidth = Math.max(1, rect.width);

    const x = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / effectiveWidth));

    const bounds = this.mapBounds();
    return bounds.min + (ratio * (bounds.max - bounds.min));
  }
}
