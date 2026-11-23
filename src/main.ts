import {bootstrapApplication} from '@angular/platform-browser';
import {App} from './app/app';
import {appConfig} from './app/app.config';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.location.port === '') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((error) => {
      console.warn('Offline shell was not registered', error);
    });
  });
}
