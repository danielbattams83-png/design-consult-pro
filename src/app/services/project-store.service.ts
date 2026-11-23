import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  AudioNote,
  CanvasShape,
  MeasurementUnit,
  PRESET_MATERIALS,
  Project,
  Room,
  RoomDimensions,
  RoomPhoto,
  WallSegment,
} from '../models/project.model';
import { dataUrlToBlob } from '../utils/data-url';
import { MediaStorageService } from './media-storage.service';

const STORAGE_KEY = 'design_consult_pro_projects_v2';
const ACTIVE_PROJ_KEY = 'design_consult_pro_active_id';
const UNIT_KEY = 'design_consult_pro_unit';
const MM_PER_FOOT = 304.8;
const MM_PER_INCH = 25.4;
const SQ_M_PER_SQ_FT = 0.09290304;
const PIXELS_PER_FOOT = 20;

export type FieldTab = 'record' | 'measure' | 'photos' | 'site';

@Injectable({
  providedIn: 'root',
})
export class ProjectStore {
  private media = inject(MediaStorageService);
  // Primary Signals
  readonly projects = signal<Project[]>([]);
  readonly activeProjectId = signal<string>('');
  readonly activeRoomId = signal<string>('');
  readonly isOnline = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  readonly unit = signal<MeasurementUnit>('metric');
  readonly isGeneratingAi = signal<boolean>(false);
  readonly currentActiveTab = signal<FieldTab>('record');

  // Computed Selectors
  readonly activeProject = computed<Project | null>(() => {
    const list = this.projects();
    const id = this.activeProjectId();
    return list.find((p) => p.id === id) || list[0] || null;
  });

  readonly activeRoom = computed<Room | null>(() => {
    const project = this.activeProject();
    if (!project || !project.rooms.length) return null;
    const rId = this.activeRoomId();
    return project.rooms.find((r) => r.id === rId) || project.rooms[0] || null;
  });

  readonly projectTotals = computed(() => {
    const proj = this.activeProject();
    if (!proj) {
      return { totalFloorArea: 0, totalWallArea: 0, totalPerimeter: 0, roomCount: 0, totalArea: 0, totalRooms: 0, unitStr: 'sq ft' };
    }
    const totalFloorArea = proj.rooms.reduce((acc, r) => acc + (r.dimensions.calculatedFloorArea || 0), 0);
    const totalWallArea = proj.rooms.reduce((acc, r) => acc + (r.dimensions.calculatedWallSurface || 0), 0);
    const totalPerimeter = proj.rooms.reduce((acc, r) => acc + (r.dimensions.calculatedPerimeter || 0), 0);
    const unitStr = proj.rooms[0]?.dimensions?.unit === 'metric' ? 'm²' : 'sq ft';
    const roundedArea = Math.round(totalFloorArea * 10) / 10;
    return {
      totalFloorArea: roundedArea,
      totalWallArea: Math.round(totalWallArea * 10) / 10,
      totalPerimeter: Math.round(totalPerimeter * 10) / 10,
      totalArea: roundedArea,
      totalRooms: proj.rooms.length,
      roomCount: proj.rooms.length,
      unitStr,
    };
  });

