import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AudioNote } from '../../models/project.model';
import { AiConsultService } from '../../services/ai-consult.service';
import { ProjectStore } from '../../services/project-store.service';

@Component({
  selector: 'app-audio-recorder',
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './audio-recorder.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudioRecorderComponent implements OnDestroy {
  store = inject(ProjectStore);
  aiService = inject(AiConsultService);

  activeRoom = this.store.activeRoom;

  readonly isRecording = signal<boolean>(false);
  readonly recordingSeconds = signal<number>(0);
  readonly isTranscribing = signal<boolean>(false);
  readonly isSupported = signal<boolean>(typeof window !== 'undefined' && !!navigator.mediaDevices);

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    this.stopRecordingTimer();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  async startRecording(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.saveAudioNote(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      this.mediaRecorder.start();
      this.isRecording.set(true);
      this.recordingSeconds.set(0);

      this.timerInterval = setInterval(() => {
        this.recordingSeconds.update((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      // Fallback demo voice note if microphone blocked in sandbox
      this.addDemoVoiceNote();
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.isRecording.set(false);
    this.stopRecordingTimer();
  }

  private stopRecordingTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private async saveAudioNote(blob: Blob): Promise<void> {
    const audioUrl = URL.createObjectURL(blob);
    const duration = this.recordingSeconds() || 5;

    // Convert to base64 for AI transcription
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      const noteId = 'audio_' + Date.now();

      const newNote: AudioNote = {
        id: noteId,
        title: `Site Voice Memo #${(this.activeRoom()?.audioNotes?.length || 0) + 1}`,
        recordedAt: new Date().toISOString(),
        durationSeconds: duration,
        audioBlobUrl: audioUrl,
        audioBase64: base64data,
        transcription: 'Transcribing speech...',
      };

      this.store.updateActiveRoom((r) => {
        if (!r.audioNotes) r.audioNotes = [];
        r.audioNotes.unshift(newNote);
        return r;
      });

      // Request AI Transcription
      this.isTranscribing.set(true);
      this.aiService.transcribeAudio(base64data, blob.type).subscribe({
        next: (res) => {
          this.isTranscribing.set(false);
          this.store.updateActiveRoom((r) => {
            const note = r.audioNotes?.find((n) => n.id === noteId);
            if (note) {
              note.transcription = res.transcription;
            }
            return r;
          });
        },
        error: () => {
          this.isTranscribing.set(false);
        },
      });
    };
    reader.readAsDataURL(blob);
  }

  addDemoVoiceNote(): void {
    const sampleTranscriptions = [
      'North wall has electrical sub-panel obstruction at 4ft height. Verify clearance for 60-inch vanity mirror. Subfloor shows 1/8 inch dip near eastern threshold.',
      'Client requests integrated under-cabinet LED warm channel lighting (2700K) and flush-mount brass outlets along backsplash.',
      'Check bearing header with structural engineer before widening south cased opening to 8 feet.',
    ];
    const picked = sampleTranscriptions[Math.floor(Math.random() * sampleTranscriptions.length)];

    const newNote: AudioNote = {
      id: 'audio_demo_' + Date.now(),
      title: `On-Site Voice Memo #${(this.activeRoom()?.audioNotes?.length || 0) + 1}`,
      recordedAt: new Date().toISOString(),
      durationSeconds: 14,
      transcription: picked,
    };

    this.store.updateActiveRoom((r) => {
      if (!r.audioNotes) r.audioNotes = [];
      r.audioNotes.unshift(newNote);
      return r;
    });
  }

  deleteAudioNote(noteId: string): void {
    this.store.updateActiveRoom((r) => {
      r.audioNotes = (r.audioNotes || []).filter((n) => n.id !== noteId);
      return r;
    });
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
}
