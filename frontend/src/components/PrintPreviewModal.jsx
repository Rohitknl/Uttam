import React, { useState, useRef, useEffect } from 'react';
import { Printer, Eye, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from './ui';
import { printHtml } from '../utils/print';

export default function PrintPreviewModal({
  open,
  onClose,
  title = 'Document Print Preview',
  subtitle = '',
  html = '',
}) {
  const [zoom, setZoom] = useState(100);
  const iframeRef = useRef(null);

  useEffect(() => {
    try {
      const doc = iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document;
      if (doc && doc.body) {
        doc.body.style.zoom = `${zoom}%`;
        const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 900);
        const scaledH = Math.round((h + 40) * (zoom / 100));
        iframeRef.current.style.height = `${scaledH}px`;
        if (iframeRef.current.parentElement) {
          iframeRef.current.parentElement.style.minHeight = `${scaledH}px`;
        }
      }
    } catch {}
  }, [zoom, html, open]);

  if (!open) return null;

  const handlePrintNow = () => {
    printHtml(html);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(150, z + 15));
  const handleZoomOut = () => setZoom((z) => Math.max(60, z - 15));
  const handleResetZoom = () => setZoom(100);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface rounded-2xl border-2 border-forest-600/60 shadow-2xl flex flex-col w-full max-w-5xl h-[92vh] max-h-[960px] overflow-hidden">
        {/* Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-forest-950 text-white border-b-2 border-forest-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-forest-800 rounded-lg text-amber-400 shrink-0">
              <Eye className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded border border-amber-400/30 shrink-0">
                  Print Preview
                </span>
                <h3 className="text-base font-bold text-white truncate">{title}</h3>
              </div>
              {subtitle && <p className="text-xs text-forest-200 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-forest-900/90 rounded-lg px-2 py-1 border border-forest-700/60 text-xs">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 60}
                className="p-1 hover:text-amber-300 disabled:opacity-40 transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="w-12 text-center font-bold font-mono text-white select-none">
                {zoom}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 150}
                className="p-1 hover:text-amber-300 disabled:opacity-40 transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1 ml-1 hover:text-amber-300 text-forest-300 transition-colors cursor-pointer"
                title="Reset Zoom (100%)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Print Button */}
            <Button
              onClick={handlePrintNow}
              className="bg-amber-500 hover:bg-amber-600 text-forest-950 font-bold border-2 border-amber-400 flex items-center gap-1.5 py-1.5 px-3.5 shadow-sm"
            >
              <Printer className="w-4 h-4" /> Print Document
            </Button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-forest-200 hover:text-white hover:bg-forest-800 transition-colors cursor-pointer"
              title="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Paper Document Preview Workspace */}
        <div className="flex-1 min-h-0 overflow-auto bg-slate-200/90 p-4 sm:p-8 flex justify-center items-start">
          <div
            className="bg-white shadow-2xl rounded-sm border border-slate-300 transition-all origin-top flex flex-col"
            style={{
              width: `${Math.round(840 * (zoom / 100))}px`,
              minHeight: `${Math.round(1080 * (zoom / 100))}px`,
              maxWidth: '100%',
            }}
          >
            <iframe
              ref={iframeRef}
              title="Document Print Preview"
              srcDoc={html}
              className="w-full border-0 rounded-sm"
              style={{
                minHeight: `${Math.round(1080 * (zoom / 100))}px`,
                height: '100%',
                background: '#ffffff',
              }}
              sandbox="allow-same-origin allow-scripts"
              onLoad={(e) => {
                try {
                  const doc = e.target.contentDocument || e.target.contentWindow?.document;
                  if (doc && doc.body) {
                    const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 900);
                    const scaledH = Math.round((h + 40) * (zoom / 100));
                    e.target.style.height = `${scaledH}px`;
                    if (e.target.parentElement) {
                      e.target.parentElement.style.minHeight = `${scaledH}px`;
                    }
                  }
                } catch {}
              }}
            />
          </div>
        </div>

        {/* Footer toolbar */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-surface border-t-2 border-line shrink-0 text-xs text-muted">
          <span>Review layout, margins, and contents before sending to your printer.</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close Preview
            </Button>
            <Button size="sm" onClick={handlePrintNow} className="flex items-center gap-1.5">
              <Printer className="w-4 h-4" /> Print Document
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

