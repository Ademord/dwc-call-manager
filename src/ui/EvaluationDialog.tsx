import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  FileText,
  MoreHorizontal,
  Phone,
  RefreshCw,
  ShoppingCart,
  Wrench,
  X,
  AlertCircle,
} from 'lucide-react';
import type { Call, EvaluationValue } from '../domain/types';
import type { Client } from '../client/types';
import { catalog, emptyEvaluation, labelFor } from '../domain/catalog';
import { commandKey, dateTime, messageOf } from './format';
import { HelpHint } from './HelpHint';

const reasons = [
  { code: 'order', icon: ShoppingCart },
  { code: 'invoice', icon: FileText },
  { code: 'dwc_problem', icon: Wrench },
  { code: 'other', icon: MoreHorizontal },
] as const;
type Envelope = { value: EvaluationValue; version: number; key: string };

export function EvaluationDialog({
  initial,
  client,
  onClose,
  onChange,
  tourControls,
}: {
  initial: Call;
  client: Client;
  onClose: () => void;
  onChange: (call: Call) => void;
  tourControls?: (saving: boolean) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState<EvaluationValue>(() =>
    structuredClone(initial.draft?.value ?? initial.evaluation?.value ?? emptyEvaluation()),
  );
  const [current, setCurrent] = useState(initial);
  const [draftStatus, setDraftStatus] = useState(
    initial.draft ? 'Entwurf gespeichert' : 'Noch nicht ausgewertet',
  );
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Call | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [requestLocked, setRequestLocked] = useState(false);
  const version = useRef(initial.recordVersion);
  const latest = useRef(value);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const queuedDrafts = useRef(0);
  const pendingDraft = useRef<Envelope | null>(null);
  const pendingSubmit = useRef<Envelope | null>(null);
  const alive = useRef(true);
  const committed = useRef(false);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    alive.current = true;
    previousFocus.current = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    return () => {
      alive.current = false;
      previousFocus.current?.focus();
    };
  }, []);

  const accept = (call: Call) => {
    version.current = call.recordVersion;
    if (alive.current) {
      setCurrent(call);
      onChange(call);
    }
  };
  const persist = (next: EvaluationValue) => {
    queuedDrafts.current++;
    setDraftBusy(true);
    setDraftStatus('Entwurf wird gespeichert …');
    queue.current = queue.current
      .then(async () => {
        if (!alive.current || committed.current || pendingDraft.current) return;
        const envelope = {
          value: structuredClone(next),
          version: version.current,
          key: commandKey(),
        };
        pendingDraft.current = envelope;
        try {
          accept(
            await client.saveDraft(initial.id, envelope.value, envelope.version, envelope.key),
          );
          pendingDraft.current = null;
          if (alive.current) {
            setDraftStatus(
              queuedDrafts.current > 1 ? 'Entwurf wird gespeichert …' : 'Entwurf gespeichert',
            );
            setError('');
          }
        } catch (cause) {
          if (alive.current) {
            setError(messageOf(cause));
            setErrorStatus(
              cause && typeof cause === 'object' && 'status' in cause ? Number(cause.status) : 0,
            );
            setDraftStatus('Entwurf nicht bestätigt');
            setRequestLocked(true);
          }
        }
      })
      .finally(() => {
        queuedDrafts.current--;
        if (alive.current) setDraftBusy(queuedDrafts.current > 0);
      });
  };
  const changeValue = (next: EvaluationValue) => {
    latest.current = next;
    setValue(next);
    setError('');
    persist(next);
  };
  const chooseReason = (reason: EvaluationValue['reason']) =>
    changeValue(
      reason === 'dwc_problem' && value.reason === reason
        ? value
        : { ...emptyEvaluation(), reason },
    );
  const isComplete = Boolean(
    value.reason &&
      (value.reason !== 'dwc_problem' || (value.device && value.fault && value.resolution)),
  );

  async function retryDraft() {
    const request = pendingDraft.current;
    if (!request) return;
    setBusy(true);
    setError('');
    try {
      const receipt = await client.saveDraft(
        initial.id,
        request.value,
        request.version,
        request.key,
      );
      const actual = await client.getCall(initial.id);
      accept(receipt);
      pendingDraft.current = null;
      if (actual.recordVersion !== receipt.recordVersion) {
        setCurrent(actual);
        setErrorStatus(412);
        setRequestLocked(true);
        setDraftStatus('Neuerer Stand vorhanden');
        setError(
          'Ihr Entwurf wurde bestätigt, inzwischen wurde der Anruf aber erneut geändert. Vergleichen Sie den aktuellen Stand mit Ihren Eingaben, bevor Sie fortfahren.',
        );
        return;
      }
      setRequestLocked(false);
      setDraftStatus('Entwurf gespeichert');
      if (JSON.stringify(latest.current) !== JSON.stringify(request.value)) persist(latest.current);
    } catch (cause) {
      setError(messageOf(cause));
      const status =
        cause && typeof cause === 'object' && 'status' in cause ? Number(cause.status) : 0;
      setErrorStatus(status);
      if (status === 412) {
        setDraftStatus('Neuerer Stand vorhanden');
        try {
          setCurrent(await client.getCall(initial.id));
        } catch {
          /* Keep the last known record and preserved input. */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (busy || committed.current) return;
    setBusy(true);
    setError('');
    try {
      await queue.current;
      if (pendingDraft.current) {
        setError('Der Entwurf ist noch nicht bestätigt. Bitte zuerst erneut übertragen.');
        return;
      }
      pendingSubmit.current ??= {
        value: structuredClone(latest.current),
        version: version.current,
        key: commandKey(),
      };
      const request = pendingSubmit.current;
      const result = await client.submit(initial.id, request.value, request.version, request.key);
      committed.current = true;
      accept(result);
      setSaved(result);
      pendingSubmit.current = null;
      setRequestLocked(false);
    } catch (cause) {
      setError(messageOf(cause));
      setErrorStatus(
        cause && typeof cause === 'object' && 'status' in cause ? Number(cause.status) : 0,
      );
      setRequestLocked(true);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function reloadCurrent() {
    if ((pendingSubmit.current || pendingDraft.current) && errorStatus !== 412) return;
    setBusy(true);
    try {
      const actual = await client.getCall(initial.id);
      accept(actual);
      pendingDraft.current = null;
      pendingSubmit.current = null;
      setRequestLocked(false);
      setError('');
      setDraftStatus('Aktueller Stand geladen · Ihre Eingaben bleiben erhalten');
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (busy || draftBusy) return;
    onClose();
  }
  const persisted = saved?.evaluation?.value;
  return (
    <dialog
      ref={dialog}
      className="evaluation-dialog"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      aria-labelledby="evaluation-title"
      data-testid="evaluation-dialog"
      data-call-id={initial.id}
      data-saved={Boolean(saved)}
    >
      <header className="dialog-header">
        <Phone size={19} />
        <span id="evaluation-title">
          {saved
            ? 'Auswertung gespeichert'
            : initial.evaluation
              ? 'Auswertung korrigieren'
              : 'Anruf beendet · Bitte auswerten'}
        </span>
        <button
          className="icon-button"
          aria-label="Dialog schließen"
          onClick={close}
          disabled={busy || draftBusy}
        >
          <X size={19} />
        </button>
      </header>
      {saved && persisted ? (
        <div className="saved-content">
          <div className="success-mark">
            <Check size={36} />
          </div>
          <h2>Auswertung gespeichert!</h2>
          <p>Vielen Dank für Ihre Rückmeldung.</p>
          <div className="summary-box">
            <h3>Zusammenfassung</h3>
            <dl>
              <div>
                <dt>Anruf</dt>
                <dd>{saved.displayRef}</dd>
              </div>
              <div>
                <dt>Grund</dt>
                <dd>{labelFor('reasons', persisted.reason)}</dd>
              </div>
              {persisted.reason === 'dwc_problem' && (
                <>
                  <div>
                    <dt>Gerät</dt>
                    <dd>{labelFor('devices', persisted.device)}</dd>
                  </div>
                  <div>
                    <dt>Störung</dt>
                    <dd>{labelFor('faults', persisted.fault)}</dd>
                  </div>
                  <div>
                    <dt>Ergebnis</dt>
                    <dd>{labelFor('resolutions', persisted.resolution)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Revision</dt>
                <dd>{saved.evaluation?.revision}</dd>
              </div>
            </dl>
          </div>
          {persisted.resolution === 'service_requested' && (
            <p className="small-note">
              „Service angefordert“ erfasst das Gesprächsergebnis. Es wurde kein Serviceauftrag
              erstellt.
            </p>
          )}
          <button className="button primary" onClick={close} data-tour="close-summary">
            Schließen <Check size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="dialog-body">
            <div className="call-context">
              <span className="phone-bubble">
                <Phone size={24} />
              </span>
              <div>
                <strong>Anruf {initial.displayRef} beendet</strong>
                <span>
                  {dateTime(initial.endedAt)} ·{' '}
                  {initial.direction === 'inbound' ? 'Eingehend' : 'Ausgehend'}
                </span>
              </div>
              <span className="small-pill">{initial.evaluation ? 'Korrektur' : 'Ausstehend'}</span>
            </div>
            <div className="form-step">
              <span className="step-number">1</span>
              <h3>Worum ging es bei dem Anruf?</h3>
              <HelpHint label="Hauptgrund">
                Wählen Sie den wichtigsten Grund für diesen Anruf. Nur Problem DWC braucht drei
                weitere Angaben. Der Entwurf zählt erst nach Speichern als ausgewertet.
              </HelpHint>
              <span>Ein Hauptgrund</span>
            </div>
            <div className="reason-grid" role="group" aria-label="Grund des Anrufs">
              {reasons.map((reason) => (
                <button
                  key={reason.code}
                  type="button"
                  data-tour={`reason-${reason.code}`}
                  className={`reason-choice ${reason.code} ${value.reason === reason.code ? 'selected' : ''}`}
                  aria-pressed={value.reason === reason.code}
                  disabled={busy || requestLocked}
                  onClick={() => chooseReason(reason.code)}
                >
                  <reason.icon size={22} />
                  <span>{labelFor('reasons', reason.code)}</span>
                  {value.reason === reason.code && <CheckCircle2 size={17} />}
                </button>
              ))}
            </div>
            {value.reason === 'dwc_problem' && (
              <section className="dwc-fields">
                <div className="form-step">
                  <span className="step-number">2</span>
                  <h3>Problem genauer beschreiben</h3>
                  <HelpHint label="DWC-Details">
                    Erfassen Sie Gerät, wichtigste Störung und Gesprächsergebnis. Unbekannt oder
                    Unklar sind gültige Antworten. Service angefordert erstellt hier keinen
                    Serviceauftrag.
                  </HelpHint>
                  <span>3 Angaben</span>
                </div>
                {(
                  [
                    {
                      field: 'device',
                      catalog: 'devices',
                      label: 'Um welches Gerät handelt es sich?',
                    },
                    { field: 'fault', catalog: 'faults', label: 'Was war es für eine Störung?' },
                    {
                      field: 'resolution',
                      catalog: 'resolutions',
                      label: 'Wie wurde der Anruf abgeschlossen?',
                    },
                  ] as const
                ).map((item, i) => (
                  <label className="field" key={item.field}>
                    <span>
                      {i + 1}. {item.label} <b>*</b>
                    </span>
                    <select
                      data-tour={item.field}
                      value={value[item.field] ?? ''}
                      required
                      disabled={busy || requestLocked}
                      onChange={(event) =>
                        changeValue({
                          ...value,
                          [item.field]: event.target.value || null,
                        } as EvaluationValue)
                      }
                    >
                      <option value="">Bitte auswählen …</option>
                      {catalog[item.catalog].map((option) => (
                        <option value={option.code} key={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <span className="small-note">
                  Nicht bekannt? Wählen Sie ausdrücklich „Unbekannt“ oder „Unklar“.
                </span>
              </section>
            )}
            {initial.evaluation && (
              <div className="notice">
                Die bisherige Auswertung bleibt in Berichten enthalten, bis Sie diese Korrektur
                speichern.
              </div>
            )}
            {error && (
              <div className="form-error" role="alert">
                <AlertCircle size={19} />
                <div>
                  <strong>Speichern nicht bestätigt</strong>
                  <p>{error}</p>
                  {errorStatus === 412 && (
                    <p>
                      Zuletzt gelesener Stand:{' '}
                      {labelFor(
                        'reasons',
                        current.draft?.value.reason ?? current.evaluation?.value.reason,
                      ) || 'Noch kein Grund'}{' '}
                      · Datensatzversion {current.recordVersion}. Ihre Eingaben stehen weiterhin im
                      Formular.
                    </p>
                  )}
                  {pendingDraft.current && (
                    <button className="button" disabled={busy} onClick={retryDraft}>
                      Entwurf erneut übertragen
                    </button>
                  )}
                  {requestLocked && errorStatus === 412 && (
                    <button className="text-button" disabled={busy} onClick={reloadCurrent}>
                      Aktuellen Stand prüfen, Eingaben behalten
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <footer className="dialog-footer">
            <div className={`draft-status ${error ? 'unsaved' : ''}`} aria-live="polite">
              {draftBusy ? (
                <RefreshCw size={14} className="spin" />
              ) : error ? (
                <AlertCircle size={14} />
              ) : current.draft ? (
                <Check size={14} />
              ) : (
                <Clock3 size={14} />
              )}
              <span>{draftStatus}</span>
            </div>
            <div className="dialog-actions">
              <button className="button subtle" onClick={close} disabled={busy || draftBusy}>
                <ChevronLeft size={15} />
                Später
              </button>
              <button
                className="button primary"
                data-tour="submit"
                disabled={
                  !isComplete ||
                  busy ||
                  Boolean(pendingDraft.current) ||
                  (requestLocked && errorStatus === 412)
                }
                onClick={submit}
              >
                {busy ? <RefreshCw className="spin" size={16} /> : <Check size={17} />}{' '}
                {pendingSubmit.current
                  ? 'Erneut versuchen'
                  : busy
                    ? 'Wird gespeichert …'
                    : 'Speichern'}
              </button>
            </div>
          </footer>
        </>
      )}
      {tourControls?.(busy || draftBusy)}
    </dialog>
  );
}
