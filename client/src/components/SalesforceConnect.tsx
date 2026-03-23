import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import type { SalesforceConnection } from '../types';

interface Props {
  connection: SalesforceConnection | null;
  onConnect: (conn: SalesforceConnection) => void;
  onDisconnect: () => void;
  compact?: boolean;
}

export default function SalesforceConnect({ connection, onConnect, onDisconnect, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    username: '',
    password: '',
    securityToken: '',
    loginUrl: 'https://login.salesforce.com',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function handleOAuthMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || data.type !== 'scg-salesforce-oauth') return;

      const payload = data.payload;
      if (!payload?.ok) {
        setError(payload?.error || 'OAuth connection failed');
        setLoading(false);
        return;
      }

      onConnect(payload.connection as SalesforceConnection);
      setLoading(false);
      setOpen(false);
      setError('');
    }

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [onConnect]);

  async function handleConnect() {
    if (!form.username || !form.password) {
      setError('Username and password are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.salesforce.connect(form) as SalesforceConnection;
      onConnect(result);
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (connection) {
      await api.salesforce.disconnect(connection.sessionId).catch(() => {});
    }
    onDisconnect();
  }

  async function handleOAuthConnect() {
    setLoading(true);
    setError('');
    try {
      const { authUrl } = await api.salesforce.oauthInit(form.loginUrl);
      const popup = window.open(authUrl, 'scg-salesforce-oauth', 'width=640,height=780,noopener,noreferrer');
      if (!popup) {
        setLoading(false);
        setError('Popup was blocked. Please allow popups and try again.');
        return;
      }

      const timer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(timer);
          setLoading(false);
        }
      }, 500);
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'OAuth connection failed');
    }
  }

  if (connection) {
    if (compact) {
      return (
        <button
          onClick={handleDisconnect}
          className="inline-flex items-center gap-2 px-4 h-10 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 hover:bg-emerald-100 transition-colors"
          title={connection.username}
        >
          <CheckCircle2 size={15} className="shrink-0" />
          Connected
        </button>
      );
    }

    return (
      <div className="flex items-center gap-2 px-3 h-[68px] bg-emerald-50 border border-emerald-200 rounded-xl">
        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-emerald-700">Connected</p>
          <p className="text-xs text-[#717182] truncate">{connection.username}</p>
        </div>
        <button
          onClick={handleDisconnect}
          className="text-xs text-[#717182] hover:text-[#09090b] flex items-center gap-1"
        >
          <CloudOff size={14} />
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={compact
          ? 'inline-flex items-center gap-2 px-4 h-10 bg-white hover:bg-[#f9f9fb] border border-black/10 rounded-xl transition-colors text-sm text-[#09090b]'
          : 'flex items-center gap-2 w-full px-3 h-[68px] bg-white hover:bg-[#f9f9fb] border border-black/10 rounded-xl transition-colors text-left'}
      >
        <Cloud size={16} className="text-[#717182]" />
        {compact ? (
          <span className="font-medium">Connect Salesforce</span>
        ) : (
          <div>
            <p className="text-xs font-medium text-[#52525b]">Connect Salesforce Org</p>
            <p className="text-xs text-[#a1a1aa]">Required for direct deployment</p>
          </div>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white border border-black/10 rounded-xl p-5 sm:p-6 w-full max-w-md mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-[#09090b] mb-1">Connect to Salesforce</h3>
            <p className="text-xs text-[#717182] mb-4">Your credentials are only used for this session and are never stored.</p>

            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#717182] mb-1">Environment</label>
                <select
                  value={form.loginUrl}
                  onChange={e => setForm(f => ({ ...f, loginUrl: e.target.value }))}
                  className="w-full bg-white border border-black/10 text-[#09090b] text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="https://login.salesforce.com">Production / Developer</option>
                  <option value="https://test.salesforce.com">Sandbox</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#717182] mb-1">Username</label>
                <input
                  type="email"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="user@example.com"
                  className="w-full bg-white border border-black/10 text-[#09090b] text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#717182] mb-1">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full bg-white border border-black/10 text-[#09090b] text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#717182] mb-1">Security Token <span className="text-[#a1a1aa]">(optional)</span></label>
                <input
                  type="password"
                  value={form.securityToken}
                  onChange={e => setForm(f => ({ ...f, securityToken: e.target.value }))}
                  placeholder="Appended to password if required"
                  className="w-full bg-white border border-black/10 text-[#09090b] text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <p className="text-[11px] text-[#717182] border-t border-black/10 pt-3">
                Recommended: use OAuth Connect below. Username/password login may fail in orgs where SOAP login is disabled.
              </p>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2 text-sm bg-[#f3f3f5] hover:bg-[#e9ebef] text-[#52525b] rounded-lg transition-colors border border-black/10"
              >
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={loading}
                className="flex-1 py-2 text-sm bg-gradient-to-r from-violet-500 to-blue-500 hover:opacity-90 disabled:opacity-60 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {loading ? 'Connecting...' : 'Connect'}
              </button>
            </div>

            <button
              onClick={handleOAuthConnect}
              disabled={loading}
              className="w-full mt-2 py-2 text-sm bg-white border border-violet-300 text-violet-700 hover:bg-violet-50 disabled:opacity-60 rounded-lg transition-colors"
            >
              Connect with Salesforce OAuth
            </button>
          </div>
        </div>
      )}
    </>
  );
}
