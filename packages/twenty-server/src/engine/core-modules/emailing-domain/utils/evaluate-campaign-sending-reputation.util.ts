import {
  CAMPAIGN_MAX_BOUNCE_RATE,
  CAMPAIGN_MAX_COMPLAINT_RATE,
  CAMPAIGN_SENDING_REPUTATION_MINIMUM_ATTEMPTED_COUNT,
} from 'src/engine/core-modules/emailing-domain/constants/campaign-sending-reputation.constant';
import { type CampaignSendingReputation } from 'src/engine/core-modules/emailing-domain/types/campaign-sending-reputation.type';

export const evaluateCampaignSendingReputation = ({
  attemptedCount,
  bouncedCount,
  complainedCount,
}: {
  attemptedCount: number;
  bouncedCount: number;
  complainedCount: number;
}): CampaignSendingReputation => {
  if (attemptedCount < CAMPAIGN_SENDING_REPUTATION_MINIMUM_ATTEMPTED_COUNT) {
    return {
      attemptedCount,
      bouncedCount,
      complainedCount,
      bounceRate: null,
      complaintRate: null,
      isSendingBlocked: false,
    };
  }

  const bounceRate = bouncedCount / attemptedCount;
  const complaintRate = complainedCount / attemptedCount;

  return {
    attemptedCount,
    bouncedCount,
    complainedCount,
    bounceRate,
    complaintRate,
    isSendingBlocked:
      bounceRate >= CAMPAIGN_MAX_BOUNCE_RATE ||
      complaintRate >= CAMPAIGN_MAX_COMPLAINT_RATE,
  };
};
