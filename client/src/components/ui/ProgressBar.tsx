// ProgressBar component - handles dynamic width without inline styles
'use client';

import { useEffect, useRef } from 'react';

interface ProgressBarProps {
  progress: number; // 0-100
  className?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, className = '' }) => {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (barRef.current) {
      barRef.current.style.setProperty('--progress-width', `${progress}%`);
    }
  }, [progress]);

  return (
    <div className={`w-full bg-gray-200 rounded-full h-2 overflow-hidden ${className}`}>
      <div 
        ref={barRef}
        className="bg-green-600 h-2 rounded-full transition-all duration-300"
        style={{ width: 'var(--progress-width, 0%)' } as React.CSSProperties}
      ></div>
    </div>
  );
};

export default ProgressBar;

