import {
  Component,
  inject,
  computed,
  ElementRef,
  viewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineGeometryService } from '../services/timeline-geometry.service';
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
  imports: [
    CommonModule,
    FormsModule,
    IconComponent,
    YearFormatPipe,
    NumberInputComponent,
  ],
  templateUrl: './timeline-mini-map.component.html',
  styleUrls: ['./timeline-mini-map.component.css'],
})
export class TimelineMiniMapComponent {
  state = inject(TimelineStateService);
  private geometry = inject(TimelineGeometryService);

  readonly containerRef =
    viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  readonly contentRef =
    viewChild.required<ElementRef<HTMLDivElement>>('contentLayer');

  readonly isDragging = signal<boolean>(false);
  readonly dragMode = signal<'start' | 'end' | 'pan' | 'create' | null>(null);
  readonly hoverYear = signal<number | null>(null);

  private dragStartX = 0;
  private dragAnchorYear = 0;
  private initialRange = { start: 0, end: 0 };

  private isPotentialClick = false;
  private readonly CLICK_THRESHOLD = 5;

  readonly mapBounds = computed(() => this.state.dataBounds());

  readonly densityBars = computed<DensityBar[]>(() => {
    const { total, matching } = this.state.densityData();
    const count = total.length;
    if (count === 0) return [];

    const barWidth = 100 / count;
    const isSearchActive = matching !== null;

    return total
      .map((normVal, i) => {
        if (normVal <= 0) return null;

        const totalH = normVal * 100;
        const matchH = matching
          ? Math.max(matching[i] * 100, matching[i] > 0 ? 4 : 0)
          : 0;
        const dimmedH = Math.max(0, totalH - matchH);
        const visualTotalH = dimmedH + matchH;

        return {
          x: i * barWidth,
          width: barWidth,
          dimmedY: 100 - dimmedH,
          dimmedHeight: dimmedH,
          hasDimmed: dimmedH > 0,
          matchY: 100 - visualTotalH,
          matchHeight: matchH,
          hasMatch: matchH > 0,
          isSearchActive,
        };
      })
      .filter((bar): bar is DensityBar => bar !== null);
  });

  readonly rangePercent = computed(() => {
    const { min, max } = this.mapBounds();
    const startRatio = this.geometry.getRatio(this.state.startYear(), min, max);
    const endRatio = this.geometry.getRatio(this.state.endYear(), min, max);

    const startPct = startRatio * 100;
    const endPct = endRatio * 100;

    return {
      left: startPct,
      width: Math.max(0, endPct - startPct),
    };
  });

  readonly hoverXPercent = computed(() => {
    const year = this.hoverYear();
    if (year === null) return null;
    const { min, max } = this.mapBounds();
    const ratio = this.geometry.getRatio(year, min, max);
    return Math.max(0, Math.min(100, ratio * 100));
  });

  updateStart(val: number) {
    if (val >= this.state.endYear()) {
      this.state.setRange(val, val + 1);
    } else {
      this.state.startYear.set(val);
    }
  }

  updateEnd(val: number) {
    if (val <= this.state.startYear()) {
      this.state.setRange(val - 1, val);
    } else {
      this.state.endYear.set(val);
    }
  }

  shiftRange(direction: -1 | 1, event: MouseEvent) {
    const step = event.shiftKey ? 10 : 1;
    const change = direction * step;
    this.state.setRange(
      this.state.startYear() + change,
      this.state.endYear() + change,
    );
  }

  jumpTo(target: 'start' | 'end') {
    const { min, max } = this.mapBounds();
    const currentSpan = this.state.endYear() - this.state.startYear();

    if (target === 'start') {
      this.state.setRange(min, min + currentSpan);
    } else {
      this.state.setRange(max - currentSpan, max);
    }
  }

  onPointerDown(event: PointerEvent, mode: 'start' | 'end' | 'pan' | 'create') {
    event.preventDefault();
    event.stopPropagation();

    const target = event.target as HTMLElement;
    target.setPointerCapture(event.pointerId);

    this.isDragging.set(true);
    this.state.isMinimapInteracting.set(true);
    this.state.isContentManipulation.set(true);

    this.dragMode.set(mode);
    this.dragStartX = event.clientX;
    this.initialRange = {
      start: this.state.startYear(),
      end: this.state.endYear(),
    };

    if (mode === 'create') {
      this.isPotentialClick = true;
      this.dragAnchorYear = this.getYearFromEvent(event);
    } else {
      this.isPotentialClick = false;
    }
  }

  onPointerMove(event: PointerEvent) {
    this.hoverYear.set(this.getYearFromEvent(event));

    if (!this.isDragging()) return;

    event.preventDefault();
    event.stopPropagation();

    const { min, max } = this.mapBounds();
    const span = max - min;
    if (span <= 0) return;

    const mode = this.dragMode();
    if (mode === 'create') {
      this.handleCreation(event);
    } else {
      this.handleManipulation(event, span, mode);
    }
  }

  onPointerUp(event: PointerEvent) {
    if (this.isDragging()) {
      if (this.dragMode() === 'create' && this.isPotentialClick) {
        this.handleBackgroundClick(event);
      }

      this.isDragging.set(false);
      this.state.isMinimapInteracting.set(false);
      this.state.isContentManipulation.set(false);
      this.dragMode.set(null);
      this.isPotentialClick = false;

      const target = event.target as HTMLElement;
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
    }
  }

  onPointerLeave() {
    if (!this.isDragging()) {
      this.hoverYear.set(null);
    }
  }

  private handleCreation(event: PointerEvent) {
    if (this.isPotentialClick) {
      if (Math.abs(event.clientX - this.dragStartX) > this.CLICK_THRESHOLD) {
        this.isPotentialClick = false;
      } else {
        return;
      }
    }

    const currentYear = this.getYearFromEvent(event);
    const { min, max } = this.mapBounds();
    const s = Math.min(this.dragAnchorYear, currentYear);
    const e = Math.max(this.dragAnchorYear, currentYear);

    this.state.setRange(Math.max(min, s), Math.min(max, Math.max(s + 1, e)));
  }

  private handleManipulation(
    event: PointerEvent,
    span: number,
    mode: 'start' | 'end' | 'pan' | null,
  ) {
    const content = this.contentRef().nativeElement;
    const effectiveWidth = Math.max(1, content.getBoundingClientRect().width);
    const pxPerYear = effectiveWidth / span;
    const deltaYear = (event.clientX - this.dragStartX) / pxPerYear;
    const minGap = 1;

    let { start, end } = this.initialRange;

    if (mode === 'pan' || mode === 'start') start += deltaYear;
    if (mode === 'pan' || mode === 'end') end += deltaYear;

    if (mode === 'start') start = Math.min(start, end - minGap);
    if (mode === 'end') end = Math.max(end, start + minGap);

    this.state.setRange(start, end);
  }

  private handleBackgroundClick(event: PointerEvent) {
    const clickYear = this.getYearFromEvent(event);
    const halfSpan = (this.state.endYear() - this.state.startYear()) / 2;
    this.state.setRange(clickYear - halfSpan, clickYear + halfSpan);
  }

  private getYearFromEvent(event: PointerEvent): number {
    const rect = this.contentRef().nativeElement.getBoundingClientRect();
    const effectiveWidth = Math.max(1, rect.width);
    const ratio = (event.clientX - rect.left) / effectiveWidth;
    const { min, max } = this.mapBounds();
    return this.geometry.getValueFromRatio(ratio, min, max);
  }
}
