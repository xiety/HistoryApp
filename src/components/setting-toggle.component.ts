import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-setting-toggle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './setting-toggle.component.html',
  styleUrls: ['./setting-toggle.component.css']
})
export class SettingToggleComponent {
  label = input.required<string>();
  description = input<string>('');
  value = input.required<boolean>();
  valueChange = output<boolean>();
}
