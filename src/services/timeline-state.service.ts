import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import {
  TimelineParserService,
  TimelineData,
  CategoryData,
  SubcategoryData,
  RawEvent,
  CategoryInfo,
} from './timeline-parser.service';
import {
  TimelineLayoutService,
  SubcategoryLayout,
  CategoryLayout,
} from './timeline-layout.service';
import { TimelineConfigService } from './timeline-config.service';
import { TimelineSearchService } from './timeline-search.service';
import { TimelineGeometryService } from './timeline-geometry.service';
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
  providedIn: 'root',
})
export class TimelineStateService {
  private readonly parser = inject(TimelineParserService);
  private readonly layout = inject(TimelineLayoutService);
  private readonly config = inject(TimelineConfigService);
  private readonly search = inject(TimelineSearchService);
  private readonly geometry = inject(TimelineGeometryService);

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

  readonly selectionPulse = signal<number>(0);
  readonly categoryPulse = signal<number>(0);

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

  readonly isUserInteracting = signal<boolean>(false);
  readonly isContentManipulation = signal<boolean>(false);

  readonly isMinimapInteracting = signal<boolean>(false);
  readonly tocFilterQuery = signal<string>('');

  readonly anchoredSubcategoryId = signal<number | null>(null);

  readonly editorLineNumber = signal<number | null>(null);

  readonly pendingScrollToEventId = signal<number | null>(null);

  readonly parsedData = computed(() => this.parser.parse(this.inputText()));

  readonly parsingErrors = computed(() => this.parsedData().errors);

  readonly eventsOnEditorLine = computed(() => {
    const line = this.editorLineNumber();
    if (line === null) return [];
    return this.parsedData().lineToEventsMap.get(line) || [];
  });

  readonly dataBounds = computed(() => ({
    min: this.parsedData().minYear,
    max: this.parsedData().maxYear,
  }));

  readonly layoutWidth = computed(() =>
    Math.max(10, this.containerWidth() - this.config.viewPaddingRight()),
  );

  readonly pixelsPerYear = computed(() => {
    return this.geometry.calculatePixelsPerYear(
      this.layoutWidth(),
      this.startYear(),
      this.endYear(),
    );
  });

  private readonly activeData = computed<TimelineData>(() => {
    const data = this.parsedData();
    const hideSmall = this.hideSmallEvents();
    if (!hideSmall) return data;

    const ppy = this.pixelsPerYear();
    if (ppy <= 0) return data;

    const categories: CategoryData[] = data.categories.map((cat) => ({
      ...cat,
      subcategories: cat.subcategories.map((sub) => ({
        ...sub,
        events: sub.events.filter((evt) => {
          const dur = Math.max(1, evt.end - evt.start);
          return dur * ppy >= 2;
        }),
      })),
    }));
    return { ...data, categories };
  });

  private readonly searchIndex = computed(() => {
    return this.search.buildSearchIndex(this.activeData(), this.searchQuery());
  });

  readonly matchingEventIds = computed(
    () => this.searchIndex()?.matches ?? null,
  );
  readonly matchCount = computed(() => this.matchingEventIds()?.size ?? 0);
  readonly matchingBounds = computed(() => this.searchIndex()?.bounds ?? null);

  readonly gridLines = computed(() =>
    this.geometry.generateGridLines(
      this.startYear(),
      this.endYear(),
      this.layoutWidth(),
      this.config.minGridGap(),
    ),
  );

