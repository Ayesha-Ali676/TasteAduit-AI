import React, { useEffect } from 'react';
import { X, ZoomIn } from 'lucide-react';

interface ImageLightboxModalProps {
  isOpen: boolean;
  imageUrl?: string;
  entityName: string;
  category?: string;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  imageUrl,
  entityName,
  category,
  onClose
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${entityName} visual reference`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl w-full bg-[#18231C] border border-sage-soft/30 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
              {entityName}
            </h3>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 shrink-0">
              <ZoomIn className="w-3 h-3 text-emerald-400" />
              Visual reference &bull; Qloo
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close image viewer"
            className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image Stage */}
        <div className="p-4 sm:p-8 flex items-center justify-center overflow-auto bg-[#0F1813]/60">
          <img
            src={imageUrl}
            alt={entityName}
            className="max-h-[65vh] w-auto max-w-full object-contain rounded-2xl shadow-xl transition-transform"
            onError={() => {
              onClose();
            }}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-black/30 flex flex-wrap items-center justify-between text-xs text-white/60 gap-2">
          <div className="flex items-center gap-2">
            <span>Canonical: <strong className="text-white/90 font-medium">{entityName}</strong></span>
            {category && (
              <>
                <span className="text-white/30">&bull;</span>
                <span className="text-white/75 capitalize">{category.replace(/^urn:entity:/, '')}</span>
              </>
            )}
          </div>
          <span className="text-[11px] text-white/50">
            Official Qloo CDN visual asset &bull; Grounding score derived independently
          </span>
        </div>
      </div>
    </div>
  );
};
