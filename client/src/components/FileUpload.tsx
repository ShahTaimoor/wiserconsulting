import React from 'react';
import Image from 'next/image';
import { Upload, FileText, X } from 'lucide-react';

interface FileUploadProps {
  label: string;
  field: string;
  files: File[];
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onPreviewImage: (url: string) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  label,
  field,
  files,
  onFileChange,
  onRemoveFile,
  onPreviewImage,
}) => {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-slate-800">
        {label}
        <span className="text-red-500 ml-1">*</span>
      </label>
      <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-slate-500 hover:bg-slate-50 transition-all group">
        <Upload className="w-8 h-8 text-slate-400 group-hover:text-slate-600 mb-2" />
        <span className="text-sm text-slate-600 font-medium">Click or drag files here</span>
        <span className="text-xs text-slate-400 mt-1">PDF, Images, or Word docs (Max 10MB)</span>
        <input
          type="file"
          multiple
          className="hidden"
          onChange={onFileChange}
        />
      </label>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {files.map((file, idx) => (
            <div key={idx} className="relative group">
              <div className="w-24 h-24 border-2 border-slate-200 rounded-lg overflow-hidden bg-slate-50 hover:border-slate-400 transition-colors">
                {file.type.startsWith('image/') ? (
                  <Image
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    fill
                    className="object-cover cursor-pointer"
                    onClick={() => onPreviewImage(URL.createObjectURL(file))}
                    unoptimized
                  />
                ) : (
                  <div className="flex items-center justify-center h-full p-2">
                    <FileText className="w-8 h-8 text-slate-400" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemoveFile(idx)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 text-white text-[10px] p-1 truncate">
                {file.name.length > 15 ? file.name.slice(0, 12) + '...' : file.name}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

