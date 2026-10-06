import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { AppSettings, EmbeddingProvider } from '../../../shared/contract'
import { DEFAULT_SETTINGS, LOCAL_EMBEDDING_MODELS } from '../../../shared/contract'
import { THEMES, applyTheme } from '../themes'

function Field({
  label,
  type = 'text',
  value,
  placeholder,
  onChange
}: {
  label: string
  type?: string
  value: string
  placeholder?: string
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-body">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-body outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
      />
    </div>
  )
}

function SettingsPage(): React.JSX.Element {
  const [form, setForm] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.tjm.getSettings().then((s) => {
      setApiKeyConfigured(s.embeddingApiKeyConfigured)
      setForm(s)
    })
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.tjm.setSettings(form)
      if (form.embeddingApiKey) {
        setApiKeyConfigured(true)
        // 密钥已加密落盘，界面上不保留明文
        setForm((prev) => ({ ...prev, embeddingApiKey: '' }))
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const update =
    (key: keyof AppSettings) =>
    (v: string): void => {
      setForm((prev) => ({ ...prev, [key]: v }))
      setSaved(false)
    }

  const selectTheme = (id: string): void => {
    setForm((prev) => ({ ...prev, theme: id }))
    applyTheme(id)
    setSaved(false)
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-heading">设置</h2>

      <div className="max-w-xl rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
        <label className="mb-3 block text-sm font-medium text-body">主题配色</label>
        <div className="grid grid-cols-5 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTheme(t.id)}
              className={`space-y-1.5 rounded-lg border p-2 text-center text-xs font-medium transition-colors ${
                form.theme === t.id
                  ? 'border-primary text-primary-strong ring-2 ring-primary-soft'
                  : 'border-border text-body hover:border-border-strong'
              }`}
            >
              <span className="flex h-8 overflow-hidden rounded-md ring-1 ring-border">
                <span style={{ background: t.sidebar, width: '30%' }} />
                <span style={{ background: t.base, width: '40%' }} />
                <span style={{ background: t.primary, width: '30%' }} />
              </span>
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">选择后立即预览，点击「保存」后长期生效。</p>
      </div>

      <div className="max-w-xl space-y-4 rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
        <div>
          <label className="mb-2 block text-sm font-medium text-body">Embedding 来源</label>
          <div className="flex gap-2">
            {(
              [
                { id: 'local', label: '本地模型（离线，推荐）' },
                { id: 'remote', label: '远程 API' }
              ] as { id: EmbeddingProvider; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setForm((prev) => ({ ...prev, embeddingProvider: opt.id }))
                  setSaved(false)
                }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  form.embeddingProvider === opt.id
                    ? 'border-primary bg-primary-soft text-primary-strong'
                    : 'border-border-strong bg-surface text-body hover:border-faint'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {form.embeddingProvider === 'local' ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-body">本地模型</label>
            <select
              value={form.localEmbeddingModel}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, localEmbeddingModel: e.target.value }))
                setSaved(false)
              }}
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-body outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            >
              {LOCAL_EMBEDDING_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              模型已内置在安装包中，向量化和推荐全程离线运行，无需任何 API Key。
            </p>
          </div>
        ) : (
          <>
            <Field
              label="Embedding Base URL"
              value={form.embeddingBaseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={update('embeddingBaseUrl')}
            />
            <Field
              label="Embedding API Key"
              type="password"
              value={form.embeddingApiKey}
              placeholder={apiKeyConfigured ? '已配置（留空保持不变）' : 'sk-…'}
              onChange={update('embeddingApiKey')}
            />
            <Field
              label="Embedding 模型"
              value={form.embeddingModel}
              placeholder="text-embedding-3-small"
              onChange={update('embeddingModel')}
            />
          </>
        )}
        <Field
          label="联系邮箱（OpenAlex 礼貌池，可空）"
          value={form.mailto}
          placeholder="you@example.com"
          onChange={update('mailto')}
        />

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 size={16} />
              已保存
            </span>
          )}
        </div>
      </div>

      <div className="max-w-xl rounded-xl bg-primary-soft p-4 text-sm leading-relaxed text-primary-strong ring-1 ring-primary-soft">
        <p className="font-semibold">说明</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>默认使用内置本地模型（BGE Small EN），向量化与推荐全程离线，不产生任何远程请求。</li>
          <li>远程 API 模式支持任意 OpenAI 兼容服务：OpenAI / Kimi / DashScope 等。</li>
          <li>首次向量化约 1.5 万条文本，本地模型约需几分钟，请在仪表盘运行后耐心等待。</li>
          <li>切换 Embedding 来源或模型会清空已有向量，需要重新向量化。</li>
          <li>填写邮箱可进入 OpenAlex 礼貌池，抓取更稳定。</li>
        </ul>
      </div>
    </div>
  )
}

export default SettingsPage
