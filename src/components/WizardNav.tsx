
"use client";
import { useEffect, useState } from "react";

type StepKey = "kunde" | "mitarbeiter" | "geraete" | "material" | "zusammenfassung";

const steps: { key: StepKey; label: string; href: string }[] = [
  { key: "kunde", label: "1. Kunde", href: "/lieferschein/kunde" },
  { key: "mitarbeiter", label: "2. Mitarbeiter", href: "/lieferschein/mitarbeiter" },
  { key: "geraete", label: "3. Geräte", href: "/lieferschein/geraete" },
  { key: "material", label: "4. Material", href: "/lieferschein/material" },
  { key: "zusammenfassung", label: "5. Zusammenfassung", href: "/lieferschein/zusammenfassung" },
];

export function WizardSteps({ currentKey }: { currentKey: StepKey }) {
  const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);
if (!mounted) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {steps.map((s) => (
          <span
            key={s.key}
            className="px-3 py-2 rounded border text-sm bg-white text-gray-400"
          >
            {s.label}
          </span>
        ))}
      </div>

      <span className="px-3 py-2 rounded border text-sm bg-white text-gray-400">
        Zur Übersicht
      </span>
    </div>
  );
}



const hasDraft = typeof window !== "undefined" && !!localStorage.getItem("deliveryNoteId");

  const go = (href: string, key: StepKey) => {
    // Zusammenfassung nur wenn Draft existiert
    if (key === "zusammenfassung" && !hasDraft) return;

    window.location.href = href;
  };

return (
  <div className="mt-4 flex items-center justify-between gap-3">
    <div className="flex flex-wrap gap-2">
      {steps.map((s) => {
        const isActive = s.key === currentKey;
        const isDisabled = s.key === "zusammenfassung" && !hasDraft;

        return (
          <button
            key={s.key}
            type="button"
            onClick={() => go(s.href, s.key)}
            disabled={isDisabled}
            className={[
              "px-3 py-2 rounded border text-sm",
              isActive ? "bg-black text-white border-black" : "bg-white",
              isDisabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50",
            ].join(" ")}
          >
            {s.label}
          </button>
        );
      })}
    </div>

    <button
      type="button"
      onClick={() => (window.location.href = "/")}
      className="px-3 py-2 rounded border text-sm bg-white hover:bg-gray-50"
    >
      Zur Übersicht
    </button>
  </div>
);

}


export function WizardButtons({
  canGoNext = true,
  onNext,
  onBack,
  nextLabel = "Weiter",
  backLabel = "Zurück",
}: {
  canGoNext?: boolean;
  onNext: () => void;
  onBack: () => void;
  nextLabel?: string;
  backLabel?: string;
}) {
  return (
    <div className="mt-8 flex gap-2">
      <button
        onClick={onBack}
        className="px-4 py-3 rounded border border-gray-300"
      >
        {backLabel}
      </button>
      <button
        onClick={onNext}
        disabled={!canGoNext}
        className={[
          "px-6 py-3 rounded text-white",
          canGoNext ? "bg-black" : "bg-gray-400",
        ].join(" ")}
      >
        {nextLabel}
      </button>
    </div>
  );
}


export const wizardSteps = steps;
