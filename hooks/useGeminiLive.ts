
import { useRef, useCallback, useState } from 'react';
import { GoogleGenAI, Modality, LiveSession } from "@google/genai";
import type { SessionState } from '../types';

// --- Audio Encoding/Decoding Helpers from Gemini Docs ---

function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// --- Hook Definition ---

interface GeminiLiveHookProps {
    onStateChange: (state: SessionState) => void;
    onModelAudio: (audioChunk: Uint8Array, textChunk: string) => void;
    onUserInput: (text: string) => void;
    onModelInput: (text: string) => void;
    onTurnComplete: (userText: string, modelText: string) => void;
    onError: (error: Error) => void;
}

const INPUT_SAMPLE_RATE = 16000;

export const useGeminiLive = ({
    onStateChange,
    onModelAudio,
    onUserInput,
    onModelInput,
    onTurnComplete,
    onError,
}: GeminiLiveHookProps) => {
    const [ai] = useState(new GoogleGenAI({ apiKey: process.env.API_KEY as string }));

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    const currentUserTextRef = useRef('');
    const currentModelTextRef = useRef('');

    const stopSession = useCallback(() => {
        sessionPromiseRef.current?.then(session => {
            session.close();
        }).catch(e => console.error("Error closing session:", e));

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if(sourceRef.current){
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }

        sessionPromiseRef.current = null;
        onStateChange('idle');
    }, [onStateChange]);

    const startSession = useCallback(async () => {
        onStateChange('connecting');
        currentUserTextRef.current = '';
        currentModelTextRef.current = '';
        onUserInput('');
        onModelInput('');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            // @ts-ignore
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: INPUT_SAMPLE_RATE,
            });

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                    },
                     systemInstruction: 'You are a helpful and friendly 3D avatar. Keep your responses concise and conversational.',
                },
                callbacks: {
                    onopen: () => {
                        const source = audioContextRef.current!.createMediaStreamSource(stream);
                        sourceRef.current = source;

                        const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;

                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) {
                                int16[i] = inputData[i] * 32768;
                            }
                            const pcmBlob = {
                                data: encode(new Uint8Array(int16.buffer)),
                                mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
                            };

                            sessionPromiseRef.current?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };

                        source.connect(scriptProcessor);
                        scriptProcessor.connect(audioContextRef.current!.destination);
                    },
                    onmessage: async (message) => {
                        let textChunk = '';
                        if (message.serverContent?.inputTranscription) {
                            currentUserTextRef.current += message.serverContent.inputTranscription.text;
                            onUserInput(currentUserTextRef.current);
                            onStateChange('listening');
                        }
                        
                        if (message.serverContent?.outputTranscription) {
                            textChunk = message.serverContent.outputTranscription.text;
                            currentModelTextRef.current += textChunk;
                            onModelInput(currentModelTextRef.current);
                            onStateChange('speaking');
                        }

                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                        if (base64Audio) {
                            const decodedAudio = decode(base64Audio);
                            onModelAudio(decodedAudio, textChunk);
                        }

                        if (message.serverContent?.turnComplete) {
                             onTurnComplete(currentUserTextRef.current, currentModelTextRef.current);
                             currentUserTextRef.current = '';
                             currentModelTextRef.current = '';
                             onStateChange('listening');
                        }
                    },
                    onerror: (e) => {
                        console.error('Session error:', e);
                        onError(new Error('Session error occurred.'));
                        stopSession();
                    },
                    onclose: () => {
                        console.log('Session closed.');
                        stopSession();
                    },
                },
            });
            await sessionPromiseRef.current;
            onStateChange('listening');
        } catch (err) {
            console.error('Failed to start session:', err);
            onError(err instanceof Error ? err : new Error('Failed to start session. Check microphone permissions.'));
            stopSession();
        }
    }, [ai, onStateChange, onModelAudio, onUserInput, onModelInput, onTurnComplete, onError, stopSession]);

    return { startSession, stopSession };
};
