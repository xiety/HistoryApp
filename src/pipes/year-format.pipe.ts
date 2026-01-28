import { Pipe, PipeTransform } from '@angular/core';

/**
 * Pure utility function to format a year number.
 * Handles negative numbers as BCE.
 */
export function formatYear(year: number | null | undefined): string {
  if (year === null || year === undefined) return '';

  const val = Math.round(year);

  if (val < 0) {
    return `${Math.abs(val)} BCE`;
  }
  return val.toString();
}

@Pipe({
  name: 'yearFormat',
  standalone: true
})
export class YearFormatPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatYear(value);
  }
}
