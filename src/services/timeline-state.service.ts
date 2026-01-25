import { Injectable, computed, inject, signal, effect } from '@angular/core';
import { Subject } from 'rxjs';
import { TimelineParserService, TimelineData, CategoryData, SubcategoryData } from './timeline-parser.service';
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

@Injectable({
  providedIn: 'root'
})
export class TimelineStateService {
  private parser = inject(TimelineParserService);
  private layout = inject(TimelineLayoutService);
  private config = inject(TimelineConfigService);

  private readonly STORAGE_KEY = 'chronos-events-data';

  private readonly _scrollTo$ = new Subject<number>();
  readonly scrollTo$ = this._scrollTo$.asObservable();

  readonly inputText = signal<string>('');
  readonly startYear = signal<number>(this.config.defaultStartYear);
  readonly endYear = signal<number>(this.config.defaultEndYear);
  readonly containerWidth = signal<number>(1000);
  readonly activeCategoryId = signal<number | null>(null);
  readonly visibleCategoryIds = signal<Set<number>>(new Set());

  readonly searchQuery = signal<string>('');
  readonly isFilterMode = signal<boolean>(false);

  readonly hiddenCategoryIds = signal<Set<number>>(new Set());
  readonly onlyShowVisibleInToc = signal<boolean>(false);

