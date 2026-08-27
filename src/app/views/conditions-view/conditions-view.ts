import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ElectricalAudit, HvacAudit, PlumbingAudit, StructuralAudit, SubfloorAudit } from '../../models/project.model';
import { ProjectStore } from '../../services/project-store.service';

@Component({
  selector: 'app-conditions-view',
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './conditions-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConditionsViewComponent {
  store = inject(ProjectStore);

  activeRoom = this.store.activeRoom;

  updateSubfloor<K extends keyof SubfloorAudit>(field: K, val: SubfloorAudit[K]): void {
    this.store.updateActiveRoom((r) => {
      if (!r.conditions) {
        r.conditions = {
          subfloor: { levelness: 'Fair (1/4" to 3/8" per 10ft)', material: 'Plywood Tongue & Groove' },
          electrical: { mainPanelAmps: 200, groundedOutlets: true, outletCount: 6, switchCount: 2, ceilingJunctionBoxes: 1 },
          plumbing: { roughInPresent: false, supplyLines: 'PEX-A 1/2"', drainStackLocation: 'East Wall', fixtureClearanceCompliant: true },
          hvac: { heatingType: 'Forced Air', supplyRegistersCount: 2, returnVentPresent: true },
          structural: { bearingWallsIdentified: false, ceilingFramingType: 'Standard 2x10 Joists', notes: '' },
        };
      }
      r.conditions.subfloor[field] = val;
      return r;
    });
  }

  updateElectrical<K extends keyof ElectricalAudit>(field: K, val: ElectricalAudit[K]): void {
    this.store.updateActiveRoom((r) => {
      if (r.conditions?.electrical) {
        r.conditions.electrical[field] = val;
      }
      return r;
    });
  }

  updatePlumbing<K extends keyof PlumbingAudit>(field: K, val: PlumbingAudit[K]): void {
    this.store.updateActiveRoom((r) => {
      if (r.conditions?.plumbing) {
        r.conditions.plumbing[field] = val;
      }
      return r;
    });
  }

  updateHVAC<K extends keyof HvacAudit>(field: K, val: HvacAudit[K]): void {
    this.store.updateActiveRoom((r) => {
      if (r.conditions?.hvac) {
        r.conditions.hvac[field] = val;
      }
      return r;
    });
  }

  updateStructural<K extends keyof StructuralAudit>(field: K, val: StructuralAudit[K]): void {
    this.store.updateActiveRoom((r) => {
      if (r.conditions?.structural) {
        r.conditions.structural[field] = val;
      }
      return r;
    });
  }
}

