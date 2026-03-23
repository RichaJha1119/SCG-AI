import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { RefreshCw, Paperclip, X, FileText, Plus, ArrowRight, ChevronDown, Zap, Mic, Square } from 'lucide-react';
import type { ComponentType, LwcArchitectureMode } from '../types';
import { COMPONENT_TYPE_LABELS } from '../types';

const EXAMPLES: Record<ComponentType, string> = {
  'apex-trigger': 'Create an Apex trigger on the Account object that prevents deletion of accounts with open opportunities.',
  'apex-class': 'Create a service class that calculates renewal dates for subscription contracts and sends reminder emails 30 days before expiry.',
  'lwc': 'Create a Lightning Web Component that displays a contact timeline with filterable activity history.',
  'integration': 'Create a REST callout service to sync order data to an external ERP system with retry logic.',
  'batch': 'Create a batch Apex job that reassigns leads older than 90 days with no activity to a default queue.',
  'rest-api': 'Create a REST API endpoint to expose Account and related Contact data for an external mobile app.',
  'cpq': 'Create CPQ price rules that apply a 10% discount when the opportunity amount exceeds $50,000.',
};

export interface PromptHistoryEntry {
  id: string;
  prompt: string;
  componentType: ComponentType;
  version: number;
  isRefinement: boolean;
  attachmentCount: number;
  timestamp: Date;
  traceLines?: string[];
  responseSummary?: string;
  artifactCount?: number;
  status?: 'success' | 'error';
  pendingPlan?: boolean;
  pendingExampleSelection?: boolean;
  exampleOptions?: string[];
  orchestration?: {
    request?: unknown;
    intent?: unknown;
    plan?: unknown;
    validation?: unknown;
  };
}

interface IntentBadgeMeta {
  intent: string;
  action: string;
  confidence: string;
}

export interface Attachment {
  id: string;
  name: string;
  kind: 'image' | 'text' | 'pdf';
  mimeType: string;
  base64?: string;   // images and pdf (for server)
  content?: string;  // text files
  dataUrl?: string;  // images (for thumbnail preview)
  size: number;
}

interface Props {
  onGenerate: (
    prompt: string,
    componentType: ComponentType,
    isRefinement: boolean,
    attachments: Attachment[],
    architectureMode: LwcArchitectureMode,
    strictImageMatch: boolean
  ) => void;
  onStopGeneration?: () => void;
  isLoading: boolean;
  hasResult: boolean;
  promptHistory: PromptHistoryEntry[];
  onPlanAction?: (action: 'confirm' | 'cancel') => void;
  onExampleSelect?: (index: number) => void;
  onSaveCurrentWork?: () => Promise<{ ok: boolean; message: string }>;
  loadExampleSignal?: number;
}

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_VIDEO_SIZE_BYTES = 120 * 1024 * 1024; // 120 MB
const ACCEPTED = '.jpg,.jpeg,.png,.gif,.webp,.bmp,.txt,.md,.pdf,.mp4,.mov,.webm';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function inferRequestedComponentType(prompt: string): { type: ComponentType; confidence: 'high' | 'low' } | null {
  const text = String(prompt || '').toLowerCase();

  if (/\b(lwc|lightning web component|lightning component)\b/.test(text)) return { type: 'lwc', confidence: 'high' };
  if (/\b(apex trigger|trigger handler|before insert|after update|before delete|after delete)\b/.test(text)) return { type: 'apex-trigger', confidence: 'high' };
  if (/\b(apex class|service class|utility class)\b/.test(text)) return { type: 'apex-class', confidence: 'high' };
  if (/\b(batch apex|database\.batchable|schedulable)\b/.test(text)) return { type: 'batch', confidence: 'high' };
  if (/\b(rest api|rest endpoint|@restresource|api endpoint)\b/.test(text)) return { type: 'rest-api', confidence: 'high' };
  if (/\b(integration|callout|external api|erp|webhook)\b/.test(text)) return { type: 'integration', confidence: 'high' };
  if (/\b(cpq|price rule|quote line)\b/.test(text)) return { type: 'cpq', confidence: 'high' };

  // Lower-confidence cues for softer guidance only (do not hard block).
  if (/\b(ui|screen|page|frontend)\b/.test(text)) return { type: 'lwc', confidence: 'low' };
  if (/\b(trigger)\b/.test(text)) return { type: 'apex-trigger', confidence: 'low' };
  if (/\b(class)\b/.test(text)) return { type: 'apex-class', confidence: 'low' };

  return null;
}

