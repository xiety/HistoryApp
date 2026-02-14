import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GridLine } from '../services/timeline-geometry.service';

@Component({
  selector: 'app-timeline-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './timeline-grid.component.html',
  styleUrls: ['./timeline-grid.component.css'],
})
export class TimelineGridComponent {
  lines = input.required<GridLine[]>();
}
