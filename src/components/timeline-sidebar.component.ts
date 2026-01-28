import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineEditorComponent } from './timeline-editor.component';
import { TimelineTocComponent } from './timeline-toc.component';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineUiStateService } from '../services/timeline-ui-state.service';

@Component({
  selector: 'app-timeline-sidebar',
  imports: [CommonModule, TimelineEditorComponent, TimelineTocComponent],
  templateUrl: './timeline-sidebar.component.html',
  styleUrls: ['./timeline-sidebar.component.css']
})
export class TimelineSidebarComponent {
  state = inject(TimelineStateService);
  ui = inject(TimelineUiStateService);

  onScrollToCategory(id: number) {
    this.state.requestScrollToCategory(id);
    this.ui.setSidebarOpen(false);
  }
}
