import {
  Component,
  input,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineConfigService } from '../services/timeline-config.service';
import { TimelineStateService } from '../services/timeline-state.service';
import { CategoryLayout } from '../services/timeline-layout.service';
import { TimelineEventComponent } from './timeline-event.component';

@Component({
  selector: 'app-timeline-category',
  standalone: true,
  imports: [CommonModule, TimelineEventComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './timeline-category.component.html',
  styleUrls: ['./timeline-category.component.css'],
})
export class TimelineCategoryComponent {
  config = inject(TimelineConfigService);
  state = inject(TimelineStateService);

  layout = input.required<CategoryLayout>();

  getLegendBackgroundTop(subY: number, legendStartY: number): number {
    return subY + legendStartY - this.config.legendBlockPadding();
  }

  getEventTop(subY: number, row: number): number {
    return subY + row * this.config.rowTotalHeight();
  }

  getLegendItemTop(subY: number, legendStartY: number, row: number): number {
    return subY + legendStartY + row * this.config.legendRowHeight();
  }
}
