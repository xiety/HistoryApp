import { Component, inject, output, effect, viewChild, ElementRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimelineStateService } from '../services/timeline-state.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-timeline-toc',
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './timeline-toc.component.html',
  styleUrls: ['./timeline-toc.component.css']
})
export class TimelineTocComponent {
  state = inject(TimelineStateService);

  scrollToCategory = output<number>();

  readonly containerRef = viewChild.required<ElementRef<HTMLElement>>('tocContainer');

  readonly allVisible = computed(() => this.state.hiddenCategoryIds().size === 0);
  readonly someVisible = computed(() => {
    const hiddenCount = this.state.hiddenCategoryIds().size;
    const totalCount = this.state.parsedData().categories.length;
    return hiddenCount > 0 && hiddenCount < totalCount;
  });

  constructor() {
    effect(() => {
      const activeId = this.state.activeCategoryId();
      if (activeId !== null) {
        this.scrollActiveIntoView(activeId);
      }
    });
  }

  toggleAll() {
    const shouldShow = !this.allVisible();
    this.state.toggleAllCategories(shouldShow);
  }

  toggleItem(id: number, event: Event) {
    event.stopPropagation();
    this.state.toggleCategoryVisibility(id);
  }

  handleItemClick(id: number) {
    if (!this.state.hiddenCategoryIds().has(id)) {
      this.scrollToCategory.emit(id);
    } else {
      this.state.toggleCategoryVisibility(id);
    }
  }

  private scrollActiveIntoView(id: number) {
    const container = this.containerRef().nativeElement;

    setTimeout(() => {
      const item = container.querySelector(`li[data-id="${id}"]`);
      if (item) {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 0);
  }
}
