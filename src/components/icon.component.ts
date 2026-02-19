import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type IconName =
  | 'menu'
  | 'search'
  | 'x'
  | 'eye'
  | 'eye-off'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevron-down'
  | 'chevrons-left'
  | 'chevrons-right';

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './icon.component.html',
  styleUrls: ['./icon.component.css'],
})
export class IconComponent {
  name = input.required<IconName>();
  size = input<number | string>(24);
  strokeWidth = input<number | string>(2);
  class = input<string>('');
}
