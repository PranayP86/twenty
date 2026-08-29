import { resolveAnansiAgentContext } from '@/anansi-agent/utils/resolveAnansiAgentContext';

const RECORD_ID = '11111111-1111-4111-8111-111111111111';
const ANANSI_ID = '22222222-2222-4222-8222-222222222222';

describe('resolveAnansiAgentContext', () => {
  it('maps only a marked Anansi approval Task through its Twenty record id', () => {
    expect(
      resolveAnansiAgentContext({
        objectNameSingular: 'task',
        recordId: RECORD_ID,
        anansiId: null,
        taskBodyMarkdown:
          'Approve by setting this task to Done.\n\n<!-- anansi-approval:Abc123 -->',
        title: 'Review recruiter reply',
      }),
    ).toEqual({
      key: `approval:${RECORD_ID}`,
      contextType: 'approval',
      contextId: RECORD_ID,
      objectNameSingular: 'task',
      recordId: RECORD_ID,
      title: 'Review recruiter reply',
    });
  });

  it('fails closed for an ordinary Task without the exact Anansi marker', () => {
    expect(
      resolveAnansiAgentContext({
        objectNameSingular: 'task',
        recordId: RECORD_ID,
        anansiId: null,
        taskBodyMarkdown: 'Call the recruiter tomorrow.',
        title: 'Call recruiter',
      }),
    ).toBeNull();
    expect(
      resolveAnansiAgentContext({
        objectNameSingular: 'task',
        recordId: RECORD_ID,
        anansiId: null,
        taskBodyMarkdown:
          '<!-- anansi-approval:Abc123 -->\nUntrusted text after marker',
        title: 'Forged approval',
      }),
    ).toBeNull();
  });

  it.each([
    ['engagement', 'engagement'],
    ['jobPosting', 'job'],
    ['touchpoint', 'touchpoint'],
    ['resume', 'resume'],
    ['interview', 'calendar_event'],
  ])(
    'maps %s through its exact anansiId',
    (objectNameSingular, contextType) => {
      expect(
        resolveAnansiAgentContext({
          objectNameSingular,
          recordId: RECORD_ID,
          anansiId: ANANSI_ID,
          title: 'Acme SRE',
        }),
      ).toEqual({
        key: `${contextType}:${ANANSI_ID}`,
        contextType,
        contextId: ANANSI_ID,
        objectNameSingular,
        recordId: RECORD_ID,
        title: 'Acme SRE',
      });
    },
  );

  it('fails closed for unsupported objects and invalid identity', () => {
    expect(
      resolveAnansiAgentContext({
        objectNameSingular: 'usage',
        recordId: RECORD_ID,
        anansiId: ANANSI_ID,
        title: 'Usage',
      }),
    ).toBeNull();
    expect(
      resolveAnansiAgentContext({
        objectNameSingular: 'applicationAttempt',
        recordId: RECORD_ID,
        anansiId: ANANSI_ID,
        title: 'Application attempt',
      }),
    ).toBeNull();
    expect(
      resolveAnansiAgentContext({
        objectNameSingular: 'anansiStatus',
        recordId: RECORD_ID,
        anansiId: ANANSI_ID,
        title: 'Automation status',
      }),
    ).toBeNull();
    expect(
      resolveAnansiAgentContext({
        objectNameSingular: 'constructor',
        recordId: RECORD_ID,
        anansiId: ANANSI_ID,
        title: 'Inherited object key',
      }),
    ).toBeNull();
    expect(
      resolveAnansiAgentContext({
        objectNameSingular: 'toString',
        recordId: RECORD_ID,
        anansiId: ANANSI_ID,
        title: 'Inherited method key',
      }),
    ).toBeNull();
    expect(
      resolveAnansiAgentContext({
        objectNameSingular: 'engagement',
        recordId: RECORD_ID,
        anansiId: 'not-a-uuid',
        title: 'Acme SRE',
      }),
    ).toBeNull();
  });
});
