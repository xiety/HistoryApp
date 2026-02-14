import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineConfigService } from '../services/timeline-config.service';
import { TimelineGeometryService } from '../services/timeline-geometry.service';
import { YearFormatPipe, formatYear } from '../pipes/year-format.pipe';

@Component({
  selector: 'app-timeline-ruler',
  imports: [CommonModule, YearFormatPipe],
  templateUrl: './timeline-ruler.component.html',
  styleUrls: ['./timeline-ruler.component.css'],
})
export class TimelineRulerComponent {
  state = inject(TimelineStateService);
  config = inject(TimelineConfigService);
  private geometry = inject(TimelineGeometryService);

  readonly hoveredYearLabel = computed(() => {
    if (this.state.hoveredYear() === null) return null;
    const year = this.state.hoveredYear();
    return formatYear(year);
  });

  readonly hoveredYearXPct = computed(() => {
    const year = this.state.hoveredYear();
    if (year === null) return null;

    const width = this.state.layoutWidth();
    const x = this.geometry.calculateXPosition(
      year,
      this.state.startYear(),
      this.state.endYear(),
      width,
    );

    if (x > width) return null;
    return (x / width) * 100;
  });

  readonly persistentMarkerLabel = computed(() => {
    if (this.state.persistentMarkerYear() === null) return null;
    const year = this.state.persistentMarkerYear();
    return formatYear(year);
  });

  readonly persistentMarkerXPct = computed(() => {
    const year = this.state.persistentMarkerYear();
    if (year === null) return null;

    const width = this.state.layoutWidth();
    const x = this.geometry.calculateXPosition(
      year,
      this.state.startYear(),
      this.state.endYear(),
      width,
    );

    if (x > width) return null;
    return (x / width) * 100;
  });

  onRulerClick(event: MouseEvent) {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    const clickX = event.clientX - rect.left;
    const totalWidth = rect.width;
    const padding = this.config.viewPaddingRight();
    const effectiveWidth = totalWidth - padding;

    if (clickX > effectiveWidth) return;

    const year = this.geometry.calculateYearFromX(
      clickX,
      this.state.startYear(),
      this.state.endYear(),
      effectiveWidth,
    );

    this.state.setPersistentMarker(year);
  }

  clearPersistentMarker(event: Event) {
    event.stopPropagation();
    this.state.setPersistentMarker(null);
  }
}
