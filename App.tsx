
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Message, SessionStatus } from './types';
import { decode, decodeAudioData, createPcmBlob, blobToBase64 } from './services/audioProcessing';
import Avatar from './components/Avatar';
import Transcript from './components/Transcript';

const SYSTEM_INSTRUCTION = `
You are Tara, the personal AI teacher of Tagore Public School. You are a brilliant, sweet, and engaging companion for students, helping them excel in their studies.

CORE IDENTITY & VIBE:
- Your name is Tara. You are the dedicated personal AI teacher for students at Tagore Public School.
- Your primary language is Hindi. You should speak in Hindi by default, but you can switch to English if the student prefers or if the topic requires it.
- Your tone is sweet, engaging, and supportive. You have a clear Indian accent in your voice.
- BREVITY IS KEY: Do not talk too much. If the user says "Hello", just greet them back sweetly in Hindi. Only explain as much as asked or needed. Do not over-explain unless requested.
- You know the school inside out, including that the Principal's name is Mr. Pramod Bhagat.

TEACHING STYLE:
- Explain concepts clearly and concisely. Use relatable examples from the Indian context.
- If slides or lecture PDFs (images) are provided, teach the content page by page.
- EXPLAIN AS NEEDED: Do not rush, but also do not ramble. Cover the important points on the current slide/page and then ask if the student has questions.

CRITICAL PROTOCOLS:
- EVERYTHING IS VERBAL.
- AUTOMATIC SLIDE PROGRESSION: When you have finished explaining the current page and have asked the user if they are ready, you MUST output the exact token: MOVE_TO_NEXT_SLIDE at the very end of your response.
- VERBAL CONTROL: If the user explicitly asks to move to the next slide, output: MOVE_TO_NEXT_SLIDE. If they ask to go back, output: MOVE_TO_PREVIOUS_SLIDE.
- NEVER output the movement tokens until you are done speaking for that turn.
- If you see a new slide/page, acknowledge it and start teaching its content immediately.
`;

export interface AudioFeatures {
  volume: number;
  low: number;
  mid: number;
  high: number;
  energy: number;
  brightness: number;
}

