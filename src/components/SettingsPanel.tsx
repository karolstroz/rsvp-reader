'use client';

import { useEffect, useRef } from 'react';
import { useReaderStore, WPM_MAX, WPM_MIN, WPM_STEP } from '@/store/useReaderStore';
import type { FontFamily, ThemeName } from '@/types';
import { CloseIcon } from './icons';

const THEMES: { value: ThemeName; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'contrast', label: 'High contrast' },
];

const FONTS: { value: FontFamily; label: string; hint: string }[] = [
  { value: 'sans', label: 'Sans', hint: 'Inter / system' },
  { value: 'serif', label: 'Serif', hint: 'Long-form feel' },
  { value: 'mono', label: 'Mono', hint: 'Even letter widths' },
];

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

/** Slide-over settings sheet. Bound directly to the persisted store. */
export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const settings = useReaderStore((state) => state.settings);
  const updateSettings = useReaderStore((state) => state.updateSettings);
  const resetSettings = useReaderStore((state) => state.resetSettings);

  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes the sheet; focus moves in so the controls are reachable by
  // keyboard as soon as it opens.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    panelRef.current?.focus();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Reader settings"
        tabIndex={-1}
        className="relative flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-line bg-surface p-5 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink"
            aria-label="Close settings"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-6">
          <Field
            label="Reading speed"
            value={`${settings.wpm} WPM`}
            hint={`${WPM_MIN}–${WPM_MAX}, steps of ${WPM_STEP}`}
          >
            <input
              type="range"
              min={WPM_MIN}
              max={WPM_MAX}
              step={WPM_STEP}
              value={settings.wpm}
              onChange={(event) => updateSettings({ wpm: Number(event.target.value) })}
              aria-label="Reading speed in words per minute"
            />
          </Field>

          <Field
            label="Words per frame"
            value={String(settings.chunkSize)}
            hint="More words per frame trades precision for throughput"
          >
            <SegmentedControl
              options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
              value={settings.chunkSize}
              onChange={(chunkSize) => updateSettings({ chunkSize })}
              ariaLabel="Words shown per frame"
            />
          </Field>

          <Field label="Text size" value={`${settings.fontSize}px`}>
            <input
              type="range"
              min={24}
              max={140}
              step={2}
              value={settings.fontSize}
              onChange={(event) => updateSettings({ fontSize: Number(event.target.value) })}
              aria-label="Text size"
            />
          </Field>

          <Field label="Typeface">
            <SegmentedControl
              options={FONTS.map((font) => ({ value: font.value, label: font.label }))}
              value={settings.fontFamily}
              onChange={(fontFamily) => updateSettings({ fontFamily })}
              ariaLabel="Typeface"
            />
            <p className="mt-2 text-xs text-muted">
              {FONTS.find((font) => font.value === settings.fontFamily)?.hint}
            </p>
          </Field>

          <Field label="Theme">
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((theme) => (
                <button
                  key={theme.value}
                  type="button"
                  onClick={() => updateSettings({ theme: theme.value })}
                  aria-pressed={settings.theme === theme.value}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    settings.theme === theme.value
                      ? 'border-accent bg-raised text-ink'
                      : 'border-line text-muted hover:border-accent-soft hover:text-ink'
                  }`}
                >
                  {theme.label}
                </button>
              ))}
            </div>
          </Field>

          <Toggle
            label="Smart pacing"
            description="Pause longer at commas, full stops and paragraph breaks, and give long words more time."
            checked={settings.smartPacing}
            onChange={(smartPacing) => updateSettings({ smartPacing })}
          />

          <Toggle
            label="Strip punctuation"
            description="Hide commas, dashes and quotes attached to a word while it is on screen. Pacing still uses them."
            checked={settings.stripPunctuation}
            onChange={(stripPunctuation) => updateSettings({ stripPunctuation })}
          />

          <Toggle
            label="Bionic reading"
            description="Bold the leading letters of each word in the full-text view."
            checked={settings.bionic}
            onChange={(bionic) => updateSettings({ bionic })}
          />

          <Toggle
            label="Focus guides"
            description="Show the tick marks that frame the highlighted ORP letter."
            checked={settings.showGuides}
            onChange={(showGuides) => updateSettings({ showGuides })}
          />

          <button
            type="button"
            onClick={resetSettings}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-muted hover:border-accent-soft hover:text-ink"
          >
            Reset to defaults
          </button>
        </div>

        <div className="mt-8 border-t border-line pt-4 text-xs text-muted">
          <h3 className="mb-2 font-medium text-ink">Keyboard shortcuts</h3>
          <dl className="space-y-1">
            {[
              ['Space', 'Play / pause'],
              ['← / →', 'Skip 10 words'],
              ['↑ / ↓', 'Speed ±25 WPM'],
              ['R', 'Restart'],
              ['S', 'Jump to sentence start'],
              ['T', 'Toggle full text'],
              ['Esc', 'Leave the reader'],
            ].map(([key, action]) => (
              <div key={key} className="flex justify-between gap-4">
                <dt className="font-mono text-ink">{key}</dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        {value && <span className="text-sm tabular-nums text-accent">{value}</span>}
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-2">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
            value === option.value
              ? 'border-accent bg-raised text-ink'
              : 'border-line text-muted hover:border-accent-soft hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
    </label>
  );
}
