import { isNonEmptyString } from '@sniptt/guards';

import {
  RecordFilterGroupLogicalOperator,
  type ViewFilterOperand,
} from '@/types';
import { isDefined } from '@/utils';

import { isRecordFilterValueValid } from './isRecordFilterValueValid';
import { type RecordFilterGroup } from './turnRecordFilterGroupIntoGqlOperationFilter';

type RecordFilterMatchabilityInput = {
  operand: ViewFilterOperand;
  value: string | null | undefined;
  recordFilterGroupId?: string | null;
};

const getRecordFilterGroupIdsInTree = ({
  recordFilterGroupId,
  recordFilterGroups,
}: {
  recordFilterGroupId: string;
  recordFilterGroups: RecordFilterGroup[];
}): Set<string> => {
  const childrenIds = recordFilterGroups
    .filter(
      ({ parentRecordFilterGroupId }) =>
        parentRecordFilterGroupId === recordFilterGroupId,
    )
    .flatMap(({ id }) => [
      ...getRecordFilterGroupIdsInTree({
        recordFilterGroupId: id,
        recordFilterGroups,
      }),
    ]);

  return new Set([recordFilterGroupId, ...childrenIds]);
};

const canRecordFilterGroupMatchAnyRecord = ({
  recordFilterGroupId,
  recordFilters,
  recordFilterGroups,
}: {
  recordFilterGroupId: string;
  recordFilters: RecordFilterMatchabilityInput[];
  recordFilterGroups: RecordFilterGroup[];
}): boolean => {
  const recordFilterGroup = recordFilterGroups.find(
    ({ id }) => id === recordFilterGroupId,
  );

  if (!isDefined(recordFilterGroup)) {
    return true;
  }

  const childrenCanMatch = [
    ...recordFilters
      .filter(
        ({ recordFilterGroupId: groupId }) => groupId === recordFilterGroupId,
      )
      .map(isRecordFilterValueValid),
    ...recordFilterGroups
      .filter(
        ({ parentRecordFilterGroupId }) =>
          parentRecordFilterGroupId === recordFilterGroupId,
      )
      .map(({ id }) =>
        canRecordFilterGroupMatchAnyRecord({
          recordFilterGroupId: id,
          recordFilters,
          recordFilterGroups,
        }),
      ),
  ];

  if (childrenCanMatch.length === 0) {
    return true;
  }

  return recordFilterGroup.logicalOperator ===
    RecordFilterGroupLogicalOperator.AND
    ? childrenCanMatch.every((canMatch) => canMatch)
    : childrenCanMatch.some((canMatch) => canMatch);
};

export const canRecordFiltersMatchAnyRecord = ({
  recordFilters,
  recordFilterGroups,
}: {
  recordFilters: RecordFilterMatchabilityInput[];
  recordFilterGroups: RecordFilterGroup[];
}): boolean => {
  const outermostRecordFilterGroupId = recordFilterGroups.find(
    ({ parentRecordFilterGroupId }) =>
      !isNonEmptyString(parentRecordFilterGroupId),
  )?.id;

  const recordFilterGroupIdsInTree = isDefined(outermostRecordFilterGroupId)
    ? getRecordFilterGroupIdsInTree({
        recordFilterGroupId: outermostRecordFilterGroupId,
        recordFilterGroups,
      })
    : new Set<string>();

  const canRecordFiltersOutsideTreeMatch = recordFilters
    .filter(
      ({ recordFilterGroupId }) =>
        !isNonEmptyString(recordFilterGroupId) ||
        !recordFilterGroupIdsInTree.has(recordFilterGroupId),
    )
    .every(isRecordFilterValueValid);

  if (!canRecordFiltersOutsideTreeMatch) {
    return false;
  }

  if (!isDefined(outermostRecordFilterGroupId)) {
    return true;
  }

  return canRecordFilterGroupMatchAnyRecord({
    recordFilterGroupId: outermostRecordFilterGroupId,
    recordFilters,
    recordFilterGroups,
  });
};
