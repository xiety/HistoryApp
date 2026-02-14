import { Injectable, signal } from '@angular/core';

export type SidebarTab = 'editor' | 'toc' | 'setup';
export type SidebarMode = 'auto' | 'visible' | 'hidden';

@Injectable({
  providedIn: 'root',
})
export class TimelineUiStateService {
  readonly sidebarMode = signal<SidebarMode>('auto');
  readonly activeSidebarTab = signal<SidebarTab>('editor');

  showSidebar() {
    this.sidebarMode.set('visible');
  }

  hideSidebar() {
    this.sidebarMode.set('hidden');
  }

  resetSidebarToDefault() {
    this.sidebarMode.set('auto');
  }

  setActiveTab(tab: SidebarTab) {
    this.activeSidebarTab.set(tab);
  }
}
