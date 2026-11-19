import { SAMPLE_BUILDINGS } from '../src/engine/sampleDxf';
import { DEFAULT_CONVENTIONS, parseDxfString } from '../src/engine/dxfParser';
import type { BuildingProject } from '../src/types/plan';

export function loadSample(id: string): BuildingProject {
  const s = SAMPLE_BUILDINGS.find((b) => b.id === id)!;
  return {
    id: s.id,
    name: s.name,
    subtitle: s.subtitle,
    occupancyClass: s.occupancyClass,
    storyHeightM: s.storyHeightM,
    siteContext: { ...s.siteContext },
    floors: s.floors.map((fl) =>
      parseDxfString(fl.dxfContent, {
        id: `${s.id}-f${fl.floorIndex}`,
        name: s.name,
        subtitle: s.subtitle,
        fileName: fl.fileName,
        occupancyClass: s.occupancyClass,
        conventions: DEFAULT_CONVENTIONS,
        floorIndex: fl.floorIndex,
        floorLabel: fl.floorLabel,
        floorName: fl.floorName,
      })
    ),
  };
}
