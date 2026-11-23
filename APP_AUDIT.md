# Design Consult Pro — Codebase & Field UX Audit

Audit date: 24 Nov 2026. Scope is the repository as implemented, not the marketing copy in the UI. The product claims to be an offline-ready PWA for on-site measuring, photos, and transcribed client conversations. The code is a single-page Angular shell with one in-memory signal store, `localStorage` persistence, two parallel voice recorders, a custom canvas that is not a CAD kernel, and Gemini calls that silently substitute canned text when the key or model fails.

There is no router. `src/app/app.routes.ts` exports `routes = []`. Every screen is a tab string on `ProjectStore.currentActiveTab`, switched by `App.setTab()` and `HeaderComponent.setTab()`.

---

## 1. Tech Stack & Architecture Overview

### Stack

| Layer | What is actually used |
| --- | --- |
| Framework | Angular 21 (`package.json`), SSR via `@angular/ssr` + Express (`src/server.ts`). Client bootstrap is `src/main.ts`. Default tab on launch is `'workspace'` (`ProjectStore.currentActiveTab`). |
| UI | Tailwind CSS v4 (`src/styles.css` `@import "tailwindcss"`, `.postcssrc.json`). Angular Material is used only for `<mat-icon>` (`MatIconModule`). Icons load from Google Fonts in `src/index.html`. No Material form components, dialogs, or CDK overlays. |
| State | Angular signals in two root services. The live UI reads `ProjectStore` only. `SurveyDataService` is a second, unused project database. |
| Persistence | `window.localStorage` only. Keys: `design_consult_pro_projects_v2`, `design_consult_pro_active_id`, `design_consult_pro_unit`, `design_consult_pro_auth_user`. `SurveyDataService` writes different keys (`design_consult_pro` project/measurement keys) that no screen reads. No IndexedDB, SQLite, OPFS, or Cache Storage. |
| PWA | Not implemented. `public/` contains only `favicon.ico`. No `manifest.webmanifest`, no service worker, no `ngsw`. `src/index.html` sets `apple-mobile-web-app-capable`. The footer in `src/app/app.html` still prints “Local Cache: Active (Offline Ready)” and “PWA v2.4”. That string is static. |
| Auth | `AuthService` (`src/app/services/auth.service.ts`) is a local profile. `loadPersistedAuth()` seeds “Alex Rivera” / `concepts.phoenixproject@gmail.com` when nothing is stored. `loginWithGoogle()` and `loginWithEmail()` are timers plus fabricated profiles. The login screen (`src/app/views/login/`) is not mounted. `App` no longer checks `isAuthenticated`. |
| Speech | No Web Speech API, no Whisper, no streaming. `MediaRecorder` → base64 data URL → `POST /api/ai/transcribe-note`. |
| LLM | `@google/genai` on the Express server. Model strings are `gemini-3.7-flash` and `gemini-3.5-transcribe`. If `GEMINI_API_KEY` is missing, or the call throws, handlers return HTTP 200 with hardcoded architectural prose and `success: true`. |
| Maps | `leaflet` and `@types/leaflet` are dependencies. Nothing imports Leaflet. GPS uses `navigator.geolocation` plus OpenStreetMap Nominatim reverse geocode in `NewSurveyComponent.fetchReverseGeocode()`. |
| Animation | `motion` is a dependency. Nothing imports it. |
| Router | `@angular/router` is installed and `provideRouter(routes)` is registered with an empty route table. |

### How data moves

1. `ProjectStore` constructor calls `loadFromStorage()`. On the server (no `window`) it calls `seedDemoProject()`. In the browser it parses `localStorage` or seeds “The Mercer Loft Remodel”.
2. An `effect()` JSON-stringifies the entire `projects` signal into `localStorage` on every change, including photo data URLs and audio base64.
3. Views call `updateActiveRoom()` / `updateProject()`. `updateActiveRoom()` deep-clones the room, runs `calculateRoomMetrics()`, and writes the project.
4. AI features `POST` the whole project, or a base64 blob, to Express routes in `src/server.ts`. The browser wrapper is `AiConsultService`.

There is no sync protocol, no conflict resolution, and no queue. `isOnline` only flips a signal from `window` `online`/`offline` events. Nothing reads that signal before an AI call except as a status pill. Failed AI calls are swallowed into fallback copy.

### File tree (what each file does)

**Shell**

- `src/main.ts` — browser bootstrap.
- `src/main.server.ts` / `src/server.ts` — SSR engine plus `/api/ai/*` routes (brief, Q&A, transcribe, meeting summary, OCR, address guess).
- `src/app/app.ts` / `src/app/app.html` — root shell, tab switch, mobile bottom nav, settings modal (units, JSON backup, demo reset).
- `src/app/app.config.ts` — router, fetch HTTP client, browser error listeners. No hydration provider.
- `src/app/app.routes.ts` — empty.
- `src/index.html` — fonts, Material Icons, viewport `maximum-scale=1, user-scalable=no` (blocks pinch-zoom for the whole app).
- `src/styles.css` — Tailwind entry, print rules (`.no-print`), blueprint grid class.

