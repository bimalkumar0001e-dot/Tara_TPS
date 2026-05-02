import React, { useMemo, useState, useEffect } from 'react';
import { AudioFeatures } from '../App';

interface AvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  audioFeatures: AudioFeatures;
  avatarImage?: string;
}

const Avatar: React.FC<AvatarProps> = ({ isSpeaking, isListening, audioFeatures, avatarImage }) => {
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

  // Idle movement
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
    <div className="relative flex items-center justify-center w-full h-full">
      {/* Enhanced Bottom Glow Effect (Behind avatar) */}
      <div 
        className="absolute w-full h-64 -bottom-16 left-1/2 transform -translate-x-1/2 pointer-events-none"
        style={{
          background: isSpeaking 
            ? 'radial-gradient(ellipse 600px 300px at center, rgba(59, 130, 246, 0.4) 0%, rgba(59, 130, 246, 0.2) 40%, transparent 80%)'
            : 'radial-gradient(ellipse 600px 300px at center, rgba(59, 130, 246, 0.2) 0%, rgba(59, 130, 246, 0.05) 40%, transparent 80%)',
          filter: 'blur(40px)',
          transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: `translateX(-50%) scaleX(${isSpeaking ? 1.1 : 1.0}) scaleY(${isSpeaking ? 1.1 : 1.0})`,
          zIndex: -1
        }}
      />

      {/* Main Avatar Container - Rounded Square Frame - MINIMIZED LIKE RYAN */}
      <div 
        className="relative flex items-center justify-center transition-all duration-300"
        style={{
          width: 'min(70vw, 600px)',
          height: 'min(70vh, 600px)',
          borderRadius: '40px',
          background: 'rgba(0, 0, 0, 0.4)',
          border: isSpeaking ? '2px solid rgba(59, 130, 246, 0.4)' : '2px solid rgba(59, 130, 246, 0.15)',
          backdropFilter: 'blur(15px)',
          boxShadow: isSpeaking 
            ? '0 0 40px rgba(59, 130, 246, 0.3), inset 0 0 20px rgba(59, 130, 246, 0.1)'
            : '0 0 20px rgba(59, 130, 246, 0.1)',
          transform: isSpeaking ? 'scale(1.05)' : 'scale(1.0)',
          overflow: 'hidden',
          padding: '0'
        }}
      >
        {/* Avatar Content */}
        <div 
          className="w-full h-full flex items-center justify-center relative"
          style={{
            transform: isSpeaking ? 'scale(0.99)' : 'scale(1)',
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}
        >
          {/* Display avatar image if provided, otherwise use SVG */}
          {avatarImage ? (
            <img 
              src={avatarImage} 
              alt="Avatar" 
              className="w-full h-full object-cover transition-all duration-300"
              style={{
                filter: isSpeaking 
                  ? 'brightness(1.08) contrast(1.05) drop-shadow(0 0 20px rgba(59, 130, 246, 0.3))' 
                  : 'brightness(1.05) contrast(1.05)',
              }}
            />
          ) : (
      <svg viewBox="0 0 400 500" className="w-full h-full overflow-visible" style={{ maxWidth: '100%', maxHeight: '100%' }}>
        <defs>
          <linearGradient id="hairGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
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

          {/* Body */}
          <g>
            <path d="M120 400 L280 400 L320 500 L80 500 Z" fill="#ffffff" />
            <path d="M120 400 Q200 390 280 400 L350 500 L240 500 L200 440 L160 500 L50 500 Z" fill="#1e293b" />
            <path d="M190 400 L210 400 L205 460 L195 460 Z" fill="#ef4444" />
          </g>

          {/* Neck */}
          <path d="M188 380 Q200 400 212 380 L210 420 Q200 430 190 420 Z" fill="#fff5f5" />
          
          {/* Face */}
          <path d="M135 180 Q135 380 200 380 Q265 380 265 180 Q265 110 200 110 Q135 110 135 180 Z" fill="#fff5f5" />

          {/* Eyes */}
          <g className={isBlinking ? 'blink-active' : ''} style={{ transformOrigin: '200px 220px' }}>
            <g style={{ transform: `translate(${idleState.eyeX}px, ${idleState.eyeY}px)`, transition: 'transform 0.5s cubic-bezier(0.2, 0, 0.2, 1)' }}>
              <g transform="translate(175, 220)">
                <ellipse cx="0" cy="0" rx="14" ry={18 - emotion.eyeSquint*4} fill="#222" />
                <circle cx="0" cy="0" r="10" fill="#1d4ed8" opacity="0.8" />
                <circle cx="4" cy="-5" r="4" fill="white" opacity="0.9" />
              </g>
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

          {/* Hair Front */}
          <g fill="url(#hairGrad)">
            <path d="M135 150 Q200 110 265 150 Q250 190 230 165 Q200 215 170 165 Q150 190 135 150 Z" />
            <path d="M135 150 L120 370 Q130 390 150 360 Z" />
            <path d="M265 150 L280 370 Q270 390 250 360 Z" />
          </g>
        </g>
      </svg>
          )}
        </div>

        {/* Animated Border Glow Effect */}
        <div 
          className="absolute inset-0 rounded-[40px] pointer-events-none"
          style={{
            border: '1px solid',
            borderColor: isSpeaking ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.05)',
            boxShadow: isSpeaking
              ? 'inset 0 0 15px rgba(59, 130, 246, 0.1)'
              : 'none',
            transition: 'all 0.4s ease-out'
          }}
        />
      </div>
    </div>
  );
};

export default Avatar;
