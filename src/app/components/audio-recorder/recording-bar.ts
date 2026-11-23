import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RecordingSessionService } from '../../services/recording-session.service';

@Component({
  selector: 'app-recording-bar',
  imports: [CommonModule, MatIconModule],
  templateUrl: './recording-bar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordingBarComponent {
  session = inject(RecordingSessionService);
}
