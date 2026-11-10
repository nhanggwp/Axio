/** Read object names from native definitions, preserving prime labels such as A'. */
export function geometryNames(definition: string): string[] {
  return definition.match(/[\p{L}][\p{L}\p{N}_]*'*/gu) ?? [];
}
