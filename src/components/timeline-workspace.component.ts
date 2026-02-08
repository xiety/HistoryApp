import { Component, inject, viewChild, ElementRef, computed, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineLayoutService } from '../services/timeline-layout.service';
import { ScrollSyncService } from '../services/scroll-sync.service';
import { TimelineInteractionsDirective } from '../directives/timeline-interactions.directive';
import { TimelineRulerComponent } from './timeline-ruler.component';
import { TimelineViewComponent } from './timeline-view.component';

@Component({
  selector: 'app-timeline-workspace',
  imports: [
    CommonModule,
    TimelineRulerComponent,
    TimelineViewComponent,
    TimelineInteractionsDirective
  ],
  templateUrl: './timeline-workspace.component.html',
  styleUrls: ['./timeline-workspace.component.css']
})
export class TimelineWorkspaceComponent {
  state = inject(TimelineStateService);
  layout = inject(TimelineLayoutService);
  private scrollSync = inject(ScrollSyncService);

  readonly scrollContainer = viewChild.required<ElementRef<HTMLDivElement>>('scrollContainer');

  readonly cursorGuideX = computed(() => {
    const year = this.state.hoveredYear();
    if (year === null) return null;
    return this.getGuidePosition(year);
  });

  readonly persistentGuideX = computed(() => {
    const year = this.state.persistentMarkerYear();
    if (year === null) return null;
    return this.getGuidePosition(year);
  });

  constructor() {
    this.state.scrollTo$
      .pipe(takeUntilDestroyed())
      .subscribe(id => this.scrollToCategory(id));

    effect(() => {
      this.state.processedLayout();
      this.updateVisibility();
    });

    effect((onCleanup) => {
      this.updateVisibility();

      const observer = new ResizeObserver(() => {
        this.updateVisibility();
      });
      observer.observe(this.scrollContainer().nativeElement);

      onCleanup(() => observer.disconnect());
    });
  }

  private getGuidePosition(year: number): number | null {
    const x = this.layout.calculateXPosition(
      year,
      this.state.startYear(),
      this.state.endYear(),
      this.state.layoutWidth()
    );
    return x > this.state.layoutWidth() ? null : x;
  }

  getGuideTransform(x: number | null): string {
    return x !== null ? `translateX(${x}px)` : '';
  }

  private scrollToCategory(id: number) {
    const el = this.scrollContainer().nativeElement;
    const bounds = this.scrollSync.getCategoryBounds(this.state.processedLayout());
    const target = bounds.get(id);

    if (target) {
      el.scrollTo({
        top: target.top,
        behavior: 'auto'
      });
    }
  }

  onScroll() {
    this.updateVisibility();
  }

  private updateVisibility() {
    const container = this.scrollContainer().nativeElement;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;

    if (clientHeight === 0) return;

    const boundsMap = this.scrollSync.getCategoryBounds(this.state.processedLayout());

    let bestTopId: number | null = null;
    let minDiff: number | null = null;
    const buffer = 50;
    const visibleIds = new Set<number>();

    for (const [id, bounds] of boundsMap) {
      const isVisible = (bounds.bottom > scrollTop) && (bounds.top < scrollTop + clientHeight);

      if (isVisible) {
        visibleIds.add(id);

        const relativeTop = bounds.top - scrollTop;
        const isHeaderAtTop = relativeTop <= buffer && bounds.bottom > scrollTop + buffer;

        if (isHeaderAtTop) {
          bestTopId = id;
          minDiff = 0;
        }
        else if (relativeTop > buffer) {
          if (minDiff === null || (minDiff !== 0 && relativeTop < minDiff)) {
            minDiff = relativeTop;
            bestTopId = id;
          }
        }
      }
    }

    if (bestTopId === null && visibleIds.size > 0) {
      let maxTop = -Infinity;
      for (const id of visibleIds) {
        const bounds = boundsMap.get(id);
        if (bounds && bounds.top <= scrollTop + buffer) {
          if (bounds.top > maxTop) {
            maxTop = bounds.top;
            bestTopId = id;
          }
        }
      }
    }

    if (bestTopId === null && visibleIds.size > 0) {
      bestTopId = visibleIds.values().next().value ?? null;
    }

    this.state.setActiveCategory(bestTopId);
    this.state.setVisibleCategoryIds(visibleIds);
  }
}
