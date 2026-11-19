// Metro uses these exports in formal bundles to exclude demo fixtures and images.
export const demoUser = undefined;
export const demoPeople = [];
export const demoRelationships = [];
export const demoMessages = {};
export const demoUnread = {};
export const demoPosts = [];
export const samplePlaces = [];

export function demoPortrait() { return undefined; }
export function demoMomentPhoto() { return undefined; }

export function demoRelationship(): never {
  throw new Error('Demo fixtures are disabled');
}

export function spaceSamples() { return undefined; }
export function spaceSamplePhoto() { return undefined; }
export function initialDemoPets() { return {}; }

export function PhonePreview() { return null; }

export function DemoCall() { return null; }
