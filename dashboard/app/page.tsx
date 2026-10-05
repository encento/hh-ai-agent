"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Vacancy = {
  id: string;
  title: string;
  company: string;
  url: string;
  status: string;
  confidence: number | null;
  llm_reason: string;
  fit_summary: string;
  cover_letter: string;
  discovered_at: string;
  error_text: string;
};

type Stats = {
  statuses: Record<string, number>;
  applied_today: number;
  available_application_slots: number;
};

async function api(path: string, init?: RequestInit) {
  const response = await fetch("/api/proxy/" + path, { ...init, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "request_failed");
  return payload;
}

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Vacancy[]>([]);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setError("");
    try {
      const [s, v] = await Promise.all([api("stats"), api("vacancies?limit=150")]);
      setStats(s);
      setItems(v.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(
    () => filter === "all" ? items : items.filter((item) => item.status === filter),
    [items, filter]
  );

  async function action(id: string, name: "apply" | "skip") {
    setBusy(id + name);
    setError("");
    try {
      await api(`vacancies/${id}/${name}`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "action_failed");
    } finally {
      setBusy(null);
    }
  }

  const status = stats?.statuses || {};
  const total = Object.values(status).reduce((a, b) => a + b, 0);

  return (
    <main className="shell">
      <div className="top">
        <div>
          <h1>HH Job Agent</h1>
          <p className="subtitle">Робот воюет с роботами. Ты смотришь только на исключения.</p>
        </div>
        <div className="actions">
          <Link className="refresh link-button" href="/settings">Настройки</Link>
          <button className="refresh" onClick={load}>Обновить</button>
        </div>
      </div>

      <section className="grid">
        <div className="card"><div className="label">Всего</div><div className="value">{total}</div></div>
        <div className="card"><div className="label">На проверке</div><div className="value">{status.pending_approval || 0}</div></div>
        <div className="card"><div className="label">Откликнулись</div><div className="value">{status.applied || 0}</div></div>
        <div className="card"><div className="label">Сегодня</div><div className="value">{stats?.applied_today ?? 0}</div></div>
        <div className="card"><div className="label">Можно ещё откликнуться</div><div className="value">{stats?.available_application_slots ?? 0}</div></div>
      </section>

      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Все вакансии</option>
          <option value="pending_approval">Review</option>
          <option value="applied">Applied</option>
          <option value="apply_failed">Errors</option>
          <option value="rejected_by_llm">AI skip</option>
          <option value="rejected_by_filter">Filter skip</option>
          <option value="skipped">Manual skip</option>
        </select>
      </div>

      {error && <div className="error">{error}</div>}

      <table className="table">
        <thead><tr><th>Вакансия</th><th>Статус</th><th>Fit</th><th>Почему</th><th></th></tr></thead>
        <tbody>
          {visible.map((item) => (
            <tr key={item.id}>
              <td>
                <a href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong></a>
                <div className="company">{item.company || "Компания не указана"}</div>
              </td>
              <td><span className={`badge ${item.status}`}>{item.status}</span></td>
              <td className="conf">{item.confidence == null ? "—" : Math.round(item.confidence * 100) + "%"}</td>
              <td><div className="reason">{item.fit_summary || item.llm_reason || item.error_text || "—"}</div></td>
              <td>
                {item.status === "pending_approval" && (
                  <div className="actions">
                    <button className="primary" disabled={!!busy} onClick={() => action(item.id, "apply")}>Apply</button>
                    <button disabled={!!busy} onClick={() => action(item.id, "skip")}>Skip</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {!visible.length && <tr><td colSpan={5}><div className="empty">Пока пусто</div></td></tr>}
        </tbody>
      </table>
    </main>
  );
}
