import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActionItem, Project, RoomPhoto } from '../../models/project.model';
import { AudioRecorderComponent } from '../audio-recorder/audio-recorder';
import { ProjectStore } from '../../services/project-store.service';
import { AiConsultService } from '../../services/ai-consult.service';
import { MediaStorageService } from '../../services/media-storage.service';
import { compressImageFile } from '../../utils/image-compressor';

export type WorkspaceSubTab =
  | 'recording'
  | 'floorplan'
  | 'photos'
  | 'actions'
  | 'ai'
  | 'report'
  | 'proposal';

@Component({
  selector: 'app-project-workspace',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule, AudioRecorderComponent],
  templateUrl: './project-workspace.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectWorkspaceComponent {
  store = inject(ProjectStore);
  aiService = inject(AiConsultService);
  private media = inject(MediaStorageService);
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

  // AI Meeting Summary States
  readonly isGeneratingSummary = signal<boolean>(false);
  readonly meetingSummaryText = signal<string>('');
  readonly summaryError = signal<string | null>(null);
  readonly fieldError = signal<string | null>(null);
  readonly isSummaryCopied = signal<boolean>(false);

  readonly actionItems = computed(() => this.store.activeProject()?.actionItems || []);
  readonly newActionText = signal<string>('');
  readonly newActionCategory = signal<ActionItem['category']>('Design');

  @ViewChild('ocrFileInput') ocrFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('photoUploadInput') photoUploadInput!: ElementRef<HTMLInputElement>;

  constructor() {
    this.initEditForm();
    this.initDefaultMeetingSummary();
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
    const summary = this.activeProject()?.aiSummary;
    this.meetingSummaryText.set(typeof summary === 'string' ? summary : '');
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
    const address = this.activeProject()?.siteAddress?.trim();
    if (!address) {
      this.fieldError.set('Add a project with a site address before looking up property details.');
      return;
    }

    this.fieldError.set(null);
    this.isFetchingAddress.set(true);
    this.aiService.fetchAddressDetails(address).subscribe({
      next: (res) => {
        this.isFetchingAddress.set(false);
        if (!res.success || !res.details) {
          this.fieldError.set(res.error || 'Offline or AI unavailable — audio/data saved locally.');
          return;
        }
        this.addressDetails.set(res.details);
        this.isAddressModalOpen.set(true);
      },
      error: () => {
        this.isFetchingAddress.set(false);
        this.fieldError.set('Offline or AI unavailable — audio/data saved locally.');
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

      this.aiService.extractFromPhotoOcr(base64, file.type || 'image/jpeg').subscribe({
        next: (res) => {
          this.isOcrExtracting.set(false);
          if (!res.success || !res.extractedText) {
            this.isOcrModalOpen.set(false);
            this.fieldError.set(res.error || 'Offline or AI unavailable — audio/data saved locally.');
            return;
          }
          this.fieldError.set(null);
          this.ocrExtractedResult.set(res.extractedText);
          this.ocrTags.set(res.tags || ['OCR Extracted', 'Site Scan']);
        },
        error: () => {
          this.isOcrExtracting.set(false);
          this.isOcrModalOpen.set(false);
          this.fieldError.set('Offline or AI unavailable — audio/data saved locally.');
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

    this.summaryError.set(null);
    this.aiService.generateMeetingSummary(proj, notes, allVoiceTranscripts).subscribe({
      next: (res) => {
        this.isGeneratingSummary.set(false);
        if (!res.success || !res.summary) {
          this.summaryError.set(res.error || 'Offline or AI unavailable — audio/data saved locally.');
          return;
        }
        this.meetingSummaryText.set(res.summary);
        this.store.updateActiveProject((p) => {
          p.aiSummary = res.summary;
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
    this.store.updateActiveProject((project) => {
      project.actionItems = (project.actionItems || []).map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      );
    });
  }

  addActionItem(): void {
    const text = this.newActionText().trim();
    if (!text) return;
    this.store.updateActiveProject((project) => {
      project.actionItems = [
        { id: 'act_' + Date.now(), text, category: this.newActionCategory(), completed: false, priority: 'medium' },
        ...(project.actionItems || []),
      ];
    });
    this.newActionText.set('');
  }

  deleteActionItem(id: string): void {
    this.store.updateActiveProject((project) => {
      project.actionItems = (project.actionItems || []).filter((item) => item.id !== id);
    });
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

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    input.value = '';
    if (!this.store.activeRoom()) {
      this.fieldError.set('Open or create a room before adding a photo.');
      return;
    }

    try {
      const compressed = await compressImageFile(file);
      const id = 'photo_' + Date.now();
      await this.media.saveBlob(id, compressed);
      const newPhoto: RoomPhoto = {
        id,
        mediaId: id,
        dataUrl: URL.createObjectURL(compressed),
        caption: `Site Capture - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        takenAt: new Date().toISOString(),
        tags: ['Walkthrough', 'On-Site'],
        annotations: [],
      };
      this.store.updateActiveRoom((room) => ({
        ...room,
        photos: [newPhoto, ...(room.photos || [])],
      }));
    } catch (error) {
      console.error('Photo save failed:', error);
      this.fieldError.set('Could not save that photo on this device.');
    }
  }
}
