import { useEffect, useRef, useState } from 'react';
export type TourState = 'idle' | 'playing' | 'paused' | 'finished' | 'manual';
export interface TourActions {
  reset(): Promise<void>;
  replay(): Promise<void>;
  openGuided(isCurrent: () => boolean): Promise<void>;
  guidedId: string;
  reportSummary(): string;
  reportStatus(): 'ready' | 'loading' | 'error';
}
const captions = [
  'Ein Anruf ist beendet. Die bereits gezählte Meldung wird erneut zugestellt – ohne doppelten Eintrag.',
  'Der Agent wählt einen Hauptgrund. Hier: Problem DWC.',
  'Das betroffene Gerät auswählen. Unbekannt ist eine gültige Antwort.',
  'Die wichtigste Störung erfassen.',
  'Das Ergebnis des Gesprächs festhalten.',
  'Erst die bestätigte Speicherung schliesst die Auswertung ab.',
  'Die Zusammenfassung zeigt den tatsächlich gespeicherten Stand.',
  'In der Manager-Ansicht wird das Ergebnis im Bericht sichtbar.',
  'Die aktualisierte Übersicht ist bereit. Filter und Export können Sie jetzt selbst ausprobieren.',
];
export function useTour(actions: TourActions) {
  const [state, setState] = useState<TourState>('idle');
  const [cursor, setCursor] = useState(0);
  const [tick, setTick] = useState(0);
  const [delay, setDelay] = useState(2600);
  const [note, setNote] = useState(
    'Vom Anruf zur Übersicht. Start setzt die Beispieldaten zurück. Eigene Eingaben pausieren die Tour.',
  );
  const epoch = useRef(0);
  const status = useRef<TourState>('idle');
  const position = useRef(0);
  const currentActions = useRef(actions);
  currentActions.current = actions;
  const resetBusy = useRef(false);
  const navigationChanged = useRef(false);
  function move(next: TourState) {
    status.current = next;
    setState(next);
    epoch.current++;
  }
  function pause() {
    if (status.current === 'playing') move('paused');
  }
  function skip() {
    move('manual');
    setNote('Tour beendet. Ihre Eingaben und gespeicherten Auswertungen bleiben erhalten.');
  }
  async function reset(autoplay = false) {
    if (resetBusy.current) return;
    resetBusy.current = true;
    move('manual');
    const resetEpoch = epoch.current;
    try {
      await currentActions.current.reset();
      position.current = 0;
      navigationChanged.current = false;
      setCursor(0);
      const startNow = autoplay && !document.hidden && resetEpoch === epoch.current;
      setNote(
        autoplay && !startNow
          ? 'Tour pausiert. Wählen Sie Fortsetzen, wenn Sie bereit sind.'
          : captions[0],
      );
      move(startNow ? 'playing' : autoplay ? 'paused' : 'idle');
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Zurücksetzen fehlgeschlagen.');
      move('paused');
    } finally {
      resetBusy.current = false;
    }
  }
  function play() {
    if (state === 'idle' || state === 'finished' || state === 'manual') {
      void reset(true);
      return;
    }
    if (navigationChanged.current) {
      setNote(
        'Sie haben die Ansicht gewechselt. Erkunden Sie sie selbst, überspringen Sie die Tour oder starten Sie mit Zurücksetzen neu.',
      );
      return;
    }
    const modal = document.querySelector<HTMLDialogElement>('[data-testid="evaluation-dialog"]');
    const chosen = modal?.querySelector<HTMLElement>('.reason-choice[aria-pressed="true"]');
    if (
      position.current >= 1 &&
      position.current <= 5 &&
      modal?.dataset.saved !== 'true' &&
      chosen
    ) {
      if (chosen.dataset.tour !== 'reason-dwc_problem') {
        position.current = 5;
        setCursor(5);
        setNote(
          `${chosen.textContent?.trim()}: keine DWC-Details erforderlich. Die gewählte Auswertung wird gespeichert.`,
        );
        move('playing');
        return;
      }
      const fields = ['device', 'fault', 'resolution'];
      const missing = fields.findIndex(
        (field) => !modal?.querySelector<HTMLSelectElement>(`[data-tour="${field}"]`)?.value,
      );
      if (missing >= 0 && missing + 2 < position.current) {
        setNote(
          'Eine frühere DWC-Angabe wurde geändert oder gelöscht. Bitte Gerät, Störung und Ergebnis vervollständigen und dann Fortsetzen wählen.',
        );
        return;
      }
      if (missing < 0) {
        position.current = 5;
        setCursor(5);
      }
    }
    setNote(captions[position.current]);
    move('playing');
  }
  useEffect(() => {
    const takeOver = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (event.isTrusted && target && !target.closest('[data-demo-controls]')) {
        if (
          (status.current === 'playing' || status.current === 'paused') &&
          target.closest('nav, .brand, [data-tour="role-agent"], [data-tour="role-manager"]')
        )
          navigationChanged.current = true;
        pause();
      }
    };
    document.addEventListener('pointerdown', takeOver, true);
    document.addEventListener('keydown', takeOver, true);
    const hidden = () => {
      if (document.hidden) {
        if (resetBusy.current) move('paused');
        else pause();
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('pointerdown', takeOver, true);
      document.removeEventListener('keydown', takeOver, true);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  useEffect(() => {
    if (state !== 'playing') return;
    const run = epoch.current;
    const timer = setTimeout(async () => {
      if (run !== epoch.current || status.current !== 'playing') return;
      const click = (selector: string) => {
        const target = document.querySelector<HTMLButtonElement>(selector);
        if (!target || target.disabled) return false;
        target.click();
        return true;
      };
      const field = (selector: string, value: string) => {
        const target = document.querySelector<HTMLSelectElement>(selector);
        if (!target) return true;
        if (target.value) return true;
        if (target.disabled) return false;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(
          target,
          value,
        );
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      let done = false;
      try {
        const step = position.current;
        const modal = document.querySelector<HTMLDialogElement>(
          '[data-testid="evaluation-dialog"]',
        );
        if (
          step >= 1 &&
          step <= 6 &&
          (!modal || modal.dataset.callId !== currentActions.current.guidedId)
        )
          throw new Error(
            'Der ursprüngliche Anruf ist nicht mehr geöffnet. Bitte manuell abschliessen oder die Tour neu starten.',
          );
        if (step >= 1 && step <= 5 && modal?.dataset.saved === 'true') {
          position.current = 6;
          setCursor(6);
          setNote(captions[6]);
          return;
        }
        if (step >= 2 && step <= 4 && !modal?.querySelector('[data-tour="device"]')) {
          position.current = 5;
          setCursor(5);
          setNote(
            'Für den gewählten Hauptgrund sind keine DWC-Details nötig. Jetzt wird die Auswertung gespeichert.',
          );
          return;
        }
        if (step === 0) {
          await currentActions.current.replay();
          if (run !== epoch.current) return;
          await currentActions.current.openGuided(
            () => run === epoch.current && status.current === 'playing',
          );
          done = true;
        } else if (step === 1) {
          done =
            Boolean(document.querySelector('.reason-choice[aria-pressed="true"]')) ||
            click('[data-tour="reason-dwc_problem"]');
        } else if (step === 2) done = field('[data-tour="device"]', 'tuma_classic_comfort');
        else if (step === 3) done = field('[data-tour="fault"]', 'descaling_filter');
        else if (step === 4) done = field('[data-tour="resolution"]', 'service_requested');
        else if (step === 5) {
          if (modal?.dataset.saved === 'true') done = true;
          else if (document.querySelector('.form-error'))
            throw new Error(
              'Die Speicherung braucht Ihre Aufmerksamkeit. Beheben Sie den Fehler und setzen Sie die Tour fort.',
            );
          else {
            const submit = document.querySelector<HTMLButtonElement>('[data-tour="submit"]');
            if (submit?.disabled && !modal?.querySelector('.spin'))
              throw new Error(
                'Bitte die fehlenden Angaben im Formular vervollständigen und Fortsetzen wählen.',
              );
            click('[data-tour="submit"]');
          }
        } else if (step === 6) done = click('[data-tour="close-summary"]');
        else if (step === 7) {
          done = click('[data-tour="role-manager"]');
        } else if (step === 8) {
          if (currentActions.current.reportStatus() === 'error')
            throw new Error(
              'Der Bericht ist nicht bestätigt. Bitte laden Sie die Übersicht erneut und wählen Sie Fortsetzen.',
            );
          if (
            document.querySelector('[data-testid="dashboard"]') &&
            currentActions.current.reportStatus() === 'ready'
          ) {
            setNote(currentActions.current.reportSummary());
            move('finished');
            return;
          }
        }
        if (run !== epoch.current || status.current !== 'playing') return;
        if (done) {
          position.current++;
          setCursor(position.current);
          setNote(captions[position.current] ?? captions[8]);
        } else setCursor((value) => value); // The next tick rechecks the postcondition; it never assumes a save committed.
      } catch (error) {
        if (run === epoch.current) {
          setNote(
            error instanceof Error ? error.message : 'Bitte übernehmen Sie diesen Schritt manuell.',
          );
          move('paused');
        }
      }
      if (run === epoch.current && status.current === 'playing') setTick((value) => value + 1);
    }, delay);
    return () => clearTimeout(timer);
    // A tick also progresses actions whose asynchronous postcondition has not settled yet.
  }, [state, cursor, tick, delay]);
  return { state, cursor, note, play, pause, skip, reset, delay, setDelay, total: captions.length };
}
