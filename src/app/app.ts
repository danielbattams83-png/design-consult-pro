import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { HeaderComponent } from './components/header/header';
import { AuthService } from './services/auth.service';
import { ProjectStore } from './services/project-store.service';
import { DashboardComponent } from './views/dashboard/dashboard';
import { AiProposalViewComponent } from './views/ai-proposal-view/ai-proposal-view';
import { ConditionsViewComponent } from './views/conditions-view/conditions-view';
import { MeasureViewComponent } from './views/measure-view/measure-view';
import { MediaViewComponent } from './views/media-view/media-view';
import { ReportViewComponent } from './views/report-view/report-view';
import { SurveyViewComponent } from './views/survey-view/survey-view';
import { ProjectWorkspaceComponent } from './components/project-workspace/project-workspace.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [
    CommonModule,
    MatIconModule,
    HeaderComponent,
    DashboardComponent,
    MeasureViewComponent,
    SurveyViewComponent,
    ConditionsViewComponent,
    MediaViewComponent,
    AiProposalViewComponent,
    ReportViewComponent,
    ProjectWorkspaceComponent,
  ],
  templateUrl: './app.html',
})
export class App {
  auth = inject(AuthService);
  store = inject(ProjectStore);

  activeTab = this.store.currentActiveTab;

  // Settings Modal State for Global Mobile Navigation
  readonly isGlobalSettingsOpen = signal<boolean>(false);

  setTab(tab: 'dashboard' | 'survey' | 'measure' | 'conditions' | 'media' | 'ai' | 'report' | 'workspace'): void {
    this.store.setTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleGlobalSettings(): void {
    this.isGlobalSettingsOpen.update((v) => !v);
  }

  exportData(): void {
    this.store.exportAllProjectsJson();
  }

  resetDemoData(): void {
    this.store.resetToDemoProject();
    this.isGlobalSettingsOpen.set(false);
  }
}
