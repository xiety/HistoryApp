import { Injectable } from '@angular/core';

export interface RawEvent {
  id: number;
  groupId: number;
  name: string;
  start: number;
  end: number;
}

export interface SubcategoryData {
  id: number;
  name: string;
  events: RawEvent[];
}

export interface CategoryData {
  id: number;
  name: string;
  color: string;
  subcategories: SubcategoryData[];
}

export interface TimelineData {
  categories: CategoryData[];
  minYear: number;
  maxYear: number;
}

interface ParserContext {
  currentCategories: string[];
  currentSubcategory: string;
  eventInstanceCounter: number;
  groupCounter: number;
  minYear: number | null;
  maxYear: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class TimelineParserService {
  private readonly headerRegex = /^#\s*(.+)$/;
  private readonly eventRegex = /^(.*?)\s+(-?\d+)(?:-(-?\d+))?\s*$/;

  parse(text: string): TimelineData {
    const catMap = new Map<string, Map<string, RawEvent[]>>();

    const context: ParserContext = {
      currentCategories: [],
      currentSubcategory: '',
      eventInstanceCounter: 0,
      groupCounter: 0,
      minYear: null,
      maxYear: null
    };

    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (this.headerRegex.test(trimmed)) {
        this.processHeader(trimmed, context);
      } else {
        this.processEventLine(trimmed, context, catMap);
      }
    }

    this.normalizeYears(context);
    return this.buildStructure(catMap, context);
  }

  private processHeader(line: string, ctx: ParserContext): void {
    const match = line.match(this.headerRegex);
    if (!match) return;

    const content = match[1];
    const sepIndex = content.indexOf(':');

    if (sepIndex >= 0) {
      ctx.currentSubcategory = content.substring(0, sepIndex).trim();
      ctx.currentCategories = this.splitList(content.substring(sepIndex + 1));
    } else {
      ctx.currentSubcategory = '';
      ctx.currentCategories = this.splitList(content);
    }
  }

  private splitList(text: string): string[] {
    return text.split(',').map(c => c.trim()).filter(Boolean);
  }

  private processEventLine(line: string, ctx: ParserContext, map: Map<string, Map<string, RawEvent[]>>): void {
    const match = line.match(this.eventRegex);
    if (!match) return;

    const name = match[1].trim();
    const start = parseInt(match[2], 10);
    const end = match[3] ? parseInt(match[3], 10) : start;

    if (ctx.minYear === null || start < ctx.minYear) ctx.minYear = start;
    if (ctx.maxYear === null || end > ctx.maxYear) ctx.maxYear = end;

    const groupId = ++ctx.groupCounter;

    for (const cat of ctx.currentCategories) {
      let subMap = map.get(cat);
      if (!subMap) {
        subMap = new Map<string, RawEvent[]>();
        map.set(cat, subMap);
      }

      let eventList = subMap.get(ctx.currentSubcategory);
      if (!eventList) {
        eventList = [];
        subMap.set(ctx.currentSubcategory, eventList);
      }

      eventList.push({
        id: ++ctx.eventInstanceCounter,
        groupId,
        name,
        start,
        end
      });
    }
  }

  private normalizeYears(ctx: ParserContext): void {
    if (ctx.minYear === null || ctx.maxYear === null) {
      ctx.minYear = 0;
      ctx.maxYear = 0;
    }
  }

  private buildStructure(catMap: Map<string, Map<string, RawEvent[]>>, ctx: ParserContext): TimelineData {
    const categories: CategoryData[] = [];
    let structureIdCounter = 100000;

    for (const [catName, subMap] of catMap) {
      const subcategories: SubcategoryData[] = [];

      for (const [subName, events] of subMap) {
        events.sort((a, b) => {
          if (a.start !== b.start) return a.start - b.start;
          return a.name.localeCompare(b.name);
        });

        subcategories.push({
          id: ++structureIdCounter,
          name: subName,
          events
        });
      }

      categories.push({
        id: ++structureIdCounter,
        name: catName,
        color: this.generateColor(catName),
        subcategories
      });
    }

    return {
      categories,
      minYear: ctx.minYear ?? 0,
      maxYear: ctx.maxYear ?? 0
    };
  }

  private generateColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    const s = 75 + (Math.abs(hash) % 25);
    const l = 35 + (Math.abs(hash) % 15);
    return `${h}, ${s}%, ${l}%`;
  }
}
