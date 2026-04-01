'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as RadixPopover from '@radix-ui/react-popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { resolveAgentVoice, getAvailableProvidersWithVoices } from '@/lib/audio/voice-resolver';
import { playBrowserTTSPreview } from '@/lib/audio/browser-tts-preview';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Shuffle,
  Volume2,
  VolumeX,
  Loader2,
  MessageSquare,
  Minus,
  Plus,
} from 'lucide-react';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import type { TTSProviderId } from '@/lib/audio/types';
import type { ProviderWithVoices } from '@/lib/audio/voice-resolver';

function AgentVoicePill({
  agent,
  agentIndex,
  availableProviders,
  disabled,
}: {
  agent: AgentConfig;
  agentIndex: number;
  availableProviders: ProviderWithVoices[];
  disabled?: boolean;
}) {
  const updateAgent = useAgentRegistry((s) => s.updateAgent);
  const ttsProvidersConfig = useSettingsStore((s) => s.ttsProvidersConfig);
  const resolved = resolveAgentVoice(agent, agentIndex, availableProviders);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewCancelRef = useRef<(() => void) | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  const displayName = (() => {
    for (const p of availableProviders) {
      if (p.providerId === resolved.providerId) {
        const v = p.voices.find((voice) => voice.id === resolved.voiceId);
        if (v) return v.name;
      }
    }
    return resolved.voiceId;
  })();

  const stopPreview = useCallback(() => {
    previewCancelRef.current?.();
    previewCancelRef.current = null;
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = '';
      previewAudioRef.current = null;
    }
    setPreviewingId(null);
  }, []);

  const handlePreview = useCallback(
    async (providerId: TTSProviderId, voiceId: string, modelId?: string) => {
      const key = `${providerId}::${voiceId}`;
      if (previewingId === key) {
        stopPreview();
        return;
      }
      stopPreview();
      setPreviewingId(key);

      const courseLanguage =
        (typeof localStorage !== 'undefined' && localStorage.getItem('generationLanguage')) ||
        'zh-CN';
      const previewText = courseLanguage === 'en-US' ? 'Welcome to AI Classroom' : '欢迎来到AI课堂';

      if (providerId === 'browser-native-tts') {
        const { promise, cancel } = playBrowserTTSPreview({ text: previewText, voice: voiceId });
        previewCancelRef.current = cancel;
        try {
          await promise;
        } catch {
          // ignore abort
        }
        setPreviewingId(null);
        return;
      }

      // Server TTS
      try {
        const controller = new AbortController();
        previewAbortRef.current = controller;
        const providerConfig = ttsProvidersConfig[providerId];
        const res = await fetch('/api/generate/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: previewText,
            audioId: 'voice-preview',
            ttsProviderId: providerId,
            ttsModelId: modelId || providerConfig?.modelId,
            ttsVoice: voiceId,
            ttsSpeed: 1,
            ttsApiKey: providerConfig?.apiKey,
            ttsBaseUrl: providerConfig?.serverBaseUrl || providerConfig?.baseUrl,
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('TTS error');
        const data = await res.json();
        if (!data.base64) throw new Error('No audio');

        const audio = new Audio(`data:audio/${data.format || 'mp3'};base64,${data.base64}`);
        previewAudioRef.current = audio;
        audio.addEventListener('ended', () => setPreviewingId(null));
        audio.addEventListener('error', () => setPreviewingId(null));
        await audio.play();
      } catch {
        setPreviewingId(null);
      }
    },
    [previewingId, stopPreview, ttsProvidersConfig],
  );

  // Cleanup on unmount
  useEffect(() => () => stopPreview(), [stopPreview]);

  if (disabled) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex items-center gap-1.5 h-6 w-[100px] rounded-full bg-muted/40 px-2.5 text-[11px] text-muted-foreground/30 shrink-0 cursor-not-allowed"
      >
        <VolumeX className="size-3 shrink-0" />
        <span className="truncate flex-1 text-left">{displayName}</span>
      </div>
    );
  }

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={(open) => {
        setPopoverOpen(open);
        if (!open) stopPreview();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 h-6 w-[100px] rounded-full bg-primary/10 hover:bg-primary/20 dark:bg-primary/25 dark:hover:bg-primary/35 px-2.5 text-[11px] text-primary/80 hover:text-primary dark:text-primary/90 transition-colors shrink-0 cursor-pointer"
        >
          <Volume2 className="size-3 shrink-0" />
          <span className="truncate flex-1 text-left">{displayName}</span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        className="w-56 px-1 pb-1 pt-0 max-h-64 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {availableProviders.map((provider) =>
          provider.modelGroups.map((group) => (
            <div key={`${provider.providerId}::${group.modelId}`}>
              <div className="text-[11px] text-muted-foreground/60 font-medium px-2 py-1 sticky top-0 bg-popover">
                {group.modelId
                  ? `${provider.providerName} · ${group.modelName}`
                  : provider.providerName}
              </div>
              {group.voices.map((voice) => {
                const isActive =
                  resolved.providerId === provider.providerId &&
                  resolved.voiceId === voice.id &&
                  (resolved.modelId || '') === (group.modelId || '');
                const previewKey = `${provider.providerId}::${voice.id}`;
                const isPreviewing = previewingId === previewKey;
                return (
                  <div
                    key={previewKey}
                    className={cn(
                      'flex items-center gap-1.5 rounded-sm transition-colors',
                      isActive ? 'bg-primary/10' : 'hover:bg-muted',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        updateAgent(agent.id, {
                          voiceConfig: {
                            providerId: provider.providerId,
                            modelId: group.modelId || undefined,
                            voiceId: voice.id,
                          },
                        });
                        setPopoverOpen(false);
                      }}
                      className={cn(
                        'flex-1 text-left text-[13px] px-2 py-1.5 min-w-0 truncate',
                        isActive ? 'text-primary font-medium' : 'text-foreground',
                      )}
                    >
                      {voice.name}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(provider.providerId, voice.id, group.modelId);
                      }}
                      className={cn(
                        'shrink-0 size-6 flex items-center justify-center rounded-sm transition-colors',
                        isPreviewing
                          ? 'text-primary'
                          : 'text-muted-foreground/40 hover:text-muted-foreground',
                      )}
                    >
                      {isPreviewing ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Volume2 className="size-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )),
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Teacher voice pill — reads/writes global ttsProviderId + ttsVoice (single source of truth).
 * This ensures lecture and discussion use the same voice for the teacher.
 */
function TeacherVoicePill({
  availableProviders,
  disabled,
}: {
  availableProviders: ProviderWithVoices[];
  disabled?: boolean;
}) {
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const setTTSProvider = useSettingsStore((s) => s.setTTSProvider);
  const setTTSVoice = useSettingsStore((s) => s.setTTSVoice);
  const setTTSProviderConfig = useSettingsStore((s) => s.setTTSProviderConfig);
  const ttsProvidersConfig = useSettingsStore((s) => s.ttsProvidersConfig);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewCancelRef = useRef<(() => void) | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  const displayName = (() => {
    for (const p of availableProviders) {
      if (p.providerId === ttsProviderId) {
        const v = p.voices.find((voice) => voice.id === ttsVoice);
        if (v) return v.name;
      }
    }
    return ttsVoice || 'default';
  })();

  const stopPreview = useCallback(() => {
    previewCancelRef.current?.();
    previewCancelRef.current = null;
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = '';
      previewAudioRef.current = null;
    }
    setPreviewingId(null);
  }, []);

  const handlePreview = useCallback(
    async (providerId: TTSProviderId, voiceId: string, modelId?: string) => {
      const key = `${providerId}::${voiceId}`;
      if (previewingId === key) {
        stopPreview();
        return;
      }
      stopPreview();
      setPreviewingId(key);

      const courseLanguage =
        (typeof localStorage !== 'undefined' && localStorage.getItem('generationLanguage')) ||
        'zh-CN';
      const previewText = courseLanguage === 'en-US' ? 'Welcome to AI Classroom' : '欢迎来到AI课堂';

      if (providerId === 'browser-native-tts') {
        const { promise, cancel } = playBrowserTTSPreview({ text: previewText, voice: voiceId });
        previewCancelRef.current = cancel;
        try {
          await promise;
        } catch {
          // ignore abort
        }
        setPreviewingId(null);
        return;
      }

      try {
        const controller = new AbortController();
        previewAbortRef.current = controller;
        const providerConfig = ttsProvidersConfig[providerId];
        const res = await fetch('/api/generate/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: previewText,
            audioId: 'voice-preview',
            ttsProviderId: providerId,
            ttsModelId: modelId || providerConfig?.modelId,
            ttsVoice: voiceId,
            ttsSpeed: 1,
            ttsApiKey: providerConfig?.apiKey,
            ttsBaseUrl: providerConfig?.serverBaseUrl || providerConfig?.baseUrl,
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('TTS error');
        const data = await res.json();
        if (!data.base64) throw new Error('No audio');
        const audio = new Audio(`data:audio/${data.format || 'mp3'};base64,${data.base64}`);
        previewAudioRef.current = audio;
        audio.addEventListener('ended', () => setPreviewingId(null));
        audio.addEventListener('error', () => setPreviewingId(null));
        await audio.play();
      } catch {
        setPreviewingId(null);
      }
    },
    [previewingId, stopPreview, ttsProvidersConfig],
  );

  useEffect(() => () => stopPreview(), [stopPreview]);

  if (disabled) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex items-center gap-1.5 h-6 w-[100px] rounded-full bg-muted/40 px-2.5 text-[11px] text-muted-foreground/30 shrink-0 cursor-not-allowed"
      >
        <VolumeX className="size-3 shrink-0" />
        <span className="truncate flex-1 text-left">{displayName}</span>
      </div>
    );
  }

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={(open) => {
        setPopoverOpen(open);
        if (!open) stopPreview();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 h-6 w-[100px] rounded-full bg-primary/10 hover:bg-primary/20 dark:bg-primary/25 dark:hover:bg-primary/35 px-2.5 text-[11px] text-primary/80 hover:text-primary dark:text-primary/90 transition-colors shrink-0 cursor-pointer"
        >
          <Volume2 className="size-3 shrink-0" />
          <span className="truncate flex-1 text-left">{displayName}</span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        className="w-56 px-1 pb-1 pt-0 max-h-64 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {availableProviders.map((provider) =>
          provider.modelGroups.map((group) => (
            <div key={`${provider.providerId}::${group.modelId}`}>
              <div className="text-[11px] text-muted-foreground/60 font-medium px-2 py-1 sticky top-0 bg-popover">
                {group.modelId
                  ? `${provider.providerName} · ${group.modelName}`
                  : provider.providerName}
              </div>
              {group.voices.map((voice) => {
                const currentModelId = ttsProvidersConfig[ttsProviderId]?.modelId || '';
                const isActive =
                  ttsProviderId === provider.providerId &&
                  ttsVoice === voice.id &&
                  currentModelId === (group.modelId || '');
                const previewKey = `${provider.providerId}::${voice.id}`;
                const isPreviewing = previewingId === previewKey;
                return (
                  <div
                    key={previewKey}
                    className={cn(
                      'flex items-center gap-1.5 rounded-sm transition-colors',
                      isActive ? 'bg-primary/10' : 'hover:bg-muted',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setTTSProvider(provider.providerId);
                        setTTSVoice(voice.id);
                        if (group.modelId) {
                          setTTSProviderConfig(provider.providerId, { modelId: group.modelId });
                        }
                        setPopoverOpen(false);
                      }}
                      className={cn(
                        'flex-1 text-left text-[13px] px-2 py-1.5 min-w-0 truncate',
                        isActive ? 'text-primary font-medium' : 'text-foreground',
                      )}
                    >
                      {voice.name}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(provider.providerId, voice.id, group.modelId);
                      }}
                      className={cn(
                        'shrink-0 size-6 flex items-center justify-center rounded-sm transition-colors',
                        isPreviewing
                          ? 'text-primary'
                          : 'text-muted-foreground/40 hover:text-muted-foreground',
                      )}
                    >
                      {isPreviewing ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Volume2 className="size-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )),
        )}
      </PopoverContent>
    </Popover>
  );
}

export function AgentBar() {
  const { t } = useI18n();
  const { listAgents } = useAgentRegistry();
  const selectedAgentIds = useSettingsStore((s) => s.selectedAgentIds);
  const setSelectedAgentIds = useSettingsStore((s) => s.setSelectedAgentIds);
  const maxTurns = useSettingsStore((s) => s.maxTurns);
  const setMaxTurns = useSettingsStore((s) => s.setMaxTurns);
  const agentMode = useSettingsStore((s) => s.agentMode);
  const setAgentMode = useSettingsStore((s) => s.setAgentMode);
  const ttsProvidersConfig = useSettingsStore((s) => s.ttsProvidersConfig);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);

  const [open, setOpen] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Load browser native TTS voices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const loadVoices = () => setBrowserVoices(speechSynthesis.getVoices());
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  const allAgents = listAgents();
  const agents = allAgents.filter((a) => !a.isGenerated);
  const teacherAgent = agents.find((a) => a.role === 'teacher');
  const selectedAgents = agents.filter((a) => selectedAgentIds.includes(a.id));
  const nonTeacherSelected = selectedAgents.filter((a) => a.role !== 'teacher');

  const serverProviders = getAvailableProvidersWithVoices(ttsProvidersConfig);
  const availableProviders: ProviderWithVoices[] = [
    ...serverProviders,
    ...(browserVoices.length > 0
      ? [
          {
            providerId: 'browser-native-tts' as TTSProviderId,
            providerName: 'Browser Native',
            voices: browserVoices.map((v) => ({ id: v.voiceURI, name: v.name })),
            modelGroups: [
              {
                modelId: '',
                modelName: 'Browser Native',
                voices: browserVoices.map((v) => ({ id: v.voiceURI, name: v.name })),
              },
            ],
          },
        ]
      : []),
  ];
  const showVoice = availableProviders.length > 0;

  const handleModeChange = (mode: 'preset' | 'auto') => {
    setAgentMode(mode);
    if (mode === 'preset') {
      // Remove stale auto-generated agent IDs that may linger from a previous auto classroom
      const presetIds = selectedAgentIds.filter((id) => agents.some((a) => a.id === id));
      const hasTeacher = presetIds.some((id) => {
        const a = agents.find((agent) => agent.id === id);
        return a?.role === 'teacher';
      });
      if (!hasTeacher && teacherAgent) {
        presetIds.unshift(teacherAgent.id);
      }
      setSelectedAgentIds(
        presetIds.length > 0 ? presetIds : ['default-1', 'default-2', 'default-3'],
      );
    }
  };

  const toggleAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (agent?.role === 'teacher') return;
    if (selectedAgentIds.includes(agentId)) {
      setSelectedAgentIds(selectedAgentIds.filter((id) => id !== agentId));
    } else {
      setSelectedAgentIds([...selectedAgentIds, agentId]);
    }
  };

  const getAgentName = (agent: { id: string; name: string }) => {
    const key = `settings.agentNames.${agent.id}`;
    const translated = t(key);
    return translated !== key ? translated : agent.name;
  };

  const getAgentRole = (agent: { role: string }) => {
    const key = `settings.agentRoles.${agent.role}`;
    const translated = t(key);
    return translated !== key ? translated : agent.role;
  };

  const avatarRow = (
    <div className="flex items-center gap-1.5 shrink-0">
      {teacherAgent && (
        <div className="size-8 rounded-full overflow-hidden ring-2 ring-blue-400/40 dark:ring-blue-500/30 shrink-0">
          <img
            src={teacherAgent.avatar}
            alt={getAgentName(teacherAgent)}
            className="size-full object-cover"
          />
        </div>
      )}

      {agentMode === 'auto' ? (
        <>
          <div className="flex -space-x-2">
            {agents.find((a) => a.role === 'assistant') && (
              <div className="size-6 rounded-full overflow-hidden ring-[1.5px] ring-background">
                <img
                  src={agents.find((a) => a.role === 'assistant')!.avatar}
                  alt=""
                  className="size-full object-cover"
                />
              </div>
            )}
          </div>
          <Shuffle className="size-4 text-violet-400 dark:text-violet-500" />
        </>
      ) : (
        <>
          {nonTeacherSelected.length > 0 && (
            <div className="flex -space-x-2">
              {nonTeacherSelected.slice(0, 4).map((agent) => (
                <div
                  key={agent.id}
                  className="size-6 rounded-full overflow-hidden ring-[1.5px] ring-background"
                >
                  <img
                    src={agent.avatar}
                    alt={getAgentName(agent)}
                    className="size-full object-cover"
                  />
                </div>
              ))}
              {nonTeacherSelected.length > 4 && (
                <div className="size-6 rounded-full bg-muted ring-[1.5px] ring-background flex items-center justify-center">
                  <span className="text-[9px] font-bold text-muted-foreground">
                    +{nonTeacherSelected.length - 4}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {showVoice &&
        (ttsEnabled ? (
          <Volume2 className="size-3.5 text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors" />
        ) : (
          <VolumeX className="size-3.5 text-muted-foreground/30" />
        ))}
    </div>
  );

  const renderAgentRow = (agent: AgentConfig, agentIndex: number, isTeacher: boolean) => {
    const isSelected = isTeacher || selectedAgentIds.includes(agent.id);
    return (
      <div
        key={agent.id}
        onClick={isTeacher ? undefined : () => toggleAgent(agent.id)}
        className={cn(
          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors',
          isTeacher ? 'bg-primary/5' : 'cursor-pointer',
          !isTeacher && isSelected && 'bg-primary/5',
          !isTeacher && !isSelected && 'hover:bg-muted/50',
        )}
      >
        <Checkbox
          checked={isSelected}
          disabled={isTeacher}
          className={cn('pointer-events-none', isTeacher && 'opacity-50')}
        />
        <div
          className="size-7 rounded-full overflow-hidden shrink-0 ring-1 ring-border/40"
          style={{ boxShadow: isSelected ? `0 0 0 2px ${agent.color}30` : undefined }}
        >
          <img src={agent.avatar} alt={getAgentName(agent)} className="size-full object-cover" />
        </div>
        <span className="text-[13px] font-medium truncate min-w-0 flex-1">
          {getAgentName(agent)}
        </span>
        <span className="text-[10px] text-muted-foreground/50 shrink-0 w-[52px] text-right">
          {getAgentRole(agent)}
        </span>
        {showVoice && (
          <AgentVoicePill
            agent={agent}
            agentIndex={agentIndex}
            availableProviders={availableProviders}
            disabled={!ttsEnabled}
          />
        )}
      </div>
    );
  };

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <div className="relative w-96">
        <RadixPopover.Trigger asChild>
          <button
            type="button"
            aria-expanded={open}
            title={open ? t('agentBar.expandedTitle') : t('agentBar.configTooltip')}
            className={cn(
              'group flex w-full cursor-pointer items-center gap-2 rounded-full border border-border/50 px-2.5 py-2 transition-all',
              'text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <span className="hidden flex-1 truncate text-left text-xs font-medium text-muted-foreground/60 transition-colors group-hover:text-muted-foreground sm:block">
              {open ? t('agentBar.expandedTitle') : t('agentBar.readyToLearn')}
            </span>
            {avatarRow}
            {open ? (
              <ChevronUp className="size-3 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground/70" />
            ) : (
              <ChevronDown className="size-3 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground/70" />
            )}
          </button>
        </RadixPopover.Trigger>
      </div>

      <RadixPopover.Portal>
        {open && (
          <RadixPopover.Content
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="z-50 w-96 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
          >
            <div className="rounded-2xl bg-white/95 px-2 py-1.5 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] backdrop-blur-sm dark:bg-slate-800/95 dark:ring-white/[0.06] dark:shadow-[0_1px_8px_-2px_rgba(0,0,0,0.3)]">
              {/* Teacher — always visible */}
              {teacherAgent && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-primary/5 px-2.5 py-1.5">
                  <div
                    className="size-7 shrink-0 overflow-hidden rounded-full ring-1 ring-border/40"
                    style={{ boxShadow: `0 0 0 2px ${teacherAgent.color}30` }}
                  >
                    <img
                      src={teacherAgent.avatar}
                      alt={getAgentName(teacherAgent)}
                      className="size-full object-cover"
                    />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {getAgentName(teacherAgent)}
                  </span>
                  {showVoice && (
                    <TeacherVoicePill
                      availableProviders={availableProviders}
                      disabled={!ttsEnabled}
                    />
                  )}
                </div>
              )}

              {/* Mode tabs */}
              <div className="mb-2 flex rounded-lg border bg-muted/30 p-0.5">
                <button
                  onClick={() => handleModeChange('preset')}
                  className={cn(
                    'flex-1 rounded-md py-1.5 text-center text-xs font-medium transition-all',
                    agentMode === 'preset'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('settings.agentModePreset')}
                </button>
                <button
                  onClick={() => handleModeChange('auto')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-center text-xs font-medium transition-all',
                    agentMode === 'auto'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Sparkles className="h-3 w-3" />
                  {t('settings.agentModeAuto')}
                </button>
              </div>

              {agentMode === 'preset' ? (
                <div className="max-h-56 overflow-y-auto -mx-0.5">
                  {agents
                    .filter((a) => a.role !== 'teacher')
                    .map((agent, idx) => renderAgentRow(agent, idx + 1, false))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 pb-3 pt-6">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute size-10 animate-ping rounded-full bg-violet-400/10 [animation-duration:3s] dark:bg-violet-400/15" />
                    <div className="absolute size-12 animate-pulse rounded-full bg-violet-400/5 [animation-duration:2.5s] dark:bg-violet-400/10" />
                    <Shuffle className="relative size-5 text-violet-400 dark:text-violet-500" />
                  </div>
                  <div className="flex-1" />
                  <div className="space-y-1 text-center">
                    <p className="text-[11px] text-muted-foreground/60">
                      {t('settings.agentModeAutoDesc')}
                    </p>
                    <p className="text-[10px] text-muted-foreground/40">
                      {t('agentBar.voiceAutoAssign')}
                    </p>
                  </div>
                </div>
              )}

              {/* Max turns — compact stepper */}
              <div className="mt-1 flex items-center gap-1.5 border-t border-border/30 px-2 py-1">
                <MessageSquare className="size-3 shrink-0 text-muted-foreground/40" />
                <span className="flex-1 text-[11px] text-muted-foreground/50">
                  {t('settings.maxTurns')}
                </span>
                <div className="flex h-5 shrink-0 items-center rounded-full bg-muted/50">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const v = Math.max(1, parseInt(maxTurns || '1') - 1);
                      setMaxTurns(String(v));
                    }}
                    className="flex size-5 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Minus className="size-2.5" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={maxTurns}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      if (!raw) {
                        setMaxTurns('');
                        return;
                      }
                      const v = Math.min(20, Math.max(1, parseInt(raw)));
                      setMaxTurns(String(v));
                    }}
                    onBlur={() => {
                      if (!maxTurns || parseInt(maxTurns) < 1) setMaxTurns('1');
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-5 w-5 border-none bg-transparent text-center text-[11px] font-medium tabular-nums outline-none"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const v = Math.min(20, parseInt(maxTurns || '1') + 1);
                      setMaxTurns(String(v));
                    }}
                    className="flex size-5 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="size-2.5" />
                  </button>
                </div>
              </div>
            </div>
          </RadixPopover.Content>
        )}
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
