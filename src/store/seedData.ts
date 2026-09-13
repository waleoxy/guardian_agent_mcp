import { HouseholdMember, ExpectedVisitor, Policy } from "../types/domain";

export const seedMembers: HouseholdMember[] = [
  {
    id: "m-john",
    name: "John",
    role: "owner",
    routine: "Usually away 8AM-6PM on weekdays",
    vulnerable: false,
    status: "away",
  },
  {
    id: "m-mary",
    name: "Mary",
    role: "parent",
    routine: "Usually home; morning activity expected by 9AM",
    vulnerable: true,
    status: "home",
    lastSeenAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: "m-james",
    name: "James",
    role: "child",
    routine: "School 8AM-3PM on weekdays",
    vulnerable: false,
    status: "away",
  },
];

export const seedVisitors: ExpectedVisitor[] = [
  {
    id: "v-cleaner",
    label: "Cleaner",
    dayOfWeek: 1,
    timeWindowStart: "10:00",
    timeWindowEnd: "11:00",
  },
  {
    id: "v-caregiver",
    label: "Caregiver",
    dayOfWeek: 3,
    timeWindowStart: "14:00",
    timeWindowEnd: "15:00",
  },
];

export const seedPolicies: Policy[] = [
  {
    id: "p-notify-unknown-visitor",
    description: "If someone arrives while the owner is away, tell them.",
    appliesTo: { eventType: "person_detected", location: "front_door" },
    tier: "inform",
  },
  {
    id: "p-wellness-check",
    description: "If Mom doesn't answer after two attempts, notify the owner.",
    appliesTo: { eventType: "no_response" },
    tier: "ask",
  },
  {
    id: "p-never-auto-unlock",
    description: "Never unlock the door automatically.",
    appliesTo: { eventType: "person_detected" },
    tier: "ask",
    notes:
      "Hard constraint: unlocking always requires explicit user confirmation regardless of confidence.",
  },
  {
    id: "p-quiet-hours",
    description: "Don't wake the owner unless something is urgent.",
    appliesTo: {},
    tier: "ask",
  },
];
