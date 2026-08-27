import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { CanvasShape, Room, WallSegment } from '../../models/project.model';
import { ProjectStore } from '../../services/project-store.service';

@Component({
  selector: 'app-room-canvas',
  imports: [CommonModule, MatIconModule],
  templateUrl: './room-canvas.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomCanvasComponent implements AfterViewInit, OnDestroy {
  store = inject(ProjectStore);

  @ViewChild('canvasEl') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('containerEl') containerRef!: ElementRef<HTMLDivElement>;

  // Tool Modes
  readonly activeTool = signal<'select' | 'add_door' | 'add_window' | 'add_outlet' | 'add_plumbing' | 'add_column' | 'add_hvac'>('select');
  readonly snapToGrid = signal<boolean>(true);
  readonly zoomLevel = signal<number>(1.0);
  readonly panOffset = signal<{ x: number; y: number }>({ x: 40, y: 40 });
  readonly selectedShapeId = signal<string | null>(null);
  readonly isDragging = signal<boolean>(false);
  readonly isPanning = signal<boolean>(false);

  private dragStartPos = { x: 0, y: 0 };
  private panStartPos = { x: 0, y: 0 };
  private activeNodeIndex: number | null = null;
  private resizeObserver?: ResizeObserver;

  readonly activeRoom = this.store.activeRoom;
  readonly unit = this.store.unit;

  // Scale: pixels per foot (default ~24px = 1 foot)
  private readonly PIXELS_PER_FOOT = 20;

  constructor() {
    // Redraw canvas whenever active room changes or zoom/pan changes
    effect(() => {
      // track dependencies
      this.activeRoom();
      this.zoomLevel();
      this.panOffset();
      this.selectedShapeId();
      this.unit();
      this.draw();
    });
  }

  ngAfterViewInit(): void {
    this.setupResizeObserver();
    setTimeout(() => {
      this.fitToScreen();
      this.draw();
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private setupResizeObserver(): void {
    if (typeof window !== 'undefined' && 'ResizeObserver' in window && this.containerRef) {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateCanvasDimensions();
        this.draw();
      });
      this.resizeObserver.observe(this.containerRef.nativeElement);
    }
  }

  private updateCanvasDimensions(): void {
    const canvas = this.canvasRef?.nativeElement;
    const container = this.containerRef?.nativeElement;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(300, rect.width * dpr);
    canvas.height = Math.max(300, rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }

  // --- Drawing Pipeline ---

  draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Draw Background Grid
    this.drawGrid(ctx, width, height);

    // Apply Pan & Zoom transformations for architectural space
    ctx.save();
    const pan = this.panOffset();
    const zoom = this.zoomLevel();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const room = this.activeRoom();
    if (room) {
      this.drawRoomWalls(ctx, room);
      this.drawArchitecturalElements(ctx, room);
    }

    ctx.restore();
    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const gridSize = 20 * this.zoomLevel();
    const offsetX = (this.panOffset().x % gridSize + gridSize) % gridSize;
    const offsetY = (this.panOffset().y % gridSize + gridSize) % gridSize;

    ctx.strokeStyle = '#e2e8f0'; // slate-200
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = offsetX; x < width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = offsetY; y < height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Major grid line every 5 units
    const majorGrid = gridSize * 5;
    const majorOffsetX = (this.panOffset().x % majorGrid + majorGrid) % majorGrid;
    const majorOffsetY = (this.panOffset().y % majorGrid + majorGrid) % majorGrid;

    ctx.strokeStyle = '#cbd5e1'; // slate-300
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = majorOffsetX; x < width; x += majorGrid) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = majorOffsetY; y < height; y += majorGrid) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  private drawRoomWalls(ctx: CanvasRenderingContext2D, room: Room): void {
    const polyShape = room.canvasSketch?.shapes?.find((s) => s.type === 'wall_poly');
    if (!polyShape || !polyShape.points || polyShape.points.length < 3) {
      // If no points, fallback to rectangular boundary
      this.drawDefaultRectangle(ctx, room);
      return;
    }

    const points = polyShape.points;

    // 1. Fill Room Floor
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // Subtle drop shadow under floor
    ctx.shadowColor = 'rgba(15, 23, 42, 0.06)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.stroke();
    ctx.shadowColor = 'transparent';

    // 2. Draw Thick Architectural Walls (Outer stroke + Inner stroke)
    ctx.strokeStyle = '#1e293b'; // slate-800
    ctx.lineWidth = 8;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.stroke();

    // 3. Wall Interior Core Line
    ctx.strokeStyle = '#f97316'; // orange-500 accent core
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. Draw Wall Dimension Labels on each segment
    ctx.font = '600 11px var(--font-mono, monospace)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      const lengthPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const lengthFt = lengthPx / this.PIXELS_PER_FOOT;

      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const normalAngle = angle - Math.PI / 2;
      const labelOffset = 18;
      const labelX = midX + Math.cos(normalAngle) * labelOffset;
      const labelY = midY + Math.sin(normalAngle) * labelOffset;

      const dimText = this.formatDimension(lengthFt);

      // Label background pill
      ctx.save();
      ctx.translate(labelX, labelY);

      // Make text readable right-side up
      let textAngle = angle;
      if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
        textAngle += Math.PI;
      }
      ctx.rotate(textAngle);

      const textMetrics = ctx.measureText(dimText);
      const bgW = textMetrics.width + 10;
      const bgH = 16;

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-bgW / 2, -bgH / 2, bgW, bgH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.fillText(dimText, 0, 0);
      ctx.restore();
    }

    // 5. Center Room Stamp (Name + Area)
    const center = this.getPolygonCenter(points);
    ctx.save();
    ctx.translate(center.x, center.y);

    const unitStr = this.unit() === 'metric' ? 'm²' : 'sq ft';
    const areaStr = `${room.dimensions.calculatedFloorArea} ${unitStr}`;

    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-60, -22, 120, 44, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '700 12px var(--font-sans, sans-serif)';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(room.name, 0, -6);

    ctx.font = '600 11px var(--font-mono, monospace)';
    ctx.fillStyle = '#ea580c'; // orange-600
    ctx.fillText(areaStr, 0, 10);
    ctx.restore();

    // 6. Draw Corner Manipulation Handles if in Select Mode
    if (this.activeTool() === 'select') {
      points.forEach((p, idx) => {
        const isSelected = this.activeNodeIndex === idx;
        ctx.fillStyle = isSelected ? '#ea580c' : '#ffffff';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
  }

  private drawDefaultRectangle(ctx: CanvasRenderingContext2D, room: Room): void {
    const w = (room.dimensions.walls[0]?.lengthFt || 16) * this.PIXELS_PER_FOOT;
    const h = (room.dimensions.walls[1]?.lengthFt || 14) * this.PIXELS_PER_FOOT;
    const x = 80;
    const y = 80;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 8;
    ctx.strokeRect(x, y, w, h);

    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  private drawArchitecturalElements(ctx: CanvasRenderingContext2D, room: Room): void {
    const shapes = room.canvasSketch?.shapes || [];

    shapes.forEach((shape) => {
      if (shape.type === 'wall_poly') return;

      const isSelected = this.selectedShapeId() === shape.id;

      ctx.save();
      ctx.translate(shape.x, shape.y);
      ctx.rotate((shape.rotation * Math.PI) / 180);

      switch (shape.type) {
        case 'door':
          this.renderDoor(ctx, shape, isSelected);
          break;
        case 'double_door':
          this.renderDoubleDoor(ctx, shape, isSelected);
          break;
        case 'window':
          this.renderWindow(ctx, shape, isSelected);
          break;
        case 'outlet':
          this.renderOutlet(ctx, shape, isSelected);
          break;
        case 'plumbing':
          this.renderPlumbing(ctx, shape, isSelected);
          break;
        case 'column':
          this.renderColumn(ctx, shape, isSelected);
          break;
        case 'hvac':
          this.renderHvac(ctx, shape, isSelected);
          break;
        default:
          this.renderGenericElement(ctx, shape, isSelected);
      }

      ctx.restore();
    });
  }

  // --- Element Renderers ---

  private renderDoor(ctx: CanvasRenderingContext2D, shape: CanvasShape, selected: boolean): void {
    const size = shape.width || 40;
    ctx.strokeStyle = selected ? '#ea580c' : '#0284c7'; // sky-600
    ctx.lineWidth = 2;

    // Door leaf line
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, size);
    ctx.stroke();

    // 90-degree swing arc
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI / 2, false);
    ctx.stroke();
    ctx.setLineDash([]);

    // Swing pivot point
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.font = '500 9px var(--font-sans)';
    ctx.fillStyle = '#475569';
    ctx.fillText(shape.label || 'Door', size / 2, -6);
  }

  private renderDoubleDoor(ctx: CanvasRenderingContext2D, shape: CanvasShape, selected: boolean): void {
    const size = (shape.width || 60) / 2;
    ctx.strokeStyle = selected ? '#ea580c' : '#0284c7';
    ctx.lineWidth = 2;

    // Left leaf & swing
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, size);
    ctx.stroke();
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI / 2, false);
    ctx.stroke();

    // Right leaf & swing
    ctx.beginPath();
    ctx.moveTo(size * 2, 0);
    ctx.lineTo(size * 2, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(size * 2, 0, size, Math.PI, Math.PI / 2, true);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private renderWindow(ctx: CanvasRenderingContext2D, shape: CanvasShape, selected: boolean): void {
    const w = shape.width || 50;
    const h = shape.height || 12;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = selected ? '#ea580c' : '#0284c7';
    ctx.lineWidth = 2;

    // Outer frame
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    // Glass pane lines
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 6);
    ctx.lineTo(w / 2, -h / 6);
    ctx.moveTo(-w / 2, h / 6);
    ctx.lineTo(w / 2, h / 6);
    ctx.stroke();

    // Label
    ctx.font = '500 9px var(--font-sans)';
    ctx.fillStyle = '#0369a1';
    ctx.textAlign = 'center';
    ctx.fillText(shape.label || 'Window', 0, -h / 2 - 4);
  }

  private renderOutlet(ctx: CanvasRenderingContext2D, shape: CanvasShape, selected: boolean): void {
    ctx.fillStyle = selected ? '#ffedd5' : '#fef3c7';
    ctx.strokeStyle = selected ? '#ea580c' : '#d97706';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Outlet prongs symbol
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-3, -5, 2, 4);
    ctx.fillRect(1, -5, 2, 4);
    ctx.fillRect(-2, 2, 4, 3);
  }

  private renderPlumbing(ctx: CanvasRenderingContext2D, shape: CanvasShape, selected: boolean): void {
    ctx.fillStyle = selected ? '#e0f2fe' : '#bae6fd';
    ctx.strokeStyle = selected ? '#ea580c' : '#0284c7';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Drop symbol
    ctx.fillStyle = '#0369a1';
    ctx.font = '600 10px var(--font-sans)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', 0, 0);
  }

  private renderColumn(ctx: CanvasRenderingContext2D, shape: CanvasShape, selected: boolean): void {
    const size = shape.width || 20;
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = selected ? '#ea580c' : '#0f172a';
    ctx.lineWidth = 2;

    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.strokeRect(-size / 2, -size / 2, size, size);

    // Cross hatch
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(-size / 2, -size / 2);
    ctx.lineTo(size / 2, size / 2);
    ctx.moveTo(size / 2, -size / 2);
    ctx.lineTo(-size / 2, size / 2);
    ctx.stroke();
  }

  private renderHvac(ctx: CanvasRenderingContext2D, shape: CanvasShape, selected: boolean): void {
    const w = shape.width || 32;
    const h = shape.height || 16;
    ctx.fillStyle = '#f1f5f9';
    ctx.strokeStyle = selected ? '#ea580c' : '#64748b';
    ctx.lineWidth = 1.5;

    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    // Louvers
    ctx.beginPath();
    for (let x = -w / 2 + 6; x < w / 2; x += 6) {
      ctx.moveTo(x, -h / 2);
      ctx.lineTo(x, h / 2);
    }
    ctx.stroke();
  }

  private renderGenericElement(ctx: CanvasRenderingContext2D, shape: CanvasShape, selected: boolean): void {
    const w = shape.width || 30;
    const h = shape.height || 30;
    ctx.fillStyle = selected ? '#ffedd5' : '#f8fafc';
    ctx.strokeStyle = selected ? '#ea580c' : '#64748b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
  }

  // --- Interaction Handlers ---

  onMouseDown(e: MouseEvent): void {
    const pos = this.getCanvasCoords(e);

    // Check if clicking a tool to place
    const tool = this.activeTool();
    if (tool !== 'select') {
      this.placeElementFromTool(tool, pos.worldX, pos.worldY);
      this.activeTool.set('select');
      return;
    }

    // Check if middle click or space -> Pan
    if (e.button === 1 || e.shiftKey) {
      this.isPanning.set(true);
      this.panStartPos = { x: e.clientX, y: e.clientY };
      return;
    }

    // Check if clicking a wall node (corner handle)
    const room = this.activeRoom();
    const poly = room?.canvasSketch?.shapes?.find((s) => s.type === 'wall_poly');
    if (poly && poly.points) {
      for (let i = 0; i < poly.points.length; i++) {
        const p = poly.points[i];
        const dist = Math.hypot(p.x - pos.worldX, p.y - pos.worldY);
        if (dist <= 12) {
          this.activeNodeIndex = i;
          this.isDragging.set(true);
          this.dragStartPos = { x: pos.worldX, y: pos.worldY };
          this.draw();
          return;
        }
      }
    }

    // Check if clicking an architectural element
    if (room?.canvasSketch?.shapes) {
      for (const shape of room.canvasSketch.shapes) {
        if (shape.type === 'wall_poly') continue;
        const dist = Math.hypot(shape.x - pos.worldX, shape.y - pos.worldY);
        if (dist <= (shape.width || 30)) {
          this.selectedShapeId.set(shape.id);
          this.isDragging.set(true);
          this.dragStartPos = { x: pos.worldX, y: pos.worldY };
          this.draw();
          return;
        }
      }
    }

    // Else clicking canvas background -> deselect or start Pan
    this.selectedShapeId.set(null);
    this.activeNodeIndex = null;
    this.isPanning.set(true);
    this.panStartPos = { x: e.clientX, y: e.clientY };
    this.draw();
  }

  onMouseMove(e: MouseEvent): void {
    if (this.isPanning()) {
      const dx = e.clientX - this.panStartPos.x;
      const dy = e.clientY - this.panStartPos.y;
      this.panOffset.update((p) => ({ x: p.x + dx, y: p.y + dy }));
      this.panStartPos = { x: e.clientX, y: e.clientY };
      this.draw();
      return;
    }

    if (this.isDragging()) {
      const pos = this.getCanvasCoords(e);
      let targetX = pos.worldX;
      let targetY = pos.worldY;

      if (this.snapToGrid()) {
        const snap = 10; // snap to 6" equivalent
        targetX = Math.round(targetX / snap) * snap;
        targetY = Math.round(targetY / snap) * snap;
      }

      // Dragging a corner handle
      if (this.activeNodeIndex !== null) {
        this.store.updateActiveRoom((r) => {
          const poly = r.canvasSketch?.shapes?.find((s) => s.type === 'wall_poly');
          if (poly && poly.points && this.activeNodeIndex !== null) {
            poly.points[this.activeNodeIndex] = { x: targetX, y: targetY };
            // Update wall segments length
            this.syncWallLengthsFromPolygon(r, poly.points);
          }
          return r;
        });
      }
      // Dragging a placed element
      else if (this.selectedShapeId()) {
        const shapeId = this.selectedShapeId();
        this.store.updateActiveRoom((r) => {
          const s = r.canvasSketch?.shapes?.find((item) => item.id === shapeId);
          if (s) {
            s.x = targetX;
            s.y = targetY;
          }
          return r;
        });
      }
      this.draw();
    }
  }

  onMouseUp(): void {
    this.isDragging.set(false);
    this.isPanning.set(false);
    this.activeNodeIndex = null;
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(2.5, Math.max(0.5, this.zoomLevel() * zoomFactor));
    this.zoomLevel.set(Math.round(newZoom * 100) / 100);
    this.draw();
  }

  // --- Touch Support for Mobile / iPad Field Work ---

  onTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const mouseEvt = new MouseEvent('mousedown', {
        clientX: t.clientX,
        clientY: t.clientY,
        button: 0,
      });
      this.onMouseDown(mouseEvt);
    }
  }

  onTouchMove(e: TouchEvent): void {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const mouseEvt = new MouseEvent('mousemove', {
        clientX: t.clientX,
        clientY: t.clientY,
      });
      this.onMouseMove(mouseEvt);
    }
  }

  onTouchEnd(): void {
    this.onMouseUp();
  }

  // --- Toolbar Commands ---

  setTool(tool: 'select' | 'add_door' | 'add_window' | 'add_outlet' | 'add_plumbing' | 'add_column' | 'add_hvac'): void {
    this.activeTool.set(tool);
  }

  toggleSnap(): void {
    this.snapToGrid.update((s) => !s);
  }

  zoomIn(): void {
    this.zoomLevel.update((z) => Math.min(2.5, Math.round((z + 0.15) * 100) / 100));
    this.draw();
  }

  zoomOut(): void {
    this.zoomLevel.update((z) => Math.max(0.4, Math.round((z - 0.15) * 100) / 100));
    this.draw();
  }

  fitToScreen(): void {
    const canvas = this.canvasRef?.nativeElement;
    const room = this.activeRoom();
    if (!canvas || !room) return;

    const poly = room.canvasSketch?.shapes?.find((s) => s.type === 'wall_poly');
    if (poly && poly.points && poly.points.length > 0) {
      const xs = poly.points.map((p) => p.x);
      const ys = poly.points.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const roomW = maxX - minX;
      const roomH = maxY - minY;

      const containerW = canvas.clientWidth || 600;
      const containerH = canvas.clientHeight || 450;

      const scaleX = (containerW * 0.75) / Math.max(roomW, 100);
      const scaleY = (containerH * 0.75) / Math.max(roomH, 100);
      const bestZoom = Math.min(1.6, Math.max(0.6, Math.min(scaleX, scaleY)));

      this.zoomLevel.set(Math.round(bestZoom * 100) / 100);

      const centerRoomX = (minX + maxX) / 2;
      const centerRoomY = (minY + maxY) / 2;

      this.panOffset.set({
        x: containerW / 2 - centerRoomX * bestZoom,
        y: containerH / 2 - centerRoomY * bestZoom,
      });
    } else {
      this.panOffset.set({ x: 60, y: 60 });
      this.zoomLevel.set(1.0);
    }
    this.draw();
  }

  rotateSelected(): void {
    const shapeId = this.selectedShapeId();
    if (!shapeId) return;
    this.store.updateActiveRoom((r) => {
      const s = r.canvasSketch?.shapes?.find((item) => item.id === shapeId);
      if (s) {
        s.rotation = (s.rotation + 90) % 360;
      }
      return r;
    });
    this.draw();
  }

  deleteSelected(): void {
    const shapeId = this.selectedShapeId();
    if (!shapeId) return;
    this.store.updateActiveRoom((r) => {
      r.canvasSketch.shapes = r.canvasSketch.shapes.filter((s) => s.id !== shapeId);
      return r;
    });
    this.selectedShapeId.set(null);
    this.draw();
  }

  loadRoomTemplate(type: 'rect' | 'l_shape' | 'galley'): void {
    const currentName = this.activeRoom()?.name || 'Room';
    const currentLevel = this.activeRoom()?.level || 'Main Level';
    const templateRoom = this.store.createDefaultRoom(currentName, currentLevel, type);

    this.store.updateActiveRoom((r) => {
      r.dimensions = templateRoom.dimensions;
      r.canvasSketch = templateRoom.canvasSketch;
      r.openings = templateRoom.openings;
      r.features = templateRoom.features;
      return r;
    });
    this.fitToScreen();
  }

  exportSnapshot(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');

    // Add directly to room photo gallery
    const room = this.activeRoom();
    if (room) {
      this.store.updateActiveRoom((r) => {
        r.photos.unshift({
          id: 'snap_' + Date.now(),
          dataUrl,
          caption: `2D CAD Blueprint Snapshot - ${r.name}`,
          takenAt: new Date().toISOString(),
          tags: ['Blueprint', 'Field Measure', 'CAD'],
          annotations: [],
        });
        return r;
      });
    }

    // Trigger download for user
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${room?.name || 'room'}-measure-plan.png`;
    a.click();
  }

  // --- Geometry & Helpers ---

  private placeElementFromTool(tool: string, x: number, y: number): void {
    let newShape: CanvasShape | null = null;
    const id = 'elem_' + Date.now();

    switch (tool) {
      case 'add_door':
        newShape = { id, type: 'door', x, y, width: 44, height: 44, rotation: 0, label: '36" Entry Door' };
        break;
      case 'add_window':
        newShape = { id, type: 'window', x, y, width: 60, height: 14, rotation: 0, label: '60" Window' };
        break;
      case 'add_outlet':
        newShape = { id, type: 'outlet', x, y, width: 20, height: 20, rotation: 0, label: '120V Outlet' };
        break;
      case 'add_plumbing':
        newShape = { id, type: 'plumbing', x, y, width: 22, height: 22, rotation: 0, label: 'Plumbing Stack' };
        break;
      case 'add_column':
        newShape = { id, type: 'column', x, y, width: 24, height: 24, rotation: 0, label: 'Pillar' };
        break;
      case 'add_hvac':
        newShape = { id, type: 'hvac', x, y, width: 36, height: 16, rotation: 0, label: 'HVAC Vent' };
        break;
    }

    if (newShape) {
      this.store.updateActiveRoom((r) => {
        if (!r.canvasSketch) r.canvasSketch = { shapes: [], gridSize: 20, scale: 1.0 };
        r.canvasSketch.shapes.push(newShape!);
        return r;
      });
      this.selectedShapeId.set(newShape.id);
      this.draw();
    }
  }

  private syncWallLengthsFromPolygon(room: Room, points: { x: number; y: number }[]): void {
    const walls: WallSegment[] = [];
    const orientationLabels: ('N' | 'E' | 'S' | 'W' | 'NE' | 'NW' | 'SE' | 'SW')[] = ['N', 'E', 'S', 'W', 'NE', 'SE'];

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const lengthPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const lengthFt = Math.round((lengthPx / this.PIXELS_PER_FOOT) * 10) / 10;
      const wallLetter = String.fromCharCode(65 + i);

      walls.push({
        id: `w_${i + 1}`,
        name: `Wall ${wallLetter} (${orientationLabels[i % orientationLabels.length]})`,
        orientation: orientationLabels[i % orientationLabels.length],
        lengthFt: Math.max(1, lengthFt),
        heightFt: room.dimensions.ceilingHeightFt || 9.5,
      });
    }
    room.dimensions.walls = walls;
  }

  private getPolygonCenter(points: { x: number; y: number }[]): { x: number; y: number } {
    let sumX = 0;
    let sumY = 0;
    points.forEach((p) => {
      sumX += p.x;
      sumY += p.y;
    });
    return { x: sumX / points.length, y: sumY / points.length };
  }

  private formatDimension(feet: number): string {
    if (this.unit() === 'metric') {
      const meters = Math.round(feet * 0.3048 * 100) / 100;
      return `${meters}m`;
    }
    const ft = Math.floor(feet);
    const inches = Math.round((feet - ft) * 12);
    if (inches === 12) return `${ft + 1}' 0"`;
    return `${ft}' ${inches}"`;
  }

  private getCanvasCoords(e: MouseEvent): { worldX: number; worldY: number } {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const zoom = this.zoomLevel();
    const pan = this.panOffset();

    const worldX = (clientX - pan.x) / zoom;
    const worldY = (clientY - pan.y) / zoom;

    return { worldX, worldY };
  }
}
