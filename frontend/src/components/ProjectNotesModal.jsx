import React, { useState, useEffect } from 'react';
import { X, Tag, StickyNote, Check, Plus, Trash2 } from 'lucide-react';

export default function ProjectNotesModal({ isOpen, onClose, filename }) {
  const storageKey = `karya_notes_${filename || 'default'}`;
  const tagsKey = `karya_tags_${filename || 'default'}`;

  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (isOpen) {
      const savedNotes = localStorage.getItem(storageKey) || '';
      const savedTags = JSON.parse(localStorage.getItem(tagsKey) || '["Karya Standard", "Verbatim"]');
      setNotes(savedNotes);
      setTags(savedTags);
    }
  }, [isOpen, storageKey, tagsKey]);

  const handleSave = () => {
    localStorage.setItem(storageKey, notes);
    localStorage.setItem(tagsKey, JSON.stringify(tags));
    setToast('Project notes & tags saved locally ✓');
    setTimeout(() => {
      setToast('');
      onClose();
    }, 1200);
  };

  const handleAddTag = () => {
    const clean = newTagInput.trim();
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean]);
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <StickyNote className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Project Notes & Tags</h2>
              <p className="text-xs text-slate-500 font-medium">{filename || 'Current Project'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className="mt-3 p-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{toast}</span>
          </div>
        )}

        <div className="space-y-4 mt-4 flex-1 overflow-y-auto">
          {/* Tags Section */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-indigo-600" />
              <span>Project Classification Tags</span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100"
                >
                  <span>{t}</span>
                  <button
                    onClick={() => handleRemoveTag(t)}
                    className="hover:text-rose-600 ml-0.5 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                placeholder="Add custom tag (e.g. 'telephonic', 'accent review')..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTag();
                }}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 font-medium"
              />
              <button
                onClick={handleAddTag}
                disabled={!newTagInput.trim()}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Annotator Notes Section */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5 text-indigo-600" />
              <span>Annotator Notes & Quality Remarks</span>
            </label>
            <textarea
              rows={6}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Record guidelines clarifications, domain terminology notes, acronym pronunciations, speaker accents, or reviewer feedback here..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none resize-y leading-relaxed font-sans"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">Stored in browser local storage</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              Save Notes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
