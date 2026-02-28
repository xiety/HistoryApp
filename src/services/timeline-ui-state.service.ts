import { Injectable, signal, inject } from '@angular/core';
import { TimelineStateService } from './timeline-state.service';

export type SidebarTab = 'editor' | 'toc' | 'setup';
export type SidebarMode = 'auto' | 'visible' | 'hidden';

@Injectable({
  providedIn: 'root',
})
export class TimelineUiStateService {
  private state = inject(TimelineStateService);

  readonly sidebarMode = signal<SidebarMode>('auto');
  readonly activeSidebarTab = signal<SidebarTab>('editor');
  readonly isErrorPanelExpanded = signal<boolean>(true);

  showSidebar() {
    const currentWidth = this.state.containerWidth();
    this.state.setContainerWidth(Math.max(10, currentWidth - 300));
    this.sidebarMode.set('visible');
  }

  hideSidebar() {
    const currentWidth = this.state.containerWidth();
    this.state.setContainerWidth(currentWidth + 300);
    this.sidebarMode.set('hidden');
  }

  resetSidebarToDefault() {
    this.sidebarMode.set('auto');
  }

  setActiveTab(tab: SidebarTab) {
    this.activeSidebarTab.set(tab);
  }
}
