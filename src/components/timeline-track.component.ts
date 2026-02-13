import { Component, input, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SubcategoryLayout, RenderEvent } from '../services/timeline-layout.service';
import { TimelineConfigService } from '../services/timeline-config.service';
import { TimelineStateService } from '../services/timeline-state.service';
import { RawEvent } from '../services/timeline-parser.service';
import { YearFormatPipe, formatYear } from '../pipes/year-format.pipe';

@Component({
  selector: 'app-timeline-track',
  standalone: true,
  imports: [CommonModule, YearFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './timeline-track.component.html',
  styleUrls: ['./timeline-track.component.css']
})
export class TimelineTrackComponent {
  trackData = input.required<SubcategoryLayout>();
  categoryId = input.required<number>();

  config = inject(TimelineConfigService);
  state = inject(TimelineStateService);


  getLegendBackgroundTop(): number {
    return this.trackData().legendStartY - this.config.legendBlockPadding();
  }

  getEventTop(row: number): number {
    return row * this.config.rowTotalHeight();
  }

  getLegendItemTop(row: number): number {
    return this.trackData().legendStartY + (row * this.config.legendRowHeight());
  }


  onEventClick(event: MouseEvent, raw: RawEvent) {
    event.stopPropagation();
    this.state.toggleEventSelection(raw);
  }

  onEventMouseEnter(event: MouseEvent, raw: RawEvent) {
    this.state.isHoverDetailsSuppressed.set(event.ctrlKey || event.metaKey);
    this.state.setHoveredEvent(raw);
  }

  onEventMouseLeave() {
    this.state.setHoveredEvent(null);
  }


  isSelected(raw: RawEvent): boolean {
    return this.state.selectedGroupId() === raw.groupId;
  }

  isHovered(raw: RawEvent): boolean {
    return this.state.hoveredGroupId() === raw.groupId;
  }

  shouldShowActive(raw: RawEvent): boolean {
    const isExactHover = this.state.hoveredEventId() === raw.id;
    const isExactSelection = this.state.selectedEventId() === raw.id;

    if (this.state.isHoverDetailsSuppressed()) {
      return isExactSelection;
    }
    return isExactHover || isExactSelection;
  }

  isDimmed(raw: RawEvent): boolean {
    if (!this.state.searchQuery()) return false;
    if (this.state.isFilterMode()) return false;
    return !this.state.matchingEventIds()?.has(raw.id);
  }


  getTooltipText(raw: RawEvent): string {
    const startStr = formatYear(raw.start);
    const endStr = formatYear(raw.end);
    return raw.end === raw.start
      ? `${raw.name} (${startStr})`
      : `${raw.name} (${startStr}-${endStr})`;
  }

  getRelatedCategories(raw: RawEvent) {
    const all = this.state.getGroupCategories(raw.groupId);
    if (all.length <= 1) return [];
    return all.filter(c => c.id !== this.categoryId());
  }

  isOutOfBounds(year: number, type: 'start' | 'end'): boolean {
    return type === 'start'
      ? year < this.state.startYear()
      : year > this.state.endYear();
  }

  isSingleYear(item: RenderEvent): boolean {
    return item.raw.start === item.raw.end;
  }

  isLegendFull(item: RenderEvent): boolean {
    return item.displayMode === 'legend-full';
  }

  hasLegendNumber(item: RenderEvent): boolean {
    return item.displayMode === 'legend-full' || item.displayMode === 'legend-overflow';
  }

  getEventGradientStyle(item: RenderEvent, isActive: boolean): string | null {
    if (isActive) return null;
    return `linear-gradient(to right, transparent ${item.visualWidth}px, #fff ${item.visualWidth}px)`;
  }

  hasDotsOverflow(item: RenderEvent, relatedCount: number): boolean {
    const DOT_WIDTH = 8;
    return (relatedCount * DOT_WIDTH) > item.visualWidth;
  }
}