function inferArchitectureMode(prompt: string, componentType: ComponentType, attachmentCount: number): LwcArchitectureMode {
  if (componentType !== 'lwc') return 'auto';

  const text = String(prompt || '').toLowerCase();
  if (attachmentCount > 0) return 'nested';
  if (/\b(wizard|dashboard|tabs|section|accordion|timeline|split|multi[-\s]?step|nested|modular)\b/.test(text)) {
    return 'nested';
  }
  if (/\b(simple|single|minimal|one screen|small)\b/.test(text)) {
    return 'single';
  }
  return 'auto';
}

function getIntentBadgeMeta(entry: PromptHistoryEntry): IntentBadgeMeta | null {
  const intentData = entry.orchestration?.intent;
  if (!intentData || typeof intentData !== 'object') return null;

  const rawIntent = (intentData as Record<string, unknown>).intent;
  const rawAction = (intentData as Record<string, unknown>).action;
  const rawConfidence = (intentData as Record<string, unknown>).confidence;

  if (typeof rawIntent !== 'string' || typeof rawAction !== 'string' || typeof rawConfidence !== 'string') {
    return null;
  }

  return {
    intent: rawIntent,
    action: rawAction,
    confidence: rawConfidence,
  };
}

interface TypeMismatchDialogState {
  requestedType: ComponentType;
  selectedType: ComponentType;
}

