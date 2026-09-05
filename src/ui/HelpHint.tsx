import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Info } from 'lucide-react';
import './HelpHint.css';

/** Supplementary, non-interactive explanations; keep required information visible. */
export function HelpHint({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const triggerHovered = useRef(false);
  const popupHovered = useRef(false);
  const triggerFocused = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== undefined) clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  }, []);

  const show = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const dismiss = useCallback(() => {
    cancelClose();
    pinned.current = false;
    popupHovered.current = false;
    setOpen(false);
  }, [cancelClose]);

  const closeWhenIdle = useCallback(() => {
    cancelClose();
    // Allow the pointer to cross the small gap between trigger and explanation.
    closeTimer.current = setTimeout(() => {
      closeTimer.current = undefined;
      if (
        !pinned.current &&
        !triggerHovered.current &&
        !popupHovered.current &&
        !triggerFocused.current
      ) {
        setOpen(false);
      }
    }, 180);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    const popup = popupRef.current;
    const root = rootRef.current;
    if (!button || !popup || !root) return;
    const doc = button.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;

    // A manual popover enters the top layer without a portal: it remains a
    // descendant of any native dialog, preserving modal focus/inert behavior.
    const nativePopover = typeof popup.showPopover === 'function';
    if (nativePopover) popup.showPopover();

    let frame: number | undefined;
    const position = () => {
      frame = undefined;
      const viewport = view.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? doc.documentElement.clientWidth;
      const height = viewport?.height ?? doc.documentElement.clientHeight;
      const margin = 12;
      const gap = 8;
      popup.style.maxWidth = `${Math.max(0, width - margin * 2)}px`;
      popup.style.maxHeight = `${Math.max(0, height - margin * 2)}px`;
      const anchor = button.getBoundingClientRect();
      const box = popup.getBoundingClientRect();
      const below = top + height - anchor.bottom;
      const above = anchor.top - top;
      const preferredTop =
        below >= box.height + gap || below >= above
          ? anchor.bottom + gap
          : anchor.top - box.height - gap;
      const clamp = (value: number, minimum: number, maximum: number) =>
        Math.max(minimum, Math.min(value, Math.max(minimum, maximum)));
      popup.style.left = `${clamp(
        anchor.left + (anchor.width - box.width) / 2,
        left + margin,
        left + width - box.width - margin,
      )}px`;
      popup.style.top = `${clamp(
        preferredTop,
        top + margin,
        top + height - box.height - margin,
      )}px`;
    };
    const schedulePosition = () => {
      if (frame === undefined) frame = view.requestAnimationFrame(position);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!event.composedPath().includes(root)) dismiss();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!event.composedPath().includes(root)) dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      // Escape dismisses this explanation before a containing dialog.
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
    const onToggle = () => {
      if (nativePopover && !popup.matches(':popover-open')) dismiss();
    };

    position();
    // Listeners/observers exist only while this hint is open; no polling loop.
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('focusin', onFocusIn, true);
    doc.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('scroll', schedulePosition, {
      capture: true,
      passive: true,
    });
    view.addEventListener('resize', schedulePosition, { passive: true });
    view.visualViewport?.addEventListener('resize', schedulePosition, {
      passive: true,
    });
    view.visualViewport?.addEventListener('scroll', schedulePosition, {
      passive: true,
    });
    popup.addEventListener('toggle', onToggle);
    const observer = new ResizeObserver(schedulePosition);
    observer.observe(button);
    observer.observe(popup);

    return () => {
      if (frame !== undefined) view.cancelAnimationFrame(frame);
      observer.disconnect();
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('focusin', onFocusIn, true);
      doc.removeEventListener('keydown', onKeyDown, true);
      doc.removeEventListener('scroll', schedulePosition, true);
      view.removeEventListener('resize', schedulePosition);
      view.visualViewport?.removeEventListener('resize', schedulePosition);
      view.visualViewport?.removeEventListener('scroll', schedulePosition);
      popup.removeEventListener('toggle', onToggle);
      if (nativePopover && popup.matches(':popover-open')) popup.hidePopover();
    };
  }, [open, dismiss]);

  return (
    <span className="help-hint" ref={rootRef}>
      <button
        ref={buttonRef}
        className="help-hint__trigger"
        type="button"
        aria-label={`Hilfe: ${label}`}
        aria-describedby={open ? id : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === 'touch') return;
          triggerHovered.current = true;
          show();
        }}
        onPointerLeave={() => {
          triggerHovered.current = false;
          closeWhenIdle();
        }}
        onFocus={() => {
          triggerFocused.current = true;
          show();
        }}
        onBlur={() => {
          triggerFocused.current = false;
          closeWhenIdle();
        }}
        onClick={(event) => {
          event.stopPropagation();
          // Focus often precedes a touch click. Toggle pinning, not visibility.
          if (pinned.current) dismiss();
          else {
            pinned.current = true;
            show();
          }
        }}
      >
        <Info size={15} aria-hidden="true" focusable="false" />
      </button>
      <span
        ref={popupRef}
        id={id}
        className="help-hint__popup"
        role="tooltip"
        popover="manual"
        hidden={!open}
        onPointerEnter={(event) => {
          if (event.pointerType === 'touch') return;
          popupHovered.current = true;
          cancelClose();
        }}
        onPointerLeave={() => {
          popupHovered.current = false;
          closeWhenIdle();
        }}
      >
        {children}
      </span>
    </span>
  );
}
