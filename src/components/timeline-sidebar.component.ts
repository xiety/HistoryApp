import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineEditorComponent } from './timeline-editor.component';
import { TimelineTocComponent } from './timeline-toc.component';
import { TimelineStateService } from '../services/timeline-state.service';

type SidebarTab = 'editor' | 'toc';

@Component({
  selector: 'app-timeline-sidebar',
  imports: [CommonModule, TimelineEditorComponent, TimelineTocComponent],
  templateUrl: './timeline-sidebar.component.html',
  styleUrls: ['./timeline-sidebar.component.css']
})
export class TimelineSidebarComponent {
  state = inject(TimelineStateService);

  activeTab = signal<SidebarTab>('editor');

  onScrollToCategory(id: number) {
    this.state.requestScrollToCategory(id);
  }
}
