import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimelineStateService } from '../services/timeline-state.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-timeline-editor',
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './timeline-editor.component.html',
  styleUrls: ['./timeline-editor.component.css']
})
export class TimelineEditorComponent {
  state = inject(TimelineStateService);
}
