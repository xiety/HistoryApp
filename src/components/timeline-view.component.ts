import { Component, inject } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { TimelineConfigService } from '../services/timeline-config.service';
import { TimelineStateService } from '../services/timeline-state.service';
import { YearFormatPipe, formatYear } from '../pipes/year-format.pipe';
import { RawEvent } from '../services/timeline-parser.service';
import { RenderEvent, SubcategoryLayout } from '../services/timeline-layout.service';

@Component({
  selector: 'app-timeline-view',
  imports: [CommonModule, NgTemplateOutlet, YearFormatPipe],
  templateUrl: './timeline-view.component.html',
  styleUrls: ['./timeline-view.component.css']
})
export class TimelineViewComponent {
  state = inject(TimelineStateService);
  config = inject(TimelineConfigService);

  toggleSelection(raw: RawEvent, event: Event) {
    event.stopPropagation();
    this.state.toggleEventSelection(raw);
  }

  clearSelection() {
    this.state.clearEventSelection();
  }

  setHovered(raw: RawEvent) {
    this.state.setHoveredEvent(raw);
  }

  clearHovered() {
    this.state.setHoveredEvent(null);
  }

  isDimmed(eventId: number): boolean {
    if (!this.state.searchQuery()) return false;
    if (this.state.isFilterMode()) return false;
    return !this.state.matchingEventIds()?.has(eventId);
  }

  getTooltipText(raw: RawEvent): string {
    const startStr = formatYear(raw.start);
    const endStr = raw.end !== raw.start ? ` - ${formatYear(raw.end)}` : '';
    return `${raw.name} (${startStr}${endStr})`;
  }

  getLegendBackgroundTop(sub: SubcategoryLayout): number {
    return sub.legendStartY - this.config.legendBlockPadding();
  }

  getEventTop(row: number): number {
    return row * this.config.rowTotalHeight();
  }

  getLegendItemTop(sub: SubcategoryLayout, row: number): number {
    return sub.legendStartY + (row * this.config.legendRowHeight());
  }

  getRightBorderX(): number {
    return this.state.layoutWidth() - 1;
  }

  isInstanceActive(id: number): boolean {
    return this.state.hoveredEventId() === id || this.state.selectedEventId() === id;
  }

  isGroupActive(groupId: number): boolean {
    return this.state.hoveredGroupId() === groupId || this.state.selectedGroupId() === groupId;
  }

  isLegendFull(event: RenderEvent): boolean {
    return event.displayMode === 'legend-full';
  }

  isLegendOverflow(event: RenderEvent): boolean {
    return event.displayMode === 'legend-overflow';
  }

  isSingleYear(event: RenderEvent): boolean {
    return event.raw.start === event.raw.end;
  }

  isRightBorderHidden(event: RenderEvent): boolean {
    return event.clippedRight ||
      event.displayMode === 'overflow' ||
      this.isLegendOverflow(event);
  }

  isOverflowLabel(event: RenderEvent): boolean {
    return event.displayMode === 'overflow' || this.isLegendOverflow(event);
  }

  hasLegend(event: RenderEvent): boolean {
    return event.displayMode === 'legend-full' || event.displayMode === 'legend-overflow';
  }

  shouldShowName(event: RenderEvent): boolean {
    return event.displayMode !== 'legend-overflow';
  }

  isOutOfBounds(year: number, type: 'start' | 'end'): boolean {
    if (type === 'start') {
      return year < this.state.startYear();
    }
    return year > this.state.endYear();
  }
}
