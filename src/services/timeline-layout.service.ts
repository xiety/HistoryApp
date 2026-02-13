import { Injectable, inject } from '@angular/core';
import { RawEvent } from './timeline-parser.service';
import { TimelineConfigService } from './timeline-config.service';

export interface RenderEvent {
  legendId: number;
  raw: RawEvent;
  x: number;
  width: number;
  visualWidth: number;

  xPct: number;
  widthPct: number;

  row: number;
  displayMode: 'full' | 'overflow' | 'legend-full' | 'legend-overflow';
  clippedLeft: boolean;
  clippedRight: boolean;
  nameWidth: number;
  safeWidth: number;
  contentWidth: number;
  needsMask: boolean;
  hasRightBorder: boolean;
}

export interface LegendItem {
  legendId: number;
  raw: RawEvent;
  x: number;
  width: number;

  xPct: number;
  widthPct: number;

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

  y: number;
}

export interface CategoryLayout {
  id: number;
  name: string;
  color: string;
  subcategories: SubcategoryLayout[];

  y: number;
  height: number;
}

export interface GridLine {
  x: number;
  xPct: number;
  label: number;
  isMajor: boolean;
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

interface GeometryResult {
  x: number;
  width: number;
  visualWidth: number;
  clippedLeft: boolean;
  clippedRight: boolean;
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
    const inv = 1 / step;
    const firstTick = Math.floor(start * inv) / inv;

    const renderMargin = 200;
    const epsilon = 0.0001;

    for (let year = firstTick; year <= end + epsilon; year += step) {
      const x = sidePadding + ((year - start) * pxPerYear);
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

  computeLayout(
    events: RawEvent[],
    containerWidth: number,
    viewStartYear: number,
    viewEndYear: number,
    showLegends: boolean,
    compactMode: boolean
  ): Omit<SubcategoryLayout, 'id' | 'name' | 'y'> {

    const candidates = this.generateCandidates(events, containerWidth, viewStartYear, viewEndYear);

    if (candidates.length === 0) {
      return this.createEmptyLayout();
    }

    const { rows, legendCandidates } = this.distributeEvents(candidates, containerWidth, showLegends, compactMode);

    const legendRows = this.generateLegendLayout(legendCandidates, rows, showLegends, containerWidth);

    this.postProcessVisuals(rows);

    return this.calculateLayoutMetrics(rows, legendRows);
  }

  computeVerticalPositions(categories: CategoryLayout[]): CategoryLayout[] {
    let currentY = 0;

    const catHeaderH = this.config.categoryHeaderHeight();
    const catMargin = this.config.categoryHeaderMarginBottom();
    const subHeaderH = this.config.subcategoryHeaderHeight();
    const subMargin = this.config.subcategoryMarginBottom();
    const subSeparator = this.config.subcategorySeparatorHeight();
    const rowH = this.config.rowTotalHeight();
    const legendRowH = this.config.legendRowHeight();
    const legendPadding = this.config.legendBlockPadding();
    const legendBottom = this.config.legendBottomPadding();

    for (const cat of categories) {
      cat.y = currentY;
      currentY += (catHeaderH + catMargin);

      const subLen = cat.subcategories.length;
      for (let i = 0; i < subLen; i++) {
        const sub = cat.subcategories[i];
        sub.y = currentY;

        if (sub.name) {
          currentY += subHeaderH;
        }

        currentY += sub.height;

        const isLastSub = i === subLen - 1;
        const spacerH = subMargin + ((!isLastSub && sub.legendRows.length === 0) ? subSeparator : 0);
        currentY += spacerH;
      }

      cat.height = currentY - cat.y;
    }

    return categories;
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

      const geo = this.calculateCandidateGeometry(
        visualStart,
        visualEnd,
        viewStart,
        pixelsPerYear,
        sidePadding,
        rightEdge
      );

      candidates.push({
        raw,
        x: geo.x,
        width: geo.width,
        visualWidth: geo.visualWidth,
        clippedLeft: geo.clippedLeft,
        clippedRight: geo.clippedRight,
        nameWidth: this.getTextWidth(raw.name)
      });
    }

    return candidates.sort((a, b) => {
      if (Math.abs(a.x - b.x) > 0.1) return a.x - b.x;
      if (a.raw.start !== b.raw.start) return a.raw.start - b.raw.start;
      return a.raw.name.localeCompare(b.raw.name);
    });
  }

  private calculateCandidateGeometry(
    visualStart: number,
    visualEnd: number,
    viewStart: number,
    pixelsPerYear: number,
    sidePadding: number,
    rightEdge: number
  ): GeometryResult {
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

    return { x, width: w, visualWidth, clippedLeft, clippedRight };
  }

  private distributeEvents(candidates: LayoutCandidate[], containerWidth: number, showLegends: boolean, compactMode: boolean) {
    const rows: RenderEvent[][] = [];
    const legendCandidates: RenderEvent[] = [];
    const minEventGap = this.config.minEventGap();

    const templateWidth = this.calculateLegendTemplateWidth(candidates.length);

    for (const candidate of candidates) {
      const event = this.createRenderEvent(candidate, containerWidth);
      let placed = false;

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (this.tryPlaceInRow(event, row, minEventGap, templateWidth, legendCandidates, showLegends, compactMode)) {
          event.row = r;
          placed = true;
          break;
        }
      }

      if (!placed) {
        event.row = rows.length;
        if (!showLegends) {
          event.displayMode = 'full';
        }
        rows.push([event]);
      }
    }