**State and models**

- `src/app/services/project-store.service.ts` — the only store the UI uses: projects, active room, unit, tab, seed data, area math, JSON export/import.
- `src/app/services/survey-data.service.ts` — a second CRUD store with its own `Project` type in `survey.model.ts`. Injected by `NewSurveyComponent` and never called. Dead.
- `src/app/services/ai-consult.service.ts` — HTTP client for the six AI routes, each with a client-side canned fallback.
- `src/app/services/auth.service.ts` — fake session persisted to `localStorage`.
- `src/app/models/project.model.ts` — the real domain: walls, canvas shapes, openings, features, photos, audio notes, survey, AI brief, sign-off.
- `src/app/models/survey.model.ts` — a simpler competing model used only by the dead service.

**Chrome**

- `src/app/components/header/header.ts` / `header.html` — project switcher, room chips, unit toggle, JSON import/export, new-survey modal, and a horizontally scrolling tab bar for all eight screens.
- `src/app/components/new-survey/new-survey.component.ts` — reactive form, GPS, Nominatim, `store.createProject()`.

**Field tools**

- `src/app/components/room-canvas/room-canvas.ts` — hand-rolled 2D canvas (no CAD library). Draw, drag corners, place symbols, PNG snapshot.
- `src/app/components/diagonal-calculator/diagonal-calculator.ts` — compares wall lengths to typed diagonals and writes copy about scribe gaps.
- `src/app/components/photo-annotator/photo-annotator.ts` — file/camera input, Unsplash sample photos, click-to-pin notes.
- `src/app/components/audio-recorder/audio-recorder.ts` — MediaRecorder used by the Media tab, plus a “+ Quick Note” that inserts fake transcripts.
- `src/app/components/project-workspace/project-workspace.component.ts` — default landing screen. Second MediaRecorder, meeting summary, OCR, address guess, in-memory punch list, photo grid. Floorplan/report/proposal tabs are jump cards, not tools.

**Screens**

- `src/app/views/dashboard/` — accordion “start a project” wizard over the seeded loft. Its settings modal can no longer be opened (see §5).
- `src/app/views/survey-view/` — style, material, priority, budget, and notes bound to `project.survey`.
- `src/app/views/measure-view/` — canvas, wall number inputs, openings list, finishes, diagonal calculator.
- `src/app/views/conditions-view/` — per-room subfloor, electrical, plumbing, HVAC, structure form fields.
- `src/app/views/media-view/` — stacks photo annotator and audio recorder.
- `src/app/views/ai-proposal-view/` — generate brief + chat Q&A. Chat history is a component signal, not saved.
- `src/app/views/report-view/` — HTML report, signature canvas, `window.print()`.
- `src/app/views/login/` — full login UI. Not referenced by `App`. Dead.

Re-export shims (`dashboard.component.ts`, `login.component.ts`, `new-survey.component.ts`, `project-workspace.component.ts`) only re-export the real class.

---

## 2. Complete Feature & Screen Inventory

Navigation is not URL-based. Refresh always returns to the workspace tab because `currentActiveTab` is not persisted.

### Global chrome (`src/app/app.html`, `header.html`)

| Control | Behavior |
| --- | --- |
| Header tabs | Dashboard, Workspace, Measure, Survey, Conditions, Media, AI, Report. All call `setTab`. They scroll horizontally. They work. |
| Project dropdown | Lists `store.projects`, select, duplicate, delete, “New On-Site Survey” modal, JSON export, JSON import. Works against `ProjectStore`. |
| Room chips | `setActiveRoom`, `quickAddRoom()` cycles six hardcoded room names. Works. |
| Unit pill | `toggleUnit()` flips `'imperial' \| 'metric'`. Does not convert stored lengths. See §5. |
| Mobile bottom bar | Home, Workspace, Surveys, Measure, Settings. Conditions, Media, AI, and Report are absent. |
| Settings modal | Units, `exportAllProjectsJson()`, `resetToDemoProject()`. Sign-out was removed. Works. |
| Footer “Offline Ready / PWA v2.4” | Static text. |

### Dashboard — `DashboardComponent`

Works: project count cards, switch project, toggle status between `In Survey` and `Completed`, open new-survey modal, accordion steps that call `navigateToTab` / `openWorkspace` / `quickAddRoom`.

Stub / broken:

- Settings modal markup is still in `dashboard.html` (`isSettingsModalOpen`), but nothing sets it to `true` after the duplicate bottom nav was removed. `resetDemoData()` and `exportData()` on the dashboard are unreachable.
- Status pill always says “Offline Ready” in the template. It does not bind `isOnline`.
- Fallback project name in the template is the hardcoded string `46 King Charles Dr. Sovereign Island` when `activeProject()` is null.

