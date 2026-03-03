export type AppMode = 'analyze' | 'generate';

export interface ProductAnalysis {
  folderName: string;
  handle: string;
  title: string;
  titleZh: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  imageUrl?: string;
}

export interface GenerationTask {
  id: string;
  prompt: string;
  aspectRatio: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  resultUrl?: string;
  error?: string;
}

export interface GeminiModel {
  id: string;
  name: string;
  type: 'text' | 'image';
}

export const MODELS: GeminiModel[] = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Analysis)', type: 'text' },
  { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash Image (Generation)', type: 'image' },
];

declare global {
  interface Window {
    aistudio: {
      openSelectKey: () => Promise<void>;
      hasSelectedApiKey: () => Promise<boolean>;
    };
  }
}

