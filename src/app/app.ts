import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { HeaderComponent } from './components/header/header';
import { RecordingBarComponent } from './components/audio-recorder/recording-bar';
import { PhotoAnnotatorComponent } from './components/photo-annotator/photo-annotator';
import { AuthService } from './services/auth.service';
import { ExportPackageService } from './services/export-package.service';
import { FieldTab, ProjectStore } from './services/project-store.service';
import { MeasureViewComponent } from './views/measure-view/measure-view';
import { RecordViewComponent } from './views/record-view/record-view';
import { SiteBriefViewComponent } from './views/site-brief-view/site-brief-view';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [
    CommonModule,
    MatIconModule,
    HeaderComponent,
    RecordingBarComponent,
    PhotoAnnotatorComponent,
    MeasureViewComponent,
    RecordViewComponent,
    SiteBriefViewComponent,
  ],
  templateUrl: './app.html',
})
export class App {
  auth = inject(AuthService);
  store = inject(ProjectStore);
  private packages = inject(ExportPackageService);

  activeTab = this.store.currentActiveTab;
  readonly isGlobalSettingsOpen = signal(false);
  readonly exportMessage = signal<string | null>(null);

  setTab(tab: FieldTab): void {
    this.store.setTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  exportData(): void {
    this.store.exportAllProjectsJson();
  }

  async exportConceptPackage(): Promise<void> {
    const project = this.store.activeProject();
    if (!project) {
      this.exportMessage.set('Open a project before exporting a concept package.');
      return;
    }
    this.exportMessage.set('Packing drawings, photos, and the brief…');
    try {
      await this.packages.exportConceptPackage(project);
      this.exportMessage.set('Concept package downloaded.');
    } catch (error) {
      console.error(error);
      this.exportMessage.set('The concept package could not be built on this device.');
    }
  }

  resetDemoData(): void {
    this.store.resetToDemoProject();
    this.isGlobalSettingsOpen.set(false);
  }
}
