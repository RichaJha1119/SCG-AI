import { useState } from 'react';
import { Copy, Check, FileCode2, Eye } from 'lucide-react';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import java from 'react-syntax-highlighter/dist/esm/languages/hljs/java';
import xml from 'react-syntax-highlighter/dist/esm/languages/hljs/xml';
import css from 'react-syntax-highlighter/dist/esm/languages/hljs/css';
import markdown from 'react-syntax-highlighter/dist/esm/languages/hljs/markdown';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import type { GeneratedArtifact, ComponentType } from '../types';
import PreviewPanel from './PreviewPanel';

// Register only the languages used by generated artifacts.
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('xml', xml);
SyntaxHighlighter.registerLanguage('html', xml);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('markdown', markdown);

function getLanguage(type: string, extension: string): string {
  if (type.includes('LWC_HTML') || extension === '.html') return 'html';
  if (type.includes('LWC_CSS') || extension === '.css') return 'css';
  if (type.includes('LWC_META') || extension === '.xml') return 'xml';
  if (extension === '.md') return 'markdown';
  return 'java'; // Apex is Java-like
}

function getTabLabel(artifact: GeneratedArtifact): string {
  const labels: Record<string, string> = {
    ApexClass: 'Class',
    ApexTrigger: 'Trigger',
    ApexTestClass: 'Test',
    LWC_HTML: 'HTML',
    LWC_JS: 'JS',
    LWC_CSS: 'CSS',
    LWC_META: 'Meta',
    Documentation: 'Docs',
  };
  return labels[artifact.type] || artifact.type;
}

interface Props {
  artifacts: GeneratedArtifact[];
  componentType?: ComponentType;
  summary?: string;
  governorLimitNotes?: string[];
  deploymentSteps?: string[];
  dependencies?: string[];
}

export default function CodeViewer({
  artifacts,
  componentType,
  summary,
  governorLimitNotes,
  deploymentSteps,
  dependencies,
}: Props) {
  const [activeTab, setActiveTab] = useState<'preview' | number>('preview');
  const [copied, setCopied] = useState(false);

  if (!artifacts.length) return null;

  const isPreview = activeTab === 'preview';
  const activeIndex = isPreview ? 0 : (activeTab as number);
  const active = artifacts[activeIndex] || artifacts[0];
  const lang = getLanguage(active.type, active.extension || '');

  async function copyCode() {
    await navigator.clipboard.writeText(active.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col h-full bg-[#060c22]">
      {/* Tab bar */}
      <div className="flex items-center border-b border-indigo-500/20 bg-[#0b1334]/85 backdrop-blur overflow-x-auto shrink-0">
        {/* Preview tab — always first */}
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
            isPreview
              ? 'border-violet-400 text-violet-200 bg-[#121a40]'
              : 'border-transparent text-[#9aa4cf] hover:text-[#e2e8ff] hover:bg-[#111a45]'
          }`}
        >
          <Eye size={12} />
          Preview
        </button>

        {/* Artifact tabs */}
        {artifacts.map((artifact, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              !isPreview && i === (activeTab as number)
                ? 'border-violet-400 text-violet-200 bg-[#121a40]'
                : 'border-transparent text-[#9aa4cf] hover:text-[#e2e8ff] hover:bg-[#111a45]'
            }`}
          >
            <FileCode2 size={12} />
            {getTabLabel(artifact)}
            <span className="text-[#7e8bb8] text-[10px]">{artifact.name}{artifact.extension}</span>
          </button>
        ))}

        {/* Copy button — only shown on code tabs */}
        {!isPreview && (
          <div className="ml-auto pr-3 shrink-0">
            <button
              onClick={copyCode}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#9aa4cf] hover:text-[#edf2ff] hover:bg-[#111a45] rounded-md transition-colors border border-indigo-400/20"
            >
              {copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {isPreview ? (
          <PreviewPanel
            artifacts={artifacts}
            componentType={componentType ?? 'apex-class'}
            summary={summary ?? ''}
            governorLimitNotes={governorLimitNotes}
            deploymentSteps={deploymentSteps}
            dependencies={dependencies}
          />
        ) : (
          <div className="h-full overflow-auto scrollbar-hidden bg-[#050b1f]">
            <SyntaxHighlighter
              language={lang}
              style={atomOneDark}
              customStyle={{
                margin: 0,
                padding: '1rem',
                background: '#050b1f',
                fontSize: '13px',
                lineHeight: '1.6',
                minHeight: '100%',
              }}
              showLineNumbers
              lineNumberStyle={{ color: '#6373a8', fontSize: '11px', minWidth: '2.5em' }}
            >
              {active.content}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    </div>
  );
}
