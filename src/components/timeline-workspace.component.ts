import { Component, inject, viewChild, ElementRef, computed, effect, afterRenderEffect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineLayoutService, CategoryLayout } from '../services/timeline-layout.service';
import { ScrollSyncService, LayoutAnchor } from '../services/scroll-sync.service';
import { TimelineConfigService } from '../services/timeline-config.service';
import { TimelineInteractionsDirective } from '../directives/timeline-interactions.directive';
import { TimelineRulerComponent } from './timeline-ruler.component';
import { TimelineViewComponent } from './timeline-view.component';

interface ActiveDragState {
  anchor: LayoutAnchor;
  startOffset: number;
  currentDeltaY: number;
}

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
  config = inject(TimelineConfigService);
  private scrollSync = inject(ScrollSyncService);

  readonly scrollContainer = viewChild.required<ElementRef<HTMLDivElement>>('scrollContainer');

  private renderedLayout: CategoryLayout[] = [];
  private lastSyncedLayout: CategoryLayout[] | null = null;

  private lockedAnchor: LayoutAnchor | null = null;

  private activeDrag: ActiveDragState | null = null;

  private isRestoring = false;

  readonly cursorGuideX = computed(() => this.getGuidePositionPct(this.state.hoveredYear()));
  readonly persistentGuideX = computed(() => this.getGuidePositionPct(this.state.persistentMarkerYear()));

  constructor() {
    this.state.scrollTo$
      .pipe(takeUntilDestroyed())
      .subscribe(id => this.scrollToCategoryId(id));

    effect((onCleanup) => {
      const el = this.scrollContainer().nativeElement;
      const observer = new ResizeObserver(() => {
        this.state.setContainerWidth(el.clientWidth);
        this.restoreScroll();
      });
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });

    afterRenderEffect(() => {
      const newLayout = this.state.processedLayout();
      if (newLayout !== this.lastSyncedLayout) {
        this.renderedLayout = newLayout;
        this.lastSyncedLayout = newLayout;
        this.restoreScroll();
      }
    });
  }

  setAnchorAtRelativeY(relY: number) {
    const container = this.scrollContainer().nativeElement;
    const absoluteY = container.scrollTop + relY;

    const rawAnchor = this.scrollSync.getAnchorAtY(this.renderedLayout, absoluteY);

    if (rawAnchor) {
      this.lockedAnchor = {
        ...rawAnchor,
        offset: rawAnchor.offset + relY,
        catOffset: rawAnchor.catOffset + relY
      };
    }
  }

  startDrag(relativePointerY: number) {
    const container = this.scrollContainer().nativeElement;
    const absoluteY = container.scrollTop + relativePointerY;

    const anchor = this.scrollSync.getAnchorAtY(this.renderedLayout, absoluteY);

    if (anchor) {
      this.activeDrag = {
        anchor,
        startOffset: anchor.offset + absoluteY - container.scrollTop,
        currentDeltaY: 0
      };
    } else {
      this.updateLockedAnchor();
      if (this.lockedAnchor) {
        this.activeDrag = {
          anchor: this.lockedAnchor,
          startOffset: this.lockedAnchor.offset,
          currentDeltaY: 0
        };
      }
    }
  }

  updateDrag(totalDeltaY: number) {
    if (!this.activeDrag) return;
    this.activeDrag.currentDeltaY = totalDeltaY;
    this.syncScrollToActiveDrag();
  }

  endDrag() {
    this.activeDrag = null;
    this.updateLockedAnchor();
  }

  saveScrollAnchor() {
    if (!this.activeDrag) {
      this.updateLockedAnchor();
    }
  }


  onScroll() {
    this.updateVisibleCategories();

    if (!this.isRestoring && !this.activeDrag) {
      this.updateLockedAnchor();
    }
  }

  private updateLockedAnchor() {
    const container = this.scrollContainer().nativeElement;
    if (container.scrollHeight === 0) return;

    const anchor = this.scrollSync.getAnchor(this.renderedLayout, container.scrollTop, container.clientHeight);
    if (anchor) {
      this.lockedAnchor = anchor;
    }
  }

  private restoreScroll() {
    this.isRestoring = true;

    if (this.activeDrag) {
      this.syncScrollToActiveDrag();
    } else if (this.lockedAnchor) {
      this.syncScrollToPassiveAnchor();
    }

    this.isRestoring = false;
    this.updateVisibleCategories();
  }

  private syncScrollToActiveDrag() {
    if (!this.activeDrag) return;

    const container = this.scrollContainer().nativeElement;

    const targetOffset = this.activeDrag.startOffset + this.activeDrag.currentDeltaY;


    const tempAnchor: LayoutAnchor = {
      ...this.activeDrag.anchor,
      offset: targetOffset,
      catOffset: targetOffset + (this.activeDrag.anchor.catOffset - this.activeDrag.anchor.offset)
    };

    const newTop = this.scrollSync.restoreScrollPosition(this.renderedLayout, tempAnchor);

    if (newTop !== null) {
      container.scrollTop = newTop;
    }
  }

  private syncScrollToPassiveAnchor() {
    if (!this.lockedAnchor) return;
    const container = this.scrollContainer().nativeElement;

    const newTop = this.scrollSync.restoreScrollPosition(this.renderedLayout, this.lockedAnchor);
    if (newTop !== null) {
      container.scrollTop = newTop;
    }
  }

  private updateVisibleCategories() {
    const container = this.scrollContainer().nativeElement;
    if (container.clientHeight === 0 || this.renderedLayout.length === 0) return;

    const boundsMap = this.scrollSync.getCategoryBounds(this.renderedLayout);
    const scrollTop = container.scrollTop;
    const viewBottom = scrollTop + container.clientHeight;

    const visibleIds = new Set<number>();
    let topCategoryId: number | null = null;
    let minDist = Infinity;

    for (const [id, bounds] of boundsMap) {
      if (bounds.bottom > scrollTop && bounds.top < viewBottom) {
        visibleIds.add(id);

        const dist = Math.abs(bounds.top - scrollTop);
        if (dist < minDist) {
          minDist = dist;
          topCategoryId = id;
        }
      }
    }

    if (!topCategoryId && visibleIds.values().next()) {
      topCategoryId = visibleIds.values().next().value || null;
    }

    this.state.setActiveCategory(topCategoryId);
    this.state.setVisibleCategoryIds(visibleIds);
  }

  private scrollToCategoryId(id: number) {
    const el = this.scrollContainer().nativeElement;
    const bounds = this.scrollSync.getCategoryBounds(this.renderedLayout).get(id);

    if (bounds) {
      this.isRestoring = true;
      el.scrollTop = bounds.top;
      this.updateLockedAnchor();
      this.isRestoring = false;
    }
  }

  private getGuidePositionPct(year: number | null): number | null {
    if (year === null) return null;
    const width = this.state.layoutWidth();
    const x = this.layout.calculateXPosition(year, this.state.startYear(), this.state.endYear(), width);
    return x <= width ? (x / width) * 100 : null;
  }
}
