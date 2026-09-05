import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Rect = { x: number; y: number; width: number; height: number };
type Placement = { x: number; y: number; side: 'left' | 'right' | 'above' | 'below' | 'floating' };

/** Presentation only. All actions remain in the real form and tour controller. */
export function TourSpotlight({
  target,
  title,
  children,
  controls,
  progress,
  paused = false,
  onDismiss,
  returnFocus,
}: {
  target: string;
  title: string;
  children?: ReactNode;
  controls: ReactNode;
  progress: { current: number; total: number };
  paused?: boolean;
  onDismiss(): void;
  returnFocus?: string;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const description = useId();
  const titleId = useId();
  const mask = useId().replaceAll(':', '');
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const focusTarget = useRef(target);
  focusTarget.current = returnFocus ?? target;
  const activeTarget = useRef(target);
  activeTarget.current = target;
  const restoreRequested = useRef(false);
  const pausedState = useRef(paused);
  pausedState.current = paused;
  const [hole, setHole] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<Placement>({ x: 12, y: 12, side: 'floating' });

  useLayoutEffect(() => {
    // Being a descendant of the modal is essential: an outside popover would be inert.
    // The parent's showModal runs after child layout effects. Enter the top layer
    // on the next frame so the dialog's backdrop cannot cover these controls.
    const openingFrame = requestAnimationFrame(() => {
      layer.current?.showPopover();
      card.current?.focus({ preventScroll: true });
    });
    const modal = layer.current?.closest('dialog');
    modal?.classList.add('tour-active');
    document.body.classList.add('tour-active-page');
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const anchor = document.querySelector<HTMLElement>(activeTarget.current);
        const focusable =
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';
        const targets = pausedState.current
          ? [
              ...(
                modal ??
                document.querySelector('.app-shell') ??
                document.body
              ).querySelectorAll<HTMLElement>(focusable),
            ].filter((node) => !card.current?.contains(node))
          : anchor
            ? [
                ...(anchor.matches(focusable) ? [anchor] : []),
                ...anchor.querySelectorAll<HTMLElement>(focusable),
              ]
            : [];
        const recovery = [
          ...(modal?.querySelectorAll<HTMLElement>(
            '.form-error button:not(:disabled), .dialog-header button:not(:disabled)',
          ) ?? []),
        ];
        const hints = [
          ...(anchor
            ?.closest('.panel, .dialog-body, .period-filter')
            ?.querySelectorAll<HTMLElement>('.help-hint__trigger') ?? []),
        ];
        const controls = [...(card.current?.querySelectorAll<HTMLElement>(focusable) ?? [])];
        const candidates = [...new Set([...targets, ...hints, ...recovery, ...controls])].filter(
          (node) => node.getClientRects().length > 0,
        );
        if (candidates.length) {
          const index = candidates.indexOf(document.activeElement as HTMLElement);
          const next =
            candidates[
              index < 0
                ? event.shiftKey
                  ? candidates.length - 1
                  : 0
                : (index + (event.shiftKey ? -1 : 1) + candidates.length) % candidates.length
            ];
          event.preventDefault();
          next.focus({ preventScroll: true });
        }
      }
      if (event.key === 'Escape' && !document.querySelector('.help-hint__popup:not([hidden])')) {
        event.preventDefault();
        event.stopPropagation();
        restoreRequested.current = true;
        dismiss.current();
      }
    };
    window.addEventListener('keydown', escape, true);
    return () => {
      cancelAnimationFrame(openingFrame);
      window.removeEventListener('keydown', escape, true);
      modal?.classList.remove('tour-active');
      document.body.classList.remove('tour-active-page');
      if (
        restoreRequested.current ||
        layer.current?.contains(document.activeElement) ||
        document.activeElement === document.body
      ) {
        requestAnimationFrame(() => {
          if (document.querySelector('.tour-layer')) return;
          const node = document.querySelector<HTMLElement>(focusTarget.current);
          const focusable =
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]';
          const next =
            (node?.matches(focusable) ? node : node?.querySelector<HTMLElement>(focusable)) ??
            modal?.querySelector<HTMLElement>(
              '[data-tour="close-summary"], .dialog-header button:not(:disabled)',
            );
          next?.focus();
        });
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (card.current?.contains(document.activeElement) || document.activeElement === document.body)
      card.current?.focus({ preventScroll: true });
    let frame = 0;
    let scrolled: Element | null = null;
    let focusedTarget: HTMLElement | null = null;
    let described: HTMLElement | null = null;
    let previousDescription: string | null = null;
    const restoreDescription = () => {
      if (!described) return;
      if (previousDescription === null) described.removeAttribute('aria-describedby');
      else described.setAttribute('aria-describedby', previousDescription);
      described = null;
    };
    const measure = () => {
      frame = 0;
      const focused = document.activeElement as HTMLElement | null;
      const modal = layer.current?.closest('dialog');
      if (
        paused &&
        focused &&
        modal?.contains(focused) &&
        !card.current?.contains(focused) &&
        focused.matches('button, input, select')
      )
        focusedTarget = focused;
      const element =
        (paused && focusedTarget?.isConnected ? focusedTarget : null) ??
        document.querySelector<HTMLElement>(target);
      const panel = card.current;
      if (!panel) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const margin = 12;
      const panelWidth = Math.min(338, width - margin * 2);
      panel.style.width = `${panelWidth}px`;
      const panelHeight = panel.getBoundingClientRect().height;
      if (element && scrolled !== element) {
        scrolled = element;
        const bounds = element.getBoundingClientRect();
        if (width < 900 || bounds.top < 12 || bounds.bottom > height - 12) {
          element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        }
      }
      if (described !== element) {
        restoreDescription();
        if (element && !element.matches('.help-hint__trigger')) {
          described = element;
          previousDescription = element.getAttribute('aria-describedby');
          element.setAttribute(
            'aria-describedby',
            [previousDescription, description].filter(Boolean).join(' '),
          );
        }
      }
      const bounds = element?.getBoundingClientRect();
      const visible =
        bounds && bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < height;
      const rect = visible
        ? {
            x: Math.max(4, bounds.left - 6),
            y: Math.max(4, bounds.top - 6),
            width: Math.min(width - 4, bounds.right + 6) - Math.max(4, bounds.left - 6),
            height: Math.min(height - 4, bounds.bottom + 6) - Math.max(4, bounds.top - 6),
          }
        : null;
      // On short screens center-scrolling only the field leaves too little room
      // for its explanation. Allocate a vertical stack before placing the card.
      if (
        rect &&
        width < 900 &&
        rect.y + rect.height + 18 + panelHeight > height - margin &&
        rect.y - panelHeight - 18 < margin &&
        rect.height + panelHeight + 18 + margin * 2 <= height
      ) {
        const scrollHost = modal ?? document.scrollingElement;
        if (scrollHost) {
          const before = scrollHost.scrollTop;
          scrollHost.scrollBy({ top: rect.y - margin, behavior: 'instant' });
          if (Math.abs(scrollHost.scrollTop - before) > 1) {
            frame = requestAnimationFrame(measure);
            return;
          }
        }
      }
      setHole((old) => (JSON.stringify(old) === JSON.stringify(rect) ? old : rect));
      const clampX = (x: number) => Math.max(margin, Math.min(x, width - panelWidth - margin));
      const clampY = (y: number) => Math.max(margin, Math.min(y, height - panelHeight - margin));
      let next: Placement = {
        x: clampX((width - panelWidth) / 2),
        y: height - panelHeight - margin,
        side: 'floating',
      };
      if (rect) {
        const right = rect.x + rect.width + 18;
        const below = rect.y + rect.height + 18;
        if (width >= 900 && right + panelWidth <= width - margin) {
          next = { x: right, y: clampY(rect.y + rect.height / 2 - panelHeight / 2), side: 'right' };
        } else if (width >= 900 && rect.x - panelWidth - 18 >= margin) {
          next = {
            x: rect.x - panelWidth - 18,
            y: clampY(rect.y + rect.height / 2 - panelHeight / 2),
            side: 'left',
          };
        } else if (below + panelHeight <= height - margin) {
          next = { x: clampX(rect.x + rect.width / 2 - panelWidth / 2), y: below, side: 'below' };
        } else if (rect.y - panelHeight - 18 >= margin) {
          next = {
            x: clampX(rect.x + rect.width / 2 - panelWidth / 2),
            y: rect.y - panelHeight - 18,
            side: 'above',
          };
        }
      }
      setPlacement((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    if (card.current) observer.observe(card.current);
    const targetElement = document.querySelector(target);
    if (targetElement) observer.observe(targetElement);
    // A pending save can replace the target without changing the controller step.
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.querySelector('.app-shell') ?? document.body, {
      childList: true,
      subtree: true,
    });
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    document.addEventListener('focusin', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('focusin', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      restoreDescription();
    };
  }, [target, description, paused]);

  return (
    <div ref={layer} popover="manual" className="tour-layer" data-testid="tour-layer">
      <svg className="tour-shade" width="100%" height="100%" aria-hidden="true">
        <defs>
          <mask id={mask}>
            <rect width="100%" height="100%" fill="white" />
            {hole && (
              <rect
                x={hole.x}
                y={hole.y}
                width={hole.width}
                height={hole.height}
                rx="9"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="#0d1d36" fillOpacity="0.68" mask={`url(#${mask})`} />
        {hole && (
          <rect
            data-testid="tour-cutout"
            x={hole.x}
            y={hole.y}
            width={hole.width}
            height={hole.height}
            rx="9"
            fill="none"
            stroke="#a8c6ff"
            strokeWidth="2"
          />
        )}
      </svg>
      <section
        ref={card}
        className={`tour-card ${paused ? 'is-paused' : ''}`}
        style={{ left: placement.x, top: placement.y }}
        data-placement={placement.side}
        data-testid="tour-card"
        data-demo-controls
        role="region"
        tabIndex={-1}
        aria-labelledby={titleId}
      >
        <div className="tour-card-heading">
          <span className="tour-step-label">
            {paused ? 'PAUSIERT' : 'GEFÜHRTE DEMO'} · {progress.current}/{progress.total}
          </span>
          <div
            className="tour-progress"
            role="progressbar"
            aria-label="Tourfortschritt"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.current}
          >
            <span style={{ width: `${(100 * progress.current) / progress.total}%` }} />
          </div>
        </div>
        <div className="tour-card-content" id={description} aria-live="polite" aria-atomic="true">
          <h2 id={titleId}>{title}</h2>
          {children}
        </div>
        <div className="tour-card-controls">{controls}</div>
      </section>
    </div>
  );
}
