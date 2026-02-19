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

  readonly hoveredYearX = computed(() => {
    const year = this.state.hoveredYear();
    if (year === null) return null;
    const start = this.state.startYear();
    const end = this.state.endYear();
    if (year < start || year > end) return null;

    return this.geometry.yearToPixel(
      year,
      start,
      end,
      this.state.layoutWidth(),
    );
  });

  readonly persistentMarkerLabel = computed(() => {
    if (this.state.persistentMarkerYear() === null) return null;
    const year = this.state.persistentMarkerYear();
    return formatYear(year);
  });

  readonly persistentMarkerX = computed(() => {
    const year = this.state.persistentMarkerYear();
    if (year === null) return null;
    const start = this.state.startYear();
    const end = this.state.endYear();
    if (year < start || year > end) return null;

    return this.geometry.yearToPixel(
      year,
      start,
      end,
      this.state.layoutWidth(),
    );
  });

  onRulerClick(event: MouseEvent) {
    event.stopPropagation();
    if (this.state.isContentManipulation()) {
      return;
    }

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const layoutWidth = this.state.layoutWidth();

    if (clickX >= 0 && clickX <= layoutWidth) {
      const year = this.geometry.pixelToYear(
        clickX,
        this.state.startYear(),
        this.state.endYear(),
        layoutWidth,
      );
      this.state.setPersistentMarker(year);
    }
  }

  clearPersistentMarker(event: MouseEvent) {
    event.stopPropagation();
    this.state.setPersistentMarker(null);
  }
}
