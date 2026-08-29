import { createHash } from 'node:crypto';

type PageLayoutWidgetStateFingerprintInput = {
  id: string;
  universalIdentifier: string;
  workspaceId: string;
  applicationId: string;
  pageLayoutTabId: string;
  title: string;
  type: string;
  objectMetadataId?: string | null;
  conditionalDisplay?: unknown;
  conditionalAvailabilityExpression?: string | null;
  gridPosition: unknown;
  position?: unknown;
  configuration: unknown;
  isSystemSideEffect: boolean;
  overrides?: unknown;
  deletedAt?: Date | string | null;
  updatedAt: Date | string;
};

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
    );
  }

  return value;
};

const normalizeTimestamp = (value: Date | string | null | undefined) =>
  value === null || value === undefined ? null : new Date(value).toISOString();

export const computePageLayoutWidgetStateFingerprint = (
  widget: PageLayoutWidgetStateFingerprintInput,
): string => {
  const state = {
    applicationId: widget.applicationId,
    conditionalAvailabilityExpression:
      widget.conditionalAvailabilityExpression ?? null,
    conditionalDisplay: widget.conditionalDisplay ?? null,
    configuration: widget.configuration,
    deletedAt: normalizeTimestamp(widget.deletedAt),
    gridPosition: widget.gridPosition,
    id: widget.id,
    isSystemSideEffect: widget.isSystemSideEffect,
    objectMetadataId: widget.objectMetadataId ?? null,
    overrides: widget.overrides ?? null,
    pageLayoutTabId: widget.pageLayoutTabId,
    position: widget.position ?? null,
    title: widget.title,
    type: widget.type,
    universalIdentifier: widget.universalIdentifier,
    updatedAt: normalizeTimestamp(widget.updatedAt),
    workspaceId: widget.workspaceId,
  };

  return createHash('sha256')
    .update(JSON.stringify(canonicalize(state)))
    .digest('hex');
};
