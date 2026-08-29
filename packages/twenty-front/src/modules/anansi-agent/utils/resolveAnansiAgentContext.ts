import { isValidUuid } from 'twenty-shared/utils';

const ANANSI_APPROVAL_MARKER = /<!-- anansi-approval:[A-Za-z0-9]{1,32} -->/g;

const CUSTOM_CONTEXT_TYPES = {
  engagement: 'engagement',
  jobPosting: 'job',
  touchpoint: 'touchpoint',
  resume: 'resume',
  interview: 'calendar_event',
} as const;

type SupportedCustomObjectName = keyof typeof CUSTOM_CONTEXT_TYPES;

export type AnansiAgentContext = {
  key: string;
  contextType:
    | 'approval'
    | (typeof CUSTOM_CONTEXT_TYPES)[SupportedCustomObjectName];
  contextId: string;
  objectNameSingular: string;
  recordId: string;
  title: string;
};

type ResolveAnansiAgentContextInput = {
  objectNameSingular: string;
  recordId: string;
  anansiId: string | null;
  taskBodyMarkdown?: string | null;
  title: string;
};

const isAnansiApprovalTask = (markdown: string | null | undefined): boolean => {
  if (!markdown) {
    return false;
  }

  const markers = markdown.match(ANANSI_APPROVAL_MARKER);
  return (
    markers?.length === 1 &&
    markdown.trimEnd().split('\n').at(-1) === markers[0]
  );
};

const isSupportedCustomObjectName = (
  objectNameSingular: string,
): objectNameSingular is SupportedCustomObjectName =>
  Object.hasOwn(CUSTOM_CONTEXT_TYPES, objectNameSingular);

export const resolveAnansiAgentContext = ({
  objectNameSingular,
  recordId,
  anansiId,
  taskBodyMarkdown,
  title,
}: ResolveAnansiAgentContextInput): AnansiAgentContext | null => {
  if (!isValidUuid(recordId)) {
    return null;
  }

  if (objectNameSingular === 'task' && isAnansiApprovalTask(taskBodyMarkdown)) {
    return {
      key: `approval:${recordId}`,
      contextType: 'approval',
      contextId: recordId,
      objectNameSingular,
      recordId,
      title,
    };
  }

  if (!isSupportedCustomObjectName(objectNameSingular) || !anansiId) {
    return null;
  }

  if (!isValidUuid(anansiId)) {
    return null;
  }

  const contextType = CUSTOM_CONTEXT_TYPES[objectNameSingular];

  return {
    key: `${contextType}:${anansiId}`,
    contextType,
    contextId: anansiId,
    objectNameSingular,
    recordId,
    title,
  };
};
