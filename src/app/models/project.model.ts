export type MeasurementUnit = 'imperial' | 'metric';

export type ProjectStatus = 'Draft' | 'Scheduled' | 'In Survey' | 'Estimating' | 'Proposal Ready' | 'Signed' | 'Completed';

export type BudgetFlexibility = 'Strict' | 'Moderate (±10%)' | 'Flexible';

export type TargetTimeline = 'Immediate (1-2 mo)' | 'Standard (3-6 mo)' | 'Long Range (6-12 mo)' | 'Flexible';

export type SubfloorType = 'Concrete Slab' | 'Plywood / OSB' | 'Hardwood Plank' | 'Tile' | 'Unlevel / Needs Prep' | 'Unknown';

export type SubfloorCondition = 'Excellent / Level' | 'Good' | 'Fair / Minor Slope' | 'Cracked / Moisture Issues' | 'Severe Slope';

export type WallPlumb = 'True / Square (90°)' | 'Slight Bowing (<1/4")' | 'Moderate Out-of-Plumb (1/4"-1/2")' | 'Severe Out-of-Plumb (>1/2")';

export type NaturalLight = 'Abundant South / West' | 'Bright East Morning' | 'Diffused North' | 'Low / Limited' | 'Windowless Interior';

export type OpeningType = 'door' | 'double_door' | 'pocket_door' | 'sliding_glass' | 'cased_opening' | 'window' | 'bay_window';

export type FeatureType = 'outlet_120v' | 'outlet_240v' | 'switch' | 'plumbing_rough' | 'hvac_supply' | 'hvac_return' | 'column' | 'radiator' | 'gas_line' | 'breaker_panel';

export interface WallSegment {
  id: string;
  name: string; // e.g. "Wall A (North)", "Wall B (East)"
  orientation: 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';
  lengthFt: number; // in feet (e.g. 14.5)
  lengthInches?: number; // fractional or inches representation
  heightFt: number; // in feet (e.g. 9.0)
  notes?: string;
}

export interface CanvasShape {
  id: string;
  type: 'wall_poly' | 'door' | 'double_door' | 'sliding_door' | 'window' | 'outlet' | 'plumbing' | 'column' | 'hvac' | 'furniture_box' | 'text_note';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  color?: string;
  points?: { x: number; y: number }[]; // for polygon walls
}

export interface OpeningItem {
  id: string;
  type: OpeningType;
  wallName: string;
  widthInches: number;
  heightInches: number;
  sillHeightInches: number; // 0 for doors
  swingDirection?: 'inward_left' | 'inward_right' | 'outward_left' | 'outward_right' | 'bifold' | 'slider';
  trimWidthInches: number;
  casingDetails?: string;
  notes?: string;
}

export type RoomOpening = OpeningItem;

export interface FeatureItem {
  id: string;
  type: FeatureType;
  label: string;
  wallName: string;
  distanceAlongWallFt: number;
  heightFromFloorInches: number;
  notes?: string;
}

export interface PhotoAnnotation {
  id: string;
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  text: string;
  type: 'dimension' | 'damage' | 'electrical' | 'plumbing' | 'general';
}

export interface RoomPhoto {
  id: string;
  dataUrl: string;
  caption: string;
  takenAt: string;
  tags: string[];
  annotations: PhotoAnnotation[];
}

export interface AudioNote {
  id: string;
  title: string;
  recordedAt: string;
  durationSeconds: number;
  audioBlobUrl?: string;
  audioBase64?: string;
  transcription?: string;
}

export interface RoomDimensions {
  unit: MeasurementUnit;
  ceilingHeightFt: number;
  walls: WallSegment[];
  diagonalACFt?: number; // Corner A to C
  diagonalBDFt?: number; // Corner B to D
  isSquare?: boolean;
  diagonalDifferenceInches?: number;
  calculatedFloorArea: number; // sq ft or m²
  calculatedPerimeter: number; // ft or m
  calculatedWallSurface: number; // sq ft or m² (net paintable wall)
  calculatedVolume: number; // cu ft or m³
}

export interface SubfloorAudit {
  levelness: string;
  material: string;
  moistureReading?: number;
  deflectionNotes?: string;
}

export interface ElectricalAudit {
  mainPanelAmps: number;
  groundedOutlets: boolean;
  outletCount: number;
  switchCount: number;
  ceilingJunctionBoxes: number;
}

export interface PlumbingAudit {
  roughInPresent: boolean;
  supplyLines: string;
  drainStackLocation: string;
  fixtureClearanceCompliant?: boolean;
}

export interface HvacAudit {
  heatingType: string;
  supplyRegistersCount: number;
  returnVentPresent: boolean;
}

