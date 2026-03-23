import { useState } from 'react';
import { Download, Cloud, Save, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import type { GenerationResult, SalesforceConnection } from '../types';

type DeployApiResponse = {
  success?: boolean;
  status?: string;
  numberComponentsDeployed?: number;
  numberComponentErrors?: number;
  details?: {
    componentFailures?: Array<{ fileName?: string; fullName?: string; problem?: string }> | { fileName?: string; fullName?: string; problem?: string };
    runTestResult?: {
      numFailures?: number;
      failures?: Array<{ name?: string; methodName?: string; message?: string }> | { name?: string; methodName?: string; message?: string };
    };
  } | null;
};

type SalesforceMetadataResponse = {
  objects?: Array<{ name: string }>;
  fieldsByObject?: Record<string, string[]>;
};

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatDeployFailure(res: DeployApiResponse): string {
  const componentErrors = Number(res.numberComponentErrors || 0);
  const status = res.status || 'Failed';

  const componentFailures = asArray(res.details?.componentFailures);
  const firstComponentFailure = componentFailures[0];

  const testFailures = asArray(res.details?.runTestResult?.failures);
  const firstTestFailure = testFailures[0];
  const numTestFailures = Number(res.details?.runTestResult?.numFailures || testFailures.length || 0);

  if (numTestFailures > 0 && firstTestFailure) {
    const testName = [firstTestFailure.name, firstTestFailure.methodName].filter(Boolean).join('.');
    return `Deployment failed (${status}): ${numTestFailures} test failure(s). ${testName ? `${testName}: ` : ''}${firstTestFailure.message || 'See Salesforce deployment details.'}`;
  }

  if (componentErrors > 0 && firstComponentFailure) {
    const where = firstComponentFailure.fullName || firstComponentFailure.fileName || 'Component';
    return `Deployment failed (${status}): ${componentErrors} component error(s). ${where}: ${firstComponentFailure.problem || 'See Salesforce deployment details.'}`;
  }

  if (componentErrors > 0) {
    return `Deployment failed (${status}): ${componentErrors} component error(s).`;
  }

  if (firstComponentFailure?.problem) {
    return `Deployment failed (${status}): ${firstComponentFailure.problem}`;
  }

  return `Deployment failed (${status}) with no component errors. This commonly indicates test failures or org-level deployment rules.`;
}

function extractCustomObjectRefs(artifacts: GenerationResult['components']): string[] {
  const objects = new Set<string>();

  for (const comp of artifacts) {
    const content = String(comp.content || '');
    const fromMatches = content.matchAll(/\bfrom\s+([A-Za-z][A-Za-z0-9_]*)\b/gi);
    for (const match of fromMatches) {
      const candidate = String(match[1] || '').trim();
      if (/__c$|__mdt$/i.test(candidate)) objects.add(candidate);
    }

    const objectApiMatches = content.matchAll(/object-api-name\s*=\s*"([A-Za-z][A-Za-z0-9_]*)"/gi);
    for (const match of objectApiMatches) {
      const candidate = String(match[1] || '').trim();
      if (/__c$|__mdt$/i.test(candidate)) objects.add(candidate);
    }
  }

  return [...objects];
}

function extractCustomFieldRefs(artifacts: GenerationResult['components']): string[] {
  const fields = new Set<string>();
  for (const comp of artifacts) {
    const content = String(comp.content || '');
    const matches = content.matchAll(/\b([A-Za-z][A-Za-z0-9_]*__c)\b/g);
    for (const match of matches) {
      fields.add(String(match[1] || '').trim());
    }
  }
  return [...fields];
}

async function validateAgainstOrgMetadata(sessionId: string, artifacts: GenerationResult['components']): Promise<string | null> {
  const customObjects = extractCustomObjectRefs(artifacts);
  const customFields = extractCustomFieldRefs(artifacts);

  if (customObjects.length === 0 && customFields.length === 0) return null;

  const metadata = await api.salesforce.metadata(sessionId, customObjects) as SalesforceMetadataResponse;
  const availableObjects = new Set((metadata.objects || []).map(o => o.name));
  const fieldsByObject = metadata.fieldsByObject || {};

  const missingObjects = customObjects.filter(obj => !availableObjects.has(obj));
  if (missingObjects.length > 0) {
    return `Pre-deploy validation failed: missing object(s) in org metadata: ${missingObjects.join(', ')}.`;
  }

  if (customFields.length > 0 && customObjects.length > 0) {
    const allFields = new Set<string>();
    for (const objectName of customObjects) {
      for (const fieldName of fieldsByObject[objectName] || []) {
        allFields.add(fieldName);
      }
    }

    const missingFields = customFields.filter(field => !allFields.has(field));
    if (missingFields.length > 0) {
      return `Pre-deploy validation failed: missing field(s) in org metadata: ${missingFields.join(', ')}.`;
    }
  }

  return null;
}

interface Props {
  result: GenerationResult;
  componentName: string;
  prompt: string;
  componentType: string;
  sfConnection: SalesforceConnection | null;
  onSaved: () => void;
  showLibraryActions?: boolean;
  showDeployActions?: boolean;
  inline?: boolean;
  compact?: boolean;
}

export default function DeployPanel({
  result,
  componentName,
  prompt,
  componentType,
  sfConnection,
  onSaved,
  showLibraryActions = true,
  showDeployActions = true,
  inline = false,
  compact = false,
}: Props) {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [deployStatus, setDeployStatus] = useState<'idle' | 'deploying' | 'success' | 'error'>('idle');
  const [deployMessage, setDeployMessage] = useState('');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState(componentName);
  const inlineDeployButtonClass = 'w-full h-[68px] px-3 bg-gradient-to-r from-violet-500 to-blue-500 hover:opacity-90 disabled:opacity-60 text-white rounded-xl transition-colors flex items-center gap-2';
  const compactDeployButtonClass = 'inline-flex items-center gap-2 px-4 h-10 bg-gradient-to-r from-violet-500 to-blue-500 hover:opacity-90 disabled:opacity-60 text-white rounded-xl transition-opacity text-sm';
  const regularDeployButtonClass = 'flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gradient-to-r from-violet-500 to-blue-500 hover:opacity-90 disabled:opacity-60 text-white rounded-lg transition-colors';

  async function handleDownload() {
    try {
      const blob = await api.deploy.downloadPackage(result, componentName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${componentName || 'salesforce-package'}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }

  async function handleSave() {
    if (!saveName.trim()) return;
    setSaveStatus('saving');
    try {
      await api.components.save({
        name: saveName.trim(),
        prompt,
        componentType,
        components: result.components,
        summary: result.summary,
        governorLimitNotes: result.governorLimitNotes,
        deploymentSteps: result.deploymentSteps,
        dependencies: result.dependencies,
      });
      setSaveStatus('saved');
      setSaveModalOpen(false);
      onSaved();
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }

  async function handleDeployToSalesforce() {
    if (!sfConnection) return;
    setDeployStatus('deploying');
    setDeployMessage('');
    try {
      const validationError = await validateAgainstOrgMetadata(sfConnection.sessionId, result.components);
      if (validationError) {
        setDeployStatus('error');
        setDeployMessage(validationError);
        return;
      }

      const res = await api.deploy.toSalesforce(sfConnection.sessionId, result) as DeployApiResponse;
      if (res.success === true || res.status === 'Succeeded') {
        setDeployStatus('success');
        setDeployMessage(`Deployed ${res.numberComponentsDeployed || 0} components successfully.`);
      } else {
        setDeployStatus('error');
        setDeployMessage(formatDeployFailure(res));
      }
    } catch (err: unknown) {
      setDeployStatus('error');
      setDeployMessage(err instanceof Error ? err.message : 'Deployment failed');
    }
  }

  const fullDeployLabel = sfConnection ? `Deploy to ${sfConnection.username}` : 'Deploy to Salesforce';

  return (
    <div className={inline ? 'shrink-0' : 'p-4 border-t border-black/10 bg-white shrink-0'}>
      <div className="flex items-center gap-2 flex-wrap">
        {showLibraryActions && (
          <>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors border border-blue-200 ring-1 ring-blue-100 shadow-sm"
            >
              <Download size={14} />
              Download ZIP
            </button>

            <button
              onClick={() => { setSaveName(componentName); setSaveModalOpen(true); }}
              disabled={saveStatus === 'saving' || saveStatus === 'saved'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-violet-500 to-blue-500 hover:opacity-90 disabled:opacity-60 text-white rounded-lg transition-colors shadow-sm"
            >
              {saveStatus === 'saving' ? <Loader2 size={14} className="animate-spin" /> :
               saveStatus === 'saved' ? <CheckCircle2 size={14} className="text-green-400" /> :
               saveStatus === 'error' ? <AlertCircle size={14} className="text-red-500" /> :
               <Save size={14} />}
              {saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Save failed' : 'Save to Library'}
            </button>
          </>
        )}

        {showDeployActions && (
          sfConnection ? (
            <div className={compact ? 'relative inline-flex group' : 'inline-flex'}>
              <button
                onClick={handleDeployToSalesforce}
                disabled={deployStatus === 'deploying'}
                title={compact ? fullDeployLabel : undefined}
                className={compact ? compactDeployButtonClass : inline ? inlineDeployButtonClass : regularDeployButtonClass}
              >
                {deployStatus === 'deploying' ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Cloud size={14} className="shrink-0" />}
                {inline && !compact ? (
                  <span className="min-w-0 flex-1 text-left leading-tight">
                    <span className="block text-xs font-medium text-white">
                      {deployStatus === 'deploying' ? 'Deploying...' : 'Deploy to Salesforce'}
                    </span>
                    <span className="block text-xs text-white/85 truncate">{sfConnection.username}</span>
                  </span>
                ) : (
                  <span>{deployStatus === 'deploying' ? 'Deploying...' : compact ? 'Deploy' : `Deploy to ${sfConnection.username}`}</span>
                )}
              </button>

              {compact && deployStatus !== 'deploying' && (
                <div className="absolute right-0 top-full mt-2 z-20 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity">
                  <div className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-[11px] text-[#717182] whitespace-nowrap shadow-sm">
                    {fullDeployLabel}
                  </div>
                </div>
              )}
            </div>
          ) : null
        )}

        {/* Deploy status */}
        {showDeployActions && deployMessage && !inline && (
          <span className={`text-xs flex items-center gap-1 ${deployStatus === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {deployStatus === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {deployMessage}
          </span>
        )}
      </div>

      {/* Save modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white border border-black/10 rounded-xl p-5 sm:p-6 w-full max-w-sm mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-semibold text-[#09090b] mb-3">Save to Library</h3>
            <input
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Component name..."
              className="w-full bg-white border border-black/10 text-[#09090b] text-sm rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-violet-500"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setSaveModalOpen(false)}
                className="flex-1 py-2 text-sm bg-[#f3f3f5] hover:bg-[#e9ebef] text-[#52525b] rounded-lg transition-colors border border-black/10"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!saveName.trim() || saveStatus === 'saving'}
                className="flex-1 py-2 text-sm bg-gradient-to-r from-violet-500 to-blue-500 hover:opacity-90 disabled:opacity-60 text-white rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
