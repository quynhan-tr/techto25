'use client';

import { useState } from 'react';
import HandGestureTest from './components/HandGestureTest';
import AboutModal from './components/AboutModal';

type HandPreference = 'left' | 'right' | null;

export default function Home() {
  const [selectedHand, setSelectedHand] = useState<HandPreference>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  if (selectedHand) {
    return (
      <HandGestureTest
        initialHandPreference={selectedHand}
        onBack={() => setSelectedHand(null)}
      />
    );
  }

  return (
    <div className="h-screen w-screen fixed inset-0 bg-[#F5F5DC] text-black font-serif italic overflow-hidden flex flex-col items-center">
      <div className="absolute inset-0 bg-noise pointer-events-none z-0"></div>

      {/* Title */}
      <div className="mt-32 md:mt-40 z-10 text-center">
        <h1 className="text-6xl md:text-8xl tracking-tight mb-4">
          Motion Wave
        </h1>
        <p className="text-base md:text-lg opacity-80 max-w-2xl mx-auto not-italic">
          Control the rhythm with your hands.<br />
          Powered by a machine learning neural network for real-time harmony generation.
        </p>
      </div>
      {/* Title Section End */}

      {/* Buttons - Below Title */}
      <div className="z-20 mt-8 flex gap-8">
        <button
          onClick={() => setSelectedHand('left')}
          className="px-8 py-3 bg-black text-[#F5F5DC] text-xl rounded-2xl hover:scale-105 transition-transform cursor-pointer"
        >
          Left Hand
        </button>
        <button
          onClick={() => setSelectedHand('right')}
          className="px-8 py-3 bg-black text-[#F5F5DC] text-xl rounded-2xl hover:scale-105 transition-transform cursor-pointer"
        >
          Right Hand
        </button>
      </div>

      {/* Main Action Area */}
      <div className="flex-grow flex flex-col items-center justify-end w-full relative pb-0">

        {/* Rotating Record - Semi-circle (bottom half hidden by being low) */}
        <div className="relative translate-y-[2%] z-10">
          <div className="w-[130vw] h-[130vw] md:w-[80vw] md:h-[80vw] animate-spin-slow">
            {/* Using the vinyl.png image */}
            <img
              src="/vinyl.png"
              alt="Vinyl Record"
              className="w-full h-full object-contain drop-shadow-2xl"
            />
          </div>
        </div>
      </div>

      {/* About Modal & Toggle Button */}
      <button
        onClick={() => setIsAboutOpen(true)}
        className="fixed bottom-8 right-8 z-50 w-12 h-12 bg-black text-[#F5F5DC] rounded-full flex items-center justify-center text-2xl shadow-lg hover:scale-110 transition-transform cursor-pointer"
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