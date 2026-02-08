import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineLayoutService } from '../services/timeline-layout.service';
import { TimelineConfigService } from '../services/timeline-config.service';
import { YearFormatPipe, formatYear } from '../pipes/year-format.pipe';

@Component({
  selector: 'app-timeline-ruler',
  imports: [CommonModule, YearFormatPipe],
  templateUrl: './timeline-ruler.component.html',
  styleUrls: ['./timeline-ruler.component.css']
})
export class TimelineRulerComponent {
  state = inject(TimelineStateService);
  config = inject(TimelineConfigService);
  private layout = inject(TimelineLayoutService);

  readonly hoveredYearLabel = computed(() => {
    if (this.hoveredYearX() === null) return null;

    const year = this.state.hoveredYear();
    return formatYear(year);
  });

  readonly hoveredYearX = computed(() => {
    const year = this.state.hoveredYear();
    if (year === null) return null;

    const width = this.state.layoutWidth();
    const x = this.layout.calculateXPosition(
      year,
      this.state.startYear(),
      this.state.endYear(),
      width
    );

    if (x > width) return null;

    return x;
  });

  readonly persistentMarkerLabel = computed(() => {
    if (this.persistentMarkerX() === null) return null;

    const year = this.state.persistentMarkerYear();
    return formatYear(year);
  });

  readonly persistentMarkerX = computed(() => {
    const year = this.state.persistentMarkerYear();
    if (year === null) return null;

    const width = this.state.layoutWidth();
    const x = this.layout.calculateXPosition(
      year,
      this.state.startYear(),
      this.state.endYear(),
      width
    );

    if (x > width) return null;

    return x;
  });

  onRulerClick(event: MouseEvent) {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;

    const year = this.layout.calculateYearFromX(
      x,
      this.state.startYear(),
      this.state.endYear(),
      this.state.layoutWidth()
    );
    this.state.setPersistentMarker(year);
  }

  clearPersistentMarker(event: Event) {
    event.stopPropagation();
    this.state.setPersistentMarker(null);
  }

  getTransform(x: number | null): string {
    return x !== null ? `translateX(${x}px)` : '';
  }
}
