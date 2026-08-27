import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AudioRecorderComponent } from '../../components/audio-recorder/audio-recorder';
import { PhotoAnnotatorComponent } from '../../components/photo-annotator/photo-annotator';
import { ProjectStore } from '../../services/project-store.service';

@Component({
  selector: 'app-media-view',
  imports: [CommonModule, MatIconModule, PhotoAnnotatorComponent, AudioRecorderComponent],
  templateUrl: './media-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaViewComponent {
  store = inject(ProjectStore);

  activeRoom = this.store.activeRoom;
}
