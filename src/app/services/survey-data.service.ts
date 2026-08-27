import { Injectable, computed, effect, signal } from '@angular/core';
import {
  CreateProjectDto,
  CreateRoomMeasurementDto,
  MeasurementSystem,
  Project,
  ProjectStatus,
  ProjectSurveySummary,
  RoomMeasurement,
  UpdateProjectDto,
  UpdateRoomMeasurementDto,
} from '../models/survey.model';

const STORAGE_PROJECTS_KEY = 'design_consult_pro_survey_projects';
const STORAGE_MEASUREMENTS_KEY = 'design_consult_pro_survey_measurements';
const STORAGE_ACTIVE_PROJ_KEY = 'design_consult_pro_active_project_id';
const STORAGE_UNIT_KEY = 'design_consult_pro_unit_system';

@Injectable({
  providedIn: 'root',
})
export class SurveyDataService {
  // --- Reactive Signals ---
  readonly projects = signal<Project[]>([]);
  readonly roomMeasurements = signal<RoomMeasurement[]>([]);
  readonly activeProjectId = signal<string>('');
  readonly activeMeasurementId = signal<string>('');
  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<ProjectStatus | 'All'>('All');
  readonly unit = signal<MeasurementSystem>('metric');
  readonly isOnline = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // --- Computed Selectors ---

  /** Currently selected active project */
  readonly activeProject = computed<Project | null>(() => {
    const list = this.projects();
    const currentId = this.activeProjectId();
    if (!list.length) return null;
    return list.find((p) => p.id === currentId) || list[0] || null;
  });

  /** Measurements associated with the current active project */
  readonly activeProjectMeasurements = computed<RoomMeasurement[]>(() => {
    const active = this.activeProject();
    if (!active) return [];
    return this.roomMeasurements().filter((m) => m.projectId === active.id);
  });

