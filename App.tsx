
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AvatarCanvas } from './components/AvatarCanvas';
import { ControlPanel } from './components/ControlPanel';
import { TranscriptionView } from './components/TranscriptionView';
import { SettingsPanel } from './components/SettingsPanel';
import { useGeminiLive } from './hooks/useGeminiLive';
// @ts-ignore
import type { TalkingHead } from './lib/talkinghead.mjs';
import type { SessionState, ConversationEntry } from './types';
import { IconAlertTriangle, IconSettings } from './components/Icons';

// A free to use Ready Player Me Avatar
const AVATAR_URL = 'https://models.readyplayer.me/67714a06e282934958e758ff.glb';

const App: React.FC = () => {
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [currentUserText, setCurrentUserText] = useState('');
  const [currentModelText, setCurrentModelText] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [eyeContact, setEyeContact] = useState(0.5); // Default 50%
  const [headMovement, setHeadMovement] = useState(0.5); // Default 50%

  const talkingHeadRef = useRef<TalkingHead | null>(null);

  const handleModelAudio = useCallback((audioChunk: Uint8Array, textChunk: string) => {
    if (talkingHeadRef.current) {
      const audioDurationMs = (audioChunk.length / 2 / 24000) * 1000;
      talkingHeadRef.current.streamAudio({
        audio: audioChunk.buffer,
        words: textChunk ? [textChunk] : [],
        wtimes: [0],
        wdurations: [audioDurationMs],
      });
    }
  }, []);

  const { startSession, stopSession } = useGeminiLive({
    onStateChange: setSessionState,
    onModelAudio: handleModelAudio,
    onUserInput: setCurrentUserText,
    onModelInput: setCurrentModelText,
    onTurnComplete: (userText, modelText) => {
      setConversation(prev => [
        ...prev,
        { speaker: 'user', text: userText },
        { speaker: 'model', text: modelText },
      ]);
      setCurrentUserText('');
      setCurrentModelText('');
    },
    onError: (e) => {
      console.error("Gemini Live Error:", e);
      setError('An error occurred with the conversation. Please try again.');
      setSessionState('error');
    },
  });

  useEffect(() => {
    if (sessionState === 'speaking' || sessionState === 'listening') {
      talkingHeadRef.current?.setMood('happy');
    } else {
      talkingHeadRef.current?.setMood('neutral');
    }
  }, [sessionState]);

  const handleStart = () => {
    setError(null);
    startSession();
  };

  const handleStop = () => {
    // Stop the avatar from speaking
    if (talkingHeadRef.current) {
      talkingHeadRef.current.stopSpeaking();
    }
    stopSession();
    setCurrentUserText('');
    setCurrentModelText('');
  };

  return (
    <div className="flex flex-col h-screen font-sans bg-gemini-grey text-gemini-text">
      <header className="p-4 border-b border-gemini-dark-grey bg-white shadow-sm flex items-center justify-between relative">
        <div className="w-10" /> {/* Spacer for centering */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gemini-text">Gemini Live Talking Avatar</h1>
          <p className="text-gemini-text-secondary mt-1 text-sm">Real-time conversation with a 3D avatar</p>
        </div>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-full transition-colors ${showSettings ? 'bg-gemini-blue text-white' : 'hover:bg-gemini-grey text-gemini-text-secondary'}`}
          title="Avatar Settings"
        >
          <IconSettings className="w-6 h-6" />
        </button>

        <SettingsPanel 
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          eyeContact={eyeContact}
          setEyeContact={setEyeContact}
          headMovement={headMovement}
          setHeadMovement={setHeadMovement}
        />
      </header>
      
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="relative flex-1 lg:flex-2 flex items-center justify-center bg-gray-200">
           <AvatarCanvas
            avatarUrl={AVATAR_URL}
            onLoad={(instance) => { talkingHeadRef.current = instance; }}
            eyeContact={eyeContact}
            headMovement={headMovement}
          />
          {error && (
            <div className="absolute bottom-4 left-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center shadow-lg">
              <IconAlertTriangle className="w-6 h-6 mr-3"/>
              <span>{error}</span>
            </div>
          )}
        </div>
        
        <div className="flex-1 lg:max-w-md xl:max-w-lg flex flex-col bg-white border-l border-gemini-dark-grey">
          <TranscriptionView
            conversation={conversation}
            currentUserText={currentUserText}
            currentModelText={currentModelText}
            sessionState={sessionState}
          />
          <ControlPanel
            sessionState={sessionState}
            onStart={handleStart}
            onStop={handleStop}
          />
        </div>
      </main>
    </div>
  );
};

export default App;
