import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ProjectStore } from '../../services/project-store.service';

@Component({
  selector: 'app-diagonal-calculator',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './diagonal-calculator.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiagonalCalculatorComponent {
  store = inject(ProjectStore);
  fb = inject(FormBuilder);

  activeRoom = this.store.activeRoom;
  unit = this.store.unit;

  readonly squarenessAnalysis = computed(() => {
    const room = this.activeRoom();
    if (!room || room.dimensions.walls.length < 2) return null;

    const walls = room.dimensions.walls;
    const lFt = walls[0]?.lengthFt || 0;
    const wFt = walls[1]?.lengthFt || 0;

    const theoDiagFt = Math.sqrt(lFt * lFt + wFt * wFt);
    const actualACFt = room.dimensions.diagonalACFt || theoDiagFt;
    const actualBDFt = room.dimensions.diagonalBDFt || theoDiagFt;

    const diffInches = Math.abs(actualACFt - actualBDFt) * 12;
    const devFromTheoInches = Math.abs(actualACFt - theoDiagFt) * 12;

    let status: 'square' | 'minor_skew' | 'out_of_square' = 'square';
    let label = 'True Square (90°)';
    let colorClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
    let advisory = 'Room corners are within ±1/4" tolerance. Standard cabinetry, prefabricated vanities, and modular tile grids will install without scribing.';

    if (diffInches > 0.75 || devFromTheoInches > 0.75) {
      status = 'out_of_square';
      label = 'Out of Square (>3/4" Skew)';
      colorClass = 'text-rose-700 bg-rose-50 border-rose-200';
      advisory = 'Significant room skew detected! Custom countertop templating required. Specify 1" scribe fillers for casework and adjust herringbone tile layout starting line.';
    } else if (diffInches > 0.25 || devFromTheoInches > 0.25) {
      status = 'minor_skew';
      label = 'Minor Skew (1/4" - 3/4")';
      colorClass = 'text-amber-700 bg-amber-50 border-amber-200';
      advisory = 'Moderate corner deviation. Order 1/2" scribe strips for built-in millwork and check wall levelness at backsplash heights.';
    }

    return {
      lFt,
      wFt,
      theoDiagFt: Math.round(theoDiagFt * 100) / 100,
      actualACFt: Math.round(actualACFt * 100) / 100,
      actualBDFt: Math.round(actualBDFt * 100) / 100,
      diffInches: Math.round(diffInches * 10) / 10,
      status,
      label,
      colorClass,
      advisory,
    };
  });

  updateDiagonalAC(val: string): void {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      this.store.updateActiveRoom((r) => {
        r.dimensions.diagonalACFt = num;
        return r;
      });
    }
  }

  updateDiagonalBD(val: string): void {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      this.store.updateActiveRoom((r) => {
        r.dimensions.diagonalBDFt = num;
        return r;
      });
    }
  }
}