  /** Filtered list of projects according to search query and status */
  readonly filteredProjects = computed<Project[]>(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    let result = this.projects();

    if (status !== 'All') {
      result = result.filter((p) => p.status === status);
    }

    if (query) {
      result = result.filter(
        (p) =>
          p.projectName.toLowerCase().includes(query) ||
          p.clientName.toLowerCase().includes(query) ||
          p.siteAddress.toLowerCase().includes(query) ||
          p.lotNumber.toLowerCase().includes(query) ||
          p.rpNumber.toLowerCase().includes(query)
      );
    }

    return result;
  });

  /** Aggregate survey calculations and takeoffs for active project */
  readonly activeProjectSummary = computed<ProjectSurveySummary>(() => {
    const measurements = this.activeProjectMeasurements();
    if (!measurements.length) {
      return {
        totalRooms: 0,
        totalFloorArea: 0,
        totalPerimeter: 0,
        totalWallSurfaceArea: 0,
        totalVolume: 0,
        averageCeilingHeight: 0,
      };
    }

    let totalFloorArea = 0;
    let totalPerimeter = 0;
    let totalWallArea = 0;
    let totalVolume = 0;
    let sumHeight = 0;

    for (const m of measurements) {
      const calc = this.calculateRoomMetrics(m.length, m.width, m.height);
      totalFloorArea += calc.floorArea;
      totalPerimeter += calc.perimeter;
      totalWallArea += calc.wallArea;
      totalVolume += calc.volume;
      sumHeight += m.height;
    }

    return {
      totalRooms: measurements.length,
      totalFloorArea: Math.round(totalFloorArea * 100) / 100,
      totalPerimeter: Math.round(totalPerimeter * 100) / 100,
      totalWallSurfaceArea: Math.round(totalWallArea * 100) / 100,
      totalVolume: Math.round(totalVolume * 100) / 100,
      averageCeilingHeight: Math.round((sumHeight / measurements.length) * 100) / 100,
    };
  });

  /** Currently selected room measurement */
  readonly activeMeasurement = computed<RoomMeasurement | null>(() => {
    const mId = this.activeMeasurementId();
    if (!mId) return null;
    return this.roomMeasurements().find((m) => m.id === mId) || null;
  });

  constructor() {
    this.initNetworkListeners();
    this.loadFromLocalStorage();

    // Offline auto-sync effect to persist changes locally
    effect(() => {
      const projList = this.projects();
      const measList = this.roomMeasurements();
      const activeId = this.activeProjectId();
      const currentUnit = this.unit();

      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(projList));
          localStorage.setItem(STORAGE_MEASUREMENTS_KEY, JSON.stringify(measList));
          if (activeId) {
            localStorage.setItem(STORAGE_ACTIVE_PROJ_KEY, activeId);
          }
          localStorage.setItem(STORAGE_UNIT_KEY, currentUnit);
        } catch (err) {
          console.warn('Design Consult Pro: LocalStorage write failed:', err);
        }
      }
    });
  }

  // --- Network Listener ---
  private initNetworkListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.isOnline.set(true));
      window.addEventListener('offline', () => this.isOnline.set(false));
    }
  }

  // --- Calculations & Geometric Takeoffs ---

  /**
   * Computes floor area, perimeter, net wall paint area, and volume based on dimensions.
   */
  calculateRoomMetrics(
    length: number,
    width: number,
    height: number
  ): { floorArea: number; perimeter: number; wallArea: number; volume: number } {
    const l = Math.max(0, Number(length) || 0);
    const w = Math.max(0, Number(width) || 0);
    const h = Math.max(0, Number(height) || 0);

    const floorArea = Math.round(l * w * 100) / 100;
    const perimeter = Math.round(2 * (l + w) * 100) / 100;
    const wallArea = Math.round(perimeter * h * 100) / 100;
    const volume = Math.round(floorArea * h * 100) / 100;

    return { floorArea, perimeter, wallArea, volume };
  }

  // --- Project CRUD Operations ---

  getProjects(): Project[] {
    return this.projects();
  }

  getProjectById(id: string): Project | undefined {
    return this.projects().find((p) => p.id === id);
  }

  setActiveProject(id: string): void {
    const target = this.projects().find((p) => p.id === id);
    if (target) {
      this.activeProjectId.set(id);
      const measurements = this.getRoomMeasurementsForProject(id);
      if (measurements.length) {
        this.activeMeasurementId.set(measurements[0].id);
      } else {
        this.activeMeasurementId.set('');
      }
    }
  }

  createProject(dto: CreateProjectDto): Project {
    const now = new Date().toISOString();
    const id = dto.id || 'proj_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    
    const newProject: Project = {
      id,
      projectName: dto.projectName.trim(),
      clientName: dto.clientName.trim(),
      siteAddress: dto.siteAddress.trim(),
      lotNumber: dto.lotNumber.trim(),
      rpNumber: dto.rpNumber.trim(),
      siteArea: dto.siteArea,
      surveyDate: dto.surveyDate || now.slice(0, 10),
      initialNotes: dto.initialNotes || '',
      status: dto.status || 'Active',
      createdAt: now,
      updatedAt: now,
    };

    // If initial room measurements were provided, persist them
    if (dto.roomMeasurements && dto.roomMeasurements.length > 0) {
      const formattedMeasurements = dto.roomMeasurements.map((m) => {
        const calc = this.calculateRoomMetrics(m.length, m.width, m.height);
        return {
          ...m,
          id: m.id || 'meas_' + Math.random().toString(36).substring(2, 9),
          projectId: id,
          ...calc,
        };
      });

      this.roomMeasurements.update((list) => [...list, ...formattedMeasurements]);
    }

    this.projects.update((list) => [newProject, ...list]);
    this.setActiveProject(newProject.id);
    return newProject;
  }

  updateProject(id: string, updates: UpdateProjectDto): Project | null {
    const existing = this.getProjectById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: Project = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    this.projects.update((list) => list.map((p) => (p.id === id ? updated : p)));
    return updated;
  }

  deleteProject(id: string): boolean {
    const exists = this.getProjectById(id);
    if (!exists) return false;

    // Cascade delete related measurements
    this.roomMeasurements.update((list) => list.filter((m) => m.projectId !== id));
    this.projects.update((list) => list.filter((p) => p.id !== id));

    const remaining = this.projects();
    if (remaining.length > 0) {
      this.setActiveProject(remaining[0].id);
    } else {
      this.activeProjectId.set('');
      this.activeMeasurementId.set('');
    }

    return true;
  }

  toggleProjectStatus(id: string): void {
    const project = this.getProjectById(id);
    if (!project) return;
    const nextStatus: ProjectStatus = project.status === 'Active' ? 'Completed' : 'Active';
    this.updateProject(id, { status: nextStatus });
  }

  // --- Room Measurement CRUD Operations ---

  getRoomMeasurements(projectId?: string): RoomMeasurement[] {
    const all = this.roomMeasurements();
    if (projectId) {
      return all.filter((m) => m.projectId === projectId);
    }
    return all;
  }

  getRoomMeasurementsForProject(projectId: string): RoomMeasurement[] {
    return this.roomMeasurements().filter((m) => m.projectId === projectId);
  }

  getRoomMeasurementById(id: string): RoomMeasurement | undefined {
    return this.roomMeasurements().find((m) => m.id === id);
  }

  setActiveMeasurement(id: string): void {
    this.activeMeasurementId.set(id);
  }

  addRoomMeasurement(dto: CreateRoomMeasurementDto): RoomMeasurement {
    const id = dto.id || 'meas_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    const calc = this.calculateRoomMetrics(dto.length, dto.width, dto.height);

    const newMeasurement: RoomMeasurement = {
      id,
      projectId: dto.projectId,
      roomName: dto.roomName.trim(),
      length: Number(dto.length) || 0,
      width: Number(dto.width) || 0,
      height: Number(dto.height) || 0,
      notes: dto.notes || '',
      level: dto.level || 'Main Level',
      ...calc,
    };

    this.roomMeasurements.update((list) => [...list, newMeasurement]);
    this.activeMeasurementId.set(newMeasurement.id);

    // Touch project updatedAt
    this.updateProject(dto.projectId, {});

    return newMeasurement;
  }

  updateRoomMeasurement(id: string, updates: UpdateRoomMeasurementDto): RoomMeasurement | null {
    const existing = this.getRoomMeasurementById(id);
    if (!existing) return null;

    const length = updates.length !== undefined ? updates.length : existing.length;
    const width = updates.width !== undefined ? updates.width : existing.width;
    const height = updates.height !== undefined ? updates.height : existing.height;
    const calc = this.calculateRoomMetrics(length, width, height);

    const updated: RoomMeasurement = {
      ...existing,
      ...updates,
      length: Number(length) || 0,
      width: Number(width) || 0,
      height: Number(height) || 0,
      ...calc,
    };

    this.roomMeasurements.update((list) => list.map((m) => (m.id === id ? updated : m)));
    this.updateProject(existing.projectId, {});

    return updated;
  }

  deleteRoomMeasurement(id: string): boolean {
    const target = this.getRoomMeasurementById(id);
    if (!target) return false;

    this.roomMeasurements.update((list) => list.filter((m) => m.id !== id));
    
    if (this.activeMeasurementId() === id) {
      const remaining = this.getRoomMeasurementsForProject(target.projectId);
      this.activeMeasurementId.set(remaining.length ? remaining[0].id : '');
    }

    this.updateProject(target.projectId, {});
    return true;
  }

  // --- Filtering & Unit Controls ---

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
  }

  setStatusFilter(status: ProjectStatus | 'All'): void {
    this.statusFilter.set(status);
  }

  setUnit(unit: MeasurementSystem): void {
    this.unit.set(unit);
  }

  // --- Persistence & Mock Seed Loading ---

  loadFromLocalStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      this.loadMockSeedData();
      return;
    }

    try {
      const savedUnit = localStorage.getItem(STORAGE_UNIT_KEY) as MeasurementSystem;
      if (savedUnit) {
        this.unit.set(savedUnit);
      }

      const projectsRaw = localStorage.getItem(STORAGE_PROJECTS_KEY);
      const measurementsRaw = localStorage.getItem(STORAGE_MEASUREMENTS_KEY);

      if (projectsRaw) {
        const parsedProjects: Project[] = JSON.parse(projectsRaw);
        if (Array.isArray(parsedProjects) && parsedProjects.length > 0) {
          this.projects.set(parsedProjects);

          if (measurementsRaw) {
            const parsedMeasurements: RoomMeasurement[] = JSON.parse(measurementsRaw);
            if (Array.isArray(parsedMeasurements)) {
              this.roomMeasurements.set(parsedMeasurements);
            }
          }

          const savedActiveId = localStorage.getItem(STORAGE_ACTIVE_PROJ_KEY);
          if (savedActiveId && parsedProjects.some((p) => p.id === savedActiveId)) {
            this.setActiveProject(savedActiveId);
          } else {
            this.setActiveProject(parsedProjects[0].id);
          }
          return;
        }
      }
    } catch (e) {
      console.warn('Design Consult Pro: Failed to parse storage, loading mock projects:', e);
    }

    // Default mock data preload
    this.loadMockSeedData();
  }

  saveToLocalStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(this.projects()));
      localStorage.setItem(STORAGE_MEASUREMENTS_KEY, JSON.stringify(this.roomMeasurements()));
      localStorage.setItem(STORAGE_ACTIVE_PROJ_KEY, this.activeProjectId());
      localStorage.setItem(STORAGE_UNIT_KEY, this.unit());
    } catch (e) {
      console.warn('Manual save to localStorage failed:', e);
    }
  }

  resetToMockDefaults(): void {
    this.loadMockSeedData();
    this.saveToLocalStorage();
  }

  /**
   * Pre-loads the 3 required mock active projects for Design Consult Pro:
   * 1. 46 King Charles Dr. Sovereign Island
   * 2. Battams Residence - Upper Coomera
   * 3. 123 Main street, yeerongpilly
   */
  private loadMockSeedData(): void {
    const mockProjects: Project[] = [
      {
        id: 'proj_sovereign_island',
        projectName: '46 King Charles Dr. Sovereign Island',
        clientName: 'Harrison & Vivienne Sterling',
        siteAddress: '46 King Charles Drive, Sovereign Islands QLD 4216',
        lotNumber: 'Lot 148',
        rpNumber: 'RP849201',
        siteArea: '840 m²',
        surveyDate: '2026-08-20',
        initialNotes: 'Deep waterfront luxury residence with 22m pontoon mooring. Client requests open-concept ground floor transformation, expanding the kitchen into an outdoor alfresco loggia. Structural verification required for central load-bearing masonry removal. Subfloor is high-strength post-tensioned concrete slab with integrated hydronic heating channels.',
        status: 'Active',
        createdAt: '2026-08-20T08:30:00.000Z',
        updatedAt: '2026-08-26T14:15:00.000Z',
      },
      {
        id: 'proj_upper_coomera',
        projectName: 'Battams Residence - Upper Coomera',
        clientName: 'Claire & David Battams',
        siteAddress: '88 Riverstone Crossing Way, Upper Coomera QLD 4209',
        lotNumber: 'Lot 82',
        rpNumber: 'RP612940',
        siteArea: '1,250 m²',
        surveyDate: '2026-08-24',
        initialNotes: 'Acreage hillside estate with panoramic hinterland views. Scope encompasses full custom kitchen, scullery extension, acoustic treatment for executive home studio, and seamless transitions to wrap-around timber verandas. Subfloor consists of tongue-and-groove hardwood over structural steel bearer frames.',
        status: 'Active',
        createdAt: '2026-08-24T09:00:00.000Z',
        updatedAt: '2026-08-26T11:45:00.000Z',
      },
      {
        id: 'proj_yeerongpilly',
        projectName: '123 Main street, yeerongpilly',
        clientName: 'Marcus & Priya Chen',
        siteAddress: '123 Main Street, Yeerongpilly QLD 4105',
        lotNumber: 'Lot 15',
        rpNumber: 'RP109483',
        siteArea: '607 m²',
        surveyDate: '2026-08-26',
        initialNotes: 'Classic 1920s Character Queenslander residence undergoing architect-led conservation and modern rear pavilion extension. High 3.2m VJ wall paneling with ornate ceiling roses. Laser straightedge survey identified a minor 8mm drop on the southwest veranda footing requiring stump re-packing prior to stone tile installation.',
        status: 'Active',
        createdAt: '2026-08-26T07:45:00.000Z',
        updatedAt: '2026-08-27T08:20:00.000Z',
      },
    ];

    const mockMeasurements: RoomMeasurement[] = [
      // 1. 46 King Charles Dr. Sovereign Island
      {
        id: 'meas_si_1',
        projectId: 'proj_sovereign_island',
        roomName: 'Grand Foyer & Gallery Hall',
        length: 4.8,
        width: 3.6,
        height: 3.4,
        notes: 'Double-height entry void with bespoke fluted marble wall niche and custom brass pivot door clearance.',
        level: 'Ground Level',
        ...this.calculateRoomMetrics(4.8, 3.6, 3.4),
      },
      {
        id: 'meas_si_2',
        projectId: 'proj_sovereign_island',
        roomName: 'Great Room & Waterfront Living',
        length: 9.5,
        width: 7.2,
        height: 3.2,
        notes: 'Direct uninterrupted vista overlooking the canal. Concealed motorized pocket sliders spanning 8.0m across eastern boundary.',
        level: 'Ground Level',
        ...this.calculateRoomMetrics(9.5, 7.2, 3.2),
      },
      {
        id: 'meas_si_3',
        projectId: 'proj_sovereign_island',
        roomName: 'Gourmet Kitchen & Scullery',
        length: 6.4,
        width: 4.8,
        height: 3.0,
        notes: 'Island bench provision 4.2m x 1.4m. In-floor plumbing rough-in for double prep sinks and sub-zero wine column.',
        level: 'Ground Level',
        ...this.calculateRoomMetrics(6.4, 4.8, 3.0),
      },
      {
        id: 'meas_si_4',
        projectId: 'proj_sovereign_island',
        roomName: 'Master Sanctuary Suite',
        length: 6.8,
        width: 5.4,
        height: 3.0,
        notes: 'Private balcony connection, acoustic ceiling isolation, integrated custom walk-in dressing millwork.',
        level: 'Upper Level',
        ...this.calculateRoomMetrics(6.8, 5.4, 3.0),
      },
      {
        id: 'meas_si_5',
        projectId: 'proj_sovereign_island',
        roomName: 'Alfresco Loggia & Pool Terrace',
        length: 10.2,
        width: 5.0,
        height: 3.2,
        notes: 'Outdoor barbecue kitchen, motorized louvered roof integration, honed limestone tile takeoff.',
        level: 'Ground Level',
        ...this.calculateRoomMetrics(10.2, 5.0, 3.2),
      },

      // 2. Battams Residence - Upper Coomera
      {
        id: 'meas_uc_1',
        projectId: 'proj_upper_coomera',
        roomName: 'Open Plan Living & Dining',
        length: 8.2,
        width: 6.0,
        height: 2.7,
        notes: 'Cathedral ceiling pitch peaking at 3.6m. Engineered spotted gum hardwood flooring takeoff.',
        level: 'Main Level',
        ...this.calculateRoomMetrics(8.2, 6.0, 2.7),
      },
      {
        id: 'meas_uc_2',
        projectId: 'proj_upper_coomera',
        roomName: 'Designer Kitchen & Butler Pantry',
        length: 5.5,
        width: 4.2,
        height: 2.7,
        notes: 'Gas line capped on rear external wall. 240V dedicated 32A inductive cooktop breaker present in sub-board.',
        level: 'Main Level',
        ...this.calculateRoomMetrics(5.5, 4.2, 2.7),
      },
      {
        id: 'meas_uc_3',
        projectId: 'proj_upper_coomera',
        roomName: 'Executive Audio & Work Studio',
        length: 4.2,
        width: 3.6,
        height: 2.7,
        notes: 'Resilient channel drywall dampening on shared partition wall. Dedicated data and clean power circuit.',
        level: 'Main Level',
        ...this.calculateRoomMetrics(4.2, 3.6, 2.7),
      },
      {
        id: 'meas_uc_4',
        projectId: 'proj_upper_coomera',
        roomName: 'Master Bedroom Retreat',
        length: 5.0,
        width: 4.5,
        height: 2.7,
        notes: 'Northern light exposure with deep eaves. Dual walk-in robes and ensuite wet-area access.',
        level: 'Main Level',
        ...this.calculateRoomMetrics(5.0, 4.5, 2.7),
      },

      // 3. 123 Main street, yeerongpilly
      {
        id: 'meas_yp_1',
        projectId: 'proj_yeerongpilly',
        roomName: 'Heritage Lounge & Central Hall',
        length: 7.0,
        width: 4.5,
        height: 3.2,
        notes: 'Authentic 140mm pine floorboards, timber picture rails at 2.6m, fretwork archway to be restored.',
        level: 'Upper Living',
        ...this.calculateRoomMetrics(7.0, 4.5, 3.2),
      },
      {
        id: 'meas_yp_2',
        projectId: 'proj_yeerongpilly',
        roomName: 'Kitchen & Meals Pavilion',
        length: 5.8,
        width: 4.0,
        height: 3.2,
        notes: 'To be reconfigured into open-plan layout connecting to rear entertaining deck. Casement windows to be re-glazed.',
        level: 'Upper Living',
        ...this.calculateRoomMetrics(5.8, 4.0, 3.2),
      },
      {
        id: 'meas_yp_3',
        projectId: 'proj_yeerongpilly',
        roomName: 'Primary Bedroom Suite',
        length: 4.6,
        width: 4.2,
        height: 3.2,
        notes: 'French doors opening onto front veranda. VJ walls require level 4 prep and low-VOC satin finish.',
        level: 'Upper Living',
        ...this.calculateRoomMetrics(4.6, 4.2, 3.2),
      },
      {
        id: 'meas_yp_4',
        projectId: 'proj_yeerongpilly',
        roomName: 'Rear Veranda & Entertaining Deck',
        length: 6.5,
        width: 3.8,
        height: 3.0,
        notes: 'Hardwood decking boards (90x19mm Merbau). Integrated balustrade with 100mm gap building code clearance.',
        level: 'Upper Living',
        ...this.calculateRoomMetrics(6.5, 3.8, 3.0),
      },
    ];

    this.projects.set(mockProjects);
    this.roomMeasurements.set(mockMeasurements);
    this.activeProjectId.set(mockProjects[0].id);
    this.activeMeasurementId.set(mockMeasurements[0].id);
  }

  // --- Export & Import JSON Backup ---

  exportDataAsJson(): string {
    const payload = {
      version: '2.4',
      exportedAt: new Date().toISOString(),
      projects: this.projects(),
      roomMeasurements: this.roomMeasurements(),
    };
    return JSON.stringify(payload, null, 2);
  }

  importDataFromJson(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (data && Array.isArray(data.projects) && data.projects.length > 0) {
        this.projects.set(data.projects);
        if (Array.isArray(data.roomMeasurements)) {
          this.roomMeasurements.set(data.roomMeasurements);
        } else {
          this.roomMeasurements.set([]);
        }

        this.setActiveProject(data.projects[0].id);
        this.saveToLocalStorage();
        return true;
      }
    } catch (e) {
      console.error('Design Consult Pro: Failed to import JSON payload:', e);
    }
    return false;
  }
}
