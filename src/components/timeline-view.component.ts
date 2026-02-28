import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineConfigService } from '../services/timeline-config.service';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineLayoutService } from '../services/timeline-layout.service';
import { TimelineGridComponent } from './timeline-grid.component';
import { TimelineCategoryComponent } from './timeline-category.component';

@Component({
  selector: 'app-timeline-view',
  standalone: true,
  imports: [CommonModule, TimelineGridComponent, TimelineCategoryComponent],
  templateUrl: './timeline-view.component.html',
  styleUrls: ['./timeline-view.component.css'],
})
export class TimelineViewComponent {
  state = inject(TimelineStateService);
  config = inject(TimelineConfigService);
  layout = inject(TimelineLayoutService);

  clearSelection(event?: Event) {
    if (this.state.isContentManipulation()) {
      return;
    }

    if (event) {
      const target = event.target as HTMLElement;
      if (target?.closest && target.closest('.timeline-event')) {
        return;
      }
    }

    this.state.clearEventSelection();
  }
}
