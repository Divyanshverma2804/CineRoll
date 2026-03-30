import React, { useState, useEffect, useRef } from 'react';
import { Send, FileText, Save } from 'lucide-react';

interface ScriptEditorProps {
  onParse: (script: string) => void;
  onSave?: (script: string) => void;
  isParsing: boolean;
  isSaving?: boolean;
  initialScript?: string;
  projectId?: string | null;
}

const DRAFT_KEY = 'cinemaforge_draft';

const ScriptEditor: React.FC<ScriptEditorProps> = ({
  onParse,
  onSave,
  isParsing,
  isSaving = false,
  initialScript = '',
  projectId,
}) => {
  const [script, setScript] = useState(initialScript);
  // Track the last project we loaded to avoid stale state
  const loadedProjectRef = useRef<string | null>(null);

  // FIX: When project changes (user clicks a project from diary), update the editor.
  // Previously initialScript was set but useEffect only ran once, so switching projects
  // didn't update the textarea. Now we watch projectId as the authoritative switch signal.
  useEffect(() => {
    if (projectId !== loadedProjectRef.current) {
      loadedProjectRef.current = projectId ?? null;

      if (projectId) {
        // Loading an existing project — use its script, ignore localStorage
        setScript(initialScript);
      } else {
        // New project mode — restore last draft from localStorage
        const saved = localStorage.getItem(DRAFT_KEY);
        setScript(saved || '');
      }
    }
  }, [projectId, initialScript]);

  // When initialScript prop changes (async load from API), sync if we're still on same project
  useEffect(() => {
    if (projectId && projectId === loadedProjectRef.current && initialScript) {
      setScript(initialScript);
    }
  }, [initialScript]);

  // Auto-save draft to localStorage only when no project is selected (new project mode)
  useEffect(() => {
    if (!projectId && script) {
      localStorage.setItem(DRAFT_KEY, script);
    }
  }, [script, projectId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+S / Cmd+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (projectId && onSave) {
        onSave(script);
      }
    }
  };

  return (
    <div className="card h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" />
          Production Script
        </h2>
        <div className="flex items-center gap-2">
          {/* Save button — only visible when a project is loaded */}
          {projectId && onSave && (
            <button
              onClick={() => onSave(script)}
              disabled={isSaving}
              title="Save script (Ctrl+S)"
              className="btn btn-outline py-1.5 px-3 flex items-center gap-1.5 text-xs text-green-400 border-green-500/30 hover:bg-green-500/10"
            >
              {isSaving ? (
                <div className="w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              Save
            </button>
          )}
          <button
            onClick={() => onParse(script)}
            disabled={isParsing || !script.trim()}
            className="btn btn-primary flex items-center gap-2 py-1.5 px-3 text-sm"
          >
            {isParsing ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Parsing...
              </>
            ) : (
              <>
                Extract Assets
                <Send className="w-3 h-3" />
              </>
            )}
          </button>
        </div>
      </div>

      <textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Paste your production script here...

# ProjectName: My Film
# Type: narration

## Scene: opening
Background: [STOCK] cityscape at dawn
SFX: ambient_city

Narrate:
The city never truly sleeps...`}
        className="flex-1 input font-mono text-sm resize-none bg-background/50 leading-relaxed"
        spellCheck={false}
      />

      {!projectId && script && (
        <p className="text-[10px] text-secondary/60 text-right">
          Draft auto-saved locally
        </p>
      )}
      {projectId && (
        <p className="text-[10px] text-secondary/60 text-right">
          Project #{projectId} · Ctrl+S to save
        </p>
      )}
    </div>
  );
};

export default ScriptEditor;
