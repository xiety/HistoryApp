import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineConfigService } from '../services/timeline-config.service';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineGridComponent } from './timeline-grid.component';
import { TimelineTrackComponent } from './timeline-track.component';

@Component({
  selector: 'app-timeline-view',
  standalone: true,
  imports: [CommonModule, TimelineGridComponent, TimelineTrackComponent],
  templateUrl: './timeline-view.component.html',
  styleUrls: ['./timeline-view.component.css']
})
export class TimelineViewComponent {
  state = inject(TimelineStateService);
  config = inject(TimelineConfigService);

  clearSelection() {
    this.state.clearEventSelection();
  }
}