  readonly renderableData = computed<TimelineData>(() => {
    const data = this.activeData();
    const hidden = this.hiddenCategoryIds();
    const filter = this.isFilterMode();
    const matches = this.matchingEventIds();
    const isSearch = matches !== null;

    if (!filter || !isSearch) {
      if (hidden.size === 0) return data;
      return {
        ...data,
        categories: data.categories.filter((c) => !hidden.has(c.id)),
      };
    }

    const categories: CategoryData[] = [];

    for (const cat of data.categories) {
      if (hidden.has(cat.id)) continue;

      const subcategories: SubcategoryData[] = [];
      for (const sub of cat.subcategories) {
        const events = sub.events.filter((evt) => matches.has(evt.id));

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

  readonly processedLayout = computed<CategoryLayout[]>(() => {
    const data = this.renderableData();
    const width = this.layoutWidth();
    const start = this.startYear();
    const end = this.endYear();
    const showLegends = this.showLegends();
    const compactMode = this.compactMode();

    const rawCategories = data.categories.flatMap((cat) => {
      const sublayouts: SubcategoryLayout[] = [];

      for (const sub of cat.subcategories) {
        const res = this.layout.computeLayout(
          sub.events,
          width,
          start,
          end,
          showLegends,
          compactMode,
        );

        if (res.rowCount > 0) {
          sublayouts.push({
            id: sub.id,
            name: sub.name,
            y: 0,
            totalHeight: 0,
            ...res,
          });
        }
      }

      if (sublayouts.length > 0) {
        return [
          {
            id: cat.id,
            name: cat.name,
            color: cat.color,
            subcategories: sublayouts,
            y: 0,
            height: 0,
          },
        ];
      }
      return [];
    });

    return this.layout.computeVerticalPositions(rawCategories);
  });

  readonly activeBounds = computed(() => {
    const hidden = this.hiddenCategoryIds();
    const matches = this.matchingEventIds();
    const isSearch = matches !== null;
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
    return this.search.computeDensity(
      this.renderableData(),
      this.dataBounds(),
      this.matchingEventIds(),
    );
  });

  readonly tocItems = computed<TocItem[]>(() => {
    const hidden = this.hiddenCategoryIds();
    const visibleVertically = this.visibleCategoryIds();
    const matches = this.matchingEventIds();
    const isSearch = matches !== null;
    const sYear = this.startYear();
    const eYear = this.endYear();
    const items: TocItem[] = [];
    const showVisibleOnly = this.onlyShowVisibleInToc();
    const data = this.activeData();

    for (const cat of data.categories) {
      let cTotal = 0,
        cFiltered = 0,
        cVisible = 0,
        cPotential = 0;
      const isCatHidden = hidden.has(cat.id);
      for (const sub of cat.subcategories) {
        for (const evt of sub.events) {
          cTotal++;
          const isMatch = !isSearch || (matches && matches.has(evt.id));
          if (!isMatch) continue;
          cFiltered++;
          if (evt.end >= sYear && evt.start <= eYear) {
            cPotential++;
            if (!isCatHidden) cVisible++;
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
        countVisible: cVisible,
      });
    }
    return items;
  });

  readonly filteredTocItems = computed(() => {
    const items = this.tocItems();
    const query = this.tocFilterQuery().trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.name.toLowerCase().includes(query));
  });

  readonly tocToggleState = computed<TocToggleState>(() => {
    const items = this.filteredTocItems();
    const count = items.length;
    if (count === 0)
      return { checked: false, indeterminate: false, hasItems: false };
    const checkedCount = items.filter((i) => !i.isHidden).length;
    return {
      checked: checkedCount === count,
      indeterminate: checkedCount > 0 && checkedCount < count,
      hasItems: true,
    };
  });

  readonly tocTotals = computed(() => {
    const items = this.tocItems();
    return items.reduce(
      (acc, item) => ({
        total: acc.total + item.countTotal,
        filtered: acc.filtered + item.countFiltered,
        visible: acc.visible + item.countVisible,
        checkedCategories: acc.checkedCategories + (item.isHidden ? 0 : 1),
        totalCategories: items.length,
      }),
      {
        total: 0,
        filtered: 0,
        visible: 0,
        checkedCategories: 0,
        totalCategories: items.length,
      },
    );
  });

  getGroupCategories(groupId: number): CategoryInfo[] {
    return this.activeData().groupCategories.get(groupId) || [];
  }

  setText(text: string) {
    this.inputText.set(text);
    this.clearEventSelection();
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
  setTocFilterQuery(query: string) {
    this.tocFilterQuery.set(query);
  }
  setVisibleCategoryIds(ids: Set<number>) {
    const prev = this.visibleCategoryIds();
    if (prev.size !== ids.size || [...ids].some((id) => !prev.has(id)))
      this.visibleCategoryIds.set(ids);
  }
  setHoveredYear(year: number | null) {
    this.hoveredYear.set(year);
  }
  setPersistentMarker(year: number | null) {
    this.persistentMarkerYear.set(year);
  }
  setEditorLineNumber(line: number | null) {
    this.editorLineNumber.set(line);
  }

  toggleEventSelection(raw: RawEvent) {
    if (this.selectedEventId() === raw.id) {
      this.clearEventSelection();
    } else {
      this.selectEvent(raw, 'user');
    }
  }

  selectEvent(raw: RawEvent, origin: 'user' | 'programmatic' = 'user') {
    this.selectedEventId.set(raw.id);
    this.selectedGroupId.set(raw.groupId);
    this.selectedEventLine.set(raw.lineNumber);

    if (origin === 'programmatic') {
      this.selectionPulse.update((n) => n + 1);
    }
  }

  navigateToEvent(event: RawEvent) {
    const span = this.endYear() - this.startYear();
    this.setRange(event.start, event.start + span);
    this.selectEvent(event, 'programmatic');
    this.pendingScrollToEventId.set(event.id);
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
    this.hiddenCategoryIds.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  setCategoryVisibilityMulti(ids: Iterable<number>, visible: boolean) {
    this.hiddenCategoryIds.update((current) => {
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
    const ids = items.map((item) => item.id);
    if (ids.length > 0) this.setCategoryVisibilityMulti(ids, targetVisible);
  }

  setOnlyShowVisibleInToc(val: boolean) {
    this.onlyShowVisibleInToc.set(val);
  }

  fitData() {
    const b = this.activeBounds();
    if (!b) return;
    if (b.min === b.max) this.setRange(b.min - 1, b.max + 1);
    else this.setRange(b.min, b.max);
  }

  requestScrollToCategory(id: number) {
    this._scrollTo$.next(id);
    this.highlightedCategoryId.set(id);
    this.categoryPulse.update((n) => n + 1);
  }

  async loadFromUrl() {
    this.isLoading.set(true);
    try {
      const res = await fetch(DATA_SOURCE_URL);
      if (!res.ok) throw new Error('Fetch error');
      this.setText(await res.text());
      this.startYear.set(this.config.defaultStartYear);
      this.endYear.set(this.config.defaultEndYear);
    } catch (e) {
      console.error(e);
    } finally {
      this.isLoading.set(false);
    }
  }
}
