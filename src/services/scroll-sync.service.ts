import { Injectable, inject } from '@angular/core';
import { CategoryLayout, SubcategoryLayout } from './timeline-layout.service';
import { TimelineConfigService } from './timeline-config.service';

export type AnchorType = 'category-header' | 'subcategory-item' | 'end-of-content';

export interface ScrollAnchor {
  type: AnchorType;

  catId: number;
  catIndexHint: number;
  prevCatId: number | null;

  subId: number | null;
  subIndexHint: number;
  prevSubId: number | null;

  offsetY: number;
}

@Injectable({
  providedIn: 'root'
})
export class ScrollSyncService {
  private config = inject(TimelineConfigService);

  getCategoryBounds(layout: CategoryLayout[]): Map<number, { top: number, bottom: number; }> {
    const map = new Map<number, { top: number, bottom: number; }>();
    let currentY = 0;

    for (const cat of layout) {
      const height = this.getCategoryTotalHeight(cat);
      map.set(cat.id, { top: currentY, bottom: currentY + height });
      currentY += height;
    }

    return map;
  }

  findScrollAnchor(absoluteY: number, layout: CategoryLayout[]): ScrollAnchor {
    let currentY = 0;

    if (layout.length === 0) {
      return this.createEmptyAnchor();
    }

    const catHeaderHeight = this.config.categoryHeaderHeight();
    const catHeaderMargin = this.config.categoryHeaderMarginBottom();

    for (let i = 0; i < layout.length; i++) {
      const cat = layout[i];
      const catHeight = this.getCategoryTotalHeight(cat);
      const prevCatId = i > 0 ? layout[i - 1].id : null;

      if (absoluteY >= currentY && absoluteY < currentY + catHeaderHeight) {
        return {
          type: 'category-header',
          catId: cat.id,
          catIndexHint: i,
          prevCatId,
          subId: null,
          subIndexHint: -1,
          prevSubId: null,
          offsetY: absoluteY - currentY
        };
      }

      let subCurrentY = currentY + catHeaderHeight + catHeaderMargin;

      for (let j = 0; j < cat.subcategories.length; j++) {
        const sub = cat.subcategories[j];
        const subH = this.getSubcategoryTotalHeight(sub);
        const prevSubId = j > 0 ? cat.subcategories[j - 1].id : null;

        if (absoluteY >= subCurrentY && absoluteY < subCurrentY + subH) {
          return {
            type: 'subcategory-item',
            catId: cat.id,
            catIndexHint: i,
            prevCatId,
            subId: sub.id,
            subIndexHint: j,
            prevSubId,
            offsetY: absoluteY - subCurrentY
          };
        }
        subCurrentY += subH;
      }

      if (absoluteY >= currentY && absoluteY < subCurrentY) {
         return {
          type: 'category-header',
          catId: cat.id,
          catIndexHint: i,
          prevCatId,
          subId: null,
          subIndexHint: -1,
          prevSubId: null,
          offsetY: absoluteY - currentY
        };
      }

      currentY += catHeight;
    }

    const lastCatIndex = layout.length - 1;
    const lastCat = layout[lastCatIndex];
    const prevCatId = lastCatIndex > 0 ? layout[lastCatIndex - 1].id : null;

    return {
      type: 'end-of-content',
      catId: lastCat.id,
      catIndexHint: lastCatIndex,
      prevCatId,
      subId: null,
      subIndexHint: -1,
      prevSubId: null,
      offsetY: absoluteY - currentY
    };
  }

  resolveAnchorY(anchor: ScrollAnchor, layout: CategoryLayout[]): number | null {
    if (layout.length === 0) return 0;

    let catIndex = layout.findIndex(c => c.id === anchor.catId);
    let usedPrevCat = false;

    if (catIndex === -1 && anchor.prevCatId !== null) {
      const prevIndex = layout.findIndex(c => c.id === anchor.prevCatId);
      if (prevIndex !== -1) {
        catIndex = prevIndex;
        usedPrevCat = true;
      }
    }

    if (catIndex === -1) {
      catIndex = Math.max(0, Math.min(anchor.catIndexHint, layout.length - 1));
    }

    let targetY = 0;
    for (let i = 0; i < catIndex; i++) {
      targetY += this.getCategoryTotalHeight(layout[i]);
    }

    const cat = layout[catIndex];

    if (usedPrevCat) {
      return targetY + this.getCategoryTotalHeight(cat);
    }

    if (anchor.type === 'end-of-content') {
      return targetY + this.getCategoryTotalHeight(cat) + anchor.offsetY;
    }

    if (anchor.type === 'category-header') {
      return targetY + anchor.offsetY;
    }

    targetY += this.config.categoryHeaderHeight();
    targetY += this.config.categoryHeaderMarginBottom();

    let subIndex = -1;
    if (anchor.subId !== null) {
      subIndex = cat.subcategories.findIndex(s => s.id === anchor.subId);
    }

    let usedPrevSub = false;
    if (subIndex === -1 && anchor.prevSubId !== null) {
      const prevSIndex = cat.subcategories.findIndex(s => s.id === anchor.prevSubId);
      if (prevSIndex !== -1) {
        subIndex = prevSIndex;
        usedPrevSub = true;
      }
    }

    if (subIndex === -1) {
      subIndex = Math.max(0, Math.min(anchor.subIndexHint, cat.subcategories.length - 1));
    }

    for (let i = 0; i < subIndex; i++) {
      targetY += this.getSubcategoryTotalHeight(cat.subcategories[i]);
    }

    if (usedPrevSub) {
      return targetY + this.getSubcategoryTotalHeight(cat.subcategories[subIndex]);
    }

    return targetY + anchor.offsetY;
  }

  private getCategoryTotalHeight(cat: CategoryLayout): number {
    let h = this.config.categoryHeaderHeight() + this.config.categoryHeaderMarginBottom();
    for (const sub of cat.subcategories) {
      h += this.getSubcategoryTotalHeight(sub);
    }
    return h;
  }

  private getSubcategoryTotalHeight(sub: SubcategoryLayout): number {
    const subHeaderH = sub.name ? this.config.subcategoryHeaderHeight() : 0;
    return subHeaderH + sub.height + this.config.subcategoryMarginBottom();
  }

  private createEmptyAnchor(): ScrollAnchor {
    return {
      type: 'category-header',
      catId: -1,
      catIndexHint: -1,
      prevCatId: null,
      subId: null,
      subIndexHint: -1,
      prevSubId: null,
      offsetY: 0
    };
  }
}
