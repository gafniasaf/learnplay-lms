
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function BookMissingImages() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  

  return (
    <div className="p-6">
      
  
  
  <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between h-12 sticky top-0 z-50 shadow-sm">
    <div className="flex items-center gap-3">
      <button title="Back to Book" className="text-gray-500 hover:text-gray-900 text-lg">
        ← 
      </button>
      <div className="flex items-center gap-2">
        <span className="text-lg">📖</span>
        <span className="text-sm font-semibold text-gray-900">Pathologie N4</span>
        <span className="text-gray-400">/</span>
        <span className="text-sm text-gray-600">Run #42a7</span>
      </div>
      <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
        Placeholders Active
      </span>
    </div>

    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 text-sm text-gray-500">
        <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
        <span>3 missing images</span>
      </div>
      <button data-cta-id="cta-admin-bookrun-rerender" data-action="action" className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors" onClick={() => toast.info("Action: cta-admin-bookrun-rerender")} type="button">
        Re-render PDF
      </button>
    </div>
  </header>

  
  <div className="max-w-6xl mx-auto p-6 space-y-6">
    
    
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-gray-900">Run Status</span>
          <span className="bg-green-100 text-green-700 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase">Completed</span>
        </div>
        <button data-cta-id="cta-admin-bookrun-refresh" data-action="action" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1" onClick={() => toast.info("Action: cta-admin-bookrun-refresh")} type="button">
          🔄 Refresh
        </button>
      </div>
      <div className="grid grid-cols-4 gap-4 p-5 text-sm">
        <div>
          <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Target</div>
          <div className="font-medium text-gray-900">Chapter 1</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Provider</div>
          <div className="font-medium text-gray-900">PrinceXML (local)</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Duration</div>
          <div className="font-medium text-gray-900">4.2s</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Artifacts</div>
          <div className="font-medium text-gray-900">3 files (PDF, HTML, Report)</div>
        </div>
      </div>
    </div>

    
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🖼️</span>
          <div>
            <span className="text-base font-semibold text-gray-900">Missing Images</span>
            <p className="text-xs text-gray-500 mt-0.5">Upload or AI-generate images, then re-render to replace placeholders</p>
          </div>
        </div>
        <button data-cta-id="cta-admin-bookrun-missing-refresh" data-action="action" className="text-sm text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors" onClick={() => toast.info("Action: cta-admin-bookrun-missing-refresh")} type="button">
          ↻ Refresh Report
        </button>
      </div>

      <div className="divide-y divide-gray-100">
        
        
        <div className="p-5 hover:bg-gray-50/50 transition-colors">
          <div className="flex gap-5">
            
            <div className="flex-shrink-0 w-40 h-24 rounded-lg overflow-hidden border-2 border-dashed border-amber-300 placeholder-box flex items-center justify-center">
              <div className="text-center">
                <div className="text-3xl opacity-60">🖼️</div>
                <div className="text-[9px] font-medium text-amber-700 mt-1">PLACEHOLDER</div>
              </div>
            </div>
            
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-mono text-gray-900 break-all">figures/pathologie/cel_structuur.svg</div>
                  <div className="text-xs text-gray-500 mt-1">Referenced in: §1.2 "De structuur van een cel"</div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">→ library/pathologie_n4/images/cel_structuur.svg</div>
                </div>
              </div>
              
              
              <div className="flex items-center gap-2 mt-3">
                <button data-cta-id="cta-admin-bookrun-missing-upload" data-action="action" className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:border-violet-300 hover:bg-violet-50 transition-all group" onClick={() => toast.info("Action: cta-admin-bookrun-missing-upload")} type="button">
                  <span className="text-lg group-hover:scale-110 transition-transform">📤</span>
                  Upload image
                </button>
                <button data-cta-id="cta-admin-bookrun-missing-ai-generate" data-action="action" className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-500 to-purple-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:from-violet-600 hover:to-purple-600 transition-all shadow-sm hover:shadow group" onClick={() => toast.info("Action: cta-admin-bookrun-missing-ai-generate")} type="button">
                  <span className="text-lg group-hover:scale-110 transition-transform">✨</span>
                  AI Generate
                </button>
                <span className="text-gray-300 mx-1">|</span>
                <button className="text-xs text-gray-400 hover:text-gray-600">View in book...</button>
              </div>
            </div>
          </div>
        </div>

        
        <div className="p-5 hover:bg-gray-50/50 transition-colors">
          <div className="flex gap-5">
            
            <div className="flex-shrink-0 w-40 h-24 rounded-lg overflow-hidden border-2 border-dashed border-amber-300 placeholder-box flex items-center justify-center">
              <div className="text-center">
                <div className="text-3xl opacity-60">🖼️</div>
                <div className="text-[9px] font-medium text-amber-700 mt-1">PLACEHOLDER</div>
              </div>
            </div>
            
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-mono text-gray-900 break-all">figures/pathologie/mitose_fasen.png</div>
                  <div className="text-xs text-gray-500 mt-1">Referenced in: §1.3 "Celdeling en mitose"</div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">→ library/pathologie_n4/images/mitose_fasen.png</div>
                </div>
              </div>
              
              
              <div className="flex items-center gap-2 mt-3">
                <button data-cta-id="cta-admin-bookrun-missing-upload" data-action="action" className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:border-violet-300 hover:bg-violet-50 transition-all group">
                  <span className="text-lg group-hover:scale-110 transition-transform">📤</span>
                  Upload image
                </button>
                <button data-cta-id="cta-admin-bookrun-missing-ai-generate" data-action="action" className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-500 to-purple-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:from-violet-600 hover:to-purple-600 transition-all shadow-sm hover:shadow group">
                  <span className="text-lg group-hover:scale-110 transition-transform">✨</span>
                  AI Generate
                </button>
                <span className="text-gray-300 mx-1">|</span>
                <button className="text-xs text-gray-400 hover:text-gray-600">View in book...</button>
              </div>
            </div>
          </div>
        </div>

        
        <div className="p-5 bg-violet-50/50">
          <div className="flex gap-5">
            
            <div className="flex-shrink-0 w-40 h-24 rounded-lg overflow-hidden border-2 border-violet-300 bg-violet-100 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl animate-bounce">⬆️</div>
                <div className="text-[9px] font-medium text-violet-700 mt-1">UPLOADING...</div>
              </div>
            </div>
            
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-mono text-gray-900 break-all">figures/pathologie/weefsel_types.jpg</div>
                  <div className="text-xs text-gray-500 mt-1">Referenced in: §1.4 "Weefsels en organen"</div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">→ library/pathologie_n4/images/weefsel_types.jpg</div>
                </div>
              </div>
              
              
              <div className="mt-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-violet-200 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-600 rounded-full w-2/3 transition-all duration-300"></div>
                  </div>
                  <span className="text-xs text-violet-700 font-medium">67%</span>
                </div>
                <div className="text-xs text-violet-600 mt-1">Uploading weefsel_types.jpg (2.4 MB)...</div>
              </div>
            </div>
          </div>
        </div>

      </div>

      
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Layout report generated: <span className="font-mono">Dec 30, 2025 3:42:18 PM</span>
        </div>
        <button data-cta-id="cta-admin-bookrun-download-report" data-action="action" className="text-xs text-violet-600 hover:text-violet-800 font-medium" onClick={() => toast.info("Action: cta-admin-bookrun-download-report")} type="button">
          Download full report (JSON)
        </button>
      </div>
    </div>

    
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-gray-900">PDF Preview</span>
          <span className="text-xs text-gray-500">(page with placeholders)</span>
        </div>
        <button data-cta-id="cta-admin-bookrun-open-pdf" data-action="action" className="text-sm text-gray-500 hover:text-gray-700" onClick={() => toast.info("Action: cta-admin-bookrun-open-pdf")} type="button">
          Open full PDF ↗
        </button>
      </div>
      
      <div className="p-6 flex justify-center bg-gray-100">
        
        <div className="bg-white shadow-lg rounded-sm w-[480px] aspect-[210/297] p-8 text-[10px] leading-relaxed relative">
          
          <div className="absolute top-3 left-8 right-8 flex justify-between text-[8px] text-gray-400 border-b border-gray-100 pb-1">
            <span>PATHOLOGIE N4</span>
            <span>HOOFDSTUK 1</span>
          </div>
          
          
          <div style={{ "columnRule": "1px solid #e5e7eb" }} className="mt-6 columns-2 gap-6 text-gray-800">
            <h2 className="text-sm font-bold text-gray-900 mb-2 break-inside-avoid">1.2 De structuur van een cel</h2>
            <p className="mb-3 text-justify hyphens-auto">
              De cel is de kleinste eenheid van leven. Elke cel bevat verschillende organellen 
              die specifieke functies uitvoeren. Het cytoplasma vormt de basis waarin alle...
            </p>
            
            
            <div className="break-inside-avoid mb-3">
              <div className="w-full h-20 rounded placeholder-box border-2 border-dashed border-amber-300 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-xl opacity-50">🖼️</div>
                  <div className="text-[7px] font-medium text-amber-600 mt-0.5">MISSING IMAGE</div>
                  <div className="text-[6px] text-amber-500 font-mono">cel_structuur.svg</div>
                </div>
              </div>
              <div className="text-[8px] text-gray-500 mt-1 italic text-center">
                Figuur 1.1 — Schematische weergave van een cel
              </div>
            </div>
            
            <p className="mb-3 text-justify hyphens-auto">
              Het kernmembraan beschermt het genetisch materiaal. De mitochondriën produceren 
              energie via cellulaire ademhaling. Het endoplasmatisch reticulum is betrokken bij...
            </p>
            
            <h3 className="text-xs font-semibold text-gray-900 mt-4 mb-2 break-inside-avoid">Praktijk</h3>
            <div className="bg-teal-50 border-l-2 border-teal-500 p-2 rounded-r mb-3 break-inside-avoid">
              <p className="text-justify hyphens-auto">
                <span className="italic">Bij een zorgvrager met celbeschadiging is het belangrijk om...</span>
              </p>
            </div>
            
            <p className="mb-3 text-justify hyphens-auto">
              De celwand van plantaardige cellen biedt extra structurele ondersteuning. 
              Dierlijke cellen missen deze wand maar hebben wel een flexibel membraan...
            </p>
          </div>
          
          
          <div className="absolute bottom-3 left-8 right-8 flex justify-center text-[8px] text-gray-400 border-t border-gray-100 pt-1">
            <span>7</span>
          </div>
        </div>
      </div>
    </div>

    
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
        <span className="text-base font-semibold text-gray-900">Generated Artifacts</span>
        <span className="text-xs text-gray-500">3 files</span>
      </div>
      <div className="divide-y divide-gray-100">
        <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-xl">📄</span>
            <div>
              <div className="text-sm font-medium text-gray-900">chapter_1.pdf</div>
              <div className="text-xs text-gray-500">PDF • 847 KB • 12 pages</div>
            </div>
          </div>
          <button data-cta-id="cta-admin-bookrun-download-pdf" data-action="action" className="text-sm text-violet-600 hover:text-violet-800 font-medium" onClick={() => toast.info("Action: cta-admin-bookrun-download-pdf")} type="button">
            Download
          </button>
        </div>
        <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-xl">🌐</span>
            <div>
              <div className="text-sm font-medium text-gray-900">chapter_1.html</div>
              <div className="text-xs text-gray-500">HTML • 156 KB</div>
            </div>
          </div>
          <button data-cta-id="cta-admin-bookrun-download-html" data-action="action" className="text-sm text-violet-600 hover:text-violet-800 font-medium" onClick={() => toast.info("Action: cta-admin-bookrun-download-html")} type="button">
            Download
          </button>
        </div>
        <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-xl">📊</span>
            <div>
              <div className="text-sm font-medium text-gray-900">layout_report.json</div>
              <div className="text-xs text-gray-500">JSON • 4 KB • 3 missing images</div>
            </div>
          </div>
          <button data-cta-id="cta-admin-bookrun-download-report" data-action="action" className="text-sm text-violet-600 hover:text-violet-800 font-medium">
            Download
          </button>
        </div>
      </div>
    </div>

  </div>

  
  <div className="fixed bottom-6 right-6 z-50">
    <div className="bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-pulse">
      <span className="text-lg">✓</span>
      <div>
        <div className="font-medium text-sm">Image uploaded successfully</div>
        <div className="text-xs opacity-80">Re-render to see changes in PDF</div>
      </div>
    </div>
  </div>


    </div>
  );
}
