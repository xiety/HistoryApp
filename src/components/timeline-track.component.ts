import { Component, input, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { SubcategoryLayout, RenderEvent } from '../services/timeline-layout.service';
import { TimelineConfigService } from '../services/timeline-config.service';
import { TimelineStateService } from '../services/timeline-state.service';
import { YearFormatPipe, formatYear } from '../pipes/year-format.pipe';
import { RawEvent, CategoryInfo } from '../services/timeline-parser.service';

@Component({
  selector: 'app-timeline-track',
  standalone: true,
  imports: [CommonModule, NgTemplateOutlet, YearFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './timeline-track.component.html',
  styleUrls: ['./timeline-track.component.css']
})
export class TimelineTrackComponent {
  trackData = input.required<SubcategoryLayout>();
  categoryId = input.required<number>();

  config = inject(TimelineConfigService);
  state = inject(TimelineStateService);

  toggleSelection(raw: RawEvent, event: Event) {
    event.stopPropagation();
    this.state.toggleEventSelection(raw);
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

  getRelatedCategories(groupId: number): CategoryInfo[] {
    const all = this.state.getGroupCategories(groupId);
    if (all.length <= 1) return [];
    return all.filter(c => c.id !== this.categoryId());
  }

  getTooltipText(raw: RawEvent): string {
    const startStr = formatYear(raw.start);
    const endStr = formatYear(raw.end);
    return raw.end === raw.start
      ? `${raw.name} (${startStr})`
      : `${raw.name} (${startStr}-${endStr})`;
  }

  getLegendBackgroundTop(): number {
    return this.trackData().legendStartY - this.config.legendBlockPadding();
  }

  getEventTop(row: number): number {
    return row * this.config.rowTotalHeight();
  }

  getLegendItemTop(row: number): number {
    return this.trackData().legendStartY + (row * this.config.legendRowHeight());
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

  isSingleYear(event: RenderEvent): boolean {
    return event.raw.start === event.raw.end;
  }

  hasLegend(event: RenderEvent): boolean {
    return event.displayMode === 'legend-full' || event.displayMode === 'legend-overflow';
  }

  isOutOfBounds(year: number, type: 'start' | 'end'): boolean {
    if (type === 'start') {
      return year < this.state.startYear();
    }
    return year > this.state.endYear();
  }
}
