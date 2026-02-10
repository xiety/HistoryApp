import { Injectable, inject, effect, WritableSignal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TimelineStateService } from './timeline-state.service';
import { TimelineConfigService } from './timeline-config.service';

@Injectable({
  providedIn: 'root'
})
export class TimelinePersistenceService {
  private state = inject(TimelineStateService);
  private config = inject(TimelineConfigService);

  private readonly KEY_TEXT = 'chronos-events-data';
  private readonly KEY_PREFS = 'timeline_preferences';
  private readonly KEY_RANGE = 'timeline_range';

  constructor() {
    this.restore();
    this.watch();
  }

  private restore() {
    const savedText = this.load<string>(this.KEY_TEXT);
    if (savedText && savedText.trim().length > 0) {
      this.state.setText(savedText);
    } else {
      this.state.loadFromUrl();
    }

    const prefs = this.load<any>(this.KEY_PREFS) || {};
    this.apply(prefs, 'hideSmallEvents', this.state.hideSmallEvents);
    this.apply(prefs, 'showLegends', this.state.showLegends);
    this.apply(prefs, 'showRelatedDots', this.state.showRelatedDots);
    this.apply(prefs, 'compactMode', this.state.compactMode);
    this.apply(prefs, 'isFilterMode', this.state.isFilterMode);
    this.apply(prefs, 'baseFontSize', this.config.baseFontSize);

    const range = this.load<any>(this.KEY_RANGE);
    if (range) {
      this.apply(range, 'start', this.state.startYear);
      this.apply(range, 'end', this.state.endYear);
    }
  }

  private watch() {
    toObservable(this.state.inputText)
      .pipe(
        debounceTime(1000),
        distinctUntilChanged()
      )
      .subscribe(val => this.save(this.KEY_TEXT, val));

    effect(() => {
      this.save(this.KEY_PREFS, {
        hideSmallEvents: this.state.hideSmallEvents(),
        showLegends: this.state.showLegends(),
        showRelatedDots: this.state.showRelatedDots(),
        compactMode: this.state.compactMode(),
        isFilterMode: this.state.isFilterMode(),
        baseFontSize: this.config.baseFontSize()
      });
    });

    combineLatest({
      start: toObservable(this.state.startYear),
      end: toObservable(this.state.endYear)
    })
      .pipe(debounceTime(500))
      .subscribe(range => this.save(this.KEY_RANGE, range));
  }

  private apply<T>(source: any, key: string, signal: WritableSignal<T>) {
    if (source && source[key] !== undefined) {
      signal.set(source[key]);
    }
  }

  private load<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  }

  private save(key: string, value: any) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Persistence save failed', e);
    }
  }
}
