import { Injectable } from '@angular/core';

export interface RawEvent {
  id: number;
  groupId: number;
  name: string;
  start: number;
  end: number;
  lineNumber: number;
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

export interface CategoryInfo {
  id: number;
  name: string;
  color: string;
}

export interface TimelineData {
  categories: CategoryData[];
  groupCategories: Map<number, CategoryInfo[]>;
  minYear: number;
  maxYear: number;
}

interface Target {
  category: string;
  subcategory: string;
}

interface DateRange {
  start: number;
  end: number;
}

@Injectable({
  providedIn: 'root'
})
export class TimelineParserService {

  private readonly HEADER_REGEX = /^#\s*(.+)$/;

  private readonly CAT_WITH_SUB_REGEX = /^(.+?)\s*\((.+)\)$/;

  private readonly MULTI_RANGE_REGEX = /^(.+) ((?:\d+(?: BCE)?(?:-\d+(?: BCE)?)?(?:, ?)?)+)$/;

  private readonly BCE_SUFFIX = ' BCE';

  private nextId = 0;
  private groupIdCounter = 0;

  parse(text: string): TimelineData {
    this.nextId = 0;
    this.groupIdCounter = 0;

    const categories: CategoryData[] = [];
    const groupCategories = new Map<number, CategoryInfo[]>();

    let minYear = Infinity;
    let maxYear = -Infinity;
    let hasEvents = false;

    const ensureCategory = (name: string): CategoryData => {
      let cat = categories.find(c => c.name === name);
      if (!cat) {
        cat = {
          id: ++this.nextId,
          name,
          color: this.generateColor(name),
          subcategories: []
        };
        categories.push(cat);
      }
      return cat;
    };

    const ensureSubcategory = (cat: CategoryData, name: string): SubcategoryData => {
      let sub = cat.subcategories.find(s => s.name === name);
      if (!sub) {
        sub = { id: ++this.nextId, name, events: [] };
        cat.subcategories.push(sub);
      }
      return sub;
    };

    let currentTargets: Target[] = [];

    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('#')) {
        currentTargets = this.parseHeader(trimmed);
        continue;
      }

      if (currentTargets.length === 0) continue;

      const match = trimmed.match(this.MULTI_RANGE_REGEX);
      if (!match) continue;

      const name = match[1];
      const ranges = this.parseDateString(match[2]);

      if (ranges.length > 0) {
        const groupId = ++this.groupIdCounter;
        hasEvents = true;

        const groupInfos: CategoryInfo[] = [];
        const seenCats = new Set<string>();

        for (const target of currentTargets) {
          if (!seenCats.has(target.category)) {
            seenCats.add(target.category);
            const cat = ensureCategory(target.category);
            groupInfos.push({ id: cat.id, name: cat.name, color: cat.color });
          }
        }

        if (groupInfos.length > 0) {
          groupInfos.sort((a, b) => a.name.localeCompare(b.name));
          groupCategories.set(groupId, groupInfos);
        }

        for (const range of ranges) {
          if (range.start < minYear) minYear = range.start;
          if (range.end > maxYear) maxYear = range.end;

          for (const target of currentTargets) {
            const cat = ensureCategory(target.category);
            const sub = ensureSubcategory(cat, target.subcategory);

            sub.events.push({
              id: ++this.nextId,
              groupId,
              name,
              start: range.start,
              end: range.end,
              lineNumber: i
            });
          }
        }
      }
    }

    for (const cat of categories) {
      for (const sub of cat.subcategories) {
        sub.events.sort((a, b) => {
          if (a.start !== b.start) return a.start - b.start;
          return a.name.localeCompare(b.name);
        });
      }
    }

    return {
      categories,
      groupCategories,
      minYear: hasEvents ? minYear : 0,
      maxYear: hasEvents ? maxYear : 0
    };
  }

  private parseHeader(line: string): Target[] {
    const match = line.match(this.HEADER_REGEX);
    if (!match) return [];

    const content = match[1].trim();
    if (!content) return [];

    if (content.includes(':')) {
      const [subPart, catPart] = content.split(':').map(s => s.trim());
      return this.splitByComma(catPart || '').map(cat => ({
        category: cat,
        subcategory: subPart
      }));
    }

    return this.splitByComma(content).map(part => {
      const subMatch = part.match(this.CAT_WITH_SUB_REGEX);
      if (subMatch) {
        return {
          category: subMatch[1].trim(),
          subcategory: subMatch[2].trim()
        };
      }
      return { category: part, subcategory: '' };
    });
  }

  private parseDateString(dateStr: string): DateRange[] {
    return dateStr.split(',').map(part => {
      const rangeParts = part.trim().split('-');
      const start = this.parseYear(rangeParts[0].trim());
      const end = rangeParts.length > 1 ? this.parseYear(rangeParts[1].trim()) : start;
      return { start, end };
    });
  }

  private parseYear(raw: string): number {
    if (raw.endsWith(this.BCE_SUFFIX)) {
      const numberPart = raw.slice(0, -this.BCE_SUFFIX.length);
      return -parseInt(numberPart, 10);
    }
    return parseInt(raw, 10);
  }

  private splitByComma(str: string): string[] {
    return str.split(',').map(s => s.trim()).filter(Boolean);
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
