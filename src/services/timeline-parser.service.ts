import { Injectable } from '@angular/core';
import { generateCategoryColor } from '../utils/color.utils';

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

export interface TimelineError {
  line: number;
  content: string;
  message: string;
  type: 'error' | 'warning';
  extra?: string;
}

export interface TimelineData {
  categories: CategoryData[];
  groupCategories: Map<number, CategoryInfo[]>;
  errors: TimelineError[];
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

interface EventOccurrence {
  line: number;
  years: string;
  context: string;
}

@Injectable({
  providedIn: 'root',
})
export class TimelineParserService {
  private readonly HEADER_REGEX = /^#\s*(.+)$/;
  private readonly CAT_WITH_SUB_REGEX = /^(.+?)\s*\((.+)\)$/;
  private readonly MULTI_RANGE_REGEX =
    /^(.+) ((?:\d+(?: BCE)?(?:-\d+(?: BCE)?)?(?:, ?)?)+)$/;
  private readonly BCE_SUFFIX = ' BCE';

  private nextId = 0;
  private groupIdCounter = 0;

  parse(text: string): TimelineData {
    this.nextId = 0;
    this.groupIdCounter = 0;

    const context = {
      categories: [] as CategoryData[],
      groupCategories: new Map<number, CategoryInfo[]>(),
      errors: [] as TimelineError[],
      currentTargets: [] as Target[],
      minYear: Infinity,
      maxYear: -Infinity,
      hasEvents: false,
      headerMap: new Map<string, number[]>(),
      eventMap: new Map<string, EventOccurrence[]>(),
    };

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      this.processLine(lines[i], i, context);
    }

    this.checkDuplicates(context);

    context.errors.sort((a, b) => a.line - b.line);

    this.sortEvents(context.categories);

    return {
      categories: context.categories,
      groupCategories: context.groupCategories,
      errors: context.errors,
      minYear: context.hasEvents ? context.minYear : 0,
      maxYear: context.hasEvents ? context.maxYear : 0,
    };
  }

  private processLine(line: string, lineIndex: number, ctx: any) {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('#')) {
      const headerContent = trimmed.substring(1).trim();

      if (!ctx.headerMap.has(headerContent))
        ctx.headerMap.set(headerContent, []);
      ctx.headerMap.get(headerContent).push(lineIndex);

      const targets = this.parseHeader(trimmed);
      if (targets.length > 0) {
        ctx.currentTargets = targets;
      } else {
        ctx.errors.push({
          line: lineIndex,
          content: trimmed,
          message: 'Invalid header format',
          type: 'error',
        });
      }
      return;
    }

    const match = trimmed.match(this.MULTI_RANGE_REGEX);
    if (match) {
      if (ctx.currentTargets.length === 0) {
        ctx.errors.push({
          line: lineIndex,
          content: trimmed,
          message: 'Event defined before any Category header',
          type: 'error',
        });
        return;
      }

      const name = match[1].trim();
      const rangesPart = match[2].trim();

      if (!ctx.eventMap.has(name)) ctx.eventMap.set(name, []);

      const contextStr = ctx.currentTargets
        .map((t: Target) =>
          t.subcategory ? `${t.category} (${t.subcategory})` : t.category,
        )
        .join(', ');

      ctx.eventMap.get(name).push({
        line: lineIndex,
        years: rangesPart,
        context: contextStr,
      });

      const ranges = this.parseDateString(rangesPart);

      if (ranges.length > 0) {
        this.createEvents(name, ranges, lineIndex, ctx);
      } else {
        ctx.errors.push({
          line: lineIndex,
          content: trimmed,
          message: 'Could not parse date range',
          type: 'error',
        });
      }
      return;
    }

