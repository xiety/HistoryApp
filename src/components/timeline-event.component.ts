import { Component, input, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineConfigService } from '../services/timeline-config.service';
import { RenderEvent, LegendItem } from '../services/timeline-layout.service';
import { RawEvent } from '../services/timeline-parser.service';
import { YearFormatPipe, formatYear } from '../pipes/year-format.pipe';

export type EventType = 'event' | 'legend';

@Component({
  selector: 'app-timeline-event',
  standalone: true,
  imports: [CommonModule, YearFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './timeline-event.component.html',
  styleUrls: ['./timeline-event.component.css']
})
export class TimelineEventComponent {
  private state = inject(TimelineStateService);
  config = inject(TimelineConfigService);

  data = input.required<RenderEvent | LegendItem>();
  type = input<EventType>('event');
  categoryId = input.required<number>();

  top = input.required<number>();
  height = input.required<number>();

  readonly raw = computed(() => this.data().raw);

  readonly isSelected = computed(() =>
    this.state.selectedGroupId() === this.raw().groupId
  );

  readonly isHovered = computed(() =>
    this.state.hoveredGroupId() === this.raw().groupId
  );

  readonly isDimmed = computed(() => {
    if (!this.state.searchQuery()) return false;
    if (this.state.isFilterMode()) return false;
    const matches = this.state.matchingEventIds();
    return matches ? !matches.has(this.raw().id) : false;
  });

  readonly isActive = computed(() => {
    const rawId = this.raw().id;
    const isExactHover = this.state.hoveredEventId() === rawId;
    const isExactSelection = this.state.selectedEventId() === rawId;

    if (this.state.isHoverDetailsSuppressed()) {
      return isExactSelection;
    }
    return isExactHover || isExactSelection;
  });

  readonly tooltip = computed(() => {
    const r = this.raw();
    const startStr = formatYear(r.start);
    const endStr = formatYear(r.end);
    return r.end === r.start
      ? `${r.name} (${startStr})`
      : `${r.name} (${startStr}-${endStr})`;
  });

  readonly relatedCategories = computed(() => {
    if (!this.state.showRelatedDots()) return [];
    const all = this.state.getGroupCategories(this.raw().groupId);
    if (all.length <= 1) return [];
    return all.filter(c => c.id !== this.categoryId());
  });

  readonly asRenderEvent = computed(() => {
    return this.type() === 'event' ? (this.data() as RenderEvent) : null;
  });

  readonly asLegendItem = computed(() => {
    return this.type() === 'legend' ? (this.data() as LegendItem) : null;
  });

  readonly isSingleYear = computed(() => this.raw().start === this.raw().end);

  readonly gradientStyle = computed(() => {
    if (this.isActive()) return null;
    const ev = this.asRenderEvent();
    if (!ev) return null;
    return `linear-gradient(to right, transparent ${ev.visualWidth}px, #fff ${ev.visualWidth}px)`;
  });

  readonly hasDotsOverflow = computed(() => {
    const ev = this.asRenderEvent();
    if (!ev) return false;
    const DOT_WIDTH = 8;
    return (this.relatedCategories().length * DOT_WIDTH) > ev.visualWidth;
  });

  onClick(event: MouseEvent) {
    event.stopPropagation();
    this.state.toggleEventSelection(this.raw());
  }

  onMouseEnter(event: MouseEvent) {
    this.state.isHoverDetailsSuppressed.set(event.ctrlKey || event.metaKey);
    this.state.setHoveredEvent(this.raw());
  }

  onMouseLeave() {
    this.state.setHoveredEvent(null);
  }

  isOutOfBounds(year: number, type: 'start' | 'end'): boolean {
    return type === 'start'
      ? year < this.state.startYear()
      : year > this.state.endYear();
  }
}