### Workspace — `ProjectWorkspaceComponent` (default screen)

Sub-tabs are local signals, not routes.

| Sub-tab | What the buttons do |
| --- | --- |
| Recording | Mic toggle (`toggleRecording`), timer, fake level bars, list of `activeRoom.audioNotes`, delete, editable meeting-summary textarea, Copy, Generate with AI. Fetch-from-address and OCR buttons live here too. |
| Floorplan | Read-only metric cards and a wall table. “Open 2D CAD Tool” calls `navigateTo('measure')`. No canvas on this tab. |
| Photos | `triggerPhotoUpload()` opens `<input capture="environment">`. Grid of `room.photos`. No annotation, no caption edit, no delete on this grid. |
| Actions | Hardcoded five punch-list items in the component field `actionItems`. Add/toggle/delete mutate that signal only. Refresh wipes them. They are not on `Project`. |
| AI | Static explainer plus a button to `navigateTo('ai')`. Does not run a model. |
| Report | Static card. Button calls `navigateTo('report')`. |
| Proposal | Static card. Button calls `navigateTo('ai')`. |

Edit-project modal and delete-project modal write through `updateProject` / `deleteProject`. Those work.

`fetchFromAddress()` calls `/api/ai/fetch-address-details`. The server prompt asks the model to “estimate plausible” lot, zoning, and flood data. With no API key the response is the fixed “Lot 148 / RP849201” object in `server.ts`. Applying it writes those strings onto the project. This is not a cadastral lookup.

### Survey — `SurveyViewComponent`

Works, and is one of the few screens that persists real user choices: `toggleStyle`, `toggleMaterial`, `togglePriority`, `selectColorMood`, `updateClientNotes`, `updateTimeline`, `updateBudget` all call `updateActiveProject` into `project.survey`. Options come from `PRESET_STYLES` and `PRESET_MATERIALS` in `project.model.ts`.

### Measure — `MeasureViewComponent`

Sub-tabs: canvas, walls, openings, surfaces.

| Control | Behavior |
| --- | --- |
| `app-room-canvas` | Real drawing surface. See §4. |
| Length / width / height inputs | `updateRoomDimensions()` writes walls 0–3 only. Assumes a rectangle. Does not move canvas polygon points. |
| Per-wall length/height | `updateWallLength` / `updateWallHeight`. Recalculates areas via `updateActiveRoom`, does not redraw the polygon. |
| Add door / window / cased opening | Pushes an `OpeningItem` with fixed sizes (door 36×84, window 48×60, sill 30). Not placed on a wall graphically. |
| Remove opening | Filters the array. Area math then reruns. |
| Finish dropdowns | Writes `existingFinishes`. Works. |
| Diagonal calculator | Typed A–C and B–D. Advisory text is template copy, not computed from a laser. |

### Conditions — `ConditionsViewComponent`

Form fields call `updateSubfloor`, `updateElectrical`, `updatePlumbing`, `updateHVAC`, `updateStructural`. Seeded rooms from `createDefaultRoom()` include a `conditions` object, so edits persist. If `conditions` is missing, only `updateSubfloor` creates the object; the other four methods no-op when `r.conditions?.electrical` (etc.) is absent.

### Media — `MediaViewComponent`

No logic of its own. Renders `PhotoAnnotatorComponent` then `AudioRecorderComponent` for the active room. This is a second photo and voice UI stacked on top of the workspace versions.

### AI proposal — `AiProposalViewComponent`

- `generateProposal()` posts the project to `/api/ai/generate-brief` and stores `project.aiProposal`. Works when the server responds; the stored brief is often the fallback object from `generateFallbackBrief()`.
- `askAssistant()` appends to `qaHistory`, which is not written to the project. The first message is a hardcoded greeting. Suggested questions are canned. `askConsultantQA()` fallback answer is a fixed 36-inch-clearance paragraph in `ai-consult.service.ts`, returned with `success: true`.

### Report — `ReportViewComponent`

Renders project, rooms, and survey from the store. Signature pad (`startSig` / `drawSig` / touch equivalents) writes a PNG data URL into `project.clientSignOff` and sets status to `Signed`. `clearSignature()` sets status back to `Draft`. `printReport()` is `window.print()`. CSS hides `.no-print`. There is no PDF library, no page template for drawings, and no attachment of the canvas PNG unless the user already saved a snapshot into `room.photos`.

### Login — `LoginComponent`

Email validation (contains `@`, password length ≥ 4), Google button, offline guest. None of it is on the running shell.

---

## 3. Voice Recorder & Transcription Pipeline (Deep Dive)

There are two independent implementations that both write `Room.audioNotes`.

