import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  HarmonizerState, 
  HarmonizerWorkerMessage, 
  HarmonyChord, 
  HarmonySequence,
  MelodyNote,
  HarmonizerNote,
  midiToNoteName
} from '../types/harmonizer';

export const useHarmonizer = () => {
  const [state, setState] = useState<HarmonizerState>({
    isLoading: true,
    isReady: false,
    error: null,
    currentSequence: null,
    isPlaying: false
  });
  
  const [isRealTimeMode, setIsRealTimeMode] = useState(false);
  const [currentHarmony, setCurrentHarmony] = useState<HarmonyChord | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const sequenceRef = useRef<HarmonySequence | null>(null);

  // Handle received harmony from worker
  const handleHarmonyReceived = useCallback((notes: HarmonizerNote[]) => {
    if (notes.length < 4) return;

    const [soprano, alto, tenor, bass] = notes;
    const newChord: HarmonyChord = {
      soprano,
      alto,
      tenor,
      bass
    };

    // Always update current harmony for real-time display
    setCurrentHarmony(newChord);

    // Also add to current sequence if not in real-time mode
    if (!isRealTimeMode && sequenceRef.current) {
      const updatedSequence = {
        ...sequenceRef.current,
        harmonies: [...sequenceRef.current.harmonies, newChord]
      };
      sequenceRef.current = updatedSequence;
      
      setState(prev => ({
        ...prev,
        currentSequence: updatedSequence
      }));
    }
  }, [isRealTimeMode]);

  // Initialize the harmonizer worker
  useEffect(() => {
    const initializeHarmonizer = async () => {
      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        // Create the worker
        const worker = new Worker('/harmonizer/harmonizerworker.js');
        workerRef.current = worker;

        // Set up message handling
        worker.onmessage = (event: HarmonizerWorkerMessage) => {
          const { data } = event;
          
          if (data.type === 'Loaded') {
            setState(prev => ({
              ...prev,
              isLoading: false,
              isReady: true,
              error: null
            }));
          } else if (data.type === 'Notes' && data.notes) {
            handleHarmonyReceived(data.notes);
          }
        };

        worker.onerror = (error) => {
          setState(prev => ({
            ...prev,
            isLoading: false,
            isReady: false,
            error: `Harmonizer failed to load: ${error.message}`
          }));
        };

      } catch (error) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          isReady: false,
          error: error instanceof Error ? error.message : 'Failed to initialize harmonizer'
        }));
      }
    };

    initializeHarmonizer();

    // Cleanup
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [handleHarmonyReceived]);

  // Start a new harmony sequence
  const startNewSequence = useCallback((title: string = 'New Harmony') => {
    const newSequence: HarmonySequence = {
      id: Date.now().toString(),
      title,
      melody: [],
      harmonies: [],
      createdAt: new Date()
    };

    sequenceRef.current = newSequence;
    setState(prev => ({
      ...prev,
      currentSequence: newSequence
    }));

    return newSequence.id;
  }, []);

  // Add a single note to harmonize
  const harmonizeNote = useCallback((midiNote: number) => {
    if (!state.isReady || !workerRef.current) {
      throw new Error('Harmonizer not ready');
    }

    // Add to melody sequence
    if (sequenceRef.current) {
      const melodyNote: MelodyNote = {
        midiNote,
        noteName: midiToNoteName(midiNote),
        timestamp: Date.now()
      };

      const updatedSequence = {
        ...sequenceRef.current,
        melody: [...sequenceRef.current.melody, melodyNote]
      };
      
      sequenceRef.current = updatedSequence;
      setState(prev => ({
        ...prev,
        currentSequence: updatedSequence
      }));
    }

    // Send to worker for harmonization
    workerRef.current.postMessage({ note: midiNote });
  }, [state.isReady]);

  // Harmonize an entire melody sequence
  const harmonizeMelody = useCallback(async (
    melody: number[], 
    title: string = 'AI Harmony',
    delayBetweenNotes: number = 1000
  ) => {
    if (!state.isReady) {
      throw new Error('Harmonizer not ready');
    }

    setState(prev => ({ ...prev, isPlaying: true }));
    startNewSequence(title);

    try {
      for (let i = 0; i < melody.length; i++) {
        const note = melody[i];
        harmonizeNote(note);
        
        // Wait between notes (except for the last one)
        if (i < melody.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenNotes));
        }
      }
    } finally {
      setState(prev => ({ ...prev, isPlaying: false }));
    }
  }, [state.isReady, harmonizeNote, startNewSequence]);

  // Clear current sequence
  const clearSequence = useCallback(() => {
    sequenceRef.current = null;
    setState(prev => ({
      ...prev,
      currentSequence: null
    }));
  }, []);

  // Get harmony statistics
  const getStats = useCallback(() => {
    const sequence = state.currentSequence;
    if (!sequence) return null;

    return {
      totalNotes: sequence.melody.length,
      totalChords: sequence.harmonies.length,
      duration: sequence.melody.length > 0 
        ? (sequence.melody[sequence.melody.length - 1].timestamp - sequence.melody[0].timestamp) / 1000 
        : 0,
      averageNoteHeight: sequence.melody.length > 0
        ? sequence.melody.reduce((sum, note) => sum + note.midiNote, 0) / sequence.melody.length
        : 0
    };
  }, [state.currentSequence]);

  // Export current sequence as JSON
  const exportSequence = useCallback(() => {
    if (!state.currentSequence) return null;
    
    return JSON.stringify(state.currentSequence, null, 2);
  }, [state.currentSequence]);

  // Real-time harmonization functions
  const harmonizeNoteRealTime = useCallback((midiNote: number) => {
    if (!state.isReady || !workerRef.current) {
      throw new Error('Harmonizer not ready');
    }

    // Send to worker for harmonization
    workerRef.current.postMessage({ note: midiNote });
  }, [state.isReady]);

  const toggleRealTimeMode = useCallback(() => {
    setIsRealTimeMode(prev => !prev);
    // Clear current harmony when switching modes
    if (!isRealTimeMode) {
      setCurrentHarmony(null);
    }
  }, [isRealTimeMode]);

  const clearCurrentHarmony = useCallback(() => {
    setCurrentHarmony(null);
  }, []);

  return {
    // State
    isLoading: state.isLoading,
    isReady: state.isReady,
    isPlaying: state.isPlaying,
    error: state.error,
    currentSequence: state.currentSequence,
    
    // Real-time state
    isRealTimeMode,
    currentHarmony,
    
    // Actions
    harmonizeNote,
    harmonizeMelody,
    startNewSequence,
    clearSequence,
    
    // Real-time actions
    harmonizeNoteRealTime,
    toggleRealTimeMode,
    clearCurrentHarmony,
    
    // Utils
    getStats,
    exportSequence
  };
};
