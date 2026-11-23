import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { registerAiRoutes } from './ai-routes';
import {join} from 'node:path';

function generateFallbackMeetingSummary(project: Record<string, unknown>, notes: string, voiceTranscripts?: string[]) {
  const name = (project?.['name'] as string) || 'On-Site Design Consult';
  const client = (project?.['clientName'] as string) || 'Client';
  const address = (project?.['siteAddress'] as string) || 'Site Location';
  const budget = (project?.['targetBudget'] as number) || 75000;
  
  const transcriptsSection = voiceTranscripts && voiceTranscripts.length > 0
    ? `\n\n#### 🎙️ ON-SITE VOICE TRANSCRIPTS & DICTATIONS\n${voiceTranscripts.map((t, idx) => `- Note ${idx + 1}: "${t}"`).join('\n')}`
    : '';

  const initialNotesSection = notes && notes.trim().length > 0
    ? `\n\n#### 📝 INITIAL FIELD NOTES\n${notes}`
    : '';

  return `### 📋 CLIENT CONSULTATION & WALKTHROUGH SUMMARY
**Project:** ${name}  
**Client:** ${client} | **Address:** ${address}  
**Target Budget Allowance:** $${budget.toLocaleString()}
${initialNotesSection}${transcriptsSection}

---

#### 1. KEY CLIENT OBJECTIVES & LIFESTYLE GOALS
- Prioritize natural daylighting, open architectural flow, and low-maintenance tactile surfaces.
- Client desires clean modern aesthetics (warm minimalist & organic accents) with durable pet/family-friendly performance.
- Seamless spatial connection between living areas and outdoor terrace.

#### 2. SPATIAL & ARCHITECTURAL DIRECTIVES
- Verified room boundaries and ceiling heights; maintain minimum 36" (91cm) clear circulation walkways.
- Maximize ceiling height lines and incorporate concealed LED accent cove lighting.
- Reconfigure doorway cased openings for enhanced sightlines into garden and natural light channels.

#### 3. MATERIAL & FINISH PALETTE
- **Flooring:** 7" wide-plank engineered European white oak with ultra-matte protective finish.
- **Surfaces:** Honed natural travertine and quartzite slab countertops with mitered waterfall edge details.
- **Wall Treatment:** Mineral limewash plaster / low-VOC matte alabaster paint palette.
- **Hardware:** Matte black and brushed warm brass architectural hardware fixtures.

#### 4. CONTRACTOR & STRUCTURAL RISK FLAGS
- Subfloor levelness within standard 3/16" over 10ft tolerance; minor prep required near wet areas.
- Center partition wall requires structural header verification prior to demolition.
- Dedicated 20A branch circuits required for kitchen appliance upgrades.

#### 5. NEXT STEPS & ACTION ITEMS
- [ ] Export 2D CAD room layout measurements to drafting team.
- [ ] Prepare preliminary material sample finish tray (Oak, Travertine, Brass).
- [ ] Generate itemized contractor trade takeoff budget for client sign-off.`;
}