  constructor() {
    this.initNetworkListeners();
    this.loadFromStorage();

    // Auto-save effect
    effect(() => {
      const data = this.projects();
      const activeId = this.activeProjectId();
      const currentUnit = this.unit();
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.persistableProjects(data)));
          if (activeId) localStorage.setItem(ACTIVE_PROJ_KEY, activeId);
          localStorage.setItem(UNIT_KEY, currentUnit);
        } catch (e) {
          console.warn('LocalStorage save failed:', e);
        }
      }
    });
  }

  private initNetworkListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.isOnline.set(true));
      window.addEventListener('offline', () => this.isOnline.set(false));
    }
  }

  resetToDemoProject(): void {
    this.unit.set('imperial');
    this.seedDemoProject();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      this.projects.set([]);
      this.activeProjectId.set('');
      this.activeRoomId.set('');
      return;
    }

    try {
      const savedUnit = localStorage.getItem(UNIT_KEY) as MeasurementUnit;
      if (savedUnit === 'metric' || savedUnit === 'imperial') this.unit.set(savedUnit);

      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: Project[] = this.remeasure(JSON.parse(raw), this.unit());
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.projects.set(parsed);
          const savedActiveId = localStorage.getItem(ACTIVE_PROJ_KEY);
          if (savedActiveId && parsed.some((p) => p.id === savedActiveId)) {
            this.activeProjectId.set(savedActiveId);
          } else {
            this.activeProjectId.set(parsed[0].id);
          }
          if (this.activeProject()?.rooms.length) {
            this.activeRoomId.set(this.activeProject()!.rooms[0].id);
          }
          void this.backfillMedia(parsed);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to parse cached projects:', e);
    }

    this.projects.set([]);
    this.activeProjectId.set('');
    this.activeRoomId.set('');
  }

  /** Move legacy inline bytes into IndexedDB and rebuild playback URLs. */
  private async backfillMedia(source: Project[]): Promise<void> {
    try {
      for (const project of source) {
        for (const room of project.rooms || []) {
          for (const photo of room.photos || []) {
            if (photo.dataUrl?.startsWith('data:')) {
              const id = photo.mediaId || photo.id;
              await this.media.saveBlob(id, dataUrlToBlob(photo.dataUrl));
              photo.mediaId = id;
              photo.dataUrl = undefined;
            }
          }
          for (const note of room.audioNotes || []) {
            if (note.audioBase64) {
              const id = note.mediaId || note.id;
              await this.media.saveBlob(id, dataUrlToBlob(note.audioBase64));
              note.mediaId = id;
              note.audioBase64 = undefined;
            }
          }
        }
      }
      await this.attachMediaUrls(source);
      this.projects.set(source.map((project) => ({ ...project })));
    } catch (error) {
      console.warn('Media backfill failed:', error);
    }
  }

  private async attachMediaUrls(projects: Project[]): Promise<void> {
    for (const project of projects) {
      for (const room of project.rooms || []) {
        for (const photo of room.photos || []) {
          if (!photo.mediaId) continue;
          if (photo.dataUrl && !photo.dataUrl.startsWith('blob:') && !photo.dataUrl.startsWith('data:')) continue;
          const blob = await this.media.getBlob(photo.mediaId);
          if (blob) photo.dataUrl = URL.createObjectURL(blob);
        }
        for (const note of room.audioNotes || []) {
          if (!note.mediaId) continue;
          const blob = await this.media.getBlob(note.mediaId);
          if (blob) note.audioBlobUrl = URL.createObjectURL(blob);
        }
      }
    }
  }

  private persistableProjects(projects: Project[]): Project[] {
    return projects.map((project) => ({
      ...project,
      rooms: (project.rooms || []).map((room) => ({
        ...room,
        photos: (room.photos || []).map((photo) => this.persistablePhoto(photo)),
        audioNotes: (room.audioNotes || []).map((note) => this.persistableNote(note)),
      })),
    }));
  }

  private persistablePhoto(photo: RoomPhoto): RoomPhoto {
    const copy: RoomPhoto = { ...photo };
    if (!copy.dataUrl || copy.dataUrl.startsWith('data:') || copy.dataUrl.startsWith('blob:')) {
      delete copy.dataUrl;
    }
    return copy;
  }

  private persistableNote(note: AudioNote): AudioNote {
    const copy: AudioNote = { ...note };
    delete copy.audioBase64;
    delete copy.audioBlobUrl;
    return copy;
  }

  private seedDemoProject(): void {
    const initialProject = this.createSeedProject();
    this.projects.set([initialProject]);
    this.activeProjectId.set(initialProject.id);
    this.activeRoomId.set(initialProject.rooms[0].id);
  }

  // --- Calculations & Formulas ---

  /**
   * Recalculates floor area, perimeter, net wall paint surface (subtracting openings), and volume.
   */
  calculateRoomMetrics(
    walls: WallSegment[],
    ceilingHeight: number,
    openings: { widthInches: number; heightInches: number }[] = [],
    diagAC?: number,
    diagBD?: number,
    unit: MeasurementUnit = 'imperial',
    polygon?: { x: number; y: number }[]
  ): RoomDimensions {
    const toFeet = (value: number) => (unit === 'metric' ? value / MM_PER_FOOT : value);
    let floorAreaFt = 0;
    let perimeterFt = 0;

    if (polygon && polygon.length >= 3) {
      let twiceArea = 0;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        twiceArea += a.x * b.y - b.x * a.y;
        perimeterFt += Math.hypot(b.x - a.x, b.y - a.y) / PIXELS_PER_FOOT;
      }
      floorAreaFt = Math.abs(twiceArea) / 2 / (PIXELS_PER_FOOT * PIXELS_PER_FOOT);
    } else {
      walls.forEach((w) => {
        perimeterFt += toFeet(Number(w.lengthFt) || 0);
      });
      if (walls.length >= 2) {
        const l1 = toFeet(walls[0]?.lengthFt || 0);
        const w1 = toFeet(walls[1]?.lengthFt || 0);
        const l2 = toFeet(walls[2]?.lengthFt || l1);
        const w2 = toFeet(walls[3]?.lengthFt || w1);
        floorAreaFt = ((l1 + l2) / 2) * ((w1 + w2) / 2);
      }
    }

    const ceilingFt = toFeet(Number(ceilingHeight) || (unit === 'metric' ? 2896 : 9));
    const openingsSqFt = openings.reduce((sum, opening) => {
      const widthFt = unit === 'metric' ? (opening.widthInches || 0) / 1000 / 0.3048 : (opening.widthInches || 0) / 12;
      const heightFt = unit === 'metric' ? (opening.heightInches || 0) / 1000 / 0.3048 : (opening.heightInches || 0) / 12;
      return sum + widthFt * heightFt;
    }, 0);
    const netWallFt = Math.max(0, perimeterFt * ceilingFt - openingsSqFt);
    const volumeFt = floorAreaFt * ceilingFt;

    let isSquare = true;
    let diagonalDifferenceInches = 0;
    if (diagAC && diagBD) {
      const diffFt = Math.abs(toFeet(diagAC) - toFeet(diagBD));
      diagonalDifferenceInches = Math.round(diffFt * 12 * 10) / 10;
      isSquare = diagonalDifferenceInches <= 0.5;
    }

    const floorArea = unit === 'metric' ? floorAreaFt * SQ_M_PER_SQ_FT : floorAreaFt;
    const perimeter = unit === 'metric' ? perimeterFt * 0.3048 : perimeterFt;
    const wallSurface = unit === 'metric' ? netWallFt * SQ_M_PER_SQ_FT : netWallFt;
    const volume = unit === 'metric' ? volumeFt * 0.0283168 : volumeFt;

    return {
      unit,
      ceilingHeightFt: Number(ceilingHeight) || (unit === 'metric' ? 2896 : 9),
      walls,
      diagonalACFt: diagAC,
      diagonalBDFt: diagBD,
      isSquare,
      diagonalDifferenceInches,
      calculatedFloorArea: Math.round(floorArea * 100) / 100,
      calculatedPerimeter: Math.round(perimeter * 100) / 100,
      calculatedWallSurface: Math.round(wallSurface * 100) / 100,
      calculatedVolume: Math.round(volume * 100) / 100,
    };
  }

  // --- CRUD Project Actions ---

  setActiveProject(id: string): void {
    this.activeProjectId.set(id);
    const proj = this.projects().find((p) => p.id === id);
    if (proj && proj.rooms.length) {
      this.activeRoomId.set(proj.rooms[0].id);
    }
  }

  setActiveRoom(roomId: string): void {
    this.activeRoomId.set(roomId);
  }

  setUnit(unit: MeasurementUnit): void {
    const current = this.unit();
    if (unit === current) return;
    const lengthFactor = unit === 'metric' ? MM_PER_FOOT : 1 / MM_PER_FOOT;
    const inchFactor = unit === 'metric' ? MM_PER_INCH : 1 / MM_PER_INCH;
    const converted = this.projects().map((project) => ({
      ...project,
      rooms: project.rooms.map((room) => {
        const next: Room = JSON.parse(JSON.stringify(room));
        next.dimensions.ceilingHeightFt = this.scaleNumber(next.dimensions.ceilingHeightFt, lengthFactor);
        if (next.dimensions.diagonalACFt) next.dimensions.diagonalACFt = this.scaleNumber(next.dimensions.diagonalACFt, lengthFactor);
        if (next.dimensions.diagonalBDFt) next.dimensions.diagonalBDFt = this.scaleNumber(next.dimensions.diagonalBDFt, lengthFactor);
        next.dimensions.walls = next.dimensions.walls.map((wall) => ({
          ...wall,
          lengthFt: this.scaleNumber(wall.lengthFt, lengthFactor),
          heightFt: this.scaleNumber(wall.heightFt, lengthFactor),
        }));
        next.openings = (next.openings || []).map((opening) => ({
          ...opening,
          widthInches: this.scaleNumber(opening.widthInches, inchFactor),
          heightInches: this.scaleNumber(opening.heightInches, inchFactor),
          sillHeightInches: this.scaleNumber(opening.sillHeightInches, inchFactor),
          trimWidthInches: this.scaleNumber(opening.trimWidthInches, inchFactor),
        }));
        next.features = (next.features || []).map((feature) => ({
          ...feature,
          distanceAlongWallFt: this.scaleNumber(feature.distanceAlongWallFt, lengthFactor),
          heightFromFloorInches: this.scaleNumber(feature.heightFromFloorInches, inchFactor),
        }));
        const polygon = next.canvasSketch?.shapes?.find((shape) => shape.type === 'wall_poly')?.points;
        next.dimensions = this.calculateRoomMetrics(
          next.dimensions.walls,
          next.dimensions.ceilingHeightFt,
          next.openings,
          next.dimensions.diagonalACFt,
          next.dimensions.diagonalBDFt,
          unit,
          polygon
        );
        return next;
      }),
    }));
    this.projects.set(converted);
    this.unit.set(unit);
  }

  setTab(tab: string): void {
    const mapped: Record<string, FieldTab> = {
      record: 'record',
      measure: 'measure',
      photos: 'photos',
      site: 'site',
      workspace: 'record',
      dashboard: 'record',
      survey: 'site',
      conditions: 'site',
      media: 'photos',
      ai: 'record',
      report: 'site',
    };
    this.currentActiveTab.set(mapped[tab] || 'record');
  }

  private scaleNumber(value: number, factor: number): number {
    return Math.round((Number(value) || 0) * factor * 10) / 10;
  }

  createProject(partial: Partial<Project>): Project {
    const defaultRoom = this.createDefaultRoom('Great Room / Living Space', 'Main Level');
    const newProj: Project = {
      id: 'proj_' + Date.now(),
      name: partial.name || 'New On-Site Survey',
      clientName: partial.clientName || 'Private Client',
      clientEmail: partial.clientEmail || '',
      clientPhone: partial.clientPhone || '',
      siteAddress: partial.siteAddress || '100 Main Street',
      lotNumber: partial.lotNumber || '',
      rpNumber: partial.rpNumber || '',
      siteArea: partial.siteArea || '',
      surveyDate: partial.surveyDate || new Date().toISOString().split('T')[0],
      initialNotes: partial.initialNotes || '',
      latitude: partial.latitude,
      longitude: partial.longitude,
      city: partial.city || 'San Francisco, CA',
      zip: partial.zip || '',
      projectType: partial.projectType || 'Whole Home',
      targetBudget: partial.targetBudget || 75000,
      budgetFlexibility: partial.budgetFlexibility || 'Moderate (±10%)',
      targetTimeline: partial.targetTimeline || 'Standard (3-6 mo)',
      status: 'In Survey',
      leadDesigner: partial.leadDesigner || 'Lead Architect / Designer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      survey: {
        lifestyle: {
          occupantsCount: 2,
          hasKids: false,
          kidsDetails: '',
          pets: '1 Golden Retriever (needs durable flooring)',
          entertainingFrequency: 'Monthly',
          workFromHome: 'Hybrid (2-3 days)',
          cookingStyle: 'Gourmet / Heavy Cooking',
          storagePriority: 'Maximum / High Density',
          accessibilityNeeds: false,
          accessibilityNotes: '',
          lightingPreference: 'Warm & Layered Ambient',
          acousticConcerns: true,
          acousticNotes: 'Hardwood reflections in double-height areas need dampening rug & drapery strategies',
        },
        selectedStyles: ['japandi', 'warm_minimalist'],
        styleRatings: {
          japandi: 5,
          warm_minimalist: 5,
          modern_organic: 4,
          mid_century_modern: 3,
        },
        primaryColorPalette: ['#F5F3EF', '#EAE6DF', '#D5CBBF', '#3A3935'],
        accentColorPalette: ['#C27D38', '#5A6B5C'],
        forbiddenColors: ['High-contrast purple', 'Neon yellow', 'Candy red'],
        materials: JSON.parse(JSON.stringify(PRESET_MATERIALS)),
        keepFixtures: [],
        contractorScope: {
          plumbingRelocation: false,
          wallDemolition: true,
          electricalServiceUpgrade: true,
          windowDoorReplacement: false,
          permitsRequired: true,
          hvacDuctModification: false,
          generalContractorSelected: false,
          contractorNotes: 'Check bearing capacity on center dividing partition before demolition.',
        },
        clientGeneralNotes: 'Prioritize low-VOC sustainable materials, custom flush cabinetry, and concealed wire management.',
      },
      rooms: [defaultRoom],
      actionItems: [],
    };

    this.projects.update((list) => [newProj, ...list]);
    this.activeProjectId.set(newProj.id);
    this.activeRoomId.set(defaultRoom.id);
    return newProj;
  }

  updateProject(updated: Project): void {
    updated.updatedAt = new Date().toISOString();
    this.projects.update((list) => list.map((p) => (p.id === updated.id ? updated : p)));
  }

  updateActiveProject(updater: (p: Project) => void | Project): void {
    const active = this.activeProject();
    if (!active) return;
    const cloned: Project = JSON.parse(JSON.stringify(active));
    const result = updater(cloned);
    const toSave = (result && typeof result === 'object') ? (result as Project) : cloned;
    this.updateProject(toSave);
  }

  duplicateProject(id: string): void {
    const existing = this.projects().find((p) => p.id === id);
    if (!existing) return;
    const cloned: Project = JSON.parse(JSON.stringify(existing));
    cloned.id = 'proj_' + Date.now();
    cloned.name = `${cloned.name} (Copy)`;
    cloned.createdAt = new Date().toISOString();
    cloned.updatedAt = new Date().toISOString();
    this.projects.update((list) => [cloned, ...list]);
    this.activeProjectId.set(cloned.id);
  }

  deleteProject(id: string): void {
    const list = this.projects().filter((p) => p.id !== id);
    if (list.length === 0) {
      this.unit.set('imperial');
      const seeded = this.createSeedProject();
      this.projects.set([seeded]);
      this.activeProjectId.set(seeded.id);
      this.activeRoomId.set(seeded.rooms[0].id);
    } else {
      this.projects.set(list);
      if (this.activeProjectId() === id) {
        this.activeProjectId.set(list[0].id);
        if (list[0].rooms.length) this.activeRoomId.set(list[0].rooms[0].id);
      }
    }
  }

  // --- Room Actions ---

  addRoomToActiveProject(name = 'New Room', level = 'Main Level', template: 'rect' | 'l_shape' | 'galley' = 'rect'): Room {
    const proj = this.activeProject();
    if (!proj) throw new Error('No active project');

    const newRoom = this.createDefaultRoom(name, level, template);
    const updated = {
      ...proj,
      rooms: [...proj.rooms, newRoom],
    };
    this.updateProject(updated);
    this.activeRoomId.set(newRoom.id);
    return newRoom;
  }

  updateActiveRoom(updater: (room: Room) => Room): void {
    const proj = this.activeProject();
    const currentRoom = this.activeRoom();
    if (!proj || !currentRoom) return;

    const modified = updater(JSON.parse(JSON.stringify(currentRoom)));
    const polygon = modified.canvasSketch?.shapes?.find((shape: CanvasShape) => shape.type === 'wall_poly')?.points;
    modified.dimensions = this.calculateRoomMetrics(
      modified.dimensions.walls,
      modified.dimensions.ceilingHeightFt,
      modified.openings,
      modified.dimensions.diagonalACFt,
      modified.dimensions.diagonalBDFt,
      this.unit(),
      polygon
    );

    const updatedRooms = proj.rooms.map((r) => (r.id === modified.id ? modified : r));
    this.updateProject({
      ...proj,
      rooms: updatedRooms,
    });
  }

  deleteRoom(roomId: string): void {
    const proj = this.activeProject();
    if (!proj || proj.rooms.length <= 1) return; // Keep at least 1 room

    const remaining = proj.rooms.filter((r) => r.id !== roomId);
    this.updateProject({
      ...proj,
      rooms: remaining,
    });
    this.activeRoomId.set(remaining[0].id);
  }

  private remeasure(projects: Project[], unit: MeasurementUnit): Project[] {
    if (!Array.isArray(projects)) return [];
    return projects.map((project) => ({
      ...project,
      actionItems: project.actionItems || [],
      rooms: (project.rooms || []).map((room) => {
        const next: Room = JSON.parse(JSON.stringify(room));
        if (!next.dimensions?.walls) return next;
        const polygon = next.canvasSketch?.shapes?.find((shape) => shape.type === 'wall_poly')?.points;
        const toFeet = (value: number) => (unit === 'metric' ? value / MM_PER_FOOT : value);
        if (polygon && polygon.length === 4 && next.dimensions.walls.length >= 2) {
          let twice = 0;
          for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i];
            const b = polygon[(i + 1) % polygon.length];
            twice += a.x * b.y - b.x * a.y;
          }
          const sketchFt = Math.abs(twice) / 2 / (PIXELS_PER_FOOT * PIXELS_PER_FOOT);
          const scheduleFt = toFeet(next.dimensions.walls[0].lengthFt) * toFeet(next.dimensions.walls[1].lengthFt);
          if (scheduleFt > 0 && Math.abs(sketchFt - scheduleFt) / scheduleFt > 0.15) {
            this.alignRectangleSketch(next, unit);
          }
        }
        const points = next.canvasSketch?.shapes?.find((shape) => shape.type === 'wall_poly')?.points;
        next.dimensions = this.calculateRoomMetrics(
          next.dimensions.walls,
          next.dimensions.ceilingHeightFt,
          next.openings || [],
          next.dimensions.diagonalACFt,
          next.dimensions.diagonalBDFt,
          unit,
          points
        );
        return next;
      }),
    }));
  }

  /** Axis-align a four-corner sketch to the first two wall lengths so area matches the schedule. */
  private alignRectangleSketch(room: Room, unit: MeasurementUnit): void {
    const poly = room.canvasSketch?.shapes?.find((shape) => shape.type === 'wall_poly');
    if (!poly?.points || poly.points.length !== 4 || room.dimensions.walls.length < 2) return;
    const toFeet = (value: number) => (unit === 'metric' ? value / MM_PER_FOOT : value);
    const origin = poly.points[0];
    const widthPx = toFeet(room.dimensions.walls[0].lengthFt) * PIXELS_PER_FOOT;
    const depthPx = toFeet(room.dimensions.walls[1].lengthFt) * PIXELS_PER_FOOT;
    poly.points = [
      { x: origin.x, y: origin.y },
      { x: origin.x + widthPx, y: origin.y },
      { x: origin.x + widthPx, y: origin.y + depthPx },
      { x: origin.x, y: origin.y + depthPx },
    ];
  }

  /** Keep one polygon edge the same length as the edited wall schedule row. */
  stretchWallEdge(room: Room, wallIndex: number, storedLength: number): void {
    const poly = room.canvasSketch?.shapes?.find((shape) => shape.type === 'wall_poly');
    const points = poly?.points;
    if (!points || points.length < 2 || wallIndex < 0 || wallIndex >= points.length) return;
    const start = points[wallIndex];
    const end = points[(wallIndex + 1) % points.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const current = Math.hypot(dx, dy) || 1;
    const feet = this.unit() === 'metric' ? storedLength / MM_PER_FOOT : storedLength;
    const targetPx = Math.max(PIXELS_PER_FOOT, feet * PIXELS_PER_FOOT);
    const scale = targetPx / current;
    const shiftX = start.x + dx * scale - end.x;
    const shiftY = start.y + dy * scale - end.y;
    for (let index = wallIndex + 1; index < points.length; index++) {
      points[index] = { x: points[index].x + shiftX, y: points[index].y + shiftY };
    }
  }

  // --- Helper Room Factory ---

  createDefaultRoom(name: string, level: string, template: 'rect' | 'l_shape' | 'galley' = 'rect'): Room {
    const roomId = 'room_' + Math.random().toString(36).substring(2, 9);
    let walls: WallSegment[] = [];
    let shapes: CanvasShape[] = [];

    if (template === 'l_shape') {
      walls = [
        { id: 'w1', name: 'Wall A (North Main)', orientation: 'N', lengthFt: 20, heightFt: 9.5 },
        { id: 'w2', name: 'Wall B (East Outer)', orientation: 'E', lengthFt: 18, heightFt: 9.5 },
        { id: 'w3', name: 'Wall C (South Return)', orientation: 'S', lengthFt: 10, heightFt: 9.5 },
        { id: 'w4', name: 'Wall D (Inner Notch)', orientation: 'N', lengthFt: 8, heightFt: 9.5 },
        { id: 'w5', name: 'Wall E (West Return)', orientation: 'W', lengthFt: 10, heightFt: 9.5 },
        { id: 'w6', name: 'Wall F (West Main)', orientation: 'S', lengthFt: 10, heightFt: 9.5 },
      ];
      shapes = [
        {
          id: 'sp_poly',
          type: 'wall_poly',
          x: 100,
          y: 100,
          width: 320,
          height: 280,
          rotation: 0,
          label: name,
          points: [
            { x: 100, y: 100 },
            { x: 420, y: 100 },
            { x: 420, y: 380 },
            { x: 260, y: 380 },
            { x: 260, y: 220 },
            { x: 100, y: 220 },
          ],
        },
      ];
    } else if (template === 'galley') {
      walls = [
        { id: 'w1', name: 'Wall A (North Run)', orientation: 'N', lengthFt: 16, heightFt: 9 },
        { id: 'w2', name: 'Wall B (East End)', orientation: 'E', lengthFt: 8, heightFt: 9 },
        { id: 'w3', name: 'Wall C (South Run)', orientation: 'S', lengthFt: 16, heightFt: 9 },
        { id: 'w4', name: 'Wall D (West End)', orientation: 'W', lengthFt: 8, heightFt: 9 },
      ];
      shapes = [
        {
          id: 'sp_rect',
          type: 'wall_poly',
          x: 120,
          y: 140,
          width: 360,
          height: 180,
          rotation: 0,
          label: name,
          points: [
            { x: 120, y: 140 },
            { x: 480, y: 140 },
            { x: 480, y: 320 },
            { x: 120, y: 320 },
          ],
        },
      ];
    } else {
      // Standard 15ft x 18ft Rectangle
      walls = [
        { id: 'w1', name: 'Wall A (North)', orientation: 'N', lengthFt: 18, heightFt: 9.5, notes: 'Main feature wall' },
        { id: 'w2', name: 'Wall B (East)', orientation: 'E', lengthFt: 15, heightFt: 9.5, notes: 'Exterior window run' },
        { id: 'w3', name: 'Wall C (South)', orientation: 'S', lengthFt: 18, heightFt: 9.5, notes: 'Entry hallway connection' },
        { id: 'w4', name: 'Wall D (West)', orientation: 'W', lengthFt: 15, heightFt: 9.5, notes: 'Shared partition wall' },
      ];
      shapes = [
        {
          id: 'sp_rect',
          type: 'wall_poly',
          x: 100,
          y: 100,
          width: 360,
          height: 300,
          rotation: 0,
          label: name,
          points: [
            { x: 100, y: 100 },
            { x: 460, y: 100 },
            { x: 460, y: 400 },
            { x: 100, y: 400 },
          ],
        },
        {
          id: 'elem_door_1',
          type: 'door',
          x: 240,
          y: 400,
          width: 48,
          height: 48,
          rotation: 0,
          label: '36" Entry Door',
        },
        {
          id: 'elem_win_1',
          type: 'window',
          x: 460,
          y: 200,
          width: 60,
          height: 16,
          rotation: 90,
          label: '60" Casement Window',
        },
        {
          id: 'elem_out_1',
          type: 'outlet',
          x: 200,
          y: 100,
          width: 18,
          height: 18,
          rotation: 0,
          label: 'Duplex Outlet',
        },
      ];
    }

    const unit = this.unit();
    if (unit === 'metric') {
      walls.forEach((wall) => {
        wall.lengthFt = Math.round(wall.lengthFt * MM_PER_FOOT);
        wall.heightFt = Math.round(wall.heightFt * MM_PER_FOOT);
      });
    }
    const polygon = shapes.find((shape) => shape.type === 'wall_poly')?.points;
    const ceiling = unit === 'metric' ? Math.round(9.5 * MM_PER_FOOT) : 9.5;
    const calculated = this.calculateRoomMetrics(walls, ceiling, [], undefined, undefined, unit, polygon);

    return {
      id: roomId,
      name,
      level,
      targetUse: 'Primary Living & Entertaining',
      dimensions: calculated,
      openings: [
        {
          id: 'op_1',
          type: 'door',
          wallName: 'Wall C (South)',
          widthInches: 36,
          heightInches: 84,
          sillHeightInches: 0,
          swingDirection: 'inward_right',
          trimWidthInches: 3.5,
          notes: 'Solid core oak door to be refinished',
        },
        {
          id: 'op_2',
          type: 'window',
          wallName: 'Wall B (East)',
          widthInches: 60,
          heightInches: 72,
          sillHeightInches: 18,
          trimWidthInches: 3.5,
          notes: 'Abundant morning natural light, double pane',
        },
      ],
      features: [
        {
          id: 'ft_1',
          type: 'outlet_120v',
          label: 'Quad Dedicated AV Outlet',
          wallName: 'Wall A (North)',
          distanceAlongWallFt: 9,
          heightFromFloorInches: 16,
          notes: 'Concealed behind future media console',
        },
        {
          id: 'ft_2',
          type: 'hvac_supply',
          label: 'Linear Slot Diffuser',
          wallName: 'Wall B (East)',
          distanceAlongWallFt: 7.5,
          heightFromFloorInches: 110,
          notes: 'Ceiling soffit drop',
        },
      ],
      conditions: {
        subfloor: {
          levelness: 'Level / True (±1/8")',
          material: '3/4" Tongue & Groove Plywood',
          moistureReading: 9.5,
          deflectionNotes: 'L/480 framing suitable for stone or hardwood',
        },
        electrical: {
          mainPanelAmps: 200,
          groundedOutlets: true,
          outletCount: 6,
          switchCount: 2,
          ceilingJunctionBoxes: 2,
        },
        plumbing: {
          roughInPresent: true,
          supplyLines: '1/2" PEX / Copper Hybrid',
          drainStackLocation: 'East wet wall (3" PVC stack)',
          fixtureClearanceCompliant: true,
        },
        hvac: {
          heatingType: 'Central Ducted Heat Pump',
          supplyRegistersCount: 2,
          returnVentPresent: true,
        },
        structural: {
          bearingWallsIdentified: false,
          ceilingFramingType: 'Engineered I-Joists 16" O.C.',
          notes: 'No sagging observed; ceiling height 9ft 6in across all 4 corners',
        },
      },
      existingFinishes: {
        flooringType: 'Engineered White Oak (7.5" Wide Plank)',
        wallFinish: 'Level 5 Smooth Finish (Ultra-Flat)',
        ceilingType: 'Smooth Drywall (White Matte 9ft)',
        baseboardHeightInches: 5.5,
        trimNotes: 'Modern square-edge 5.5" baseboard',
      },
      canvasSketch: {
        shapes,
        gridSize: 20,
        scale: 1.0,
      },
      photos: [],
      audioNotes: [],
    };
  }

  // --- Seed Demo Project ---

  private createSeedProject(): Project {
    const room1 = this.createDefaultRoom('Great Room & Open Kitchen', 'Main Level');
    room1.dimensions = this.calculateRoomMetrics(
      [
        { id: 'w1', name: 'Wall A (North Dining Run)', orientation: 'N', lengthFt: 24, heightFt: 10, notes: 'Future built-in storage bench' },
        { id: 'w2', name: 'Wall B (East Window Wall)', orientation: 'E', lengthFt: 18, heightFt: 10, notes: 'Three floor-to-ceiling glass panels' },
        { id: 'w3', name: 'Wall C (South Kitchen Backsplash)', orientation: 'S', lengthFt: 24, heightFt: 10, notes: 'Plumbing and gas rough-in locations' },
        { id: 'w4', name: 'Wall D (West Foyer Entry)', orientation: 'W', lengthFt: 18, heightFt: 10, notes: 'Coat closet niche' },
      ],
      10,
      [
        { widthInches: 72, heightInches: 96 },
        { widthInches: 36, heightInches: 84 },
      ],
      30.0,
      30.0,
      'imperial'
    );

    const room2 = this.createDefaultRoom('Primary Suite Sanctuary', 'Upper Level');
    room2.dimensions = this.calculateRoomMetrics(
      [
        { id: 'w1', name: 'Wall A (Bed Headboard Wall)', orientation: 'N', lengthFt: 16, heightFt: 9, notes: 'Fluted wood slat accent panel planned' },
        { id: 'w2', name: 'Wall B (East Window)', orientation: 'E', lengthFt: 14, heightFt: 9, notes: 'Motorized blackout drapery pocket' },
        { id: 'w3', name: 'Wall C (Walk-in Closet Wall)', orientation: 'S', lengthFt: 16, heightFt: 9, notes: 'Pocket door opening' },
        { id: 'w4', name: 'Wall D (Ensuite Access)', orientation: 'W', lengthFt: 14, heightFt: 9, notes: 'Frosted fluted glass pocket door' },
      ],
      9,
      [
        { widthInches: 32, heightInches: 84 },
        { widthInches: 48, heightInches: 60 },
      ],
      21.26,
      21.26,
      'imperial'
    );

    const room3 = this.createDefaultRoom('Guest Powder Room', 'Main Level');
    room3.dimensions = this.calculateRoomMetrics(
      [
        { id: 'w1', name: 'Wall A (Floating Vanity)', orientation: 'N', lengthFt: 8, heightFt: 9, notes: 'Wall-mount faucet plumbing valve' },
        { id: 'w2', name: 'Wall B (Side Wall)', orientation: 'E', lengthFt: 6, heightFt: 9, notes: 'Full height smoked mirror' },
        { id: 'w3', name: 'Wall C (Wall-Hung Toilet)', orientation: 'S', lengthFt: 8, heightFt: 9, notes: 'In-wall tank carrier system' },
        { id: 'w4', name: 'Wall D (Entry Door)', orientation: 'W', lengthFt: 6, heightFt: 9, notes: 'Pocket door with soft close' },
      ],
      9,
      [{ widthInches: 30, heightInches: 84 }],
      10.0,
      10.0,
      'imperial'
    );
    for (const room of [room1, room2, room3]) {
      this.alignRectangleSketch(room, 'imperial');
      const polygon = room.canvasSketch?.shapes?.find((shape) => shape.type === 'wall_poly')?.points;
      room.dimensions = this.calculateRoomMetrics(
        room.dimensions.walls,
        room.dimensions.ceilingHeightFt,
        room.openings,
        room.dimensions.diagonalACFt,
        room.dimensions.diagonalBDFt,
        'imperial',
        polygon
      );
    }

    return {
      id: 'proj_mercer_penthouse',
      name: 'The Mercer Loft Remodel',
      clientName: 'Eleanor & Marcus Vance',
      clientEmail: 'eleanor.vance@vancestrategies.com',
      clientPhone: '+1 (415) 890-2341',
      siteAddress: '450 Mercer Street, Suite 9B',
      city: 'New York, NY',
      zip: '10013',
      projectType: 'Whole Home',
      targetBudget: 185000,
      budgetFlexibility: 'Moderate (±10%)',
      targetTimeline: 'Standard (3-6 mo)',
      status: 'In Survey',
      leadDesigner: 'Studio Arch Design Pro',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      updatedAt: new Date().toISOString(),
      survey: {
        lifestyle: {
          occupantsCount: 2,
          hasKids: false,
          kidsDetails: 'None (Entertain guests & visiting family frequently)',
          pets: '1 Hypoallergenic Cavapoo',
          entertainingFrequency: 'Weekly',
          workFromHome: 'Full-Time (Daily)',
          cookingStyle: 'Gourmet / Heavy Cooking',
          storagePriority: 'Maximum / High Density',
          accessibilityNeeds: false,
          accessibilityNotes: '',
          lightingPreference: 'Warm & Layered Ambient',
          acousticConcerns: true,
          acousticNotes: 'Loft open-space acoustics need acoustic ceiling baffle or wood slat dampening behind dining zone.',
        },
        selectedStyles: ['japandi', 'warm_minimalist', 'modern_organic'],
        styleRatings: {
          japandi: 5,
          warm_minimalist: 5,
          modern_organic: 4,
          transitional_luxury: 3,
        },
        primaryColorPalette: ['#F9F8F6', '#E7E2D9', '#C5B9AC', '#3C3936'],
        accentColorPalette: ['#C57D3C', '#687B6C'],
        forbiddenColors: ['High-contrast royal purple', 'High-gloss lacquer red', 'Bright yellow'],
        materials: JSON.parse(JSON.stringify(PRESET_MATERIALS)),
        keepFixtures: [
          {
            id: 'fix_1',
            name: 'Original 1920s Cast Iron Column',
            location: 'Great Room Center',
            action: 'keep_as_is',
            notes: 'Expose authentic cast iron texture with matte sealant finish.',
          },
          {
            id: 'fix_2',
            name: 'Vintage Danish Teak Credenza',
            location: 'Dining Niche',
            action: 'repurpose',
            notes: 'Incorporate as feature dry-bar unit.',
          },
        ],
        contractorScope: {
          plumbingRelocation: true,
          wallDemolition: true,
          electricalServiceUpgrade: true,
          windowDoorReplacement: false,
          permitsRequired: true,
          hvacDuctModification: true,
          generalContractorSelected: true,
          contractorNotes: 'HOA requires architectural review board submission for waste pipe core-drilling.',
        },
        clientGeneralNotes: 'Clients desire tactile organic minimalism: integrated sub-zero appliances, honed travertine island with 3" mitered waterfall edge, and seamless flush baseboards.',
      },
      rooms: [room1, room2, room3],
      actionItems: [],
    };
  }

  // --- Export & Import Backup ---

  exportAllProjectsJson(): void {
    const data = JSON.stringify(this.projects(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `design-consult-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importProjectsJson(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].name) {
        this.projects.set(parsed);
        this.activeProjectId.set(parsed[0].id);
        if (parsed[0].rooms.length) this.activeRoomId.set(parsed[0].rooms[0].id);
        return true;
      }
    } catch (e) {
      console.error('Import parse error:', e);
    }
    return false;
  }
}
