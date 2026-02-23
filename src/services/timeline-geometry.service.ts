import { Injectable, inject } from '@angular/core';
import { TimelineConfigService } from './timeline-config.service';

export interface GridLine {
  x: number;
  label: number;
  isMajor: boolean;
}

export interface GeometryResult {
  x: number;
  layoutWidth: number;
  visualWidth: number;
  clippedLeft: boolean;
  clippedRight: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class TimelineGeometryService {
  private readonly config = inject(TimelineConfigService);

  getRatio(value: number, min: number, max: number): number {
    const span = max - min;
    if (span <= 0) return 0;
    return (value - min) / span;
  }

  getValueFromRatio(ratio: number, min: number, max: number): number {
    return min + ratio * (max - min);
  }

  calculatePixelsPerYear(width: number, start: number, end: number): number {
    const span = end - start;
    if (span <= 0) return 0;
    const effectiveWidth = Math.max(1, width - 1);
    return effectiveWidth / span;
  }

  yearToPixel(year: number, start: number, end: number, width: number): number {
    const pxPerYear = this.calculatePixelsPerYear(width, start, end);
    if (pxPerYear <= 0) return width / 2;
    return (year - start) * pxPerYear;
  }

  pixelToYear(x: number, start: number, end: number, width: number): number {
    const pxPerYear = this.calculatePixelsPerYear(width, start, end);
    if (pxPerYear <= 0) return start;
    return start + x / pxPerYear;
  }

  yearToPercentage(
    year: number,
    start: number,
    end: number,
    width: number,
  ): number | null {
    const x = this.yearToPixel(year, start, end, width);
    if (x < -100 || x > width + 100) return null;
    return (x / width) * 100;
  }

  calculateEventGeometry(
    visualStart: number,
    visualEnd: number,
    viewStart: number,
    width: number,
    pixelsPerYear: number,
  ): GeometryResult {
    const durationYears = Math.max(1, visualEnd - visualStart);

    const rawStartX = (visualStart - viewStart) * pixelsPerYear;
    const rawEndX = rawStartX + durationYears * pixelsPerYear;

    let x = Math.round(rawStartX);
    const endX = Math.round(rawEndX);

    let w = endX - x;
    if (w < 1) w = 1;

    let clippedLeft = false;
    let clippedRight = false;

    if (x < 0) {
      w += x;
      x = 0;
      clippedLeft = true;
    }

    if (x + w > width) {
      w = width - x;
      clippedRight = true;
    }

    if (w < 1) w = 1;

    const visualWidth = w > 1 && !clippedRight ? w - 1 : w;

    return { x, layoutWidth: w, visualWidth, clippedLeft, clippedRight };
  }

  generateGridLines(
    start: number,
    end: number,
    width: number,
    minPxGap: number = 60,
  ): GridLine[] {
    const pxPerYear = this.calculatePixelsPerYear(width, start, end);
    if (pxPerYear <= 0) return [];

    const minYearGap = minPxGap / pxPerYear;
    const niceSteps = [
      1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000,
    ];

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
      const x = this.yearToPixel(year, start, end, width);

      if (x > -renderMargin && x <= width + renderMargin) {
        lines.push({
          x,
          label: year,
          isMajor: Math.abs(year % 100) < epsilon,
        });
      }
    }
    return lines;
  }
}
