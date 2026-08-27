import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AiConsultService } from '../../services/ai-consult.service';
import { Project } from '../../models/project.model';
import { ProjectStore } from '../../services/project-store.service';

@Component({
  selector: 'app-ai-proposal-view',
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './ai-proposal-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiProposalViewComponent {
  store = inject(ProjectStore);
  aiService = inject(AiConsultService);

  activeProject = this.store.activeProject;
  activeRoom = this.store.activeRoom;

  readonly isGenerating = signal<boolean>(false);
  readonly isAskingQA = signal<boolean>(false);
  readonly questionInput = signal<string>('');
  readonly qaHistory = signal<{ role: 'user' | 'assistant'; text: string }[]>([
    {
      role: 'assistant',
      text: 'Hello! I am your On-Site Architectural & Building Code Assistant. Ask me about IRC code clearances, work triangles, subfloor prep tolerances, or ADA bathroom accessibility standards.',
    },
  ]);

  generateProposal(): void {
    const proj = this.activeProject();
    if (!proj) return;

    this.isGenerating.set(true);

    this.aiService.generateProposalBrief(proj).subscribe({
      next: (res) => {
        this.isGenerating.set(false);
        if (res.success && res.brief) {
          this.store.updateActiveProject((p: Project) => {
            p.aiProposal = res.brief;
            return p;
          });
        }
      },
      error: (err) => {
        this.isGenerating.set(false);
        console.error('Proposal generation error:', err);
      },
    });
  }

  askAssistant(customQ?: string): void {
    const q = customQ || this.questionInput().trim();
    if (!q || this.isAskingQA()) return;

    this.qaHistory.update((h) => [...h, { role: 'user', text: q }]);
    this.questionInput.set('');
    this.isAskingQA.set(true);

    const proj = this.activeProject();
    const context = {
      project: proj?.name,
      rooms: proj?.rooms.map((r) => ({
        name: r.name,
        area: r.dimensions.calculatedFloorArea,
        walls: r.dimensions.walls.map((w) => `${w.name}: ${w.lengthFt}ft`),
        squareness: r.dimensions.diagonalACFt,
      })),
      styles: proj?.survey.selectedStyles,
    };

    this.aiService.askConsultantQA(q, context).subscribe({
      next: (res) => {
        this.isAskingQA.set(false);
        this.qaHistory.update((h) => [...h, { role: 'assistant', text: res.answer }]);
      },
      error: () => {
        this.isAskingQA.set(false);
        this.qaHistory.update((h) => [
          ...h,
          {
            role: 'assistant',
            text: 'Standard building guidelines suggest maintaining a minimum 36" walkway for interior circulation and 42"-48" for two-cook kitchen aisles.',
          },
        ]);
      },
    });
  }
}
