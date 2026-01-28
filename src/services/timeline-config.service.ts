import { Injectable, signal, computed } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class TimelineConfigService {
  readonly defaultStartYear = 1700;
  readonly defaultEndYear = 1800;

  readonly baseFontSize = signal<number>(10);

  readonly font = computed(() => `bold ${this.baseFontSize()}px ui-sans-serif, system-ui, sans-serif`);

  readonly rowHeight = computed(() => this.baseFontSize() * 2);
  readonly gapY = computed(() => 2);
  readonly rowTotalHeight = computed(() => this.rowHeight() + this.gapY());

  readonly textPadding = computed(() => this.baseFontSize() * 0.5);

  readonly sidePadding = computed(() => 1);
  readonly minEventGap = computed(() => 0);

  readonly legendRowHeight = computed(() => Math.max(14, this.baseFontSize() * 1.4));
  readonly legendBlockPadding = computed(() => this.baseFontSize() * 0.6);
  readonly legendItemGap = computed(() => this.baseFontSize());
  readonly legendBottomPadding = computed(() => this.baseFontSize() * 0.8);

  readonly viewPaddingRight = computed(() => 80);

  readonly categoryHeaderHeight = computed(() => this.baseFontSize() * 3.2);
  readonly categoryHeaderMarginBottom = computed(() => 2);
  readonly subcategoryHeaderHeight = computed(() => this.baseFontSize() * 2);
  readonly subcategoryMarginBottom = computed(() => this.baseFontSize() * 0.6);

  readonly rulerHeight = computed(() => this.baseFontSize() * 2.5);
  readonly rulerFontSize = computed(() => this.baseFontSize() * 0.9);
  readonly minGridGap = computed(() => this.baseFontSize() * 6);
}
