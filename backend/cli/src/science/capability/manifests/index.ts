import { bioNemoManifests } from "./bionemo"
import { catalogManifests } from "./catalog"
import { coreManifests } from "./core"

export const capabilityManifests = { ...coreManifests, ...bioNemoManifests, ...catalogManifests } as const
