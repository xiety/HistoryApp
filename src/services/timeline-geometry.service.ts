import { Injectable, inject } from '@angular/core';
import { TimelineConfigService } from './timeline-config.service';

export interface GridLine {
  x: number;
  xPct: number;
  label: number;
  isMajor: boolean;
}

export interface GeometryResult {
  x: number;
  width: number;
  visualWidth: number;
  clippedLeft: boolean;
  clippedRight: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TimelineGeometryService {
  private config = inject(TimelineConfigService);

  calculatePixelsPerYear(width: number, start: number, end: number): number {
    const span = end - start;
    if (span <= 0) return 0;
    const sidePadding = this.config.sidePadding();
    const effectiveWidth = Math.max(1, width - (2 * sidePadding));
    return effectiveWidth / span;
  }

  calculateXPosition(year: number, start: number, end: number, width: number): number {
    const pxPerYear = this.calculatePixelsPerYear(width, start, end);
    if (pxPerYear <= 0) return width / 2;
    const sidePadding = this.config.sidePadding();
    return sidePadding + ((year - start) * pxPerYear);
  }

  calculateYearFromX(x: number, start: number, end: number, width: number): number {
    const pxPerYear = this.calculatePixelsPerYear(width, start, end);
    if (pxPerYear <= 0) return start;
    const sidePadding = this.config.sidePadding();
    return start + ((x - sidePadding) / pxPerYear);
  }

  calculateEventGeometry(
    visualStart: number,
    visualEnd: number,
    viewStart: number,
    width: number,
    pixelsPerYear: number
  ): GeometryResult {
    const sidePadding = this.config.sidePadding();
    const durationYears = Math.max(1, visualEnd - visualStart);

    const rawStartX = sidePadding + ((visualStart - viewStart) * pixelsPerYear);
    const rawEndX = rawStartX + (durationYears * pixelsPerYear);

    let x = Math.round(rawStartX);
    const endX = Math.round(rawEndX);

    let w = endX - x;
    if (w < 1) w = 1;

    let clippedLeft = false;
    let clippedRight = false;
    const rightEdge = width;

    if (x < 0) {
      w -= (0 - x);
      x = 0;
      clippedLeft = true;
    }

    if (x + w > rightEdge) {
      w = rightEdge - x;
      clippedRight = true;
    }

    if (w < 1) w = 1;

    const visualWidth = clippedRight ? w : (w > 1 ? w - 1 : w);

    return { x, width: w, visualWidth, clippedLeft, clippedRight };
  }

  generateGridLines(start: number, end: number, width: number, minPxGap: number = 60): GridLine[] {
    const pxPerYear = this.calculatePixelsPerYear(width, start, end);
    if (pxPerYear <= 0) return [];

    const minYearGap = minPxGap / pxPerYear;
    const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

    let step = niceSteps[niceSteps.length - 1];
    for (const s of niceSteps) {
      if (s >= minYearGap) {
        step = s;
        break;
      }
    }
    if (minYearGap > step) {
      step = Math.ceil(minYearGap / 1000) * 1000;
    }

    const lines: GridLine[] = [];
    const inv = 1 / step;
    const firstTick = Math.floor(start * inv) / inv;
    const epsilon = 0.0001;
    const renderMargin = 200;

    for (let year = firstTick; year <= end + epsilon; year += step) {
      const x = this.calculateXPosition(year, start, end, width);
      if (x > -renderMargin && x <= width + epsilon) {
        lines.push({
          x,
          xPct: (x / width) * 100,
          label: year,
          isMajor: Math.abs(year % 100) < epsilon
        });
      }
    }
    return lines;
  }
}
