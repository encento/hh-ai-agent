"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SettingsData = Record<string, any>;

async function api(path: string, init?: RequestInit) {
  const response = await fetch("/api/proxy/" + path, { ...init, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "request_failed");
  return payload;
}

export default function SettingsPage() {
  const [draft, setDraft] = useState<SettingsData | null>(null);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);

  async function load() {
    setError("");
    try {
      const data = await api("settings");
      setDraft(data);
      setRestartRequired(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  }

  useEffect(() => { load(); }, []);

  function value(section: string, key: string) {
    return String(draft?.[section]?.[key] ?? "");
  }

  function checked(section: string, key: string) {
    const current = draft?.[section]?.[key];
    return current === true || current === "true";
  }

  function listValue(section: string, key: string) {
    const current = draft?.[section]?.[key];
    return Array.isArray(current) ? current.join(", ") : String(current ?? "");
  }

  function setField(section: string, key: string, next: any) {
    setDraft((current) => current ? {
      ...current,
      [section]: { ...(current[section] || {}), [key]: next }
    } : current);
  }

  function setList(section: string, key: string, raw: string) {
    setField(section, key, raw.split(",").map((item) => item.trim()).filter(Boolean));
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const payload = { ...draft, secret_values: secretValues };
      const result = await api("settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      setDraft(result);
      setSecretValues({});
      setRestartRequired(Boolean(result.restart_required));
      setStatus("Сохранено на ноуте. Нужен перезапуск агента.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setBusy(false);
    }
  }

  async function restart() {
    setBusy(true);
    setError("");
    try {
      await api("system/restart", { method: "POST" });
      setStatus("Агент перезапускается. Подожди несколько секунд.");
      setRestartRequired(false);
      setTimeout(load, 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "restart_failed");
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    return <main className="shell"><div className="empty">{error || "Загружаю настройки..."}</div></main>;
  }

  const secretState = draft.secrets || {};

  return (
    <main className="shell settings-shell">
      <div className="top">
        <div>
          <Link href="/" className="back-link">← Dashboard</Link>
          <div className="eyebrow">ПУЛЬТ УПРАВЛЕНИЯ БЕЗУМИЕМ</div>
          <h1>Настройки</h1>
          <p className="subtitle">Крутим ручки робота. Секреты остаются на ноуте, херню наружу не светим.</p>
        </div>
        <div className="actions">
          <button className="refresh" onClick={load} disabled={busy}>Сбросить изменения</button>
          <button className="primary-button" onClick={save} disabled={busy}>Сохранить</button>
          <button className="danger-button" onClick={restart} disabled={busy || !restartRequired}>Перезапустить агента</button>
        </div>
      </div>

      {status && <div className="notice">{status}</div>}
      {error && <div className="error settings-error">{error}</div>}

      <div className="settings-grid">
        <section className="settings-card">
          <h2>Режим работы</h2>
          <label>Режим
            <select value={value("mode","APP_MODE")} onChange={(e) => setField("mode","APP_MODE",e.target.value)}>
              <option value="dry_run">Dry run — ничего не отправляем</option>
              <option value="approval">Approval / real apply</option>
            </select>
          </label>
          <Check label="Разрешить реальные отклики" checked={checked("mode","ENABLE_REAL_APPLY")} onChange={(v) => setField("mode","ENABLE_REAL_APPLY",v)} />
          <Check label="Автоотклик" checked={checked("auto_apply","AUTO_APPLY_ENABLED")} onChange={(v) => setField("auto_apply","AUTO_APPLY_ENABLED",v)} />
          <Field label="Порог AUTO, 0–1" value={value("auto_apply","AUTO_APPLY_MIN_CONFIDENCE")} onChange={(v) => setField("auto_apply","AUTO_APPLY_MIN_CONFIDENCE",v)} />
          <div className="field-row">
            <Field label="Мин. пачка" value={value("auto_apply","AUTO_APPLY_MIN_BATCH_SIZE")} onChange={(v) => setField("auto_apply","AUTO_APPLY_MIN_BATCH_SIZE",v)} />
            <Field label="Макс. пачка" value={value("auto_apply","AUTO_APPLY_MAX_BATCH_SIZE")} onChange={(v) => setField("auto_apply","AUTO_APPLY_MAX_BATCH_SIZE",v)} />
          </div>
          <div className="field-row">
            <Field label="Интервал от, ч" value={value("auto_apply","AUTO_APPLY_MIN_INTERVAL_HOURS")} onChange={(v) => setField("auto_apply","AUTO_APPLY_MIN_INTERVAL_HOURS",v)} />
            <Field label="Интервал до, ч" value={value("auto_apply","AUTO_APPLY_MAX_INTERVAL_HOURS")} onChange={(v) => setField("auto_apply","AUTO_APPLY_MAX_INTERVAL_HOURS",v)} />
          </div>
          <div className="field-row">
            <Field label="Рабочее окно с" value={value("auto_apply","AUTO_APPLY_START_HOUR")} onChange={(v) => setField("auto_apply","AUTO_APPLY_START_HOUR",v)} />
            <Field label="до" value={value("auto_apply","AUTO_APPLY_END_HOUR")} onChange={(v) => setField("auto_apply","AUTO_APPLY_END_HOUR",v)} />
          </div>
          <Field label="Часовой пояс" value={value("auto_apply","AUTO_APPLY_TIMEZONE")} onChange={(v) => setField("auto_apply","AUTO_APPLY_TIMEZONE",v)} />
        </section>

        <section className="settings-card">
          <h2>Поиск на HH</h2>
          <Field label="Название резюме на HH" value={value("hh","resume_name")} onChange={(v) => setField("hh","resume_name",v)} />
          <Field label="Поисковые запросы, через запятую" value={listValue("hh","search_queries")} onChange={(v) => setList("hh","search_queries",v)} />
          <Field label="Желаемые позиции" value={listValue("candidate","desired_positions")} onChange={(v) => setList("candidate","desired_positions",v)} />
          <Field label="Регионы HH (ID)" value={listValue("hh","areas")} onChange={(v) => setList("hh","areas",v)} />
          <Field label="Фильтры опыта HH" value={listValue("hh","experience_filters")} onChange={(v) => setList("hh","experience_filters",v)} />
          <Check label="Только удалёнка" checked={Boolean(draft.hh?.remote_only)} onChange={(v) => setField("hh","remote_only",v)} />
          <Field label="Исключённые должности" value={listValue("candidate","excluded_positions")} onChange={(v) => setList("candidate","excluded_positions",v)} />
          <Field label="Чёрный список компаний" value={listValue("candidate","excluded_companies")} onChange={(v) => setList("candidate","excluded_companies",v)} />
          <Field label="Стоп-слова в вакансии" value={listValue("candidate","excluded_keywords")} onChange={(v) => setList("candidate","excluded_keywords",v)} />
        </section>

        <section className="settings-card wide">
          <h2>Профиль кандидата</h2>
          <div className="field-row">
            <Field label="Имя" value={value("candidate","name")} onChange={(v) => setField("candidate","name",v)} />
            <Field label="Локация" value={value("candidate","location")} onChange={(v) => setField("candidate","location",v)} />
          </div>
          <Area label="Краткий опыт" value={value("candidate","experience_summary")} onChange={(v) => setField("candidate","experience_summary",v)} />
          <Area label="Дополнительная информация / факты" value={value("candidate","additional_information")} onChange={(v) => setField("candidate","additional_information",v)} />
          <div className="field-row">
            <Field label="Образование" value={value("candidate","education")} onChange={(v) => setField("candidate","education",v)} />
            <Field label="Ожидания по зарплате" value={value("candidate","salary_expectation")} onChange={(v) => setField("candidate","salary_expectation",v)} />
          </div>
          <Field label="Навыки / технологии" value={listValue("candidate","technologies")} onChange={(v) => setList("candidate","technologies",v)} />
          <Field label="Проекты" value={listValue("candidate","projects")} onChange={(v) => setList("candidate","projects",v)} />
          <div className="field-row">
            <Field label="GitHub" value={value("candidate","github_url")} onChange={(v) => setField("candidate","github_url",v)} />
            <Field label="Формат работы" value={listValue("candidate","work_format")} onChange={(v) => setList("candidate","work_format",v)} />
          </div>
        </section>

        <section className="settings-card">
          <h2>Сопроводительные</h2>
          <Field label="Язык" value={value("cover_letter","language")} onChange={(v) => setField("cover_letter","language",v)} />
          <Field label="Макс. длина, символов" value={value("cover_letter","max_length")} onChange={(v) => setField("cover_letter","max_length",Number(v || 0))} />
          <Area label="Стиль / инструкция" value={value("cover_letter","style")} onChange={(v) => setField("cover_letter","style",v)} />
          <Field label="Обязательный URL портфолио" value={value("cover_letter","required_portfolio_url")} onChange={(v) => setField("cover_letter","required_portfolio_url",v)} />
          <Area label="Финальная строка" value={value("cover_letter","closing")} onChange={(v) => setField("cover_letter","closing",v)} />
        </section>

        <section className="settings-card">
          <h2>Лимиты</h2>
          <Field label="Проверка каждые, мин" value={value("limits","CHECK_INTERVAL_MINUTES")} onChange={(v) => setField("limits","CHECK_INTERVAL_MINUTES",v)} />
          <Field label="Откликов в день" value={value("limits","MAX_APPLICATIONS_PER_DAY")} onChange={(v) => setField("limits","MAX_APPLICATIONS_PER_DAY",v)} />
          <div className="field-row">
            <Field label="Вакансий / запрос" value={value("limits","MAX_VACANCIES_PER_QUERY")} onChange={(v) => setField("limits","MAX_VACANCIES_PER_QUERY",v)} />
            <Field label="Страниц / запрос" value={value("limits","MAX_PAGES_PER_QUERY")} onChange={(v) => setField("limits","MAX_PAGES_PER_QUERY",v)} />
          </div>
          <Field label="Пауза между действиями, сек" value={value("limits","MIN_SECONDS_BETWEEN_ACTIONS")} onChange={(v) => setField("limits","MIN_SECONDS_BETWEEN_ACTIONS",v)} />
          <Field label="TTL ручного approval, мин" value={value("limits","APPROVAL_TTL_MINUTES")} onChange={(v) => setField("limits","APPROVAL_TTL_MINUTES",v)} />
          <div className="field-row">
            <Field label="CAPTCHA timeout" value={value("limits","CAPTCHA_TIMEOUT_SECONDS")} onChange={(v) => setField("limits","CAPTCHA_TIMEOUT_SECONDS",v)} />
            <Field label="CAPTCHA попыток" value={value("limits","CAPTCHA_MAX_ATTEMPTS")} onChange={(v) => setField("limits","CAPTCHA_MAX_ATTEMPTS",v)} />
          </div>
          <div className="field-row">
            <Field label="Circuit min sample" value={value("limits","CIRCUIT_BREAKER_MIN_SAMPLE")} onChange={(v) => setField("limits","CIRCUIT_BREAKER_MIN_SAMPLE",v)} />
            <Field label="Unknown ratio" value={value("limits","CIRCUIT_BREAKER_UNKNOWN_RATIO")} onChange={(v) => setField("limits","CIRCUIT_BREAKER_UNKNOWN_RATIO",v)} />
          </div>
          <Field label="Page errors до стопа" value={value("limits","CIRCUIT_BREAKER_PAGE_ERRORS")} onChange={(v) => setField("limits","CIRCUIT_BREAKER_PAGE_ERRORS",v)} />
        </section>

        <section className="settings-card wide">
          <h2>LLM</h2>
          <div className="field-row">
            <label>Провайдер
              <select value={value("llm","LLM_PROVIDER")} onChange={(e) => setField("llm","LLM_PROVIDER",e.target.value)}>
                <option value="ollama">Ollama</option>
                <option value="mistral">Mistral</option>
                <option value="openai_compatible">OpenAI-compatible</option>
              </select>
            </label>
            <Field label="Модель" value={value("llm","LLM_MODEL")} onChange={(v) => setField("llm","LLM_MODEL",v)} />
          </div>
          <div className="field-row">
            <Field label="Timeout, сек" value={value("llm","LLM_TIMEOUT_SECONDS")} onChange={(v) => setField("llm","LLM_TIMEOUT_SECONDS",v)} />
            <Field label="Retries" value={value("llm","LLM_MAX_RETRIES")} onChange={(v) => setField("llm","LLM_MAX_RETRIES",v)} />
            <Field label="Temperature" value={value("llm","LLM_TEMPERATURE")} onChange={(v) => setField("llm","LLM_TEMPERATURE",v)} />
          </div>
          <div className="field-row">
            <Field label="Max output tokens" value={value("llm","LLM_MAX_OUTPUT_TOKENS")} onChange={(v) => setField("llm","LLM_MAX_OUTPUT_TOKENS",v)} />
            <Field label="LLM запросов / день" value={value("llm","LLM_MAX_REQUESTS_PER_DAY")} onChange={(v) => setField("llm","LLM_MAX_REQUESTS_PER_DAY",v)} />
          </div>
          <Field label="Ollama URL" value={value("llm","OLLAMA_URL")} onChange={(v) => setField("llm","OLLAMA_URL",v)} />
          <Field label="Mistral Base URL" value={value("llm","MISTRAL_BASE_URL")} onChange={(v) => setField("llm","MISTRAL_BASE_URL",v)} />
          <Field label="OpenAI-compatible Base URL" value={value("llm","OPENAI_COMPATIBLE_BASE_URL")} onChange={(v) => setField("llm","OPENAI_COMPATIBLE_BASE_URL",v)} />
          <Check label="OpenAI-compatible JSON mode" checked={checked("llm","OPENAI_COMPATIBLE_JSON_MODE")} onChange={(v) => setField("llm","OPENAI_COMPATIBLE_JSON_MODE",v)} />
          <SecretField label="Mistral API key" configured={secretState.mistral_api_key} value={secretValues.mistral_api_key || ""} onChange={(v) => setSecretValues((x) => ({...x,mistral_api_key:v}))} />
          <SecretField label="Mistral master key" configured={secretState.mistral_keys_master_key} value={secretValues.mistral_keys_master_key || ""} onChange={(v) => setSecretValues((x) => ({...x,mistral_keys_master_key:v}))} />
          <SecretField label="OpenAI-compatible API key" configured={secretState.openai_compatible_api_key} value={secretValues.openai_compatible_api_key || ""} onChange={(v) => setSecretValues((x) => ({...x,openai_compatible_api_key:v}))} />
        </section>

        <section className="settings-card">
          <h2>Telegram</h2>
          <Field label="Telegram User ID" value={value("telegram","TG_USER_ID")} onChange={(v) => setField("telegram","TG_USER_ID",v)} />
          <SecretField label="Bot token" configured={secretState.telegram_bot_token} value={secretValues.telegram_bot_token || ""} onChange={(v) => setSecretValues((x) => ({...x,telegram_bot_token:v}))} />
        </section>

        <section className="settings-card">
          <h2>Браузер и файлы</h2>
          <label>Browser backend
            <select value={value("browser","BROWSER_BACKEND")} onChange={(e) => setField("browser","BROWSER_BACKEND",e.target.value)}>
              <option value="cloakbrowser">CloakBrowser</option>
              <option value="playwright">Playwright</option>
            </select>
          </label>
          <Check label="Headless" checked={checked("browser","BROWSER_HEADLESS")} onChange={(v) => setField("browser","BROWSER_HEADLESS",v)} />
          <Field label="Browser profile dir" value={value("browser","BROWSER_PROFILE_DIR")} onChange={(v) => setField("browser","BROWSER_PROFILE_DIR",v)} />
          <Field label="Database path" value={value("storage","DATABASE_PATH")} onChange={(v) => setField("storage","DATABASE_PATH",v)} />
          <Field label="Log path" value={value("storage","LOG_PATH")} onChange={(v) => setField("storage","LOG_PATH",v)} />
        </section>

        <section className="settings-card">
          <h2>Инфраструктура</h2>
          <p className="muted-copy">Эти три поля нужны, чтобы сам фронт вообще смог связаться с ноутом, поэтому они остаются bootstrap-настройками.</p>
          <ReadOnly label="Local API" value={draft.infrastructure?.AGENT_API_ENABLED === "true" ? "Включён" : "Выключен"} />
          <ReadOnly label="Host" value={draft.infrastructure?.AGENT_API_HOST || "127.0.0.1"} />
          <ReadOnly label="Port" value={draft.infrastructure?.AGENT_API_PORT || "8787"} />
        </section>
      </div>
    </main>
  );
}

function Field({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
  return <label>{label}<input value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

function Area({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
  return <label>{label}<textarea value={value} rows={4} onChange={(e) => onChange(e.target.value)} /></label>;
}

function Check({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>;
}

function SecretField({label,configured,value,onChange}:{label:string;configured:boolean;value:string;onChange:(value:string)=>void}) {
  return <label>{label}<input type="password" value={value} placeholder={configured ? "••••••••  настроен — пустое поле оставит текущий" : "не настроен"} onChange={(e) => onChange(e.target.value)} /></label>;
}

function ReadOnly({label,value}:{label:string;value:string}) {
  return <label>{label}<input value={value} readOnly className="readonly" /></label>;
}
