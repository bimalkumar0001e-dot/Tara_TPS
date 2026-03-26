
import React, { useMemo, useState, useEffect } from 'react';
import { AudioFeatures } from '../App';

interface AvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  audioFeatures: AudioFeatures;
}

const Avatar: React.FC<AvatarProps> = ({ isSpeaking, isListening, audioFeatures }) => {
  const { volume, low, mid, high, energy, brightness } = audioFeatures;

  const [isBlinking, setIsBlinking] = useState(false);
  const [idleState, setIdleState] = useState({ eyeX: 0, eyeY: 0, tilt: 0, bounce: 0 });

  // Blinking logic
  useEffect(() => {
    let blinkTimer: number;
    const performBlink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 160);
      blinkTimer = window.setTimeout(performBlink, 3000 + Math.random() * 4000);
    };
    performBlink();
    return () => clearTimeout(blinkTimer);
  }, []);

  // Idle movement & Wing flapping
  useEffect(() => {
    const interval = setInterval(() => {
      const time = Date.now();
      setIdleState({
        eyeX: Math.sin(time / 2000) * 3,
        eyeY: Math.cos(time / 3000) * 1.5,
        tilt: Math.sin(time / 4500) * 2,
        bounce: Math.sin(time / 1500) * 4
      });
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const emotion = useMemo(() => {
    const happiness = Math.max(0, (brightness - 0.6) * 1.5);
    const intensity = energy * 1.5;
    return {
      smile: Math.min(1.3, happiness + (isSpeaking ? 0.3 : 0)),
      eyeSquint: Math.min(0.7, volume * 1.5 + (happiness * 0.2)),
      blush: Math.min(0.7, (intensity * 0.4) + (happiness * 0.5))
    };
  }, [brightness, energy, volume, isSpeaking]);

  const mouthShape = useMemo(() => {
    if (!isSpeaking) return { w: 10, h: 2, curve: 3 };
    return {
      w: 12 + (mid * 20) + (emotion.smile * 6),
      h: 2 + (low * 30) + (mid * 10),
      curve: 1 + (emotion.smile * 8)
    };
  }, [isSpeaking, low, mid, emotion.smile]);

  return (
    <div className="relative w-full max-w-md aspect-[4/5] flex items-center justify-center scale-110">
      {/* Background Petals/Bokeh Effect */}
      <div className="absolute inset-0 pointer-events-none">
         <div className="absolute top-[20%] left-[10%] w-4 h-4 bg-blue-300/20 blur-sm rounded-full animate-ping" />
         <div className="absolute bottom-[20%] right-[10%] w-6 h-6 bg-slate-300/20 blur-md rounded-full animate-pulse" />
      </div>

      <svg viewBox="0 0 400 500" className="w-full h-full drop-shadow-[0_20px_80px_rgba(59,130,246,0.1)] overflow-visible">
        <defs>
          <linearGradient id="hairGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="wingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,192,203,0.1)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.6)" />
            <stop offset="100%" stopColor="rgba(216,180,254,0.1)" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <g style={{ transform: `translateY(${idleState.bounce}px) rotate(${idleState.tilt}deg)`, transformOrigin: '200px 480px', transition: 'transform 0.2s ease-out' }}>
          
          {/* Hair Back */}
          <path d="M100 160 Q200 80 300 160 L320 430 Q200 460 80 430 Z" fill="url(#hairGrad)" />

          {/* Body (Teacher Outfit - Blazer/Shirt) */}
          <g>
            {/* Shirt/Blouse */}
            <path d="M120 400 L280 400 L320 500 L80 500 Z" fill="#ffffff" />
            {/* Blazer/Jacket */}
            <path d="M120 400 Q200 390 280 400 L350 500 L240 500 L200 440 L160 500 L50 500 Z" fill="#1e293b" />
            {/* Tie/Scarf */}
            <path d="M190 400 L210 400 L205 460 L195 460 Z" fill="#ef4444" />
          </g>

          {/* Neck */}
          <path d="M188 380 Q200 400 212 380 L210 420 Q200 430 190 420 Z" fill="#fff5f5" />
          
          {/* Face */}
          <path d="M135 180 Q135 380 200 380 Q265 380 265 180 Q265 110 200 110 Q135 110 135 180 Z" fill="#fff5f5" />

          {/* Eyes (Deep Blue) */}
          <g className={isBlinking ? 'blink-active' : ''} style={{ transformOrigin: '200px 220px' }}>
            <g style={{ transform: `translate(${idleState.eyeX}px, ${idleState.eyeY}px)`, transition: 'transform 0.5s cubic-bezier(0.2, 0, 0.2, 1)' }}>
              {/* Left Eye */}
              <g transform="translate(175, 220)">
                <ellipse cx="0" cy="0" rx="14" ry={18 - emotion.eyeSquint*4} fill="#222" />
                <circle cx="0" cy="0" r="10" fill="#1d4ed8" opacity="0.8" />
                <circle cx="4" cy="-5" r="4" fill="white" opacity="0.9" />
              </g>
              {/* Right Eye */}
              <g transform="translate(225, 220)">
                <ellipse cx="0" cy="0" rx="14" ry={18 - emotion.eyeSquint*4} fill="#222" />
                <circle cx="0" cy="0" r="10" fill="#1d4ed8" opacity="0.8" />
                <circle cx="4" cy="-5" r="4" fill="white" opacity="0.9" />
              </g>
            </g>
          </g>

          {/* Blush */}
          <circle cx="160" cy="285" r="15" fill="#f472b6" opacity={0.2 + emotion.blush * 0.5} />
          <circle cx="240" cy="285" r="15" fill="#f472b6" opacity={0.2 + emotion.blush * 0.5} />

          {/* Mouth */}
          <g transform="translate(200, 320)">
            {isSpeaking ? (
              <g>
                <ellipse cx="0" cy="0" rx={mouthShape.w} ry={mouthShape.h} fill="#701a75" style={{ transition: 'rx 0.05s, ry 0.05s' }} />
                <path d={`M -${mouthShape.w*0.8} -${mouthShape.h*0.2} Q 0 -${mouthShape.h*0.7} ${mouthShape.w*0.8} -${mouthShape.h*0.2}`} fill="white" opacity="0.95" />
              </g>
            ) : (
              <path d={`M -8 0 Q 0 ${mouthShape.curve + emotion.smile*6} 8 0`} stroke="#701a75" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            )}
          </g>

          {/* Hair Front (Purple/Lavender bangs) */}
          <g fill="url(#hairGrad)">
            <path d="M135 150 Q200 110 265 150 Q250 190 230 165 Q200 215 170 165 Q150 190 135 150 Z" />
            {/* Side strands */}
            <path d="M135 150 L120 370 Q130 390 150 360 Z" />
            <path d="M265 150 L280 370 Q270 390 250 360 Z" />
          </g>
        </g>
      </svg>
      
      {/* Academic Circle Glow (behind avatar) */}
      <div className="absolute inset-0 -z-10 flex items-center justify-center">
        <div className={`w-64 h-64 border border-blue-400/20 rounded-full animate-[spin_10s_linear_infinite] ${isSpeaking ? 'opacity-40' : 'opacity-10'}`} />
        <div className={`absolute w-72 h-72 border border-slate-400/10 rounded-full animate-[spin_15s_linear_infinite_reverse] ${isSpeaking ? 'opacity-30' : 'opacity-5'}`} />
      </div>
    </div>
  );
};

export default Avatar;
