import { Injectable, inject } from '@angular/core';
import { TimelineStateService } from './timeline-state.service';

export type ExportScope = 'viewport' | 'full';

@Injectable({
  providedIn: 'root'
})
export class TimelineExportService {
  private state = inject(TimelineStateService);

  async printTimeline(scope: ExportScope) {
    const originalStart = this.state.startYear();
    const originalEnd = this.state.endYear();
    let didChangeRange = false;

    if (scope === 'full') {
      const bounds = this.state.dataBounds();
      if (bounds.min !== originalStart || bounds.max !== originalEnd) {
        this.state.setRange(bounds.min, bounds.max);
        didChangeRange = true;

        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    const cleanup = () => {
      if (didChangeRange) {
        this.state.setRange(originalStart, originalEnd);
      }
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    window.print();
  }
}
