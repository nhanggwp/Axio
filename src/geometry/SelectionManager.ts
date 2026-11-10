import { geometryNames } from "../../shared/geometryNames";
import type { GeometryObject } from "../../shared/actions";
export function affectedByDeletion(objects: GeometryObject[], names: string[]) {
  const affected = new Set(names);
  let changed = true;
  while (changed) {
    changed = false;
    for (const o of objects) {
      if (affected.has(o.name)) continue;
      const refs = geometryNames(o.definition);
      if (refs.some((r) => r !== o.name && affected.has(r))) {
        affected.add(o.name);
        changed = true;
      }
    }
  }
  return [...affected];
}
export class SelectionManager {
  names: string[] = [];
  set(names: string[], valid: (name: string) => boolean) {
    this.names = [...new Set(names)].filter(valid);
  }
  toggle(name: string) {
    this.names = this.names.includes(name)
      ? this.names.filter((n) => n !== name)
      : [...this.names, name];
  }
}
