import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Image as ImageIcon, Download, Play, Square, Loader2, FileSpreadsheet, CheckCircle2, AlertCircle, Grid } from 'lucide-react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { GenerationTask } from '../types';
import { callGeminiWithRetry, generateProductImage } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';

const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
];

export const GenerateMode: React.FC = () => {
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  const [progress, setProgress] = useState(0);

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<any>(worksheet);

      const newTasks: GenerationTask[] = json.map((row, idx) => ({
        id: `task-${idx}-${Date.now()}`,
        prompt: row.Prompt || row.prompt || row.text || '',
        aspectRatio: selectedRatio,
        status: 'pending' as const
      })).filter(t => t.prompt);

      setTasks(newTasks);
    };
    reader.readAsArrayBuffer(file);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv']
    },
    multiple: false
  } as any);

  const startGeneration = async () => {
    setIsGenerating(true);
    let completed = 0;

    for (const task of tasks) {
      if (task.status === 'completed') {
        completed++;
        continue;
      }

      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'processing' } : t));

      try {
        const imageUrl = await callGeminiWithRetry(() => 
          generateProductImage(
            process.env.GEMINI_API_KEY || '',
            'gemini-3.1-flash-image-preview',
            task.prompt,
            selectedRatio
          )
        );

        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'completed', resultUrl: imageUrl } : t));
      } catch (error: any) {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'error', error: error.message } : t));
      }

      completed++;
      setProgress(Math.round((completed / tasks.length) * 100));
    }

    setIsGenerating(false);
  };

  const downloadAllAsZip = async () => {
    const zip = new JSZip();
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.resultUrl);

    for (let i = 0; i < completedTasks.length; i++) {
      const task = completedTasks[i];
      const base64Data = task.resultUrl!.split(',')[1];
      zip.file(`product_${i + 1}.png`, base64Data, { base64: true });
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `VisionCatalog_Generated_${Date.now()}.zip`;
    link.click();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar: Config */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6 rounded-2xl shadow-sm space-y-6">
            <h2 className="text-lg font-semibold uppercase tracking-tight flex items-center gap-2">
              <Grid size={20} />
              Batch Config
            </h2>

            <div className="space-y-3">
              <label className="text-[10px] font-mono uppercase opacity-50">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                {ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio.value}
                    onClick={() => setSelectedRatio(ratio.value)}
                    className={`py-2 rounded-lg text-xs font-mono transition-all border ${
                      selectedRatio === ratio.value
                        ? 'bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]'
                        : 'border-[var(--line)] hover:bg-[var(--ink)]/5'
                    }`}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
            </div>

            <div {...getRootProps()} className={`
              p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer
              ${isDragActive ? 'border-[var(--ink)] bg-[var(--ink)]/5' : 'border-[var(--line)] hover:bg-[var(--ink)]/5'}
            `}>
              <input {...getInputProps()} />
              <FileSpreadsheet className="opacity-40" size={32} />
              <span className="text-xs font-medium opacity-60 text-center">
                {tasks.length > 0 ? `${tasks.length} Prompts Loaded` : 'Drop Excel/CSV here'}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={startGeneration}
                disabled={tasks.length === 0 || isGenerating}
                className="flex-1 bg-[var(--ink)] text-[var(--bg)] py-3 rounded-xl flex items-center justify-center gap-2 font-medium hover:opacity-90 transition-opacity disabled:opacity-30"
              >
                {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                Generate
              </button>
              <button
                onClick={downloadAllAsZip}
                disabled={tasks.filter(t => t.status === 'completed').length === 0 || isGenerating}
                className="px-4 bg-white border border-[var(--line)] rounded-xl flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-30"
              >
                <Download size={18} />
              </button>
            </div>

            {isGenerating && (
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
          </div>
        </div>

        {/* Main: Gallery */}
        <div className="lg:col-span-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {tasks.map((task) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  key={task.id}
                  className="glass-card rounded-xl overflow-hidden flex flex-col group relative"
                >
                  <div className={`aspect-[${selectedRatio.replace(':', '/')}] bg-[var(--ink)]/5 flex items-center justify-center relative overflow-hidden`}>
                    {task.resultUrl ? (
                      <img src={task.resultUrl} alt="Generated" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 opacity-20">
                        {task.status === 'processing' ? (
                          <Loader2 size={32} className="animate-spin" />
                        ) : (
                          <ImageIcon size={32} />
                        )}
                        <span className="text-[10px] uppercase font-mono tracking-widest">
                          {task.status}
                        </span>
                      </div>
                    )}
                    
                    {/* Status Overlay */}
                    <div className="absolute top-2 right-2">
                      {task.status === 'completed' && <CheckCircle2 size={16} className="text-emerald-500 bg-white rounded-full" />}
                      {task.status === 'error' && (
                        <div className="group/err relative">
                          <AlertCircle size={16} className="text-red-500 bg-white rounded-full" />
                          <div className="absolute bottom-full right-0 mb-2 hidden group-hover/err:block bg-red-500 text-white text-[10px] p-2 rounded shadow-lg z-50 w-48">
                            {task.error}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-3 bg-white/50">
                    <p className="text-[10px] font-mono opacity-50 line-clamp-2 leading-relaxed">
                      {task.prompt}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {tasks.length === 0 && (
              <div className="col-span-full py-32 flex flex-col items-center justify-center opacity-20 border-2 border-dashed border-[var(--line)] rounded-2xl">
                <ImageIcon size={48} />
                <p className="mt-4 serif-italic text-lg">Upload prompts to begin generation</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
