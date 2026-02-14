import {
  Component,
  inject,
  viewChild,
  ElementRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TimelineStateService,
  TocItem,
} from '../services/timeline-state.service';
import { TimelineUiStateService } from '../services/timeline-ui-state.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-timeline-toc',
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './timeline-toc.component.html',
  styleUrls: ['./timeline-toc.component.css'],
})
export class TimelineTocComponent {
  state = inject(TimelineStateService);
  ui = inject(TimelineUiStateService);

  readonly containerRef =
    viewChild.required<ElementRef<HTMLElement>>('tocContainer');

  constructor() {
    effect(() => {
      const activeId = this.state.activeCategoryId();
      if (activeId !== null) {
        this.scrollActiveIntoView(activeId);
      }
    });
  }

  handleItemClick(id: number) {
    if (!this.state.hiddenCategoryIds().has(id)) {
      this.state.requestScrollToCategory(id);

      this.ui.resetSidebarToDefault();
    } else {
      this.state.toggleCategoryVisibility(id);
    }
  }

  clearTocFilter() {
    this.state.setTocFilterQuery('');
  }

  getItemBorderColor(item: TocItem): string {
    return item.isVisibleVertically ? item.color : 'transparent';
  }

  private scrollActiveIntoView(id: number) {
    const container = this.containerRef().nativeElement;
    const item = container.querySelector(`li[data-id="${id}"]`);
    if (item) {
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}