### A. Media tab — `AudioRecorderComponent`

File: `src/app/components/audio-recorder/audio-recorder.ts`.

`startRecording()`:

1. Bails with `alert()` if `navigator.mediaDevices.getUserMedia` is missing.
2. `getUserMedia({ audio: true })` — no sample rate, channel count, echo cancellation, or noise suppression constraints.
3. `new MediaRecorder(stream)` with no `mimeType`. The browser picks the container.
4. `mediaRecorder.start()` is called with no timeslice. Chrome fires `dataavailable` once, on stop. A killed tab or a locked phone drops the take.
5. `onstop` builds `new Blob(chunks, { type: 'audio/webm' })` even when the recorder produced `audio/mp4` (iOS Safari). The blob type and the bytes can disagree.
6. Tracks are stopped only in `onstop`.

`saveAudioNote()`:

- `URL.createObjectURL(blob)` stored as `audioBlobUrl`. That URL dies on refresh. The `<audio controls>` element in `audio-recorder.html` goes silent after reload.
- `FileReader.readAsDataURL` stores the full recording as `audioBase64` on the note, which the store then writes into `localStorage`.
- Sets `transcription` to the literal `'Transcribing speech...'`.
- Calls `AiConsultService.transcribeAudio(base64data, blob.type)`.

`addDemoVoiceNote()` is bound to the “+ Quick Note” button. It inserts one of three hardcoded sentences and no audio. Duration is hardcoded to 14 seconds.

`deleteAudioNote()` filters the array. It does not `URL.revokeObjectURL`.

The transcript `<p>` is not an input. There is no edit, no speaker label, no room-vocabulary list, and no way to mark a note as “client” vs “site note” beyond the title `Site Voice Memo #N`.

Error path: the `subscribe` `error` callback only clears `isTranscribing`. It leaves the string “Transcribing speech...”. In practice `AiConsultService.transcribeAudio` uses `catchError` and returns `{ success: true, transcription: 'Voice memo saved. Verified corner...' }`, so the error callback rarely runs. A failed network still looks like a successful transcript.

### B. Workspace — `ProjectWorkspaceComponent`

File: `src/app/components/project-workspace/project-workspace.component.ts`, methods `toggleRecording`, `startRecording`, `stopRecording`, `saveRecordedAudioBlob`, `createDemoAudioNote`.

Same MediaRecorder shape, plus:

- If `getUserMedia` throws, or the API is missing, it still sets `isRecording` true and runs the timer. `stopRecording()` then calls `createDemoAudioNote()`, which inserts a canned transcript and no audio. The UI does not say the microphone failed. The user thinks they recorded the client.
- `audioLevel` is `Math.floor(Math.random() * 65) + 35` on a 150 ms interval. Comment in code: “simulated audio level visualizer”. It is not `AnalyserNode`. Web Audio API is not used anywhere in `src/`.
- On AI error, `updateAudioNoteTranscription` writes another canned sentence (“Verified corner wall plumb...”) instead of the error.

`ngOnDestroy` calls `stopRecording()`, which can persist a partial or demo note when leaving the workspace tab, because the root `@switch` destroys the component.

### What neither recorder does

- No `timeslice` (for example `start(1000)`) and no IndexedDB chunk queue.
- No `document.visibilitychange` / `pagehide` handler. iOS Safari suspends the page when the screen locks; MediaRecorder stops or loses the buffer. There is no resume.
- No Wake Lock API.
- No `mimeType` capability check (`MediaRecorder.isTypeSupported`). iOS wants `audio/mp4` or `audio/aac`. Forcing `audio/webm` on the Blob is wrong there.
- No background recording. This is a foreground tab only.
- No streaming transcription. The whole data URL is posted after stop.
- No prompt biasing beyond one server sentence: “Transcribe this on-site design inspection voice note verbatim, fixing any contractor terminology or room dimension speech.” (`server.ts`, `POST /api/ai/transcribe-note`). No project name, room name, or dimension vocabulary is sent.
- No local Whisper. The model id is the string `gemini-3.5-transcribe`.
- If `getGenAI()` is null or `audioBase64` is empty, the handler returns HTTP 200 and the sentence “Audio recorded successfully. (On-site voice note logged: inspected wall joints...)”. Catch block returns “Voice memo saved to room log...” also with `success: true`. The client cannot tell a real transcript from a placeholder.
- The regex that strips the data-URL prefix only matches `data:audio/[a-zA-Z0-9]+;base64,`. A mime such as `audio/webm;codecs=opus` does not match, so the prefix can be sent to the model as “audio”.

### Storage and downstream use

`AudioNote` (`project.model.ts`) fields: `id`, `title`, `recordedAt`, `durationSeconds`, optional `audioBlobUrl`, optional `audioBase64`, optional `transcription`.

Notes hang off `Room.audioNotes`, so they are per room, not per project and not per “meeting”. Switching rooms in the header changes which list you see.

