"use client";

import { NUMBER_CLASS, TONE_CLASS, signOfText, type MoneyDisplay, type MoneyFlow } from "@/utils/touristVisaMoney";

/**
 * An amount of money written the way money in and out is written everywhere (utils/touristVisaMoney.ts): a leading + in green for a credit, a
 * leading − in red for a debit, plain for a balance or a zero. The sign and the amount are coloured together, the sign is always there (so
 * colour is never the only cue), and the digits line up in a column. Display only.
 */
export function MoneyText({ display, className = "" }: { display: MoneyDisplay; className?: string }) {
  return (
    <span className={`${NUMBER_CLASS} ${TONE_CLASS[display.tone]} ${className}`.trim()} data-tone={display.tone}>
      {display.sign}
      {display.unitPosition === "before" ? `${display.unit}${display.number}` : `${display.number} ${display.unit}`}
    </span>
  );
}

/** A value that is already written as text (the review's "200,000 PKR"), with its sign and colour from the way the money goes. */
export function FlowText({ text, flow }: { text: string; flow?: MoneyFlow | null }) {
  const { sign, tone } = signOfText(text, flow ?? null);
  if (tone === "neutral") return <span className={NUMBER_CLASS}>{text}</span>;
  return (
    <span className={`${NUMBER_CLASS} ${TONE_CLASS[tone]}`} data-tone={tone}>
      {sign}
      {text}
    </span>
  );
}
