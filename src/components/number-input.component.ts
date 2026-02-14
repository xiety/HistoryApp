import {
  Component,
  input,
  output,
  viewChild,
  ElementRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-number-input',
  imports: [CommonModule, FormsModule],
  templateUrl: './number-input.component.html',
  styleUrls: ['./number-input.component.css'],
})
export class NumberInputComponent {
  value = input.required<number>();
  valueChange = output<number>();

  min = input(Number.MIN_SAFE_INTEGER);
  max = input(Number.MAX_SAFE_INTEGER);
  step = input(1);
  shiftStep = input(10);

  readonly inputRef =
    viewChild.required<ElementRef<HTMLInputElement>>('inputEl');

  constructor() {
    effect(() => {
      const el = this.inputRef().nativeElement;
      const formatted = this.format(this.value());

      if (el.value !== formatted) {
        el.value = formatted;
      }

      if (document.activeElement === el) {
        el.select();
      }
    });
  }

  private format(val: number): string {
    return String(Math.round(val));
  }

  onFocus() {
    this.inputRef().nativeElement.select();
  }

  onBlur() {
    this.commit();
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.inputRef().nativeElement.blur();
    }
  }

  private commit() {
    const el = this.inputRef().nativeElement;
    const raw = parseInt(el.value, 10);
    const current = this.value();

    el.value = this.format(current);

    if (isNaN(raw)) return;

    const clamped = Math.max(this.min(), Math.min(this.max(), raw));

    if (clamped !== current) {
      this.valueChange.emit(clamped);
    }
  }

  doStep(dir: -1 | 1, event: MouseEvent) {
    const increment = event.shiftKey ? this.shiftStep() : this.step();
    const next = Math.round(this.value()) + dir * increment;
    const clamped = Math.max(this.min(), Math.min(this.max(), next));

    this.valueChange.emit(clamped);
  }
}
