import React, { useState } from 'react';
import { Header } from './components/Header';
import { AnalyzeMode } from './components/AnalyzeMode';
import { GenerateMode } from './components/GenerateMode';
import { AppMode, MODELS } from './types';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [mode, setMode] = useState<AppMode>('analyze');

  const currentModel = mode === 'analyze' 
    ? MODELS.find(m => m.id === 'gemini-3-flash-preview')
    : MODELS.find(m => m.id === 'gemini-3.1-flash-image-preview');

  return (
    <div className="min-h-screen flex flex-col">
      <Header 
        mode={mode} 
        setMode={setMode} 
        modelName={currentModel?.name || 'Unknown'} 
      />
      
      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {mode === 'analyze' ? <AnalyzeMode /> : <GenerateMode />}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="p-6 border-t border-[var(--line)] flex justify-between items-center text-[10px] font-mono uppercase opacity-40">
        <div>VisionCatalog Pro v1.0.0</div>
        <div className="flex gap-4">
          <span>System Status: Operational</span>
          <span>Latency: 240ms</span>
        </div>
      </footer>
    </div>
  );
}

