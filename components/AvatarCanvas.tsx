
import React, { useRef, useEffect } from 'react';
// @ts-ignore
import { TalkingHead } from '../lib/talkinghead.mjs';

interface AvatarCanvasProps {
  avatarUrl: string;
  onLoad: (instance: TalkingHead) => void;
  eyeContact: number;
  headMovement: number;
}

export const AvatarCanvas: React.FC<AvatarCanvasProps> = ({ avatarUrl, onLoad, eyeContact, headMovement }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const talkingHeadInstance = useRef<TalkingHead | null>(null);

  useEffect(() => {
    if (canvasRef.current && !talkingHeadInstance.current) {
      const instance = new TalkingHead(canvasRef.current, {
        cameraView: 'upper',
        lipsyncLang: 'en',
      });
      talkingHeadInstance.current = instance;

      instance.showAvatar({ url: avatarUrl })
        .then(() => {
          onLoad(instance);
        })
        .catch(console.error);
    }

    return () => {
      if (talkingHeadInstance.current) {
        talkingHeadInstance.current.dispose();
        talkingHeadInstance.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarUrl]);

  // Effect to update settings dynamically
  useEffect(() => {
    if (talkingHeadInstance.current) {
      // Accessing internal options object directly as per library structure
      const opt = talkingHeadInstance.current.opt;
      
      // Update eye contact settings
      // We scale idle contact to be half of the active contact for natural behavior
      opt.avatarSpeakingEyeContact = eyeContact;
      opt.avatarIdleEyeContact = eyeContact * 0.5;

      // Update head movement settings
      opt.avatarSpeakingHeadMove = headMovement;
      opt.avatarIdleHeadMove = headMovement * 0.5;
    }
  }, [eyeContact, headMovement]);

  return <div ref={canvasRef} className="w-full h-full" />;
};
