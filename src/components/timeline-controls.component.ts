import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineUiStateService } from '../services/timeline-ui-state.service';
import { TimelineConfigService } from '../services/timeline-config.service';
import { IconComponent } from './icon.component';
import { NumberInputComponent } from './number-input.component';

@Component({
  selector: 'app-timeline-controls',
  imports: [CommonModule, FormsModule, IconComponent, NumberInputComponent],
  templateUrl: './timeline-controls.component.html',
  styleUrls: ['./timeline-controls.component.css']
})
export class TimelineControlsComponent {
  state = inject(TimelineStateService);
  ui = inject(TimelineUiStateService);
  config = inject(TimelineConfigService);

  clearSearch() {
    this.state.searchQuery.set('');
  }
}
