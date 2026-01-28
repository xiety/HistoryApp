import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineConfigService } from '../services/timeline-config.service';
import { TimelineStateService } from '../services/timeline-state.service';
import { YearFormatPipe } from '../pipes/year-format.pipe';

@Component({
  selector: 'app-timeline-view',
  imports: [CommonModule, YearFormatPipe],
  templateUrl: './timeline-view.component.html',
  styleUrls: ['./timeline-view.component.css']
})
export class TimelineViewComponent {
  state = inject(TimelineStateService);
  config = inject(TimelineConfigService);

  selectedEventId = signal<number | null>(null);
  hoveredId = signal<number | null>(null);

  toggleSelection(eventId: number, event: Event) {
    event.stopPropagation();
    if (this.selectedEventId() === eventId) {
      this.selectedEventId.set(null);
    } else {
      this.selectedEventId.set(eventId);
    }
  }

  clearSelection() {
    this.selectedEventId.set(null);
  }

  setHovered(rawId: number) {
    this.hoveredId.set(rawId);
  }

  clearHovered() {
    this.hoveredId.set(null);
  }

  isDimmed(eventId: number): boolean {
    if (!this.state.searchQuery()) return false;

    if (this.state.isFilterMode()) return false;

    return !this.state.matchingEventIds()?.has(eventId);
  }
}
