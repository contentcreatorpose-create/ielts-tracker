"use client";

import { useEffect, useMemo, useState } from "react";

const START = new Date("2026-07-16T00:00:00");
const END = new Date("2026-09-30T00:00:00");
const SKILLS = ["R", "L", "W", "S"] as const;
type Skill = (typeof SKILLS)[number];
const SKILL_NAMES: Record<Skill, string> = { R: "Reading", L: "Listening", W: "Writing", S: "Speaking" };
const BOOKS = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]; // 6 missing
const TESTS_PER_BOOK = 4;

type LogEntry = {
  done: boolean;
  skills: Skill[];
  source: string;
  bookNum?: string;
  testNum?: string;
  testInfo?: string;
  notes?: string;
};
type BookProgress = Record<string, Record<string, Record<Skill, boolean>>>;
type AppState = {
  targetBand: string;
  logs: Record<string, LogEntry>;
  bookProgress: BookProgress;
};

function emptyBookProgress(): BookProgress {
  const bp: BookProgress = {};
  BOOKS.forEach((b) => {
    bp[String(b)] = {};
    for (let t = 1; t <= TESTS_PER_BOOK; t++) {
      bp[String(b)][String(t)] = { R: false, L: false, W: false, S: false };
    }
  });
  return bp;
}

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}
function fmtLabel(d: Date) {
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function Home() {
  const [pin, setPin] = useState("");
  const [authedPin, setAuthedPin] = useState<string | null>(null);
  const [gateError, setGateError] = useState("");
  const [loading, setLoading] = useState(false);

  const [state, setState] = useState<AppState>({
    targetBand: "8.5",
    logs: {},
    bookProgress: emptyBookProgress(),
  });
  const [tab, setTab] = useState<"cal" | "books">("cal");
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [openBooks, setOpenBooks] = useState<Record<string, boolean>>({});

  // restore pin from sessionStorage so refresh doesn't force re-entry
  useEffect(() => {
    const saved = typeof window !== "undefined" ? sessionStorage.getItem("app-pin") : null;
    if (saved) tryAuth(saved);
  }, []);

  async function tryAuth(pinValue: string) {
    setLoading(true);
    setGateError("");
    try {
      const res = await fetch("/api/state", { headers: { "x-app-pin": pinValue } });
      if (res.status === 401) {
        setGateError("PIN salah, coba lagi.");
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (json.data) {
        setState({
          targetBand: json.data.targetBand || "8.5",
          logs: json.data.logs || {},
          bookProgress: json.data.bookProgress || emptyBookProgress(),
        });
      }
      sessionStorage.setItem("app-pin", pinValue);
      setAuthedPin(pinValue);
    } catch (e) {
      setGateError("Gagal konek ke server, coba lagi.");
    }
    setLoading(false);
  }

  async function persist(next: AppState) {
    setState(next);
    if (!authedPin) return;
    try {
      await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-pin": authedPin },
        body: JSON.stringify(next),
      });
    } catch (e) {
      // silent fail; local state still updated
    }
  }

  const daysLeft = useMemo(() => {
    const today = new Date();
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.max(Math.round((END.getTime() - t.getTime()) / 86400000), 0);
  }, []);

  const today = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const calendarDays = useMemo(() => {
    const days: (Date | null)[] = [];
    const startPad = START.getDay();
    for (let i = 0; i < startPad; i++) days.push(null);
    let d = new Date(START);
    while (d <= END) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, []);

  const stats = useMemo(() => {
    let done = 0,
      total = 0;
    let d = new Date(START);
    while (d <= END) {
      total++;
      const ds = dateStr(d);
      if (state.logs[ds]?.done) done++;
      d.setDate(d.getDate() + 1);
    }
    let streak = 0;
    let cursor = new Date(today);
    while (state.logs[dateStr(cursor)]?.done) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    let skillDone = 0,
      skillTotal = 0,
      booksComplete = 0;
    BOOKS.forEach((b) => {
      const book = state.bookProgress[String(b)];
      let bookDone = 0;
      for (let t = 1; t <= TESTS_PER_BOOK; t++) {
        SKILLS.forEach((k) => {
          skillTotal++;
          if (book?.[String(t)]?.[k]) {
            skillDone++;
            bookDone++;
          }
        });
      }
      if (bookDone === TESTS_PER_BOOK * SKILLS.length) booksComplete++;
    });
    const skillPct = skillTotal ? Math.round((skillDone / skillTotal) * 100) : 0;
    return { done, total, streak, booksComplete, skillPct };
  }, [state, today]);

  function updateLog(ds: string, entry: LogEntry) {
    const next = { ...state, logs: { ...state.logs, [ds]: entry } };
    if (entry.source === "Cambridge Book" && entry.bookNum && entry.testNum) {
      const bp = JSON.parse(JSON.stringify(next.bookProgress)) as BookProgress;
      if (!bp[entry.bookNum]) bp[entry.bookNum] = {};
      if (!bp[entry.bookNum][entry.testNum]) bp[entry.bookNum][entry.testNum] = { R: false, L: false, W: false, S: false };
      entry.skills.forEach((k) => (bp[entry.bookNum!][entry.testNum!][k] = true));
      next.bookProgress = bp;
    }
    persist(next);
  }
  function clearLog(ds: string) {
    const nextLogs = { ...state.logs };
    delete nextLogs[ds];
    persist({ ...state, logs: nextLogs });
  }
  function toggleSkillCell(book: number, test: number, k: Skill) {
    const bp = JSON.parse(JSON.stringify(state.bookProgress)) as BookProgress;
    bp[String(book)][String(test)][k] = !bp[String(book)][String(test)][k];
    persist({ ...state, bookProgress: bp });
  }
  function setTargetBand(v: string) {
    persist({ ...state, targetBand: v });
  }

  if (!authedPin) {
    return (
      <div className="gate-wrap">
        <div className="gate-card">
          <div className="ticket-eyebrow">Akses Pribadi</div>
          <div className="ticket-title serif">IELTS Practice Tracker</div>
          <div className="ticket-sub">Masukkan PIN buat masuk</div>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryAuth(pin)}
            placeholder="â€¢â€¢â€¢â€¢â€¢â€¢"
          />
          <div className="btn primary" onClick={() => tryAuth(pin)}>
            {loading ? "Memuat..." : "Masuk"}
          </div>
          {gateError && <div className="gate-error">{gateError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="ielts-root">
      <div className="wrap">
        <div className="ticket">
          <div className="ticket-main">
            <div className="ticket-eyebrow">Tiket Latihan Harian</div>
            <div className="ticket-title serif">IELTS Practice Log</div>
            <div className="ticket-sub">Cambridge Book 1â€“17 &amp; ieltstrainingonline.com</div>
            <div className="ticket-fields">
              <div className="field">
                <label>Target Band</label>
                <input type="text" value={state.targetBand} onChange={(e) => setTargetBand(e.target.value)} maxLength={4} />
              </div>
              <div className="field">
                <label>Deadline</label>
                <input type="text" value="30 Sep 2026" disabled style={{ color: "var(--ink-soft)", cursor: "default" }} />
              </div>
            </div>
            <div className="sync-note">
              <span className="sync-dot"></span>Sinkron lintas device â€” progres sama di HP &amp; laptop
            </div>
          </div>
          <div className="ticket-stub">
            <div className="stub-label">Hari Tersisa</div>
            <div className="stub-days mono">{daysLeft}</div>
            <div className="stub-unit">HARI</div>
            <div className="stub-date">{fmtLabel(today)}</div>
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="stat-num">{stats.done}</div>
            <div className="stat-label">Hari Practice</div>
          </div>
          <div className="stat">
            <div className="stat-num">{stats.streak}</div>
            <div className="stat-label">Streak</div>
          </div>
          <div className="stat">
            <div className="stat-num">
              {stats.booksComplete}/{BOOKS.length}
            </div>
            <div className="stat-label">Buku Selesai</div>
          </div>
          <div className="stat">
            <div className="stat-num">{stats.skillPct}%</div>
            <div className="stat-label">Progres Buku</div>
          </div>
        </div>

        <div className="tabs">
          <div className={`tab ${tab === "cal" ? "active" : ""}`} onClick={() => setTab("cal")}>
            ðŸ“… Kalender Harian
          </div>
          <div className={`tab ${tab === "books" ? "active" : ""}`} onClick={() => setTab("books")}>
            ðŸ“š Progress Buku 1â€“17
          </div>
        </div>

        {tab === "cal" && (
          <>
            <div className="section-head">
              <div className="section-title serif">Kalender Latihan</div>
              <div className="section-note">Klik tanggal untuk isi log</div>
            </div>
            <div className="legend">
              <div className="legend-item">
                <span className="dot" style={{ background: "var(--r)" }}></span>Reading
              </div>
              <div className="legend-item">
                <span className="dot" style={{ background: "var(--l)" }}></span>Listening
              </div>
              <div className="legend-item">
                <span className="dot" style={{ background: "var(--w)" }}></span>Writing
              </div>
              <div className="legend-item">
                <span className="dot" style={{ background: "var(--s)" }}></span>Speaking
              </div>
            </div>
            <div className="cal-card">
              <div className="cal-weekdays">
                {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="cal-grid">
                {calendarDays.map((d, i) => {
                  if (!d) return <div key={i} className="cal-cell empty" />;
                  const ds = dateStr(d);
                  const entry = state.logs[ds];
                  const isToday = ds === dateStr(today);
                  const isPast = d < today;
                  const cls = ["cal-cell", isToday && "today", !isToday && isPast && "past", entry?.done && "done"]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <div key={ds} className={cls} onClick={() => setOpenDate(ds)}>
                      {d.getDate()}
                      {entry?.skills?.length ? (
                        <div className="skill-dots">
                          {entry.skills.map((k, idx) => (
                            <i key={idx} style={{ background: entry.done ? "#fff" : `var(--${k.toLowerCase()})` }} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="section-head">
              <div className="section-title serif">Log Terbaru</div>
            </div>
            <div className="cal-card" style={{ padding: "6px 16px" }}>
              {Object.keys(state.logs)
                .filter((ds) => state.logs[ds].done)
                .sort((a, b) => b.localeCompare(a))
                .slice(0, 6)
                .map((ds) => {
                  const e = state.logs[ds];
                  const d = new Date(ds + "T00:00:00");
                  let src = "";
                  if (e.source === "Cambridge Book" && e.bookNum) src = `Cambridge Book ${e.bookNum} â€” Test ${e.testNum}. `;
                  else if (e.source) src = `${e.source}${e.testInfo ? " â€” " + e.testInfo : ""}. `;
                  return (
                    <div key={ds} className="log-row">
                      <div className="log-date">{d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</div>
                      <div className="log-body">
                        <div className="log-skills">
                          {e.skills.map((k) => (
                            <span key={k} style={{ background: `var(--${k.toLowerCase()})` }}>
                              {k}
                            </span>
                          ))}
                        </div>
                        <div className="log-note">
                          {src}
                          {e.notes}
                        </div>
                      </div>
                    </div>
                  );
                })}
              {Object.keys(state.logs).filter((ds) => state.logs[ds].done).length === 0 && (
                <div className="empty-state">Belum ada log. Klik tanggal di kalender untuk mulai.</div>
              )}
            </div>
          </>
        )}

        {tab === "books" && (
          <>
            <div className="book-overview">
              <div className="book-overview-top">
                <div className="section-title serif">Progress Keseluruhan</div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 20 }}>
                  {stats.skillPct}%
                </div>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${stats.skillPct}%` }} />
              </div>
              <div className="missing-note">âš ï¸ Book 6 belum ada â€” cari dulu biar urutan 1â€“17 lengkap.</div>
            </div>
            {BOOKS.map((b) => {
              const key = String(b);
              const book = state.bookProgress[key] || {};
              let bookDone = 0;
              const total = TESTS_PER_BOOK * SKILLS.length;
              for (let t = 1; t <= TESTS_PER_BOOK; t++) SKILLS.forEach((k) => book[String(t)]?.[k] && bookDone++);
              const pct = Math.round((bookDone / total) * 100);
              const isOpen = !!openBooks[key];
              return (
                <div key={b} className="book-card">
                  <div className="book-head" onClick={() => setOpenBooks({ ...openBooks, [key]: !isOpen })}>
                    <div className="book-head-left">
                      <div className="book-num mono">#{b}</div>
                      <div className="book-name">Cambridge IELTS {b}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="book-mini-bar">
                        <div className="book-mini-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="book-pct mono">{pct}%</div>
                      <div className="chevron" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                        â–¾
                      </div>
                    </div>
                  </div>
                  <div className={`book-body ${isOpen ? "open" : ""}`}>
                    {Array.from({ length: TESTS_PER_BOOK }, (_, i) => i + 1).map((t) => (
                      <div key={t} className="test-row">
                        <div className="test-label">Test {t}</div>
                        <div className="skill-toggle">
                          {SKILLS.map((k) => (
                            <div
                              key={k}
                              className={`st ${book[String(t)]?.[k] ? "on " + k : ""}`}
                              onClick={() => toggleSkillCell(b, t, k)}
                            >
                              {k}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}

        <div className="section-head">
          <div className="section-title serif">Sumber Latihan</div>
        </div>
        <div className="res-grid">
          <a className="res-card" href="https://ieltstrainingonline.com/cambridge-practice-tests-for-ielts-reading/" target="_blank" rel="noopener noreferrer">
            <div className="k">Online</div>
            <div className="t">ieltstrainingonline.com</div>
            <div className="d">Cambridge-style reading practice tests + jawaban</div>
          </a>
          <div className="res-card" style={{ cursor: "default" }}>
            <div className="k">Fisik / PDF</div>
            <div className="t">Cambridge Book 1â€“17</div>
            <div className="d">16 buku sudah di-scan, tinggal cari Book 6</div>
          </div>
        </div>

        <div className="foot-note">Data tersimpan di Vercel KV â€” bisa dibuka dari HP atau laptop mana pun, asal masuk pakai PIN yang sama.</div>
      </div>

      {openDate && (
        <DayPanel
          ds={openDate}
          entry={state.logs[openDate]}
          onClose={() => setOpenDate(null)}
          onSave={(entry) => {
            updateLog(openDate, entry);
            setOpenDate(null);
          }}
          onClear={() => {
            clearLog(openDate);
            setOpenDate(null);
          }}
        />
      )}
    </div>
  );
}

function DayPanel({
  ds,
  entry,
  onClose,
  onSave,
  onClear,
}: {
  ds: string;
  entry?: LogEntry;
  onClose: () => void;
  onSave: (e: LogEntry) => void;
  onClear: () => void;
}) {
  const d = new Date(ds + "T00:00:00");
  const [skills, setSkills] = useState<Skill[]>(entry?.skills || []);
  const [source, setSource] = useState(entry?.source || "");
  const [bookNum, setBookNum] = useState(entry?.bookNum || String(BOOKS[0]));
  const [testNum, setTestNum] = useState(entry?.testNum || "1");
  const [testInfo, setTestInfo] = useState(entry?.testInfo || "");
  const [notes, setNotes] = useState(entry?.notes || "");

  function toggleSkill(k: Skill) {
    setSkills((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  return (
    <div className="panel-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel">
        <div className="panel-title">{fmtLabel(d)}</div>
        <div className="panel-sub">Catat sesi latihan hari ini</div>

        <label className="f">Skill</label>
        <div className="chip-row">
          {SKILLS.map((k) => (
            <div key={k} className={`chip ${skills.includes(k) ? "on " + k : ""}`} onClick={() => toggleSkill(k)}>
              {SKILL_NAMES[k]}
            </div>
          ))}
        </div>

        <label className="f">Sumber</label>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Pilih sumber</option>
          <option value="Cambridge Book">Cambridge Book (fisik/PDF)</option>
          <option value="ieltstrainingonline.com">ieltstrainingonline.com</option>
          <option value="Lainnya">Lainnya</option>
        </select>

        {source === "Cambridge Book" && (
          <div className="row2">
            <div>
              <label className="f">Buku</label>
              <select value={bookNum} onChange={(e) => setBookNum(e.target.value)}>
                {BOOKS.map((b) => (
                  <option key={b} value={b}>
                    Book {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="f">Test</label>
              <select value={testNum} onChange={(e) => setTestNum(e.target.value)}>
                {Array.from({ length: TESTS_PER_BOOK }, (_, i) => i + 1).map((t) => (
                  <option key={t} value={t}>
                    Test {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {(source === "ieltstrainingonline.com" || source === "Lainnya") && (
          <>
            <label className="f">Detail</label>
            <input type="text" value={testInfo} onChange={(e) => setTestInfo(e.target.value)} placeholder="cth: Reading Test 05" />
          </>
        )}

        <label className="f">Catatan singkat</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Skor, kesulitan, kosakata baru, dll." />

        <div className="panel-actions">
          <div className="btn ghost" onClick={onClose}>
            Tutup
          </div>
          <div
            className="btn primary"
            onClick={() =>
              onSave({
                done: true,
                skills,
                source,
                bookNum: source === "Cambridge Book" ? bookNum : undefined,
                testNum: source === "Cambridge Book" ? testNum : undefined,
                testInfo,
                notes,
              })
            }
          >
            Simpan &amp; Tandai Selesai
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div className="btn danger" style={{ borderStyle: "dashed" }} onClick={onClear}>
            Hapus log hari ini
          </div>
        </div>
      </div>
    </div>
  );
}