export interface StructuralAudit {
  bearingWallsIdentified: boolean;
  ceilingFramingType: string;
  notes: string;
}

export interface SiteConditions {
  subfloor: SubfloorAudit;
  electrical: ElectricalAudit;
  plumbing: PlumbingAudit;
  hvac: HvacAudit;
  structural: StructuralAudit;
}

export interface RoomExistingFinishes {
  flooringType: string;
  wallFinish: string;
  ceilingType: string;
  baseboardHeightInches: number;
  trimNotes?: string;
}

export interface Room {
  id: string;
  name: string;
  level: string; // "Main Level", "Upper Level", "Lower Level", "Exterior"
  targetUse: string;
  dimensions: RoomDimensions;
  openings: OpeningItem[];
  features: FeatureItem[];
  conditions?: SiteConditions;
  siteConditions?: SiteConditions;
  existingFinishes?: RoomExistingFinishes;
  canvasSketch: {
    shapes: CanvasShape[];
    gridSize: number;
    scale: number;
    bgDataUrl?: string;
  };
  photos: RoomPhoto[];
  audioNotes: AudioNote[];
}

export interface KeepFixtureItem {
  id: string;
  name: string;
  location: string;
  dimensions?: string;
  action: 'keep_as_is' | 'refinish' | 'repurpose' | 'donate';
  notes: string;
}

export interface ClientLifestyleSurvey {
  occupantsCount: number;
  hasKids: boolean;
  kidsDetails: string;
  pets: string;
  entertainingFrequency: 'Weekly' | 'Monthly' | 'Seasonal / Holidays' | 'Rarely';
  workFromHome: 'Full-Time (Daily)' | 'Hybrid (2-3 days)' | 'Occasional / None';
  cookingStyle: 'Gourmet / Heavy Cooking' | 'Standard Daily Meals' | 'Light / Takeout';
  storagePriority: 'Maximum / High Density' | 'Balanced Standard' | 'Minimalist Display';
  accessibilityNeeds: boolean;
  accessibilityNotes: string;
  lightingPreference: 'Bright & Sun-Drenched' | 'Warm & Layered Ambient' | 'Smart Automated / Tunable' | 'Task & Detail Focused';
  acousticConcerns: boolean;
  acousticNotes: string;
}

export interface StylePreference {
  id: string;
  name: string;
  description: string;
  imageTag: string;
  rating: number; // 1 to 5
}

export interface MaterialPreference {
  name: string;
  category: 'Flooring' | 'Millwork' | 'Surfaces' | 'Metals' | 'Textiles' | 'Tile';
  preference: 'love' | 'neutral' | 'dislike';
}

export interface DesignSurvey {
  lifestyle?: ClientLifestyleSurvey;
  selectedStyles: string[];
  styleRatings?: Record<string, number>;
  primaryColorPalette?: string[];
  accentColorPalette?: string[];
  forbiddenColors?: string[];
  materials?: MaterialPreference[];
  keepFixtures?: KeepFixtureItem[];
  colorMood?: string;
  functionalPriorities?: string[];
  preferredMaterials?: string[];
  targetTimeline?: string;
  clientNotes?: string;
  contractorScope?: {
    plumbingRelocation: boolean;
    wallDemolition: boolean;
    electricalServiceUpgrade: boolean;
    windowDoorReplacement: boolean;
    permitsRequired: boolean;
    hvacDuctModification: boolean;
    generalContractorSelected: boolean;
    contractorNotes: string;
  };
  clientGeneralNotes?: string;
}

export interface AiColorSwatch {
  name: string;
  hex: string;
  role: string;
  finish: string;
}

export interface AiMaterialTakeoff {
  room: string;
  item: string;
  estimatedQuantity: string;
  unit: string;
  calculationBasis: string;
  wasteAllowance: string;
}

export interface AiProposalSummary {
  executiveSummary: string;
  designConcept: string;
  paletteSuggestions: AiColorSwatch[];
  materialTakeoffs: AiMaterialTakeoff[];
  contractorRiskAlerts: string[];
  phasePlan: string[];
  generatedAt?: string;
}

export interface ClientSignOff {
  signedByName: string;
  signedAt: string;
  signatureDataUrl: string;
  acknowledgmentNotes?: string;
}

