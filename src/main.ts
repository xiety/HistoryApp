import { bootstrapApplication } from '@angular/platform-browser';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { AppComponent } from './app.component';

const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners()
  ]
};

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
