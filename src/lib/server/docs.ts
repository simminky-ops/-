import "server-only";
import { ENTITIES, isEntityName } from "../entities";
import { canRead, type Module } from "../rbac";
import type { SessionUser } from "../types";

export function moduleOf(entityType: string | null): Module {
  return entityType && isEntityName(entityType) ? ENTITIES[entityType].module : "data";
}

export function canSeeDoc(u: SessionUser, d: { entity_type: string | null; confidential: number }) {
  return canRead(u.role, moduleOf(d.entity_type)) && (!d.confidential || canRead(u.role, "risks_confidential"));
}
