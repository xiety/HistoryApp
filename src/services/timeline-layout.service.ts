import { Injectable, inject } from '@angular/core';
import { RawEvent } from './timeline-parser.service';
import { TimelineConfigService } from './timeline-config.service';
import { TextMeasurementService } from './text-measurement.service';
import { TimelineGeometryService } from './timeline-geometry.service';

export interface RenderEvent {
  legendId: number;
  raw: RawEvent;
  x: number;
  layoutWidth: number;
  visualWidth: number;
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
  layoutWidth: number;
  visualWidth: number;
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
  totalHeight: number;
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

interface LayoutCandidate {
  raw: RawEvent;
  x: number;
  layoutWidth: number;
  visualWidth: number;
  clippedLeft: boolean;
  clippedRight: boolean;
  nameWidth: number;
}

@Injectable({
  providedIn: 'root',
})
export class TimelineLayoutService {
  private readonly config = inject(TimelineConfigService);
  private readonly textMeasure = inject(TextMeasurementService);
  private readonly geometry = inject(TimelineGeometryService);

  computeLayout(
    events: RawEvent[],
    containerWidth: number,
    viewStartYear: number,
    viewEndYear: number,
    showLegends: boolean,
    compactMode: boolean,
  ): Omit<SubcategoryLayout, 'id' | 'name' | 'y' | 'totalHeight'> {
    const candidates = this.generateCandidates(
      events,
      containerWidth,
      viewStartYear,
      viewEndYear,
    );

    if (candidates.length === 0) {
      return {
        rows: [],
        rowCount: 0,
        legendRows: [],
        legendStartY: 0,
        height: 0,
      };
    }

    const { rows, legendCandidates } = this.packEventsToRows(
      candidates,
      containerWidth,
      showLegends,
      compactMode,
    );

    const legendRows = this.generateLegendLayout(
      legendCandidates,
      rows,
      showLegends,
      containerWidth,
    );

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

    for (const cat of categories) {
      cat.y = currentY;
      currentY += catHeaderH + catMargin;

      const subLen = cat.subcategories.length;
      for (let i = 0; i < subLen; i++) {
        const sub = cat.subcategories[i];
        sub.y = currentY;

        const startY = currentY;

        if (sub.name) {
          currentY += subHeaderH;
        }

        currentY += sub.height;
        const isLastSub = i === subLen - 1;
        const spacerH =
          subMargin +
          (!isLastSub && sub.legendRows.length === 0 ? subSeparator : 0);
        currentY += spacerH;

        sub.totalHeight = currentY - startY;
      }
      cat.height = currentY - cat.y;
    }
    return categories;
  }

  private generateCandidates(
    events: RawEvent[],
    containerWidth: number,
    viewStart: number,
    viewEnd: number,
  ): LayoutCandidate[] {
    const font = this.config.font();
    const pxPerYear = this.geometry.calculatePixelsPerYear(
      containerWidth,
      viewStart,
      viewEnd,
    );
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

      const geo = this.geometry.calculateEventGeometry(
        visualStart,
        visualEnd,
        viewStart,
        containerWidth,
        pxPerYear,
      );

      candidates.push({
        raw,
        x: geo.x,
        layoutWidth: geo.layoutWidth,
        visualWidth: geo.visualWidth,
        clippedLeft: geo.clippedLeft,
        clippedRight: geo.clippedRight,
        nameWidth: this.textMeasure.getTextWidth(raw.name, font),
      });
    }

    return candidates;
  }

  private packEventsToRows(
    candidates: LayoutCandidate[],
    containerWidth: number,
    showLegends: boolean,
    compactMode: boolean,
  ) {
    const rows: RenderEvent[][] = [];
    const legendCandidates: RenderEvent[] = [];
    const minEventGap = this.config.minEventGap();
    const templateWidth = this.calculateLegendTemplateWidth(candidates.length);

    for (const candidate of candidates) {
      const event = this.createRenderEvent(candidate);
      let placed = false;

      for (let r = 0; r < rows.length; r++) {
        if (
          this.canPlaceInRow(
            event,
            rows[r],
            minEventGap,
            templateWidth,
            legendCandidates,
            showLegends,
            compactMode,
          )
        ) {
          event.row = r;
          placed = true;
          break;
        }
      }

      if (!placed) {
        event.row = rows.length;
        if (!showLegends) event.displayMode = 'full';
        rows.push([event]);
      }
    }

    const viewPaddingRight = this.config.viewPaddingRight();
    for (const row of rows) {
      if (row.length > 0) {
        const last = row[row.length - 1];
        last.safeWidth = Math.max(
          0,
          containerWidth - last.x + viewPaddingRight,
        );
      }
    }

    return { rows, legendCandidates };
  }

