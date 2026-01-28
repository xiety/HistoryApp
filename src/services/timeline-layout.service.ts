import { Injectable, inject } from '@angular/core';
import { RawEvent } from './timeline-parser.service';
import { TimelineConfigService } from './timeline-config.service';

export interface RenderEvent {
  legendId: number;
  raw: RawEvent;
  x: number;
  width: number;
  visualWidth: number;
  row: number;
  displayMode: 'full' | 'overflow' | 'legend-full' | 'legend-overflow';
  clippedLeft: boolean;
  clippedRight: boolean;
  nameWidth: number;
}

export interface LegendItem {
  legendId: number;
  raw: RawEvent;
  x: number;
  width: number;
  row: number;
  text: string;
}

export interface SubcategoryLayout {
  id: number;
  name: string;
  rows: RenderEvent[][];
  rowCount: number;
  legendRows: LegendItem[][];
  height: number;
  legendStartY: number;
}

export interface CategoryLayout {
  id: number;
  name: string;
  color: string;
  subcategories: SubcategoryLayout[];
}

export interface GridLine {
  x: number;
  label: number;
}

interface LayoutCandidate {
  raw: RawEvent;
  x: number;
  width: number;
  visualWidth: number;
  clippedLeft: boolean;
  clippedRight: boolean;
  nameWidth: number;
}

@Injectable({
  providedIn: 'root'
})
export class TimelineLayoutService {
  private config = inject(TimelineConfigService);
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  private textWidthCache = new Map<string, number>();
  private lastFont = '';

  constructor() {
    this.initCanvas();
  }

