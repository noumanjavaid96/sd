
import React from 'react';
import { IconX } from './Icons';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  eyeContact: number;
  setEyeContact: (val: number) => void;
  headMovement: number;
  setHeadMovement: (val: number) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  eyeContact,
  setEyeContact,
  headMovement,
  setHeadMovement
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-16 right-4 z-50 w-72 bg-white rounded-xl shadow-xl border border-gemini-dark-grey p-4 transform transition-all animate-in fade-in slide-in-from-top-2">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-gemini-grey">
        <h3 className="font-semibold text-gemini-text">Avatar Settings</h3>
        <button onClick={onClose} className="p-1 hover:bg-gemini-grey rounded-full text-gemini-text-secondary transition-colors">
          <IconX className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-6">
        <div>
          <div className="flex justify-between mb-2">
            <label className="text-sm font-medium text-gemini-text">Eye Contact</label>
            <span className="text-xs text-gemini-text-secondary">{Math.round(eyeContact * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={eyeContact}
            onChange={(e) => setEyeContact(parseFloat(e.target.value))}
            className="w-full h-2 bg-gemini-dark-grey rounded-lg appearance-none cursor-pointer accent-gemini-blue"
          />
          <p className="mt-1 text-xs text-gemini-text-secondary">Adjust how intensely the avatar looks at the camera.</p>
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <label className="text-sm font-medium text-gemini-text">Head Movement</label>
            <span className="text-xs text-gemini-text-secondary">{Math.round(headMovement * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={headMovement}
            onChange={(e) => setHeadMovement(parseFloat(e.target.value))}
            className="w-full h-2 bg-gemini-dark-grey rounded-lg appearance-none cursor-pointer accent-gemini-blue"
          />
          <p className="mt-1 text-xs text-gemini-text-secondary">Adjust the range of head motion while speaking.</p>
        </div>
      </div>
    </div>
  );
};
