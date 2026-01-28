import { Injectable, signal } from '@angular/core';

export type SidebarTab = 'editor' | 'toc';

@Injectable({
  providedIn: 'root'
})
export class TimelineUiStateService {
  readonly isSidebarOpen = signal<boolean>(false);
  readonly activeSidebarTab = signal<SidebarTab>('editor');

  toggleSidebar() {
    this.isSidebarOpen.update(v => !v);
  }

  setSidebarOpen(isOpen: boolean) {
    this.isSidebarOpen.set(isOpen);
  }

  setActiveTab(tab: SidebarTab) {
    this.activeSidebarTab.set(tab);
  }
}
