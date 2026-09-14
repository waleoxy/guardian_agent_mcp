/**
 * Simulated Ring device definitions.
 *
 * Each device maps to a physical location in the Guardian household and
 * declares which event types it can fire. These match the event vocabulary
 * Guardian's decision engine already understands (see src/types/domain.ts
 * and src/decisionEngine.ts).
 *
 * In a real Ring integration, this list would come from Ring's API:
 *   const devices = await ring.getCameras()
 * Here we define them statically so the simulator works with zero
 * Ring credentials and zero network dependency.
 */

export interface RingDevice {
  id: string;
  label: string;       // human-readable name shown in the simulator menu
  location: string;    // Guardian location vocabulary (front_door, back_door, etc.)
  eventTypes: string[]; // event types this device can fire
}

export const RING_DEVICES: RingDevice[] = [
  {
    id: "ring-front-door",
    label: "Front Door Camera",
    location: "front_door",
    eventTypes: ["person_detected", "motion", "doorbell", "package_detected"],
  },
  {
    id: "ring-back-door",
    label: "Back Door Camera",
    location: "back_door",
    eventTypes: ["person_detected", "motion", "door_activity"],
  },
  {
    id: "ring-driveway",
    label: "Driveway Camera",
    location: "driveway",
    eventTypes: ["vehicle_detected", "person_detected", "motion"],
  },
  {
    id: "ring-garage",
    label: "Garage Camera",
    location: "garage",
    eventTypes: ["window_activity", "motion", "door_activity"],
  },
  {
    id: "ring-back-yard",
    label: "Back Yard Camera",
    location: "back_yard",
    eventTypes: ["motion", "person_detected"],
  },
];
