/**
 * Motor de scoring: agrega flags con severidad en un score 0-100 y una
 * recomendación accionable que otro agente puede consumir directo.
 */

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type Flag = {
  id: string;
  severity: Severity;
  message: string;
};

export type Recommendation = "SAFE" | "CAUTION" | "AVOID";
export type Action = "proceed" | "proceed_with_limits" | "do_not_proceed";

const PENALTY: Record<Severity, number> = {
  info: 0,
  low: 5,
  medium: 15,
  high: 30,
  critical: 60,
};

export type ScoreResult = {
  score: number;
  recommendation: Recommendation;
  action: Action;
  reason: string;
};

/** Convierte una lista de flags en score + recomendación + razón legible por máquina y humano. */
export function score(flags: Flag[], subject: string): ScoreResult {
  let s = 100;
  for (const f of flags) s -= PENALTY[f.severity];
  s = Math.max(0, Math.min(100, s));

  const hasCritical = flags.some((f) => f.severity === "critical");
  const hasHigh = flags.some((f) => f.severity === "high");

  let recommendation: Recommendation;
  let action: Action;
  if (hasCritical || s < 50) {
    recommendation = "AVOID";
    action = "do_not_proceed";
  } else if (hasHigh || s < 80) {
    recommendation = "CAUTION";
    action = "proceed_with_limits";
  } else {
    recommendation = "SAFE";
    action = "proceed";
  }

  const top = [...flags].sort((a, b) => PENALTY[b.severity] - PENALTY[a.severity])[0];
  const reason =
    recommendation === "SAFE"
      ? `${subject} no presenta señales de riesgo relevantes.`
      : top
        ? `${top.message}`
        : `${subject} presenta riesgo agregado (score ${s}).`;

  return { score: s, recommendation, action, reason };
}