export default function PromptPanel({ onGenerate, onStopGeneration, isLoading, hasResult, promptHistory, onPlanAction, onExampleSelect, onSaveCurrentWork, loadExampleSignal = 0 }: Props) {
  const isFirstPromptView = promptHistory.length === 0;
  const [prompt, setPrompt] = useState('');
  const [componentType, setComponentType] = useState<ComponentType>('apex-trigger');
  const [strictImageMatch, setStrictImageMatch] = useState(true);
  const [isRefinement, setIsRefinement] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [videoFrameNote, setVideoFrameNote] = useState('');
  const [openTraceById, setOpenTraceById] = useState<Record<string, boolean>>({});
  const [typeMismatchDialog, setTypeMismatchDialog] = useState<TypeMismatchDialogState | null>(null);
  const [saveBeforeSwitchState, setSaveBeforeSwitchState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveBeforeSwitchMessage, setSaveBeforeSwitchMessage] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<any>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const speechSupported = typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const requestedTypeInfo = useMemo(() => inferRequestedComponentType(prompt.trim()), [prompt]);
  const mismatchSuggestion = useMemo(() => {
    if (!requestedTypeInfo) return null;
    if (requestedTypeInfo.type === componentType) return null;
    return requestedTypeInfo;
  }, [requestedTypeInfo, componentType]);
  const latestPendingPlanId = useMemo(() => {
    for (let i = promptHistory.length - 1; i >= 0; i -= 1) {
      if (promptHistory[i].pendingPlan) return promptHistory[i].id;
    }
    return '';
  }, [promptHistory]);
  const latestPendingExampleId = useMemo(() => {
    for (let i = promptHistory.length - 1; i >= 0; i -= 1) {
      if (promptHistory[i].pendingExampleSelection) return promptHistory[i].id;
    }
    return '';
  }, [promptHistory]);

  // Auto-scroll history to bottom when new entries arrive
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [promptHistory.length]);

  // Safety: once generation is in progress, composer attachments should not remain visible.
  useEffect(() => {
    if (!isLoading) return;
    if (attachments.length === 0 && !videoFrameNote) return;
    setAttachments([]);
    setVideoFrameNote('');
  }, [isLoading, attachments.length, videoFrameNote]);

  // External trigger from workspace "Try an Example" button.
  useEffect(() => {
    if (loadExampleSignal <= 0) return;
    loadExample();
  }, [loadExampleSignal]);

  function submitPrompt(targetType: ComponentType, fromMismatchSwitch = false) {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) return;

    const submittedAttachments = attachments;
    const resolvedArchitectureMode = inferArchitectureMode(normalizedPrompt, targetType, submittedAttachments.length);
    const shouldRefine = !fromMismatchSwitch && hasResult && (isRefinement || promptHistory.length > 0);
    if (isRecordingVoice && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      setIsRecordingVoice(false);
      setVoiceNote('');
    }
    setPrompt('');
    setAttachments([]);
    setVideoFrameNote('');
    onGenerate(normalizedPrompt, targetType, shouldRefine, submittedAttachments, resolvedArchitectureMode, strictImageMatch);
  }

  function handleGenerate() {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) return;

    if (mismatchSuggestion?.confidence === 'high') {
      setTypeMismatchDialog({
        requestedType: mismatchSuggestion.type,
        selectedType: componentType,
      });
      return;
    }

    submitPrompt(componentType);
  }

  function loadExample() {
    setPrompt(EXAMPLES[componentType]);
  }

  async function extractVideoFrames(file: File): Promise<Attachment[]> {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;

    const waitFor = (eventName: 'loadedmetadata' | 'seeked') =>
      new Promise<void>((resolve, reject) => {
        const onEvent = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('Failed to process video file.'));
        };
        const cleanup = () => {
          video.removeEventListener(eventName, onEvent);
          video.removeEventListener('error', onError);
        };
        video.addEventListener(eventName, onEvent, { once: true });
        video.addEventListener('error', onError, { once: true });
      });

    try {
      await waitFor('loadedmetadata');
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration <= 0) throw new Error('Video duration could not be read.');

      const frameCount = Math.min(8, Math.max(4, Math.ceil(duration / 6)));
      const timestamps: number[] = [];
      for (let i = 1; i <= frameCount; i += 1) {
        timestamps.push((duration * i) / (frameCount + 1));
      }

      const canvas = document.createElement('canvas');
      const maxDim = 1280;
      const ratio = Math.min(1, maxDim / Math.max(video.videoWidth || 1, video.videoHeight || 1));
      canvas.width = Math.max(1, Math.floor((video.videoWidth || 1) * ratio));
      canvas.height = Math.max(1, Math.floor((video.videoHeight || 1) * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not initialize frame extraction canvas.');

      const baseName = file.name.replace(/\.[^.]+$/, '') || 'walkthrough';
      const frames: Attachment[] = [];
      for (let i = 0; i < timestamps.length; i += 1) {
        const ts = timestamps[i];
        video.currentTime = Math.min(duration - 0.05, Math.max(0, ts));
        await waitFor('seeked');

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        const base64 = dataUrl.split(',')[1] || '';
        if (!base64) continue;

        frames.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: `${baseName}-frame-${String(i + 1).padStart(2, '0')}.jpg`,
          kind: 'image',
          mimeType: 'image/jpeg',
          base64,
          dataUrl,
          size: Math.round(base64.length * 0.75),
        });
      }

      return frames;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const processFile = useCallback((file: File) => {
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);
    const sizeLimit = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_SIZE_BYTES;

    if (file.size > sizeLimit) {
      const limitText = isVideo ? '120MB' : '8MB';
      alert(`"${file.name}" exceeds the ${limitText} limit.`);
      return;
    }

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isText =
      file.type.startsWith('text/') ||
      file.name.toLowerCase().endsWith('.md') ||
      file.name.toLowerCase().endsWith('.txt');

    if (!isImage && !isPdf && !isText && !isVideo) {
      alert(`"${file.name}" is not supported.\nAccepted: images (jpg/png/gif/webp), videos (.mp4/.mov/.webm), text (.txt/.md), PDF.`);
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const reader = new FileReader();

    if (isVideo) {
      setIsProcessingVideo(true);
      setVideoFrameNote('Extracting storyboard frames from video...');
      extractVideoFrames(file)
        .then((frames) => {
          if (frames.length === 0) throw new Error('No frames could be extracted from this video.');
          setAttachments((prev) => [...prev, ...frames]);
          setVideoFrameNote(`Video walkthrough converted into ${frames.length} frame(s).`);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Video frame extraction failed.';
          alert(message);
          setVideoFrameNote('');
        })
        .finally(() => {
          setIsProcessingVideo(false);
        });
      return;
    }

    if (isImage) {
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        setAttachments(prev => [
          ...prev,
          { id, name: file.name, kind: 'image', mimeType: file.type, base64, dataUrl, size: file.size },
        ]);
      };
      reader.readAsDataURL(file);
    } else if (isPdf) {
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        setAttachments(prev => [
          ...prev,
          { id, name: file.name, kind: 'pdf', mimeType: 'application/pdf', base64, size: file.size },
        ]);
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => {
        const content = reader.result as string;
        setAttachments(prev => [
          ...prev,
          { id, name: file.name, kind: 'text', mimeType: file.type || 'text/plain', content, size: file.size },
        ]);
      };
      reader.readAsText(file);
    }
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files || []).forEach(processFile);
    e.target.value = '';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    Array.from(e.dataTransfer.files).forEach(processFile);
  }

  function removeAttachment(id: string) {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }

  function toggleVoiceRecording() {
    if (!speechSupported) {
      alert('Speech-to-text is not supported in this browser.');
      return;
    }

    if (isRecordingVoice) {
      speechRecognitionRef.current?.stop();
      setIsRecordingVoice(false);
      setVoiceNote('');
      return;
    }

    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = speechRecognitionRef.current ?? new SpeechRecognitionCtor();
    speechRecognitionRef.current = recognition;

    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    let committedText = prompt.trim();
    recognition.onresult = (event: any) => {
      let finalChunk = '';
      let interimChunk = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const spoken = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          finalChunk += spoken;
        } else {
          interimChunk += spoken;
        }
      }

      if (finalChunk.trim()) {
        committedText = `${committedText}${committedText ? ' ' : ''}${finalChunk.trim()}`.trim();
      }

      const draft = `${committedText}${interimChunk.trim() ? `${committedText ? ' ' : ''}${interimChunk.trim()}` : ''}`.trim();
      setPrompt(draft);
    };

    recognition.onerror = () => {
      setIsRecordingVoice(false);
      setVoiceNote('Voice input failed. Please try again.');
    };

    recognition.onend = () => {
      setIsRecordingVoice(false);
      setVoiceNote('');
    };

    setVoiceNote('Listening...');
    setIsRecordingVoice(true);
    recognition.start();
  }

  useEffect(() => {
    return () => {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.stop();
      }
    };
  }, []);

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.kind === 'file' && item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    // Prevent the default paste behaviour only when images are present so text still pastes normally
    e.preventDefault();
    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (file) {
        // Clipboard images have no filename — generate one with a timestamp
        const ext = file.type.split('/')[1] || 'png';
        const named = new File([file], `pasted-image-${Date.now()}.${ext}`, { type: file.type });
        processFile(named);
      }
    });
  }

  return (
    <div className="flex flex-col h-full bg-[#f8f8fb]">
      <div className="px-4 py-3 min-h-[84px] border-b border-black/10 bg-white shrink-0 flex flex-col justify-center">
        <h2 className="text-base font-semibold leading-6 tracking-[-0.01em] text-[#0f172a]">Component Generator</h2>
        <p className="mt-1 text-xs leading-5 text-[#64748b]">Describe your component and let AI build it for you</p>
      </div>

      <div className="px-4 pt-3 shrink-0">
        <label className="block text-xs font-medium text-[#717182] mb-1.5">Component Type</label>
        <select
          value={componentType}
          onChange={e => setComponentType(e.target.value as ComponentType)}
          className="w-full bg-white border border-black/10 text-[#09090b] text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        >
          {(Object.entries(COMPONENT_TYPE_LABELS) as [ComponentType, string][]).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {componentType === 'lwc' && (
        <div className="px-4 pt-3 shrink-0">
          <label className="mt-2.5 inline-flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={strictImageMatch}
              onChange={(e) => setStrictImageMatch(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-black/20 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-[11px] leading-4 text-[#52525b]">
              Strict image match (fail instead of approximate when screenshot layout is unclear)
            </span>
          </label>
          <p className="mt-1.5 text-[10px] text-[#717182]">
            Architecture is auto-selected from your prompt and attachments.
          </p>
        </div>
      )}

      {promptHistory.length > 0 && (
        <div className="px-4 py-3 flex flex-col gap-2.5 flex-1 min-h-0">
          <p className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-semibold">Conversation</p>
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-1">
            {promptHistory.map(entry => (
              <div key={entry.id} className="py-1.5">
                {(() => {
                  const intentMeta = getIntentBadgeMeta(entry);

                  return (
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
                      entry.status === 'success'
                        ? 'text-emerald-700 bg-emerald-100 border border-emerald-200'
                        : entry.status === 'error'
                          ? 'text-rose-700 bg-rose-100 border border-rose-200'
                          : 'text-violet-700 bg-violet-100 border border-violet-200'
                    }`}
                  >
                    v{entry.version}
                  </span>
                  <span className="text-[10px] text-[#717182] bg-[#f3f3f5] border border-black/10 rounded px-1.5 py-0.5">
                    {COMPONENT_TYPE_LABELS[entry.componentType]}
                  </span>
                  {intentMeta && (
                    <span
                      className="text-[10px] text-[#4b5563] bg-[#eef2ff] border border-indigo-200 rounded px-1.5 py-0.5"
                      title={`intent=${intentMeta.intent}, action=${intentMeta.action}, confidence=${intentMeta.confidence}`}
                    >
                      {intentMeta.intent} · {intentMeta.action} · {intentMeta.confidence}
                    </span>
                  )}
                  {entry.isRefinement && (
                    <span className="text-[10px] text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">
                      Refinement
                    </span>
                  )}
                  {entry.attachmentCount > 0 && (
                    <span
                      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 bg-[#f3f3f5] border border-black/10"
                      title={`${entry.attachmentCount} attachment${entry.attachmentCount === 1 ? '' : 's'}`}
                    >
                      {Array.from({ length: Math.min(entry.attachmentCount, 4) }).map((_, i) => (
                        <Paperclip key={`${entry.id}-att-${i}`} size={9} className="text-[#717182]" />
                      ))}
                      {entry.attachmentCount > 4 && (
                        <span className="text-[9px] text-[#717182]">+{entry.attachmentCount - 4}</span>
                      )}
                    </span>
                  )}
                </div>
                  );
                })()}

                <div className="flex justify-end">
                  <p className="max-w-[92%] rounded-2xl bg-[#f1f2f5] px-3 py-2 text-xs text-[#111827] leading-relaxed break-words">
                    {entry.prompt.length > 300 ? `${entry.prompt.slice(0, 300)}…` : entry.prompt}
                  </p>
                </div>

                {entry.responseSummary && (
                  <p className="mt-2 text-xs text-[#09090b] leading-relaxed break-words">
                    {entry.responseSummary.length > 320 ? `${entry.responseSummary.slice(0, 320)}…` : entry.responseSummary}
                  </p>
                )}

                {entry.pendingPlan && entry.id === latestPendingPlanId && onPlanAction && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onPlanAction('confirm')}
                      className="px-2.5 py-1 text-[11px] rounded-md bg-violet-600 text-white hover:bg-violet-500 transition-colors"
                    >
                      Go Ahead
                    </button>
                    <button
                      type="button"
                      onClick={() => onPlanAction('cancel')}
                      className="px-2.5 py-1 text-[11px] rounded-md border border-black/15 text-[#52525b] hover:bg-[#f3f4f6] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {entry.pendingExampleSelection && entry.id === latestPendingExampleId && onExampleSelect && Array.isArray(entry.exampleOptions) && entry.exampleOptions.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {entry.exampleOptions.map((_, idx) => (
                      <button
                        key={`${entry.id}-example-${idx + 1}`}
                        type="button"
                        onClick={() => onExampleSelect(idx)}
                        className="px-2.5 py-1 text-[11px] rounded-md border border-indigo-300/40 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                      >
                        Option {idx + 1}
                      </button>
                    ))}
                  </div>
                )}

                {entry.traceLines && entry.traceLines.length > 0 && (
                  <div className="mt-2">
                    {(() => {
                      const isLive = entry.status !== 'success' && entry.status !== 'error';
                      const isTraceOpen = openTraceById[entry.id] ?? isLive;

                      return (
                        <>
                    <button
                      onClick={() => setOpenTraceById(prev => ({ ...prev, [entry.id]: !(openTraceById[entry.id] ?? isLive) }))}
                      className="inline-flex items-center gap-1 text-[11px] text-[#52525b] hover:text-[#09090b] transition-colors"
                    >
                      <span>Reasoning</span>
                      {isLive && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />}
                      <ChevronDown size={12} className={`transition-transform ${isTraceOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isTraceOpen && (
                      <div className="mt-1.5 space-y-2 max-h-32 overflow-y-auto scrollbar-hidden pr-1">
                        <p className="text-[11px] text-[#52525b] leading-relaxed">
                          {entry.traceLines.slice(0, 2).join(' ')}
                        </p>
                        {entry.traceLines.length > 2 && (
                          <p className="text-[11px] text-[#52525b] leading-relaxed">
                            {entry.traceLines.slice(2, 5).join(' ')}
                          </p>
                        )}
                        {entry.traceLines.length > 5 && (
                          <p className="text-[11px] text-[#52525b] leading-relaxed">
                            Additional checks: {entry.traceLines.slice(5).join(' ')}
                          </p>
                        )}
                        {entry.orchestration && (
                          <details className="rounded-md border border-black/10 bg-[#fafafb] px-2 py-1.5">
                            <summary className="cursor-pointer text-[10px] text-[#717182] select-none">Orchestration</summary>
                            <pre className="mt-1.5 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-[#52525b]">
{JSON.stringify(entry.orchestration, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                        </>
                      );
                    })()}
                  </div>
                )}

                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#a1a1aa]">
                  <span>
                    {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {(entry.artifactCount ?? 0) > 0 && (
                    <span>· Worked with {entry.artifactCount} file{entry.artifactCount === 1 ? '' : 's'}</span>
                  )}
                  {entry.status === 'error' && <span className="text-rose-600">· Failed</span>}
                  {entry.status === 'success' && <span className="text-emerald-600">· Completed</span>}
                </div>
              </div>
            ))}
            <div ref={historyEndRef} />
          </div>
        </div>
      )}

      <div className={`px-4 pb-4 pt-3 flex flex-col gap-3 min-h-0 ${isFirstPromptView ? 'flex-1' : 'shrink-0 border-t border-black/10 bg-white'}`}>
        {mismatchSuggestion && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[11px] text-amber-800 leading-relaxed">
              This prompt looks like <span className="font-semibold">{COMPONENT_TYPE_LABELS[mismatchSuggestion.type]}</span> work while
              <span className="font-semibold"> {COMPONENT_TYPE_LABELS[componentType]}</span> is selected.
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setComponentType(mismatchSuggestion.type)}
                className="text-[11px] px-2 py-1 rounded-md bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors"
              >
                Switch to {COMPONENT_TYPE_LABELS[mismatchSuggestion.type]}
              </button>
              {mismatchSuggestion.confidence === 'low' && (
                <span className="text-[10px] text-amber-700">Low-confidence suggestion. You can ignore this.</span>
              )}
            </div>
          </div>
        )}

        {isFirstPromptView ? (
          <>
            <label className="text-xs font-medium text-[#717182]">Description</label>

            <div
              className={`relative rounded-xl bg-white transition-colors ${
                isDragging ? 'ring-2 ring-violet-500 ring-offset-1 ring-offset-white' : ''
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder=""
                className="w-full min-h-[140px] bg-transparent border border-black/10 rounded-xl text-[#09090b] text-xs p-3 resize-none overflow-y-auto focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent placeholder:text-xs placeholder-[#a1a1aa]"
                onPaste={handlePaste}
              />

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED}
                onChange={handleFileChange}
                className="hidden"
              />

              {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-xl bg-white/90 border-2 border-dashed border-violet-500">
                  <div className="text-center">
                    <Paperclip size={20} className="text-violet-600 mx-auto mb-1" />
                    <p className="text-sm text-violet-600 font-medium">Drop files here</p>
                  </div>
                </div>
              )}
            </div>

            <p className="text-[10px] text-[#717182]">Be specific about requirements, interactions, and expected output.</p>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#717182] hover:text-[#09090b] hover:bg-[#f3f3f5] rounded-lg transition-colors"
                >
                  <Plus size={16} />
                  Attach files
                </button>
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleVoiceRecording}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                      isRecordingVoice
                        ? 'text-rose-600 bg-rose-50 hover:bg-rose-100'
                        : 'text-[#717182] hover:text-[#09090b] hover:bg-[#f3f3f5]'
                    }`}
                  >
                    {isRecordingVoice ? <Square size={16} /> : <Mic size={16} />}
                    {isRecordingVoice ? 'Stop' : 'Voice'}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={loadExample}
                className="text-xs text-violet-600 hover:text-violet-500 transition-colors"
              >
                Load example
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                if (isLoading) {
                  onStopGeneration?.();
                  return;
                }
                handleGenerate();
              }}
              disabled={isProcessingVideo || (!isLoading && !prompt.trim())}
              className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-blue-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {isLoading ? <Square size={14} /> : isProcessingVideo ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={14} />}
              {isLoading ? 'Stop Generation' : 'Generate Component'}
            </button>
          </>
        ) : (
          <>
            <div
              className={`relative flex flex-col min-h-0 rounded-xl border border-black/10 bg-white overflow-hidden transition-colors min-h-[180px] max-h-[320px] shrink-0 ${
                isDragging ? 'ring-2 ring-violet-500 ring-offset-1 ring-offset-white' : ''
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder=""
                className="flex-1 min-h-[140px] w-full bg-transparent border-0 text-[#09090b] text-xs p-3 resize-none overflow-y-auto focus:outline-none placeholder:text-xs placeholder-[#a1a1aa]"
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    if (isLoading) {
                      onStopGeneration?.();
                    } else {
                      handleGenerate();
                    }
                  }
                }}
                onPaste={handlePaste}
              />

              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <div className="relative inline-flex group">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-[#717182] hover:text-[#09090b] hover:bg-[#f3f3f5] transition-colors"
                    aria-label="Attach files"
                  >
                    <Plus size={16} />
                  </button>
                  <div className="absolute left-0 top-full mt-2 z-20 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity">
                    <div className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-[11px] text-[#717182] whitespace-nowrap shadow-sm">
                      Supported: Images, Videos (.mp4/.mov/.webm), .txt, .md, .pdf
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {speechSupported && (
                    <div className="relative inline-flex group">
                      <button
                        type="button"
                        onClick={toggleVoiceRecording}
                        className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${
                          isRecordingVoice
                            ? 'text-rose-600 bg-rose-50 hover:bg-rose-100'
                            : 'text-[#717182] hover:text-[#09090b] hover:bg-[#f3f3f5]'
                        }`}
                        aria-label={isRecordingVoice ? 'Stop voice input' : 'Start voice input'}
                      >
                        {isRecordingVoice ? <Square size={16} /> : <Mic size={16} />}
                      </button>
                      <div className="absolute right-0 top-full mt-2 z-20 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity">
                        <div className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-[11px] text-[#717182] whitespace-nowrap shadow-sm">
                          {isRecordingVoice ? 'Stop recording' : 'Voice to text'}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="relative inline-flex group">
                    <button
                      type="button"
                      onClick={() => {
                        if (isLoading) {
                          onStopGeneration?.();
                          return;
                        }
                        handleGenerate();
                      }}
                      disabled={isProcessingVideo || (!isLoading && !prompt.trim())}
                      className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-gradient-to-r from-violet-500 to-blue-500 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                      aria-label={isLoading ? 'Stop generation' : 'Generate'}
                    >
                      {isLoading ? <Square size={15} /> : isProcessingVideo ? <RefreshCw size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                    </button>
                    <div className="absolute right-0 top-full mt-2 z-20 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity">
                      <div className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-[11px] text-[#717182] whitespace-nowrap shadow-sm">
                        {isLoading
                          ? 'Stop generation'
                          : isProcessingVideo
                          ? 'Preparing storyboard from video...'
                          : (isRefinement || !isFirstPromptView) && hasResult
                            ? 'Update Component'
                            : 'Generate Component'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED}
                onChange={handleFileChange}
                className="hidden"
              />

              {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-xl bg-white/90 border-2 border-dashed border-violet-500">
                  <div className="text-center">
                    <Paperclip size={20} className="text-violet-600 mx-auto mb-1" />
                    <p className="text-sm text-violet-600 font-medium">Drop files here</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {videoFrameNote && (
          <p className={`text-[10px] ${isProcessingVideo ? 'text-violet-600' : 'text-emerald-700'}`}>
            {videoFrameNote}
          </p>
        )}

        {voiceNote && (
          <p className={`text-[10px] ${isRecordingVoice ? 'text-violet-600' : 'text-[#717182]'}`}>
            {voiceNote}
          </p>
        )}

        {attachments.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 bg-[#f9f9fb] border border-black/10 rounded-lg max-h-44 overflow-y-auto scrollbar-hidden">
            {attachments.map(att => (
              <div
                key={att.id}
                className="flex items-center gap-1.5 bg-white border border-black/10 rounded-md px-2 py-1 text-xs min-w-0"
                title={`${att.name} (${formatSize(att.size)})`}
              >
                {att.kind === 'image' ? (
                  <img src={att.dataUrl} alt={att.name} className="w-5 h-5 rounded object-cover shrink-0" />
                ) : att.kind === 'pdf' ? (
                  <FileText size={13} className="text-red-400 shrink-0" />
                ) : (
                  <FileText size={13} className="text-violet-500 shrink-0" />
                )}
                <span className="truncate text-[#52525b] flex-1">{att.name}</span>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="text-[#a1a1aa] hover:text-red-500 shrink-0 transition-colors"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {hasResult && promptHistory.length === 0 && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setIsRefinement(!isRefinement)}
              className={`relative w-8 h-4 rounded-full transition-colors ${isRefinement ? 'bg-violet-500' : 'bg-[#cbced4]'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${isRefinement ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-xs text-[#717182]">Refine existing code</span>
          </label>
        )}

      </div>

      {typeMismatchDialog && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-black/10 bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-[#0f172a]">Switch component type?</h3>
            <p className="mt-2 text-xs text-[#52525b] leading-relaxed">
              You are prompting for <span className="font-semibold">{COMPONENT_TYPE_LABELS[typeMismatchDialog.requestedType]}</span> but
              <span className="font-semibold"> {COMPONENT_TYPE_LABELS[typeMismatchDialog.selectedType]}</span> is currently selected.
            </p>
            {hasResult && (
              <p className="mt-2 text-[11px] text-amber-700">
                Save your current work in Library before switching, if needed.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTypeMismatchDialog(null)}
                className="px-3 py-1.5 text-xs rounded-lg border border-black/10 text-[#52525b] hover:bg-[#f8fafc] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setTypeMismatchDialog(null);
                  submitPrompt(typeMismatchDialog.selectedType);
                }}
                className="px-3 py-1.5 text-xs rounded-lg border border-black/10 text-[#334155] hover:bg-[#f1f5f9] transition-colors"
              >
                Stay and Continue
              </button>
              <button
                type="button"
                onClick={() => {
                  const requestedType = typeMismatchDialog.requestedType;
                  setSaveBeforeSwitchState('idle');
                  setSaveBeforeSwitchMessage('');
                  setComponentType(requestedType);
                  setTypeMismatchDialog(null);
                  submitPrompt(requestedType, true);
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 text-white hover:opacity-90 transition-opacity"
              >
                Switch and Continue
              </button>
            </div>

            {hasResult && onSaveCurrentWork && (
              <div className="mt-2 border-t border-black/10 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-[#717182]">Save current output before switching</p>
                  <button
                    type="button"
                    disabled={saveBeforeSwitchState === 'saving'}
                    onClick={async () => {
                      setSaveBeforeSwitchState('saving');
                      const result = await onSaveCurrentWork();
                      setSaveBeforeSwitchState(result.ok ? 'saved' : 'error');
                      setSaveBeforeSwitchMessage(result.message);
                    }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-60 transition-colors"
                  >
                    {saveBeforeSwitchState === 'saving' ? 'Saving...' : 'Save to Library'}
                  </button>
                </div>
                {saveBeforeSwitchMessage && (
                  <p className={`mt-1 text-[11px] ${saveBeforeSwitchState === 'saved' ? 'text-emerald-700' : 'text-red-600'}`}>
                    {saveBeforeSwitchMessage}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
