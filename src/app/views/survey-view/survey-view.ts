import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { PRESET_MATERIALS, PRESET_STYLES, Project } from '../../models/project.model';
import { ProjectStore } from '../../services/project-store.service';

@Component({
  selector: 'app-survey-view',
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './survey-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyViewComponent {
  store = inject(ProjectStore);

  activeProject = this.store.activeProject;
  presetStyles = PRESET_STYLES;
  presetMaterials = PRESET_MATERIALS;

  readonly colorPalettes = [
    { name: 'Warm Organic Neutrals', colors: ['#FAF8F5', '#EFE9E1', '#D8CCBD', '#8C7A6B', '#2C2824'] },
    { name: 'Nordic Forest & Slate', colors: ['#F3F5F4', '#DCE3E1', '#A8B7B2', '#52665F', '#1E2927'] },
    { name: 'Desert Earth & Terracotta', colors: ['#FDF8F5', '#F5E6DC', '#E0A88B', '#B86843', '#4A2A1E'] },
    { name: 'Coastal Dune & Soft Indigo', colors: ['#F8F9FA', '#E8EDF2', '#B4C5D4', '#5B7C99', '#1E2D3D'] },
    { name: 'High-Contrast Monolith', colors: ['#FFFFFF', '#F1F3F5', '#868E96', '#343A40', '#0B0C0E'] },
  ];

  readonly functionalOptions = [
    { id: 'storage', label: 'Maximum Concealed Storage', icon: 'inventory_2' },
    { id: 'light', label: 'Maximize Natural Light Exposure', icon: 'wb_sunny' },
    { id: 'pet_kid', label: 'Pet & Kid High-Durability Materials', icon: 'pets' },
    { id: 'wfh', label: 'Dedicated Ergonomic Work-From-Home', icon: 'laptop_mac' },
    { id: 'entertain', label: 'Host & Entertain 8+ Guests', icon: 'wine_bar' },
    { id: 'smart_home', label: 'Smart Home & Automated Lighting MEP', icon: 'settings_remote' },
    { id: 'spa_bath', label: 'Spa-Inspired Wet Room / Soaking Bath', icon: 'bathtub' },
    { id: 'chef_kitchen', label: 'Gourmet Chef Work Triangle & Pantry', icon: 'countertops' },
  ];

  toggleStyle(styleName: string): void {
    this.store.updateActiveProject((p: Project) => {
      p.survey.selectedStyles = p.survey.selectedStyles || [];
      const idx = p.survey.selectedStyles.indexOf(styleName);
      if (idx >= 0) {
        p.survey.selectedStyles.splice(idx, 1);
      } else {
        p.survey.selectedStyles.push(styleName);
      }
      return p;
    });
  }

  isStyleSelected(styleName: string): boolean {
    return (this.activeProject()?.survey.selectedStyles || []).includes(styleName);
  }

  toggleMaterial(matName: string): void {
    this.store.updateActiveProject((p: Project) => {
      p.survey.preferredMaterials = p.survey.preferredMaterials || [];
      const idx = p.survey.preferredMaterials.indexOf(matName);
      if (idx >= 0) {
        p.survey.preferredMaterials.splice(idx, 1);
      } else {
        p.survey.preferredMaterials.push(matName);
      }
      return p;
    });
  }

  isMaterialSelected(matName: string): boolean {
    return (this.activeProject()?.survey.preferredMaterials || []).includes(matName);
  }

  togglePriority(priority: string): void {
    this.store.updateActiveProject((p: Project) => {
      p.survey.functionalPriorities = p.survey.functionalPriorities || [];
      const idx = p.survey.functionalPriorities.indexOf(priority);
      if (idx >= 0) {
        p.survey.functionalPriorities.splice(idx, 1);
      } else {
        p.survey.functionalPriorities.push(priority);
      }
      return p;
    });
  }

  isPrioritySelected(priority: string): boolean {
    return (this.activeProject()?.survey.functionalPriorities || []).includes(priority);
  }

  selectColorMood(mood: string): void {
    this.store.updateActiveProject((p: Project) => {
      p.survey.colorMood = mood;
      return p;
    });
  }

  updateClientNotes(notes: string): void {
    this.store.updateActiveProject((p: Project) => {
      p.survey.clientNotes = notes;
      return p;
    });
  }

  updateTimeline(timeline: string): void {
    this.store.updateActiveProject((p: Project) => {
      p.survey.targetTimeline = timeline;
      return p;
    });
  }

  updateBudget(budget: number): void {
    this.store.updateActiveProject((p: Project) => {
      p.targetBudget = budget;
      return p;
    });
  }
}
