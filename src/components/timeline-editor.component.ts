import {
  Component,
  inject,
  viewChild,
  ElementRef,
  effect,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimelineStateService } from '../services/timeline-state.service';
import { TimelineUiStateService } from '../services/timeline-ui-state.service';
import { IconComponent } from './icon.component';

interface ErrorGroup {
  key: string;
  type: 'error' | 'warning';
  message: string;
  content: string;
  items: { line: number; extra?: string }[];
}

@Component({
  selector: 'app-timeline-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './timeline-editor.component.html',
  styleUrls: ['./timeline-editor.component.css'],
})
export class TimelineEditorComponent {
  state = inject(TimelineStateService);
  ui = inject(TimelineUiStateService);
  editorInput =
    viewChild.required<ElementRef<HTMLTextAreaElement>>('editorInput');

  readonly groupedErrors = computed<ErrorGroup[]>(() => {
    const errors = this.state.parsingErrors();
    const map = new Map<string, ErrorGroup>();

    for (const err of errors) {
      const key = `${err.type}_${err.message}_${err.content}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          type: err.type,
          message: err.message,
          content: err.content,
          items: [],
        });
      }
      map.get(key)!.items.push({ line: err.line, extra: err.extra });
    }

    return Array.from(map.values()).sort(
      (a, b) => a.items[0].line - b.items[0].line,
    );
  });

  readonly eventsOnCurrentLine = computed(() =>
    this.state.eventsOnEditorLine(),
  );
  readonly currentLineEventCount = computed(
    () => this.eventsOnCurrentLine().length,
  );

  readonly currentEventIndex = computed(() => {
    const events = this.eventsOnCurrentLine();
    const currentId = this.state.selectedEventId();
    if (events.length === 0 || currentId === null) return 0;
    const idx = events.findIndex((e) => e.id === currentId);
    return idx >= 0 ? idx + 1 : 0;
  });

  constructor() {
    effect(() => {
      const line = this.state.selectedEventLine();
      if (line !== null) {
        this.scrollToLine(line);
      }
    });
  }

  toggleErrorPanel() {
    this.ui.isErrorPanelExpanded.update((v) => !v);
  }

  jumpToLine(lineIndex: number, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    this.state.selectedEventLine.set(lineIndex);

    this.scrollToLine(lineIndex);
  }

  updateCursor(event: Event) {
    const el = event.target as HTMLTextAreaElement;
    const val = el.value;
    const sel = el.selectionStart;

    const line = val.substring(0, sel).split('\n').length - 1;

    if (this.state.editorLineNumber() !== line) {
      this.state.setEditorLineNumber(line);
    }
  }

  navigateEvents(dir: number) {
    const events = this.eventsOnCurrentLine();
    if (events.length === 0) return;

    const currentId = this.state.selectedEventId();
    const currentIdx = events.findIndex((e) => e.id === currentId);

    let newIdx = 0;

    if (currentIdx === -1) {
      newIdx = 0;
    } else {
      const len = events.length;
      newIdx = (currentIdx + dir) % len;
      if (newIdx < 0) newIdx += len;
    }

    const target = events[newIdx];
    this.state.navigateToEvent(target);
  }

  private scrollToLine(lineIndex: number) {
    const el = this.editorInput().nativeElement;
    const text = el.value;
    const lines = text.split('\n');

    if (lineIndex >= lines.length) return;

    let pos = 0;
    for (let i = 0; i < lineIndex; i++) {
      if (i < lines.length) {
        pos += lines[i].length + 1;
      }
    }

    el.focus();
    el.setSelectionRange(pos, pos);

    const lineHeight = 18;
    el.scrollTop = Math.max(0, lineIndex * lineHeight - el.clientHeight / 2);

    el.scrollLeft = 0;

    this.state.setEditorLineNumber(lineIndex);
  }
}
