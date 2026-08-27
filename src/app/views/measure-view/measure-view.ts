import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { PRESET_MATERIALS, RoomOpening } from '../../models/project.model';
import { DiagonalCalculatorComponent } from '../../components/diagonal-calculator/diagonal-calculator';
import { RoomCanvasComponent } from '../../components/room-canvas/room-canvas';
import { ProjectStore } from '../../services/project-store.service';

@Component({
  selector: 'app-measure-view',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    RoomCanvasComponent,
    DiagonalCalculatorComponent,
  ],
  templateUrl: './measure-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeasureViewComponent {
  store = inject(ProjectStore);

  activeRoom = this.store.activeRoom;
  unit = this.store.unit;
  presetMaterials = PRESET_MATERIALS;

  readonly activeSubTab = signal<'canvas' | 'walls' | 'openings' | 'surfaces'>('canvas');

  // Quick wall update
  updateRoomDimensions(lengthVal: string, widthVal: string, heightVal: string): void {
    const l = parseFloat(lengthVal) || 16;
    const w = parseFloat(widthVal) || 14;
    const h = parseFloat(heightVal) || 9.5;

    this.store.updateActiveRoom((r) => {
      r.dimensions.ceilingHeightFt = h;
      if (r.dimensions.walls.length >= 2) {
        r.dimensions.walls[0].lengthFt = l;
        r.dimensions.walls[0].heightFt = h;
        r.dimensions.walls[1].lengthFt = w;
        r.dimensions.walls[1].heightFt = h;
        if (r.dimensions.walls[2]) {
          r.dimensions.walls[2].lengthFt = l;
          r.dimensions.walls[2].heightFt = h;
        }
        if (r.dimensions.walls[3]) {
          r.dimensions.walls[3].lengthFt = w;
          r.dimensions.walls[3].heightFt = h;
        }
      }
      return r;
    });
  }

  updateWallLength(wallId: string, lengthVal: string): void {
    const val = parseFloat(lengthVal);
    if (!isNaN(val) && val > 0) {
      this.store.updateActiveRoom((r) => {
        const wall = r.dimensions.walls.find((w) => w.id === wallId);
        if (wall) wall.lengthFt = val;
        return r;
      });
    }
  }

  updateWallHeight(wallId: string, heightVal: string): void {
    const val = parseFloat(heightVal);
    if (!isNaN(val) && val > 0) {
      this.store.updateActiveRoom((r) => {
        const wall = r.dimensions.walls.find((w) => w.id === wallId);
        if (wall) wall.heightFt = val;
        return r;
      });
    }
  }

  addOpening(type: 'door' | 'window' | 'cased_opening'): void {
    const newOpening: RoomOpening = {
      id: 'op_' + Date.now(),
      type,
      wallName: this.activeRoom()?.dimensions.walls[0]?.name || 'Wall A (North)',
      widthInches: type === 'window' ? 48 : 36,
      heightInches: type === 'window' ? 60 : 84,
      sillHeightInches: type === 'window' ? 30 : 0,
      trimWidthInches: 3.5,
      casingDetails: '3-1/2" Modern Square Casing',
    };

    this.store.updateActiveRoom((r) => {
      if (!r.openings) r.openings = [];
      r.openings.push(newOpening);
      return r;
    });
  }

  removeOpening(openingId: string): void {
    this.store.updateActiveRoom((r) => {
      r.openings = (r.openings || []).filter((o) => o.id !== openingId);
      return r;
    });
  }

  updateFlooringType(val: string): void {
    this.store.updateActiveRoom((r) => {
      if (!r.existingFinishes) {
        r.existingFinishes = {
          flooringType: val,
          wallFinish: 'Level 5 Smooth Finish (Ultra-Flat)',
          ceilingType: 'Smooth Drywall (White Matte 9ft)',
          baseboardHeightInches: 5.5,
        };
      } else {
        r.existingFinishes.flooringType = val;
      }
      return r;
    });
  }

  updateWallFinish(val: string): void {
    this.store.updateActiveRoom((r) => {
      if (!r.existingFinishes) {
        r.existingFinishes = {
          flooringType: 'Engineered White Oak (7.5" Wide Plank)',
          wallFinish: val,
          ceilingType: 'Smooth Drywall (White Matte 9ft)',
          baseboardHeightInches: 5.5,
        };
      } else {
        r.existingFinishes.wallFinish = val;
      }
      return r;
    });
  }

  updateCeilingType(val: string): void {
    this.store.updateActiveRoom((r) => {
      if (!r.existingFinishes) {
        r.existingFinishes = {
          flooringType: 'Engineered White Oak (7.5" Wide Plank)',
          wallFinish: 'Level 5 Smooth Finish (Ultra-Flat)',
          ceilingType: val,
          baseboardHeightInches: 5.5,
        };
      } else {
        r.existingFinishes.ceilingType = val;
      }
      return r;
    });
  }

  updateBaseboard(val: string): void {
    this.store.updateActiveRoom((r) => {
      const parsed = parseFloat(val) || 4;
      if (!r.existingFinishes) {
        r.existingFinishes = {
          flooringType: 'Engineered White Oak (7.5" Wide Plank)',
          wallFinish: 'Level 5 Smooth Finish (Ultra-Flat)',
          ceilingType: 'Smooth Drywall (White Matte 9ft)',
          baseboardHeightInches: parsed,
        };
      } else {
        r.existingFinishes.baseboardHeightInches = parsed;
      }
      return r;
    });
  }
}