`generateAiMeetingSummary()` walks every room’s notes, skips strings containing `"Transcribing"`, and posts them with the textarea contents to `/api/ai/meeting-summary`. The result replaces `meetingSummaryText` and overwrites `project.survey.clientGeneralNotes` with the whole summary. That field is also the freeform client-notes box on the Survey screen, so generating a summary destroys the notes the designer typed there.

The summary textarea is not hydrated from `clientGeneralNotes` except in `initDefaultMeetingSummary()` at construction. Later edits on the Survey screen do not flow back into the workspace textarea until the workspace component is created again.

Transcripts are not edited in place. They are not split into action items. The punch list is unrelated hardcoded text.

---

## 4. Site Measuring, Canvas & Photo Workflow (Deep Dive)

### Canvas

Library: none. `RoomCanvasComponent` draws on one `<canvas>` with the 2D context. Constants: `PIXELS_PER_FOOT = 20` (line 47). A 10-pixel snap step is commented “snap to 6 inch equivalent” (`onMouseMove`). That is the finest snap. There is no 1/8 inch or millimetre grid.

Tools (`setTool`): pointer, door, window, outlet, plumbing, column, HVAC. `placeElementFromTool()` pushes a `CanvasShape` with a fixed pixel size and a fixed label such as `"36\" Entry Door"`. It does not create an `OpeningItem`, so the openings schedule and the drawing are different data. Deleting a symbol does not remove an opening. Adding an opening on the Measure form does not draw a symbol.

Interaction:

- Mouse down on a corner handle (12 px world radius) drags that polygon vertex and calls `syncWallLengthsFromPolygon`, which sets `lengthFt = pixels / 20`.
- Mouse down on a symbol selects and drags it.
- Any other press pans. Middle button and shift also pan.
- Wheel zoom is clamped to 0.5–2.5 in `onWheel`, and 0.4–2.5 on the buttons. `onWheel` calls `preventDefault()`, which does nothing useful if the listener is passive.
- Touch: `onTouchStart` / `onTouchMove` synthesize a `MouseEvent` for the first finger only. No `preventDefault()`. The page scrolls while you draw. No pinch. A second finger is ignored.
- `user-scalable=no` on the viewport stops the browser pinch-zoom that a designer would otherwise use to inspect a small plan.

`onMouseMove` calls `store.updateActiveRoom()` on every move. That deep-clones the room, recalculates metrics, and the store effect writes the full JSON (including every photo) to `localStorage` for each pointer event. On a phone this stalls the gesture and can throw `QuotaExceededError` once photos exist. The effect only `console.warn`s.

Geometry math in `calculateRoomMetrics()`:

- 4 walls: floor area is the average of opposite lengths, not the shoelace of the canvas polygon. A dragged corner can change wall lengths while the area formula still treats the room as a rectangle.
- 3+ other wall counts: regular-polygon approximation from average side length. An L-shape template (6 walls) does not use its actual polygon.
- Wall area is `perimeter * ceilingHeight` minus opening areas. Openings are converted with `(widthInches/12) * (heightInches/12)` always, even after the unit toggle claims metres.
- Diagonals: if both typed diagonals exist, `isSquare` is `abs(AC-BD)` converted to inches `<= 0.5`. The threshold does not scale with room size. The comment says “0.5 inches over 10ft”; the code is a flat half inch.
- `setUnit()` does not convert `lengthFt` or `ceilingHeightFt`. Labels switch to “m” / “m²” while the numbers stay in feet. `formatDimension()` on the canvas does multiply by 0.3048 for display only. The wall table in the workspace prints `wall.lengthFt` with a “m” suffix when `dimensions.unit === 'metric'`. `updateActiveRoom` writes `this.unit()` into `dimensions.unit`, so the lie is stored.

Bluetooth: no `navigator.bluetooth`, no BLE UUIDs, no laser distance parser. “Laser” exists only as marketing copy and as a punch-list sentence (“Take laser measurements...”).

Ceiling height is a single `ceilingHeightFt` on the room, copied onto each wall as `heightFt` when the polygon is resynced. Per-wall height inputs exist, but the next corner drag overwrites every wall height with `room.dimensions.ceilingHeightFt`.

### Photos

Two capture paths:

1. Workspace `onPhotoSelected` / `triggerPhotoUpload` — `<input type="file" accept="image/*" capture="environment">`. `FileReader.readAsDataURL` stores the original file bytes as a data URL. No resize, no JPEG recompress, no EXIF orientation fix. Photos are not annotated here. The grid has no delete button.
2. `PhotoAnnotatorComponent.handleFileUpload` — same pattern, then opens the photo. `onImageClick` records a percentage x/y and `saveAnnotation` appends a `PhotoAnnotation` (`dimension | damage | electrical | plumbing | general`). Click handler is `MouseEvent` only; a tap that produces a `click` works, a drag does not. Pins are not linked to wall names or dimensions. `addSamplePhoto()` inserts remote Unsplash URLs, which fail offline and are not the site.

