'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useHarmonizer } from '../../hooks/useHarmonizer';
import { audioEngine } from '../../utils/audioEngine';
import { midiToNoteName } from '../../types/harmonizer';
import type { HarmonyChord } from '../../types/harmonizer';

type HandPreference = 'left' | 'right' | null;

interface MediaPipeHands {
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  setOptions: (options: {
    maxNumHands: number;
    modelComplexity: number;
    minDetectionConfidence: number;
    minTrackingConfidence: number;
  }) => void;
  onResults: (callback: (results: HandResults) => void) => void;
}

interface Landmark {
  x: number;
  y: number;
  z?: number;
}

interface HandResults {
  multiHandLandmarks?: Landmark[][];
  multiHandedness?: Array<{ label: string }>;
}

declare global {
  interface Window {
    Hands: new (options: { locateFile: (file: string) => string }) => MediaPipeHands;
  }
}

interface HandPosition {
  x: number; // 0-1, left to right
  y: number; // 0-1, top to bottom (inverted for pitch)
  detected: boolean;
  vowel: 'A' | 'O' | 'NONE'; // Vowel based on hand gesture
}

interface VolumeHand {
  y: number; // 0-1, controls volume
  detected: boolean;
}

export default function HandGestureTracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<MediaPipeHands | null>(null);
  const lastPlayedNoteRef = useRef<number | null>(null);
  
  // All hooks must be declared before any conditional returns
  const [handPreference, setHandPreference] = useState<HandPreference>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Harmonizer integration
  const {
    isLoading: harmonizerLoading,
    isReady: harmonizerReady,
    error: harmonizerError,
    currentHarmony,
    harmonizeNoteRealTime,
    isRealTimeMode,
    toggleRealTimeMode
  } = useHarmonizer();
  
  // Control hand (dominant hand) - pitch and vowel
  const [controlHand, setControlHand] = useState<HandPosition>({
    x: 0.5,
    y: 0.5,
    detected: false,
    vowel: 'NONE'
  });
  
  // Volume hand (non-dominant hand) - volume control
  const [volumeHand, setVolumeHand] = useState<VolumeHand>({
    y: 0.5,
    detected: false
  });
  

  // Convert Y position to pitch (inverted: top = high pitch)
  const getPitchFromY = useCallback((y: number): number => {
    return Math.max(0, Math.min(1, 1 - y)); // Invert Y axis
  }, []);

  // Convert Y position to volume (inverted: top = high volume)
  const getVolumeFromY = useCallback((y: number): number => {
    return Math.max(0, Math.min(1, 1 - y)); // Invert Y axis
  }, []);

  // Convert pitch (0-1) to MIDI note in C4 to E5 range - WHITE KEYS ONLY
  const pitchToMidi = useCallback((pitch: number): number => {
    // White key patterns for each octave (C, D, E, F, G, A, B)
    const whiteKeyPattern = [0, 2, 4, 5, 7, 9, 11]; // Semitone offsets from C
    
    // Fixed range: C4 to E5 (C4=60, D4=62, E4=64, F4=65, G4=67, A4=69, B4=71, C5=72, D5=74, E5=76)
    const whiteKeys: number[] = [];
    
    // C4 to E5 covers octaves 4 and 5
    for (let octave = 4; octave <= 5; octave++) {
      const startIdx = (octave === 4) ? 0 : 0; // Start from C for both octaves
      const endIdx = (octave === 5) ? 2 : 6;   // End at E for octave 5, B for octave 4
      
      for (let noteIdx = startIdx; noteIdx <= endIdx; noteIdx++) {
        const midiNote = (octave + 1) * 12 + whiteKeyPattern[noteIdx];
        whiteKeys.push(midiNote);
      }
    }
    
    // Map pitch (0-1) to discrete white key index
    const keyIndex = Math.floor(pitch * (whiteKeys.length - 1));
    return whiteKeys[keyIndex];
  }, []);

  // Use the imported midiToNoteName function from harmonizer types


  // Detect vowel based on hand gesture
  const detectVowel = useCallback((landmarks: Landmark[]): 'A' | 'O' | 'NONE' => {
    if (!landmarks || landmarks.length < 21) return 'NONE';
    
    // Check for open palm (A) - all fingers extended
    const fingers = [
      { tip: landmarks[8], pip: landmarks[6] },   // Index
      { tip: landmarks[12], pip: landmarks[10] }, // Middle
      { tip: landmarks[16], pip: landmarks[14] }, // Ring
      { tip: landmarks[20], pip: landmarks[18] }  // Pinky
    ];
    
    const extendedFingers = fingers.filter(finger => finger.tip.y < finger.pip.y).length;
    
    // Check for fist (O) - all fingers folded
    const foldedFingers = fingers.filter(finger => finger.tip.y > finger.pip.y).length;
    
    if (extendedFingers >= 3) return 'A'; // Open palm
    if (foldedFingers >= 3) return 'O';   // Fist
    return 'NONE'; // Unclear gesture
  }, []);

  const onResults = useCallback((results: HandResults) => {
    if (!canvasRef.current || !videoRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video frame
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      let controlHandData: HandPosition | null = null;
      let volumeHandData: VolumeHand | null = null;

      // Process each detected hand
      results.multiHandLandmarks.forEach((landmarks: Landmark[], handIndex: number) => {
        const handedness = results.multiHandedness?.[handIndex]?.label || 'Unknown';
        const isRightHand = handedness === 'Right';
        const isLeftHand = handedness === 'Left';
        
        // Determine which hand is which based on user preference
        // Note: Due to camera mirroring, we need to flip the hand detection
        const isControlHand = (handPreference === 'right' && isLeftHand) || 
                              (handPreference === 'left' && isRightHand);
        const isVolumeHand = (handPreference === 'right' && isRightHand) || 
                             (handPreference === 'left' && isLeftHand);

        // Draw hand landmarks with different colors
        landmarks.forEach((landmark: Landmark, index: number) => {
          const x = landmark.x * canvas.width;
          const y = landmark.y * canvas.height;
          
          ctx.beginPath();
          ctx.arc(x, y, index === 8 ? 8 : 4, 0, 2 * Math.PI);
          
          if (isControlHand) {
            ctx.fillStyle = index === 8 ? '#FF0000' : '#00FF00'; // Red for index finger, green for others
          } else if (isVolumeHand) {
            ctx.fillStyle = index === 8 ? '#FF00FF' : '#00FFFF'; // Magenta for index finger, cyan for others
          } else {
            ctx.fillStyle = '#FFFF00'; // Yellow for unassigned hands
          }
          
          ctx.fill();
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 2;
          ctx.stroke();
        });

        // Draw hand connections
        const connections = [
          [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
          [0, 5], [5, 6], [6, 7], [7, 8], // Index
          [0, 17], [5, 9], [9, 10], [10, 11], [11, 12], // Middle
          [9, 13], [13, 14], [14, 15], [15, 16], // Ring
          [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
        ];

        ctx.strokeStyle = isControlHand ? '#00FF00' : isVolumeHand ? '#00FFFF' : '#FFFF00';
        ctx.lineWidth = 2;
        connections.forEach(([start, end]) => {
          const startPoint = landmarks[start];
          const endPoint = landmarks[end];
          
          if (startPoint && endPoint) {
            const x1 = startPoint.x * canvas.width;
            const y1 = startPoint.y * canvas.height;
            const x2 = endPoint.x * canvas.width;
            const y2 = endPoint.y * canvas.height;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        });

        // Store hand data
        if (isControlHand) {
          const indexTip = landmarks[8];
          controlHandData = {
            x: indexTip.x,
            y: indexTip.y,
            detected: true,
            vowel: detectVowel(landmarks)
          };
        } else if (isVolumeHand) {
          const indexTip = landmarks[8];
          volumeHandData = {
            y: indexTip.y,
            detected: true
          };
        }
      });

      // Update hand states
      if (controlHandData) {
        setControlHand(controlHandData);
        
        // Draw pitch indicator line across full width
        const pitchY = (controlHandData as HandPosition).y * canvas.height;
        ctx.strokeStyle = '#FFD700'; // Gold color for pitch indicator
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, pitchY);
        ctx.lineTo(canvas.width, pitchY);
        ctx.stroke();

        // Draw vowel indicator in center
        if ((controlHandData as HandPosition).vowel !== 'NONE') {
          ctx.font = 'bold 48px Arial';
          ctx.fillStyle = '#FFD700';
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 4;
          const vowelText = (controlHandData as HandPosition).vowel;
          const textWidth = ctx.measureText(vowelText).width;
          const textX = (canvas.width - textWidth) / 2;
          const textY = pitchY - 30;
          
          ctx.strokeText(vowelText, textX, textY);
          ctx.fillText(vowelText, textX, textY);
        }
      } else {
        setControlHand(prev => ({ ...prev, detected: false, vowel: 'NONE' }));
      }

      if (volumeHandData) {
        setVolumeHand(volumeHandData);
      } else {
        setVolumeHand(prev => ({ ...prev, detected: false }));
      }

    } else {
      setControlHand(prev => ({ ...prev, detected: false, vowel: 'NONE' }));
      setVolumeHand(prev => ({ ...prev, detected: false }));
    }
  }, [detectVowel, handPreference]);

  useEffect(() => {
    const initializeCamera = async () => {
      try {
        if (!videoRef.current || !canvasRef.current) return;
        
        // Get user media (camera)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: 'user'
          }
        });
        
        videoRef.current.srcObject = stream;
        
        // Load MediaPipe Hands with timeout and error handling
        const loadScript = (src: string): Promise<void> => {
          return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
            
            // Timeout after 10 seconds
            setTimeout(() => reject(new Error(`Timeout loading ${src}`)), 10000);
          });
        };

        try {
          console.log('Loading MediaPipe...');
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@latest/hands.js');
          console.log('MediaPipe loaded successfully');
          
          // Initialize MediaPipe Hands
          const hands = new window.Hands({
            locateFile: (file: string) => {
              return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
          });
          
          hands.setOptions({
            maxNumHands: 2, // Track both hands
            modelComplexity: 0,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.5
          });
          
          hands.onResults(onResults);
          handsRef.current = hands;
          
          // Process video frames
          const processFrame = async () => {
            if (videoRef.current && videoRef.current.readyState === 4 && handsRef.current) {
              try {
                await handsRef.current.send({ image: videoRef.current });
              } catch (err) {
                console.warn('Frame processing error:', err);
              }
            }
            requestAnimationFrame(processFrame);
          };
          
          // Start processing once video is loaded
          videoRef.current!.onloadeddata = () => {
            console.log('Video loaded, starting hand detection...');
            setIsLoading(false);
            processFrame();
          };
          
        } catch (err) {
          console.error('MediaPipe loading error:', err);
          setError('MediaPipe failed to load. Please check your internet connection and try refreshing.');
          setIsLoading(false);
        }
        
        videoRef.current.onloadedmetadata = () => {
          videoRef.current!.play();
        };
        
      } catch (err) {
        console.error('Error initializing camera:', err);
        setError('Failed to access camera. Please ensure camera permissions are granted.');
        setIsLoading(false);
      }
    };

    if (handPreference) {
      initializeCamera();
    }

    // Cleanup function
    return () => {
      // No cleanup needed for UI-only functionality
    };
  }, [onResults, handPreference]);

  const currentPitch = controlHand.detected ? getPitchFromY(controlHand.y) : 0;
  const currentVolume = volumeHand.detected ? getVolumeFromY(volumeHand.y) : 0.5;
  
  // Enable real-time mode automatically when harmonizer is ready
  useEffect(() => {
    if (harmonizerReady && !isRealTimeMode) {
      toggleRealTimeMode();
    }
  }, [harmonizerReady, isRealTimeMode, toggleRealTimeMode]);
  
  // Play audio when harmony changes
  useEffect(() => {
    if (currentHarmony) {
      audioEngine.playChord(
        currentHarmony.soprano.midiNote,
        currentHarmony.alto.midiNote,
        currentHarmony.tenor.midiNote,
        currentHarmony.bass.midiNote
      ).catch(error => {
        console.error('Audio playback failed:', error);
      });
    }
  }, [currentHarmony]);
  
  // Apply volume control from volume hand
  useEffect(() => {
    try {
      // Use detected volume hand position, fallback to default 50%
      const targetVolume = volumeHand.detected ? currentVolume : 0.5;
      audioEngine.setMasterVolume(targetVolume);
    } catch (err) {
      console.error('Failed to set audio volume:', err);
    }
  }, [volumeHand.detected, currentVolume]);
  
  // Trigger harmonization when control hand position changes
  useEffect(() => {
    if (controlHand.detected && harmonizerReady && controlHand.vowel !== 'NONE') {
      const currentMidiNote = pitchToMidi(currentPitch);
      
      // Only harmonize if the note has changed to avoid excessive processing
      if (currentMidiNote !== lastPlayedNoteRef.current) {
        try {
          harmonizeNoteRealTime(currentMidiNote);
          lastPlayedNoteRef.current = currentMidiNote;
        } catch (err) {
          console.error('Failed to harmonize note:', err);
        }
      }
    } else if (!controlHand.detected || controlHand.vowel === 'NONE') {
      // Stop audio when hand is not detected or no gesture
      audioEngine.stopAll();
      lastPlayedNoteRef.current = null;
    }
  }, [controlHand.detected, controlHand.vowel, currentPitch, harmonizerReady, harmonizeNoteRealTime, pitchToMidi]);
  
  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioEngine.destroy();
    };
  }, []);

  // Hand preference selection page
  if (handPreference === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 flex items-center justify-center relative overflow-hidden">
        {/* Liquid glass background orbs */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-br from-cyan-400/25 via-blue-400/15 to-indigo-400/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-gradient-to-br from-violet-400/20 via-purple-400/12 to-pink-400/8 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
          <div className="absolute top-1/2 right-1/3 w-72 h-72 bg-gradient-to-br from-emerald-400/15 via-teal-400/10 to-cyan-400/8 rounded-full blur-2xl animate-pulse" style={{animationDelay: '4s'}}></div>
        </div>
        
        {/* Liquid glass shimmer overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent animate-pulse opacity-80"></div>
        
        <div className="relative z-10 text-center p-12 bg-white/10 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl max-w-lg border border-white/20">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/5 via-blue-400/10 to-violet-400/5 rounded-[2.5rem]"></div>
          <div className="relative">
            <h1 className="text-5xl font-light text-white mb-3 tracking-tight drop-shadow-lg">
              Motion
              <br />
              <span className="font-normal bg-gradient-to-r from-cyan-300 via-blue-300 to-violet-300 bg-clip-text text-transparent">Wave</span>
            </h1>
            <p className="text-white/80 mb-10 text-lg font-light">Choose your dominant hand for gesture control</p>
            
            <div className="space-y-4">
              <button
                onClick={() => setHandPreference('right')}
                className="group w-full p-8 bg-white/10 backdrop-blur-2xl border border-white/20 hover:border-cyan-300/50 text-white rounded-[1.5rem] font-light text-xl transition-all duration-500 transform hover:scale-[1.02] shadow-xl relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/10 via-blue-400/5 to-violet-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[1.5rem]"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/5 via-blue-400/8 to-indigo-400/5 rounded-[1.5rem]"></div>
                <div className="relative flex items-center justify-center space-x-4">
                  <span className="text-3xl">👋</span>
                  <div className="text-left">
                    <div className="text-xl">Right Handed</div>
                    <div className="text-sm text-white/60 font-light">Right hand controls gesture detection</div>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => setHandPreference('left')}
                className="group w-full p-8 bg-white/10 backdrop-blur-2xl border border-white/20 hover:border-violet-300/50 text-white rounded-[1.5rem] font-light text-xl transition-all duration-500 transform hover:scale-[1.02] shadow-xl relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-violet-400/10 via-purple-400/5 to-pink-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[1.5rem]"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-violet-400/5 via-purple-400/8 to-pink-400/5 rounded-[1.5rem]"></div>
                <div className="relative flex items-center justify-center space-x-4">
                  <span className="text-3xl">🤚</span>
                  <div className="text-left">
                    <div className="text-xl">Left Handed</div>
                    <div className="text-sm text-white/60 font-light">Left hand controls gesture detection</div>
                  </div>
                </div>
              </button>
            </div>
            
            <div className="mt-10 p-6 bg-white/5 backdrop-blur-xl rounded-[1.5rem] border border-white/15 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/5 via-teal-400/8 to-cyan-400/5 rounded-[1.5rem]"></div>
              <div className="relative">
                <p className="text-white/80 text-sm font-light">
                  <strong className="text-cyan-300 font-medium">Gesture Detection</strong><br/>
                  <span className="text-white/70">• Dominant hand: Pitch and vowel gestures</span><br/>
                  <span className="text-white/70">• Other hand: Volume control gestures</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 flex items-center justify-center relative overflow-hidden">
        {/* Liquid glass background orbs */}
        <div className="absolute inset-0">
          <div className="absolute top-1/3 left-1/4 w-80 h-80 bg-gradient-to-br from-red-400/20 via-rose-400/12 to-pink-400/8 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-violet-500/8 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>
        
        {/* Liquid glass shimmer overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent animate-pulse opacity-70"></div>
        
        <div className="relative z-10 text-center p-12 bg-white/10 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl max-w-lg border border-white/20">
          <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-rose-400/8 to-pink-400/5 rounded-[2.5rem]"></div>
          <div className="relative">
            <h1 className="text-4xl font-light text-rose-300 mb-4 tracking-tight drop-shadow-lg">Error</h1>
            <p className="text-white/80 font-light text-lg mb-4">{error}</p>
            <p className="text-sm text-white/60 font-light mb-8">
              Make sure you&apos;ve granted camera permissions and are using HTTPS
            </p>
            <button 
              onClick={() => setHandPreference(null)}
              className="px-8 py-4 bg-white/10 backdrop-blur-2xl border border-white/20 hover:border-rose-300/50 text-white rounded-[1.5rem] font-light text-lg transition-all duration-500 transform hover:scale-[1.02] shadow-xl relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-rose-400/10 via-pink-400/5 to-red-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[1.5rem]"></div>
              <span className="relative">Back to Hand Selection</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 text-white relative overflow-hidden">
      {/* Liquid glass background orbs */}
      <div className="absolute inset-0">
        <div className="absolute top-1/6 left-1/5 w-96 h-96 bg-gradient-to-br from-cyan-400/20 via-blue-400/15 to-indigo-400/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/6 w-80 h-80 bg-gradient-to-br from-violet-400/15 via-purple-400/10 to-pink-400/8 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-2/3 left-1/3 w-72 h-72 bg-gradient-to-br from-emerald-400/12 via-teal-400/8 to-cyan-400/6 rounded-full blur-3xl animate-pulse" style={{animationDelay: '4s'}}></div>
        <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-gradient-to-br from-rose-400/10 via-pink-400/8 to-purple-400/6 rounded-full blur-2xl animate-pulse" style={{animationDelay: '6s'}}></div>
      </div>
      
      {/* Liquid glass shimmer overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse opacity-60"></div>
      
      <div className="relative z-10 max-w-7xl mx-auto p-6 h-screen flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-4xl font-light text-white tracking-tight drop-shadow-lg">
            Motion <span className="font-normal bg-gradient-to-r from-cyan-300 via-blue-300 to-violet-300 bg-clip-text text-transparent">Wave</span>
          </h1>
          <button 
            onClick={() => setHandPreference(null)}
            className="px-6 py-3 bg-white/10 backdrop-blur-xl hover:bg-white/20 border border-white/30 hover:border-cyan-300/50 rounded-2xl text-sm font-light transition-all duration-500 relative overflow-hidden group shadow-lg hover:shadow-cyan-400/20"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/10 via-blue-400/5 to-violet-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <span className="relative">Change Hand</span>
          </button>
        </div>
        
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="p-10 bg-white/10 backdrop-blur-2xl rounded-[2rem] border border-white/20 relative overflow-hidden shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/5 via-blue-400/10 to-violet-400/5"></div>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse"></div>
              <div className="relative text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-cyan-400/30 border-t-cyan-400 mb-6 shadow-lg"></div>
                <p className="text-white/90 font-light text-lg">Initializing camera and hand tracking...</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Main Content Area */}
        <div className="flex-1 flex items-center justify-center gap-6">
          {/* Camera Feed - Much Larger */}
          <div className="relative bg-white/5 backdrop-blur-2xl rounded-[2rem] overflow-hidden w-full max-w-5xl aspect-video border border-white/20 shadow-2xl">
            {/* Liquid glass overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/5 via-blue-400/10 to-violet-400/5 z-10 pointer-events-none"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse z-10 pointer-events-none"></div>
            
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover rounded-[2rem]"
              style={{ transform: 'scaleX(-1)' }}
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className="relative z-20 w-full h-full rounded-[2rem]"
              style={{ transform: 'scaleX(-1)' }}
            />
          </div>
          
          {/* Compact Side Panel */}
          <div className="w-80 space-y-3">
            {/* SATB Harmony Display */}
            <div className="p-6 bg-white/10 backdrop-blur-2xl rounded-[1.5rem] border border-white/20 relative overflow-hidden shadow-xl">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/5 via-blue-400/8 to-violet-400/5"></div>
              <div className="relative">
                <div className="text-white/60 text-sm font-light mb-4 text-center">SATB Harmony</div>
                {currentHarmony ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 bg-white/5 rounded-lg">
                      <div className="text-xs font-medium text-red-300 mb-1">Soprano</div>
                      <div className="text-lg font-light text-white">
                        {midiToNoteName(currentHarmony.soprano.midiNote)}
                      </div>
                    </div>
                    <div className="text-center p-3 bg-white/5 rounded-lg">
                      <div className="text-xs font-medium text-teal-300 mb-1">Alto</div>
                      <div className="text-lg font-light text-white">
                        {midiToNoteName(currentHarmony.alto.midiNote)}
                      </div>
                    </div>
                    <div className="text-center p-3 bg-white/5 rounded-lg">
                      <div className="text-xs font-medium text-blue-300 mb-1">Tenor</div>
                      <div className="text-lg font-light text-white">
                        {midiToNoteName(currentHarmony.tenor.midiNote)}
                      </div>
                    </div>
                    <div className="text-center p-3 bg-white/5 rounded-lg">
                      <div className="text-xs font-medium text-green-300 mb-1">Bass</div>
                      <div className="text-lg font-light text-white">
                        {midiToNoteName(currentHarmony.bass.midiNote)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    {harmonizerLoading ? (
                      <div className="text-sm text-white/60">Loading harmonizer...</div>
                    ) : harmonizerError ? (
                      <div className="text-sm text-red-300">Harmonizer error</div>
                    ) : controlHand.detected && controlHand.vowel !== 'NONE' ? (
                      <div className="text-sm text-white/60">Generating harmony...</div>
                    ) : (
                      <div className="text-sm text-white/40">
                        Make a gesture to generate harmony!
                      </div>
                    )}
                  </div>
                )}
                
                {/* Current melody note indicator */}
                {controlHand.detected && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="text-center">
                      <div className="text-xs text-white/50 mb-1">Melody Note</div>
                      <div className="text-xl font-light text-cyan-300">
                        ♪ {midiToNoteName(pitchToMidi(currentPitch))}
                      </div>
                      <div className="text-xs text-white/40">
                        {(currentPitch * 100).toFixed(0)}% pitch
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Volume Display */}
            <div className="p-6 bg-white/10 backdrop-blur-2xl rounded-[1.5rem] border border-white/20 relative overflow-hidden shadow-xl">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/5 via-teal-400/8 to-cyan-400/5"></div>
              <div className="relative text-center">
                <div className="text-white/60 text-sm font-light mb-3 flex items-center justify-center gap-2">
                  <span className="text-lg">🔊</span>
                  Volume
                </div>
                
                {/* Enhanced Volume Bar */}
                <div className="relative w-full h-4 bg-white/10 rounded-full overflow-hidden mb-3 shadow-inner">
                  {/* Background glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-cyan-500/20 rounded-full"></div>
                  
                  {/* Animated volume fill */}
                  <div 
                    className={`h-full transition-all duration-500 ease-out rounded-full relative overflow-hidden ${
                      volumeHand.detected 
                        ? currentVolume < 0.3 
                          ? 'bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400' 
                          : currentVolume < 0.7 
                          ? 'bg-gradient-to-r from-yellow-400 via-green-400 to-cyan-400' 
                          : 'bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400'
                        : 'bg-gradient-to-r from-gray-400 to-gray-500'
                    }`}
                    style={{ width: `${volumeHand.detected ? (currentVolume * 100) : 50}%` }}
                  >
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
                    
                    {/* Volume level indicator dot */}
                    {volumeHand.detected && currentVolume > 0.05 && (
                      <div className="absolute right-1 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-lg animate-pulse"></div>
                    )}
                  </div>
                  
                  {/* Volume level markers */}
                  <div className="absolute inset-0 flex items-center justify-between px-1">
                    {[0.25, 0.5, 0.75].map((marker, index) => (
                      <div 
                        key={index}
                        className={`w-0.5 h-2 rounded-full transition-colors duration-300 ${
                          (volumeHand.detected ? currentVolume : 0.5) >= marker 
                            ? 'bg-white/60' 
                            : 'bg-white/20'
                        }`}
                        style={{ left: `${marker * 100}%` }}
                      />
                    ))}
                  </div>
                </div>
                
                {/* Volume percentage with dynamic styling */}
                <div className="flex items-center justify-center gap-2">
                  <div className={`text-lg font-light transition-colors duration-300 ${
                    volumeHand.detected 
                      ? currentVolume < 0.3 
                        ? 'text-red-300' 
                        : currentVolume < 0.7 
                        ? 'text-yellow-300' 
                        : 'text-cyan-300'
                      : 'text-white/60'
                  }`}>
                    {volumeHand.detected ? `${(currentVolume * 100).toFixed(0)}%` : '50%'}
                  </div>
                  
                  {/* Dynamic volume icon based on level */}
                  <div className="text-xs">
                    {volumeHand.detected ? (
                      currentVolume < 0.1 ? '🔇' :
                      currentVolume < 0.3 ? '🔉' :
                      currentVolume < 0.7 ? '🔊' : '📢'
                    ) : '🔊'}
                  </div>
                </div>
                
                {/* Volume status indicator */}
                <div className="mt-2 text-xs text-white/40">
                  {volumeHand.detected ? (
                    <span className="flex items-center justify-center gap-1">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                      Hand detected
                    </span>
                  ) : (
                    'Default volume'
                  )}
                </div>
              </div>
            </div>
            
            {/* Vowel Display */}
            <div className="p-6 bg-white/10 backdrop-blur-2xl rounded-[1.5rem] border border-white/20 relative overflow-hidden shadow-xl">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-400/5 via-pink-400/8 to-purple-400/5"></div>
              <div className="relative text-center">
                <div className="text-white/60 text-sm font-light mb-2">Vowel</div>
                <div className={`text-2xl font-light ${
                  controlHand.vowel === 'A' ? 'text-cyan-300' : 
                  controlHand.vowel === 'O' ? 'text-violet-300' : 'text-white/40'
                }`}>
                  {controlHand.vowel !== 'NONE' ? controlHand.vowel : '---'}
                </div>
                <div className="text-xs text-white/50 mt-1">
                  {controlHand.vowel === 'A' ? 'Open palm' : 
                   controlHand.vowel === 'O' ? 'Closed fist' : 'No gesture'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
