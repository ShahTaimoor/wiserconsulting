import React from 'react';
import { User, Plane, FileText, CheckCircle2 } from 'lucide-react';

interface Step {
  number: number;
  label: string;
  icon: React.ReactNode;
}

interface StepIndicatorProps {
  currentStep: number;
}

const steps: Step[] = [
  { number: 1, label: 'Personal Info', icon: <User className="w-5 h-5" /> },
  { number: 2, label: 'Travel Details', icon: <Plane className="w-5 h-5" /> },
  { number: 3, label: 'Documents', icon: <FileText className="w-5 h-5" /> },
];

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  return (
    <div className="px-8 py-6 bg-slate-50 border-b border-slate-200">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <React.Fragment key={step.number}>
            <div className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                  currentStep >= step.number
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-400 border-2 border-slate-300'
                }`}
              >
                {currentStep > step.number ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  step.icon
                )}
              </div>
              <span className={`ml-3 text-sm font-medium hidden sm:block ${
                currentStep >= step.number ? 'text-slate-900' : 'text-slate-400'
              }`}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-4 ${
                currentStep > step.number ? 'bg-slate-900' : 'bg-slate-300'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

