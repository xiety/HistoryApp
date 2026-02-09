import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineConfigService } from '../services/timeline-config.service';
import { NumberInputComponent } from './number-input.component';
import { SettingToggleComponent } from './setting-toggle.component';

@Component({
  selector: 'app-timeline-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, NumberInputComponent, SettingToggleComponent],
  templateUrl: './timeline-setup.component.html',
  styleUrls: ['./timeline-setup.component.css']
})
export class TimelineSetupComponent {
  state = inject(TimelineStateService);
  config = inject(TimelineConfigService);
}
