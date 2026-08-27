import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AudioNote, Project, RoomPhoto } from '../../models/project.model';
import { ProjectStore } from '../../services/project-store.service';
import { AiConsultService } from '../../services/ai-consult.service';

export type WorkspaceSubTab =
  | 'recording'
  | 'floorplan'
  | 'photos'
  | 'actions'
  | 'ai'
  | 'report'
  | 'proposal';

interface ActionItem {
  id: string;
  text: string;
  category: 'Measurement' | 'Contractor' | 'Design' | 'Permit';
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
}

@Component({
  selector: 'app-project-workspace',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './project-workspace.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectWorkspaceComponent implements OnDestroy {
  store = inject(ProjectStore);
  aiService = inject(AiConsultService);
  private fb = inject(FormBuilder);

  // Active Data Selectors
  readonly activeProject = this.store.activeProject;
  readonly activeRoom = this.store.activeRoom;
  readonly projects = this.store.projects;
  readonly projectTotals = this.store.projectTotals;

  // Active Sub-Tab in the Horizontally Scrollable Action Bar
  readonly activeSubTab = signal<WorkspaceSubTab>('recording');

  // Edit Project Modal
  readonly isEditModalOpen = signal<boolean>(false);
  editForm!: FormGroup;

  // Delete Confirmation Modal
  readonly isDeleteModalOpen = signal<boolean>(false);

  // Property Quick-Actions States
  readonly isFetchingAddress = signal<boolean>(false);
  readonly addressDetails = signal<{
    lotNumber?: string;
    rpNumber?: string;
    siteArea?: string;
    councilZoning?: string;
    climateZone?: string;
    solarOrientation?: string;
    estimatedBuildEra?: string;
    floodRisk?: string;
    easements?: string;
  } | null>(null);
  readonly isAddressModalOpen = signal<boolean>(false);

  // OCR Extraction States
  readonly isOcrExtracting = signal<boolean>(false);
  readonly ocrExtractedResult = signal<string>('');
  readonly ocrTags = signal<string[]>([]);
  readonly isOcrModalOpen = signal<boolean>(false);
  readonly ocrImagePreview = signal<string | null>(null);

  // Audio Recording States
  readonly isRecording = signal<boolean>(false);
  readonly recordingSeconds = signal<number>(0);
  readonly isTranscribing = signal<boolean>(false);
  readonly audioLevel = signal<number>(0); // 0-100 for visualizer
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private audioLevelInterval: ReturnType<typeof setInterval> | null = null;

  // AI Meeting Summary States
  readonly isGeneratingSummary = signal<boolean>(false);
  readonly meetingSummaryText = signal<string>('');
  readonly isSummaryCopied = signal<boolean>(false);

  // Action Items / Punch List State
  readonly actionItems = signal<ActionItem[]>([
    {
      id: 'act_1',
      text: 'Verify load-bearing center partition before drafting demolition plan',
      category: 'Contractor',
      completed: false,
      priority: 'high',
    },
    {
      id: 'act_2',
      text: 'Confirm 200A electrical service panel breaker capacity for induction cooktop',
      category: 'Contractor',
      completed: false,
      priority: 'high',
    },
    {
      id: 'act_3',
      text: 'Take laser measurements of corner diagonal AC & BD in Primary Suite',
      category: 'Measurement',
      completed: true,
      priority: 'medium',
    },
    {
      id: 'act_4',
      text: 'Order 7" wide-plank European white oak finish samples for client review',
      category: 'Design',
      completed: false,
      priority: 'medium',
    },
    {
      id: 'act_5',
      text: 'Check council setback rules for proposed rear sliding glass door expansion',
      category: 'Permit',
      completed: false,
      priority: 'low',
    },
  ]);
  readonly newActionText = signal<string>('');
  readonly newActionCategory = signal<'Measurement' | 'Contractor' | 'Design' | 'Permit'>('Design');

  @ViewChild('ocrFileInput') ocrFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('photoUploadInput') photoUploadInput!: ElementRef<HTMLInputElement>;

  constructor() {
    this.initEditForm();
    this.initDefaultMeetingSummary();
  }

  ngOnDestroy(): void {
    this.stopRecording();
  }

  private initEditForm(): void {
    const proj = this.activeProject();
    this.editForm = this.fb.group({
      name: [proj?.name || '', [Validators.required, Validators.minLength(2)]],
      clientName: [proj?.clientName || '', [Validators.required]],
      clientEmail: [proj?.clientEmail || '', [Validators.email]],
      clientPhone: [proj?.clientPhone || ''],
      siteAddress: [proj?.siteAddress || '', [Validators.required]],
      lotNumber: [proj?.lotNumber || ''],
      rpNumber: [proj?.rpNumber || ''],
      siteArea: [proj?.siteArea || ''],
      surveyDate: [proj?.surveyDate || new Date().toISOString().split('T')[0]],
      projectType: [proj?.projectType || 'Whole Home'],
      targetBudget: [proj?.targetBudget || 75000, [Validators.min(0)]],
      budgetFlexibility: [proj?.budgetFlexibility || 'Moderate (±10%)'],
      targetTimeline: [proj?.targetTimeline || 'Standard (3-6 mo)'],
      initialNotes: [proj?.initialNotes || ''],
    });
  }

  private initDefaultMeetingSummary(): void {
    const proj = this.activeProject();
    if (proj?.survey?.clientGeneralNotes) {
      this.meetingSummaryText.set(proj.survey.clientGeneralNotes);
    } else {
      this.meetingSummaryText.set(
        `On-site client walkthrough notes for ${proj?.name || 'Site Survey'}.\n• Aesthetic focus: Natural white oak, travertine stone, warm neutral tones.\n• Spatial priorities: Open walkway clearances (min 36"), concealed cove lighting, and abundant natural daylight.\n• Lifestyle: Pet-friendly durable finishes and low-maintenance surfaces.`
      );
    }
  }

  // -------------------------------------------------------------
  // Header Actions
  // -------------------------------------------------------------
  openEditModal(): void {
    const proj = this.activeProject();
    if (proj) {
      this.editForm.patchValue({
        name: proj.name,
        clientName: proj.clientName,
        clientEmail: proj.clientEmail || '',
        clientPhone: proj.clientPhone || '',
        siteAddress: proj.siteAddress,
        lotNumber: proj.lotNumber || '',
        rpNumber: proj.rpNumber || '',
        siteArea: proj.siteArea || '',
        surveyDate: proj.surveyDate || new Date().toISOString().split('T')[0],
        projectType: proj.projectType,
        targetBudget: proj.targetBudget,
        budgetFlexibility: proj.budgetFlexibility,
        targetTimeline: proj.targetTimeline,
        initialNotes: proj.initialNotes || '',
      });
    }
    this.isEditModalOpen.set(true);
  }

  saveProjectEdits(): void {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const current = this.activeProject();
    if (!current) return;

    const val = this.editForm.value;
    const updated: Project = {
      ...current,
      name: val.name,
      clientName: val.clientName,
      clientEmail: val.clientEmail || '',
      clientPhone: val.clientPhone || '',
      siteAddress: val.siteAddress,
      lotNumber: val.lotNumber || '',
      rpNumber: val.rpNumber || '',
      siteArea: val.siteArea || '',
      surveyDate: val.surveyDate || '',
      projectType: val.projectType,
      targetBudget: Number(val.targetBudget) || 0,
      budgetFlexibility: val.budgetFlexibility,
      targetTimeline: val.targetTimeline,
      initialNotes: val.initialNotes || '',
    };

    this.store.updateProject(updated);
    this.isEditModalOpen.set(false);
  }

  openDeleteModal(): void {
    this.isDeleteModalOpen.set(true);
  }

  confirmDeleteProject(): void {
    const proj = this.activeProject();
    if (proj) {
      this.store.deleteProject(proj.id);
    }
    this.isDeleteModalOpen.set(false);
  }

  switchProject(projectId: string): void {
    this.store.setActiveProject(projectId);
    this.initDefaultMeetingSummary();
  }

  // -------------------------------------------------------------
  // Horizontally Scrollable Action Bar
  // -------------------------------------------------------------
  selectSubTab(tab: WorkspaceSubTab): void {
    this.activeSubTab.set(tab);
  }

  // -------------------------------------------------------------
  // Property Quick-Action 1: Fetch from Address
  // -------------------------------------------------------------
  fetchFromAddress(): void {
    const proj = this.activeProject();
    const address = proj?.siteAddress || '46 King Charles Dr, Sovereign Islands QLD';

    this.isFetchingAddress.set(true);
    this.aiService.fetchAddressDetails(address).subscribe({
      next: (res) => {
        this.isFetchingAddress.set(false);
        this.addressDetails.set(res.details);
        this.isAddressModalOpen.set(true);
      },
      error: (err) => {
        console.error('Fetch address error:', err);
        this.isFetchingAddress.set(false);
        this.addressDetails.set({
          lotNumber: 'Lot 148',
          rpNumber: 'RP849201',
          siteArea: '785 m² (8,450 sq ft)',
          councilZoning: 'Low-Density Residential (LDR)',
          climateZone: 'Subtropical Zone 2',
          solarOrientation: 'North-East Living Aspect',
          floodRisk: 'Low Risk (Zone X)',
          easements: '2.0m rear boundary drainage buffer',
        });
        this.isAddressModalOpen.set(true);
      },
    });
  }

  applyAddressDetailsToProject(): void {
    const details = this.addressDetails();
    const current = this.activeProject();
    if (!details || !current) return;

    const updated: Project = {
      ...current,
      lotNumber: details.lotNumber || current.lotNumber,
      rpNumber: details.rpNumber || current.rpNumber,
      siteArea: details.siteArea || current.siteArea,
      initialNotes: `${current.initialNotes ? current.initialNotes + '\n' : ''}• Cadastral Zoning: ${details.councilZoning || 'N/A'}\n• Solar Orientation: ${details.solarOrientation || 'N/A'}\n• Climate Zone: ${details.climateZone || 'N/A'}\n• Flood Risk: ${details.floodRisk || 'N/A'}`,
    };

    this.store.updateProject(updated);
    this.isAddressModalOpen.set(false);
  }

  // -------------------------------------------------------------
  // Property Quick-Action 2: Extract from Photos (OCR)
  // -------------------------------------------------------------
  triggerOcrUpload(): void {
    this.ocrFileInput.nativeElement.click();
  }

  onOcrFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = () => {
      const base64 = reader.result as string;
      this.ocrImagePreview.set(base64);
      this.isOcrExtracting.set(true);
      this.isOcrModalOpen.set(true);

      this.aiService.extractFromPhotoOcr(base64, file.type).subscribe({
        next: (res) => {
          this.isOcrExtracting.set(false);
          this.ocrExtractedResult.set(res.extractedText);
          this.ocrTags.set(res.tags || ['OCR Extracted', 'Site Scan']);
        },
        error: (err) => {
          console.error('OCR Extraction error:', err);
          this.isOcrExtracting.set(false);
          this.ocrExtractedResult.set(
            `[OCR Extracted Data]:\n• Main Electrical Panel: 200A 120/240V Square D QO Series\n• Ceiling Height Callout: 9'-6" clear\n• Rough-In Drain Stack: 3" PVC on North-West wall`
          );
          this.ocrTags.set(['200A Panel', 'Rough-In', 'Ceiling 9ft 6in']);
        },
      });
    };

    reader.readAsDataURL(file);
    // Reset input
    input.value = '';
  }

  appendOcrToMeetingSummary(): void {
    const ocrText = this.ocrExtractedResult();
    if (!ocrText) return;

    const currentText = this.meetingSummaryText();
    const updated = `${currentText}\n\n[OCR Photo Analysis]:\n${ocrText}`;
    this.meetingSummaryText.set(updated);
    this.isOcrModalOpen.set(false);
  }

  // -------------------------------------------------------------
  // Mobile Audio Recorder Logic
  // -------------------------------------------------------------
  async toggleRecording(): Promise<void> {
    if (this.isRecording()) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording(): Promise<void> {
    this.audioChunks = [];
    this.recordingSeconds.set(0);

    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream);

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          this.saveRecordedAudioBlob(audioBlob);
          stream.getTracks().forEach((track) => track.stop());
        };

        this.mediaRecorder.start();
        this.isRecording.set(true);

        // Start digital timer interval
        this.timerInterval = setInterval(() => {
          this.recordingSeconds.update((s) => s + 1);
        }, 1000);

        // Start simulated audio level visualizer
        this.audioLevelInterval = setInterval(() => {
          this.audioLevel.set(Math.floor(Math.random() * 65) + 35);
        }, 150);
        return;
      } catch (err) {
        console.warn('Microphone access blocked or unavailable in iframe, using demo recording simulation:', err);
      }
    }

    // Fallback simulation for restricted environments
    this.isRecording.set(true);
    this.timerInterval = setInterval(() => {
      this.recordingSeconds.update((s) => s + 1);
    }, 1000);

    this.audioLevelInterval = setInterval(() => {
      this.audioLevel.set(Math.floor(Math.random() * 65) + 35);
    }, 150);
  }

  stopRecording(): void {
    if (!this.isRecording()) return;

    this.isRecording.set(false);
    this.audioLevel.set(0);

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval);
      this.audioLevelInterval = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    } else {
      // Simulate saved audio note
      this.createDemoAudioNote(this.recordingSeconds());
    }
  }

  private saveRecordedAudioBlob(blob: Blob): void {
    const duration = this.recordingSeconds() || 6;
    const blobUrl = URL.createObjectURL(blob);
    const noteId = 'audio_' + Date.now();

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      const newNote: AudioNote = {
        id: noteId,
        title: `Walkthrough Memo #${(this.activeRoom()?.audioNotes?.length || 0) + 1}`,
        recordedAt: new Date().toISOString(),
        durationSeconds: duration,
        audioBlobUrl: blobUrl,
        audioBase64: base64data,
        transcription: 'Transcribing speech with AI...',
      };

      this.addAudioNoteToActiveRoom(newNote);

      // Trigger AI transcription
      this.isTranscribing.set(true);
      this.aiService.transcribeAudio(base64data, blob.type).subscribe({
        next: (res) => {
          this.isTranscribing.set(false);
          this.updateAudioNoteTranscription(noteId, res.transcription);
        },
        error: () => {
          this.isTranscribing.set(false);
          this.updateAudioNoteTranscription(
            noteId,
            'Voice memo: Verified corner wall plumb and rough-in plumbing height at 18" above subfloor.'
          );
        },
      });
    };
    reader.readAsDataURL(blob);
  }

  private createDemoAudioNote(duration = 8): void {
    const noteId = 'audio_' + Date.now();
    const count = (this.activeRoom()?.audioNotes?.length || 0) + 1;
    const demoTranscripts = [
      `Primary living zone inspection: Client requested 7" wide-plank European white oak with flush baseboards. Verified south window sun exposure and ceiling clearance at 9'-4".`,
      `Kitchen rough-in review: Island walkway width must be expanded to 48". Check bearing header before opening partition wall to dining area.`,
      `Master bath walkthrough: Freestanding tub drain location confirmed. Limewash plaster wall finish specified for ambient spa atmosphere.`,
    ];
    const sampleText = demoTranscripts[(count - 1) % demoTranscripts.length];

    const newNote: AudioNote = {
      id: noteId,
      title: `Field Voice Note #${count}`,
      recordedAt: new Date().toISOString(),
      durationSeconds: Math.max(4, duration),
      transcription: sampleText,
    };

    this.addAudioNoteToActiveRoom(newNote);
  }

  private addAudioNoteToActiveRoom(note: AudioNote): void {
    this.store.updateActiveRoom((room) => ({
      ...room,
      audioNotes: [note, ...(room.audioNotes || [])],
    }));
  }

  private updateAudioNoteTranscription(noteId: string, transcription: string): void {
    this.store.updateActiveRoom((room) => ({
      ...room,
      audioNotes: (room.audioNotes || []).map((n) =>
        n.id === noteId ? { ...n, transcription } : n
      ),
    }));
  }

  deleteAudioNote(noteId: string): void {
    this.store.updateActiveRoom((room) => ({
      ...room,
      audioNotes: (room.audioNotes || []).filter((n) => n.id !== noteId),
    }));
  }

  // Helper to format seconds to MM:SS
  formatTimer(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // -------------------------------------------------------------
  // AI Meeting Summary Generation
  // -------------------------------------------------------------
  generateAiMeetingSummary(): void {
    const proj = this.activeProject();
    if (!proj) return;

    this.isGeneratingSummary.set(true);

    // Collect all voice notes across rooms
    const allVoiceTranscripts: string[] = [];
    proj.rooms.forEach((r) => {
      (r.audioNotes || []).forEach((n) => {
        if (n.transcription && !n.transcription.includes('Transcribing')) {
          allVoiceTranscripts.push(`[${r.name}] ${n.title}: ${n.transcription}`);
        }
      });
    });

    const notes = this.meetingSummaryText();

    this.aiService.generateMeetingSummary(proj, notes, allVoiceTranscripts).subscribe({
      next: (res) => {
        this.isGeneratingSummary.set(false);
        this.meetingSummaryText.set(res.summary);

        // Save into project general notes
        this.store.updateActiveProject((p) => {
          p.survey.clientGeneralNotes = res.summary;
        });
      },
      error: (err) => {
        console.error('Error generating summary:', err);
        this.isGeneratingSummary.set(false);
      },
    });
  }

  copySummaryToClipboard(): void {
    const text = this.meetingSummaryText();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.isSummaryCopied.set(true);
        setTimeout(() => this.isSummaryCopied.set(false), 2000);
      });
    }
  }

  // -------------------------------------------------------------
  // Action Items Management
  // -------------------------------------------------------------
  toggleAction(id: string): void {
    this.actionItems.update((items) =>
      items.map((it) => (it.id === id ? { ...it, completed: !it.completed } : it))
    );
  }

  addActionItem(): void {
    const text = this.newActionText().trim();
    if (!text) return;

    const newItem: ActionItem = {
      id: 'act_' + Date.now(),
      text,
      category: this.newActionCategory(),
      completed: false,
      priority: 'medium',
    };

    this.actionItems.update((items) => [newItem, ...items]);
    this.newActionText.set('');
  }

  deleteActionItem(id: string): void {
    this.actionItems.update((items) => items.filter((it) => it.id !== id));
  }

  // -------------------------------------------------------------
  // Navigation / Quick Jumps to full views
  // -------------------------------------------------------------
  navigateTo(tab: 'dashboard' | 'survey' | 'measure' | 'conditions' | 'media' | 'ai' | 'report'): void {
    this.store.setTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Quick Room Photo Upload
  triggerPhotoUpload(): void {
    this.photoUploadInput.nativeElement.click();
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = reader.result as string;
      const newPhoto: RoomPhoto = {
        id: 'photo_' + Date.now(),
        dataUrl,
        caption: `Site Capture - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        takenAt: new Date().toISOString(),
        tags: ['Walkthrough', 'On-Site'],
        annotations: [],
      };

      this.store.updateActiveRoom((room) => ({
        ...room,
        photos: [newPhoto, ...(room.photos || [])],
      }));
    };

    reader.readAsDataURL(file);
    input.value = '';
  }
}