OCR (`extractFromPhotoOcr`) is a separate upload on the workspace, not the photo gallery. Results land in a modal and can be appended to the meeting-summary textarea. They are not written back as wall lengths. With no API key the server returns a fixed “200A Square D” paragraph.

`exportSnapshot()` on the canvas writes a PNG data URL into `room.photos` and also triggers a file download named `{room}-measure-plan.png`.

### Export (complete list)

| Output | Implementation | CAD/BIM? |
| --- | --- | --- |
| JSON of all projects | `ProjectStore.exportAllProjectsJson()` | No. Includes data URLs, so the file is huge. |
| JSON import | `importProjectsJson()` — requires an array whose first item has `name`. `alert()` on failure. | |
| PNG of canvas | `RoomCanvasComponent.exportSnapshot()` | Raster only. |
| Browser print | `ReportViewComponent.printReport()` → `window.print()` | Not a PDF file. Drawings are not composed into the print layout unless they happen to be `<img>` tags already on the report. |
| Clipboard | `copySummaryToClipboard()` | Text of the meeting summary. |

There is no DXF, DWG, SVG, IFC, PDF library, ZIP, CSV schedule, or Markdown export. Nothing in `src/` writes those extensions.

---

## 5. Mobile Field Usability & Bug Audit

### Dead, fake, or half-built

1. **Login is unreachable.** `LoginComponent` is not in `App` imports. Auth still seeds a fictional user.
2. **Dashboard settings modal is dead.** `isSettingsModalOpen` is only ever set `false` (`dashboard.ts` `resetDemoData`). The template block around the old settings buttons never opens.
3. **`SurveyDataService` is dead weight**, and `NewSurveyComponent` injects it (`surveyService`) without calling it. Two `Project` types can drift.
4. **Punch list is fake persistence.** `actionItems` initial values are Mercer-loft tasks baked into the class. Not on the project. Lost on destroy.
5. **Microphone failure is disguised as a transcript** in `ProjectWorkspaceComponent.startRecording` / `createDemoAudioNote`.
6. **“+ Quick Note”** on the Media recorder inserts fiction (`addDemoVoiceNote`).
7. **AI success flag is meaningless.** Transcribe, OCR, brief, and address routes return `success: true` on fallback. The UI shows invented site facts (200A panel, Lot 148, 18 inch rough-in) as if they were observed.
8. **Address “fetch” is not a property database.** `server.ts` `POST /api/ai/fetch-address-details` asks the model to estimate cadastral fields. Applying them overwrites `lotNumber` and `rpNumber`.
9. **Q&A history and meeting-summary draft** (until Generate is pressed) live in component signals.
10. **`audioBlobUrl` does not survive reload.** Playback control is dead after a refresh even though base64 may still be in storage. Nothing rebuilds a blob URL from base64.
11. **Workspace photos cannot be annotated or deleted.** Annotation exists only on the Media tab, which the bottom nav does not link to.
12. **Canvas symbols and opening schedule are disconnected** (`placeElementFromTool` vs `MeasureViewComponent.addOpening`).
13. **Numeric wall edits do not update the polygon**, and polygon drags use a rectangular area formula for four-sided rooms.
14. **Metric toggle mislabels feet as metres.** `ProjectStore.setUnit`.
15. **L-shape / galley area is a regular-polygon estimate**, not the plan you see (`calculateRoomMetrics`, non-4-wall branch).
16. **Conditions fields other than subfloor no-op** when `conditions` is missing (`updateElectrical` and siblings).
17. **Generating a meeting summary overwrites `survey.clientGeneralNotes`.**
18. **Report and proposal workspace tabs do not contain the report or the proposal.** They are navigation cards. One of them is under 44 px tall (`py-2.5` text-xs, no `min-h`).
19. **Leaflet and `motion` are unused dependencies.**
20. **Footer and status chips claim a PWA and an offline cache that do not exist.**

### Touch targets and viewport

