import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { TimelineParserService, TimelineData, CategoryData, SubcategoryData, RawEvent, CategoryInfo } from './timeline-parser.service';
import { TimelineLayoutService, SubcategoryLayout } from './timeline-layout.service';
import { TimelineConfigService } from './timeline-config.service';
import { DATA_SOURCE_URL } from '../config/example-data';

export interface DensityData {
  total: number[];
  matching: number[] | null;
}

export interface TocItem {
  id: number;
  name: string;
  color: string;
  isHidden: boolean;
  isFilteredOut: boolean;
  isOffScreen: boolean;
  isVisibleVertically: boolean;
  countTotal: number;
  countFiltered: number;
  countVisible: number;
}

export interface TocToggleState {
  checked: boolean;
  indeterminate: boolean;
  hasItems: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TimelineStateService {
  private parser = inject(TimelineParserService);
  private layout = inject(TimelineLayoutService);
  private config = inject(TimelineConfigService);

  private readonly _scrollTo$ = new Subject<number>();
  readonly scrollTo$ = this._scrollTo$.asObservable();


  readonly inputText = signal<string>('');
  readonly isLoading = signal<boolean>(false);

  readonly containerWidth = signal<number>(1000);

  readonly startYear = signal<number>(this.config.defaultStartYear);
  readonly endYear = signal<number>(this.config.defaultEndYear);

  readonly activeCategoryId = signal<number | null>(null);
  readonly visibleCategoryIds = signal<Set<number>>(new Set());
  readonly highlightedCategoryId = signal<number | null>(null);

  readonly hoveredYear = signal<number | null>(null);
  readonly persistentMarkerYear = signal<number | null>(null);

  readonly selectedEventId = signal<number | null>(null);
  readonly selectedGroupId = signal<number | null>(null);
  readonly selectedEventLine = signal<number | null>(null);

  readonly hoveredEventId = signal<number | null>(null);
  readonly hoveredGroupId = signal<number | null>(null);

  readonly searchQuery = signal<string>('');
  readonly isFilterMode = signal<boolean>(false);
  readonly hideSmallEvents = signal<boolean>(false);
  readonly showLegends = signal<boolean>(false);
  readonly showRelatedDots = signal<boolean>(true);
  readonly compactMode = signal<boolean>(false);
  readonly hiddenCategoryIds = signal<Set<number>>(new Set());
  readonly onlyShowVisibleInToc = signal<boolean>(false);

  readonly isHoverDetailsSuppressed = signal<boolean>(false);

  readonly tocFilterQuery = signal<string>('');

  readonly parsedData = computed(() => this.parser.parse(this.inputText()));

  readonly dataBounds = computed(() => ({
    min: this.parsedData().minYear,
    max: this.parsedData().maxYear
  }));

  readonly layoutWidth = computed(() => Math.max(10, this.containerWidth() - this.config.viewPaddingRight()));

  readonly pixelsPerYear = computed(() => {
    const span = this.endYear() - this.startYear();
    if (span <= 0) return 0;
    const effectiveWidth = Math.max(1, this.layoutWidth() - (2 * this.config.sidePadding()));
    return effectiveWidth / span;
  });

  private readonly activeData = computed<TimelineData>(() => {
    const data = this.parsedData();
    const hideSmall = this.hideSmallEvents();

    if (!hideSmall) return data;

    const ppy = this.pixelsPerYear();
    if (ppy <= 0) return data;

    const categories: CategoryData[] = data.categories.map(cat => ({
      ...cat,
      subcategories: cat.subcategories.map(sub => ({
        ...sub,
        events: sub.events.filter(evt => {
          const dur = Math.max(1, evt.end - evt.start);
          return (dur * ppy) >= 2;
        })
      }))
    }));

    return { ...data, categories };
  });

  private readonly searchIndex = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return null;

    const matches = new Set<number>();
    let min = Infinity;
    let max = -Infinity;

    const data = this.activeData();

    for (const cat of data.categories) {
      for (const sub of cat.subcategories) {
        for (const evt of sub.events) {
          const nameMatch = evt.name.toLowerCase().includes(query);
          const startMatch = evt.start.toString() === query;
          const endMatch = evt.end.toString() === query;

          if (nameMatch || startMatch || endMatch) {
            matches.add(evt.id);
            if (evt.start < min) min = evt.start;
            if (evt.end > max) max = evt.end;
          }
        }
      }
    }

    return {
      matches,
      bounds: matches.size > 0 ? { min, max } : null
    };
  });

  readonly matchingEventIds = computed(() => this.searchIndex()?.matches ?? null);
  readonly matchCount = computed(() => this.matchingEventIds()?.size ?? 0);
  readonly matchingBounds = computed(() => this.searchIndex()?.bounds ?? null);

  readonly gridLines = computed(() =>
    this.layout.generateGridLines(this.startYear(), this.endYear(), this.layoutWidth(), this.config.minGridGap())
  );

  readonly renderableData = computed<TimelineData>(() => {
    const data = this.activeData();
    const hidden = this.hiddenCategoryIds();
    const filter = this.isFilterMode();
    const matches = this.matchingEventIds();
    const isSearch = !!matches;

    if (!filter && hidden.size === 0) {
      return this.cleanEmptyData(data);
    }

    const categories: CategoryData[] = [];

    for (const cat of data.categories) {
      if (hidden.has(cat.id)) continue;

      const subcategories: SubcategoryData[] = [];

      for (const sub of cat.subcategories) {
        let events = sub.events;

        if (filter && isSearch) {
          events = events.filter(evt => matches.has(evt.id));
        }

        if (events.length > 0) {
          subcategories.push({ ...sub, events });
        }
      }

      if (subcategories.length > 0) {
        categories.push({ ...cat, subcategories });
      }
    }

    return { ...data, categories };
  });

  private cleanEmptyData(data: TimelineData): TimelineData {
    const categories: CategoryData[] = [];
    for (const cat of data.categories) {
      const subcategories: SubcategoryData[] = [];
      for (const sub of cat.subcategories) {
        if (sub.events.length > 0) subcategories.push(sub);
      }
      if (subcategories.length > 0) categories.push({ ...cat, subcategories });
    }
    return { ...data, categories };
  };

  readonly processedLayout = computed(() => {
    const data = this.renderableData();
    const width = this.layoutWidth();
    const start = this.startYear();
    const end = this.endYear();
    const showLegends = this.showLegends();
    const compactMode = this.compactMode();

    return data.categories.flatMap(cat => {
      const sublayouts: SubcategoryLayout[] = [];

      for (const sub of cat.subcategories) {
        const res = this.layout.computeLayout(sub.events, width, start, end, showLegends, compactMode);
        if (res.rowCount > 0) {
          sublayouts.push({ id: sub.id, name: sub.name, ...res });
        }
      }

      return sublayouts.length > 0 ?
        [{ id: cat.id, name: cat.name, color: cat.color, subcategories: sublayouts }] : [];
    });
  });

  readonly activeBounds = computed(() => {
    const hidden = this.hiddenCategoryIds();
    const matches = this.matchingEventIds();
    const isSearch = !!matches;

    let min = Infinity;
    let max = -Infinity;
    let found = false;

    const data = this.activeData();

    for (const cat of data.categories) {
      if (hidden.has(cat.id)) continue;

      for (const sub of cat.subcategories) {
        for (const evt of sub.events) {
          if (isSearch && matches && !matches.has(evt.id)) continue;

          if (evt.start < min) min = evt.start;
          if (evt.end > max) max = evt.end;
          found = true;
        }
      }
    }
    return found ? { min, max } : null;
  });

  readonly densityData = computed<DensityData>(() => {
    const bounds = this.dataBounds();
    const span = bounds.max - bounds.min;
    if (span <= 0) return { total: [], matching: null };

    const bins = 200;
    const step = span / bins;

    const total = new Array(bins).fill(0);
    const matching = this.matchingEventIds() ? new Array(bins).fill(0) : null;
    const matches = this.matchingEventIds();

    const data = this.renderableData();
    let maxVal = 0;

    for (const cat of data.categories) {
      for (const sub of cat.subcategories) {
        for (const evt of sub.events) {
          const sIdx = Math.floor((evt.start - bounds.min) / step);
          const eIdx = Math.floor((evt.end - bounds.min) / step);

          const start = Math.max(0, Math.min(bins - 1, sIdx));
          const end = Math.max(0, Math.min(bins - 1, eIdx));

          const isMatch = matching && matches?.has(evt.id);

          for (let i = start; i <= end; i++) {
            total[i]++;
            if (isMatch) matching[i]++;
          }
        }
      }
    }

    for (let i = 0; i < bins; i++) if (total[i] > maxVal) maxVal = total[i];
    const invMax = maxVal > 0 ? 1 / maxVal : 0;

    return {
      total: total.map(v => v * invMax),
      matching: matching ? matching.map(v => v * invMax) : null
    };
  });


  readonly tocItems = computed<TocItem[]>(() => {
    const hidden = this.hiddenCategoryIds();
    const visibleVertically = this.visibleCategoryIds();
    const matches = this.matchingEventIds();
    const isSearch = !!matches;

    const sYear = this.startYear();
    const eYear = this.endYear();

    const items: TocItem[] = [];
    const showVisibleOnly = this.onlyShowVisibleInToc();
    const data = this.activeData();

    for (const cat of data.categories) {
      let cTotal = 0;
      let cFiltered = 0;
      let cVisible = 0;
      let cPotential = 0;

      const isCatHidden = hidden.has(cat.id);

      for (const sub of cat.subcategories) {
        for (const evt of sub.events) {
          cTotal++;

          const isMatch = !isSearch || (matches && matches.has(evt.id));
          if (!isMatch) continue;

          cFiltered++;

          if (evt.end >= sYear && evt.start <= eYear) {
            cPotential++;
            if (!isCatHidden) {
              cVisible++;
            }
          }
        }
      }

      const isFilteredOut = isSearch && cFiltered === 0;
      const isOffScreen = cFiltered > 0 && cPotential === 0 && !isCatHidden;

      if (showVisibleOnly) {
        if (cFiltered === 0) continue;
        if (cPotential === 0) continue;
      }

      items.push({
        id: cat.id,
        name: cat.name,
        color: `hsl(${cat.color})`,
        isHidden: isCatHidden,
        isFilteredOut,
        isOffScreen,
        isVisibleVertically: visibleVertically.has(cat.id),
        countTotal: cTotal,
        countFiltered: cFiltered,
        countVisible: cVisible
      });
    }
    return items;
  });

  readonly filteredTocItems = computed(() => {
    const items = this.tocItems();
    const query = this.tocFilterQuery().trim().toLowerCase();

    if (!query) return items;

    return items.filter(item => item.name.toLowerCase().includes(query));
  });

  readonly tocToggleState = computed<TocToggleState>(() => {
    const items = this.filteredTocItems();
    const count = items.length;

    if (count === 0) {
      return { checked: false, indeterminate: false, hasItems: false };
    }

    const checkedCount = items.filter(i => !i.isHidden).length;
    const allVisible = checkedCount === count;
    const someVisible = checkedCount > 0 && checkedCount < count;

    return {
      checked: allVisible,
      indeterminate: someVisible,
      hasItems: true
    };
  });

  readonly tocTotals = computed(() => {
    const items = this.tocItems();
    return items.reduce((acc, item) => ({
      total: acc.total + item.countTotal,
      filtered: acc.filtered + item.countFiltered,
      visible: acc.visible + item.countVisible,
      checkedCategories: acc.checkedCategories + (item.isHidden ? 0 : 1),
      totalCategories: items.length
    }), {
      total: 0,
      filtered: 0,
      visible: 0,
      checkedCategories: 0,
      totalCategories: items.length
    });
  });

  getGroupCategories(groupId: number): CategoryInfo[] {
    return this.activeData().groupCategories.get(groupId) || [];
  }

  setText(text: string) {
    this.inputText.set(text);
    this.clearEventSelection();
  }

  setRange(start: number, end: number) { this.startYear.set(start); this.endYear.set(end); }

  setContainerWidth(width: number) { this.containerWidth.set(width); }

  setActiveCategory(id: number | null) { this.activeCategoryId.set(id); }
  setTocFilterQuery(query: string) { this.tocFilterQuery.set(query); }

  setVisibleCategoryIds(ids: Set<number>) {
    const prev = this.visibleCategoryIds();
    if (prev.size !== ids.size || [...ids].some(id => !prev.has(id))) {
      this.visibleCategoryIds.set(ids);
    }
  }

  setHoveredYear(year: number | null) { this.hoveredYear.set(year); }
  setPersistentMarker(year: number | null) { this.persistentMarkerYear.set(year); }


  toggleEventSelection(raw: RawEvent) {
    if (this.selectedEventId() === raw.id) {
      this.clearEventSelection();
    } else {
      this.selectedEventId.set(raw.id);
      this.selectedGroupId.set(raw.groupId);
      this.selectedEventLine.set(raw.lineNumber);
    }
  }

  clearEventSelection() {
    this.selectedEventId.set(null);
    this.selectedGroupId.set(null);
    this.selectedEventLine.set(null);
  }

  setHoveredEvent(raw: RawEvent | null) {
    if (raw) {
      this.hoveredEventId.set(raw.id);
      this.hoveredGroupId.set(raw.groupId);
    } else {
      this.hoveredEventId.set(null);
      this.hoveredGroupId.set(null);
    }
  }

  toggleCategoryVisibility(id: number) {
    this.hiddenCategoryIds.update(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  setCategoryVisibilityMulti(ids: Iterable<number>, visible: boolean) {
    this.hiddenCategoryIds.update(current => {
      const next = new Set(current);
      for (const id of ids) {
        if (visible) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  toggleAllFilteredCategories() {
    const state = this.tocToggleState();
    if (!state.hasItems) return;

    const targetVisible = !state.checked;
    const items = this.filteredTocItems();
    const ids = items.map(item => item.id);

    if (ids.length > 0) {
      this.setCategoryVisibilityMulti(ids, targetVisible);
    }
  }

  setOnlyShowVisibleInToc(val: boolean) { this.onlyShowVisibleInToc.set(val); }

  fitData() {
    const b = this.activeBounds();
    if (!b) return;
    if (b.min === b.max) this.setRange(b.min - 1, b.max + 1);
    else this.setRange(b.min, b.max);
  }

  requestScrollToCategory(id: number) {
    this._scrollTo$.next(id);
    this.highlightedCategoryId.set(id);
  }

  clearHighlight() {
    this.highlightedCategoryId.set(null);
  }

  async loadFromUrl() {
    this.isLoading.set(true);
    try {
      const res = await fetch(DATA_SOURCE_URL);
      if (!res.ok) throw new Error('Fetch error');
      this.setText(await res.text());
      this.startYear.set(this.config.defaultStartYear);
      this.endYear.set(this.config.defaultEndYear);
    } catch (e) { console.error(e); }
    finally { this.isLoading.set(false); }
  }
}
