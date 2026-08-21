import { RecordFilterGroupLogicalOperator, ViewFilterOperand } from '@/types';

import { canRecordFiltersMatchAnyRecord } from '../canRecordFiltersMatchAnyRecord';

const recordFilter = ({
  value,
  operand = ViewFilterOperand.IS,
  recordFilterGroupId = null,
}: {
  value: string | null;
  operand?: ViewFilterOperand;
  recordFilterGroupId?: string | null;
}) => ({ operand, value, recordFilterGroupId });

const recordFilterGroup = ({
  id,
  logicalOperator,
  parentRecordFilterGroupId = null,
}: {
  id: string;
  logicalOperator: RecordFilterGroupLogicalOperator;
  parentRecordFilterGroupId?: string | null;
}) => ({ id, logicalOperator, parentRecordFilterGroupId });

describe('canRecordFiltersMatchAnyRecord', () => {
  it('returns true when there is no filter at all', () => {
    expect(
      canRecordFiltersMatchAnyRecord({
        recordFilters: [],
        recordFilterGroups: [],
      }),
    ).toBe(true);
  });

  it('returns true when an ungrouped filter has a value', () => {
    expect(
      canRecordFiltersMatchAnyRecord({
        recordFilters: [recordFilter({ value: 'company-id' })],
        recordFilterGroups: [],
      }),
    ).toBe(true);
  });

  it('returns false when an ungrouped filter value resolved to empty', () => {
    expect(
      canRecordFiltersMatchAnyRecord({
        recordFilters: [recordFilter({ value: null })],
        recordFilterGroups: [],
      }),
    ).toBe(false);
  });

  it('returns true when an empty value belongs to an operand not expecting one', () => {
    expect(
      canRecordFiltersMatchAnyRecord({
        recordFilters: [
          recordFilter({ value: null, operand: ViewFilterOperand.IS_EMPTY }),
        ],
        recordFilterGroups: [],
      }),
    ).toBe(true);
  });

  it('returns false when one filter of an AND group has no value', () => {
    expect(
      canRecordFiltersMatchAnyRecord({
        recordFilters: [
          recordFilter({ value: 'company-id', recordFilterGroupId: 'group-1' }),
          recordFilter({ value: null, recordFilterGroupId: 'group-1' }),
        ],
        recordFilterGroups: [
          recordFilterGroup({
            id: 'group-1',
            logicalOperator: RecordFilterGroupLogicalOperator.AND,
          }),
        ],
      }),
    ).toBe(false);
  });

  it('returns true when a sibling of an OR group still has a value', () => {
    expect(
      canRecordFiltersMatchAnyRecord({
        recordFilters: [
          recordFilter({ value: 'company-id', recordFilterGroupId: 'group-1' }),
          recordFilter({ value: null, recordFilterGroupId: 'group-1' }),
        ],
        recordFilterGroups: [
          recordFilterGroup({
            id: 'group-1',
            logicalOperator: RecordFilterGroupLogicalOperator.OR,
          }),
        ],
      }),
    ).toBe(true);
  });

  it('returns false when every filter of an OR group has no value', () => {
    expect(
      canRecordFiltersMatchAnyRecord({
        recordFilters: [
          recordFilter({ value: null, recordFilterGroupId: 'group-1' }),
          recordFilter({ value: '', recordFilterGroupId: 'group-1' }),
        ],
        recordFilterGroups: [
          recordFilterGroup({
            id: 'group-1',
            logicalOperator: RecordFilterGroupLogicalOperator.OR,
          }),
        ],
      }),
    ).toBe(false);
  });

  it('returns false when a nested OR subgroup can no longer match inside an AND group', () => {
    expect(
      canRecordFiltersMatchAnyRecord({
        recordFilters: [
          recordFilter({ value: 'company-id', recordFilterGroupId: 'group-1' }),
          recordFilter({ value: null, recordFilterGroupId: 'group-2' }),
        ],
        recordFilterGroups: [
          recordFilterGroup({
            id: 'group-1',
            logicalOperator: RecordFilterGroupLogicalOperator.AND,
          }),
          recordFilterGroup({
            id: 'group-2',
            logicalOperator: RecordFilterGroupLogicalOperator.OR,
            parentRecordFilterGroupId: 'group-1',
          }),
        ],
      }),
    ).toBe(false);
  });

  it('returns false when an empty value sits in a group missing from recordFilterGroups', () => {
    expect(
      canRecordFiltersMatchAnyRecord({
        recordFilters: [
          recordFilter({ value: 'company-id', recordFilterGroupId: 'group-1' }),
          recordFilter({ value: null, recordFilterGroupId: 'unknown-group' }),
        ],
        recordFilterGroups: [
          recordFilterGroup({
            id: 'group-1',
            logicalOperator: RecordFilterGroupLogicalOperator.AND,
          }),
        ],
      }),
    ).toBe(false);
  });
});
