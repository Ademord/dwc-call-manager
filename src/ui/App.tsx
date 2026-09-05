import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Droplets,
  LayoutDashboard,
  ListFilter,
  MoreHorizontal,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  SkipForward,
  UserRound,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import type { Actor, Call, Report, Role } from '../domain/types';
import type { Client, FaultMode } from '../client/types';
import { catalog, labelFor } from '../domain/catalog';
import seed from '../../demo/seed.json';
import { EvaluationDialog } from './EvaluationDialog';
import { Dashboard } from './Dashboard';
import { useTour } from './useTour';
import { TourSpotlight } from './TourSpotlight';
import { HelpHint } from './HelpHint';
import { addDay, commandKey, dateTime, integer, messageOf } from './format';
import './styles.css';

type Page = 'queue' | 'dashboard' | 'calls' | 'settings';
export function App({ client, mode }: { client: Client; mode: 'local' | 'portable' }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [selected, setSelected] = useState<Call | null>(null);
  const [page, setPage] = useState<Page>('queue');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [report, setReport] = useState<Report | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [from, setFrom] = useState(seed.reportRange.from);
  const [through, setThrough] = useState(addDay(seed.reportRange.until, -1));
  const [range, setRange] = useState({
    from: seed.reportRange.from,
    until: seed.reportRange.until,
  });
  const [fault, setFault] = useState<FaultMode>('none');
  const [controlBusy, setControlBusy] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [reportTour, setReportTour] = useState<'charts' | 'filter' | 'export' | 'complete' | null>(
    null,
  );
  const current = useRef({ actor, selected, report, range, reportBusy });
  current.current = { actor, selected, report, range, reportBusy };
  const generation = useRef(0);
  const observed = useRef<Set<string> | null>(null);
  const reportGeneration = useRef(0);
  const pending = calls.filter((call) => !call.evaluation);
  const refresh = useCallback(async () => {
    const run = generation.current;
    try {
      const identity = await client.me();
      const rows = await client.listCalls();
      if (run !== generation.current) return;
      setActor(identity);
      setCalls(rows);
      setError('');
      const nextPending = rows.filter((call) => !call.evaluation);
      const newlyArrived =
        observed.current && nextPending.find((call) => !observed.current!.has(call.id));
      observed.current = new Set(rows.map((call) => call.id));
      if (newlyArrived && !current.current.selected && identity.role === 'agent')
        setSelected(newlyArrived);
    } catch (cause) {
      if (run === generation.current) setError(messageOf(cause));
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }, [client]);
  const loadReport = useCallback(async () => {
    const run = ++reportGeneration.current;
    setReportBusy(true);
    try {
      const result = await client.report(current.current.range.from, current.current.range.until);
      if (run === reportGeneration.current) {
        setReport(result);
        setError('');
      }
    } catch (cause) {
      if (run === reportGeneration.current) {
        setReport(null);
        setError(messageOf(cause));
      }
    } finally {
      if (run === reportGeneration.current) setReportBusy(false);
    }
  }, [client]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 5000);
    const focus = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', focus);
    window.addEventListener('online', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', focus);
      window.removeEventListener('online', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [refresh]);
  useEffect(() => {
    if (actor?.role === 'manager' && page === 'dashboard') void loadReport();
  }, [actor?.role, page, range, loadReport]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function openCall(id: string, isCurrent = () => true) {
    const run = generation.current;
    try {
      const call = await client.getCall(id);
      if (run === generation.current && isCurrent()) setSelected(call);
    } catch (cause) {
      if (run === generation.current) setError(messageOf(cause));
    }
  }
  async function switchRole(role: Role) {
    setReportTour(null);
    setControlBusy(true);
    generation.current++;
    reportGeneration.current++;
    observed.current = null;
    try {
      const identity = await client.setActor(role);
      setActor(identity);
      setSelected(null);
      setReport(null);
      setPage(role === 'manager' ? 'dashboard' : 'queue');
      await refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setControlBusy(false);
    }
  }
  async function reset() {
    setReportTour(null);
    generation.current++;
    reportGeneration.current++;
    observed.current = null;
    setControlBusy(true);
    try {
      await client.reset();
      setSelected(null);
      setReport(null);
      setPage('queue');
      setQuery('');
      setStatus('all');
      setFault('none');
      setFrom(seed.reportRange.from);
      setThrough(addDay(seed.reportRange.until, -1));
      setRange({ ...seed.reportRange });
      await refresh();
      setNotice('Demo zurückgesetzt: 12 Anrufe, 10 ausgewertet, 2 ausstehend.');
    } finally {
      setControlBusy(false);
    }
  }
  const tour = useTour({
    reset,
    guidedId: seed.guidedCallId,
    replay: () => client.replayCall(seed.guidedCallId),
    openGuided: (isCurrent) => openCall(seed.guidedCallId, isCurrent),
    reportSummary: () =>
      'Die Auswertung ist bestätigt. Erkunden Sie jetzt Filter, Details und CSV-Export. Die Übersicht zeigt immer den angewendeten Zeitraum.',
    reportStatus: () => {
      const latest = current.current;
      if (
        latest.reportBusy ||
        (latest.report &&
          (latest.report.from !== latest.range.from || latest.report.until !== latest.range.until))
      )
        return 'loading';
      return latest.report ? 'ready' : 'error';
    },
  });
  async function newCall() {
    const run = generation.current;
    setControlBusy(true);
    try {
      const call = await client.newCall();
      if (run !== generation.current) return;
      await refresh();
      if (run !== generation.current) return;
      if (!current.current.selected) setSelected(call);
      else
        setNotice(
          `${call.displayRef} wartet in der Liste. Ihr aktuelles Formular bleibt geöffnet.`,
        );
    } catch (cause) {
      if (run === generation.current) setError(messageOf(cause));
    } finally {
      if (run === generation.current) setControlBusy(false);
    }
  }
  async function exportReport() {
    if (!report) return;
    setExportBusy(true);
    try {
      const csv = await client.exportCsv(report.snapshotToken);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DWC_${report.from}_${addDay(report.until, -1)}_Europe-Zurich.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('CSV aus dem angezeigten Berichtsstand exportiert.');
      setReportTour((step) =>
        step === 'export' && current.current.report?.snapshotToken === report.snapshotToken
          ? 'complete'
          : step,
      );
    } catch (cause) {
      setError(`${messageOf(cause)} Bitte laden Sie die Übersicht erneut.`);
    } finally {
      setExportBusy(false);
    }
  }
  function changeCall(call: Call) {
    setCalls((old) => old.map((item) => (item.id === call.id ? call : item)));
  }
  const nav = (next: Page) => {
    setReportTour(null);
    setPage(next);
    setError('');
  };
  const filtered = calls.filter(
    (call) =>
      (!query || call.displayRef.toLowerCase().includes(query.toLowerCase())) &&
      (status === 'all' ||
        (status === 'pending' && !call.evaluation) ||
        (status === 'submitted' && call.evaluation) ||
        (status === 'unassigned' && !call.assignedAgentId) ||
        call.evaluation?.value.reason === status),
  );
  const tourControls = (compact = false, saving = false) => (
    <div className={`tour-controls ${compact ? 'inside-dialog' : ''}`} data-demo-controls>
      {!compact && (
        <span className="tour-play-icon">
          <Play size={17} />
        </span>
      )}
      {!compact && (
        <div className="tour-caption">
          <strong>
            {tour.state === 'playing'
              ? `Schritt ${Math.min(tour.cursor + 1, tour.total)} von ${tour.total}`
              : tour.state === 'paused'
                ? 'Tour pausiert · Sie haben übernommen'
                : tour.state === 'finished'
                  ? 'Tour abgeschlossen'
                  : 'Geführte Demo'}
          </strong>
          <span aria-live="polite">{tour.note}</span>
        </div>
      )}
      <div className="tour-buttons">
        {tour.state === 'playing' ? (
          <button className="button" onClick={tour.pause} aria-label="Tour pausieren">
            <Pause size={16} />
            <span>Pause</span>
          </button>
        ) : (
          <button className="button primary" disabled={controlBusy || saving} onClick={tour.play}>
            <Play size={16} />
            <span>
              {tour.state === 'paused'
                ? 'Fortsetzen'
                : tour.state === 'finished'
                  ? 'Erneut ansehen'
                  : 'Tour starten'}
            </span>
          </button>
        )}
        <button
          className="icon-button"
          onClick={() => void tour.reset(false)}
          disabled={controlBusy || saving}
          aria-label="Demo zurücksetzen"
          title="Demo zurücksetzen"
        >
          <RotateCcw size={17} />
        </button>
        {tour.state !== 'idle' && tour.state !== 'manual' && (
          <button
            className="button subtle tour-exit"
            onClick={tour.skip}
            aria-label="Tour überspringen"
            title="Tour überspringen"
          >
            <X size={16} /> Beenden
          </button>
        )}
      </div>
      {compact && (
        <label className="tour-speed">
          Tempo
          <select
            aria-label="Tourtempo"
            value={tour.delay}
            onChange={(event) => tour.setDelay(Number(event.target.value))}
          >
            <option value={1300}>Schnell</option>
            <option value={2600}>Normal</option>
            <option value={6000}>Langsam</option>
          </select>
        </label>
      )}
      {!compact && actor?.role === 'manager' && page === 'dashboard' && (
        <button
          className="button"
          onClick={() => setReportTour('charts')}
          data-tour="report-tour-start"
          disabled={!report || reportBusy}
        >
          Bericht erkunden
        </button>
      )}
    </div>
  );

  const tourActive = tour.state === 'playing' || tour.state === 'paused';
  const callSteps = [
    ['[data-testid="open-DEMO-011"]', 'Vom Gespräch zur Erkenntnis'],
    ['.reason-grid', 'Ein Anruf. Ein Hauptgrund.'],
    ['[data-tour="device"]', 'Welches Gerät ist betroffen?'],
    ['[data-tour="fault"]', 'Die wichtigste Störung'],
    ['[data-tour="resolution"]', 'Was wurde vereinbart?'],
    ['.form-error, [data-tour="submit"]', 'Erst bestätigt ist gespeichert'],
    ['.summary-box', 'Das ist wirklich gespeichert'],
    ['[data-tour="role-manager"]', 'Die Perspektive wechseln'],
    ['.completion-strip', 'Aus Antworten werden Zahlen'],
  ];
  const focusedTour = (saving = false) => (
    <TourSpotlight
      target={callSteps[tour.cursor]?.[0] ?? '[data-testid="dashboard"]'}
      title={
        tour.state === 'paused'
          ? 'In Ihrem Tempo'
          : (callSteps[tour.cursor]?.[1] ?? 'Ihre Übersicht')
      }
      paused={tour.state === 'paused'}
      onDismiss={tour.skip}
      progress={{ current: tour.cursor + 1, total: tour.total }}
      controls={tourControls(true, saving)}
    >
      <p>
        {tour.cursor === 8 && tour.state !== 'paused'
          ? current.current.report && !reportBusy
            ? `Aktueller Bericht: ${report?.counts.total} Anrufe, ${report?.counts.submitted} ausgewertet, ${report?.counts.pending} ausstehend.`
            : 'Der Bericht wird geladen.'
          : tour.note}
      </p>
      <span className="tour-microcopy">
        {tour.state === 'paused'
          ? 'Ihre Eingaben bleiben erhalten. Fortsetzen führt die Tour weiter.'
          : 'Läuft automatisch · Eigene Eingaben pausieren die Tour.'}
      </span>
    </TourSpotlight>
  );

  const reportSteps = {
    charts: [
      '.charts-grid .chart-scroll',
      'Muster im Zeitverlauf',
      'Die Linien zeigen Anrufgründe pro Tag. Ausstehende Anrufe bleiben separat sichtbar. Unter der Grafik stehen die genauen Werte als Tabelle.',
    ],
    filter: [
      '.period-filter',
      'Einen Zeitraum ausprobieren',
      'Ändern Sie Von und Bis und wählen Sie Anwenden. Erst danach gehören die Zahlen zum neuen Zeitraum. Demo-Zeitraum bringt Sie zurück.',
    ],
    export: [
      '[data-tour="export"]',
      'Genau diesen Stand mitnehmen',
      'Wählen Sie CSV exportieren. Die Datei enthält die Anrufe des angezeigten Berichts, einschliesslich ausstehender Auswertungen.',
    ],
    complete: [
      '[data-tour="export"]',
      'Ihr Export ist bereit',
      'Die CSV wurde aus dem angezeigten Berichtsstand erstellt und dem Browser zum Download übergeben.',
    ],
  } as const;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            nav(actor?.role === 'manager' ? 'dashboard' : 'queue');
          }}
        >
          <span className="brand-icon">
            <Droplets size={27} />
          </span>
          <span>
            <strong>DWC Manager</strong>
            <small>Service Intelligence</small>
          </span>
        </a>
        <div className="workspace-label">
          WORKSPACE <span>CH</span>
        </div>
        <nav aria-label="Hauptnavigation">
          {actor?.role === 'manager' && (
            <button
              className={page === 'dashboard' ? 'active' : ''}
              onClick={() => nav('dashboard')}
              data-tour="dashboard-nav"
            >
              <LayoutDashboard size={19} />
              Dashboard
            </button>
          )}
          <button className={page === 'queue' ? 'active' : ''} onClick={() => nav('queue')}>
            <Phone size={19} />
            Arbeitsplatz<span className="nav-count">{pending.length}</span>
          </button>
          <button className={page === 'calls' ? 'active' : ''} onClick={() => nav('calls')}>
            <ListFilter size={19} />
            Anrufauswertungen
          </button>
          <div className="nav-divider" />
          <button className={page === 'settings' ? 'active' : ''} onClick={() => nav('settings')}>
            <Settings2 size={19} />
            Demo & Daten
          </button>
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={19} />
          <span>
            Ein Grund pro Anruf.
            <br />
            Eine klare Übersicht.
          </span>
        </div>
        <div className="sidebar-profile">
          <span className="avatar">{actor?.role === 'manager' ? 'PM' : 'AG'}</span>
          <div>
            <strong>{actor?.role === 'manager' ? 'Project Manager' : 'Service Agent'}</strong>
            <span>Synthetisches Profil</span>
          </div>
          <span className="online-dot" />
        </div>
      </aside>
      <div className="main-shell">
        <div className="demo-banner">
          <div>
            <span className="demo-label">DEMO</span>
            <span>
              {mode === 'local' ? 'Lokaler Prototyp' : 'Portable Vorschau'} <i />
              Nur synthetische Daten
            </span>
          </div>
          <div className="demo-persona">
            <span>Ansicht</span>
            <button
              className={actor?.role === 'agent' ? 'selected' : ''}
              onClick={() => void switchRole('agent')}
              disabled={controlBusy}
              data-tour="role-agent"
            >
              <UserRound size={14} />
              Agent
            </button>
            <button
              className={actor?.role === 'manager' ? 'selected' : ''}
              onClick={() => void switchRole('manager')}
              disabled={controlBusy}
              data-tour="role-manager"
            >
              <Users size={14} />
              Manager
            </button>
          </div>
        </div>
        <header className="topbar">
          <div className="breadcrumbs">
            Service Center <ChevronRight size={14} />
            <strong>
              {page === 'dashboard'
                ? 'Dashboard'
                : page === 'queue'
                  ? 'Arbeitsplatz'
                  : page === 'calls'
                    ? 'Anrufauswertungen'
                    : 'Demo & Daten'}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="connection-state">
              <i />
              {mode === 'local' ? 'Lokal verbunden' : 'Offline verfügbar'}
            </span>
            <button
              className="icon-button"
              aria-label="Ausstehende Auswertungen öffnen"
              onClick={() => nav('queue')}
            >
              <Bell size={18} />
              {pending.length > 0 && <b className="notification-dot" />}
            </button>
            <span className="avatar small">{actor?.role === 'manager' ? 'PM' : 'AG'}</span>
          </div>
        </header>
        <main className="main-content" id="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === 'dashboard'
                  ? 'SERVICE ÜBERBLICK'
                  : page === 'queue'
                    ? 'NACH DEM GESPRÄCH'
                    : page === 'calls'
                      ? 'ANRUFE & ERGEBNISSE'
                      : 'PROTOTYP'}
              </span>
              <h1>
                {page === 'dashboard'
                  ? 'Dashboard'
                  : page === 'queue'
                    ? 'Ihr Arbeitsplatz'
                    : page === 'calls'
                      ? 'Anrufauswertungen'
                      : 'Demo & Daten'}
              </h1>
              <p>
                {page === 'dashboard'
                  ? 'Anrufgründe erkennen. Service gezielt verbessern.'
                  : page === 'queue'
                    ? 'Ein kurzer Rückblick. Wertvolle Erkenntnisse für Ihr Team.'
                    : page === 'calls'
                      ? 'Erfasste Gründe prüfen und offene Gespräche vervollständigen.'
                      : 'Die Funktionen mit kontrollierten Beispielen ausprobieren.'}
              </p>
            </div>
            {page === 'dashboard' ? (
              <div className="export-with-help">
                <button
                  className="button"
                  onClick={exportReport}
                  data-tour="export"
                  disabled={!report || reportBusy || exportBusy}
                >
                  <ArrowDownToLine size={17} />
                  CSV exportieren
                </button>
                <HelpHint label="CSV-Export">
                  Exportiert den angezeigten Berichtsstand, einschliesslich ausstehender Anrufe.
                  Nach fünf Minuten bitte den Bericht aktualisieren.
                </HelpHint>
              </div>
            ) : page !== 'settings' ? (
              <button className="button primary" onClick={newCall} disabled={controlBusy}>
                <Plus size={17} />
                Demo-Anruf beenden
              </button>
            ) : null}
          </div>
          {error && (
            <div className="notice error" role="alert">
              <CircleHelp size={19} />
              <span>{error}</span>
              <button
                className="text-button"
                onClick={() => void (page === 'dashboard' ? loadReport() : refresh())}
              >
                Erneut laden
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <Check size={16} />
              {notice}
              <button
                className="icon-button"
                aria-label="Hinweis schließen"
                onClick={() => setNotice('')}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {page === 'dashboard' && actor?.role === 'manager' && (
            <>
              <form
                className="period-filter"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!from || !through || from > through) {
                    setError('Bitte einen gültigen Zeitraum mit Beginn vor Ende wählen.');
                    return;
                  }
                  setRange({ from, until: addDay(through, 1) });
                }}
              >
                <div className="filter-title">
                  <Clock3 size={16} />
                  <strong>Zeitraum</strong>
                  <HelpHint label="Zeitraum">
                    Von und Bis sind eingeschlossen. Anwenden lädt den Bericht für Ihre Auswahl.
                    Unbestätigte Entwürfe zählen weiterhin als ausstehend.
                  </HelpHint>
                </div>
                <label>
                  Von
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    required
                  />
                </label>
                <span className="date-separator">—</span>
                <label>
                  Bis
                  <input
                    type="date"
                    value={through}
                    onChange={(e) => setThrough(e.target.value)}
                    required
                  />
                </label>
                <button className="button" type="submit" disabled={reportBusy}>
                  Anwenden
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setFrom(seed.reportRange.from);
                    setThrough(addDay(seed.reportRange.until, -1));
                    setRange({ ...seed.reportRange });
                  }}
                >
                  Demo-Zeitraum
                </button>
                <span className="timezone">Europe/Zurich</span>
                <button
                  className="icon-button"
                  aria-label="Bericht aktualisieren"
                  type="button"
                  onClick={() => void loadReport()}
                  disabled={reportBusy}
                >
                  <RefreshCw size={17} className={reportBusy ? 'spin' : ''} />
                </button>
              </form>
              <Dashboard
                report={report}
                loading={reportBusy}
                exportBusy={exportBusy}
                onExport={exportReport}
                onRefresh={loadReport}
                onPending={() => {
                  setStatus('pending');
                  nav('calls');
                }}
              />
            </>
          )}
          {page === 'queue' && (
            <>
              <div className="workspace-stats">
                <div>
                  <span className="metric-icon amber">
                    <Clock3 size={22} />
                  </span>
                  <div>
                    <strong>{pending.length}</strong>
                    <span>Ausstehende Auswertungen</span>
                  </div>
                </div>
                <div>
                  <span className="metric-icon teal">
                    <CheckCheck size={22} />
                  </span>
                  <div>
                    <strong>{calls.filter((c) => c.evaluation).length}</strong>
                    <span>Bereits ausgewertet</span>
                  </div>
                </div>
                <div className="workspace-hint">
                  <span className="metric-icon blue">
                    <Phone size={22} />
                  </span>
                  <div>
                    <strong>Vier Gründe. Wenige Klicks.</strong>
                    <span>Bei DWC-Problemen ergänzen Sie drei Details.</span>
                  </div>
                </div>
              </div>
              <section className="panel queue-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Ausstehende Auswertungen <span className="count-pill">{pending.length}</span>
                    </h2>
                    <p>Diese Gespräche warten auf einen Hauptgrund.</p>
                  </div>
                  <span className="live-caption">
                    <i />
                    Wird automatisch aktualisiert
                  </span>
                </div>
                {loading ? (
                  <div className="empty">
                    <RefreshCw className="spin" />
                    <p>Anrufe werden geladen …</p>
                  </div>
                ) : pending.length ? (
                  <div className="queue-list">
                    {pending.map((call, i) => (
                      <article className="queue-item" key={call.id}>
                        <div className="queue-call-icon">
                          <Phone size={22} />
                        </div>
                        <div className="queue-call-info">
                          <div>
                            <strong>{call.displayRef}</strong>
                            <span className="status-badge pending">
                              {call.draft ? 'Entwurf' : 'Ausstehend'}
                            </span>
                            {i === 0 && <span className="oldest-label">Zuletzt beendet</span>}
                          </div>
                          <span>
                            {dateTime(call.endedAt)} ·{' '}
                            {call.direction === 'inbound' ? 'Eingehend' : 'Ausgehend'} ·{' '}
                            {call.assignedAgentDisplayName ?? 'Unzugeordnet'}
                          </span>
                          {call.draft?.value.reason && (
                            <small>Entwurf: {labelFor('reasons', call.draft.value.reason)}</small>
                          )}
                        </div>
                        <button
                          className="button primary"
                          onClick={() => void openCall(call.id)}
                          data-testid={`open-${call.displayRef}`}
                        >
                          {call.draft ? 'Fortsetzen' : 'Auswerten'}
                          <ArrowRight size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <CheckCircle />
                    <h3>Alles ausgewertet</h3>
                    <p>Neue abgeschlossene Gespräche erscheinen hier automatisch.</p>
                    <button className="button" onClick={newCall}>
                      <Plus size={16} />
                      Demo-Anruf beenden
                    </button>
                  </div>
                )}
              </section>
              <div className="workflow-explainer">
                <div>
                  <span>01</span>
                  <strong>Grund wählen</strong>
                  <p>Bestellung, Rechnung, Problem DWC oder Sonstiges.</p>
                </div>
                <ArrowRight size={20} />
                <div>
                  <span>02</span>
                  <strong>Details ergänzen</strong>
                  <p>Bei einem DWC-Problem Gerät, Störung und Ergebnis.</p>
                </div>
                <ArrowRight size={20} />
                <div>
                  <span>03</span>
                  <strong>Bestätigt speichern</strong>
                  <p>Das Ergebnis fliesst direkt in die Auswertung ein.</p>
                </div>
              </div>
              <div className="queue-bottom">
                <ShieldCheck size={16} />
                <span>
                  Ohne Auswahl bleibt ein Anruf ausstehend. Es wird kein Grund automatisch vergeben.
                </span>
              </div>
            </>
          )}
          {page === 'calls' && (
            <section className="panel calls-panel">
              <div className="table-toolbar">
                <div className="search-input">
                  <Search size={17} />
                  <input
                    aria-label="Anruf suchen"
                    placeholder="Anruf-ID suchen …"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Auswertungen filtern"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">Alle Anrufe</option>
                  <option value="pending">Ausstehend</option>
                  <option value="submitted">Ausgewertet</option>
                  {actor?.role === 'manager' && <option value="unassigned">Unzugeordnet</option>}
                  {catalog.reasons.map((reason) => (
                    <option key={reason.code} value={reason.code}>
                      {reason.label}
                    </option>
                  ))}
                </select>
                <span className="quiet">{integer(filtered.length)} Ergebnisse</span>
              </div>
              <div className="table-scroll">
                <table className="calls-table">
                  <thead>
                    <tr>
                      <th>Anruf</th>
                      <th>Beendet</th>
                      <th>Grund</th>
                      <th>Status</th>
                      <th>Zuständig</th>
                      <th>
                        <span className="sr-only">Aktion</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((call) => (
                      <tr key={call.id}>
                        <td>
                          <strong>{call.displayRef}</strong>
                          <small>{call.direction === 'inbound' ? 'Eingehend' : 'Ausgehend'}</small>
                        </td>
                        <td>{dateTime(call.endedAt)}</td>
                        <td>
                          {call.evaluation ? (
                            <span className={`reason-tag ${call.evaluation.value.reason}`}>
                              {labelFor('reasons', call.evaluation.value.reason)}
                            </span>
                          ) : (
                            <span className="quiet">Noch offen</span>
                          )}
                        </td>
                        <td>
                          <span className={`status-badge ${call.evaluation ? 'done' : 'pending'}`}>
                            {call.evaluation ? <Check size={12} /> : <Clock3 size={12} />}{' '}
                            {call.evaluation
                              ? `Ausgewertet · V${call.evaluation.revision}`
                              : call.draft
                                ? 'Entwurf'
                                : 'Ausstehend'}
                          </span>
                        </td>
                        <td>
                          {call.assignedAgentDisplayName ?? (
                            <span className="warning-text">Unzugeordnet</span>
                          )}
                          {actor?.role === 'manager' && (
                            <button
                              className="text-button assignment-link"
                              onClick={() => setAssigning(call.id)}
                            >
                              Zuweisen
                            </button>
                          )}
                        </td>
                        <td>
                          <button className="text-button" onClick={() => void openCall(call.id)}>
                            {call.evaluation ? 'Prüfen' : 'Auswerten'}
                            <ChevronRight size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && (
                  <div className="empty">
                    <Search size={26} />
                    <h3>Keine passenden Anrufe</h3>
                    <p>Ändern Sie Ihre Suche oder den Filter.</p>
                    <button
                      className="button"
                      onClick={() => {
                        setQuery('');
                        setStatus('all');
                      }}
                    >
                      Filter zurücksetzen
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
          {page === 'settings' && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <div className="panel-heading">
                  <Database size={23} />
                  <h2>Demo-Daten</h2>
                </div>
                <dl>
                  <div>
                    <dt>Datensatz</dt>
                    <dd>12 synthetische Anrufe</dd>
                  </div>
                  <div>
                    <dt>Demo-Uhr</dt>
                    <dd>05.09.2026 · 12:00 Europe/Zurich</dd>
                  </div>
                  <div>
                    <dt>Speicher</dt>
                    <dd>
                      {mode === 'local'
                        ? 'SQLite auf diesem Computer'
                        : 'Arbeitsspeicher dieser Seite'}
                    </dd>
                  </div>
                </dl>
                <p>
                  {mode === 'local'
                    ? 'Bestätigte Änderungen bleiben beim Neustart erhalten. Zurücksetzen ersetzt nur diesen synthetischen Datensatz.'
                    : 'Änderungen bleiben in dieser geöffneten Seite erhalten. Neu laden stellt die Beispieldaten wieder her.'}
                </p>
                <button
                  className="button"
                  onClick={() => void tour.reset(false)}
                  disabled={controlBusy}
                >
                  <RotateCcw size={16} />
                  Demo zurücksetzen
                </button>
              </section>
              <section className="panel settings-panel">
                <div className="panel-heading">
                  <Wrench size={23} />
                  <h2>Fehler & Wiederholung</h2>
                </div>
                <p>
                  Testen Sie, wie das Formular auf einen einmaligen Fehler beim nächsten Absenden
                  reagiert.
                </p>
                <label className="field">
                  <span>Nächste Speicherung</span>
                  <select
                    value={fault}
                    onChange={(event) => {
                      const value = event.target.value as FaultMode;
                      setFault(value);
                      client.setFault(value);
                      setNotice('Fehlersimulation für das nächste Absenden eingestellt.');
                    }}
                  >
                    <option value="none">Normal speichern</option>
                    <option value="before">Fehler vor dem Speichern</option>
                    <option value="after">Antwort nach dem Speichern verloren</option>
                  </select>
                </label>
                <button
                  className="button"
                  onClick={async () => {
                    try {
                      await client.replayCall(seed.guidedCallId);
                      await refresh();
                      setNotice(
                        'Identische Anrufmeldung erneut zugestellt. Die Anzahl bleibt unverändert.',
                      );
                    } catch (cause) {
                      setError(messageOf(cause));
                    }
                  }}
                >
                  <RefreshCw size={16} />
                  Anrufmeldung wiederholen
                </button>
              </section>
              <section className="panel settings-panel wide">
                <div className="panel-heading">
                  <ShieldCheck size={23} />
                  <h2>Was dieser Prototyp zeigt</h2>
                </div>
                <p>
                  Gründe und DWC-Details erfassen, Entwürfe fortsetzen, Auswertungen korrigieren und
                  Berichte exportieren. Agent und Manager sind ausdrücklich synthetische Profile.
                </p>
                <div className="notice">
                  Telefonanlage, Firmenanmeldung und reale Serviceaufträge sind noch nicht
                  verbunden. Verwenden Sie hier ausschliesslich Beispieldaten.
                </div>
                <p className="small-note">
                  Die CSV enthält keine Telefonnummern oder Gesprächsinhalte. Der gespeicherte
                  Berichtsstand wird nach fünf Minuten ungültig; dann bitte neu laden.
                </p>
              </section>
            </div>
          )}
        </main>
        {tourActive ? (
          !selected && focusedTour()
        ) : reportTour ? (
          <TourSpotlight
            target={reportSteps[reportTour][0]}
            onDismiss={() => setReportTour(null)}
            returnFocus='[data-tour="report-tour-start"]'
            title={reportSteps[reportTour][1]}
            progress={{
              current: ['charts', 'filter', 'export', 'complete'].indexOf(reportTour) + 1,
              total: 4,
            }}
            controls={
              <div className="report-tour-controls">
                <button className="text-button" onClick={() => setReportTour(null)}>
                  {reportTour === 'complete' ? 'Schliessen' : 'Tour überspringen'}
                </button>
                {reportTour === 'charts' && (
                  <button className="button primary" onClick={() => setReportTour('filter')}>
                    Filter zeigen <ArrowRight size={16} />
                  </button>
                )}
                {reportTour === 'filter' && (
                  <button
                    className="button primary"
                    onClick={() => setReportTour('export')}
                    disabled={reportBusy || !report}
                  >
                    Zum Export <ArrowRight size={16} />
                  </button>
                )}
                {reportTour === 'export' && (
                  <button className="button" onClick={() => setReportTour('filter')}>
                    Zurück zum Filter
                  </button>
                )}
              </div>
            }
          >
            <p>{reportSteps[reportTour][2]}</p>
            {reportTour !== 'charts' && (
              <div className="tour-report-result" role="status">
                {reportBusy ? (
                  'Bericht wird geladen …'
                ) : report ? (
                  <>
                    {report.from} – {addDay(report.until, -1)}
                    <br />
                    <strong>
                      {report.counts.total} Anrufe · {report.counts.submitted} ausgewertet ·{' '}
                      {report.counts.pending} ausstehend
                    </strong>
                  </>
                ) : (
                  'Kein bestätigter Bericht. Bitte die Übersicht erneut laden.'
                )}
              </div>
            )}
            {reportTour === 'export' && error && (
              <p className="tour-error" role="alert">
                {error}
              </p>
            )}
          </TourSpotlight>
        ) : (
          <div className="demo-dock">{tourControls()}</div>
        )}
        <footer className="app-footer">
          <span>
            DWC Manager <b>Prototype 0.2</b>
          </span>
          <span>Demo-Zeit · 05. September 2026</span>
        </footer>
      </div>
      {selected && (
        <EvaluationDialog
          key={`${selected.id}-${generation.current}`}
          initial={selected}
          client={client}
          onChange={changeCall}
          onClose={() => {
            setSelected(null);
            void refresh();
          }}
          tourControls={(saving) => (tourActive ? focusedTour(saving) : null)}
        />
      )}
      {assigning && (
        <AssignmentDialog
          call={calls.find((c) => c.id === assigning)!}
          client={client}
          onClose={() => setAssigning(null)}
          onAssigned={(call) => {
            changeCall(call);
            setAssigning(null);
            setNotice(
              call.draftDiscarded
                ? 'Anruf zugewiesen. Der bisherige Entwurf wurde verworfen; eine vorhandene Auswertung bleibt erhalten.'
                : 'Anruf zugewiesen.',
            );
          }}
        />
      )}
    </div>
  );
}
function CheckCircle() {
  return (
    <span className="success-mark small">
      <Check size={28} />
    </span>
  );
}
function AssignmentDialog({
  call,
  client,
  onClose,
  onAssigned,
}: {
  call: Call;
  client: Client;
  onClose(): void;
  onAssigned(call: Call): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(commandKey());
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const agent = seed.actors.find((a) => a.role === 'agent')!;
  return (
    <dialog
      ref={ref}
      className="assignment-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="assignment-title"
    >
      <h2 id="assignment-title">Anruf zuweisen</h2>
      <p>
        {call.displayRef} an {agent.displayName} zuweisen.
      </p>
      {call.draft && (
        <div className="notice">Der vorhandene Entwurf wird bei der Zuweisung verworfen.</div>
      )}
      <p className="small-note">
        Der Prototyp enthält einen aktiven synthetischen Agenten. Weitere Firmenprofile werden bei
        der Anbindung ergänzt.
      </p>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <button className="button" onClick={onClose} disabled={busy}>
          Abbrechen
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              onAssigned(await client.assign(call.id, agent.id, call.recordVersion, key.current));
            } catch (e) {
              setError(messageOf(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Zuweisen
        </button>
      </div>
    </dialog>
  );
}