- Viewport meta disables zoom: `maximum-scale=1, user-scalable=no` in `src/index.html`. A designer cannot pinch a photo or a plan at the browser level. The canvas has its own zoom, capped at 2.5×, with no pinch.
- Record Note on the Media card is `px-3 py-1.5 text-xs` (`audio-recorder.html`). That is about 28–32 px tall, under the 44 px target. The delete icon is `text-[15px]`.
- Canvas toolbar buttons are `py-1.5 text-xs` (`room-canvas.html`), wrapped onto multiple rows on a phone, easy to miss with a thumb.
- Workspace floorplan “Open 2D CAD” is `min-h-[40px]`, still short of 44. Room pills are `min-h-[38px]`.
- Header tab buttons are `py-2 text-xs` with no min-height (`header.html`).
- Photo annotation delete and type controls are small icon/text buttons. The image click target is the photo, which is fine, but the save-pin row is a desktop-density form.
- Hover styles (`hover:bg-orange-700`, `group-hover`) do nothing on a finger. No hover-only feature is the sole path, but several icon buttons have only a `title` tooltip.
- Two persistent navs on a phone: scrolling header tabs plus a fixed bottom bar (`app.html`, `z-40`). The shell adds `pb-20` so content clears the bottom bar. The header is `sticky`. Together they consume a large share of a phone viewport before the room content starts. The workspace then adds another horizontal pill scroller (seven sub-tabs).
- No `100dvh` / `safe-area-inset` handling. The bottom bar can sit under the iOS home indicator. `min-h-screen` is `100vh`, which on iOS Safari includes the area behind the URL bar and causes a jump when the bar collapses.
- `user-scalable=no` also hurts users who need larger type on site.

### iOS Safari / Android field quirks

- **Mic permission** is requested only at record time, which is correct, but denial on the workspace path is silent and replaced with demo copy.
- **Screen lock / app switch** drops an in-progress `MediaRecorder` buffer because there is no timeslice and no `pagehide` flush.
- **iOS codec:** blob type is hardcoded `audio/webm`. Safari records MP4. Playback and the Gemini mime type can both be wrong.
- **`localStorage` eviction:** iOS aggressively clears storage, including in private mode and under memory pressure. The entire job, photos, and audio live in one key. A few phone photos (several MB each, base64-inflated by ~33%) exceed the typical 5 MB quota. The save `catch` logs a warning and the UI still shows the new photo until reload, when it disappears. There is no quota check before `readAsDataURL`.
- **Not installed as a PWA**, so there is no standalone display mode, no offline shell, and no way to reopen the tool from the home screen without a network the first time. `apple-mobile-web-app-capable` alone does not install a manifest.
- **Service worker:** none, so airplane mode after a cold start does not load the app. Once the JS is in the browser HTTP cache it may reload; that is not a designed offline mode. AI routes need the network. The store does not queue them.
- **SSR vs client:** `loadFromStorage` seeds on the server and may replace that seed from `localStorage` on the client. There is no `provideClientHydration`, so this is a content flash, not a hydration crash. Still, the first HTML can be the demo loft even when the device has a different project.

### Offline “sync”

There is no server copy of projects. “Sync” is a localStorage write. Two tabs share the same key and last-write-wins with no version field. `importProjectsJson` replaces the whole array with no merge. The `isOnline` flag does not gate saves and does not retry AI jobs.

---

## 6. Bloat & Unnecessary Complexity

What slows one-handed site use, and what should go:

1. **Eight top-level tabs plus seven workspace sub-tabs** that mostly link back to the eight tabs (`header.html`, `project-workspace.component.html`). On a walkthrough the designer needs three modes: talk, shoot, measure. The current IA makes them hunt.
2. **Two voice recorders and two photo flows** (`audio-recorder.ts` vs workspace recording; `photo-annotator.ts` vs workspace photo grid). They do not share a component. Behavior on mic failure differs.
3. **A second data model** (`survey.model.ts`, `survey-data.service.ts`) and a fake auth/login stack that the shell does not use.
4. **Dashboard accordion** that repeats “create project / go to survey / go to measure” already available in the header. The hardcoded Mercer narrative (styles, 200A panel, travertine) is demo content presented as the user’s job (`createSeedProject`).
5. **AI surfaces that are not the job:** cadastral guessing, code-assistant chat with a fake greeting, proposal takeoff that is a generated essay, punch list that is not saved. Each one is a full card with its own modal.
6. **Canvas toolbar density** (eight tools, snap, three templates, zoom, fit, rotate, delete, export) in `room-canvas.html`, wrapping to a tall block above a short canvas on a phone.
7. **Dependencies that add install weight and zero calls:** `leaflet`, `@types/leaflet`, `motion`. `@angular/router` and `@angular/cdk` are unused beyond `provideRouter([])` and the icon module’s transitive CDK.
8. **Storing binary in the same JSON document as the plan.** Every keystroke and every corner drag rewrites photos and audio. That is the main reason the app will feel sticky on site once a real walkthrough is recorded.
9. **Desktop-first copy** (“PWA v2.4”, “Field Survey & 2D CAD Tool”, “Sign-Off & Print PDF”) on controls that do not do those things. It costs trust when the designer is standing with a client.

---

## 7. Recommended Additions & Refactoring Roadmap

Ordered for the actual loop: walk the site, capture what was said, shoot the conditions, grab a few true dimensions, leave with something a CAD/BIM session can open.

### P0 — Stop losing the visit

