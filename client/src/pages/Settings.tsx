import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, CheckCircle2, XCircle, Info } from 'lucide-react';
import { api } from '../api/client';

export default function Settings() {
  const [serverStatus, setServerStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    api.health()
      .then(() => setServerStatus('ok'))
      .catch(() => setServerStatus('error'));
  }, []);

  return (
    <div className="flex-1 overflow-y-auto w-full max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
      <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-6">
        <SettingsIcon size={20} className="text-blue-400" />
        Settings
      </h1>

      {/* Server status */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Server Status</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
          {serverStatus === 'checking' && (
            <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          )}
          {serverStatus === 'ok' && <CheckCircle2 size={18} className="text-emerald-400" />}
          {serverStatus === 'error' && <XCircle size={18} className="text-red-400" />}
          <div>
            <p className="text-sm font-medium text-slate-200">
              {serverStatus === 'checking' && 'Checking server...'}
              {serverStatus === 'ok' && 'Server is running'}
              {serverStatus === 'error' && 'Server is not reachable'}
            </p>
            <p className="text-xs text-slate-500">
              {serverStatus === 'ok' && 'Connected to http://localhost:3001'}
              {serverStatus === 'error' && 'Run: npm run dev --workspace=server'}
            </p>
          </div>
        </div>
      </section>

      {/* API Key */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">OpenAI API Key</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-start gap-2 mb-3">
            <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-400">
              The OpenAI API key is configured via the <code className="bg-slate-700 px-1 py-0.5 rounded text-blue-300">OPENAI_API_KEY</code> environment variable in the server.
              Add it to <code className="bg-slate-700 px-1 py-0.5 rounded text-blue-300">server/.env</code>:
            </p>
          </div>
          <pre className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 font-mono overflow-x-auto">
{`# server/.env
OPENAI_API_KEY=sk-proj-...your-key-here`}
          </pre>
          <p className="text-xs text-slate-500 mt-2">
            Get your API key at{' '}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline"
            >
              platform.openai.com/api-keys
            </a>
          </p>
        </div>
      </section>

      {/* Model info */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">AI Model</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-200">gpt-4o</p>
              <p className="text-xs text-slate-500">OpenAI GPT-4o — optimized for code generation</p>
            </div>
            <span className="text-[10px] bg-green-500/20 text-green-300 px-2 py-1 rounded-full font-medium">Active</span>
          </div>
        </div>
      </section>

      {/* Salesforce API version */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Salesforce Configuration</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">API Version</span>
            <span className="text-slate-200 font-mono">62.0</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Package Format</span>
            <span className="text-slate-200">Metadata API (ZIP)</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Default Login URL</span>
            <span className="text-slate-200 font-mono text-xs">login.salesforce.com</span>
          </div>
        </div>
      </section>

      {/* About */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-3">About</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-sm font-semibold text-slate-100">SCG-AI — Salesforce Component Generator</p>
          <p className="text-xs text-slate-400 mt-1">v1.0.0 — Phase 1 (Core Generator)</p>
          <p className="text-xs text-slate-500 mt-2">
            AI-powered platform to generate production-ready Salesforce components from natural language.
            Powered by OpenAI GPT-4o.
          </p>
        </div>
      </section>
    </div>
  );
}
