import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineControlsComponent } from './components/timeline-controls.component';
import { TimelineSidebarComponent } from './components/timeline-sidebar.component';
import { TimelineWorkspaceComponent } from './components/timeline-workspace.component';
import { TimelineMiniMapComponent } from './components/timeline-mini-map.component';
import { TimelinePersistenceService } from './services/timeline-persistence.service';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    TimelineControlsComponent,
    TimelineSidebarComponent,
    TimelineWorkspaceComponent,
    TimelineMiniMapComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  private persistence = inject(TimelinePersistenceService);
}
