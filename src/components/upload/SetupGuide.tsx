"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Copy,
  Cpu,
  Info,
  KeyRound,
  Laptop,
  LifeBuoy,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SetupState = {
  /** Which provider the server resolved for this run. */
  providerId: "gemini" | "anthropic" | "local";
  /** Model name in use. Never the key itself. */
  model: string;
  /** Set when handwriting will be read by local OCR, and why. */
  localMode: "chosen" | "no-key" | null;
};

/* -------------------------------------------------------------------------- */
/*                                   Pieces                                   */
/* -------------------------------------------------------------------------- */

/**
 * A copyable line.
 *
 * Every command here is one a teacher is expected to run without knowing the
 * stack, and a mistyped env var fails in a way that looks like a broken app
 * rather than a typo — so none of them should have to be transcribed by hand.
 */
function Snippet({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused; the text is on screen either way.
    }
  }, [children]);

  return (
    <span className="group relative mt-1.5 flex items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2">
      <code className="scrollbar-slim min-w-0 flex-1 overflow-x-auto font-mono text-[11.5px] leading-relaxed whitespace-pre text-ink">
        {children}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy to clipboard"}
        className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {copied ? (
          <CheckCircle2 className="size-3.5 text-success" strokeWidth={2.4} />
        ) : (
          <Copy className="size-3.5" strokeWidth={2} />
        )}
      </button>
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  step,
  children,
}: {
  icon: typeof KeyRound;
  title: string;
  step?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line px-5 py-4 first:border-t-0">
      <h3 className="flex items-center gap-2 text-[13px] font-bold text-ink">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft">
          <Icon className="size-3.5 text-brand" strokeWidth={2.2} />
        </span>
        {title}
        {step ? (
          <span className="ml-auto shrink-0 text-[10px] font-semibold tracking-wide text-muted uppercase">
            {step}
          </span>
        ) : null}
      </h3>
      <div className="mt-2 space-y-2 text-[12px] leading-relaxed text-ink-soft">
        {children}
      </div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-panel px-1 py-0.5 font-mono text-[11px] text-ink">
      {children}
    </code>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Status                                   */
/* -------------------------------------------------------------------------- */

function StatusBanner({ setup }: { setup: SetupState }) {
  if (!setup.localMode) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-[12px] leading-relaxed text-success-ink">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} />
        <span>
          <strong className="font-semibold">A key is configured.</strong>{" "}
          Handwriting, mapping, marks and feedback all run on{" "}
          <Code>{setup.model}</Code>. Nothing below needs doing — it is here for
          when you move to another machine or redeploy.
        </span>
      </p>
    );
  }

  return (
    <p className="flex items-start gap-2 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-[12px] leading-relaxed text-warn">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} />
      <span>
        {setup.localMode === "chosen" ? (
          <>
            <strong className="font-semibold">Running on local OCR</strong>{" "}
            because <Code>AI_PROVIDER</Code> is set to <Code>local</Code>. That
            is a deliberate setting, not a fault — but handwriting will read
            poorly and no marks are awarded.
          </>
        ) : (
          <>
            <strong className="font-semibold">No API key is configured</strong>,
            so this falls back to local Tesseract OCR. Question papers still
            extract, but handwriting reads poorly and no marks are awarded.
          </>
        )}
      </span>
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Panel                                   */
/* -------------------------------------------------------------------------- */

