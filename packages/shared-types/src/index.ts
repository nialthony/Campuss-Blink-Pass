export type EventStatus = "draft" | "published" | "ended";

export interface EventEntity {
  id: string;
  name: string;
  description: string;
  startAt: string;
  endAt: string;
  checkInSecret: string;
  ticketPriceLamports: number;
  poapCollection: string | null;
  status: EventStatus;
}

export interface CreateEventInput {
  id?: string;
  name: string;
  description: string;
  startAt: string;
  endAt: string;
  checkInSecret: string;
  ticketPriceLamports: number;
  poapCollection: string | null;
  status: EventStatus;
}

export type UpdateEventInput = Partial<Omit<CreateEventInput, "id">>;

export interface EventStats {
  eventId: string;
  registrations: number;
  checkins: number;
  claims: number;
  checkinRate: number;
  claimRate: number;
}

export interface EventParticipantRow {
  wallet: string;
  registeredAt: string | null;
  checkedInAt: string | null;
  claimedAt: string | null;
}

export interface ActionRecord {
  at: string;
  txRef: string | null;
}

export interface ClaimRecord extends ActionRecord {
  mintAddress: string | null;
}

export type VerificationStage = "not-registered" | "registered" | "checked-in" | "claimed";

export interface WalletVerification {
  eventId: string;
  wallet: string;
  status: VerificationStage;
  registered: ActionRecord | null;
  checkedIn: ActionRecord | null;
  claimed: ClaimRecord | null;
}

export type TxVerificationStage = "register" | "check-in" | "claim";

export interface TxVerification {
  txRef: string;
  eventId: string;
  wallet: string;
  stage: TxVerificationStage;
  occurredAt: string;
  mintAddress: string | null;
}

export type ParticipantStageFilter = "all" | "registered" | "checked-in" | "claimed";

export interface ParticipantsQuery {
  stage: ParticipantStageFilter;
  search: string | null;
  limit: number;
  offset: number;
}

export interface ParticipantsPage {
  rows: EventParticipantRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface OrganizerOverview {
  eventsTotal: number;
  eventsByStatus: {
    draft: number;
    published: number;
    ended: number;
  };
  registrationsTotal: number;
  checkinsTotal: number;
  claimsTotal: number;
  overallCheckinRate: number;
  overallClaimRate: number;
}

export interface TimeseriesQuery {
  from: string;
  to: string;
}

export interface EventTimeseriesPoint {
  date: string;
  registrations: number;
  checkins: number;
  claims: number;
}

export interface RetentionQuery {
  from: string;
  to: string;
}

export interface RetentionCohortPoint {
  cohortDate: string;
  cohortSize: number;
  retainedD7: number;
  retentionRateD7: number;
}

export interface ActionPostBody {
  account: string;
  secret?: string;
}