    this.finalizeRowSafeWidths(rows, containerWidth);

    return { rows, legendCandidates };
  }

  private calculateLegendTemplateWidth(count: number): number {
    const digits = count > 0 ? String(count).length : 1;
    const templateString = "0".repeat(digits);
    return this.getTextWidth(templateString) + this.config.textPadding();
  }

  private tryPlaceInRow(
    event: RenderEvent,
    row: RenderEvent[],
    minGap: number,
    templateWidth: number,
    legendCandidates: RenderEvent[],
    showLegends: boolean,
    compactMode: boolean
  ): boolean {
    const last = row[row.length - 1];
    const textPadding = this.config.textPadding();

    if (event.x < last.x + last.width + minGap - 0.001) {
      return false;
    }

    const spaceToNextEvent = event.x - last.x;
    last.safeWidth = spaceToNextEvent - minGap;

    const textNeeded = last.nameWidth + textPadding;
    const textFits = textNeeded <= spaceToNextEvent;

    if (!compactMode) {
      if (textFits) {
        row.push(event);
        return true;
      }

      if (showLegends) {
        const legendNeeded = templateWidth;
        const legendFits = legendNeeded <= spaceToNextEvent;

        if (legendFits) {
          if (last.legendId === 0) {
            last.legendId = -1;
            legendCandidates.push(last);
          }
          last.displayMode = templateWidth <= last.visualWidth ? 'legend-full' : 'legend-overflow';
          row.push(event);
          return true;
        }
      }
      return false;
    }

    if (textFits) {
      row.push(event);
      return true;
    }

    if (showLegends) {
      if (last.legendId === 0) {
        last.legendId = -1;
        legendCandidates.push(last);
      }
      last.displayMode = templateWidth <= last.visualWidth ? 'legend-full' : 'legend-overflow';
    }

    row.push(event);
    return true;
  }

  private finalizeRowSafeWidths(rows: RenderEvent[][], containerWidth: number) {
    const sidePadding = this.config.sidePadding();
    const viewPaddingRight = this.config.viewPaddingRight();

    for (const row of rows) {
      if (row.length > 0) {
        const last = row[row.length - 1];
        last.safeWidth = (containerWidth - last.x - sidePadding) + viewPaddingRight;
      }
    }
  }

  private createRenderEvent(candidate: LayoutCandidate, containerWidth: number): RenderEvent {
    const neededForFull = candidate.nameWidth + this.config.textPadding();
    const initialMode = (neededForFull <= candidate.visualWidth) ? 'full' : 'overflow';

    return {
      legendId: 0,
      raw: candidate.raw,
      x: candidate.x,
      width: candidate.width,
      visualWidth: candidate.visualWidth,

      xPct: (candidate.x / containerWidth) * 100,
      widthPct: (candidate.visualWidth / containerWidth) * 100,

      row: -1,
      displayMode: initialMode,
      clippedLeft: candidate.clippedLeft,
      clippedRight: candidate.clippedRight,
      nameWidth: candidate.nameWidth,
      safeWidth: candidate.visualWidth,
      contentWidth: 0,
      needsMask: false,
      hasRightBorder: true
    };
  }

  private generateLegendLayout(legendCandidates: RenderEvent[], rows: RenderEvent[][], showLegends: boolean, containerWidth: number): LegendItem[][] {
    if (!showLegends || legendCandidates.length === 0) {
      return [];
    }

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
          const w = this.getTextWidth(text);
          items.push({
            legendId: ev.legendId,
            raw: ev.raw,
            x: ev.x,
            width: w,
            xPct: (ev.x / containerWidth) * 100,
            widthPct: (w / containerWidth) * 100,
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

  private postProcessVisuals(rows: RenderEvent[][]) {
    const fontSize = this.config.baseFontSize();
    const paddingLeft = 0.4 * fontSize;
    const legendGap = 0.3 * fontSize;

    for (const row of rows) {
      for (const event of row) {
        let contentWidth = paddingLeft;

        if (event.legendId > 0) {
          const idStr = String(event.legendId);
          const idWidth = this.getTextWidth(idStr);
          contentWidth += idWidth + legendGap;
        }

        contentWidth += event.nameWidth;
        event.contentWidth = contentWidth;

        event.needsMask = contentWidth > (event.safeWidth + 1);

        const textOverflowsBar = contentWidth > (event.visualWidth + 1);
        const hasFreeSpace = (event.safeWidth - event.visualWidth) > 2;

        if (event.clippedRight || (textOverflowsBar && hasFreeSpace)) {
          event.hasRightBorder = false;
        } else {
          event.hasRightBorder = true;
        }
      }
    }
  }

  private calculateLayoutMetrics(rows: RenderEvent[][], legendRows: LegendItem[][]) {
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

  private createEmptyLayout() {
    return { rows: [], rowCount: 0, legendRows: [], legendStartY: 0, height: 0 };
  }

  private initCanvas(): void {
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }
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
