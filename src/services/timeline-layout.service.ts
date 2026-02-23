import { Injectable, inject, computed } from '@angular/core';
import { RawEvent } from './timeline-parser.service';
import { TimelineConfigService } from './timeline-config.service';
import { TextMeasurementService } from './text-measurement.service';
import { TimelineGeometryService } from './timeline-geometry.service';
import { TimelineStateService } from './timeline-state.service';

export interface RenderEvent {
  legendId: number;
  raw: RawEvent;
  x: number;
  layoutWidth: number;
  visualWidth: number;
  row: number;
  clippedLeft: boolean;
  clippedRight: boolean;
  nameWidth: number;
  displayText: string;
  safeWidth: number;
  contentWidth: number;
  displayMode: 'full' | 'full-partial' | 'overflow' | 'overflow-partial';
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
  stablePacking?: Map<number, number>;
}

export interface CategoryLayout {
  id: number;
  name: string;
  color: string;
  subcategories: SubcategoryLayout[];
  y: number;
  height: number;
  virtualPaddingTop?: number;
}

interface LayoutCandidate {
  raw: RawEvent;
  x: number;
  layoutWidth: number;
  visualWidth: number;
  clippedLeft: boolean;
  clippedRight: boolean;
  nameWidth: number;
  contentWidth: number;
}

@Injectable({
  providedIn: 'root',
})
export class TimelineLayoutService {
  private readonly config = inject(TimelineConfigService);
  private readonly textMeasure = inject(TextMeasurementService);
  private readonly geometry = inject(TimelineGeometryService);
  private readonly state = inject(TimelineStateService);

  readonly fullLayout = computed<CategoryLayout[]>(() => {
    const data = this.state.renderableData();
    const width = this.state.layoutWidth();
    const start = this.state.startYear();
    const end = this.state.endYear();
    const showLegends = this.state.showLegends();
    const compactMode = this.state.compactMode();

    const rawCategories = data.categories.flatMap((cat) => {
      const sublayouts: SubcategoryLayout[] = [];

      for (const sub of cat.subcategories) {
        const res = this.computeLayout(
          sub.events,
          width,
          start,
          end,
          showLegends,
          compactMode,
        );

        if (res.rowCount > 0) {
          sublayouts.push({
            id: sub.id,
            name: sub.name,
            y: 0,
            totalHeight: 0,
            ...res,
          });
        }
      }

      if (sublayouts.length > 0) {
        return [
          {
            id: cat.id,
            name: cat.name,
            color: cat.color,
            subcategories: sublayouts,
            y: 0,
            height: 0,
          },
        ];
      }
      return [];
    });

    return this.computeVerticalPositions(rawCategories);
  });

  readonly virtualLayoutInfo = computed(() => {
    const allCategories = this.fullLayout();
    const scrollTop = this.state.scrollTop();
    const viewportHeight = this.state.viewportHeight();
    const buffer = 500;

    return this.computeVirtualLayout(
      allCategories,
      scrollTop,
      viewportHeight,
      buffer,
    );
  });

