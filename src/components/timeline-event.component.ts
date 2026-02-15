import {
  Component,
  input,
  inject,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineConfigService } from '../services/timeline-config.service';
import { RenderEvent, LegendItem } from '../services/timeline-layout.service';
import { YearFormatPipe, formatYear } from '../pipes/year-format.pipe';
import { usePulseAnimation } from '../utils/pulse-animation';

export type EventType = 'event' | 'legend';

@Component({
  selector: 'app-timeline-event',
  standalone: true,
  imports: [CommonModule, YearFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './timeline-event.component.html',
  styleUrls: ['./timeline-event.component.css'],
})
export class TimelineEventComponent {
  private state = inject(TimelineStateService);
  config = inject(TimelineConfigService);

  data = input.required<RenderEvent | LegendItem>();
  type = input<EventType>('event');
  categoryId = input.required<number>();

  top = input.required<number>();
  height = input.required<number>();

  readonly ev = computed(() => this.data() as RenderEvent);
  readonly item = computed(() => this.data() as LegendItem);
  readonly raw = computed(() => this.data().raw);

  readonly isSelected = computed(
    () => this.state.selectedGroupId() === this.raw().groupId,
  );

  readonly isHovered = computed(
    () => this.state.hoveredGroupId() === this.raw().groupId,
  );

  readonly isDimmed = computed(() => {
    if (!this.state.searchQuery()) return false;
    if (this.state.isFilterMode()) return false;
    const matches = this.state.matchingEventIds();
    return matches ? !matches.has(this.raw().id) : false;
  });

  readonly isActive = computed(() => {
    const rawId = this.raw().id;
    const isExactSelection = this.state.selectedEventId() === rawId;
    if (this.state.isHoverDetailsSuppressed()) return isExactSelection;
    return isExactSelection || this.state.hoveredEventId() === rawId;
  });

  readonly isExactSelection = computed(
    () => this.state.selectedEventId() === this.raw().id,
  );

  readonly isOngoing = computed(() => this.raw().isOngoing);

  readonly animation = usePulseAnimation(this.state.selectionPulse, () =>
    this.isExactSelection(),
  );

  readonly showLegendId = computed(() => {
    const mode = this.ev().displayMode;
    return mode === 'legend-full' || mode === 'legend-overflow';
  });

  readonly isTextMasked = computed(() => {
    return this.ev().needsMask && !this.isActive();
  });

  readonly hasRelatedDots = computed(() => this.relatedCategories().length > 0);

  readonly isDotsOverflowing = computed(() => {
    const DOT_WIDTH = 8;
    return this.relatedCategories().length * DOT_WIDTH > this.ev().safeWidth;
  });

  readonly isDotsMasked = computed(() => {
    return this.isDotsOverflowing() && !this.isActive();
  });

  readonly isStartOutOfBounds = computed(
    () => this.raw().start < this.state.startYear(),
  );
  readonly isEndOutOfBounds = computed(
    () => this.raw().end > this.state.endYear(),
  );

  readonly relatedCategories = computed(() => {
    if (!this.state.showRelatedDots()) return [];
    const all = this.state.getGroupCategories(this.raw().groupId);
    return all.length > 1 ? all.filter((c) => c.id !== this.categoryId()) : [];
  });

  readonly tooltip = computed(() => {
    const r = this.raw();
    const startStr = formatYear(r.start);
    const endStr = r.isOngoing ? 'Present' : formatYear(r.end);
    return r.end === r.start && !r.isOngoing
      ? `${r.name} (${startStr})`
      : `${r.name} (${startStr}-${endStr})`;
  });

  readonly isSingleYear = computed(
    () => !this.raw().isOngoing && this.raw().start === this.raw().end,
  );

  readonly gradientStyle = computed(() => {
    if (this.isActive()) return null;
    const ev = this.ev();
    return this.type() === 'event'
      ? `linear-gradient(to right, transparent ${ev.visualWidth}px, #fff ${ev.visualWidth}px)`
      : null;
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
}