function Panel({ setup, onClose }: { setup: SetupState; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll away under the dialog.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="animate-veda-swap-in flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-xl sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft">
            <KeyRound className="size-4.5 text-brand" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-bold text-ink">
              API key &amp; setup
            </h2>
            <p className="mt-0.5 text-[12px] text-muted">
              What the key does, how to run this on your own machine, and what
              to check when a run stalls.
            </p>
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-panel hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X className="size-4" strokeWidth={2.2} />
          </button>
        </header>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
          <div className="px-5 pt-4">
            <StatusBanner setup={setup} />
          </div>

          <Section icon={Info} title="What the key is actually for">
            <p>
              Question extraction, answer mapping and the green highlighting are
              computer vision running on the server. They work with no key at
              all.
            </p>
            <p>
              The key buys three things: accurate{" "}
              <strong className="font-semibold text-ink">handwriting</strong>{" "}
              reading, the{" "}
              <strong className="font-semibold text-ink">marks and
              feedback</strong>{" "}
              on the evaluation report, and the{" "}
              <strong className="font-semibold text-ink">
                expected answers
              </strong>{" "}
              written for questions a student left blank. Without one the app
              still runs, says so plainly, and skips those.
            </p>
          </Section>

          <Section icon={KeyRound} title="Get a Gemini key" step="Step 1">
            <p>
              Open{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand underline underline-offset-2"
              >
                aistudio.google.com/apikey
              </a>{" "}
              and choose <em>Create API key</em>. The free tier is enough to
              mark a class; it is metered per minute and per day.
            </p>
            <p className="text-muted">
              A key is a password. Keep it out of the repository — the files
              below are all git-ignored.
            </p>
          </Section>

          <Section icon={Laptop} title="Run it on your own computer" step="Step 2">
            <p>From the project folder:</p>
            <Snippet>{`npm install`}</Snippet>
            <p className="pt-1">
              Create a file called <Code>.env.local</Code> next to{" "}
              <Code>package.json</Code> with these three lines, pasting your own
              key:
            </p>
            <Snippet>{`AI_PROVIDER=gemini
AI_API_KEY=paste-your-key-here
AI_MODEL=gemini-3.5-flash-lite`}</Snippet>
            <p className="pt-1">Then start it:</p>
            <Snippet>{`npm run dev`}</Snippet>
            <p className="pt-1">
              Open <Code>http://localhost:3000</Code>. If you copy{" "}
              <Code>.env.example</Code> to <Code>.env.local</Code> instead, fill
              in <Code>AI_API_KEY</Code> — an empty value counts as no key.
            </p>
          </Section>

          <Section
            icon={Cpu}
            title="Use a non-reasoning model"
            step="Important"
          >
            <p>
              This is the one setting that will waste your afternoon. On a
              reasoning model the thinking tokens come out of the{" "}
              <em>same budget</em> as the reply, so a page can finish with the
              budget spent and{" "}
              <strong className="font-semibold text-ink">
                no text returned at all
              </strong>
              , and each call takes tens of seconds.
            </p>
            <p>
              Measured over four answer-sheet pages here:{" "}
              <Code>gemini-flash-latest</Code> took 194.6s and returned nothing
              on two of them; <Code>gemini-3.5-flash-lite</Code> read all four in
              12.5s with identical text.
            </p>
            <p>
              Avoid the <Code>-latest</Code> aliases — they drift onto reasoning
              models without warning. Pin the model instead.
            </p>
          </Section>

          <Section icon={Cloud} title="Deploying it (Vercel)" step="Step 3">
            <p>
              A <Code>.env.local</Code> file is never uploaded, so the hosted app
              needs the same values set as environment variables:{" "}
              <em>Project → Settings → Environment Variables</em>, scoped to
              Production.
            </p>
            <Snippet>{`AI_PROVIDER=gemini
AI_API_KEY=paste-your-key-here
AI_MODEL=gemini-3.5-flash-lite`}</Snippet>
            <p className="pt-1">
              Environment variables are read at build time, so{" "}
              <strong className="font-semibold text-ink">redeploy after
              changing one</strong> — editing a value alone changes nothing on
              the live site.
            </p>
          </Section>

          <Section icon={LifeBuoy} title="When something goes wrong">
            <dl className="space-y-2.5">
              <div>
                <dt className="font-semibold text-ink">
                  It stalls on “Reading answer sheets”, then the connection
                  closes
                </dt>
                <dd>
                  Almost always a reasoning model returning empty pages, which
                  are then retried until the request runs out of time. Set{" "}
                  <Code>AI_MODEL</Code> as above and redeploy.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">
                  Everything works but feels slow
                </dt>
                <dd>
                  Free-tier keys are throttled by latency rather than refused, so
                  a long session gets progressively slower. It still completes;
                  a fresh day or a billed key is fast again.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">
                  “The AI provider rejected the configured key”
                </dt>
                <dd>
                  The key is wrong, truncated, or still the placeholder from{" "}
                  <Code>.env.example</Code>. Paste it again with no quotes and no
                  trailing spaces.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">
                  Marks are missing but the answers are all there
                </dt>
                <dd>
                  Grading ran out of quota. Extraction, mapping and highlighting
                  are unaffected — the report says which step was skipped and
                  why, rather than showing a zero.
                </dd>
              </div>
            </dl>
          </Section>
        </div>

        <footer className="shrink-0 border-t border-line bg-panel px-5 py-3">
          <p className="text-[11px] leading-relaxed text-muted">
            Currently using{" "}
            <Code>
              {setup.providerId}
              {setup.localMode ? "" : ` · ${setup.model}`}
            </Code>
            . Keys are read on the server only and are never sent to the browser.
          </p>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Trigger                                  */
/* -------------------------------------------------------------------------- */

/**
 * Help sits beside the button that starts a run, because that is the moment a
 * teacher discovers something is wrong with the setup — not in a README they
 * would have had to know to open. The trigger states its own urgency: a warning
 * when the run is about to go ahead without a key, quiet otherwise.
 */
export function SetupGuide({ setup }: { setup: SetupState }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const needsAttention = setup.localMode !== null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          needsAttention
            ? "border-warn/30 bg-warn-soft text-warn hover:bg-warn/15"
            : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
        )}
      >
        {needsAttention ? (
          <AlertTriangle className="size-3.5" strokeWidth={2.2} />
        ) : (
          <KeyRound className="size-3.5" strokeWidth={2.2} />
        )}
        {needsAttention ? "No API key — read this first" : "API key & setup help"}
      </button>

      {open ? <Panel setup={setup} onClose={close} /> : null}
    </>
  );
}