  readonly processedLayout = computed(() => this.virtualLayoutInfo().items);
  readonly topSpacerHeight = computed(() => this.virtualLayoutInfo().topSpacer);
  readonly bottomSpacerHeight = computed(
    () => this.virtualLayoutInfo().bottomSpacer,
  );

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
    );

    this.postProcessVisuals(rows);

    return this.calculateLayoutMetrics(rows, legendRows);
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
    const textPadding = this.config.textPadding();

    for (const candidate of candidates) {
      const event = this.createRenderEvent(candidate);
      let placed = false;

      for (let r = 0; r < rows.length; r++) {
        const canPlace = this.canPlaceInRow(
          event,
          rows[r],
          minEventGap,
          templateWidth,
          legendCandidates,
          showLegends,
          compactMode,
        );

        if (canPlace) {
          event.row = r;
          placed = true;
          break;
        }
      }

      if (!placed) {
        event.row = rows.length;
        rows.push([event]);
      }
    }

    const viewPaddingRight = this.config.viewPaddingRight();
    for (const row of rows) {
      for (let i = 0; i < row.length; i++) {
        const event = row[i];
        const nextEvent = row[i + 1];

        if (nextEvent) {
          event.safeWidth = nextEvent.x - event.x - minEventGap;
        } else {
          event.safeWidth = Math.max(
            0,
            containerWidth - event.x + viewPaddingRight,
          );
        }

        if (showLegends && event.contentWidth > event.safeWidth) {
          this.markAsLegend(event, legendCandidates, templateWidth);
        }
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

    const requiredWidth = compactMode ? last.visualWidth : last.layoutWidth;
    const boxGap = compactMode ? minGap : 0;

    if (event.x < last.x + requiredWidth + boxGap - 1e-6) {
      return false;
    }

    const spaceToNextEvent = event.x - last.x;
    const safeWidth = spaceToNextEvent - minGap;

    if (compactMode) {
      row.push(event);
      return true;
    }

    if (last.contentWidth <= safeWidth) {
      row.push(event);
      return true;
    }

    if (showLegends) {
      const requiredSpace = Math.max(last.visualWidth, templateWidth);
      if (requiredSpace <= safeWidth) {
        this.markAsLegend(last, legendCandidates, templateWidth);
        row.push(event);
        return true;
      }
    }

    return false;
  }

  private markAsLegend(
    event: RenderEvent,
    legendCandidates: RenderEvent[],
    templateWidth: number,
  ) {
    if (event.legendId === 0) {
      event.legendId = -1;
      legendCandidates.push(event);
    }
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

  computeVirtualLayout(
    allCategories: CategoryLayout[],
    scrollTop: number,
    viewportHeight: number,
    buffer: number,
  ): {
    items: CategoryLayout[];
    topSpacer: number;
    bottomSpacer: number;
  } {
    const visibleTop = scrollTop - buffer;
    const visibleBottom = scrollTop + viewportHeight + buffer;

    const items: CategoryLayout[] = [];
    let topSpacer = 0;
    let bottomSpacer = 0;

    if (allCategories.length === 0) {
      return { items, topSpacer, bottomSpacer };
    }

    let startIndex = 0;
    for (let i = 0; i < allCategories.length; i++) {
      const cat = allCategories[i];
      if (cat.y + cat.height >= visibleTop) {
        startIndex = i;
        break;
      }
      topSpacer += cat.height;
    }

    if (startIndex === allCategories.length && allCategories.length > 0) {
      return { items: [], topSpacer, bottomSpacer: 0 };
    }

    if (startIndex < allCategories.length) {
      topSpacer = allCategories[startIndex].y;
    }

    for (let i = startIndex; i < allCategories.length; i++) {
      const cat = allCategories[i];

      if (cat.y > visibleBottom) {
        const lastCat = allCategories[allCategories.length - 1];
        bottomSpacer = lastCat.y + lastCat.height - cat.y;
        break;
      }

      const visibleSubs: SubcategoryLayout[] = [];
      let firstSubY = -1;

      for (const sub of cat.subcategories) {
        const subTop = sub.y;
        const subBottom = sub.y + sub.totalHeight;

        if (subBottom < visibleTop || subTop > visibleBottom) {
          continue;
        }

        if (firstSubY === -1) firstSubY = sub.y;
        visibleSubs.push(sub);
      }

      if (visibleSubs.length > 0) {
        const headerOffset =
          this.config.categoryHeaderHeight() +
          this.config.categoryHeaderMarginBottom();
        const expectedFirstSubY = cat.y + headerOffset;

        let virtualPaddingTop = 0;
        if (firstSubY > expectedFirstSubY) {
          virtualPaddingTop = firstSubY - expectedFirstSubY;
        }

        items.push({
          ...cat,
          subcategories: visibleSubs,
          virtualPaddingTop,
        });
      } else {
        if (cat.subcategories.length === 0) {
          items.push(cat);
        } else {
          items.push({ ...cat, subcategories: [] });
        }
      }
    }

    return { items, topSpacer, bottomSpacer };
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

      if (visualEnd < viewStart || visualStart >= viewEnd) continue;

      const geo = this.geometry.calculateEventGeometry(
        visualStart,
        visualEnd,
        viewStart,
        containerWidth,
        pxPerYear,
      );

      const nameWidth = this.textMeasure.getTextWidth(raw.name, font);
      const contentWidth = nameWidth + this.config.textPadding() * 2;

      candidates.push({
        raw,
        x: geo.x,
        layoutWidth: geo.layoutWidth,
        visualWidth: geo.visualWidth,
        clippedLeft: geo.clippedLeft,
        clippedRight: geo.clippedRight,
        nameWidth: nameWidth,
        contentWidth: contentWidth,
      });
    }

    return candidates;
  }

  private calculateLegendItemWidth(idWidth: number, nameWidth: number): number {
    return (
      idWidth +
      this.config.baseFontSize() * 0.25 +
      nameWidth +
      this.config.textPadding() * 2
    );
  }

  private calculateLegendTemplateWidth(count: number): number {
    const digits = count > 0 ? String(count).length : 1;
    const templateString = '0'.repeat(digits);
    const idWidth = this.textMeasure.getTextWidth(
      templateString,
      this.config.font(),
    );
    return this.calculateLegendItemWidth(idWidth, 0);
  }

  private createRenderEvent(candidate: LayoutCandidate): RenderEvent {
    return {
      legendId: 0,
      raw: candidate.raw,
      x: candidate.x,
      layoutWidth: candidate.layoutWidth,
      visualWidth: candidate.visualWidth,
      row: -1,
      clippedLeft: candidate.clippedLeft,
      clippedRight: candidate.clippedRight,
      nameWidth: candidate.nameWidth,
      displayText: candidate.raw.name,
      safeWidth: candidate.visualWidth,
      contentWidth: candidate.contentWidth,
      displayMode: 'full',
    };
  }

  private generateLegendLayout(
    legendCandidates: RenderEvent[],
    rows: RenderEvent[][],
    showLegends: boolean,
  ): LegendItem[][] {
    if (!showLegends || legendCandidates.length === 0) return [];

    legendCandidates.sort((a, b) => {
      if (Math.abs(a.x - b.x) > 0.1) return a.x - b.x;
      return a.row - b.row;
    });

    for (let i = 0; i < legendCandidates.length; i++) {
      legendCandidates[i].legendId = i + 1;
      const legendIdWidth = this.textMeasure.getTextWidth(
        legendCandidates[i].legendId.toString(),
        this.config.font(),
      );
      legendCandidates[i].contentWidth = this.calculateLegendItemWidth(
        legendIdWidth,
        legendCandidates[i].nameWidth,
      );
    }

    const items: LegendItem[] = [];
    for (const row of rows) {
      for (const ev of row) {
        if (ev.legendId > 0) {
          items.push({
            legendId: ev.legendId,
            raw: ev.raw,
            x: ev.x,
            layoutWidth: ev.contentWidth,
            visualWidth: ev.contentWidth,
            row: -1,
            text: `${ev.legendId} ${ev.raw.name}`,
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
    for (const row of rows) {
      for (const event of row) {
        if (event.contentWidth <= event.safeWidth) {
          if (event.contentWidth <= event.visualWidth) {
            event.displayMode = 'full';
          } else {
            event.displayMode = 'overflow';
          }
        } else {
          if (event.safeWidth <= event.visualWidth) {
            event.displayMode = 'full-partial';
          } else {
            event.displayMode = 'overflow-partial';
          }
        }
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
