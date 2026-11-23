import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActionItem } from '../../models/project.model';
import { ConditionsViewComponent } from '../conditions-view/conditions-view';
import { SurveyViewComponent } from '../survey-view/survey-view';
import { ProjectStore } from '../../services/project-store.service';

@Component({
  selector: 'app-site-brief-view',
  imports: [CommonModule, FormsModule, MatIconModule, SurveyViewComponent, ConditionsViewComponent],
  templateUrl: './site-brief-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteBriefViewComponent {
  store = inject(ProjectStore);
  readonly draft = signal('');
  readonly category = signal<ActionItem['category']>('Design');

  addItem(): void {
    const text = this.draft().trim();
    if (!text) return;
    this.store.updateActiveProject((project) => {
      project.actionItems = [
        { id: 'act_' + Date.now(), text, category: this.category(), completed: false, priority: 'medium' },
        ...(project.actionItems || []),
      ];
    });
    this.draft.set('');
  }

  toggle(id: string): void {
    this.store.updateActiveProject((project) => {
      project.actionItems = (project.actionItems || []).map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      );
    });
  }

  remove(id: string): void {
    this.store.updateActiveProject((project) => {
      project.actionItems = (project.actionItems || []).filter((item) => item.id !== id);
    });
  }
}