  private canPlaceInRow(
    event: RenderEvent,
    row: RenderEvent[],
    minGap: number,
    templateWidth: number,
    legendCandidates: RenderEvent[],
    showLegends: boolean,
    compactMode: boolean,
  ): boolean {
    const last = row[row.length - 1];

    if (event.x < last.x + last.layoutWidth + minGap - 0.001) {
      return false;
    }

    const spaceToNextEvent = event.x - last.x;
    last.safeWidth = spaceToNextEvent - minGap;

    const textNeeded = last.nameWidth + this.config.textPadding();
    const textFits = textNeeded <= spaceToNextEvent;

    if (compactMode) {
      if (!textFits && showLegends) {
        if (last.legendId === 0) {
          last.legendId = -1;
          legendCandidates.push(last);
        }
        last.displayMode =
          templateWidth <= last.visualWidth ? 'legend-full' : 'legend-overflow';
      }
      row.push(event);
      return true;
    }

    if (textFits) {
      row.push(event);
      return true;
    }

    if (showLegends) {
      const legendFits = templateWidth <= spaceToNextEvent;
      if (legendFits) {
        if (last.legendId === 0) {
          last.legendId = -1;
          legendCandidates.push(last);
        }
        last.displayMode =
          templateWidth <= last.visualWidth ? 'legend-full' : 'legend-overflow';
        row.push(event);
        return true;
      }
    }

    return false;
  }

  private calculateLegendTemplateWidth(count: number): number {
    const digits = count > 0 ? String(count).length : 1;
    const templateString = '0'.repeat(digits);
    return (
      this.textMeasure.getTextWidth(templateString, this.config.font()) +
      this.config.textPadding()
    );
  }

  private createRenderEvent(candidate: LayoutCandidate): RenderEvent {
    const neededForFull = candidate.nameWidth + this.config.textPadding();
    const initialMode =
      neededForFull <= candidate.visualWidth ? 'full' : 'overflow';

    return {
      legendId: 0,
      raw: candidate.raw,
      x: candidate.x,
      layoutWidth: candidate.layoutWidth,
      visualWidth: candidate.visualWidth,
      row: -1,
      displayMode: initialMode,
      clippedLeft: candidate.clippedLeft,
      clippedRight: candidate.clippedRight,
      nameWidth: candidate.nameWidth,
      safeWidth: candidate.visualWidth,
      contentWidth: 0,
      needsMask: false,
      hasRightBorder: true,
    };
  }

  private generateLegendLayout(
    legendCandidates: RenderEvent[],
    rows: RenderEvent[][],
    showLegends: boolean,
    containerWidth: number,
  ): LegendItem[][] {
    if (!showLegends || legendCandidates.length === 0) return [];

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
          const w = this.textMeasure.getTextWidth(text, this.config.font());
          items.push({
            legendId: ev.legendId,
            raw: ev.raw,
            x: ev.x,
            layoutWidth: w,
            visualWidth: w,
            row: -1,
            text,
          });
        }
      }
    }

    items.sort((a, b) => a.legendId - b.legendId);

    const legendRows: LegendItem[][] = [];
    const itemGap = this.config.legendItemGap();

    for (const item of items) {
      let placed = false;
      for (let r = 0; r < legendRows.length; r++) {
        const row = legendRows[r];
        const last = row[row.length - 1];
        if (!last || item.x >= last.x + last.layoutWidth + itemGap) {
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
          contentWidth +=
            this.textMeasure.getTextWidth(idStr, this.config.font()) +
            legendGap;
        }
        contentWidth += event.nameWidth;
        event.contentWidth = contentWidth;
        event.needsMask = contentWidth > event.safeWidth;

        const textOverflowsBar = contentWidth > event.visualWidth + 1;
        const hasFreeSpace = event.safeWidth - event.visualWidth > 2;
        event.hasRightBorder = !(
          event.clippedRight ||
          (textOverflowsBar && hasFreeSpace) ||
          event.raw.isOngoing
        );
      }
    }
  }

  private calculateLayoutMetrics(
    rows: RenderEvent[][],
    legendRows: LegendItem[][],
  ) {
    const eventAreaHeight = rows.length * this.config.rowTotalHeight();
    const legendAreaHeight = legendRows.length * this.config.legendRowHeight();
    const padding =
      legendRows.length > 0 ? this.config.legendBlockPadding() : 0;
    const bottomPadding =
      legendRows.length > 0 ? this.config.legendBottomPadding() : 0;

    return {
      rows,
      rowCount: rows.length,
      legendRows,
      legendStartY: eventAreaHeight + padding,
      height: eventAreaHeight + padding + legendAreaHeight + bottomPadding,
    };
  }
}
