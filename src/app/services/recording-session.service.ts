import { Injectable, inject, signal } from '@angular/core';
import { AudioMarker, AudioMarkerTag, AudioNote } from '../models/project.model';
import { AiConsultService } from './ai-consult.service';
import { MediaStorageService } from './media-storage.service';
import { ProjectStore } from './project-store.service';

function preferredAudioMime(): string {
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/mp4')) {
    return 'audio/mp4';
  }
  return 'audio/webm';
}

@Injectable({ providedIn: 'root' })
export class RecordingSessionService {
  private store = inject(ProjectStore);
  private ai = inject(AiConsultService);
  private media = inject(MediaStorageService);

  readonly status = signal<'idle' | 'recording' | 'paused'>('idle');
  readonly recordingSeconds = signal(0);
  readonly audioLevel = signal(0);
  readonly micError = signal<string | null>(null);
  readonly isTranscribing = signal(false);
  readonly markers = signal<AudioMarker[]>([]);

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private levelFrame = 0;
  private mimeType = 'audio/webm';
  private started = false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.stop();
      });
      window.addEventListener('pagehide', () => this.stop());
    }
  }

  async start(): Promise<void> {
    if (this.status() !== 'idle') return;
    this.micError.set(null);
    this.markers.set([]);
    if (!navigator.mediaDevices?.getUserMedia) {
      this.micError.set('This browser cannot record audio. Use Safari or Chrome on the phone.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;
      this.mimeType = preferredAudioMime();
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: this.mimeType });
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.audioChunks.push(event.data);
      };
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.audioChunks, { type: this.mimeType });
        this.audioChunks = [];
        void this.save(blob);
        this.releaseStream();
      };
      this.mediaRecorder.start(1000);
      this.startMeter(stream);
      this.status.set('recording');
      this.recordingSeconds.set(0);
      this.timer = setInterval(() => this.recordingSeconds.update((seconds) => seconds + 1), 1000);
      this.started = true;
    } catch (error) {
      console.error('Microphone denied:', error);
      this.releaseStream();
      this.micError.set('Microphone access was denied. Allow the mic for this site, then record again. Nothing was saved.');
    }
  }

  pauseOrResume(): void {
    const recorder = this.mediaRecorder;
    if (!recorder) return;
    if (this.status() === 'recording' && recorder.state === 'recording') {
      recorder.pause();
      this.status.set('paused');
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    if (this.status() === 'paused' && recorder.state === 'paused') {
      recorder.resume();
      this.status.set('recording');
      this.timer = setInterval(() => this.recordingSeconds.update((seconds) => seconds + 1), 1000);
    }
  }

  stop(): void {
    if (!this.started && this.status() === 'idle') return;
    this.status.set('idle');
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.releaseMeter();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.started = false;
  }

  addMarker(tag: AudioMarkerTag): void {
    if (this.status() === 'idle') return;
    const marker: AudioMarker = { timeSeconds: this.recordingSeconds(), tag };
    this.markers.update((list) => [...list, marker]);
    if (tag === 'Action Item') {
      this.store.updateActiveProject((project) => {
        project.actionItems = [
          {
            id: 'act_' + Date.now(),
            text: `From walkthrough at ${this.formatTime(marker.timeSeconds)}`,
            category: 'Measurement',
            completed: false,
            priority: 'medium',
          },
          ...(project.actionItems || []),
        ];
      });
    }
  }

  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${remainder < 10 ? '0' : ''}${remainder}`;
  }

  markerLine(marker: AudioMarker): string {
    return `[${this.formatTime(marker.timeSeconds)} - ${marker.tag}]`;
  }

  private async save(blob: Blob): Promise<void> {
    const markers = this.markers();
    this.markers.set([]);
    if (!blob.size) {
      this.micError.set('The recording was empty and was not saved.');
      return;
    }
    const noteId = 'audio_' + Date.now();
    try {
      await this.media.saveBlob(noteId, blob);
    } catch (error) {
      console.error('Failed to store audio:', error);
      this.micError.set('Could not save the recording on this device.');
      return;
    }
    const room = this.store.activeRoom();
    const markerText = markers.map((marker) => this.markerLine(marker)).join('\n');
    const note: AudioNote = {
      id: noteId,
      mediaId: noteId,
      title: `Site Voice Memo #${(room?.audioNotes?.length || 0) + 1}`,
      recordedAt: new Date().toISOString(),
      durationSeconds: this.recordingSeconds() || 1,
      audioBlobUrl: URL.createObjectURL(blob),
      transcription: markerText,
      markers,
    };
    this.store.updateActiveRoom((current) => {
      current.audioNotes = [note, ...(current.audioNotes || [])];
      return current;
    });
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = typeof reader.result === 'string' ? reader.result : '';
      this.isTranscribing.set(true);
      this.ai.transcribeAudio(base64, blob.type || this.mimeType, {
        projectName: this.store.activeProject()?.name || '',
        roomName: this.store.activeRoom()?.name || '',
      }).subscribe({
        next: (res) => {
          this.isTranscribing.set(false);
          if (!res.success || !res.transcription) {
            this.micError.set(res.error || 'Offline or AI unavailable — audio/data saved locally.');
            return;
          }
          this.micError.set(null);
          const combined = markerText ? `${markerText}\n${res.transcription}` : res.transcription;
          this.store.updateActiveRoom((current) => {
            const saved = current.audioNotes?.find((item) => item.id === noteId);
            if (saved) saved.transcription = combined;
            return current;
          });
        },
        error: () => {
          this.isTranscribing.set(false);
          this.micError.set('Offline or AI unavailable — audio/data saved locally.');
        },
      });
    };
    reader.readAsDataURL(blob);
  }

  private startMeter(stream: MediaStream): void {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const context = new Ctx();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    this.audioContext = context;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (const value of bins) sum += value;
      this.audioLevel.set(Math.round((sum / bins.length / 255) * 100));
      this.levelFrame = requestAnimationFrame(tick);
    };
    this.levelFrame = requestAnimationFrame(tick);
  }

  private releaseMeter(): void {
    if (this.levelFrame) cancelAnimationFrame(this.levelFrame);
    this.levelFrame = 0;
    this.audioLevel.set(0);
    void this.audioContext?.close();
    this.audioContext = null;
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
