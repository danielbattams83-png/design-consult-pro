import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Project } from '../../models/project.model';
import { ProjectStore } from '../../services/project-store.service';

@Component({
  selector: 'app-report-view',
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './report-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportViewComponent implements AfterViewInit {
  store = inject(ProjectStore);

  @ViewChild('sigCanvas') sigCanvasRef!: ElementRef<HTMLCanvasElement>;

  activeProject = this.store.activeProject;
  unit = this.store.unit;
  totals = this.store.projectTotals;

  readonly signerName = signal<string>('');
  readonly isDrawingSig = signal<boolean>(false);
  private lastX = 0;
  private lastY = 0;

  ngAfterViewInit(): void {
    this.initSigCanvas();
  }

  private initSigCanvas(): void {
    const canvas = this.sigCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // If already signed, restore signature
    const existingSig = this.activeProject()?.clientSignOff?.signatureDataUrl;
    if (existingSig) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = existingSig;
    }
  }

  private getSigCoords(e: MouseEvent): { x: number; y: number } {
    const canvas = this.sigCanvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  startSig(e: MouseEvent): void {
    this.isDrawingSig.set(true);
    const pos = this.getSigCoords(e);
    this.lastX = pos.x;
    this.lastY = pos.y;
  }

  drawSig(e: MouseEvent): void {
    if (!this.isDrawingSig()) return;
    const canvas = this.sigCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = this.getSigCoords(e);
    ctx.beginPath();
    ctx.moveTo(this.lastX, this.lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    this.lastX = pos.x;
    this.lastY = pos.y;
  }

  stopSig(): void {
    this.isDrawingSig.set(false);
  }

  // Touch support for iPad / phone signature
  onTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const canvas = this.sigCanvasRef?.nativeElement;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      this.isDrawingSig.set(true);
      this.lastX = t.clientX - rect.left;
      this.lastY = t.clientY - rect.top;
    }
  }

  onTouchMove(e: TouchEvent): void {
    if (!this.isDrawingSig() || e.touches.length !== 1) return;
    const t = e.touches[0];
    const canvas = this.sigCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const curX = t.clientX - rect.left;
    const curY = t.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(this.lastX, this.lastY);
    ctx.lineTo(curX, curY);
    ctx.stroke();

    this.lastX = curX;
    this.lastY = curY;
    e.preventDefault();
  }

  onTouchEnd(): void {
    this.stopSig();
  }

  clearSignature(): void {
    const canvas = this.sigCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.store.updateActiveProject((p: Project) => {
      p.clientSignOff = undefined;
      p.status = 'Draft';
      return p;
    });
  }

  saveSignature(): void {
    const canvas = this.sigCanvasRef?.nativeElement;
    if (!canvas) return;
    const sigData = canvas.toDataURL('image/png');
    const name = this.signerName().trim() || this.activeProject()?.clientName || 'Client';

    this.store.updateActiveProject((p: Project) => {
      p.clientSignOff = {
        signedByName: name,
        signedAt: new Date().toISOString(),
        signatureDataUrl: sigData,
        acknowledgmentNotes: 'Client acknowledges field measured room dimensions and preliminary consultation scope.',
      };
      p.status = 'Signed';
      return p;
    });
  }

  printReport(): void {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }
}