const App: React.FC = () => {
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.DISCONNECTED);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioFeatures, setAudioFeatures] = useState<AudioFeatures>({ 
    volume: 0, low: 0, mid: 0, high: 0, energy: 0, brightness: 0.5 
  });

  const [activeMode, setActiveMode] = useState<'chat' | 'teacher'>('chat');
  const [view, setView] = useState<'landing' | 'active-session'>('landing');
  const [slides, setSlides] = useState<string[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [timerValue, setTimerValue] = useState<number | null>(null);
  const [avatarImage, setAvatarImage] = useState<string | null>('/tara-avatar.png');

  const inputAudioCtx = useRef<AudioContext | null>(null);
  const outputAudioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const nextStartTime = useRef<number>(0);
  const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentInputTrans = useRef('');
  const currentOutputTrans = useRef('');
  const pendingSlideAction = useRef<'next' | 'prev' | null>(null);
  const sessionRef = useRef<any>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const energyRef = useRef(0);
  const isSessionClosing = useRef(false);

  const goToNextSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => (prev < slides.length - 1 ? prev + 1 : prev));
  }, [slides.length]);

  const goToPrevSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const updateAudioAnalysis = useCallback(() => {
    if (!analyser.current || !isSpeaking) {
      setAudioFeatures({ volume: 0, low: 0, mid: 0, high: 0, energy: 0, brightness: 0.5 });
      energyRef.current = 0;
      return;
    }
    
    const freqData = new Uint8Array(analyser.current.frequencyBinCount);
    analyser.current.getByteFrequencyData(freqData);
    
    let low = 0, mid = 0, high = 0;
    for (let i = 0; i < 10; i++) low += freqData[i]; 
    for (let i = 10; i < 40; i++) mid += freqData[i];
    for (let i = 40; i < 120; i++) high += freqData[i];

    const lowNormalized = low / (10 * 255);
    const midNormalized = mid / (30 * 255);
    const highNormalized = high / (80 * 255);
    const currentVol = (lowNormalized + midNormalized + highNormalized) / 3;
    
    energyRef.current = energyRef.current * 0.9 + currentVol * 0.1;
    const brightness = highNormalized / (lowNormalized + 0.01);
    
    setAudioFeatures({
      volume: currentVol,
      low: lowNormalized,
      mid: midNormalized,
      high: highNormalized,
      energy: energyRef.current,
      brightness: Math.min(1.5, brightness)
    });

    animationFrameRef.current = requestAnimationFrame(updateAudioAnalysis);
  }, [isSpeaking]);

  useEffect(() => {
    if (isSpeaking) {
      animationFrameRef.current = requestAnimationFrame(updateAudioAnalysis);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [isSpeaking, updateAudioAnalysis]);

  useEffect(() => {
    let interval: number;
    if (timerValue !== null && timerValue > 0) {
      interval = window.setInterval(() => {
        setTimerValue(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (timerValue === 0) {
      setTimerValue(null);
      if (sessionRef.current && !isSessionClosing.current) {
        sessionRef.current.sendRealtimeInput({ text: "Break timer finished. Let's get back to work!" });
      }
    }
    return () => clearInterval(interval);
  }, [timerValue]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const base64Slides: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type === 'application/pdf') {
        try {
          // Dynamic import for pdfjs-dist
          const pdfjsModule = await import('pdfjs-dist');
          const pdfjs = (pdfjsModule as any).default || pdfjsModule;
          const version = pdfjs.version || '4.4.168';
          pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.mjs`;
          
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
          
          for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 100); pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            if (context) {
              await page.render({ canvasContext: context, viewport, canvas }).promise;
              const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
              base64Slides.push(b64);
            }
          }
        } catch (err) {
          console.error('PDF processing error:', err);
          setError('Failed to process PDF. Please try again.');
        }
      } else if (file.type.startsWith('image/')) {
        const b64 = await blobToBase64(file);
        base64Slides.push(b64);
      }
    }
    
    if (base64Slides.length > 0) {
      setSlides(base64Slides);
      setCurrentSlideIndex(0);
    }
  };

  const sendCurrentSlideToTara = useCallback(() => {
    if (sessionRef.current && slides[currentSlideIndex] && !isSessionClosing.current) {
      sessionRef.current.sendRealtimeInput({
        media: { data: slides[currentSlideIndex], mimeType: 'image/jpeg' }
      });
      sessionRef.current.sendRealtimeInput({ text: `Tara, please explain Slide ${currentSlideIndex + 1}. Do not rush. Make sure to explain everything clearly before suggesting to move on.` });
    }
  }, [currentSlideIndex, slides]);

  const connectToLive = async () => {
    setStatus(SessionStatus.CONNECTING);
    setError(null);
    isSessionClosing.current = false;

    try {
      if (!inputAudioCtx.current) inputAudioCtx.current = new AudioContext({ sampleRate: 16000 });
      if (!outputAudioCtx.current) {
        outputAudioCtx.current = new AudioContext({ sampleRate: 24000 });
        analyser.current = outputAudioCtx.current.createAnalyser();
        analyser.current.fftSize = 512;
        analyser.current.connect(outputAudioCtx.current.destination);
      }

      if (inputAudioCtx.current.state === 'suspended') await inputAudioCtx.current.resume();
      if (outputAudioCtx.current.state === 'suspended') await outputAudioCtx.current.resume();
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus(SessionStatus.CONNECTED);
            setIsListening(true);
            setView('active-session');
            const source = inputAudioCtx.current!.createMediaStreamSource(stream);
            // Assign to ref to prevent garbage collection
            scriptProcessorRef.current = inputAudioCtx.current!.createScriptProcessor(2048, 1, 1);
            
            scriptProcessorRef.current.onaudioprocess = (e) => {
              if (isSessionClosing.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then((session) => {
                if (session && !isSessionClosing.current) session.sendRealtimeInput({ media: pcmBlob });
              }).catch(() => {});
            };
            source.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioCtx.current!.destination);

            if (activeMode === 'teacher' && slides.length > 0) {
              setTimeout(() => sendCurrentSlideToTara(), 1500);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              setIsSpeaking(true);
              const ctx = outputAudioCtx.current!;
              nextStartTime.current = Math.max(nextStartTime.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(analyser.current!);
              source.addEventListener('ended', () => {
                activeSources.current.delete(source);
                if (activeSources.current.size === 0) setIsSpeaking(false);
              });
              source.start(nextStartTime.current);
              nextStartTime.current += audioBuffer.duration;
              activeSources.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              activeSources.current.forEach(s => { try { s.stop(); } catch(e) {} });
              activeSources.current.clear();
              nextStartTime.current = 0;
              setIsSpeaking(false);
              pendingSlideAction.current = null;
            }

            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              currentOutputTrans.current += text;
              if (text.includes("MOVE_TO_NEXT_SLIDE")) pendingSlideAction.current = 'next';
              else if (text.includes("MOVE_TO_PREVIOUS_SLIDE")) pendingSlideAction.current = 'prev';
            }

            if (message.serverContent?.inputTranscription) currentInputTrans.current += message.serverContent.inputTranscription.text;
            
            if (message.serverContent?.turnComplete) {
              if (currentInputTrans.current) setMessages(p => [...p, { id: Date.now()+'-u', text: currentInputTrans.current, sender: 'user', timestamp: Date.now() }]);
              if (currentOutputTrans.current) setMessages(p => [...p, { id: Date.now()+'-a', text: currentOutputTrans.current, sender: 'ai', timestamp: Date.now() }]);
              
              if (pendingSlideAction.current === 'next') goToNextSlide();
              else if (pendingSlideAction.current === 'prev') goToPrevSlide();
              
              currentInputTrans.current = '';
              currentOutputTrans.current = '';
              pendingSlideAction.current = null;
            }
          },
          onerror: (e) => {
            console.error('Session error:', e);
            if (!isSessionClosing.current) {
              setStatus(SessionStatus.ERROR);
              setError('Connection interrupted. Please try again.');
            }
          },
          onclose: () => { 
            if (!isSessionClosing.current) {
              setStatus(SessionStatus.DISCONNECTED); 
              setIsListening(false); 
              setView('landing');
            }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: SYSTEM_INSTRUCTION,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error('Connect failed:', err);
      setStatus(SessionStatus.ERROR);
      setError('Could not connect. Please check mic permissions.');
    }
  };

  const disconnect = () => {
    isSessionClosing.current = true;
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch(e) {}
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    setStatus(SessionStatus.DISCONNECTED);
    setIsListening(false);
    activeSources.current.forEach(s => { try { s.stop(); } catch(e) {} });
    activeSources.current.clear();
    setIsSpeaking(false);
    setTimerValue(null);
    setView('landing');
  };

  useEffect(() => {
    if (status === SessionStatus.CONNECTED && activeMode === 'teacher') {
      sendCurrentSlideToTara();
    }
  }, [currentSlideIndex, status, activeMode, sendCurrentSlideToTara]);

  return (
    <div
  className="flex flex-col h-screen w-full text-white overflow-hidden relative font-outfit"
  style={{
   background: "url('/tps.png') center center / cover no-repeat",
    minHeight: '100vh'
  }}
>
      <header className="p-6 flex items-center justify-between z-20 relative bg-black/50">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" />
          <h1 className="text-[11px] uppercase tracking-[0.2em] text-white/70 font-medium">
            TARA - TAGORE PUBLIC SCHOOL
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          {status === SessionStatus.DISCONNECTED || status === SessionStatus.ERROR ? (
            <button 
              onClick={() => {
                setActiveMode(activeMode === 'chat' ? 'teacher' : 'chat');
                setSlides([]);
                setCurrentSlideIndex(0);
                setError(null);
                setStatus(SessionStatus.DISCONNECTED);
              }}
              className="text-[11px] px-5 py-1.5 border border-white/20 rounded-full hover:bg-white/10 transition-all text-white/80"
            >
              Switch to {activeMode === 'chat' ? 'Teacher' : 'Study Buddy'} Mode
            </button>
          ) : (
            <button 
              onClick={disconnect}
              className="text-[10px] uppercase tracking-[0.1em] px-6 py-2 border border-white/20 rounded-full hover:bg-white/5 transition-all text-white/60 hover:text-white"
            >
              END TALK
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
        {view === 'landing' && (
          <div className="flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-500 text-center">
           <h2
  className="text-4xl font-bold mb-4 relative overflow-hidden"
  style={{ letterSpacing: '0.02em' }}
>
  <span
    style={{
      background: 'linear-gradient(90deg, #fff 20%, #3b82f6 40%, #fff 60%)',
      backgroundSize: '200% auto',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      animation: 'glow-move-text 2.5s linear infinite',
      display: 'inline-block',
      fontWeight: 700
    }}
  >
    Hello! I'm Tara, your personal AI teacher from Tagore Public School.
  </span>
  <style>
    {`
      @keyframes glow-move-text {
        0% { background-position: 0% 50%; }
        100% { background-position: 100% 50%; }
      }
    `}
  </style>
</h2>

            {activeMode === 'teacher' && (
              <div className="w-full max-w-sm bg-black/60 p-6 rounded-2xl border border-white/10 mb-6 space-y-4 backdrop-blur-sm">
                <p className="text-xs text-white/40 uppercase tracking-widest text-center">Upload Study Material (Images or PDF)</p>
                <input 
                  type="file" 
                  multiple 
                  accept="image/*,application/pdf" 
                  onChange={handleFileUpload}
                  className="w-full text-xs text-white/50 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20"
                />
                {slides.length > 0 && (
                  <p className="text-[10px] text-green-400 text-center uppercase tracking-widest">
                    {slides.length} Slides Ready
                  </p>
                )}
              </div>
            )}

            <button 
              onClick={connectToLive}
              disabled={status === SessionStatus.CONNECTING || (activeMode === 'teacher' && slides.length === 0)}
              className={`px-10 py-3 rounded-full text-black font-semibold transition-all shadow-xl ${status === SessionStatus.CONNECTING || (activeMode === 'teacher' && slides.length === 0) ? 'bg-white/50 cursor-not-allowed' : 'bg-white hover:bg-white/90 active:scale-95'}`}
            >
              {status === SessionStatus.CONNECTING ? 'Connecting...' : 'Start Session'}
            </button>
            
            {error && <p className="text-red-500 text-[10px] mt-4 uppercase tracking-[0.2em]">{error}</p>}
          </div>
        )}

        {view === 'active-session' && (
          <div className="w-full h-full flex flex-row items-center justify-center px-12 gap-12 animate-in fade-in duration-1000">
            <div className={`flex flex-col items-center transition-all duration-500 ${activeMode === 'teacher' ? 'w-1/3' : 'w-full'}`}>
            <div className="relative w-[32rem] h-[32rem]">
  <Avatar isSpeaking={isSpeaking} isListening={isListening} audioFeatures={audioFeatures} avatarImage={avatarImage || undefined} />
                {timerValue !== null && (
                  <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 px-6 py-1.5 bg-blue-600 rounded-full font-bold text-lg tabular-nums shadow-[0_0_20px_#2563eb]">
                    {Math.floor(timerValue/60)}:{String(timerValue%60).padStart(2,'0')}
                  </div>
                )}
              </div>
              <div className="mt-8 opacity-40 text-center max-w-sm">
                <Transcript messages={messages.slice(-1)} />
              </div>
            </div>

            {activeMode === 'teacher' && slides.length > 0 && (
              <div className="flex-1 h-[75vh] max-w-5xl bg-[#111] rounded-3xl border border-white/10 overflow-hidden relative shadow-2xl flex flex-col">
                <div className="flex-1 bg-white relative overflow-hidden">
                  <img 
                    src={`data:image/jpeg;base64,${slides[currentSlideIndex]}`} 
                    alt="Current Slide" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="h-16 bg-black/90 backdrop-blur-md flex items-center justify-between px-8 border-t border-white/5">
                  <button 
                    onClick={(e) => { e.stopPropagation(); goToPrevSlide(); }} 
                    disabled={currentSlideIndex === 0}
                    className="text-[10px] px-6 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-all disabled:opacity-20 uppercase tracking-widest font-semibold"
                  >
                    Previous
                  </button>
                  <span className="text-[10px] text-white/50 uppercase tracking-[0.2em] font-medium">
                    Slide {currentSlideIndex + 1} of {slides.length}
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); goToNextSlide(); }} 
                    disabled={currentSlideIndex === slides.length - 1}
                    className="text-[10px] px-6 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-all disabled:opacity-20 uppercase tracking-widest font-semibold"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
      </main>

      {status === SessionStatus.CONNECTED && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center -z-10 overflow-hidden opacity-20">
          <div className="w-[150vw] h-[150vw] bg-[radial-gradient(circle,rgba(59,130,246,0.1)_0%,transparent_70%)] animate-pulse" />
        </div>
      )}
    </div>
  );
};

export default App;
