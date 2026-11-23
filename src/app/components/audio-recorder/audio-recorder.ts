import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MediaStorageService } from '../../services/media-storage.service';
import { ProjectStore } from '../../services/project-store.service';
import { RecordingSessionService } from '../../services/recording-session.service';

@Component({
  selector: 'app-audio-recorder',
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './audio-recorder.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudioRecorderComponent {
  store = inject(ProjectStore);
  session = inject(RecordingSessionService);
  private media = inject(MediaStorageService);

  activeRoom = this.store.activeRoom;

  startRecording(): void {
    void this.session.start();
  }

  deleteAudioNote(noteId: string): void {
    const note = this.activeRoom()?.audioNotes?.find((item) => item.id === noteId);
    if (note?.audioBlobUrl) URL.revokeObjectURL(note.audioBlobUrl);
    if (note?.mediaId) void this.media.deleteBlob(note.mediaId);
    this.store.updateActiveRoom((room) => {
      room.audioNotes = (room.audioNotes || []).filter((item) => item.id !== noteId);
      return room;
    });
  }

  updateTranscription(noteId: string, text: string): void {
    this.store.updateActiveRoom((room) => {
      const note = room.audioNotes?.find((item) => item.id === noteId);
      if (note) note.transcription = text;
      return room;
    });
  }
}
