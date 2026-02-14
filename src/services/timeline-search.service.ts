import { Injectable } from '@angular/core';
import { TimelineData } from './timeline-parser.service';
import { DensityData } from './timeline-state.service';

export interface SearchResult {
  matches: Set<number>;
  bounds: { min: number; max: number; } | null;
}

@Injectable({
  providedIn: 'root'
})
export class TimelineSearchService {

  buildSearchIndex(data: TimelineData, query: string): SearchResult | null {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return null;

    const matches = new Set<number>();
    let min = Infinity;
    let max = -Infinity;

    for (const cat of data.categories) {
      for (const sub of cat.subcategories) {
        for (const evt of sub.events) {
          const nameMatch = evt.name.toLowerCase().includes(normalizedQuery);
          const startMatch = evt.start.toString() === normalizedQuery;
          const endMatch = evt.end.toString() === normalizedQuery;

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
  }

  computeDensity(
    data: TimelineData,
    bounds: { min: number, max: number; },
    matchingIds: Set<number> | null
  ): DensityData {
    const span = bounds.max - bounds.min;
    if (span <= 0) return { total: [], matching: null };

    const bins = 200;
    const step = span / bins;

    const total = new Array(bins).fill(0);
    const matching = matchingIds ? new Array(bins).fill(0) : null;

    let maxVal = 0;

    for (const cat of data.categories) {
      for (const sub of cat.subcategories) {
        for (const evt of sub.events) {
          const sIdx = Math.floor((evt.start - bounds.min) / step);
          const eIdx = Math.floor((evt.end - bounds.min) / step);

          const start = Math.max(0, Math.min(bins - 1, sIdx));
          const end = Math.max(0, Math.min(bins - 1, eIdx));

          const isMatch = matchingIds && matchingIds.has(evt.id);

          for (let i = start; i <= end; i++) {
            total[i]++;
            if (isMatch && matching) matching[i]++;
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
  }
}
