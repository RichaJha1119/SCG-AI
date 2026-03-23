import { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { Search, BookOpen, Loader2, Inbox } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { SavedComponent, ComponentType } from '../types';
import { COMPONENT_TYPE_LABELS } from '../types';
import ComponentCard from '../components/ComponentCard';

const CodeViewer = lazy(() => import('../components/CodeViewer'));

export default function Library() {
  const [components, setComponents] = useState<SavedComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<ComponentType | ''>('');
  const [selected, setSelected] = useState<SavedComponent | null>(null);
  const navigate = useNavigate();

  const fetchComponents = useCallback(async () => {
    setLoading(true);
    try {
      const params: { componentType?: string; search?: string } = {};
      if (filterType) params.componentType = filterType;
      if (search) params.search = search;
      const data = await api.components.list(params);
      setComponents(data);
    } catch (err) {
      console.error('Failed to load components:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, search]);

  useEffect(() => {
    const timer = setTimeout(fetchComponents, 300);
    return () => clearTimeout(timer);
  }, [fetchComponents]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this component?')) return;
    try {
      await api.components.delete(id);
      setComponents(cs => cs.filter(c => c.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-white">
      {/* List panel */}
      <div className={`flex flex-col ${selected ? 'hidden md:flex md:w-80 md:shrink-0' : 'flex-1'} border-r border-black/10 overflow-hidden bg-white`}>
        {/* Header */}
        <div className="p-4 border-b border-black/10 shrink-0 bg-[#f9f9fb]">
          <h1 className="text-base font-bold text-[#111827] flex items-center gap-2 mb-3">
            <BookOpen size={18} className="text-violet-500" />
            Component Library
          </h1>

          {/* Search */}
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#717182]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search components..."
              className="w-full bg-white border border-black/10 text-[#09090b] text-sm rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Filter */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as ComponentType | '')}
            className="w-full bg-white border border-black/10 text-[#52525b] text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">All types</option>
            {(Object.entries(COMPONENT_TYPE_LABELS) as [ComponentType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* Component grid / list */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[#717182]">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading...
            </div>
          ) : components.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#717182] gap-3">
              <Inbox size={32} className="text-[#c4c4cc]" />
              <p className="text-sm">No components saved yet</p>
              <button
                onClick={() => navigate('/app')}
                className="text-xs text-violet-600 hover:text-violet-700"
              >
                Generate your first component →
              </button>
            </div>
          ) : (
            <div className={`grid gap-3 ${selected ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
              {components.map(comp => (
                <ComponentCard
                  key={comp.id}
                  component={comp}
                  onDelete={handleDelete}
                  onOpen={setSelected}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-30 md:static md:z-auto md:flex-1 flex flex-col overflow-hidden bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 bg-[#f9f9fb] shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-[#111827]">{selected.name}</h2>
              <p className="text-xs text-[#717182] mt-0.5 line-clamp-1">{selected.summary}</p>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-[#717182] hover:text-[#09090b] px-2 py-1 rounded text-xs"
            >
              Close ✕
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<div className="h-full flex items-center justify-center text-sm text-[#717182]">Loading editor...</div>}>
              <CodeViewer artifacts={selected.components} />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
