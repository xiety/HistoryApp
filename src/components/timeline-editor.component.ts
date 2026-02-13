import { Component, inject, viewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimelineStateService } from '../services/timeline-state.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-timeline-editor',
  imports: [CommonModule, FormsModule],
  templateUrl: './timeline-editor.component.html',
  styleUrls: ['./timeline-editor.component.css']
})
export class TimelineEditorComponent {
  state = inject(TimelineStateService);
  editorInput = viewChild.required<ElementRef<HTMLTextAreaElement>>('editorInput');

  constructor() {
    effect(() => {
      const line = this.state.selectedEventLine();
      if (line !== null) {
        this.scrollToLine(line);
      }
    });
  }

  private scrollToLine(lineIndex: number) {
    const el = this.editorInput().nativeElement;
    const text = el.value;
    const lines = text.split('\n');

    let pos = 0;
    for (let i = 0; i < lineIndex; i++) {
      if (i < lines.length) {
        pos += lines[i].length + 1;
      }
    }

    const currentLine = lines[lineIndex];
    const endPos = pos + (currentLine ? currentLine.length : 0);

    el.focus();
    el.setSelectionRange(pos, endPos);

    el.blur();
    el.focus();
  }
}
