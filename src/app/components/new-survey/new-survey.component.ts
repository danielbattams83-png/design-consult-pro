import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Project, ProjectStatus } from '../../models/project.model';
import { ProjectStore } from '../../services/project-store.service';
import { SurveyDataService } from '../../services/survey-data.service';

export interface NewSurveyFormData {
  projectName: string;
  clientName: string;
  siteAddress: string;
  lotNumber: string;
  rpNumber: string;
  siteArea: string;
  surveyDate: string;
  initialNotes: string;
  projectType: Project['projectType'];
  targetBudget: number;
  latitude?: number;
  longitude?: number;
}

@Component({
  selector: 'app-new-survey',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './new-survey.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewSurveyComponent implements OnInit {
  private readonly store = inject(ProjectStore);
  private readonly surveyService = inject(SurveyDataService);

  // Optional Inputs
  readonly initialData = input<Partial<Project> | null>(null);
  readonly isModal = input<boolean>(false);
  readonly destinationTab = input<'survey' | 'measure' | 'dashboard'>('survey');

  // Outputs
  readonly surveyCreated = output<Project>();
  readonly cancelled = output<void>();

  // State Signals
  readonly isLocatingGps = signal<boolean>(false);
  readonly gpsError = signal<string | null>(null);
  readonly gpsSuccessCoordinates = signal<{ lat: number; lng: number; accuracy?: number } | null>(null);
  readonly submittedAttempted = signal<boolean>(false);

  // Quick Preset Tags for Initial Notes
  readonly quickNoteChips = [
    'Demolition Required',
    'Bearing Wall Review',
    'Waterfront Property',
    'Gate Code #4910',
    'Subfloor Moisture Check',
    'High Ceilings (10ft+)',
    'Heritage Overlay',
  ];

  // Quick Area Units
  readonly areaUnits = ['m²', 'sq ft', 'acres'];
  readonly selectedAreaUnit = signal<string>('m²');

  // Form definition with strict Reactive Forms
  readonly surveyForm = new FormGroup({
    projectName: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    clientName: new FormControl<string>('', { nonNullable: true }),
    siteAddress: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),
    lotNumber: new FormControl<string>('', { nonNullable: true }),
    rpNumber: new FormControl<string>('', { nonNullable: true }),
    siteArea: new FormControl<string>('', { nonNullable: true }),
    surveyDate: new FormControl<string>(new Date().toISOString().split('T')[0], {
      nonNullable: true,
      validators: [Validators.required],
    }),
    initialNotes: new FormControl<string>('', { nonNullable: true }),
    projectType: new FormControl<Project['projectType']>('Whole Home', {
      nonNullable: true,
    }),
    targetBudget: new FormControl<number>(120000, { nonNullable: true }),
  });

  ngOnInit(): void {
    const init = this.initialData();
    if (init) {
      this.surveyForm.patchValue({
        projectName: init.name || '',
        clientName: init.clientName || '',
        siteAddress: init.siteAddress || '',
        lotNumber: init.lotNumber || '',
        rpNumber: init.rpNumber || '',
        siteArea: init.siteArea || '',
        surveyDate: init.surveyDate || new Date().toISOString().split('T')[0],
        initialNotes: init.initialNotes || init.survey?.clientGeneralNotes || '',
        projectType: init.projectType || 'Whole Home',
        targetBudget: init.targetBudget || 120000,
      });

      if (init.latitude && init.longitude) {
        this.gpsSuccessCoordinates.set({
          lat: init.latitude,
          lng: init.longitude,
        });
      }
    }
  }

  // Mobile GPS Location Retriever
  acquireGpsLocation(): void {
    this.gpsError.set(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.gpsError.set('Geolocation is not supported on this device/browser.');
      return;
    }

    this.isLocatingGps.set(true);

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 30000,
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = Math.round(position.coords.accuracy);

        this.gpsSuccessCoordinates.set({ lat, lng, accuracy });
        this.isLocatingGps.set(false);

        // Attempt Reverse Geocoding via OpenStreetMap Nominatim for realistic street address
        this.fetchReverseGeocode(lat, lng, accuracy);
      },
      (error) => {
        this.isLocatingGps.set(false);
        let msg = 'Unable to retrieve location.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg = 'Location permission denied by user/browser.';
            break;
          case error.POSITION_UNAVAILABLE:
            msg = 'Location information is currently unavailable.';
            break;
          case error.TIMEOUT:
            msg = 'GPS request timed out. Try again or enter manually.';
            break;
        }
        this.gpsError.set(msg);
      },
      options
    );
  }

  private async fetchReverseGeocode(lat: number, lng: number, accuracy: number): Promise<void> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.display_name) {
          const currentAddr = this.surveyForm.controls.siteAddress.value;
          // If empty or previously auto-set, update with resolved address
          if (!currentAddr || currentAddr.includes('GPS:') || currentAddr.includes('Lat:')) {
            this.surveyForm.patchValue({ siteAddress: data.display_name });
          }
          return;
        }
      }
    } catch {
      // Fallback to coordinates string if reverse geocode is offline or blocked
    }

    // Fallback format
    const currentAddr = this.surveyForm.controls.siteAddress.value;
    if (!currentAddr) {
      this.surveyForm.patchValue({
        siteAddress: `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${accuracy}m)`,
      });
    }
  }

  // Quick Area Unit Toggle
  setAreaUnit(unit: string): void {
    this.selectedAreaUnit.set(unit);
    const curVal = this.surveyForm.controls.siteArea.value.trim();
    if (curVal) {
      // replace existing unit suffix if present
      const numOnly = curVal.replace(/[^\d.,]/g, '').trim();
      if (numOnly) {
        this.surveyForm.patchValue({ siteArea: `${numOnly} ${unit}` });
      }
    }
  }

  // Quick Initial Note Append
  appendNoteChip(chip: string): void {
    const current = this.surveyForm.controls.initialNotes.value.trim();
    const updated = current ? `${current}\n• ${chip}` : `• ${chip}`;
    this.surveyForm.patchValue({ initialNotes: updated });
  }

  // Load Preset Field Sample for Quick Testing
  loadSampleData(presetIndex = 1): void {
    if (presetIndex === 1) {
      this.surveyForm.patchValue({
        projectName: '46 King Charles Dr. Sovereign Island',
        clientName: 'Harrison & Vivienne Sterling',
        siteAddress: '46 King Charles Dr, Sovereign Islands QLD 4216',
        lotNumber: 'Lot 148',
        rpNumber: 'RP849201',
        siteArea: '850 m²',
        surveyDate: new Date().toISOString().split('T')[0],
        initialNotes: '• Waterfront property with double-height ceiling in Great Room.\n• Client requests Japandi aesthetic with low-VOC finishes.\n• Check load-bearing capacity of center masonry partition.\n• Gate Security Code: #4910.',
        projectType: 'Whole Home',
        targetBudget: 185000,
      });
      this.gpsSuccessCoordinates.set({
        lat: -27.8721,
        lng: 153.4192,
        accuracy: 8,
      });
    } else {
      this.surveyForm.patchValue({
        projectName: 'Battams Residence - Upper Coomera',
        clientName: 'Arthur & Evelyn Battams',
        siteAddress: '12 Rivermist Dr, Upper Coomera QLD 4209',
        lotNumber: 'Lot 22',
        rpNumber: 'RP304912',
        siteArea: '620 m²',
        surveyDate: new Date().toISOString().split('T')[0],
        initialNotes: '• Kitchen and master suite renovation.\n• Focus on warm minimalism, natural travertine surfaces, and integrated pantry.',
        projectType: 'Kitchen Renovation',
        targetBudget: 95000,
      });
      this.gpsSuccessCoordinates.set({
        lat: -27.8931,
        lng: 153.3218,
        accuracy: 12,
      });
    }
  }

  // Form Submission
  submitForm(): void {
    this.submittedAttempted.set(true);

    if (this.surveyForm.invalid) {
      this.surveyForm.markAllAsTouched();
      // Scroll to first error on mobile screen
      const firstInvalid = document.querySelector('.ng-invalid[formControlName]');
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    const formValues = this.surveyForm.getRawValue();
    const coords = this.gpsSuccessCoordinates();

    const createdProject = this.store.createProject({
      name: formValues.projectName.trim(),
      clientName: formValues.clientName.trim() || 'Client',
      siteAddress: formValues.siteAddress.trim(),
      lotNumber: formValues.lotNumber.trim(),
      rpNumber: formValues.rpNumber.trim(),
      siteArea: formValues.siteArea.trim(),
      surveyDate: formValues.surveyDate,
      initialNotes: formValues.initialNotes.trim(),
      latitude: coords?.lat,
      longitude: coords?.lng,
      projectType: formValues.projectType,
      targetBudget: Number(formValues.targetBudget) || 100000,
      status: 'In Survey' as ProjectStatus,
    });

    // Synchronize client notes into survey object
    if (createdProject && formValues.initialNotes.trim()) {
      createdProject.survey = {
        ...createdProject.survey,
        clientGeneralNotes: formValues.initialNotes.trim(),
      };
      this.store.updateProject(createdProject);
    }

    // Open project workspace directly
    this.store.setTab(this.destinationTab());
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Emit event for parents
    this.surveyCreated.emit(createdProject);
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
