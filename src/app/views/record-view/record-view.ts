import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AudioRecorderComponent } from '../../components/audio-recorder/audio-recorder';
import { AiConsultService } from '../../services/ai-consult.service';
import { ProjectStore } from '../../services/project-store.service';

@Component({
  selector: 'app-record-view',
  imports: [CommonModule, FormsModule, MatIconModule, AudioRecorderComponent],
  templateUrl: './record-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordViewComponent {
  store = inject(ProjectStore);
  private ai = inject(AiConsultService);

  readonly brief = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    const existing = this.store.activeProject()?.aiSummary;
    if (typeof existing === 'string') this.brief.set(existing);
  }

  generateBrief(): void {
    const project = this.store.activeProject();
    if (!project) return;
    const transcripts: string[] = [];
    project.rooms.forEach((room) => {
      (room.audioNotes || []).forEach((note) => {
        if (note.transcription) transcripts.push(`[${room.name}] ${note.transcription}`);
      });
    });
    this.busy.set(true);
    this.error.set(null);
    this.ai.generateMeetingSummary(project, this.brief(), transcripts).subscribe({
      next: (res) => {
        this.busy.set(false);
        if (!res.success || !res.summary) {
          this.error.set(res.error || 'Offline or AI unavailable — audio/data saved locally.');
          return;
        }
        this.brief.set(res.summary);
        this.store.updateActiveProject((current) => {
          current.aiSummary = res.summary;
        });
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Offline or AI unavailable — audio/data saved locally.');
      },
    });
  }
}
