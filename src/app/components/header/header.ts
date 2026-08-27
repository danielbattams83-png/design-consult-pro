import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MeasurementUnit, Project } from '../../models/project.model';
import { ProjectStore } from '../../services/project-store.service';
import { NewSurveyComponent } from '../new-survey/new-survey.component';

@Component({
  selector: 'app-header',
  imports: [CommonModule, FormsModule, MatIconModule, NewSurveyComponent],
  templateUrl: './header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  store = inject(ProjectStore);

  readonly isProjectDropdownOpen = signal<boolean>(false);
  readonly isNewProjectModalOpen = signal<boolean>(false);
  readonly isProjectManagerOpen = signal<boolean>(false);

  toggleProjectDropdown(): void {
    this.isProjectDropdownOpen.update((v) => !v);
  }

  // New Project Form Data
  readonly newProjName = signal<string>('');
  readonly newClientName = signal<string>('');
  readonly newSiteAddress = signal<string>('');
  readonly newProjectType = signal<Project['projectType']>('Whole Home');
  readonly newTargetBudget = signal<number>(85000);

  projects = this.store.projects;
  activeProject = this.store.activeProject;
  activeRoom = this.store.activeRoom;
  activeTab = this.store.currentActiveTab;
  isOnline = this.store.isOnline;
  unit = this.store.unit;
  totals = this.store.projectTotals;

  setTab(tab: 'dashboard' | 'survey' | 'measure' | 'conditions' | 'media' | 'ai' | 'report' | 'workspace'): void {
    this.store.setTab(tab);
  }

  toggleUnit(): void {
    const next: MeasurementUnit = this.unit() === 'imperial' ? 'metric' : 'imperial';
    this.store.setUnit(next);
  }

  selectProject(id: string): void {
    this.store.setActiveProject(id);
    this.isProjectDropdownOpen.set(false);
  }

  openNewProjectModal(): void {
    this.newProjName.set('New Residence Survey');
    this.newClientName.set('Client Name');
    this.newSiteAddress.set('123 Elm Street');
    this.newProjectType.set('Whole Home');
    this.newTargetBudget.set(95000);
    this.isNewProjectModalOpen.set(true);
    this.isProjectDropdownOpen.set(false);
  }

  submitNewProject(): void {
    const name = this.newProjName().trim() || 'New On-Site Survey';
    const client = this.newClientName().trim() || 'Client';
    const address = this.newSiteAddress().trim() || 'Site Address';

    this.store.createProject({
      name,
      clientName: client,
      siteAddress: address,
      projectType: this.newProjectType(),
      targetBudget: Number(this.newTargetBudget()) || 50000,
    });

    this.isNewProjectModalOpen.set(false);
    this.store.setTab('measure');
  }

  quickAddRoom(): void {
    const roomCount = (this.activeProject()?.rooms?.length || 0) + 1;
    const roomTypes = ['Dining Room', 'Kitchen Area', 'Guest Bedroom', 'Home Office Studio', 'Terrace / Balcony', 'Bathroom Suite'];
    const chosen = roomTypes[(roomCount - 1) % roomTypes.length];
    this.store.addRoomToActiveProject(chosen, 'Main Level', 'rect');
  }

  exportAllBackup(): void {
    this.store.exportAllProjectsJson();
  }

  handleJsonImport(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const success = this.store.importProjectsJson(reader.result as string);
      if (success) {
        alert('Survey records successfully restored!');
      } else {
        alert('Invalid survey backup file format.');
      }
      input.value = '';
    };
    reader.readAsText(file);
  }
}
