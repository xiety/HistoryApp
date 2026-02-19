import {
  Component,
  inject,
  viewChild,
  ElementRef,
  computed,
  effect,
  afterRenderEffect,
  afterNextRender,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { TimelineStateService } from '../services/timeline-state.service';
import {
  TimelineLayoutService,
  CategoryLayout,
} from '../services/timeline-layout.service';
import {
  ScrollSyncService,
  LayoutAnchor,
} from '../services/scroll-sync.service';
import { TimelineConfigService } from '../services/timeline-config.service';
import { TimelineGeometryService } from '../services/timeline-geometry.service';
import { TimelineInteractionsDirective } from '../directives/timeline-interactions.directive';
import { TimelineRulerComponent } from './timeline-ruler.component';
import { TimelineViewComponent } from './timeline-view.component';

interface ScrollSession {
  primaryAnchor: LayoutAnchor;
  primaryViewportOffset: number;
  fallbackAnchor: LayoutAnchor | null;
  fallbackViewportOffset: number;
  currentDeltaY: number;
  pointerRelativeY: number;
}

@Component({
  selector: 'app-timeline-workspace',
  imports: [
    CommonModule,
    TimelineRulerComponent,
    TimelineViewComponent,
    TimelineInteractionsDirective,
  ],
  templateUrl: './timeline-workspace.component.html',
  styleUrls: ['./timeline-workspace.component.css'],
})
export class TimelineWorkspaceComponent {
  state = inject(TimelineStateService);
  layout = inject(TimelineLayoutService);
  config = inject(TimelineConfigService);
  private scrollSync = inject(ScrollSyncService);
  private geometry = inject(TimelineGeometryService);

  readonly scrollContainer =
    viewChild.required<ElementRef<HTMLDivElement>>('scrollArea');
  readonly rulerContainer =
    viewChild.required<ElementRef<HTMLDivElement>>('rulerContainer');

  private renderedLayout: CategoryLayout[] = [];
  private lastSyncedLayout: CategoryLayout[] | null = null;

  private lockedAnchor: LayoutAnchor | null = null;
  private lockedRelativeY: number = 0;

  private passiveAnchor: LayoutAnchor | null = null;
  private activeSession: ScrollSession | null = null;

  private isRestoring = false;
  private ignoreScrollFrame = false;

  readonly cursorGuideX = computed(() =>
    this.getGuidePositionPx(this.state.hoveredYear()),
  );
  readonly persistentGuideX = computed(() =>
    this.getGuidePositionPx(this.state.persistentMarkerYear()),
  );

  constructor() {
    this.state.scrollTo$
      .pipe(takeUntilDestroyed())
      .subscribe((id) => this.scrollToCategoryId(id));

    effect((onCleanup) => {
      const el = this.scrollContainer().nativeElement;
      let lastWidth = -1;

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const w = Math.round(entry.contentRect.width);
          if (w !== lastWidth) {
            lastWidth = w;
            this.state.setContainerWidth(w);
            this.state.viewportHeight.set(el.clientHeight);
            this.restoreScroll();
          }
        }
      });
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });

    effect(() => {
      const isInteracting = this.state.isMinimapInteracting();

      if (isInteracting && !this.activeSession) {
        const container = this.scrollContainer().nativeElement;
        const freshAnchor = this.scrollSync.getAnchor(
          this.renderedLayout,
          container.scrollTop,
          container.clientHeight,
        );

        if (freshAnchor) {
          const targetAbsY = this.scrollSync.getTargetY(
            this.renderedLayout,
            freshAnchor,
          );
          if (targetAbsY !== null) {
            this.activeSession = {
              primaryAnchor: freshAnchor,
              primaryViewportOffset: targetAbsY - container.scrollTop,
              fallbackAnchor: null,
              fallbackViewportOffset: 0,
              currentDeltaY: 0,
              pointerRelativeY: 0,
            };
          }
        }
      } else if (!isInteracting && this.activeSession) {
        this.activeSession = null;
        this.state.anchoredSubcategoryId.set(null);
      }
    });

    effect(() => {
      if (!this.state.isContentManipulation()) {
        this.state.anchoredSubcategoryId.set(null);
      }
    });

    afterRenderEffect(() => {
      const newLayout = this.layout.fullLayout();
      const pendingEventId = this.state.pendingScrollToEventId();

      const isFirstRun = this.lastSyncedLayout === null;
      let layoutChanged = newLayout !== this.lastSyncedLayout;

      if (layoutChanged) {
        this.renderedLayout = newLayout;
        this.lastSyncedLayout = newLayout;
      }

      if (pendingEventId !== null) {
        this.scrollToEvent(pendingEventId);
        this.state.pendingScrollToEventId.set(null);
        this.handleScrollUpdate();
      } else if (layoutChanged) {
        if (!isFirstRun) {
          if (!this.isRestoring) {
            this.restoreScroll();
          }
        } else {
          this.handleScrollUpdate();
        }
      }
    });

    afterNextRender(() => {
      this.updatePassiveAnchor();
    });
  }

  setAnchorAtMouse(relX: number, relY: number) {
    this.activeSession = null;
    const container = this.scrollContainer().nativeElement;

    let anchor = this.scrollSync.getAnchor(
      this.renderedLayout,
      container.scrollTop + relY,
      0,
    );
    if (!anchor) {
      if (!this.passiveAnchor) this.updatePassiveAnchor();
      anchor = this.passiveAnchor;
    }

    if (anchor) {
      this.lockedAnchor = anchor;
      this.lockedRelativeY = relY;

      if (this.state.isContentManipulation()) {
        this.state.anchoredSubcategoryId.set(anchor.subId);
      }
    }
  }

  startDrag(relativePointerY: number) {
    const container = this.scrollContainer().nativeElement;

    let anchor = this.scrollSync.getAnchor(
      this.renderedLayout,
      container.scrollTop + relativePointerY,
      0,
    );
    if (!anchor) {
      if (!this.passiveAnchor) this.updatePassiveAnchor();
      anchor = this.passiveAnchor;
    }

    if (anchor) {
      const targetAbsY = this.scrollSync.getTargetY(
        this.renderedLayout,
        anchor,
      );
      const viewportOffset =
        targetAbsY !== null ? targetAbsY - container.scrollTop : 0;

      this.activeSession = {
        primaryAnchor: anchor,
        primaryViewportOffset: viewportOffset,
        fallbackAnchor: null,
        fallbackViewportOffset: 0,
        currentDeltaY: 0,
        pointerRelativeY: relativePointerY,
      };

      this.state.setActiveCategory(anchor.catId);
      this.state.anchoredSubcategoryId.set(anchor.subId);
    }
  }

  updateDrag(totalDeltaY: number) {
    if (!this.activeSession) return;
    this.activeSession.currentDeltaY = totalDeltaY;

    const targetTop = this.calculateTargetScrollTop();
    if (targetTop !== null) {
      this.applyScroll(targetTop);
    }
  }

  endDrag() {
    this.activeSession = null;
    this.state.anchoredSubcategoryId.set(null);
    this.updatePassiveAnchor();

    this.lockedAnchor = this.passiveAnchor;
    this.lockedRelativeY = 0;

    this.onScroll();
  }

  onScroll() {
    if (this.ignoreScrollFrame) return;
    this.handleScrollUpdate();
  }

  private handleScrollUpdate() {
    const container = this.scrollContainer().nativeElement;
    this.rulerContainer().nativeElement.scrollLeft = container.scrollLeft;

    this.state.scrollTop.set(container.scrollTop);
    this.state.viewportHeight.set(container.clientHeight);

    if (!this.isRestoring && !this.activeSession) {
      this.updatePassiveAnchor();

      if (!this.state.isContentManipulation()) {
        this.lockedAnchor = this.passiveAnchor;
        this.lockedRelativeY = 0;
      }
    }

    this.updateVisibleCategories(container);

    const currentAnchor =
      this.activeSession?.primaryAnchor ||
      (this.state.isContentManipulation()
        ? this.lockedAnchor
        : this.passiveAnchor);
    if (currentAnchor) {
      this.state.setActiveCategory(currentAnchor.catId);
    }
  }

  private restoreScroll() {
    if (this.renderedLayout.length === 0) return;

    this.isRestoring = true;
    this.ignoreScrollFrame = true;

    let targetTop = this.calculateTargetScrollTop();

    if (targetTop === null && this.passiveAnchor) {
      this.lockedAnchor = this.passiveAnchor;
      this.activeSession = null;
      this.lockedRelativeY = 0;
      targetTop = this.calculateTargetScrollTop();
    }

    if (targetTop !== null) {
      this.applyScroll(targetTop);
    }

    this.updateVisualFeedback();

    this.isRestoring = false;
    requestAnimationFrame(() => {
      this.ignoreScrollFrame = false;
    });

    this.handleScrollUpdate();
  }

  private calculateTargetScrollTop(): number | null {
    if (this.activeSession) {
      const session = this.activeSession;
      const primaryY = this.scrollSync.getTargetY(
        this.renderedLayout,
        session.primaryAnchor,
      );

      if (primaryY !== null) {
        session.fallbackAnchor = null;
        return primaryY - session.primaryViewportOffset - session.currentDeltaY;
      }

      if (session.fallbackAnchor) {
        const fallbackY = this.scrollSync.getTargetY(
          this.renderedLayout,
          session.fallbackAnchor,
        );
        if (fallbackY !== null) {
          return (
            fallbackY - session.fallbackViewportOffset - session.currentDeltaY
          );
        }
      }

      const container = this.scrollContainer().nativeElement;
      const searchY = container.scrollTop + session.pointerRelativeY;

      const newAnchor = this.scrollSync.getAnchor(
        this.renderedLayout,
        searchY,
        0,
      );
      if (newAnchor) {
        const newY = this.scrollSync.getTargetY(this.renderedLayout, newAnchor);
        if (newY !== null) {
          session.fallbackAnchor = newAnchor;
          session.fallbackViewportOffset =
            newY - container.scrollTop - session.currentDeltaY;
          return newY - session.fallbackViewportOffset - session.currentDeltaY;
        }
      }
    }

    const anchor = this.lockedAnchor || this.passiveAnchor;
    if (anchor) {
      const targetY = this.scrollSync.getTargetY(this.renderedLayout, anchor);
      if (targetY !== null) {
        const relativeOffset = this.lockedAnchor ? this.lockedRelativeY : 0;
        return targetY - anchor.offset - relativeOffset;
      }
    }

    return null;
  }

  private applyScroll(scrollTop: number) {
    const container = this.scrollContainer().nativeElement;
    const safeTop = Math.max(0, scrollTop);
    if (Math.abs(container.scrollTop - safeTop) > 1) {
      container.scrollTop = safeTop;
    }
  }

  private updateVisualFeedback() {
    const session = this.activeSession;
    const activeAnchor =
      session?.primaryAnchor || session?.fallbackAnchor || this.lockedAnchor;

    if (activeAnchor) {
      const isManipulating = this.state.isContentManipulation();
      const shouldHighlight = session || (this.lockedAnchor && isManipulating);
      this.state.anchoredSubcategoryId.set(
        shouldHighlight ? activeAnchor.subId : null,
      );
    }
  }

  private updateVisibleCategories(container: HTMLElement) {
    const scrollTop = container.scrollTop;
    const viewBottom = scrollTop + container.clientHeight;
    const visibleIds = new Set<number>();

    for (const cat of this.renderedLayout) {
      const top = cat.y;
      const bottom = cat.y + cat.height;

      if (bottom > scrollTop && top < viewBottom) {
        visibleIds.add(cat.id);
      }
    }
    this.state.setVisibleCategoryIds(visibleIds);
  }

  private updatePassiveAnchor() {
    const container = this.scrollContainer().nativeElement;
    const anchor = this.scrollSync.getAnchor(
      this.renderedLayout,
      container.scrollTop,
      container.clientHeight,
    );
    if (anchor) {
      this.passiveAnchor = anchor;
    }
  }

  private scrollToCategoryId(id: number) {
    const el = this.scrollContainer().nativeElement;
    const cat = this.renderedLayout.find((c) => c.id === id);

    if (cat) {
      this.isRestoring = true;
      el.scrollTop = cat.y;
      this.updatePassiveAnchor();

      this.lockedAnchor = this.passiveAnchor;
      this.lockedRelativeY = 0;

      this.isRestoring = false;
    }
  }

  private scrollToEvent(eventId: number) {
    for (const cat of this.renderedLayout) {
      for (const sub of cat.subcategories) {
        for (const row of sub.rows) {
          for (const ev of row) {
            if (ev.raw.id === eventId) {
              let y = sub.y;
              if (sub.name) y += this.config.subcategoryHeaderHeight();
              y += ev.row * this.config.rowTotalHeight();

              const container = this.scrollContainer().nativeElement;
              const halfHeight = container.clientHeight / 2;
              this.applyScroll(y - halfHeight + this.config.rowHeight() / 2);
              this.lockedAnchor = null;
              this.activeSession = null;
              return;
            }
          }
        }
        for (const row of sub.legendRows) {
          for (const item of row) {
            if (item.raw.id === eventId) {
              let y = sub.y;
              if (sub.name) y += this.config.subcategoryHeaderHeight();
              y += sub.legendStartY + item.row * this.config.legendRowHeight();
              const container = this.scrollContainer().nativeElement;
              const halfHeight = container.clientHeight / 2;
              this.applyScroll(y - halfHeight);
              this.lockedAnchor = null;
              this.activeSession = null;
              return;
            }
          }
        }
      }
    }
  }

  private getGuidePositionPx(year: number | null): number | null {
    if (year === null) return null;
    const start = this.state.startYear();
    const end = this.state.endYear();
    if (year < start || year > end) return null;

    return this.geometry.yearToPixel(
      year,
      start,
      end,
      this.state.layoutWidth(),
    );
  }
}
