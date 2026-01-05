'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useHarmonizer } from '../../hooks/useHarmonizer';
import { audioEngine } from '../../utils/audioEngine';
import { midiToNoteName } from '../../types/harmonizer';
import AboutModal from './AboutModal';

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

interface HandGestureTrackerProps {
  initialHandPreference: HandPreference;
  onBack: () => void;
}

export default function HandGestureTracker({ initialHandPreference, onBack }: HandGestureTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<MediaPipeHands | null>(null);
  const lastPlayedNoteRef = useRef<number | null>(null);

  // All hooks must be declared before any conditional returns
  const [handPreference, setHandPreference] = useState<HandPreference>(initialHandPreference);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

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

    // Filter out any undefined landmarks before processing
    const validFingers = fingers.filter(finger => finger.tip && finger.pip);
    if (validFingers.length < 3) return 'NONE'; // Need at least 3 valid fingers

    const extendedFingers = validFingers.filter(finger => finger.tip.y < finger.pip.y).length;

    // Check for fist (O) - all fingers folded
    const foldedFingers = validFingers.filter(finger => finger.tip.y > finger.pip.y).length;

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

        // Draw hand landmarks with different colors - Updated for Beige Theme
        landmarks.forEach((landmark: Landmark, index: number) => {
          const x = landmark.x * canvas.width;
          const y = landmark.y * canvas.height;

          ctx.beginPath();
          ctx.arc(x, y, index === 8 ? 8 : 4, 0, 2 * Math.PI);

          // High contrast colors for beige background
          if (isControlHand) {
            ctx.fillStyle = index === 8 ? '#000000' : '#333333'; // Black tip, dark grey joints
          } else if (isVolumeHand) {
            ctx.fillStyle = index === 8 ? '#444444' : '#666666'; // Dark grey tip, medium grey joints
          } else {
            ctx.fillStyle = '#999999'; // Light grey for unassigned
          }

          ctx.fill();
          ctx.strokeStyle = '#F5F5DC'; // Beige border to separate from lines
          ctx.lineWidth = 2;
          ctx.stroke();
        });

        // Draw hand connections
        // Hand connections - Darker for visibility on beige
        const connections = [
          [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
          [0, 5], [5, 6], [6, 7], [7, 8], // Index
          [0, 17], [5, 9], [9, 10], [10, 11], [11, 12], // Middle
          [9, 13], [13, 14], [14, 15], [15, 16], // Ring
          [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
        ];

        ctx.strokeStyle = isControlHand ? '#000000' : isVolumeHand ? '#444444' : '#999999';
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
        if (isControlHand && landmarks.length > 8) {
          const indexTip = landmarks[8];
          if (indexTip) {
            controlHandData = {
              x: indexTip.x,
              y: indexTip.y,
              detected: true,
              vowel: detectVowel(landmarks)
            };
          }
        } else if (isVolumeHand && landmarks.length > 8) {
          const indexTip = landmarks[8];
          if (indexTip) {
            volumeHandData = {
              y: indexTip.y,
              detected: true
            };
          }
        }
      });

      // Update hand states
      if (controlHandData) {
        setControlHand(controlHandData);

        // REMOVED Pitch indicator line drawing here

        // REMOVED Vowel indicator drawing here
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

  // Hand preference selection page - REMOVED (Handled by parent)
  // if (handPreference === null) { ... } code block removed

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F5DC] flex items-center justify-center relative overflow-hidden font-serif italic">
        <div className="absolute inset-0 bg-noise pointer-events-none z-0"></div>

        <div className="relative z-10 text-center p-12 border border-black/20 rounded-[2.5rem] bg-white/20 backdrop-blur-sm max-w-lg shadow-xl">
          <div className="relative">
            <h1 className="text-4xl text-black mb-4 tracking-tight">Error</h1>
            <p className="text-black/80 text-lg mb-4 not-italic">{error}</p>
            <p className="text-sm text-black/60 mb-8 not-italic">
              Make sure you&apos;ve granted camera permissions and are using HTTPS
            </p>
            <button
              onClick={() => setHandPreference(null)}
              className="px-8 py-4 bg-black text-[#F5F5DC] rounded-xl hover:scale-105 transition-transform"
            >
              Back to Hand Selection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5DC] text-black font-serif italic relative overflow-hidden flex flex-col items-center">
      {/* Background Noise */}
      <div className="absolute inset-0 bg-noise pointer-events-none z-0"></div>

      <div className="relative z-10 max-w-7xl mx-auto p-6 h-screen flex flex-col w-full">
        {/* Header - Centered */}
        <div className="flex items-center justify-center mb-6 mt-2 relative">
          {/* Back Button */}
          <button
            onClick={onBack}
            className="fixed top-8 left-8 text-black p-2 hover:scale-110 transition-transform z-50 text-3xl cursor-pointer"
            aria-label="Go back"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>

          <h1 className="text-4xl md:text-5xl tracking-tight">
            Motion Wave
          </h1>
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#F5F5DC]/80 backdrop-blur-sm">
            <div className="p-10 border border-black/20 rounded-2xl relative bg-white/50 shadow-xl">
              <div className="relative text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-black/30 border-t-black mb-6"></div>
                <p className="text-black/80 text-lg">Initializing camera...</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex items-center justify-center gap-6">
          {/* Camera Feed */}
          <div className="relative rounded-2xl overflow-hidden w-full max-w-4xl aspect-[4/3] border border-black/10 shadow-xl bg-white/20">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ transform: 'scaleX(-1)' }}
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className="relative z-20 w-full h-full"
              style={{ transform: 'scaleX(-1)' }}
            />
          </div>

          {/* Compact Side Panel */}
          <div className="w-80 space-y-4">
            {/* SATB Harmony Display */}
            <div className="p-6 border border-black/10 rounded-2xl bg-white/30 backdrop-blur-sm">
              <div className="relative">
                <div className="text-black/60 text-sm mb-4 text-center not-italic">SATB Harmony</div>
                {currentHarmony ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 border border-black/5 rounded-lg bg-white/40">
                      <div className="text-xs font-bold text-black/50 mb-1 not-italic">Soprano</div>
                      <div className="text-lg text-black">
                        {midiToNoteName(currentHarmony.soprano.midiNote)}
                      </div>
                    </div>
                    <div className="text-center p-3 border border-black/5 rounded-lg bg-white/40">
                      <div className="text-xs font-bold text-black/50 mb-1 not-italic">Alto</div>
                      <div className="text-lg text-black">
                        {midiToNoteName(currentHarmony.alto.midiNote)}
                      </div>
                    </div>
                    <div className="text-center p-3 border border-black/5 rounded-lg bg-white/40">
                      <div className="text-xs font-bold text-black/50 mb-1 not-italic">Tenor</div>
                      <div className="text-lg text-black">
                        {midiToNoteName(currentHarmony.tenor.midiNote)}
                      </div>
                    </div>
                    <div className="text-center p-3 border border-black/5 rounded-lg bg-white/40">
                      <div className="text-xs font-bold text-black/50 mb-1 not-italic">Bass</div>
                      <div className="text-lg text-black">
                        {midiToNoteName(currentHarmony.bass.midiNote)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    {harmonizerLoading ? (
                      <div className="text-sm text-black/60">Loading harmonizer...</div>
                    ) : harmonizerError ? (
                      <div className="text-sm text-red-500">Harmonizer error</div>
                    ) : controlHand.detected && controlHand.vowel !== 'NONE' ? (
                      <div className="text-sm text-black/60">Generating harmony...</div>
                    ) : (
                      <div className="text-sm text-black/40 italic">
                        Start composing with your hand
                      </div>
                    )}
                  </div>
                )}

                {/* Current melody note indicator */}
                {controlHand.detected && (
                  <div className="mt-4 pt-4 border-t border-black/10">
                    <div className="text-center">
                      <div className="text-xs text-black/50 mb-1 not-italic">Melody Note</div>
                      <div className="text-xl text-black">
                        ♪ {midiToNoteName(pitchToMidi(currentPitch))}
                      </div>
                      <div className="text-xs text-black/40">
                        {(currentPitch * 100).toFixed(0)}% pitch
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Volume Display */}
            <div className="p-6 border border-black/10 rounded-2xl bg-white/30 backdrop-blur-sm">
              <div className="relative text-center">
                <div className="text-black/60 text-sm mb-3 flex items-center justify-center gap-2 not-italic">
                  <span className="text-lg">🔊</span>
                  Volume
                </div>

                {/* Minimalist Volume Bar */}
                <div className="relative w-full h-2 bg-black/10 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-black transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${volumeHand.detected ? (currentVolume * 100) : 50}%` }}
                  />
                </div>

                <div className="flex items-center justify-center gap-2">
                  <div className="text-lg text-black">
                    {volumeHand.detected ? `${(currentVolume * 100).toFixed(0)}%` : '50%'}
                  </div>
                </div>

                <div className="mt-2 text-xs text-black/40 not-italic">
                  {volumeHand.detected ? 'Hand detected' : 'Default volume'}
                </div>
              </div>
            </div>

            {/* Control Description */}
            <div className="p-4 border border-black/10 rounded-2xl bg-white/30 backdrop-blur-sm text-center">
              <div className="text-black/60 text-xs mb-2 not-italic">Controls</div>
              <div className="text-sm text-black space-y-1">
                <div>
                  <span className="font-bold">{handPreference === 'right' ? 'Right' : 'Left'} Hand:</span> Pitch & Harmony
                </div>
                <div>
                  <span className="font-bold">{handPreference === 'right' ? 'Left' : 'Right'} Hand:</span> Volume
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* About Modal & Toggle Button */}
      <button
        onClick={() => setIsAboutOpen(true)}
        className="fixed bottom-8 right-8 z-[60] w-12 h-12 bg-black text-[#F5F5DC] rounded-full flex items-center justify-center text-2xl shadow-lg hover:scale-110 transition-transform cursor-pointer"
        aria-label="About Motion Wave"
      >
        ?
      </button>

      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </div>
  );
}
