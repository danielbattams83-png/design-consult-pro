import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { AiProposalSummary, Project } from '../models/project.model';

const AI_OFFLINE = 'Offline or AI unavailable — audio/data saved locally.';

@Injectable({
  providedIn: 'root',
})
export class AiConsultService {
  private http = inject(HttpClient);

  generateProposalBrief(project: Project): Observable<{ success: boolean; brief?: AiProposalSummary; error?: string }> {
    return this.http
      .post<{ success: boolean; brief?: AiProposalSummary; error?: string }>('/api/ai/generate-brief', project)
      .pipe(catchError((err) => of({ success: false, error: err?.error?.error || AI_OFFLINE })));
  }

  askConsultantQA(question: string, context: Record<string, unknown>): Observable<{ success: boolean; answer?: string; error?: string }> {
    return this.http
      .post<{ success: boolean; answer?: string; error?: string }>('/api/ai/consult-qa', { question, context })
      .pipe(catchError(() => of({ success: false, error: AI_OFFLINE })));
  }

  transcribeAudio(
    audioBase64: string,
    mimeType = 'audio/webm',
    context?: { projectName?: string; roomName?: string }
  ): Observable<{ success: boolean; transcription?: string; error?: string }> {
    return this.http
      .post<{ success: boolean; transcription?: string; error?: string }>('/api/ai/transcribe-note', {
        audioBase64,
        mimeType,
        projectName: context?.projectName || '',
        roomName: context?.roomName || '',
      })
      .pipe(catchError(() => of({ success: false, error: AI_OFFLINE })));
  }

  generateMeetingSummary(
    project: Project,
    notes: string,
    voiceTranscripts: string[] = []
  ): Observable<{ success: boolean; summary?: string; error?: string }> {
    return this.http
      .post<{ success: boolean; summary?: string; error?: string }>('/api/ai/meeting-summary', {
        project,
        notes,
        voiceTranscripts,
      })
      .pipe(catchError(() => of({ success: false, error: AI_OFFLINE })));
  }

  critiqueSitePhoto(
    imageBase64: string,
    mimeType = 'image/jpeg',
    question = '',
    roomContext = ''
  ): Observable<{ success: boolean; critique?: string; error?: string }> {
    return this.http
      .post<{ success: boolean; critique?: string; error?: string }>('/api/ai/site-photo-critique', {
        imageBase64,
        mimeType,
        question,
        roomContext,
      })
      .pipe(catchError(() => of({ success: false, error: AI_OFFLINE })));
  }

  extractFromPhotoOcr(
    imageBase64: string,
    mimeType = 'image/jpeg'
  ): Observable<{ success: boolean; extractedText?: string; tags?: string[]; error?: string }> {
    return this.http
      .post<{ success: boolean; extractedText?: string; tags?: string[]; error?: string }>('/api/ai/extract-ocr', {
        imageBase64,
        mimeType,
      })
      .pipe(catchError(() => of({ success: false, error: AI_OFFLINE })));
  }

  fetchAddressDetails(address: string): Observable<{
    success: boolean;
    details?: {
      lotNumber?: string;
      rpNumber?: string;
      siteArea?: string;
      councilZoning?: string;
      climateZone?: string;
      solarOrientation?: string;
      estimatedBuildEra?: string;
      floodRisk?: string;
      easements?: string;
    };
    error?: string;
  }> {
    return this.http
      .post<{
        success: boolean;
        details?: {
          lotNumber?: string;
          rpNumber?: string;
          siteArea?: string;
          councilZoning?: string;
          climateZone?: string;
          solarOrientation?: string;
          estimatedBuildEra?: string;
          floodRisk?: string;
          easements?: string;
        };
        error?: string;
      }>('/api/ai/fetch-address-details', { address })
      .pipe(catchError(() => of({ success: false, error: AI_OFFLINE })));
  }
}
