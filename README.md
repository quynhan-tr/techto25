# Motion Wave 🌊
🎹 Control the rhythm with your hands. Powered by machine learning for real-time harmony generation.

Built with Next.js, MediaPipe, and the Web Audio API.

## 🚀 Features

- **Hand Gesture Control**: Use your dominant hand to control pitch and melodic expression via MediaPipe's low-latency hand tracking.
- **AI-Powered Harmony**: Real-time 4-part SATB (Soprano, Alto, Tenor, Bass) harmony generation using a neural network.
- **Dynamic Audio Synthesis**: Custom Web Audio API-based vocal synthesis engine with formant filtering for a rich, vocal-like sound.
- **Interactive Visuals**: A rotating vinyl record aesthetic with real-time hand landmark visualization and wave-based feedback.
- **Dual-Hand Interaction**: Independent controls for pitch (dominant hand) and volume (non-dominant hand).

## 🛠️ Tech Stack

### Core Framework
- **Next.js 15**: Modern, performant UI framework with App Router support.
- **React 19**: The latest React features for efficient state management and rendering.
- **TypeScript**: Type-safe development for complex audio and ML logic.

### Machine Learning & Audio
- **MediaPipe Hands**: Google's low-latency hand tracking for consistent gesture detection.
- **Web Audio API**: High-performance audio synthesis and digital signal processing.
- **Web Workers**: Off-thread processing for harmony generation to ensure 60FPS UI performance.

### Styling
- **Tailwind CSS 4**: Cutting-edge utility-first styling for a premium, vintage aesthetic.

## 🏗️ Project Structure

```
.
├── src/
│   ├── app/            # Next.js App Router pages and components
│   ├── hooks/          # Custom hooks (e.g., useHarmonizer)
│   ├── utils/          # Audio engine and utility logic
│   └── types/          # TypeScript definitions
├── public/
│   └── harmonizer/    # AI models and Web Workers
└── package.json        # Project dependencies and scripts
```

## 🚦 Prerequisites

- **Node.js** (v18 or higher)
- **npm** (v9 or higher)
- **A Webcam** (for hand tracking functionality)

## 🔧 Setup & Installation

### Install Dependencies
```bash
npm install
```

### Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📄 License
This project is licensed under the GNU General Public License v3.0.
