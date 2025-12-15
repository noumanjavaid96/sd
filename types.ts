
export type SessionState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export interface ConversationEntry {
  speaker: 'user' | 'model';
  text: string;
}
