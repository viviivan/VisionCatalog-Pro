import React, { useState, useRef } from 'react';
import { FolderOpen, Play, Square, Download, CheckCircle2, AlertCircle, Loader2, Image as ImageIcon, History } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ProductAnalysis } from '../types';
import { callGeminiWithRetry, analyzeProductImage } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';

const slugify = (text: string) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w-]+/g, '')  // Remove all non-word chars
    .replace(/--+/g, '-');    // Replace multiple - with single -
};

const toTitleCase = (text: string) => {
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const AnalyzeMode: React.FC = () => {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<ProductAnalysis[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [folderMap, setFolderMap] = useState<Map<string, File[]>>(new Map());
  const [history, setHistory] = useState<{ handles: Set<string>; titles: Set<string> }>({
    handles: new Set(),
    titles: new Set()
  });
  
  const stopRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyInputRef = useRef<HTMLInputElement>(null);

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFolderMap = new Map<string, File[]>();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pathParts = file.webkitRelativePath.split('/');
      if (pathParts.length > 1) {
        const folderName = pathParts[pathParts.length - 2];
        if (!newFolderMap.has(folderName)) {
          newFolderMap.set(folderName, []);
        }
        newFolderMap.get(folderName)?.push(file);
      }
    }

    setFolderMap(newFolderMap);

    const initialResults: ProductAnalysis[] = Array.from(newFolderMap.keys())
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map(name => ({
        folderName: name,
        handle: '',
        title: '',
        titleZh: '',
        status: 'pending' as const
      }));

    setResults(initialResults);
    setProgress(0);
  };

  const handleHistoryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(sheet);

      const newHandles = new Set<string>();
      const newTitles = new Set<string>();

      json.forEach(row => {
        if (row.Handle) newHandles.add(row.Handle);
        if (row.Title) newTitles.add(row.Title);
      });

      setHistory({ handles: newHandles, titles: newTitles });
      alert(`Loaded ${newHandles.size} handles and ${newTitles.size} titles from history.`);
    };
    reader.readAsArrayBuffer(file);
  };

  const processFolders = async () => {
    if (!keyword.trim()) {
      alert("Please enter a Core Keyword first.");
      return;
    }

    setIsProcessing(true);
    stopRef.current = false;
    let completedCount = 0;

    const folders = (Array.from(folderMap.entries()) as [string, File[]][]).sort((a, b) => 
      a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' })
    );

    const currentSessionHandles = new Set<string>();
    const currentSessionTitles = new Set<string>();
    
    for (let i = 0; i < folders.length; i++) {
      if (stopRef.current) break;

      const [folderName, files] = folders[i];
      
      const existing = results.find(r => r.folderName === folderName);
      if (existing?.status === 'completed') {
        completedCount++;
        continue;
      }

      setResults(prev => prev.map(r => 
        r.folderName === folderName ? { ...r, status: 'processing' } : r
      ));

      try {
        const imageFile = files.find(f => f.type.startsWith('image/'));
        if (!imageFile) throw new Error("No image found in folder");

        const base64 = await fileToBase64(imageFile);
        const analysis = await callGeminiWithRetry(() => 
          analyzeProductImage(
            process.env.GEMINI_API_KEY || '',
            'gemini-3-flash-preview',
            base64.split(',')[1],
            imageFile.type,
            keyword
          )
        );

        // Construct handle and title with strict prefix and Title Case
        const descriptivePart = analysis.description;
        const descriptivePartZh = analysis.descriptionZh;
        
        let finalHandle = `${slugify(keyword)}-${slugify(descriptivePart)}`;
        let finalTitle = `${toTitleCase(keyword)} - ${toTitleCase(descriptivePart)}`;
        let finalTitleZh = `${keyword} - ${descriptivePartZh}`;

        // Uniqueness check - Gemini is now instructed to be descriptive, but we keep a fallback
        let counter = 1;
        const originalHandle = finalHandle;
        const originalTitle = finalTitle;

        while (
          history.handles.has(finalHandle) || 
          currentSessionHandles.has(finalHandle) ||
          history.titles.has(finalTitle) ||
          currentSessionTitles.has(finalTitle)
        ) {
          finalHandle = `${originalHandle}-v${counter}`;
          finalTitle = `${originalTitle} (Variant ${counter})`;
          counter++;
        }

        currentSessionHandles.add(finalHandle);
        currentSessionTitles.add(finalTitle);

        setResults(prev => prev.map(r => 
          r.folderName === folderName ? { 
            ...r, 
            handle: finalHandle,
            title: finalTitle,
            titleZh: finalTitleZh,
            status: 'completed',
            imageUrl: URL.createObjectURL(imageFile)
          } : r
        ));
      } catch (error: any) {
        setResults(prev => prev.map(r => 
          r.folderName === folderName ? { ...r, status: 'error', error: error.message } : r
        ));
      }

      completedCount++;
      setProgress(Math.round((completedCount / folders.length) * 100));
    }

    setIsProcessing(false);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const exportToExcel = () => {
    const sortedResults = [...results].sort((a, b) => 
      a.folderName.localeCompare(b.folderName, undefined, { numeric: true, sensitivity: 'base' })
    );

    const data = sortedResults.map(r => ({
      'Folder Name': r.folderName,
      'Handle': r.handle,
      'Title': r.title,
      'Title (CN)': r.titleZh,
      'Status': r.status,
      'Error': r.error || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analysis");
    XLSX.writeFile(wb, `VisionCatalog_Export_${new Date().getTime()}.xlsx`);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6 rounded-2xl shadow-sm space-y-6">
            <h2 className="text-lg font-semibold uppercase tracking-tight flex items-center gap-2">
              <FolderOpen size={20} />
              Analysis Config
            </h2>
            
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase opacity-50">Core Keyword (Required)</label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. Punch Needle Kit"
                className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="py-4 border-2 border-dashed border-[var(--line)] rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-[var(--ink)]/5 transition-all group"
              >
                <FolderOpen className="opacity-40 group-hover:scale-110 transition-transform" size={24} />
                <span className="text-[10px] font-medium opacity-60">Folders</span>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFolderSelect}
                  className="hidden"
                  webkitdirectory=""
                  directory=""
                  multiple
                />
              </button>

              <button
                onClick={() => historyInputRef.current?.click()}
                disabled={isProcessing}
                className="py-4 border-2 border-dashed border-[var(--line)] rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-[var(--ink)]/5 transition-all group"
              >
                <History className="opacity-40 group-hover:scale-110 transition-transform" size={24} />
                <span className="text-[10px] font-medium opacity-60">History</span>
                <input
                  type="file"
                  ref={historyInputRef}
                  onChange={handleHistoryUpload}
                  className="hidden"
                  accept=".xlsx"
                />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                {!isProcessing ? (
                  <button
                    onClick={processFolders}
                    disabled={folderMap.size === 0 || !keyword.trim()}
                    className="flex-1 bg-[var(--ink)] text-[var(--bg)] py-3 rounded-xl flex items-center justify-center gap-2 font-medium hover:opacity-90 transition-opacity disabled:opacity-30"
                  >
                    <Play size={18} />
                    Start Analysis
                  </button>
                ) : (
                  <button
                    onClick={() => stopRef.current = true}
                    className="flex-1 bg-red-500 text-white py-3 rounded-xl flex items-center justify-center gap-2 font-medium hover:bg-red-600 transition-colors"
                  >
                    <Square size={18} />
                    Stop
                  </button>
                )}
                
                <button
                  onClick={exportToExcel}
                  disabled={results.length === 0 || isProcessing}
                  className="px-4 bg-white border border-[var(--line)] rounded-xl flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-30"
                >
                  <Download size={18} />
                </button>
              </div>
            </div>

            {isProcessing && (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-mono uppercase opacity-50">
                  <span>Progress</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 w-full bg-[var(--ink)]/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="h-full bg-[var(--ink)]"
                  />
                </div>
              </div>
            )}

            {history.handles.size > 0 && (
              <div className="text-[10px] font-mono opacity-50 flex items-center gap-2">
                <CheckCircle2 size={12} className="text-emerald-500" />
                History Active: {history.handles.size} items
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="glass-card rounded-2xl shadow-sm overflow-hidden flex flex-col h-[600px]">
            <div className="p-4 border-b border-[var(--line)] flex justify-between items-center bg-white/50">
              <h3 className="text-sm font-semibold uppercase tracking-tight">Analysis Queue</h3>
              <span className="text-[10px] font-mono bg-[var(--ink)] text-[var(--bg)] px-2 py-0.5 rounded">
                {results.length} Folders
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[var(--bg)] z-10">
                    <tr className="border-b border-[var(--line)]">
                      <th className="p-4 text-[10px] font-mono uppercase opacity-50">Preview</th>
                      <th className="p-4 text-[10px] font-mono uppercase opacity-50">Folder / Handle</th>
                      <th className="p-4 text-[10px] font-mono uppercase opacity-50">Title (EN/CN)</th>
                      <th className="p-4 text-[10px] font-mono uppercase opacity-50">Status</th>
                    </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {results.map((res) => (
                      <motion.tr 
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={res.folderName} 
                        className="border-b border-[var(--line)] hover:bg-[var(--ink)]/5 transition-colors group"
                      >
                        <td className="p-4">
                          <div className="w-12 h-12 rounded bg-[var(--ink)]/5 flex items-center justify-center overflow-hidden border border-[var(--line)]">
                            {res.imageUrl ? (
                              <img src={res.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon size={16} className="opacity-20" />
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-xs font-bold">{res.folderName}</div>
                          <div className="text-[10px] font-mono opacity-50 truncate max-w-[150px]">
                            {res.handle || '---'}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-xs serif-italic truncate max-w-[200px]">
                            {res.title || '---'}
                          </div>
                          <div className="text-[10px] opacity-60 truncate max-w-[200px]">
                            {res.titleZh || '---'}
                          </div>
                        </td>
                        <td className="p-4">
                          {res.status === 'completed' && <CheckCircle2 size={16} className="text-emerald-500" />}
                          {res.status === 'processing' && <Loader2 size={16} className="animate-spin opacity-50" />}
                          {res.status === 'pending' && <div className="w-2 h-2 rounded-full bg-gray-300" />}
                          {res.status === 'error' && (
                            <div className="group relative">
                              <AlertCircle size={16} className="text-red-500" />
                              <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-red-500 text-white text-[10px] p-2 rounded shadow-lg whitespace-nowrap z-50">
                                {res.error}
                              </div>
                            </div>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                  {results.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-20 text-center opacity-30 italic text-sm">
                        No folders uploaded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