export interface Project {
  id: string;
  name: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  siteAddress: string;
  lotNumber?: string;
  rpNumber?: string;
  siteArea?: string;
  surveyDate?: string;
  initialNotes?: string;
  latitude?: number;
  longitude?: number;
  city: string;
  zip: string;
  projectType: 'Whole Home' | 'Kitchen Renovation' | 'Primary Suite' | 'Living & Dining' | 'Bathroom Remodel' | 'Commercial Office' | 'Custom Addition';
  targetBudget: number;
  budgetFlexibility: BudgetFlexibility;
  targetTimeline: TargetTimeline;
  status: ProjectStatus;
  leadDesigner: string;
  createdAt: string;
  updatedAt: string;
  surveyCompletedAt?: string;
  survey: DesignSurvey;
  rooms: Room[];
  aiProposal?: AiProposalSummary;
  aiSummary?: AiProposalSummary;
  clientSignOff?: ClientSignOff;
}

export const PRESET_STYLES = [
  {
    id: 'japandi',
    name: 'Japandi',
    tag: 'Minimal + Craft',
    description: 'Harmonious fusion of Scandinavian functionality and Japanese wabi-sabi simplicity with warm woods and neutral textures.',
    icon: 'spa',
    keyFinishes: ['Natural White Oak', 'Limewash Plaster', 'Black Metal Accents', 'Linen'],
  },
  {
    id: 'warm_minimalist',
    name: 'Warm Minimalist',
    tag: 'Clean + Tactile',
    description: 'Clean architectural lines, curated negative space, limewash plaster, boucle fabrics, and organic sculptural forms.',
    icon: 'architecture',
    keyFinishes: ['Honed Travertine', 'Soft Taupe Paint', 'Warm Microcement', 'Brushed Brass'],
  },
  {
    id: 'mid_century_modern',
    name: 'Mid-Century Modern',
    tag: 'Iconic + Geometric',
    description: '1950s architectural heritage, rich walnut veneers, statement lighting, and integrated indoor-outdoor connections.',
    icon: 'chair',
    keyFinishes: ['American Walnut', 'Terrazzo Tiles', 'Matte Black', 'Olive & Rust Tones'],
  },
  {
    id: 'modern_organic',
    name: 'Modern Organic',
    tag: 'Earthy + Contemporary',
    description: 'Natural stone travertine, white oak, linen drapery, earthy terracotta, and raw live-edge elements.',
    icon: 'nature',
    keyFinishes: ['Raw Terracotta', 'Reclaimed Oak', 'Zellige Backsplash', 'Brushed Nickel'],
  },
  {
    id: 'transitional_luxury',
    name: 'Transitional Luxury',
    tag: 'Classic + Refined',
    description: 'Timeless crown moldings and millwork paired seamlessly with streamlined contemporary furnishings and brushed metals.',
    icon: 'diamond',
    keyFinishes: ['Calacatta Marble', 'Shaker Cabinetry', 'Brushed Warm Brass', 'Herringbone Flooring'],
  },
  {
    id: 'industrial_loft',
    name: 'Industrial Loft',
    tag: 'Exposed + Bold',
    description: 'Exposed structural brick, blackened steel, concrete slab floors, fluted glass, and visible architectural ductwork.',
    icon: 'factory',
    keyFinishes: ['Polished Concrete', 'Blackened Steel', 'Reclaimed Brick', 'Fluted Glass'],
  },
  {
    id: 'coastal_calm',
    name: 'Coastal Calm',
    tag: 'Airy + Natural',
    description: 'Bleached woods, soft ocean sage and marine blues, textured rattan, breathable linen, and light-flooded layouts.',
    icon: 'water',
    keyFinishes: ['Bleached Oak', 'Sea Salt White', 'Textured Rattan', 'Weathered Nickel'],
  },
  {
    id: 'art_deco_revival',
    name: 'Art Deco Revival',
    tag: 'Opulent + Geometric',
    description: 'Bold stepped geometries, rich fluted marble, polished brass, jewel-toned velvets, and dramatic high-contrast accents.',
    icon: 'auto_awesome',
    keyFinishes: ['Fluted Marble', 'Polished Gold', 'Emerald Velvet', 'Geometric Mirrors'],
  },
];

export const PRESET_MATERIALS = {
  flooring: [
    'Engineered White Oak (7.5" Wide Plank)',
    'Solid French Oak (Herringbone)',
    'Honed Limestone / Travertine Tile',
    'Polished Architectural Concrete',
    'Large Format Porcelain (24"x48")',
    'Restored Historic Hardwood',
  ],
  walls: [
    'Level 5 Smooth Finish (Ultra-Flat)',
    'Limewash / Roman Clay Plaster',
    'Vertical Tongue & Groove Millwork Panel',
    'Textured Grasscloth Wallpaper',
    'Exposed Structural Brick / Masonry',
  ],
  ceilings: [
    'Smooth Drywall (White Matte 9ft)',
    'Exposed Solid Wood Beams (Rough Sawn)',
    'Coffered Architectural Grid Box',
    'Vaulted Ceiling with Tongue & Groove Plank',
  ],
};
