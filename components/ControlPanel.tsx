
import React from 'react';
import type { SessionState } from '../types';
import { IconMicrophone, IconPlayerStop } from './Icons';

interface ControlPanelProps {
  sessionState: SessionState;
  onStart: () => void;
  onStop: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ sessionState, onStart, onStop }) => {
  const isConversing = sessionState === 'listening' || sessionState === 'speaking' || sessionState === 'connecting';

  return (
    <div className="p-4 bg-gemini-grey border-t border-gemini-dark-grey flex items-center justify-center">
      {!isConversing ? (
        <button
          onClick={onStart}
          disabled={sessionState === 'connecting'}
          className="px-8 py-4 bg-gemini-blue text-white rounded-full font-semibold text-lg flex items-center justify-center shadow-lg hover:bg-gemini-dark-blue transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gemini-blue disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <IconMicrophone className="w-6 h-6 mr-3" />
          {sessionState === 'connecting' ? 'Starting...' : 'Start Conversation'}
        </button>
      ) : (
        <button
          onClick={onStop}
          className="px-8 py-4 bg-red-500 text-white rounded-full font-semibold text-lg flex items-center justify-center shadow-lg hover:bg-red-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          <IconPlayerStop className="w-6 h-6 mr-3" />
          Stop Conversation
        </button>
      )}
    </div>
  );
};
