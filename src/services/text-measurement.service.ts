import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class TextMeasurementService {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private textWidthCache = new Map<string, number>();
  private lastFont = '';

  constructor() {
    this.initCanvas();
  }

  getTextWidth(text: string, font: string): number {
    if (font !== this.lastFont) {
      this.textWidthCache.clear();
      this.lastFont = font;
    }

    const key = text;
    if (this.textWidthCache.has(key)) {
      return this.textWidthCache.get(key)!;
    }

    if (!this.ctx) return 0;

    this.ctx.font = font;
    const width = this.ctx.measureText(text).width;
    this.textWidthCache.set(key, width);
    return width;
  }

  private initCanvas(): void {
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }
  }
}