  private initCanvas(): void {
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }
  }

  getSidePadding(): number {
    return this.config.sidePadding();
  }


  calculateXPosition(year: number, start: number, end: number, width: number): number {
    const span = end - start;
    if (span <= 0) return width / 2;

    const sidePadding = this.config.sidePadding();
    const effectiveWidth = Math.max(1, width - (2 * sidePadding));
    const pxPerYear = effectiveWidth / span;

    return sidePadding + ((year - start) * pxPerYear);
  }

  calculateYearFromX(x: number, start: number, end: number, width: number): number {
    const span = end - start;
    if (span <= 0 || width <= 0) return start;

    const sidePadding = this.config.sidePadding();
    const effectiveWidth = Math.max(1, width - (2 * sidePadding));
    const pxPerYear = effectiveWidth / span;

    return start + ((x - sidePadding) / pxPerYear);
  }

  generateGridLines(start: number, end: number, width: number, minPxGap: number = 60): GridLine[] {
    const span = end - start;
    if (span <= 0 || width <= 0) return [];

    const sidePadding = this.config.sidePadding();
    const effectiveWidth = Math.max(1, width - (2 * sidePadding));
    const pxPerYear = effectiveWidth / span;
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
    const firstTick = Math.floor(start / step) * step;
    const epsilon = 0.0001;

    for (let year = firstTick; year <= end + epsilon; year += step) {
      const x = sidePadding + ((year - start) * pxPerYear);
      if (x > -200 && x <= width + epsilon) {
        lines.push({ x, label: year });
      }
    }
    return lines;
  }


  computeLayout(
    events: RawEvent[],
    containerWidth: number,
    viewStartYear: number,
    viewEndYear: number
  ): Omit<SubcategoryLayout, 'id' | 'name'> {

    const candidates = this.generateCandidates(events, containerWidth, viewStartYear, viewEndYear);

    if (candidates.length === 0) {
      return { rows: [], rowCount: 0, legendRows: [], legendStartY: 0, height: 0 };
    }

    const { rows, legendCandidates } = this.distributeEvents(candidates);
    const legendRows = this.generateLegendLayout(legendCandidates, rows);

    const eventAreaHeight = rows.length * this.config.rowTotalHeight();
    const legendAreaHeight = legendRows.length * this.config.legendRowHeight();
    const padding = legendRows.length > 0 ? this.config.legendBlockPadding() : 0;
    const bottomPadding = legendRows.length > 0 ? this.config.legendBottomPadding() : 0;

    return {
      rows,
      rowCount: rows.length,
      legendRows,
      legendStartY: eventAreaHeight + padding,
      height: eventAreaHeight + padding + legendAreaHeight + bottomPadding
    };
  }

  private generateCandidates(
    events: RawEvent[],
    containerWidth: number,
    viewStart: number,
    viewEnd: number
  ): LayoutCandidate[] {
    const sidePadding = this.config.sidePadding();
    const effectiveWidth = Math.max(1, containerWidth - (2 * sidePadding));
    const span = Math.max(1, viewEnd - viewStart);
    const pixelsPerYear = effectiveWidth / span;
    const rightEdge = containerWidth;

    const candidates: LayoutCandidate[] = [];

    for (const raw of events) {
      let visualStart = raw.start;
      let visualEnd = raw.end;

      if (raw.start === raw.end) {
        visualEnd = raw.start + 1;
      } else {
        visualStart += 0.5;
        visualEnd += 0.5;
      }

      if (visualEnd < viewStart || visualStart > viewEnd) continue;

      const durationYears = Math.max(1, visualEnd - visualStart);
      const rawStartX = sidePadding + ((visualStart - viewStart) * pixelsPerYear);
      const rawEndX = rawStartX + (durationYears * pixelsPerYear);

      let x = Math.round(rawStartX);
      const endX = Math.round(rawEndX);

      let w = endX - x;
      if (w < 1) w = 1;

      let clippedLeft = false;
      let clippedRight = false;

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

      candidates.push({
        raw,
        x,
        width: w,
        visualWidth,
        clippedLeft,
        clippedRight,
        nameWidth: this.getTextWidth(raw.name)
      });
    }

    return candidates.sort((a, b) => {
      if (Math.abs(a.x - b.x) > 0.1) return a.x - b.x;
      if (a.raw.start !== b.raw.start) return a.raw.start - b.raw.start;
      return a.raw.name.localeCompare(b.raw.name);
    });
  }

  private distributeEvents(candidates: LayoutCandidate[]) {
    const rows: RenderEvent[][] = [];
    const legendCandidates: RenderEvent[] = [];

    const count = candidates.length;
    const digits = count > 0 ? String(count).length : 1;
    const templateString = "0".repeat(digits);
    const templateWidth = this.getTextWidth(templateString) + this.config.textPadding();
    const minEventGap = this.config.minEventGap();

    for (const candidate of candidates) {
      const event = this.createRenderEvent(candidate);
      let placed = false;

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const last = row[row.length - 1];

        if (event.x < last.x + last.width + minEventGap - 0.001) {
          continue;
        }

        const spaceToNextEvent = event.x - last.x;
        const textNeeded = last.nameWidth + this.config.textPadding();

        if (textNeeded <= spaceToNextEvent) {
          event.row = r;
          row.push(event);
          placed = true;
          break;
        }

        if (templateWidth <= spaceToNextEvent) {
          if (last.legendId === 0) {
            last.legendId = -1;
            legendCandidates.push(last);
          }

          last.displayMode = templateWidth <= last.visualWidth ? 'legend-full' : 'legend-overflow';

          event.row = r;
          row.push(event);
          placed = true;
          break;
        }
      }

      if (!placed) {
        event.row = rows.length;
        rows.push([event]);
      }
    }

    return { rows, legendCandidates };
  }

  private createRenderEvent(candidate: LayoutCandidate): RenderEvent {
    const neededForFull = candidate.nameWidth + this.config.textPadding();
    const initialMode = (neededForFull <= candidate.visualWidth) ? 'full' : 'overflow';

    return {
      legendId: 0,
      raw: candidate.raw,
      x: candidate.x,
      width: candidate.width,
      visualWidth: candidate.visualWidth,
      row: -1,
      displayMode: initialMode,
      clippedLeft: candidate.clippedLeft,
      clippedRight: candidate.clippedRight,
      nameWidth: candidate.nameWidth
    };
  }

  private generateLegendLayout(legendCandidates: RenderEvent[], rows: RenderEvent[][]): LegendItem[][] {
    legendCandidates.sort((a, b) => {
      if (Math.abs(a.x - b.x) > 0.1) return a.x - b.x;
      return a.row - b.row;
    });

    for (let i = 0; i < legendCandidates.length; i++) {
      legendCandidates[i].legendId = i + 1;
    }

    const items: LegendItem[] = [];
    for (const row of rows) {
      for (const ev of row) {
        if (ev.legendId > 0) {
          const text = `${ev.legendId} ${ev.raw.name}`;
          items.push({
            legendId: ev.legendId,
            raw: ev.raw,
            x: ev.x,
            width: this.getTextWidth(text),
            row: -1,
            text
          });
        }
      }
    }

    items.sort((a, b) => {
      if (Math.abs(a.x - b.x) > 0.1) return a.x - b.x;
      return a.legendId - b.legendId;
    });

    const legendRows: LegendItem[][] = [];
    const itemGap = this.config.legendItemGap();

    for (const item of items) {
      let placed = false;
      for (let r = 0; r < legendRows.length; r++) {
        const row = legendRows[r];
        const last = row[row.length - 1];

        if (!last || (item.x >= last.x + last.width + itemGap)) {
          item.row = r;
          row.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) {
        item.row = legendRows.length;
        legendRows.push([item]);
      }
    }

    return legendRows;
  }


  private getTextWidth(text: string): number {
    const currentFont = this.config.font();

    if (currentFont !== this.lastFont) {
      this.textWidthCache.clear();
      this.lastFont = currentFont;
    }

    if (this.textWidthCache.has(text)) {
      return this.textWidthCache.get(text)!;
    }

    if (!this.ctx) return 0;
    this.ctx.font = currentFont;
    const width = this.ctx.measureText(text).width;
    this.textWidthCache.set(text, width);
    return width;
  }
}
