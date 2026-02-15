import { Injectable } from '@angular/core';
import { CategoryLayout } from './timeline-layout.service';

export interface LayoutAnchor {
  catId: number;
  subId: number;
  offset: number;
}

@Injectable({
  providedIn: 'root',
})
export class ScrollSyncService {
  getAnchor(
    layout: CategoryLayout[],
    y: number,
    viewportHeight: number = 0,
  ): LayoutAnchor | null {
    if (!layout || layout.length === 0) return null;

    let insideCandidate: LayoutAnchor | null = null;
    let closestCandidate: LayoutAnchor | null = null;
    let minDistance = Infinity;

    for (const cat of layout) {
      for (const sub of cat.subcategories) {
        const subTop = sub.y;
        const subBottom = subTop + sub.totalHeight;

        const dist = Math.abs(subTop - y);
        if (dist < minDistance) {
          minDistance = dist;
          closestCandidate = {
            catId: cat.id,
            subId: sub.id,
            offset: subTop - y,
          };
        }

        if (subTop >= y && subTop < y + viewportHeight) {
          return { catId: cat.id, subId: sub.id, offset: subTop - y };
        }

        if (y >= subTop && y < subBottom) {
          if (!insideCandidate) {
            insideCandidate = {
              catId: cat.id,
              subId: sub.id,
              offset: subTop - y,
            };
          }
        }
      }
    }

    return insideCandidate || closestCandidate || null;
  }

  getTargetY(layout: CategoryLayout[], anchor: LayoutAnchor): number | null {
    if (!layout || layout.length === 0) return null;

    const cat = layout.find((c) => c.id === anchor.catId);
    if (!cat) return null;

    const sub = cat.subcategories.find((s) => s.id === anchor.subId);

    return sub ? sub.y : cat ? cat.y : null;
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
