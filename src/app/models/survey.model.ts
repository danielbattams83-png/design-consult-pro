export type ProjectStatus = 'Active' | 'Completed';

export type MeasurementSystem = 'metric' | 'imperial';

/**
 * Core Project Model for Site Survey & Design Consultation
 */
export interface Project {
  id: string;
  projectName: string;
  clientName: string;
  siteAddress: string;
  lotNumber: string;
  rpNumber: string;
  siteArea: string | number;
  surveyDate: string; // ISO date string e.g., '2026-08-27'
  initialNotes: string;
  status: ProjectStatus;
  createdAt?: string;
  updatedAt?: string;
  roomMeasurements?: RoomMeasurement[];
}

/**
 * Core Room Measurement Model for On-site 2D & 3D Takeoffs
 */
export interface RoomMeasurement {
  id: string;
  projectId: string;
  roomName: string;
  length: number;
  width: number;
  height: number;
  notes?: string;
  floorArea?: number;
  perimeter?: number;
  wallArea?: number;
  volume?: number;
  level?: string;
}

/**
 * DTOs for creating and updating project and room measurements
 */
export type CreateProjectDto = Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'roomMeasurements'> & {
  id?: string;
  roomMeasurements?: RoomMeasurement[];
};

export type UpdateProjectDto = Partial<Omit<Project, 'id'>>;

export type CreateRoomMeasurementDto = Omit<RoomMeasurement, 'id' | 'floorArea' | 'perimeter' | 'wallArea' | 'volume'> & {
  id?: string;
};

export type UpdateRoomMeasurementDto = Partial<Omit<RoomMeasurement, 'id' | 'projectId'>>;

/**
 * Calculated aggregate metrics for a project
 */
export interface ProjectSurveySummary {
  totalRooms: number;
  totalFloorArea: number;
  totalPerimeter: number;
  totalWallSurfaceArea: number;
  totalVolume: number;
  averageCeilingHeight: number;
}
