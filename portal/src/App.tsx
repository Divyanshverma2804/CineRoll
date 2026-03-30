import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Film, Play, Settings, Terminal, Activity, Trash2, Save, CheckCircle } from 'lucide-react';
import ScriptEditor from './components/ScriptEditor';
import AssetDashboard from './components/AssetDashboard';
import type { AssetItem } from './components/AssetDashboard';
import VoiceManager from './components/VoiceManager';
import type { VoiceProfile, SystemVoice } from './components/VoiceManager';
import VideoPreview from './components/VideoPreview';
import { PlusCircle, History, Search } from 'lucide-react';
import clsx from 'clsx';

const API_BASE = '/api';

interface ProjectSummary {
  id: number;
  name: string;
  status: string;
  created_at: string;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let toastCounter = 0;

const App: React.FC = () => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [currentScript, setCurrentScript] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [sfxNeeded, setSfxNeeded] = useState<string[]>([]);
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [systemVoices, setSystemVoices] = useState<SystemVoice[]>([]);
  const [systemSfx, setSystemSfx] = useState<{name: string, filename: string}[]>([]);
  const [status, setStatus] = useState<string>('idle');
  const [videoPaths, setVideoPaths] = useState<{ longform?: string, short?: string }>({});
  const [ytVideoId, setYtVideoId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++toastCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // Initial fetch
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [vRes, sRes, pRes] = await Promise.all([
          axios.get(`${API_BASE}/voices`),
          axios.get(`${API_BASE}/sfx`),
          axios.get(`${API_BASE}/projects`),
        ]);
        setSystemVoices(vRes.data);
        setSystemSfx(sRes.data);
        setProjects(pRes.data);
      } catch (err) {
        console.error('Failed to fetch system resources:', err);
      }
    };
    fetchData();
  }, []);

  const handleSelectProject = async (id: number) => {
    try {
      const res = await axios.get(`${API_BASE}/projects/${id}`);
      const data = res.data;
      setProjectId(data.id.toString());
      // FIX: script_md is now returned by as_dict(), so this correctly populates the editor
      setCurrentScript(data.script_md || '');
      setStatus(data.status);
      setVideoPaths({ longform: data.output_path, short: data.short_path });
      setYtVideoId(data.yt_video_id_en);
      setErrorMsg(data.error_msg);
      setConfirmDelete(false);

      if (data.manifest) {
        const allAssets: AssetItem[] = [
          ...data.manifest.auto_fetch.map((a: any) => ({ ...a, asset_type: 'STOCK' })),
          ...data.manifest.user_upload.map((a: any) => ({ ...a, asset_type: a.asset_type })),
        ];
        setAssets(allAssets);
        setSfxNeeded(data.manifest.sfx_needed || []);
      } else {
        setAssets([]);
        setSfxNeeded([]);
      }
      extractVoices(data.script_md || '');
    } catch (err) {
      console.error('Failed to load project:', err);
      showToast('Failed to load project', 'error');
    }
  };

  const handleNewProject = () => {
    setProjectId(null);
    setCurrentScript('');
    setAssets([]);
    setVoices([]);
    setStatus('idle');
    setVideoPaths({});
    setYtVideoId(null);
    setErrorMsg(null);
    setConfirmDelete(false);
  };

  // Poll project status
  useEffect(() => {
    if (!projectId) return;

    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE}/projects/${projectId}`);
        const data = res.data;
        setStatus(data.status);
        setVideoPaths({ longform: data.output_path, short: data.short_path });
        setYtVideoId(data.yt_video_id_en);
        setErrorMsg(data.error_msg);

        if (voices.length === 0 && data.script_md) {
          extractVoices(data.script_md);
        }

        const mapping = data.voice_mapping || {};
        setVoices(prev => prev.map(v => ({
          ...v,
          assigned_voice: mapping[v.name]
        })));

        if (data.manifest) {
          const allAssets: AssetItem[] = [
            ...data.manifest.auto_fetch.map((a: any) => ({ ...a, asset_type: 'STOCK' })),
            ...data.manifest.user_upload.map((a: any) => ({ ...a, asset_type: a.asset_type })),
          ];
          setAssets(allAssets);
          setSfxNeeded(data.manifest.sfx_needed || []);
        }
      } catch (err) {
        console.error('Status poll failed:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [projectId, voices.length]);

  const handleParseScript = async (script: string) => {
    setIsParsing(true);
    try {
      setProjectId(null);
      setAssets([]);
      setVoices([]);

      const formData = new FormData();
      formData.append('script_md', script);

      const res = await axios.post(`${API_BASE}/submit`, formData);
      if (res.data.ok) {
        setProjectId(res.data.project_id.toString());
        setStatus('pending');
        extractVoices(script);
        const pRes = await axios.get(`${API_BASE}/projects`);
        setProjects(pRes.data);
        showToast('Script parsed & project created!', 'success');
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to parse script';
      showToast(msg, 'error');
    } finally {
      setIsParsing(false);
    }
  };

  // FIX: Save script to existing project without re-parsing
  const handleSaveScript = async (script: string) => {
    if (!projectId) {
      showToast('No project selected. Use "Extract Assets" to create one first.', 'info');
      return;
    }
    setIsSaving(true);
    try {
      await axios.put(`${API_BASE}/projects/${projectId}/script`, { script_md: script });
      showToast('Script saved!', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to save script', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // FIX: Delete project
  const handleDeleteProject = async () => {
    if (!projectId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsDeleting(true);
    try {
      await axios.delete(`${API_BASE}/projects/${projectId}`);
      showToast('Project deleted.', 'success');
      handleNewProject();
      const pRes = await axios.get(`${API_BASE}/projects`);
      setProjects(pRes.data);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to delete project', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const extractVoices = (script: string) => {
    const speakerRegex = /^# Speaker:\s*(.+?)\s*\[(.+?)\]$/gm;
    const detected: Record<string, VoiceProfile> = {};
    let match;
    while ((match = speakerRegex.exec(script)) !== null) {
      detected[match[1]] = { name: match[1], emotion: match[2], assigned_voice: undefined };
    }
    if (Object.keys(detected).length === 0) {
      const typeMatch = script.match(/^# Type:\s*narration\s*$/im);
      if (typeMatch) {
        detected['Narrator'] = { name: 'Narrator', emotion: 'default', assigned_voice: undefined };
      }
    }
    setVoices(Object.values(detected));
  };

  const handleRefreshStock = async (sceneName: string, index: number) => {
    if (!projectId) return;
    try {
      await axios.post(`${API_BASE}/projects/${projectId}/fetch_stock`, { scene: sceneName, index });
    } catch (err) {
      console.error('Refresh failed:', err);
      showToast('Failed to fetch stock image', 'error');
    }
  };

  const handleUploadAsset = async (sceneName: string, file: File) => {
    if (!projectId) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(`${API_BASE}/projects/${projectId}/upload/${sceneName}`, formData);
      showToast(`Asset uploaded for "${sceneName}"`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Asset upload failed', 'error');
    }
  };

  const handleUploadVoiceRef = async (name: string, file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(`${API_BASE}/voices/upload/${name}`, formData);
      const res = await axios.get(`${API_BASE}/voices`);
      setSystemVoices(res.data);
      showToast(`Voice "${name}" uploaded!`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Voice upload failed', 'error');
    }
  };

  const handleRemoveVoiceRef = async (name: string) => {
    try {
      await axios.delete(`${API_BASE}/voices/${name}`);
      setSystemVoices(prev => prev.filter(v => v.name !== name));
      showToast(`Voice "${name}" removed.`, 'info');
    } catch (err) {
      showToast('Failed to remove voice', 'error');
    }
  };

  const handleAssignVoice = async (speaker: string, voiceName: string) => {
    if (!projectId) return;
    try {
      const currentMapping = voices.reduce((acc, v) => {
        if (v.assigned_voice) acc[v.name] = v.assigned_voice;
        return acc;
      }, {} as Record<string, string>);
      const newMapping = { ...currentMapping, [speaker]: voiceName };
      await axios.post(`${API_BASE}/projects/${projectId}/voice_map`, newMapping);
      setVoices(prev => prev.map(v => v.name === speaker ? { ...v, assigned_voice: voiceName } : v));
    } catch (err) {
      showToast('Failed to assign voice', 'error');
    }
  };

  const handleUploadSfx = async (name: string, file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(`${API_BASE}/sfx/upload/${name}`, formData);
      const res = await axios.get(`${API_BASE}/sfx`);
      setSystemSfx(res.data);
      showToast(`SFX "${name}" uploaded!`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'SFX upload failed', 'error');
    }
  };

  const handleRender = async () => {
    if (!projectId) return;
    try {
      await axios.post(`${API_BASE}/projects/${projectId}/render`, {});
      setStatus('rendering');
      showToast('Render started!', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Render failed to start', 'error');
    }
  };

  const handleUploadToYoutube = async (format: 'longform' | 'short') => {
    if (!projectId) return;
    try {
      await axios.post(`${API_BASE}/projects/${projectId}/upload_yt?format=${format}`, {});
      setStatus('uploading');
      showToast('YouTube upload started!', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'YouTube upload failed', 'error');
    }
  };

  const isReadyToRender = assets.length > 0 && assets.every(a => a.status === 'ready');

  return (
    <div className="min-h-screen bg-background p-6 flex flex-col gap-6">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 pb-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg">
              <Film className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight m-0 uppercase">CINEMA<span className="text-primary">FORGE</span></h1>
              <p className="text-xs text-secondary font-medium uppercase tracking-widest">Production Engine</p>
            </div>
          </div>

          <div className="h-10 w-px bg-white/10 hidden lg:block" />

          <div className="hidden lg:flex items-center gap-2">
            <button
              onClick={handleNewProject}
              className="btn btn-outline py-2 px-4 flex items-center gap-2 text-sm"
            >
              <PlusCircle className="w-4 h-4" /> New Project
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Project actions: Save + Delete */}
          {projectId && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSaveScript(currentScript)}
                disabled={isSaving}
                title="Save script to current project"
                className="btn btn-outline py-2 px-3 flex items-center gap-1.5 text-sm text-green-400 border-green-500/30 hover:bg-green-500/10"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </button>

              <button
                onClick={handleDeleteProject}
                disabled={isDeleting}
                title={confirmDelete ? 'Click again to confirm deletion' : 'Delete this project'}
                className={clsx(
                  "btn py-2 px-3 flex items-center gap-1.5 text-sm transition-all",
                  confirmDelete
                    ? "bg-red-600 text-white border-red-600 animate-pulse"
                    : "btn-outline text-red-400 border-red-500/30 hover:bg-red-500/10"
                )}
              >
                <Trash2 className="w-4 h-4" />
                {confirmDelete ? 'Confirm?' : 'Delete'}
              </button>

              {confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="btn btn-outline py-2 px-2 text-xs text-secondary"
                >
                  Cancel
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
            <Activity className="w-4 h-4 text-green-500" />
            <span className="text-sm font-semibold capitalize">{status}</span>
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 grid grid-cols-12 gap-6 overflow-hidden min-h-0">
        {/* Left Column */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 overflow-hidden">
          {/* Projects Diary */}
          <div className="card flex flex-col gap-4 max-h-[300px] overflow-hidden">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <History className="w-5 h-5 text-accent" />
                Drafting Diary
              </h2>
              <span className="text-[10px] text-secondary bg-white/5 px-2 py-0.5 rounded uppercase font-bold tracking-tighter">
                {projects.length} Saved
              </span>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
              {projects.length === 0 ? (
                <div className="text-center py-8 text-secondary/50 flex flex-col items-center gap-2">
                  <Search className="w-8 h-8 opacity-20" />
                  <p className="text-xs">No saved projects found</p>
                </div>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProject(p.id)}
                    className={clsx(
                      "w-full text-left p-3 rounded-lg border transition-all group flex items-center justify-between",
                      projectId === p.id.toString()
                        ? "bg-primary/10 border-primary/30"
                        : "bg-white/5 border-transparent hover:bg-white/10"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate group-hover:text-primary transition-colors">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-secondary mt-1 flex items-center gap-2">
                        <span>{new Date(p.created_at).toLocaleDateString()}</span>
                        <span className="w-1 h-1 bg-white/20 rounded-full" />
                        <span className="capitalize">{p.status}</span>
                      </div>
                    </div>
                    {projectId === p.id.toString() && (
                      <CheckCircle className="w-3 h-3 text-primary ml-2 flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Script Editor */}
          <div className="flex-1 overflow-hidden min-h-[400px]">
            <ScriptEditor
              onParse={handleParseScript}
              onSave={handleSaveScript}
              isParsing={isParsing}
              isSaving={isSaving}
              initialScript={currentScript}
              projectId={projectId}
            />
          </div>
        </div>

        {/* Middle Column */}
        <div className="col-span-12 lg:col-span-5 flex flex-col overflow-hidden">
          <AssetDashboard
            assets={assets}
            sfxNeeded={sfxNeeded}
            systemSfx={systemSfx}
            onRefreshStock={handleRefreshStock}
            onUpload={handleUploadAsset}
            onUploadSfx={handleUploadSfx}
          />
        </div>

        {/* Right Column */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
          <div className="flex-shrink-0">
            <VideoPreview
              status={status}
              outputPath={videoPaths.longform}
              shortPath={videoPaths.short}
              ytVideoId={ytVideoId || undefined}
              errorMsg={errorMsg || undefined}
              onUpload={handleUploadToYoutube}
            />
          </div>

          <div className="flex-1">
            <VoiceManager
              voices={voices}
              systemVoices={systemVoices}
              onUploadRef={handleUploadVoiceRef}
              onRemoveRef={handleRemoveVoiceRef}
              onAssignVoice={handleAssignVoice}
            />
          </div>

          {/* Render Control */}
          <div className="card bg-primary/10 border-primary/20 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2 text-sm">
                <Terminal className="w-4 h-4" /> Ready to Render?
              </h3>
            </div>
            <p className="text-[11px] text-secondary leading-relaxed">
              Rendering will combine all assets, generate TTS, and composite the final video.
            </p>
            <button
              disabled={!isReadyToRender || status === 'rendering' || !projectId}
              onClick={handleRender}
              className="btn btn-primary w-full flex items-center justify-center gap-2 py-3 font-bold tracking-tight"
            >
              <Play className="w-4 h-4 fill-current" />
              START PRODUCTION
            </button>
            {!isReadyToRender && assets.length > 0 && (
              <p className="text-[10px] text-amber-500 text-center font-medium animate-pulse">
                Waiting for {assets.filter(a => a.status !== 'ready').length} assets to be finalized.
              </p>
            )}
            {!projectId && (
              <p className="text-[10px] text-secondary text-center">
                Parse a script first to enable rendering.
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={clsx(
              "px-5 py-3 rounded-lg shadow-xl flex items-center gap-3 text-sm font-medium animate-in fade-in slide-in-from-bottom-4 max-w-sm",
              toast.type === 'success' && "bg-green-600 text-white",
              toast.type === 'error'   && "bg-red-600 text-white",
              toast.type === 'info'    && "bg-zinc-700 text-white border border-white/10",
            )}
          >
            {toast.message}
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="opacity-70 hover:opacity-100 ml-auto"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