    ctx.errors.push({
      line: lineIndex,
      content: trimmed,
      message: 'Unrecognized format',
      type: 'error',
    });
  }

  private checkDuplicates(ctx: any) {
    ctx.headerMap.forEach((lines: number[], content: string) => {
      if (lines.length > 1) {
        lines.forEach((line) => {
          ctx.errors.push({
            line,
            content: `# ${content}`,
            message: 'Duplicate header definition',
            type: 'error',
          });
        });
      }
    });

    ctx.eventMap.forEach((occurrences: EventOccurrence[], name: string) => {
      if (occurrences.length > 1) {
        occurrences.forEach((occ) => {
          ctx.errors.push({
            line: occ.line,
            content: name,
            message: 'Duplicate event name',
            type: 'warning',
            extra: `${occ.years} (${occ.context})`,
          });
        });
      }
    });
  }

  private createEvents(
    name: string,
    ranges: DateRange[],
    lineIndex: number,
    ctx: any,
  ) {
    const groupId = ++this.groupIdCounter;
    ctx.hasEvents = true;

    const groupInfos = this.extractGroupInfo(
      ctx.currentTargets,
      ctx.categories,
    );
    if (groupInfos.length > 0) {
      ctx.groupCategories.set(groupId, groupInfos);
    }

    for (const range of ranges) {
      if (range.start < ctx.minYear) ctx.minYear = range.start;
      if (range.end > ctx.maxYear) ctx.maxYear = range.end;

      for (const target of ctx.currentTargets) {
        const cat = this.ensureCategory(target.category, ctx.categories);
        const sub = this.ensureSubcategory(cat, target.subcategory);

        sub.events.push({
          id: ++this.nextId,
          groupId,
          name,
          start: range.start,
          end: range.end,
          lineNumber: lineIndex,
        });
      }
    }
  }

  private extractGroupInfo(
    targets: Target[],
    categories: CategoryData[],
  ): CategoryInfo[] {
    const infos: CategoryInfo[] = [];
    const seen = new Set<string>();

    for (const t of targets) {
      if (!seen.has(t.category)) {
        seen.add(t.category);
        const cat = this.ensureCategory(t.category, categories);
        infos.push({ id: cat.id, name: cat.name, color: cat.color });
      }
    }
    return infos.sort((a, b) => a.name.localeCompare(b.name));
  }

  private ensureCategory(
    name: string,
    categories: CategoryData[],
  ): CategoryData {
    let cat = categories.find((c) => c.name === name);
    if (!cat) {
      cat = {
        id: ++this.nextId,
        name,
        color: generateCategoryColor(name),
        subcategories: [],
      };
      categories.push(cat);
    }
    return cat;
  }

  private ensureSubcategory(cat: CategoryData, name: string): SubcategoryData {
    let sub = cat.subcategories.find((s) => s.name === name);
    if (!sub) {
      sub = { id: ++this.nextId, name, events: [] };
      cat.subcategories.push(sub);
    }
    return sub;
  }

  private sortEvents(categories: CategoryData[]) {
    for (const cat of categories) {
      for (const sub of cat.subcategories) {
        sub.events.sort((a, b) => {
          if (a.start !== b.start) return a.start - b.start;
          return a.name.localeCompare(b.name);
        });
      }
    }
  }

  private parseHeader(line: string): Target[] {
    const match = line.match(this.HEADER_REGEX);
    if (!match) return [];
    const content = match[1].trim();
    if (!content) return [];

    if (content.includes(':')) {
      const [subPart, catPart] = content.split(':').map((s) => s.trim());
      return this.splitByComma(catPart || '').map((cat) => ({
        category: cat,
        subcategory: subPart,
      }));
    }

    return this.splitByComma(content).map((part) => {
      const subMatch = part.match(this.CAT_WITH_SUB_REGEX);
      return subMatch
        ? { category: subMatch[1].trim(), subcategory: subMatch[2].trim() }
        : { category: part, subcategory: '' };
    });
  }

  private parseDateString(dateStr: string): DateRange[] {
    return dateStr.split(',').map((part) => {
      const rangeParts = part.trim().split('-');
      const start = this.parseYear(rangeParts[0].trim());
      const end =
        rangeParts.length > 1 ? this.parseYear(rangeParts[1].trim()) : start;
      return { start, end };
    });
  }

  private parseYear(raw: string): number {
    if (raw.endsWith(this.BCE_SUFFIX)) {
      return -parseInt(raw.slice(0, -this.BCE_SUFFIX.length), 10);
    }
    return parseInt(raw, 10);
  }

  private splitByComma(str: string): string[] {
    return str
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
