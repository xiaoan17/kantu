import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { AppSettings, EmbeddingProvider } from '../../../shared/contract'
import { DEFAULT_SETTINGS, LOCAL_EMBEDDING_MODELS } from '../../../shared/contract'

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
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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

  const update = (key: keyof AppSettings) => (v: string): void => {
    setForm((prev) => ({ ...prev, [key]: v }))
    setSaved(false)
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-slate-800">设置</h2>

      <div className="max-w-xl space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Embedding 来源</label>
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
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {form.embeddingProvider === 'local' ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">本地模型</label>
            <select
              value={form.localEmbeddingModel}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, localEmbeddingModel: e.target.value }))
                setSaved(false)
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {LOCAL_EMBEDDING_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
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
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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

      <div className="max-w-xl rounded-xl bg-blue-50 p-4 text-sm leading-relaxed text-blue-800 ring-1 ring-blue-100">
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
