import { Trash2, FileCode2, ArrowUpRight } from 'lucide-react';
import type { SavedComponent, ComponentType } from '../types';
import { COMPONENT_TYPE_LABELS } from '../types';

interface Props {
  component: SavedComponent;
  onDelete: (id: string) => void;
  onOpen: (component: SavedComponent) => void;
}

export default function ComponentCard({ component, onDelete, onOpen }: Props) {
  const typeColorMap: Record<ComponentType, string> = {
    'apex-trigger': 'bg-orange-100 text-orange-700',
    'apex-class': 'bg-blue-100 text-blue-700',
    'lwc': 'bg-violet-100 text-violet-700',
    'integration': 'bg-emerald-100 text-emerald-700',
    'batch': 'bg-amber-100 text-amber-700',
    'rest-api': 'bg-cyan-100 text-cyan-700',
    'cpq': 'bg-pink-100 text-pink-700',
  };
  const typeColor = typeColorMap[component.componentType as ComponentType] || 'bg-slate-100 text-slate-700';
  const typeLabel = COMPONENT_TYPE_LABELS[component.componentType as ComponentType] || component.componentType;

  const date = new Date(component.savedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="bg-white border border-black/10 rounded-xl p-4 hover:border-violet-200 hover:shadow-sm transition-all group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 size={16} className="text-violet-500 shrink-0" />
          <h3 className="text-sm font-semibold text-[#111827] truncate">{component.name}</h3>
        </div>
        <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onOpen(component)}
            className="p-1.5 text-[#717182] hover:text-[#111827] hover:bg-[#f3f3f5] rounded-md transition-colors"
            title="Open"
          >
            <ArrowUpRight size={14} />
          </button>
          <button
            onClick={() => onDelete(component.id)}
            className="p-1.5 text-[#717182] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mb-2 ${typeColor}`}>
        {typeLabel}
      </span>

      {component.summary && (
        <p className="text-xs text-[#52525b] line-clamp-2 mb-3">{component.summary}</p>
      )}

      <div className="flex items-center justify-between text-[10px] text-[#a1a1aa]">
        <span>{component.components.length} artifact{component.components.length !== 1 ? 's' : ''}</span>
        <span>{date}</span>
      </div>

      {component.version > 1 && (
        <span className="inline-block mt-1 text-[10px] font-semibold text-violet-700 bg-violet-100 border border-violet-200 rounded px-1.5 py-0.5">
          v{component.version}
        </span>
      )}
    </div>
  );
}
