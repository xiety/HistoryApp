import { Injectable, inject } from '@angular/core';
import { CategoryLayout } from './timeline-layout.service';
import { TimelineConfigService } from './timeline-config.service';

export interface LayoutAnchor {
  catId: number;
  subId: number;
  offset: number;
  catOffset: number;
}

@Injectable({
  providedIn: 'root',
})
export class ScrollSyncService {
  private config = inject(TimelineConfigService);

  getAnchor(
    layout: CategoryLayout[],
    scrollTop: number,
    viewportHeight: number = 0,
  ): LayoutAnchor | null {
    const threshold = scrollTop + this.config.rulerHeight();

    for (const cat of layout) {
      if (cat.y + cat.height < threshold) continue;

      if (cat.y > threshold + viewportHeight) break;

      for (const sub of cat.subcategories) {
        if (sub.y <= threshold && sub.y + sub.height >= threshold) {
          return {
            catId: cat.id,
            subId: sub.id,
            offset: sub.y - scrollTop,
            catOffset: cat.y - scrollTop,
          };
        }

        if (sub.y > threshold) {
          return {
            catId: cat.id,
            subId: sub.id,
            offset: sub.y - scrollTop,
            catOffset: cat.y - scrollTop,
          };
        }
      }
    }

    if (layout.length > 0) {
      const lastCat = layout[layout.length - 1];
      if (lastCat.subcategories.length > 0) {
        const lastSub = lastCat.subcategories[lastCat.subcategories.length - 1];
        return {
          catId: lastCat.id,
          subId: lastSub.id,
          offset: lastSub.y - scrollTop,
          catOffset: lastCat.y - scrollTop,
        };
      }
    }

    return null;
  }

  getAnchorAtY(
    layout: CategoryLayout[],
    absoluteY: number,
  ): LayoutAnchor | null {
    let closest: LayoutAnchor | null = null;
    let minDistance = Infinity;

    for (const cat of layout) {
      for (const sub of cat.subcategories) {
        const center = sub.y + sub.height / 2;
        const dist = Math.abs(center - absoluteY);

        if (dist < minDistance) {
          minDistance = dist;
          closest = {
            catId: cat.id,
            subId: sub.id,
            offset: sub.y - absoluteY,
            catOffset: cat.y - absoluteY,
          };
        }
      }
    }
    return closest;
  }

  restoreScrollPosition(
    layout: CategoryLayout[],
    anchor: LayoutAnchor,
  ): number | null {
    const cat = layout.find((c) => c.id === anchor.catId);
    if (!cat) return null;

    const sub = cat.subcategories.find((s) => s.id === anchor.subId);

    if (sub) {
      return sub.y - anchor.offset;
    }

    return cat.y - anchor.catOffset;
  }

  getCategoryBounds(
    layout: CategoryLayout[],
  ): Map<number, { top: number; bottom: number }> {
    const map = new Map<number, { top: number; bottom: number }>();
    for (const cat of layout) {
      map.set(cat.id, { top: cat.y, bottom: cat.y + cat.height });
    }
    return map;
  }
}
