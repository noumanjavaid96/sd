
import React, { useEffect, useRef } from 'react';
import type { SessionState, ConversationEntry } from '../types';
import { IconUser, IconSparkles } from './Icons';

interface TranscriptionViewProps {
  conversation: ConversationEntry[];
  currentUserText: string;
  currentModelText: string;
  sessionState: SessionState;
}

const SpeakerBubble: React.FC<{ speaker: 'user' | 'model'; text: string; isStreaming?: boolean }> = ({ speaker, text, isStreaming }) => {
  const isUser = speaker === 'user';
  const bgColor = isUser ? 'bg-gemini-blue' : 'bg-gemini-dark-grey';
  const textColor = isUser ? 'text-white' : 'text-gemini-text';
  const align = isUser ? 'justify-end' : 'justify-start';
  const Icon = isUser ? IconUser : IconSparkles;

  return (
    <div className={`flex items-start gap-2.5 my-4 ${align}`}>
      {!isUser && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gemini-dark-grey flex items-center justify-center"><Icon className="w-5 h-5 text-gemini-text-secondary"/></div>}
      <div className={`flex flex-col max-w-[80%] leading-1.5 p-4 border-gray-200 rounded-xl ${bgColor} ${textColor}`}>
        <p className="text-sm font-normal">
          {text}
          {isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse-fast" />}
        </p>
      </div>
      {isUser && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gemini-blue flex items-center justify-center"><Icon className="w-5 h-5 text-white"/></div>}
    </div>
  );
};


export const TranscriptionView: React.FC<TranscriptionViewProps> = ({ conversation, currentUserText, currentModelText, sessionState }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation, currentUserText, currentModelText]);

  return (
    <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto bg-white">
      {conversation.map((entry, index) => (
        <SpeakerBubble key={index} speaker={entry.speaker} text={entry.text} />
      ))}
      {currentUserText && <SpeakerBubble speaker="user" text={currentUserText} isStreaming={sessionState === 'listening'} />}
      {currentModelText && <SpeakerBubble speaker="model" text={currentModelText} isStreaming={sessionState === 'speaking'} />}
      {sessionState === 'idle' && conversation.length === 0 && (
         <div className="flex flex-col items-center justify-center h-full text-center text-gemini-text-secondary">
            <IconSparkles className="w-16 h-16 mb-4 text-gray-300" />
            <h2 className="text-xl font-medium">Ready to Chat</h2>
            <p className="mt-2 max-w-xs">Click "Start Conversation" to begin your real-time dialogue with the Gemini-powered avatar.</p>
        </div>
      )}
    </div>
  );
};
