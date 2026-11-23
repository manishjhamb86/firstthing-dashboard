import type { Prisma } from "@prisma/client";
import { circuitLabelOf } from "./circuit-label";

/**
 * One name per deal and circuit (2026-11-23, user-asked: "the name should be
 * same everywhere"; the user's call: the deal's name wins). A deal with a
 * single circuit shows the same name on the deal, the survey, the circuit,
 * reports and the portal.
 */

/** A new circuit's name: the deal's name when it is the deal's first circuit, else its own label. */
export async function initialCircuitName(
  tx: Prisma.TransactionClient,
  siteSurveyId: string,
  location: string | null | undefined,
  lightType: string,
): Promise<string> {
  const survey = await tx.siteSurvey.findUnique({
    where: { id: siteSurveyId },
    select: { pipeline: { select: { dealScope: true } }, _count: { select: { circuits: { where: { voidedAt: null } } } } },
  });
  const scope = survey?.pipeline.dealScope?.trim();
  if (scope && survey && survey._count.circuits === 0) return scope;
  return circuitLabelOf(location?.trim() || null, lightType);
}

/**
 * After a circuit is added: a deal with no name of its own takes its only
 * circuit's name, so the deal header stops saying just "Lighting".
 */
export async function nameDealAfterFirstCircuit(tx: Prisma.TransactionClient, siteSurveyId: string): Promise<void> {
  const survey = await tx.siteSurvey.findUnique({
    where: { id: siteSurveyId },
    select: { pipeline: { select: { id: true, societyId: true, serviceLine: true, dealScope: true } }, circuits: { where: { voidedAt: null }, select: { name: true } } },
  });
  if (!survey || survey.circuits.length !== 1 || survey.pipeline.dealScope?.trim()) return;
  const name = survey.circuits[0]!.name.trim();
  const p = survey.pipeline;
  const clash = await tx.pipeline.findFirst({ where: { societyId: p.societyId, serviceLine: p.serviceLine, id: { not: p.id }, dealScope: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (!clash) await tx.pipeline.update({ where: { id: p.id }, data: { dealScope: name } });
}

/**
 * Rename a deal and, when it has exactly one live circuit, that circuit too —
 * the two are one name. Refuses a name another deal of the same line at the
 * society already uses. Returns an error sentence or null.
 */
export async function renameDealAndCircuit(tx: Prisma.TransactionClient, pipelineId: string, rawName: string): Promise<string | null> {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (!name) return "Enter a name.";
  if (name.length > 80) return "Keep the name under 80 characters.";
  const deal = await tx.pipeline.findUnique({
    where: { id: pipelineId },
    select: { id: true, societyId: true, serviceLine: true, siteSurvey: { select: { circuits: { where: { voidedAt: null }, select: { id: true } } } } },
  });
  if (!deal) return "That deal is no longer on record.";
  const clash = await tx.pipeline.findFirst({ where: { societyId: deal.societyId, serviceLine: deal.serviceLine, id: { not: deal.id }, dealScope: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (clash) return `Another ${deal.serviceLine} deal at this society is already called "${name}".`;
  await tx.pipeline.update({ where: { id: deal.id }, data: { dealScope: name } });
  const circuits = deal.siteSurvey?.circuits ?? [];
  if (circuits.length === 1) await tx.circuit.update({ where: { id: circuits[0]!.id }, data: { name } });
  return null;
}