  readonly isSidebarOpen = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);

  readonly hoveredYear = signal<number | null>(null);
  readonly persistentMarkerYear = signal<number | null>(null);

  constructor() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved !== null && saved.trim() !== '') {
      this.inputText.set(saved);
    } else {
      this.loadFromUrl();
    }

    effect(() => {
      localStorage.setItem(this.STORAGE_KEY, this.inputText());
    });
  }

  readonly parsedData = computed(() => this.parser.parse(this.inputText()));

  readonly dataBounds = computed(() => ({
    min: this.parsedData().minYear,
    max: this.parsedData().maxYear
  }));

  readonly enabledData = computed<TimelineData>(() => {
    const fullData = this.parsedData();
    const hidden = this.hiddenCategoryIds();

    if (hidden.size === 0) {
      return fullData;
    }

    return {
      ...fullData,
      categories: fullData.categories.filter(cat => !hidden.has(cat.id))
    };
  });

  private readonly searchResult = computed(() => {
    const query = this.searchQuery().trim();
    if (!query) return null;

    const lowerQuery = query.toLowerCase();
    const matches = new Set<number>();
    let min = Infinity;
    let max = -Infinity;

    const data = this.parsedData();

    for (const cat of data.categories) {
      const isCategoryMatch = cat.name.toLowerCase().includes(lowerQuery);

      for (const sub of cat.subcategories) {
        const isSubcategoryMatch = sub.name && sub.name.toLowerCase().includes(lowerQuery);

        for (const evt of sub.events) {
          let isMatch = isCategoryMatch || isSubcategoryMatch;

          if (!isMatch) {
            const matchName = evt.name.toLowerCase().includes(lowerQuery);
            const matchStart = evt.start.toString() === query;
            const matchEnd = evt.end.toString() === query;

            if (matchName || matchStart || matchEnd) {
              isMatch = true;
            }
          }

          if (isMatch) {
            matches.add(evt.id);
            if (evt.start < min) min = evt.start;
            if (evt.end > max) max = evt.end;
          }
        }
      }
    }

    return {
      matches,
      bounds: min === Infinity ? null : { min, max }
    };
  });

  readonly matchingEventIds = computed(() => this.searchResult()?.matches ?? null);

  readonly matchCount = computed(() => {
    const matches = this.matchingEventIds();
    return matches ? matches.size : 0;
  });

  readonly matchingBounds = computed(() => this.searchResult()?.bounds ?? null);

  readonly activeBounds = computed(() => {
    const mBounds = this.matchingBounds();
    return mBounds !== null ? mBounds : this.dataBounds();
  });

  readonly displayData = computed<TimelineData>(() => {
    const data = this.enabledData();
    const query = this.searchQuery().trim();
    const filterMode = this.isFilterMode();
    const matchIds = this.matchingEventIds();

    if (!query || !filterMode || !matchIds) {
      return data;
    }

    const newCategories: CategoryData[] = [];

    for (const cat of data.categories) {
      const newSubcategories: SubcategoryData[] = [];

      for (const sub of cat.subcategories) {
        const matchingEvents = sub.events.filter(e => matchIds.has(e.id));

        if (matchingEvents.length > 0) {
          newSubcategories.push({
            ...sub,
            events: matchingEvents
          });
        }
      }

      if (newSubcategories.length > 0) {
        newCategories.push({
          ...cat,
          subcategories: newSubcategories
        });
      }
    }

    return {
      ...data,
      categories: newCategories
    };
  });

  readonly densityData = computed<DensityData>(() => {
    const data = this.enabledData();
    const bounds = this.dataBounds();
    const totalSpan = bounds.max - bounds.min;
    const matchIds = this.matchingEventIds();
    const hasSearch = this.searchQuery().trim().length > 0 && !!matchIds;
    const filterMode = this.isFilterMode();

    const binCount = 200;
    const totalBins = new Array(binCount).fill(0);
    const matchingBins = hasSearch ? new Array(binCount).fill(0) : null;

    if (totalSpan <= 0) {
      return { total: totalBins, matching: matchingBins };
    }

    const yearsPerBin = totalSpan / binCount;

    for (const cat of data.categories) {
      for (const sub of cat.subcategories) {
        for (const evt of sub.events) {

          const isMatch = hasSearch && matchIds?.has(evt.id);

          if (filterMode && !isMatch) {
            continue;
          }

          const startBin = Math.max(0, Math.min(binCount - 1, Math.floor((evt.start - bounds.min) / yearsPerBin)));
          const endBin = Math.max(0, Math.min(binCount - 1, Math.floor((evt.end - bounds.min) / yearsPerBin)));

          for (let i = startBin; i <= endBin; i++) {
            totalBins[i]++;
            if (isMatch && matchingBins) {
              matchingBins[i]++;
            }
          }
        }
      }
    }

    const maxCount = Math.max(1, ...totalBins);
    const normalizedTotal = totalBins.map(count => count / maxCount);
    const normalizedMatching = matchingBins ? matchingBins.map(count => count / maxCount) : null;

    return {
      total: normalizedTotal,
      matching: normalizedMatching
    };
  });

  readonly layoutWidth = computed(() => Math.max(10, this.containerWidth() - this.config.viewPaddingRight()));

  readonly processedLayout = computed(() => {
    const data = this.displayData();
    const width = this.layoutWidth();
    const sYear = this.startYear();
    const eYear = this.endYear();

    return data.categories.flatMap(cat => {
      const sublayouts: SubcategoryLayout[] = [];

      for (const sub of cat.subcategories) {
        const res = this.layout.computeLayout(sub.events, width, sYear, eYear);
        if (res.rowCount > 0) {
          sublayouts.push({ id: sub.id, name: sub.name, ...res });
        }
      }

      return sublayouts.length > 0 ?
        [{ id: cat.id, name: cat.name, color: cat.color, subcategories: sublayouts }] :
        [];
    });
  });

  readonly tocItems = computed<TocItem[]>(() => {
    const allCategories = this.parsedData().categories;

    const hiddenSet = this.hiddenCategoryIds();

    const isSearchActive = this.searchQuery().trim().length > 0;
    const matchIds = this.matchingEventIds();

    const showVisibleOnly = this.onlyShowVisibleInToc();

    const sYear = this.startYear();
    const eYear = this.endYear();
    const visibleVerticallySet = this.visibleCategoryIds();

    return allCategories
      .map(cat => {
        const isHidden = hiddenSet.has(cat.id);

        let total = 0;
        let filtered = 0;
        let visible = 0;

        for (const sub of cat.subcategories) {
          for (const evt of sub.events) {
            total++;

            if (isHidden) {
              continue;
            }

            const isMatch = !isSearchActive || (matchIds && matchIds.has(evt.id));

            if (isMatch) {
              filtered++;
              if (evt.end >= sYear && evt.start <= eYear) {
                visible++;
              }
            }
          }
        }

        const isFilteredOut = isSearchActive && filtered === 0 && !isHidden;
        const isOffScreen = filtered > 0 && visible === 0 && !isHidden;

        return {
          id: cat.id,
          name: cat.name,
          color: `hsl(${cat.color})`,
          isHidden,
          isFilteredOut,
          isOffScreen,
          isVisibleVertically: visibleVerticallySet.has(cat.id),
          countTotal: total,
          countFiltered: filtered,
          countVisible: visible
        };
      })
      .filter(item => {
        if (!showVisibleOnly) return true;
        if (item.isHidden) return false;
        if (item.isFilteredOut) return false;
        if (item.isOffScreen) return false;
        return true;
      });
  });

  readonly gridLines = computed(() =>
    this.layout.generateGridLines(
      this.startYear(),
      this.endYear(),
      this.layoutWidth(),
      this.config.minGridGap()
    )
  );

  setText(text: string) {
    this.inputText.set(text);
  }

  setRange(start: number, end: number) {
    this.startYear.set(start);
    this.endYear.set(end);
  }

  setContainerWidth(width: number) {
    this.containerWidth.set(width);
  }

  setActiveCategory(id: number | null) {
    this.activeCategoryId.set(id);
  }

  setVisibleCategoryIds(ids: Set<number>) {
    const current = this.visibleCategoryIds();
    if (current.size === ids.size) {
      let same = true;
      for (const id of ids) {
        if (!current.has(id)) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    this.visibleCategoryIds.set(ids);
  }

  setHoveredYear(year: number | null) {
    this.hoveredYear.set(year);
  }

  setPersistentMarker(year: number | null) {
    this.persistentMarkerYear.set(year);
  }

  toggleCategoryVisibility(id: number) {
    this.hiddenCategoryIds.update(set => {
      const newSet = new Set(set);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }

  toggleAllCategories(shouldBeVisible: boolean) {
    if (shouldBeVisible) {
      this.hiddenCategoryIds.set(new Set());
    } else {
      const allIds = this.parsedData().categories.map(c => c.id);
      this.hiddenCategoryIds.set(new Set(allIds));
    }
  }

  setOnlyShowVisibleInToc(enabled: boolean) {
    this.onlyShowVisibleInToc.set(enabled);
  }

  toggleSidebar() {
    this.isSidebarOpen.update(v => !v);
  }

  closeSidebar() {
    this.isSidebarOpen.set(false);
  }

  fitData() {
    const bounds = this.activeBounds();

    if (!bounds) return;

    if (bounds.min === bounds.max) {
      this.setRange(bounds.min - 1, bounds.max + 1);
    } else {
      this.setRange(bounds.min, bounds.max);
    }
  }

  async loadFromUrl() {
    this.isLoading.set(true);
    try {
      const response = await fetch(DATA_SOURCE_URL);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const text = await response.text();
      this.inputText.set(text);
      this.setRange(this.config.defaultStartYear, this.config.defaultEndYear);
    } catch (e) {
      console.error('Failed to load data', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  requestScrollToCategory(id: number) {
    this._scrollTo$.next(id);
    this.closeSidebar();
  }
}