function generateFallbackBrief(project: Record<string, unknown>) {
  const rooms = (project?.['rooms'] as { dimensions?: { calculatedFloorArea?: number; calculatedWallSurface?: number; calculatedPerimeter?: number; unit?: string } }[]) || [];
  const survey = project?.['survey'] as { selectedStyles?: string[] } | undefined;
  const styles = survey?.selectedStyles || ['Modern Organic', 'Warm Minimalist'];
  const totalArea = rooms.reduce((sum: number, r) => sum + (r.dimensions?.calculatedFloorArea || 0), 0);
  const totalPaint = rooms.reduce((sum: number, r) => sum + (r.dimensions?.calculatedWallSurface || 0), 0);
  const unit = rooms[0]?.dimensions?.unit === 'metric' ? 'm²' : 'sq ft';
  const linearUnit = rooms[0]?.dimensions?.unit === 'metric' ? 'linear m' : 'linear ft';

  return {
    executiveSummary: `On-site survey completed for ${(project?.['clientName'] as string) || 'Client'} at ${(project?.['siteAddress'] as string) || 'Site Location'}. The project encompasses ${rooms.length || 1} surveyed zones totaling approximately ${Math.round(totalArea)} ${unit}. Target aesthetic focuses on ${styles.join(' and ')} balancing lifestyle durability with sophisticated architectural flow.`,
    designConcept: `Incorporate natural textures, warm wood tones, and architectural lighting layers. Maximize natural daylight while structuring defined functional zones with high-performance surfaces suitable for daily lifestyle use.`,
    paletteSuggestions: [
      { name: 'Warm Alabaster', hex: '#F8F6F0', role: 'Main Walls & Ceilings', finish: 'Matte / Eggshell' },
      { name: 'Smoked Amber Oak', hex: '#C28448', role: 'Cabinetry & Architectural Trim', finish: 'Satin Poly' },
      { name: 'Deep Slate Charcoal', hex: '#334155', role: 'Metal Accents & Hardware', finish: 'Matte Powdercoat' },
      { name: 'Earthy Travertine', hex: '#E6DCBF', role: 'Flooring / Slab Countertop', finish: 'Honed' },
    ],
    materialTakeoffs: [
      {
        room: 'All Surveyed Rooms',
        item: 'Hardwood / Engineered Plank Flooring',
        estimatedQuantity: `${Math.round(totalArea * 1.1)}`,
        unit: unit,
        calculationBasis: `${Math.round(totalArea)} ${unit} net floor area`,
        wasteAllowance: '10% waste & cut factor included',
      },
      {
        room: 'All Surveyed Rooms',
        item: 'Interior Wall & Ceiling Paint',
        estimatedQuantity: `${Math.max(2, Math.ceil((totalPaint || 400) / 350))}`,
        unit: 'Gallons (2 coats)',
        calculationBasis: `${Math.round(totalPaint || 400)} ${unit} gross wall surface less openings`,
        wasteAllowance: 'Standard 350 sq ft/gal coverage',
      },
      {
        room: 'General Trim',
        item: 'Baseboards & Quarter Round',
        estimatedQuantity: `${Math.round(rooms.reduce((s: number, r) => s + (r.dimensions?.calculatedPerimeter || 0), 0) * 1.08)}`,
        unit: linearUnit,
        calculationBasis: 'Sum of surveyed room wall perimeters',
        wasteAllowance: '8% miter & corner waste',
      },
    ],
    contractorRiskAlerts: [
      'Check for subfloor leveling deviations before specifying large-format porcelain tile or continuous hardwood.',
      'Verify wall diagonal squareness prior to ordering pre-fabricated cabinetry or bespoke built-in millwork.',
      'Inspect breaker panel amperage if adding high-draw induction cooktops or in-floor radiant heating.',
    ],
    phasePlan: [
      'Export and verify 2D field dimension sheets with client & lead trade contractor.',
      'Produce 1/4" scale CAD schematic layouts incorporating verified window sill and door swing clearances.',
      'Order finish samples (flooring, slab, cabinet veneer) for client sign-off in natural room light.',
      'Finalize trade bid package and submit structural/electrical permit applications.',
    ],
  };
}

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json({ limit: '30mb' }));

app.use((req, _res, next) => {
  const header = req.headers['x-forwarded-uri'] ?? req.headers['x-invoke-path'];
  const original = Array.isArray(header) ? header[0] : header;
  if (original?.startsWith('/api/') && req.url && !req.url.startsWith('/api/')) {
    const path = original.split('?')[0];
    req.url = original.includes('?') ? `${path}?${original.split('?')[1]}` : path;
  }
  next();
});

registerAiRoutes(app);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (!process.env['VERCEL'] && (isMainModule(import.meta.url) || process.env['pm_id'])) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export { app };
export default app;

export const reqHandler = createNodeRequestHandler(app);

