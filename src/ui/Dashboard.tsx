import {
  ArrowDownToLine,
  ArrowUpRight,
  CheckCheck,
  Clock3,
  FileText,
  Phone,
  ShoppingCart,
  Wrench,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react';
import type { Report } from '../domain/types';
import { catalog, labelFor } from '../domain/catalog';
import { dayLabel, dateTime, integer, percent } from './format';
import { HelpHint } from './HelpHint';

const reasons = [
  { code: 'order', label: 'Bestellung', icon: ShoppingCart, color: '#258f83' },
  { code: 'invoice', label: 'Rechnung', icon: FileText, color: '#dc9237' },
  { code: 'dwc_problem', label: 'Problem DWC', icon: Wrench, color: '#dc656b' },
  { code: 'other', label: 'Sonstiges', icon: MoreHorizontal, color: '#8492aa' },
] as const;

function Breakdown({
  title,
  field,
  items,
  counts,
  total,
}: {
  title: string;
  field: 'devices' | 'faults' | 'resolutions';
  items: readonly { code: string; label: string }[];
  counts: Record<string, number>;
  total: number;
}) {
  return (
    <section className="panel breakdown">
      <div className="panel-heading">
        <h3>{title}</h3>
        <span className="quiet">{integer(total)} DWC-Anrufe</span>
      </div>
      <div className="breakdown-items">
        {items.map((item) => {
          const count = counts[item.code] ?? 0;
          return (
            <div className="breakdown-row" key={item.code}>
              <div className="breakdown-label">
                <span>{labelFor(field, item.code) || item.label}</span>
                <span>
                  {integer(count)} <small>{percent(total ? (100 * count) / total : null)}</small>
                </span>
              </div>
              <div className="bar-track">
                <div style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Dashboard({
  report,
  loading,
  exportBusy,
  onExport,
  onRefresh,
  onPending,
}: {
  report: Report | null;
  loading: boolean;
  exportBusy: boolean;
  onExport: () => void;
  onRefresh: () => void;
  onPending: () => void;
}) {
  if (!report)
    return (
      <div className="panel empty">
        <RefreshCw size={28} />
        <h3>{loading ? 'Auswertung wird geladen …' : 'Noch keine Auswertung'}</h3>
        <p>Wählen Sie einen Zeitraum und laden Sie die Übersicht.</p>
        <button className="button primary" onClick={onRefresh}>
          Übersicht laden
        </button>
      </div>
    );
  const c = report.counts;
  const reasonPercent = report.reasonPercent ?? {};
  const max = Math.max(
    1,
    ...report.daily.flatMap((day) => [...reasons.map((r) => day[r.code]), day.pending]),
  );
  const series = [...reasons, { code: 'pending' as const, label: 'Ausstehend', color: '#abb6c7' }];
  const width = 680,
    height = 184,
    left = 34,
    right = 15,
    bottom = 28,
    top = 16;
  const x = (index: number) =>
    left +
    (report.daily.length < 2
      ? (width - left - right) / 2
      : (index / (report.daily.length - 1)) * (width - left - right));
  const y = (value: number) => height - bottom - (value / max) * (height - bottom - top);
  const activeFaults = catalog.faults.filter((f) => (report.dwcFaultCounts[f.code] ?? 0) > 0);
  const colors = [
    '#dd676d',
    '#268f87',
    '#efa856',
    '#566dad',
    '#a2adbf',
    '#7bacbd',
    '#b495c1',
    '#c7d0dc',
    '#78899b',
  ];
  let angle = 0;
  const stops = activeFaults
    .map((f, i) => {
      const start = angle;
      angle += (report.dwcFaultCounts[f.code] / Math.max(1, c.dwc_problem)) * 360;
      return `${colors[i]} ${start}deg ${angle}deg`;
    })
    .join(',');
  return (
    <div className="dashboard" aria-busy={loading} data-testid="dashboard">
      <div className="stats-grid">
        <div className="stat-card total">
          <div className="stat-label">
            <span className="stat-icon">
              <Phone size={18} />
            </span>
            Gesamt Anrufe
          </div>
          <strong data-testid="total-count">{integer(c.total)}</strong>
          <span className="stat-foot">Abgeschlossen & bearbeitet</span>
        </div>
        {reasons.map((r) => (
          <div className={`stat-card ${r.code}`} key={r.code}>
            <div className="stat-label">
              <span className="stat-icon">
                <r.icon size={18} />
              </span>
              {r.label}
            </div>
            <strong data-testid={`count-${r.code}`}>{integer(c[r.code])}</strong>
            <span className="stat-foot">{percent(reasonPercent[r.code])} aller Anrufe</span>
          </div>
        ))}
      </div>
      <div className="completion-strip">
        <span className="completion-icon">
          <CheckCheck size={21} />
        </span>
        <div>
          <strong>
            {integer(c.submitted)} von {integer(c.total)} Anrufen ausgewertet
          </strong>
          <span>{percent(report.completionPercent)} Erfassungsquote</span>
        </div>
        <div className="completion-track">
          <div style={{ width: `${report.completionPercent ?? 0}%` }} />
        </div>
        <button className="pending-link" onClick={onPending}>
          <Clock3 size={16} />
          <span>
            {c.pending} ausstehend <small>({percent(reasonPercent.pending)})</small>
          </span>
          <ArrowUpRight size={16} />
        </button>
      </div>
      {c.total === 0 && (
        <div className="notice">
          <Phone size={18} />
          Keine abgeschlossenen Anrufe im gewählten Zeitraum. Passen Sie die Datumsgrenzen an.
        </div>
      )}
      <div className="charts-grid">
        <section className="panel trend-panel">
          <div className="panel-heading">
            <div>
              <h3>
                Anrufgründe im Zeitverlauf{' '}
                <HelpHint label="Zeitverlauf">
                  Jeder Punkt zählt Anrufe an diesem Tag. Die graue Linie zeigt offene Auswertungen.
                  Die genauen Werte stehen unter der Grafik in der aufklappbaren Tabelle.
                </HelpHint>
              </h3>
              <p>Anzahl pro Tag · Europe/Zurich</p>
            </div>
            <span className="small-pill">Täglich</span>
          </div>
          <div className="chart-legend">
            {series.map((r) => (
              <span key={r.code}>
                <i style={{ background: r.color }} />
                {r.label}
              </span>
            ))}
          </div>
          <div
            className="chart-scroll"
            tabIndex={0}
            role="region"
            aria-label="Zeitverlauf, auf kleinen Bildschirmen horizontal scrollbar"
          >
            <svg
              className="line-chart"
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label="Tägliche Anrufgründe; genaue Werte in der Datentabelle darunter"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <g key={t}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={y(max * t)}
                    y2={y(max * t)}
                    stroke="#e9edf3"
                  />
                  <text x={left - 10} y={y(max * t) + 4} textAnchor="end">
                    {+(max * t).toFixed(1)}
                  </text>
                </g>
              ))}
              {series.map((r) => (
                <g key={r.code}>
                  <polyline
                    points={report.daily.map((day, i) => `${x(i)},${y(day[r.code])}`).join(' ')}
                    fill="none"
                    stroke={r.color}
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeDasharray={r.code === 'pending' ? '4 4' : undefined}
                  />
                  {report.daily.length <= 32 &&
                    report.daily.map((day, i) => (
                      <circle key={day.date} cx={x(i)} cy={y(day[r.code])} r="3" fill={r.color}>
                        <title>
                          {dayLabel(day.date)}: {r.label} {day[r.code]}
                        </title>
                      </circle>
                    ))}
                </g>
              ))}
              {report.daily
                .filter(
                  (_, i) =>
                    i === 0 ||
                    i === report.daily.length - 1 ||
                    i % Math.max(1, Math.ceil(report.daily.length / 6)) === 0,
                )
                .map((day) => (
                  <text
                    key={day.date}
                    x={x(report.daily.indexOf(day))}
                    y={height - 6}
                    textAnchor="middle"
                  >
                    {dayLabel(day.date)}
                  </text>
                ))}
            </svg>
          </div>
          <details className="chart-data">
            <summary>Tageswerte als Tabelle</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Datum</th>
                    {series.map((r) => (
                      <th key={r.code}>{r.label}</th>
                    ))}
                    <th>Gesamt</th>
                  </tr>
                </thead>
                <tbody>
                  {report.daily.map((day) => (
                    <tr key={day.date}>
                      <td>{dayLabel(day.date)}</td>
                      {series.map((r) => (
                        <td key={r.code}>{day[r.code]}</td>
                      ))}
                      <td>{day.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <section className="panel fault-panel">
          <div className="panel-heading">
            <div>
              <h3>Problem DWC</h3>
              <p>Häufigste Störungen</p>
            </div>
            <span className="subtle-icon">
              <Wrench size={19} />
            </span>
          </div>
          {c.dwc_problem > 0 ? (
            <div className="donut-layout">
              <div
                className="donut"
                role="img"
                aria-label={`${c.dwc_problem} ausgewertete DWC-Anrufe`}
                style={{ background: `conic-gradient(${stops})` }}
              >
                <div>
                  <strong>{integer(c.dwc_problem)}</strong>
                  <span>ausgewertet</span>
                </div>
              </div>
              <div className="donut-legend">
                {activeFaults.map((f, i) => (
                  <div key={f.code}>
                    <i style={{ background: colors[i] }} />
                    <span>{f.label}</span>
                    <strong>{report.dwcFaultCounts[f.code]}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty compact">
              <Wrench size={28} />
              <p>Keine ausgewerteten DWC-Probleme in diesem Zeitraum.</p>
            </div>
          )}
          <p className="denominator">Verteilung innerhalb der ausgewerteten DWC-Anrufe</p>
        </section>
      </div>
      <div className="detail-heading">
        <div>
          <span className="eyebrow">DETAILANALYSE</span>
          <h2>DWC-Probleme verstehen</h2>
        </div>
        <span className="quiet">Alle Kategorien, einschliesslich Unklar</span>
      </div>
      <div className="breakdowns-grid">
        <Breakdown
          title="Störungen"
          field="faults"
          items={catalog.faults}
          counts={report.dwcFaultCounts}
          total={c.dwc_problem}
        />
        <div className="stack">
          <Breakdown
            title="Geräte"
            field="devices"
            items={catalog.devices}
            counts={report.deviceCounts}
            total={c.dwc_problem}
          />
          <Breakdown
            title="Behebung / Ergebnis"
            field="resolutions"
            items={catalog.resolutions}
            counts={report.resolutionCounts}
            total={c.dwc_problem}
          />
        </div>
      </div>
      <footer className="report-footer">
        <span>
          Erstellt {dateTime(report.generatedAt)} · Synthetische Daten ·{' '}
          {report.periodIsPartial ? 'Laufender Zeitraum' : 'Abgeschlossener Zeitraum'}
        </span>
        <button className="button" disabled={exportBusy || loading} onClick={onExport}>
          <ArrowDownToLine size={16} />
          {exportBusy ? 'Export wird erstellt …' : 'Diesen Stand als CSV exportieren'}
        </button>
      </footer>
    </div>
  );
}
