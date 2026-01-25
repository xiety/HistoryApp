import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineConfigService } from '../services/timeline-config.service';
import { TimelineStateService } from '../services/timeline-state.service';

@Component({
  selector: 'app-timeline-view',
  imports: [CommonModule],
  templateUrl: './timeline-view.component.html',
  styleUrls: ['./timeline-view.component.css']
})
export class TimelineViewComponent {
  state = inject(TimelineStateService);
  config = inject(TimelineConfigService);

  selectedId = signal<string | null>(null);

  hoveredId = signal<number | null>(null);

  toggleSelection(uniqueKey: string, event: Event) {
    event.stopPropagation();
    if (this.selectedId() === uniqueKey) {
      this.selectedId.set(null);
    } else {
      this.selectedId.set(uniqueKey);
    }
  }

  clearSelection() {
    this.selectedId.set(null);
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
