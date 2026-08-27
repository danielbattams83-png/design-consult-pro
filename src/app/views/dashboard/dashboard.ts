import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MeasurementUnit, Project } from '../../models/project.model';
import { ProjectStore } from '../../services/project-store.service';
import { SurveyDataService } from '../../services/survey-data.service';
import { AuthService } from '../../services/auth.service';
import { NewSurveyComponent } from '../../components/new-survey/new-survey.component';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, FormsModule, MatIconModule, NewSurveyComponent],
  templateUrl: './dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  store = inject(ProjectStore);
  surveyService = inject(SurveyDataService);
  auth = inject(AuthService);

  // Accordion Step State (default open step 1 or step 3)
  readonly openStep = signal<number>(1);

  // Modals & Navigation
  readonly isNewProjectModalOpen = signal<boolean>(false);
  readonly isSettingsModalOpen = signal<boolean>(false);
  readonly isQuickNoteModalOpen = signal<boolean>(false);
  readonly quickNoteText = signal<string>('');

  // Primary signals from Store
  projects = this.store.projects;
  activeProject = this.store.activeProject;
  activeRoom = this.store.activeRoom;
  totals = this.store.projectTotals;
  unit = this.store.unit;
  isOnline = this.store.isOnline;
  currentUser = this.auth.currentUser;

  // New Project Form Inputs
  readonly newProjName = signal<string>('');
  readonly newClientName = signal<string>('');
  readonly newSiteAddress = signal<string>('');
  readonly newProjectType = signal<Project['projectType']>('Whole Home');
  readonly newTargetBudget = signal<number>(120000);
  readonly newLotNumber = signal<string>('Lot 148');
  readonly newRpNumber = signal<string>('RP849201');

  // Computed Status Bar Metrics
  readonly activeProjectsCount = computed(() => {
    return this.projects().filter((p) => p.status !== 'Completed').length;
  });

  readonly completedProjectsCount = computed(() => {
    return this.projects().filter((p) => p.status === 'Completed').length;
  });

  readonly totalRoomsCount = computed(() => {
    return this.activeProject()?.rooms?.length || 0;
  });

  readonly allProjectsTotalRooms = computed(() => {
    return this.projects().reduce((acc, p) => acc + (p.rooms?.length || 0), 0);
  });

  // Toggle Accordion Steps
  toggleStep(stepNumber: number): void {
    if (this.openStep() === stepNumber) {
      this.openStep.set(0); // allow collapsing all
    } else {
      this.openStep.set(stepNumber);
    }
  }

  isStepOpen(stepNumber: number): boolean {
    return this.openStep() === stepNumber;
  }

  // Navigation helpers to jump directly into specific dedicated workflow views
  navigateToTab(tab: 'survey' | 'measure' | 'conditions' | 'media' | 'ai' | 'report' | 'workspace'): void {
    this.store.setTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  openWorkspace(projectId?: string): void {
    if (projectId) {
      this.store.setActiveProject(projectId);
    }
    this.store.setTab('workspace');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Project Selection
  switchProject(projectId: string): void {
    this.store.setActiveProject(projectId);
  }

  toggleProjectStatus(): void {
    const proj = this.activeProject();
    if (!proj) return;
    const newStatus = proj.status === 'Completed' ? 'In Survey' : 'Completed';
    this.store.updateProject({
      ...proj,
      status: newStatus,
    });
  }

  // Open New Project Modal
  openNewProjectModal(): void {
    this.isNewProjectModalOpen.set(true);
  }

  onNewSurveyCreated(newProj: Project): void {
    this.store.setActiveProject(newProj.id);
    this.isNewProjectModalOpen.set(false);
    this.openStep.set(2);
  }

  // Quick Room Addition
  quickAddRoom(type: string): void {
    this.store.addRoomToActiveProject(type, 'Main Level', 'rect');
  }

  // Unit Switching
  toggleUnit(): void {
    const next: MeasurementUnit = this.unit() === 'imperial' ? 'metric' : 'imperial';
    this.store.setUnit(next);
  }

  // Settings & Reset
  resetDemoData(): void {
    this.surveyService.resetToMockDefaults();
    this.isSettingsModalOpen.set(false);
  }

  exportData(): void {
    this.store.exportAllProjectsJson();
  }

  logout(): void {
    this.auth.logout();
  }
}
