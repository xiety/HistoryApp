import { Component, inject, computed, ElementRef, viewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimelineStateService } from '../services/timeline-state.service';
import { IconComponent } from './icon.component';
import { YearFormatPipe } from '../pipes/year-format.pipe';
import { NumberInputComponent } from './number-input.component';

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
  imports: [CommonModule, FormsModule, IconComponent, YearFormatPipe, NumberInputComponent],
  templateUrl: './timeline-mini-map.component.html',
  styleUrls: ['./timeline-mini-map.component.css']
})
export class TimelineMiniMapComponent {
  state = inject(TimelineStateService);

  readonly containerRef = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  readonly contentRef = viewChild.required<ElementRef<HTMLDivElement>>('contentLayer');

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

    const startPct = ((currentStart - globalMin) / globalSpan) * 100;
    const endPct = ((currentEnd - globalMin) / globalSpan) * 100;

    const rawWidth = endPct - startPct;
    const width = Math.max(0, rawWidth);

    return {
      left: startPct,
      width: width
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


  updateStart(val: number) {
    const currentEnd = this.state.endYear();
    const minGap = 1;

    if (val >= currentEnd) {
      this.state.setRange(val, val + minGap);
    } else {
      this.state.startYear.set(val);
    }
  }

  updateEnd(val: number) {
    const currentStart = this.state.startYear();
    const minGap = 1;

    if (val <= currentStart) {
      this.state.setRange(val - minGap, val);
    } else {
      this.state.endYear.set(val);
    }
  }

  shiftRange(direction: -1 | 1, event: MouseEvent) {
    const step = event.shiftKey ? 10 : 1;
    const change = direction * step;

    let newStart = this.state.startYear() + change;
    let newEnd = this.state.endYear() + change;

    this.state.setRange(newStart, newEnd);
  }

  jumpTo(target: 'start' | 'end') {
    const bounds = this.mapBounds();
    const currentSpan = this.state.endYear() - this.state.startYear();

    let newStart, newEnd;

    if (target === 'start') {
      newStart = bounds.min;
      newEnd = bounds.min + currentSpan;
    } else {
      newEnd = bounds.max;
      newStart = bounds.max - currentSpan;
    }

    this.state.setRange(newStart, newEnd);
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

    const content = this.contentRef().nativeElement;
    const rect = content.getBoundingClientRect();

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
    } else if (mode === 'start') {
      newStart += deltaYear;
      if (newStart > this.initialEndYear - minGap) newStart = this.initialEndYear - minGap;
      this.state.setRange(newStart, this.initialEndYear);
      return;
    } else if (mode === 'end') {
      newEnd += deltaYear;
      if (newEnd < this.initialStartYear + minGap) newEnd = this.initialStartYear + minGap;
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

    const currentSpan = this.state.endYear() - this.state.startYear();
    const halfSpan = currentSpan / 2;

    const newStart = clickYear - halfSpan;
    const newEnd = clickYear + halfSpan;

    this.state.setRange(newStart, newEnd);
  }

  onPointerLeave() {
    if (!this.isDragging()) {
      this.hoverYear.set(null);
    }
  }

  private getYearFromEvent(event: PointerEvent): number {
    const content = this.contentRef().nativeElement;

    const rect = content.getBoundingClientRect();
    const effectiveWidth = Math.max(1, rect.width);

    const x = event.clientX - rect.left;
    const ratio = x / effectiveWidth;

    const bounds = this.mapBounds();
    return bounds.min + (ratio * (bounds.max - bounds.min));
  }
}
