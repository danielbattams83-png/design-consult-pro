import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { PhotoAnnotation, RoomPhoto } from '../../models/project.model';
import { AiConsultService } from '../../services/ai-consult.service';
import { MediaStorageService } from '../../services/media-storage.service';
import { ProjectStore } from '../../services/project-store.service';
import { compressImageFile } from '../../utils/image-compressor';

@Component({
  selector: 'app-photo-annotator',
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './photo-annotator.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoAnnotatorComponent {
  store = inject(ProjectStore);
  private media = inject(MediaStorageService);
  private ai = inject(AiConsultService);
  readonly photoError = signal<string | null>(null);
  readonly critiqueQuestion = signal('What spatial, daylighting, or structural ideas do you see?');
  readonly critiqueAnswer = signal<string | null>(null);
  readonly critiqueBusy = signal(false);

  @ViewChild('imageEl') imageRef!: ElementRef<HTMLImageElement>;
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  activeRoom = this.store.activeRoom;
  readonly selectedPhoto = signal<RoomPhoto | null>(null);

  // New annotation creation draft
  readonly pendingClickPos = signal<{ x: number; y: number } | null>(null);
  readonly newAnnotationText = signal<string>('');
  readonly newAnnotationType = signal<'dimension' | 'damage' | 'electrical' | 'plumbing' | 'general'>('dimension');

  // Sample Architectural Photos to insert if camera unavailable
  readonly samplePhotos = [
    {
      caption: 'Main Living Room East Window Run & Exposed Beam',
      url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
      tags: ['East Wall', 'Beams', 'Lighting'],
    },
    {
      caption: 'Kitchen Island Rough-in Plumbing & Subfloor Inspection',
      url: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80',
      tags: ['Kitchen', 'Plumbing', 'Subfloor'],
    },
    {
      caption: 'Primary Bath Shower Enclosure & Drain Location',
      url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80',
      tags: ['Bathroom', 'Tile', 'Plumbing'],
    },
  ];

  selectPhoto(photo: RoomPhoto): void {
    this.selectedPhoto.set(photo);
    this.pendingClickPos.set(null);
  }

  closeModal(): void {
    this.selectedPhoto.set(null);
    this.pendingClickPos.set(null);
  }

  onImageClick(e: MouseEvent): void {
    const img = this.imageRef?.nativeElement;
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const xPct = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
    const yPct = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;

    this.pendingClickPos.set({ x: xPct, y: yPct });
    this.newAnnotationText.set('');
  }

  saveAnnotation(): void {
    const pos = this.pendingClickPos();
    const text = this.newAnnotationText().trim();
    const current = this.selectedPhoto();
    if (!pos || !text || !current) return;

    const newAnnot: PhotoAnnotation = {
      id: 'ann_' + Date.now(),
      x: pos.x,
      y: pos.y,
      text,
      type: this.newAnnotationType(),
    };

    const updatedPhoto: RoomPhoto = {
      ...current,
      annotations: [...current.annotations, newAnnot],
    };

    this.selectedPhoto.set(updatedPhoto);
    this.pendingClickPos.set(null);

    // Save to store
    this.store.updateActiveRoom((r) => {
      r.photos = r.photos.map((p) => (p.id === updatedPhoto.id ? updatedPhoto : p));
      return r;
    });
  }

  deleteAnnotation(annotId: string): void {
    const current = this.selectedPhoto();
    if (!current) return;

    const updatedPhoto: RoomPhoto = {
      ...current,
      annotations: current.annotations.filter((a) => a.id !== annotId),
    };

    this.selectedPhoto.set(updatedPhoto);

    this.store.updateActiveRoom((r) => {
      r.photos = r.photos.map((p) => (p.id === updatedPhoto.id ? updatedPhoto : p));
      return r;
    });
  }

  async handleFileUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    input.value = '';
    this.photoError.set(null);
    try {
      const compressed = await compressImageFile(file);
      const id = 'photo_' + Date.now();
      await this.media.saveBlob(id, compressed);
      this.addPhotoToRoom(URL.createObjectURL(compressed), file.name.replace(/\.[^/.]+$/, ''), ['Site Photo'], id);
    } catch (error) {
      console.error('Photo save failed:', error);
      this.photoError.set('Could not save that photo on this device.');
    }
  }

  addSamplePhoto(sample: { caption: string; url: string; tags: string[] }): void {
    this.addPhotoToRoom(sample.url, sample.caption, sample.tags);
  }

  private addPhotoToRoom(dataUrl: string, caption: string, tags: string[] = ['Site Photo'], mediaId?: string): void {
    const id = mediaId || 'photo_' + Date.now();
    const newPhoto: RoomPhoto = {
      id,
      mediaId,
      dataUrl,
      caption: caption || 'On-site Survey Photo',
      takenAt: new Date().toISOString(),
      tags,
      annotations: [],
    };

    this.store.updateActiveRoom((r) => {
      r.photos.unshift(newPhoto);
      return r;
    });

    this.selectedPhoto.set(newPhoto);
  }

  deletePhoto(photoId: string): void {
    const existing = this.activeRoom()?.photos?.find((photo) => photo.id === photoId);
    if (existing?.dataUrl?.startsWith('blob:')) URL.revokeObjectURL(existing.dataUrl);
    if (existing?.mediaId) void this.media.deleteBlob(existing.mediaId);
    if (this.selectedPhoto()?.id === photoId) {
      this.selectedPhoto.set(null);
    }
    this.store.updateActiveRoom((r) => {
      r.photos = r.photos.filter((p) => p.id !== photoId);
      return r;
    });
  }

  async askCritique(photo: RoomPhoto): Promise<void> {
    this.critiqueBusy.set(true);
    this.critiqueAnswer.set(null);
    try {
      const blob = photo.mediaId
        ? await this.media.getBlob(photo.mediaId)
        : photo.dataUrl
          ? await fetch(photo.dataUrl).then((response) => response.blob())
          : null;
      if (!blob) {
        this.critiqueBusy.set(false);
        this.critiqueAnswer.set('That photo is not on this device, so it cannot be sent.');
        return;
      }
      const dataUrl = await blobToDataUrl(blob);
      const room = this.activeRoom();
      const context = room
        ? `${room.name}, ceiling ${room.dimensions?.ceilingHeightFt ?? 'unknown'}, area ${room.dimensions?.calculatedFloorArea ?? 'unknown'}`
        : '';
      this.ai.critiqueSitePhoto(dataUrl, blob.type || 'image/jpeg', this.critiqueQuestion(), context).subscribe({
        next: (res) => {
          this.critiqueBusy.set(false);
          this.critiqueAnswer.set(res.success && res.critique ? res.critique : (res.error || 'Offline or AI unavailable — audio/data saved locally.'));
        },
        error: () => {
          this.critiqueBusy.set(false);
          this.critiqueAnswer.set('Offline or AI unavailable — audio/data saved locally.');
        },
      });
    } catch (error) {
      console.error(error);
      this.critiqueBusy.set(false);
      this.critiqueAnswer.set('Could not read that photo.');
    }
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