1. **One recorder, honest failures.** Delete the demo branch in `ProjectWorkspaceComponent.startRecording` / `createDemoAudioNote` and `AudioRecorderComponent.addDemoVoiceNote`. Keep a single component (extend `audio-recorder.ts` or the workspace methods, not both). If `getUserMedia` rejects, show the error string and do not write an `AudioNote`.
2. **Survive the lock screen.** Call `mediaRecorder.start(1000)`, append chunks, and on `visibilitychange` / `pagehide` stop and flush. Persist chunks to IndexedDB (`idb`), not `localStorage`. Store `audio/mp4` when `MediaRecorder.isTypeSupported('audio/mp4')` and only use webm otherwise. Rebuild playback URLs from the blob on load. Files: `audio-recorder.ts`, `project-workspace.component.ts`, `project-store.service.ts` `effect()`.
3. **Stop treating fallback LLM text as site data.** `server.ts` transcribe/OCR/address handlers should return `success: false` or `isFallback: true`, and the UI should show “not transcribed — audio saved”. Do not overwrite `clientGeneralNotes` inside `generateAiMeetingSummary` until the designer taps a separate “Replace notes” control.
4. **Move binaries out of the project JSON.** `ProjectStore` effect should persist metadata only. Photos: compress via canvas (long edge ~1600 px, JPEG ~0.7) in `photo-annotator.ts` `handleFileUpload` and workspace `onPhotoSelected` before save.

### P1 — Make measure match the building

5. **One geometry.** In `calculateRoomMetrics`, compute floor area with the shoelace of `canvasSketch` polygon points scaled by `PIXELS_PER_FOOT`, and use the rectangular average only when there is no polygon. When `updateWallLength` runs, move the polygon to match. When `placeElementFromTool` adds a door or window, also push an `OpeningItem`.
6. **Unit conversion in one function** used by `setUnit`: multiply lengths by 0.3048 or the inverse, and stop appending “m” to foot numbers in `project-workspace.component.html` wall table.
7. **Phone canvas.** `preventDefault` on touch listeners in `room-canvas.ts`, add two-finger pinch, raise toolbar buttons to `min-h-[44px]`, and remove `user-scalable=no` from `index.html`. Use `100dvh` and `padding-bottom: env(safe-area-inset-bottom)` on the shell in `app.html`.
8. **Collapse navigation.** Bottom bar should be Record, Photos, Measure, Notes. Point Workspace Floorplan at `<app-room-canvas>` instead of a table plus a jump button. Drop the duplicate header tab row on viewports below `md`, or drop the bottom bar. Wire Conditions and the report off a single “More” sheet so they are reachable without a precision horizontal scroll.

### P2 — Leave site with a CAD-usable package

9. **Export a package, not a print dialog.** Add a function next to `exportAllProjectsJson` that builds a ZIP: `rooms/*.svg` (or DXF polylines from wall segments and openings), `photos/` as real JPEGs, `transcripts.md` per room, and `project.json` without base64. The SVG/DXF writer belongs beside `syncWallLengthsFromPolygon` in `room-canvas.ts`, because that is the only place that knows pixels-per-foot. `report-view.ts` `printReport` can stay as a preview, not the deliverable.
10. **Editable transcript.** Replace the italic `<p>` in `audio-recorder.html` and the workspace note card with a textarea bound to `note.transcription`, saved through `updateActiveRoom`. Pass `project.name`, `room.name`, and wall lengths into the transcribe prompt in `server.ts` so dimensions are biased, not “fixed” by the model after the fact.
11. **Punch list on the project.** Move `ActionItem` onto `Project` in `project.model.ts` and delete the hardcoded array in `ProjectWorkspaceComponent`. Generate candidate items from the transcript only as suggestions the designer confirms.
12. **Real offline shell.** Add a minimal service worker that caches the JS bundle. Do not promise “PWA v2.4” in `app.html` until that exists. Remove the unused `leaflet` and `motion` dependencies so the install is smaller on a phone hotspot.

### P3 — Delete the demo theatre

13. Remove `src/app/views/login/`, or mount it again. Do not keep both. Stop seeding Alex Rivera in `AuthService.loadPersistedAuth` if there is no login.
14. Delete `SurveyDataService` and `survey.model.ts`, and the unused inject in `new-survey.component.ts`.
15. Replace `createSeedProject` with an empty project named from the new-survey form so the first launch is not a fictional New York loft with invented MEP notes. Keep the seed behind the existing “Reset demo” button only.
16. Remove Unsplash `samplePhotos` from `photo-annotator.ts`. On site they are not the building, and they require a network.

The files that matter for the walkthrough, in order, are `project-workspace.component.ts`, `audio-recorder.ts`, `room-canvas.ts`, `project-store.service.ts`, `photo-annotator.ts`, `measure-view.ts`, and `server.ts`. Everything else is either a form on top of the store or a second door into those same files.
