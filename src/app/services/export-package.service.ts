import { Injectable, inject } from '@angular/core';
import JSZip from 'jszip';
import { Project, Room, RoomPhoto } from '../models/project.model';
import { MediaStorageService } from './media-storage.service';

const PIXELS_PER_FOOT = 20;
const MM_PER_PX = 304.8 / PIXELS_PER_FOOT;

@Injectable({ providedIn: 'root' })
export class ExportPackageService {
  private media = inject(MediaStorageService);

  async exportConceptPackage(project: Project): Promise<void> {
    const zip = new JSZip();
    const photos = zip.folder('photos');
    const plans = zip.folder('floorplans');
    const annotationLines: string[] = ['# Photo annotations', ''];

    for (const room of project.rooms || []) {
      const slug = slugify(room.name || room.id);
      const drawing = this.drawingFor(room);
      plans?.file(`${slug}.svg`, this.toSvg(room, drawing));
      plans?.file(`${slug}.dxf`, this.toDxf(drawing));

      for (let index = 0; index < (room.photos || []).length; index++) {
        const photo = room.photos[index];
        const blob = await this.photoBlob(photo);
        if (!blob || !photos) continue;
        const name = `${slug}_${index + 1}.jpg`;
        photos.file(name, blob);
        annotationLines.push(`## ${room.name} — ${name}`);
        annotationLines.push(photo.caption || 'Untitled photo');
        if (!photo.annotations?.length) {
          annotationLines.push('_No pins._', '');
          continue;
        }
        photo.annotations.forEach((pin, pinIndex) => {
          annotationLines.push(`${pinIndex + 1}. [${pin.type}] ${pin.text} (${Math.round(pin.x)}%, ${Math.round(pin.y)}%)`);
        });
        annotationLines.push('');
      }
    }

    zip.file('photos/photo_annotations.md', annotationLines.join('\n'));
    zip.file('CONCEPT_BRIEF.md', this.conceptBrief(project));
    zip.file('project_backup.json', JSON.stringify(this.backup(project), null, 2));

    const packed = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(packed);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(project.name || 'project')}_Concept_Package.zip`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private drawingFor(room: Room): Drawing {
    const poly = room.canvasSketch?.shapes?.find((shape) => shape.type === 'wall_poly');
    let points = (poly?.points || []).map((point) => this.toMm(point.x, point.y));
    if (points.length < 3) {
      const unit = room.dimensions?.unit || 'imperial';
      const length = this.toMmLength(room.dimensions?.walls?.[0]?.lengthFt || 0, unit);
      const width = this.toMmLength(room.dimensions?.walls?.[1]?.lengthFt || 0, unit);
      points = [
        { x: 0, y: 0 },
        { x: length, y: 0 },
        { x: length, y: -width },
        { x: 0, y: -width },
      ];
    }
    const symbols = (room.canvasSketch?.shapes || [])
      .filter((shape) => shape.type === 'door' || shape.type === 'double_door' || shape.type === 'sliding_door' || shape.type === 'window')
      .map((shape) => ({
        kind: shape.type === 'window' ? 'window' as const : 'door' as const,
        ...this.toMm(shape.x, shape.y),
        width: (shape.width || 40) * MM_PER_PX,
        label: shape.label,
      }));
    return { points, symbols };
  }

  private toMm(x: number, y: number): { x: number; y: number } {
    return { x: round(x * MM_PER_PX), y: round(-y * MM_PER_PX) };
  }

  private toMmLength(value: number, unit: string): number {
    return round(unit === 'metric' ? value : value * 304.8);
  }

  private toSvg(room: Room, drawing: Drawing): string {
    const xs = drawing.points.map((point) => point.x);
    const ys = drawing.points.map((point) => point.y);
    const minX = Math.min(...xs, 0) - 500;
    const minY = Math.min(...ys, 0) - 500;
    const maxX = Math.max(...xs, 0) + 500;
    const maxY = Math.max(...ys, 0) + 500;
    const poly = drawing.points.map((point) => `${point.x},${point.y}`).join(' ');
    const symbols = drawing.symbols
      .map((symbol) => {
        const color = symbol.kind === 'window' ? '#0284c7' : '#c2410c';
        return `<rect x="${symbol.x - symbol.width / 2}" y="${symbol.y - 40}" width="${symbol.width}" height="80" fill="none" stroke="${color}" stroke-width="15"><title>${escapeXml(symbol.label)} ${symbol.kind}</title></rect>`;
      })
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}mm" height="${maxY - minY}mm">
  <title>${escapeXml(room.name)} — millimetres</title>
  <polygon points="${poly}" fill="none" stroke="#111827" stroke-width="40"/>
  ${symbols}
</svg>
`;
  }

  private toDxf(drawing: Drawing): string {
    const lines = ['0', 'SECTION', '2', 'ENTITIES'];
    lines.push(...polyline('WALLS', drawing.points, true));
    drawing.symbols.forEach((symbol) => {
      const half = symbol.width / 2;
      lines.push(
        ...polyline(symbol.kind === 'window' ? 'WINDOWS' : 'DOORS', [
          { x: symbol.x - half, y: symbol.y - 40 },
          { x: symbol.x + half, y: symbol.y - 40 },
          { x: symbol.x + half, y: symbol.y + 40 },
          { x: symbol.x - half, y: symbol.y + 40 },
        ], true)
      );
    });
    lines.push('0', 'ENDSEC', '0', 'EOF');
    return lines.join('\n');
  }

  private async photoBlob(photo: RoomPhoto): Promise<Blob | null> {
    if (photo.mediaId) {
      const stored = await this.media.getBlob(photo.mediaId);
      if (stored) return stored;
    }
    if (photo.dataUrl && !photo.dataUrl.startsWith('blob:') && !photo.dataUrl.startsWith('data:')) {
      try {
        const response = await fetch(photo.dataUrl);
        if (response.ok) return await response.blob();
      } catch {
        return null;
      }
    }
    return null;
  }

  private conceptBrief(project: Project): string {
    const lines: string[] = [
      `# ${project.name || 'Concept package'}`,
      '',
      `- Client: ${project.clientName || '—'}`,
      `- Address: ${project.siteAddress || '—'}`,
      `- Survey date: ${project.surveyDate || '—'}`,
      `- Type: ${project.projectType || '—'}`,
      '',
      '## Room schedule',
      '',
      '| Room | Level | Floor | Ceiling | Walls |',
      '| --- | --- | --- | --- | --- |',
    ];
    for (const room of project.rooms || []) {
      const unit = room.dimensions?.unit || 'imperial';
      const area = unit === 'metric'
        ? `${room.dimensions?.calculatedFloorArea ?? 0} m²`
        : `${round((room.dimensions?.calculatedFloorArea || 0) * 0.092903)} m²`;
      const ceiling = `${this.toMmLength(room.dimensions?.ceilingHeightFt || 0, unit)} mm`;
      const walls = (room.dimensions?.walls || [])
        .map((wall) => `${wall.name} ${this.toMmLength(wall.lengthFt, unit)} mm`)
        .join('<br>');
      lines.push(`| ${room.name} | ${room.level || ''} | ${area} | ${ceiling} | ${walls} |`);
    }
    lines.push('', '## Client style and survey', '');
    lines.push(`Styles: ${(project.survey?.selectedStyles || []).join(', ') || '—'}`);
    lines.push('', project.survey?.clientGeneralNotes || '_No client notes._');
    lines.push('', '## Site conditions and services', '');
    for (const room of project.rooms || []) {
      if (!room.conditions && !room.siteConditions) continue;
      lines.push(`### ${room.name}`, '', '```json', JSON.stringify(room.conditions || room.siteConditions, null, 2), '```', '');
    }
    lines.push('## Action items', '');
    if (!project.actionItems?.length) lines.push('_None recorded._');
    project.actionItems?.forEach((item) => {
      lines.push(`- [${item.completed ? 'x' : ' '}] (${item.category}) ${item.text}`);
    });
    lines.push('', '## AI concept brief', '', project.aiSummary || '_Not generated yet._', '', '## Voice transcripts', '');
    for (const room of project.rooms || []) {
      if (!room.audioNotes?.length) continue;
      lines.push(`### ${room.name}`, '');
      room.audioNotes.forEach((note) => {
        lines.push(`**${note.title}** (${note.durationSeconds}s)`, '', note.transcription || '_No transcript._', '');
      });
    }
    return lines.join('\n');
  }

  private backup(project: Project): Project {
    const copy: Project = JSON.parse(JSON.stringify(project));
    copy.rooms = (copy.rooms || []).map((room) => ({
      ...room,
      photos: (room.photos || []).map((photo) => {
        const next = { ...photo };
        if (!next.dataUrl || next.dataUrl.startsWith('blob:') || next.dataUrl.startsWith('data:')) delete next.dataUrl;
        return next;
      }),
      audioNotes: (room.audioNotes || []).map((note) => {
        const next = { ...note };
        delete next.audioBase64;
        delete next.audioBlobUrl;
        return next;
      }),
    }));
    return copy;
  }
}

interface Drawing {
  points: { x: number; y: number }[];
  symbols: { kind: 'door' | 'window'; x: number; y: number; width: number; label: string }[];
}

function polyline(layer: string, points: { x: number; y: number }[], closed: boolean): string[] {
  const body = ['0', 'POLYLINE', '8', layer, '66', '1', '70', closed ? '1' : '0'];
  points.forEach((point) => {
    body.push('0', 'VERTEX', '8', layer, '10', String(point.x), '20', String(point.y));
  });
  body.push('0', 'SEQEND');
  return body;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room';
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
