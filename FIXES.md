# CinemaForge — Bug Fixes & Enhancements

## Critical Bugs Fixed

### 1. Double `/assets` Mount (uploads not working)
**File:** `cinemaforge/main.py`  
**Root Cause:** The backend mounted `/assets` twice — once for the portal's compiled JS/CSS bundles (`portal/dist/assets`), and again for the upload folder (`/app/assets`). The second `app.mount("/assets", ...)` silently overwrote the first, so uploaded images and videos could never be served and the React app itself might fail to load its JS chunks.  
**Fix:** Renamed the portal bundle mount to `/portal_assets` and the upload folder mount to `/assets_local`. Updated `nginx.conf` to proxy `/assets_local/` → `backend:8001/assets_local/`.

### 2. Script Not Loaded When Switching Projects
**File:** `cinemaforge/models.py`, `portal/src/App.tsx`, `portal/src/components/ScriptEditor.tsx`  
**Root Cause:** `CinemaProject.as_dict()` did not include `script_md`, so `GET /projects/{id}` returned no script text. The frontend called `setCurrentScript(data.script_md)` on an `undefined` value, leaving the editor blank.  
**Fix:** Added `"script_md": self.script_md` to `as_dict()`. Also fixed `ScriptEditor` to properly watch `projectId` as the authoritative signal for when to reload (the old `useEffect` only watched `initialScript`, which didn't re-trigger on same-string updates).

### 3. No Save Button
**Files:** `cinemaforge/main.py`, `portal/src/App.tsx`, `portal/src/components/ScriptEditor.tsx`  
**Root Cause:** There was no endpoint or UI to save an edited script back to an existing project without triggering a full re-parse.  
**Fix:** Added `PUT /projects/{id}/script` endpoint. Added Save button to both the header (with confirm state) and the ScriptEditor toolbar. Supports `Ctrl+S` / `Cmd+S` keyboard shortcut.

### 4. No Delete Button
**File:** `cinemaforge/main.py`, `portal/src/App.tsx`  
**Root Cause:** No delete endpoint or UI existed.  
**Fix:** Added `DELETE /projects/{id}` endpoint that removes the DB row and cleans up asset/output directories from disk. Added a two-step Delete button in the header (first click shows "Confirm?", second click executes).

### 5. SFX / Voice Upload Silently Failed
**Files:** `cinemaforge/main.py`  
**Root Cause:** Upload endpoints had incorrect path logic for VOICES_FOLDER and SFX_FOLDER — the variable was re-read from `os.environ` inside the function but the global `VOICES_FOLDER` was already set. Also no validation of file extensions meant bad files were accepted silently.  
**Fix:** Consistently use `os.environ.get(...)` inside upload handlers. Added extension validation with clear error messages. Added `size` field to response so the frontend can confirm the upload was non-empty.

### 6. Upload Had No Visual Feedback
**File:** `portal/src/components/AssetDashboard.tsx`  
**Root Cause:** The upload `<label>` had no loading state — clicking it did nothing visible while the upload was in-flight.  
**Fix:** Added per-scene and per-sfx uploading state sets. While uploading, the button shows a spinner and "Uploading..." text and is disabled to prevent double-uploads.

### 7. Stale localStorage Draft on Project Switch
**File:** `portal/src/components/ScriptEditor.tsx`  
**Root Cause:** When selecting a project from the Diary, the editor loaded the project's script but also kept auto-saving it to localStorage under the same `cinemaforge_draft` key. On next page load this would restore the last-selected project's script as the "new project draft", overwriting whatever you were composing.  
**Fix:** localStorage auto-save only runs when `projectId` is null (new project mode). When a project is loaded, the script is never written to localStorage.

### 8. Toast Notifications (Error/Success feedback)
**File:** `portal/src/App.tsx`  
**Root Cause:** The old code had a single `error` state that only showed errors. Successes (upload done, project saved, etc.) had no feedback.  
**Fix:** Replaced with a proper `toasts` array supporting `success`, `error`, and `info` types. Toasts auto-dismiss after 4 seconds and can be manually closed. All upload, save, delete, parse, and render actions now emit toasts.

---

## Feature Roadmap (Priority Order)

### Phase 1 — Stability (implement now)
| # | Feature | Notes |
|---|---------|-------|
| 1 | ✅ Fix uploads (image/video/sfx/voice) | Done |
| 2 | ✅ Save & Delete project | Done |
| 3 | ✅ Script loads correctly on project select | Done |
| 4 | ✅ Upload progress indicators | Done |
| 5 | ✅ Toast notification system | Done |
| 6 | Project rename | PUT /projects/{id}/rename |
| 7 | Upload size guard on frontend | Warn if file > 200MB |
| 8 | Retry failed stock fetch | Already has "Try Another" |

### Phase 2 — Production Polish
| # | Feature | Notes |
|---|---------|-------|
| 1 | Script version history | Store last 5 script saves per project |
| 2 | Asset drag-and-drop upload | Drop zone on asset cards |
| 3 | Waveform preview for SFX/voice | Use wavesurfer.js |
| 4 | Bulk asset status check | "Re-scan all assets" button |
| 5 | Render progress log stream | SSE endpoint streaming ffmpeg logs |
| 6 | Short-form preview player | Show vertical 9:16 player for Shorts |
| 7 | Project duplication | POST /projects/{id}/duplicate |
| 8 | Search/filter projects | Frontend-only, filter by name/status |

### Phase 3 — Advanced Features
| # | Feature | Notes |
|---|---------|-------|
| 1 | Multi-language TTS | Add lang selector per character |
| 2 | Background music upload/selector | /music endpoint |
| 3 | Custom font support | Upload TTF, apply to captions |
| 4 | Scene reorder UI | Drag scenes in the editor |
| 5 | AI script assistant | Embedded Claude via Anthropic API |
| 6 | Thumbnail generator | Auto-generate YouTube thumbnail |
| 7 | Scheduled publishing | Cron job for YT upload at specific time |
| 8 | Analytics dashboard | View YT stats after publish |
| 9 | Team collaboration | Multi-user projects with auth tokens |
| 10 | Mobile app | React Native wrapper around the portal |
