'use client';

import React from 'react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative z-[110] w-full max-w-2xl bg-[#F5F5DC] border border-black/20 rounded-[2.5rem] shadow-2xl overflow-hidden font-serif italic flex flex-col max-h-[90vh]">
        <div className="absolute inset-0 bg-noise pointer-events-none z-0"></div>

        {/* Header */}
        <div className="relative z-10 px-8 pt-8 flex justify-between items-start">
          <h2 className="text-4xl tracking-tight text-black">About Motion Wave</h2>
          <button
            onClick={onClose}
            className="p-2 hover:opacity-60 transition-opacity text-2xl cursor-pointer"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="relative z-10 p-8 pt-4 overflow-y-auto space-y-6 text-black">
          <section>
            <h3 className="text-xl font-bold mb-2 not-italic underline decoration-1 underline-offset-4">Concept</h3>
            <p className="opacity-90 leading-relaxed">
              Motion Wave is an experimental musical interface that allows you to conduct a virtual choir with your hands.
              It transforms your gestures into rich, real-time SATB harmony.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-bold mb-2 not-italic underline decoration-1 underline-offset-4">How it works</h3>
            <p className="opacity-90 leading-relaxed">
              Powered by a <strong>harmonizer engine</strong> and advanced <strong>gesture detection</strong>,
              the application generates four-part harmony (Soprano, Alto, Tenor, Bass) that follows your lead.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-bold mb-2 not-italic underline decoration-1 underline-offset-4">Controls</h3>
            <p className="opacity-90 leading-relaxed">
              Experience the music through your physical presence. Your dominant hand conducts the melody and harmony,
              while your other hand controls the overall volume of the virtual choir.
            </p>
          </section>


        </div>

        {/* Footer */}
        <div className="relative z-10 p-6 pt-0 flex justify-center">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-black text-[#F5F5DC] rounded-xl hover:scale-105 transition-transform cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
