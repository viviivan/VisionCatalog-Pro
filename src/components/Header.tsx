import React from 'react';
import { Layout, Zap, ExternalLink, Key } from 'lucide-react';
import { AppMode } from '../types';

interface HeaderProps {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  modelName: string;
}

export const Header: React.FC<HeaderProps> = ({ mode, setMode, modelName }) => {
  const handleOpenKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--line)] bg-[var(--bg)]/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[var(--ink)] text-[var(--bg)] flex items-center justify-center rounded-lg">
          <Layout size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight uppercase">VisionCatalog <span className="serif-italic lowercase font-normal opacity-70">Pro</span></h1>
          <div className="flex items-center gap-2 text-[10px] font-mono opacity-50 uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Active Model: {modelName}
          </div>
        </div>
      </div>

      <nav className="flex items-center gap-1 bg-[var(--ink)]/5 p-1 rounded-xl">
        <button
          onClick={() => setMode('analyze')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === 'analyze' 
              ? 'bg-[var(--ink)] text-[var(--bg)] shadow-lg' 
              : 'hover:bg-[var(--ink)]/10'
          }`}
        >
          Analyze
        </button>
        <button
          onClick={() => setMode('generate')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === 'generate' 
              ? 'bg-[var(--ink)] text-[var(--bg)] shadow-lg' 
              : 'hover:bg-[var(--ink)]/10'
          }`}
        >
          Generate
        </button>
      </nav>

      <div className="flex items-center gap-4">
        <button 
          onClick={handleOpenKey}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--ink)]/20 hover:bg-[var(--ink)]/5 transition-colors text-xs font-medium"
        >
          <Key size={14} />
          API Key
        </button>
        <a 
          href="https://ai.google.dev/gemini-api/docs/billing" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-all shadow-md hover:shadow-indigo-500/20"
        >
          <Zap size={16} fill="currentColor" />
          Upgrade
          <ExternalLink size={14} />
        </a>
      </div>
    </header>
  );
};
