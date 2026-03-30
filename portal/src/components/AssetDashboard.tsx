import React from 'react';
import { Image, Video, Upload, RefreshCw, CheckCircle, Clock, AlertCircle, Mic, Loader } from 'lucide-react';
import { clsx } from 'clsx';

export interface AssetItem {
  scene_name: string;
  asset_type: 'STOCK' | 'AI_IMAGE' | 'AI_VIDEO' | 'USER_VIDEO';
  prompt: string;
  status: 'pending' | 'fetching' | 'ready' | 'failed';
  local_path?: string;
  pexels_url?: string;
}

interface AssetDashboardProps {
  assets: AssetItem[];
  sfxNeeded: string[];
  systemSfx: { name: string; filename: string }[];
  onRefreshStock: (sceneName: string, index: number) => void;
  onUpload: (sceneName: string, file: File) => void;
  onUploadSfx: (name: string, file: File) => void;
}

const AssetDashboard: React.FC<AssetDashboardProps> = ({
  assets, sfxNeeded, systemSfx, onRefreshStock, onUpload, onUploadSfx,
}) => {
  const stockAssets = assets.filter(a => a.asset_type === 'STOCK');
  const userAssets  = assets.filter(a => a.asset_type !== 'STOCK');
  const [stockIndices, setStockIndices]   = React.useState<Record<string, number>>({});
  const [uploadingScenes, setUploadingScenes] = React.useState<Set<string>>(new Set());
  const [uploadingSfx, setUploadingSfx]   = React.useState<Set<string>>(new Set());

  const handleNextStock = (sceneName: string) => {
    const nextIdx = (stockIndices[sceneName] || 0) + 1;
    setStockIndices(prev => ({ ...prev, [sceneName]: nextIdx }));
    onRefreshStock(sceneName, nextIdx);
  };

  const handleUpload = async (sceneName: string, file: File) => {
    setUploadingScenes(prev => new Set([...prev, sceneName]));
    try {
      await onUpload(sceneName, file);
    } finally {
      setUploadingScenes(prev => { const s = new Set(prev); s.delete(sceneName); return s; });
    }
  };

  const handleUploadSfx = async (name: string, file: File) => {
    setUploadingSfx(prev => new Set([...prev, name]));
    try {
      await onUploadSfx(name, file);
    } finally {
      setUploadingSfx(prev => { const s = new Set(prev); s.delete(name); return s; });
    }
  };

  const getAssetUrl = (asset: AssetItem): string | null => {
    if (asset.status === 'ready' && asset.local_path) {
      const normalizedPath = asset.local_path.replace(/\\/g, '/');
      // Match anything after assets/ in the path
      const assetsMatch = normalizedPath.match(/\/assets\/(.+)$/) || normalizedPath.match(/^assets\/(.+)$/);
      const relativePath = assetsMatch ? assetsMatch[1] : normalizedPath.split('/').pop();
      return `/assets_local/${relativePath}?t=${Date.now()}`;
    }
    if (asset.pexels_url && asset.pexels_url.startsWith('http')) {
      return asset.pexels_url;
    }
    return null;
  };

  const isVideo = (asset: AssetItem): boolean =>
    asset.asset_type === 'AI_VIDEO' || asset.asset_type === 'USER_VIDEO' ||
    (asset.local_path?.match(/\.(mp4|mov|webm)$/i) != null);

  const AssetCard = ({ asset }: { asset: AssetItem }) => {
    const assetUrl = getAssetUrl(asset);
    const uploading = uploadingScenes.has(asset.scene_name);

    return (
      <div className="bg-background/40 border border-white/5 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-secondary truncate max-w-[150px]">
            {asset.scene_name}
          </span>
          <div className="flex items-center gap-1">
            {asset.status === 'ready'    && <CheckCircle className="w-4 h-4 text-green-500" />}
            {asset.status === 'pending'  && <Clock className="w-4 h-4 text-amber-500" />}
            {asset.status === 'fetching' && <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />}
            {asset.status === 'failed'   && <AlertCircle className="w-4 h-4 text-red-500" />}
          </div>
        </div>

        <div className="aspect-video bg-black/40 rounded flex items-center justify-center overflow-hidden border border-white/5 relative">
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-secondary">
              <Loader className="w-6 h-6 animate-spin" />
              <p className="text-[10px]">Uploading...</p>
            </div>
          ) : assetUrl ? (
            isVideo(asset) ? (
              <video
                src={assetUrl}
                className="w-full h-full object-cover"
                muted
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <img
                src={assetUrl}
                alt={asset.prompt}
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )
          ) : (
            <div className="text-center p-4">
              {isVideo(asset) ? (
                <Video className="w-8 h-8 text-secondary mx-auto mb-2" />
              ) : (
                <Image className="w-8 h-8 text-secondary mx-auto mb-2" />
              )}
              <p className="text-[10px] text-secondary line-clamp-2">{asset.prompt}</p>
            </div>
          )}

          <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[8px] font-bold text-white uppercase tracking-wider border border-white/10">
            {asset.asset_type.replace('_', ' ')}
          </div>
        </div>

        <div className="flex gap-2">
          {asset.asset_type === 'STOCK' ? (
            <button
              onClick={() => handleNextStock(asset.scene_name)}
              disabled={asset.status === 'fetching'}
              className="btn btn-outline py-1 text-xs flex-1 flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={clsx("w-3 h-3", asset.status === 'fetching' && "animate-spin")} />
              Try Another
            </button>
          ) : (
            <label className={clsx(
              "btn btn-outline py-1 text-xs flex-1 flex items-center justify-center gap-1",
              uploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            )}>
              {uploading ? (
                <Loader className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              {uploading ? 'Uploading...' : 'Upload'}
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                accept="image/*,video/*,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm"
                onChange={(e) => e.target.files?.[0] && handleUpload(asset.scene_name, e.target.files[0])}
              />
            </label>
          )}
        </div>

        {asset.prompt && (
          <p className="text-[9px] text-secondary/60 line-clamp-1 font-mono">{asset.prompt}</p>
        )}
      </div>
    );
  };

  return (
    <div className="card flex flex-col gap-6 h-full overflow-hidden">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Image className="w-6 h-6 text-accent" />
          Assets Dashboard
        </h2>
        <div className="text-xs text-secondary bg-white/5 px-3 py-1 rounded-full">
          {assets.filter(a => a.status === 'ready').length} / {assets.length} Ready
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
        {/* SFX Section */}
        {sfxNeeded.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-secondary mb-3 flex items-center gap-2">
              <Mic className="w-4 h-4" /> Required Sound Effects
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {sfxNeeded.map((sfx, i) => {
                const isReady  = systemSfx.some(s => s.name.toLowerCase() === sfx.toLowerCase());
                const isUploading = uploadingSfx.has(sfx);
                return (
                  <div key={i} className="bg-background/40 border border-white/5 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono">{sfx}</span>
                      {isReady ? (
                        <CheckCircle className="w-3 h-3 text-green-500" />
                      ) : (
                        <Clock className="w-3 h-3 text-amber-500" />
                      )}
                    </div>
                    {!isReady && (
                      <label className={clsx(
                        "btn btn-outline py-1 px-2 text-[10px] flex items-center gap-1",
                        isUploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                      )}>
                        {isUploading ? <Loader className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        {isUploading ? 'Uploading...' : 'Upload'}
                        <input
                          type="file"
                          className="hidden"
                          disabled={isUploading}
                          accept=".wav,.mp3,.ogg"
                          onChange={(e) => e.target.files?.[0] && handleUploadSfx(sfx, e.target.files[0])}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {stockAssets.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-secondary mb-3 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Stock Assets (Pexels)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {stockAssets.map((asset, i) => <AssetCard key={i} asset={asset} />)}
            </div>
          </section>
        )}

        {userAssets.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-secondary mb-3 flex items-center gap-2">
              <Upload className="w-4 h-4" /> AI & User Uploads
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {userAssets.map((asset, i) => <AssetCard key={i} asset={asset} />)}
            </div>
          </section>
        )}

        {assets.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-secondary opacity-50 py-12">
            <Image className="w-12 h-12 mb-4" />
            <p className="text-sm">No assets extracted yet.</p>
            <p className="text-xs mt-1">Parse a script to begin.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetDashboard;
