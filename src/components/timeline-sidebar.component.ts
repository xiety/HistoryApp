import { Component, inject, computed, Type } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineEditorComponent } from './timeline-editor.component';
import { TimelineTocComponent } from './timeline-toc.component';
import { TimelineSetupComponent } from './timeline-setup.component';
import { TimelineStateService } from '../services/timeline-state.service';
import { IconComponent } from './icon.component';
import {
  TimelineUiStateService,
  SidebarTab,
} from '../services/timeline-ui-state.service';

interface TabDefinition {
  id: SidebarTab;
  label: string;
  component: Type<any>;
}

@Component({
  selector: 'app-timeline-sidebar',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './timeline-sidebar.component.html',
  styleUrls: ['./timeline-sidebar.component.css'],
})
export class TimelineSidebarComponent {
  state = inject(TimelineStateService);
  ui = inject(TimelineUiStateService);

  readonly tabs: TabDefinition[] = [
    { id: 'editor', label: 'Data', component: TimelineEditorComponent },
    { id: 'toc', label: 'TOC', component: TimelineTocComponent },
    { id: 'setup', label: 'Setup', component: TimelineSetupComponent },
  ];

  readonly activeComponent = computed(() => {
    const activeId = this.ui.activeSidebarTab();
    const tab = this.tabs.find((t) => t.id === activeId);
    return tab ? tab.component : TimelineEditorComponent;
  });
}
