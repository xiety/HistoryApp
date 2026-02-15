import {
  Component,
  inject,
  viewChild,
  ElementRef,
  effect,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimelineStateService } from '../services/timeline-state.service';
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
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './timeline-editor.component.html',
  styleUrls: ['./timeline-editor.component.css'],
})
export class TimelineEditorComponent {
  state = inject(TimelineStateService);
  editorInput =
    viewChild.required<ElementRef<HTMLTextAreaElement>>('editorInput');

  isErrorPanelExpanded = signal<boolean>(true);

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

  constructor() {
    effect(() => {
      const line = this.state.selectedEventLine();
      if (line !== null) {
        this.scrollToLine(line);
      }
    });
  }

  toggleErrorPanel() {
    this.isErrorPanelExpanded.update((v) => !v);
  }

  jumpToLine(lineIndex: number, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    this.state.selectedEventLine.set(lineIndex);

    this.scrollToLine(lineIndex);
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
  }
}
